/**
 * src/app/api/transcript/route.ts
 *
 * GET /api/transcript?q=<query>&maxVideos=15
 *
 * The core engine of the app:
 *   1. Detect input language (Romaji vs Japanese)
 *   2. Build all search variants (romaji + hiragana + katakana)
 *   3. Search YouTube for anime-only candidate videos
 *   4. Fetch transcripts in parallel (with per-video timeout)
 *   5. Search each transcript with all variants via sliding window
 *   6. Return matched videos sorted by match quality, with deep-links
 */

import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";
import { buildSearchVariants, findVariantMatch, normalizeForMatch } from "@/lib/romaji";
import { searchAnimeVideos, type YouTubeVideoMeta } from "@/lib/youtube";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptMatch {
  /** The raw transcript line(s) containing the match */
  text: string;
  /** Surrounding context (prev + match + next line) */
  context: string;
  /** Which search variant matched (e.g. "ありがとう" when user typed "arigato") */
  matchedVariant: string;
  /** Start time in seconds */
  startSeconds: number;
  /** Display string "mm:ss" */
  timestamp: string;
  /** Direct YouTube link at this timestamp */
  deepLink: string;
}

export interface TranscriptResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  watchUrl: string;
  matches: TranscriptMatch[];
  matchCount: number;
  /** Best score = number of distinct variants matched */
  relevanceScore: number;
}

export interface TranscriptSearchResponse {
  query: string;
  /** The variants actually used for matching */
  searchVariants: string[];
  videosChecked: number;
  videosMatched: number;
  results: TranscriptResult[];
  error?: string;
}

// ─── Transcript segment type ──────────────────────────────────────────────────

interface Segment {
  text: string;
  offset: number;  // milliseconds
  duration: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(seconds: number): string {
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
 * Fetch transcript with automatic language fallback and a per-video timeout.
 * Prefers Japanese captions; falls back to any available language.
 */
async function fetchTranscriptSafe(
  videoId: string,
  timeoutMs = 6000
): Promise<Segment[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Try Japanese first
    const segments = await Promise.race([
      YoutubeTranscript.fetchTranscript(videoId, { lang: "ja" })
        .catch(() => YoutubeTranscript.fetchTranscript(videoId)), // any language
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      ),
    ]);
    return segments as Segment[];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search transcript segments for all provided query variants.
 * Uses a sliding window of up to 3 segments to catch phrases
 * that span subtitle line breaks.
 */
function searchSegments(
  segments: Segment[],
  variants: string[],
  videoId: string
): TranscriptMatch[] {
  const matches: TranscriptMatch[] = [];
  const seenTimestamps = new Set<number>(); // deduplicate near-identical timestamps

  for (let i = 0; i < segments.length; i++) {
    // Build sliding windows of 1, 2, 3 segments
    const windows = [
      decodeHTML(segments[i].text),
      i + 1 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text)
        : "",
      i + 2 < segments.length
        ? decodeHTML(segments[i].text) + " " + decodeHTML(segments[i + 1].text) + " " + decodeHTML(segments[i + 2].text)
        : "",
    ].filter(Boolean);

    // Check all windows against all variants
    let matched: string | null = null;
    for (const window of windows) {
      matched = findVariantMatch(window, variants);
      if (matched) break;
    }

    if (!matched) continue;

    const startSeconds = Math.floor((segments[i].offset ?? 0) / 1000);

    // Skip if we already have a match within 2 seconds (dedup overlapping windows)
    const isDupe = [...seenTimestamps].some((t) => Math.abs(t - startSeconds) < 2);
    if (isDupe) continue;
    seenTimestamps.add(startSeconds);

    const prev = i > 0 ? decodeHTML(segments[i - 1].text) : "";
    const curr = decodeHTML(segments[i].text);
    const next = i + 1 < segments.length ? decodeHTML(segments[i + 1].text) : "";

    matches.push({
      text:           curr,
      context:        [prev, curr, next].filter(Boolean).join(" … "),
      matchedVariant: matched,
      startSeconds,
      timestamp:      formatTimestamp(startSeconds),
      deepLink:       `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}`,
    });

    i += 1; // skip ahead to avoid overlapping window matches
  }

  return matches;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q         = (searchParams.get("q") ?? "").trim();
  const maxVideos = Math.min(parseInt(searchParams.get("maxVideos") ?? "15"), 20);

  if (!q) {
    return NextResponse.json({ error: "Query `q` is required." }, { status: 400 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not configured.", results: [], query: q, searchVariants: [], videosChecked: 0, videosMatched: 0 } satisfies TranscriptSearchResponse,
      { status: 503 }
    );
  }

  // Step 1: Build search variants (handles romaji → kana conversion)
  const variants = buildSearchVariants(q);

  try {
    // Step 2: Get anime-only candidate videos from YouTube
    const videos: YouTubeVideoMeta[] = await searchAnimeVideos(q, apiKey, maxVideos);

    // Step 3: Fetch + search transcripts in parallel
    const settled = await Promise.allSettled(
      videos.map(async (video): Promise<TranscriptResult | null> => {
        try {
          const segments = await fetchTranscriptSafe(video.videoId, 7000);
          const matches  = searchSegments(segments, variants, video.videoId);

          if (matches.length === 0) return null;

          // Relevance = distinct variants matched (higher = more relevant)
          const distinctVariants = new Set(matches.map((m) => normalizeForMatch(m.matchedVariant)));

          return {
            ...video,
            matches,
            matchCount:     matches.length,
            relevanceScore: distinctVariants.size * 10 + matches.length,
          };
        } catch {
          return null; // transcript unavailable or timeout — skip silently
        }
      })
    );

    const results: TranscriptResult[] = settled
      .filter((r): r is PromiseFulfilledResult<TranscriptResult> =>
        r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    const response: TranscriptSearchResponse = {
      query: q,
      searchVariants:  variants,
      videosChecked:   videos.length,
      videosMatched:   results.length,
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
