/**
 * src/app/api/transcript/route.ts
 *
 * GET /api/transcript?q=<query>
 *
 * Pipeline:
 *   1. Build search variants (romaji → kana, long vowel variants, etc.)
 *   2. Build 3 YouTube query strings from the input
 *   3. Run 3 YouTube searches in parallel → deduplicate → up to ~35 videos
 *   4. Fetch all transcripts in parallel with concurrency cap + per-video timeout
 *   5. For each segment window: run 3-level matching (exact → prefix → fuzzy)
 *   6. Return results sorted by relevance score
 */

import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import {
  buildSearchVariants,
  buildYouTubeQueries,
  matchText,
  norm,
  type MatchResult,
} from "@/lib/romaji";
import { searchAnimeVideosMulti, type YouTubeVideoMeta } from "@/lib/youtube";

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
      return []; // no transcript available
    }
  }
}

/**
 * Run a Promise-pool: execute `tasks` with at most `concurrency` running at once.
 * This prevents hammering the transcript API with 35 simultaneous requests.
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
 * Scan all segments of a transcript for matches.
 *
 * Uses a sliding window of 1, 2, or 3 consecutive segments so that
 * phrases broken across subtitle lines are still found.
 *
 * Deduplication: a new match must start > 2 seconds after the last one.
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

    // Skip if too close to the last match (dedup)
    if (startSeconds - lastMatchSeconds < 2) continue;

    // Build windows of increasing size
    const texts = [
      decodeHTML(segments[i].text),
      i + 1 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text)
        : "",
      i + 2 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text) + " " + decodeHTML(segments[i + 2].text)
        : "",
    ].filter(Boolean);

    // Try each window, stop at first (best) match
    let bestMatch: MatchResult | null = null;
    for (const windowText of texts) {
      const result = matchText(windowText, variants);
      if (result && (!bestMatch || result.score > bestMatch.score)) {
        bestMatch = result;
        if (bestMatch.score === 100) break; // exact — no need to try larger windows
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

    i += 1; // skip ahead to avoid overlapping windows triggering again
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

  // Step 1: Build all search variants for matching
  const variants = buildSearchVariants(q);

  // Step 2: Build 3 YouTube query strings
  const ytQueries = buildYouTubeQueries(q);

  try {
    // Step 3: Parallel YouTube searches → deduplicated video pool
    const videos = await searchAnimeVideosMulti(ytQueries, apiKey, 15);

    // Step 4: Fetch + scan transcripts with concurrency cap of 12
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
      // Sort: best score first, then most matches
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
