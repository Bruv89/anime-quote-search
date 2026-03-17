/**
 * src/app/api/search/route.ts
 *
 * GET /api/search?q=<query>&limit=20&offset=0
 *
 * Romaji handling strategy (dual-column FTS):
 *   - If the input looks like Romaji (all ASCII), we search BOTH
 *     body_romaji (direct match) AND body_ja (by converting romaji→kana
 *     first via wanakana, covering cases where kana is stored verbatim).
 *   - If the input already contains Japanese characters, we search body_ja.
 *   - In all cases we build a single FTS5 OR query so one round-trip suffices.
 */

import { NextRequest, NextResponse } from "next/server";
import * as wanakana from "wanakana";
import { sqlite } from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchResultItem {
  quoteId: number;
  bodyJa: string;
  bodyRomaji: string;
  startTimestamp: string;
  startTime: number;
  endTime: number;
  episodeId: number;
  episodeNumber: number;
  episodeTitle: string | null;
  animeId: number;
  animeTitle: string;
  animeSlug: string;
}

export interface SearchResponse {
  query: string;
  normalizedQuery: string;
  total: number;
  results: SearchResultItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the string contains at least one CJK / kana character. */
function containsJapanese(text: string): boolean {
  return /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(text);
}

/**
 * Escape special FTS5 characters in a user query so it's safe to embed in
 * a MATCH expression.  We keep the query simple (phrase matching) for MVP.
 */
function escapeFts(q: string): string {
  // Remove FTS5 special operators: " * ^ ( )
  return q.replace(/["*^()]/g, " ").trim();
}

/**
 * Build the FTS5 MATCH expression and the value to bind.
 *
 * Strategy:
 *   - Romaji input  → search `body_romaji` column with the raw input
 *                     AND search `body_ja` with a kana transliteration.
 *   - Japanese input → search `body_ja` column directly.
 *
 * FTS5 column filters: `{col}: token`
 */
function buildFtsQuery(raw: string): { ftsQuery: string; normalized: string } {
  const cleaned = escapeFts(raw);

  if (!containsJapanese(cleaned)) {
    // Romaji path
    const kana = wanakana.toHiragana(cleaned);          // arigato → ありがと
    const kanaClean = escapeFts(kana);

    // Use FTS5 column filter syntax: body_romaji:term OR body_ja:kanaterm
    const ftsQuery = `body_romaji: "${cleaned}" OR body_ja: "${kanaClean}"`;
    return { ftsQuery, normalized: cleaned };
  } else {
    // Japanese path
    const ftsQuery = `body_ja: "${cleaned}"`;
    return { ftsQuery, normalized: cleaned };
  }
}

// ─── Row type from raw SQL ────────────────────────────────────────────────────

interface RawRow {
  quote_id: number;
  body_ja: string;
  body_romaji: string;
  start_timestamp: string;
  start_time: number;
  end_time: number;
  episode_id: number;
  episode_number: number;
  episode_title: string | null;
  anime_id: number;
  anime_title: string;
  anime_slug: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  if (!q || q.length < 1) {
    return NextResponse.json(
      { error: "Query parameter `q` is required and must not be empty." },
      { status: 400 }
    );
  }

  const { ftsQuery, normalized } = buildFtsQuery(q);

  try {
    const rows = sqlite
      .prepare(
        /* sql */ `
        SELECT
          q.id              AS quote_id,
          q.body_ja,
          q.body_romaji,
          q.start_timestamp,
          q.start_time,
          q.end_time,
          e.id              AS episode_id,
          e.episode_number,
          e.title           AS episode_title,
          a.id              AS anime_id,
          a.title           AS anime_title,
          a.slug            AS anime_slug,
          -- FTS5 rank for relevance sorting (lower = more relevant)
          rank
        FROM quotes_fts f
        JOIN quotes   q ON q.id     = f.rowid
        JOIN episodes e ON e.id     = q.episode_id
        JOIN animes   a ON a.id     = e.anime_id
        WHERE quotes_fts MATCH ?
        ORDER BY rank
        LIMIT  ?
        OFFSET ?
      `
      )
      .all(ftsQuery, limit, offset) as (RawRow & { rank: number })[];

    // Count total matches (without LIMIT) for pagination metadata
    const countRow = sqlite
      .prepare(
        /* sql */ `
        SELECT COUNT(*) AS n
        FROM quotes_fts
        WHERE quotes_fts MATCH ?
      `
      )
      .get(ftsQuery) as { n: number };

    const results: SearchResultItem[] = rows.map((r) => ({
      quoteId: r.quote_id,
      bodyJa: r.body_ja,
      bodyRomaji: r.body_romaji,
      startTimestamp: r.start_timestamp,
      startTime: r.start_time,
      endTime: r.end_time,
      episodeId: r.episode_id,
      episodeNumber: r.episode_number,
      episodeTitle: r.episode_title,
      animeId: r.anime_id,
      animeTitle: r.anime_title,
      animeSlug: r.anime_slug,
    }));

    const response: SearchResponse = {
      query: q,
      normalizedQuery: normalized,
      total: countRow.n,
      results,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    console.error("[/api/search] FTS error:", err);

    // FTS5 syntax errors surface as SQLite exceptions; give the user a hint
    const message =
      err instanceof Error ? err.message : "Internal search error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
