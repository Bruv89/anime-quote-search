/**
 * src/app/api/transcript/route.ts
 *
 * GET /api/transcript?q=<query>
 *
 * Pipeline:
 *   1. Build search variants (romaji → kana, long vowel variants, etc.)
 *   2. Build 3 YouTube query strings from the input
 *   3. Run 3 YouTube searches in parallel → deduplicate → up to ~35 videos
 *   4. Warm up kuromoji tokenizer while YouTube searches run
 *   5. Fetch all transcripts in parallel with concurrency cap + per-video timeout
 *   6. For each segment window: run matching against BOTH raw text AND hiragana
 *      reading (from kuromoji), so kanji like "食い倒れ" match romaji "kuidaore"
 *   7. Return results sorted by relevance score
 */

import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import {
  buildSearchVariants,
  buildYouTubeQueries,
  matchText,
  type MatchResult,
} from "@/lib/romaji";
import { searchAnimeVideosMulti, type YouTubeVideoMeta } from "@/lib/youtube";
import { toHiraganaReadingSync, warmupTokenizer, getTokenizer } from "@/lib/kanji";
import * as wanakana from "wanakana";

// Warm up kuromoji at module load time so it's ready before first request
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

// ─── Segment type ─────────────────────────────────────────────────────────────

interface Segment {
  text: string;
  offset: number;   // milliseconds
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

/**
 * Enrich a text string with its hiragana reading so kanji-based transcripts
 * can be matched by romaji or kana queries.
 *
 * Strategy:
 *   1. Try kuromoji sync (fast, works after warmup)
 *   2. Fallback: use wanakana.toRomaji on kana portions, pass kanji through
 *
 * Returns an array of text representations to try matching against.
 */
function getTextRepresentations(raw: string): string[] {
  const reps = new Set<string>();
  reps.add(raw); // always try original

  // Try kuromoji reading (kanji → hiragana via morphological analysis)
  const reading = toHiraganaReadingSync(raw);
  if (reading && reading !== raw) {
    reps.add(reading);
    // Also add romaji version of the reading
    const romajiReading = wanakana.toRomaji(reading, { convertLongVowelMark: true });
    if (romajiReading !== reading) reps.add(romajiReading);
  }

  // Always add a romaji representation of the kana portions
  const partialRomaji = wanakana.toRomaji(raw, { convertLongVowelMark: true });
  if (partialRomaji !== raw) reps.add(partialRomaji);

  return Array.from(reps);
}

/**
 * Fetch transcript with language fallback + hard timeout.
 * Order: Japanese → any available language.
 */
async function fetchTranscript(videoId: string, timeoutMs = 7000): Promise<Segment[]> {
  const race = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);

  try {
    return await race(YoutubeTranscript.fetchTranscript(videoId, { lang: "ja" })) as Segment[];
  } catch {
    try {
      return await race(YoutubeTranscript.fetchTranscript(videoId)) as Segment[];
    } catch {
      return [];
    }
  }
}

/**
 * Promise-pool: run tasks with at most `concurrency` active at once.
 */
async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  const queue = [...tasks];

  async function worker() {
    while (queue.length) {
      const task = queue.shift()!;
      results.push(await task());
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

// ─── Transcript scanning ──────────────────────────────────────────────────────

/**
 * Scan transcript segments for matches.
 *
 * For each sliding window (1–3 segments), tries matching against:
 *   - The raw transcript text (catches Japanese text matching Japanese query)
 *   - The hiragana reading (via kuromoji — catches "食い倒れ" matching "kuidaore")
 *   - The partial romaji form (via wanakana)
 *
 * This triple-representation approach is what allows romaji queries to find
 * kanji-heavy transcripts without any preprocessing step.
 */
function scanTranscript(
  segments: Segment[],
  variants: string[],
  videoId: string
): TranscriptMatch[] {
  const matches: TranscriptMatch[] = [];
  let lastMatchSeconds = -999;

  for (let i = 0; i < segments.length; i++) {
    const startSeconds = Math.floor((segments[i].offset ?? 0) / 1000);

    if (startSeconds - lastMatchSeconds < 2) continue; // dedup

    // Build raw text windows (1, 2, 3 segments)
    const rawWindows = [
      decodeHTML(segments[i].text),
      i + 1 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text)
        : "",
      i + 2 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text) + " " + decodeHTML(segments[i + 2].text)
        : "",
    ].filter(Boolean);

    // For each window, expand to multiple representations (raw + hiragana + romaji)
    const allTextsToTry: string[] = [];
    for (const w of rawWindows) {
      allTextsToTry.push(...getTextRepresentations(w));
    }

    // Try all representations against all variants
    let bestMatch: MatchResult | null = null;
    for (const text of allTextsToTry) {
      const result = matchText(text, variants);
      if (result && (!bestMatch || result.score > bestMatch.score)) {
        bestMatch = result;
        if (bestMatch.score === 100) break; // can't do better
      }
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

  if (!q) {
    return NextResponse.json({ error: "Query `q` is required." }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "YOUTUBE_API_KEY not configured.",
        results: [], query: q, searchVariants: [],
        videosChecked: 0, videosMatched: 0,
      } satisfies TranscriptSearchResponse,
      { status: 503 }
    );
  }

  const variants  = buildSearchVariants(q);
  const ytQueries = buildYouTubeQueries(q);

  try {
    // Run YouTube searches AND kuromoji init in parallel —
    // both are awaited before scanning starts, so toHiraganaReadingSync
    // is guaranteed to have the tokenizer ready.
    const [videos] = await Promise.all([
      searchAnimeVideosMulti(ytQueries, apiKey, 15),
      getTokenizer().catch(() => null), // don't fail if kuromoji errors
    ]);

    const tasks = videos.map((video) => async (): Promise<TranscriptResult | null> => {
      const segments = await fetchTranscript(video.videoId, 7000);
      if (segments.length === 0) return null;

      const matches = scanTranscript(segments, variants, video.videoId);
      if (matches.length === 0) return null;

      const bestScore = Math.max(...matches.map((m) => m.matchScore));
      return { ...video, matches, matchCount: matches.length, bestScore };
    });

    const raw = await pool(tasks, 12);

    const results: TranscriptResult[] = raw
      .filter((r): r is TranscriptResult => r !== null)
      .sort((a, b) => b.bestScore - a.bestScore || b.matchCount - a.matchCount);

    const response: TranscriptSearchResponse = {
      query: q,
      searchVariants: variants,
      videosChecked:  videos.length,
      videosMatched:  results.length,
      results,
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=60" },
    });
  } catch (err) {
    console.error("[/api/transcript]", err);
    return NextResponse.json(
      {
        error:          err instanceof Error ? err.message : "Internal error",
        results:        [],
        query:          q,
        searchVariants: variants,
        videosChecked:  0,
        videosMatched:  0,
      } satisfies TranscriptSearchResponse,
      { status: 500 }
    );
  }
}