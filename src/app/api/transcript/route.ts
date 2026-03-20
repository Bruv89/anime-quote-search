/**
 * src/app/api/transcript/route.ts
 *
 * GET /api/transcript?q=<query>
 *
 * Key fix for romaji → kanji matching:
 *   Before scanning, ALL segment texts are batch-converted to hiragana
 *   using kuromoji. This is awaited fully, so "食い倒れ" → "くいだおれ"
 *   is ready before any matching runs.
 *
 *   Then for "kuidaore":
 *     variant "くいだおれ" vs segment reading "くいだおれ" → MATCH ✓
 */

import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import * as wanakana from "wanakana";
import {
  buildSearchVariants,
  buildYouTubeQueries,
  matchText,
  type MatchResult,
} from "@/lib/romaji";
import { searchAnimeVideosMulti, type YouTubeVideoMeta } from "@/lib/youtube";
import { batchToHiragana, warmupTokenizer } from "@/lib/kanji";

warmupTokenizer();

// ─── Response types ───────────────────────────────────────────────────────────

export interface TranscriptMatch {
  text: string;
  context: string;
  matchedVariant: string;
  matchType: "exact" | "prefix" | "fuzzy";
  matchScore: number;
  startSeconds: number;
  timestamp: string;
  deepLink: string;
}

export interface TranscriptResult extends YouTubeVideoMeta {
  matches: TranscriptMatch[];
  matchCount: number;
  bestScore: number;
}

export interface TranscriptSearchResponse {
  query: string;
  searchVariants: string[];
  videosChecked: number;
  videosMatched: number;
  results: TranscriptResult[];
  error?: string;
}

interface Segment {
  text: string;
  offset: number;
  duration: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function decodeHTML(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\n/g, " ").trim();
}

async function fetchTranscript(videoId: string, timeoutMs = 7000): Promise<Segment[]> {
  const withTimeout = <T>(p: Promise<T>) =>
    Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("timeout")), timeoutMs))]);
  try {
    return await withTimeout(YoutubeTranscript.fetchTranscript(videoId, { lang: "ja" })) as Segment[];
  } catch {
    try {
      return await withTimeout(YoutubeTranscript.fetchTranscript(videoId)) as Segment[];
    } catch {
      return [];
    }
  }
}

async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];
  async function worker() {
    while (queue.length) results.push(await queue.shift()!());
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ─── Core scanning ────────────────────────────────────────────────────────────

/**
 * For a given raw text, build ALL representations to try matching against:
 *   1. raw text itself
 *   2. hiragana reading (from pre-computed kuromoji map)
 *   3. romaji of the hiragana reading (wanakana)
 *   4. partial romaji (wanakana on kana portions — handles mixed kana/kanji)
 */
function getRepresentations(
  raw: string,
  hiraganaMap: Map<string, string>
): string[] {
  const reps = new Set<string>();
  reps.add(raw);

  // Hiragana reading from kuromoji (handles kanji like 食い倒れ → くいだおれ)
  const reading = hiraganaMap.get(raw);
  if (reading && reading !== raw) {
    reps.add(reading);
    // Romaji of the full reading
    const romajiOfReading = wanakana.toRomaji(reading, { convertLongVowelMark: true });
    if (romajiOfReading !== reading) reps.add(romajiOfReading);

    // Also without long vowel: おう → ou → o
    const simplified = romajiOfReading
      .replace(/ou/gi, "o")
      .replace(/uu/gi, "u")
      .replace(/oo/gi, "o");
    if (simplified !== romajiOfReading) reps.add(simplified);
  }

  // Partial romaji via wanakana (works on kana, passes kanji through)
  const partialRomaji = wanakana.toRomaji(raw, { convertLongVowelMark: true });
  if (partialRomaji !== raw) reps.add(partialRomaji);

  return Array.from(reps);
}

/**
 * Scan transcript segments for matches.
 *
 * @param hiraganaMap  Pre-computed kanji→hiragana readings for all segment texts
 */
function scanTranscript(
  segments: Segment[],
  variants: string[],
  videoId: string,
  hiraganaMap: Map<string, string>
): TranscriptMatch[] {
  const matches: TranscriptMatch[] = [];
  let lastMatchSeconds = -999;

  for (let i = 0; i < segments.length; i++) {
    const startSeconds = Math.floor((segments[i].offset ?? 0) / 1000);
    if (startSeconds - lastMatchSeconds < 2) continue;

    // Build windows of 1, 2, 3 segments
    const rawWindows = [
      decodeHTML(segments[i].text),
      i + 1 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text)
        : "",
      i + 2 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text) + " " + decodeHTML(segments[i + 2].text)
        : "",
    ].filter(Boolean);

    // For each window build all representations (raw + hiragana + romaji)
    let bestMatch: MatchResult | null = null;

    for (const raw of rawWindows) {
      const reps = getRepresentations(raw, hiraganaMap);
      for (const rep of reps) {
        const result = matchText(rep, variants);
        if (result && (!bestMatch || result.score > bestMatch.score)) {
          bestMatch = result;
        }
        if (bestMatch?.score === 100) break;
      }
      if (bestMatch?.score === 100) break;
    }

    if (!bestMatch) continue;

    lastMatchSeconds = startSeconds;

    const prev = i > 0 ? decodeHTML(segments[i - 1].text) : "";
    const curr = decodeHTML(segments[i].text);
    const next = i + 1 < segments.length ? decodeHTML(segments[i + 1].text) : "";

    matches.push({
      text:           curr,
      context:        [prev, curr, next].filter(Boolean).join(" … "),
      matchedVariant: bestMatch.matchedVariant,
      matchType:      bestMatch.type,
      matchScore:     bestMatch.score,
      startSeconds,
      timestamp:      fmt(startSeconds),
      deepLink:       `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}`,
    });

    i += 1;
  }

  return matches;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();

  if (!q) return NextResponse.json({ error: "Query `q` is required." }, { status: 400 });

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not configured.", results: [], query: q, searchVariants: [], videosChecked: 0, videosMatched: 0 } satisfies TranscriptSearchResponse,
      { status: 503 }
    );
  }

  const variants  = buildSearchVariants(q);
  const ytQueries = buildYouTubeQueries(q);

  try {
    // Phase 1: get videos
    const videos = await searchAnimeVideosMulti(ytQueries, apiKey, 15);

    // Phase 2: fetch all transcripts in parallel
    const transcriptResults = await pool(
      videos.map((video) => () => fetchTranscript(video.videoId, 7000).then((segs) => ({ video, segs }))),
      12
    );

    // Phase 3: collect ALL unique segment texts and batch-convert to hiragana
    // This is the critical step — we await kuromoji FULLY here before any matching
    const allTexts = transcriptResults.flatMap(({ segs }) =>
      segs.map((s) => decodeHTML(s.text))
    );
    const hiraganaMap = await batchToHiragana(allTexts);

    // Phase 4: scan each transcript using the pre-computed hiragana map
    const results: TranscriptResult[] = [];

    for (const { video, segs } of transcriptResults) {
      if (segs.length === 0) continue;
      const matches = scanTranscript(segs, variants, video.videoId, hiraganaMap);
      if (matches.length === 0) continue;
      const bestScore = Math.max(...matches.map((m) => m.matchScore));
      results.push({ ...video, matches, matchCount: matches.length, bestScore });
    }

    results.sort((a, b) => b.bestScore - a.bestScore || b.matchCount - a.matchCount);

    return NextResponse.json(
      {
        query: q,
        searchVariants: variants,
        videosChecked:  videos.length,
        videosMatched:  results.length,
        results,
      } satisfies TranscriptSearchResponse,
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" } }
    );
  } catch (err) {
    console.error("[/api/transcript]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error", results: [], query: q, searchVariants: variants, videosChecked: 0, videosMatched: 0 } satisfies TranscriptSearchResponse,
      { status: 500 }
    );
  }
}
