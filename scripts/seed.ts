#!/usr/bin/env tsx
/**
 * scripts/seed.ts
 *
 * Ingestion pipeline:
 *   1. Walk ./data/subtitles/<AnimeFolder>/*.{srt,ass}
 *   2. Parse each subtitle file → raw lines (text + timestamps)
 *   3. Strip ASS/SSA formatting tags
 *   4. Transliterate Japanese text → Romaji via `wanakana`
 *   5. Upsert Anime → Episode → Quotes in SQLite
 *   6. FTS5 triggers auto-populate `quotes_fts`
 *
 * Run:  npm run seed
 */

import fs from "fs";
import path from "path";
import SRTParser from "srt-parser-2";
import * as wanakana from "wanakana";

// Bootstrap DB (creates tables + triggers if they don't exist)
import { db, sqlite } from "../src/lib/db";
import { animes, episodes, quotes } from "../db/schema";
import { eq, and } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubtitleLine {
  startSeconds: number;
  endSeconds: number;
  startTimestamp: string; // "mm:ss"
  text: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert "HH:MM:SS.cs" or "HH:MM:SS,ms" to seconds. */
function timeToSeconds(t: string): number {
  // Normalize separators: both "," and "." are used for sub-seconds
  const normalised = t.replace(",", ".");
  const parts = normalised.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(normalised);
}

/** Format seconds as "mm:ss" display string. */
function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Strip ASS/SSA override tags like {\i1}, {\b0}, {\c&H...}, {\pos(...)}, etc.
 * Also collapses soft line-breaks (\N, \n) and trims whitespace.
 */
function stripAssTags(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, "")   // remove { ... } override blocks
    .replace(/\\[Nn]/g, " ")      // soft line-breaks → space
    .replace(/\s+/g, " ")         // collapse whitespace
    .trim();
}

/** Convert Japanese kana/kanji to Romaji.  Falls back to the original text
 *  if it contains no Japanese characters (already romaji / numbers / etc.). */
function toRomaji(text: string): string {
  // wanakana.toRomaji handles kana but leaves kanji and latin unchanged.
  // For an MVP this is good enough — kanji stay as-is in the romaji column,
  // and queries typed as kana or romaji will still match.
  return wanakana.toRomaji(text, { convertLongVowelMark: true });
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseSrt(filePath: string): SubtitleLine[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const parser = new SRTParser();
  const items = parser.fromSrt(content);

  return items
    .map((item) => {
      const text = item.text
        .replace(/<[^>]+>/g, "") // strip HTML-style tags
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return null;

      const startSeconds = timeToSeconds(item.startTime);
      const endSeconds = timeToSeconds(item.endTime);

      return {
        startSeconds,
        endSeconds,
        startTimestamp: formatTimestamp(startSeconds),
        text,
      } satisfies SubtitleLine;
    })
    .filter((l): l is SubtitleLine => l !== null);
}

function parseAss(filePath: string): SubtitleLine[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines: SubtitleLine[] = [];

  for (const raw of content.split(/\r?\n/)) {
    if (!raw.startsWith("Dialogue:")) continue;

    // Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
    // We split on commas but the last field (Text) may contain commas itself.
    const parts = raw.slice("Dialogue:".length).split(",");
    if (parts.length < 10) continue;

    const start = parts[1].trim();   // "H:MM:SS.cs"
    const end = parts[2].trim();
    const text = stripAssTags(parts.slice(9).join(",").trim());

    if (!text) continue;

    const startSeconds = timeToSeconds(start);
    const endSeconds = timeToSeconds(end);

    lines.push({
      startSeconds,
      endSeconds,
      startTimestamp: formatTimestamp(startSeconds),
      text,
    });
  }

  return lines;
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

function folderToTitle(folder: string): string {
  return folder.replace(/_/g, " ");
}

function folderToSlug(folder: string): string {
  return folder.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** Extract episode number from filename.  "ep01.srt" → 1, "S01E03.ass" → 3 */
function fileToEpisodeNumber(filename: string): number {
  const match =
    filename.match(/[Ee][Pp]?(\d+)/) ?? filename.match(/[Ee](\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const subtitlesRoot = path.resolve("./data/subtitles");

  if (!fs.existsSync(subtitlesRoot)) {
    console.error(`❌  Directory not found: ${subtitlesRoot}`);
    process.exit(1);
  }

  const animeFolders = fs
    .readdirSync(subtitlesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (animeFolders.length === 0) {
    console.warn("⚠️  No anime folders found in ./data/subtitles");
    return;
  }

  console.log(`\n📂  Found ${animeFolders.length} anime folder(s)\n`);

  // Wrap everything in a single transaction for speed
  const runSeed = sqlite.transaction(() => {
    for (const folder of animeFolders) {
      const animeSlug = folderToSlug(folder);
      const animeTitle = folderToTitle(folder);

      // ── Upsert anime ──────────────────────────────────────────────────────
      const existingAnime = db
        .select()
        .from(animes)
        .where(eq(animes.slug, animeSlug))
        .get();

      let animeId: number;
      if (existingAnime) {
        animeId = existingAnime.id;
        console.log(`  ✅  Anime already exists: "${animeTitle}" (id=${animeId})`);
      } else {
        const inserted = db
          .insert(animes)
          .values({ slug: animeSlug, title: animeTitle })
          .returning({ id: animes.id })
          .get();
        animeId = inserted.id;
        console.log(`  ➕  Created anime: "${animeTitle}" (id=${animeId})`);
      }

      // ── Walk subtitle files ───────────────────────────────────────────────
      const folderPath = path.join(subtitlesRoot, folder);
      const subFiles = fs
        .readdirSync(folderPath)
        .filter((f) => /\.(srt|ass|ssa)$/i.test(f));

      for (const filename of subFiles) {
        const filePath = path.join(folderPath, filename);
        const episodeNumber = fileToEpisodeNumber(filename);

        // ── Upsert episode ────────────────────────────────────────────────
        const existingEp = db
          .select()
          .from(episodes)
          .where(
            and(
              eq(episodes.animeId, animeId),
              eq(episodes.episodeNumber, episodeNumber)
            )
          )
          .get();

        let episodeId: number;
        if (existingEp) {
          episodeId = existingEp.id;
          console.log(
            `     ⏭️   Episode ${episodeNumber} already seeded, skipping`
          );
          continue;
        } else {
          const inserted = db
            .insert(episodes)
            .values({ animeId, episodeNumber, sourceFile: filename })
            .returning({ id: episodes.id })
            .get();
          episodeId = inserted.id;
          console.log(
            `     📄  Parsing episode ${episodeNumber}: ${filename}`
          );
        }

        // ── Parse subtitles ───────────────────────────────────────────────
        const ext = path.extname(filename).toLowerCase();
        let lines: SubtitleLine[] = [];

        try {
          if (ext === ".srt") {
            lines = parseSrt(filePath);
          } else if (ext === ".ass" || ext === ".ssa") {
            lines = parseAss(filePath);
          }
        } catch (err) {
          console.error(`     ❌  Failed to parse ${filename}:`, err);
          continue;
        }

        console.log(`          └─ ${lines.length} subtitle lines extracted`);

        // ── Insert quotes ────────────────────────────────────────────────
        const quoteRows = lines.map((line) => ({
          episodeId,
          bodyJa: line.text,
          bodyRomaji: toRomaji(line.text),
          startTime: line.startSeconds,
          endTime: line.endSeconds,
          startTimestamp: line.startTimestamp,
        }));

        if (quoteRows.length > 0) {
          db.insert(quotes).values(quoteRows).run();
          console.log(`          └─ ✅  ${quoteRows.length} quotes inserted`);
        }
      }
    }
  });

  runSeed();

  // ── Verify FTS index ──────────────────────────────────────────────────────
  const ftsCount = sqlite
    .prepare("SELECT COUNT(*) as n FROM quotes_fts")
    .get() as { n: number };

  const totalQuotes = sqlite
    .prepare("SELECT COUNT(*) as n FROM quotes")
    .get() as { n: number };

  console.log(
    `\n✅  Seeding complete — ${totalQuotes.n} quotes in DB, ${ftsCount.n} in FTS index\n`
  );

  // Quick smoke test
  const testQuery = "ありがとう";
  const hits = sqlite
    .prepare(
      `SELECT q.id, q.body_ja, q.body_romaji
       FROM quotes_fts f
       JOIN quotes q ON q.id = f.rowid
       WHERE quotes_fts MATCH ?
       LIMIT 3`
    )
    .all(testQuery) as Array<{ id: number; body_ja: string; body_romaji: string }>;

  if (hits.length > 0) {
    console.log(`🔍  FTS smoke-test for "${testQuery}":`);
    hits.forEach((h) =>
      console.log(`   [${h.id}] ${h.body_ja}  |  ${h.body_romaji}`)
    );
  } else {
    console.log(`ℹ️  No FTS hits for "${testQuery}" (expected if no such text was seeded)`);
  }
}

main().catch((err) => {
  console.error("Fatal seed error:", err);
  process.exit(1);
});
