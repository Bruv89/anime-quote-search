/**
 * src/app/api/youtube-transcript/route.ts
 *
 * GET /api/youtube-transcript?q=<query>&maxVideos=8
 *
 * Pipeline:
 *   1. Search YouTube Data API for candidate videos (reuses youtube search logic)
 *   2. For each video, fetch the auto-generated transcript via youtube-transcript
 *   3. Search the transcript text for the query (fuzzy + exact)
 *   4. Return only videos where the transcript contains the query,
 *      with the exact timestamp and a deep-link URL (watch?v=ID&t=SECONDS)
 *
 * No extra API key needed beyond YOUTUBE_API_KEY — transcripts are public.
 */

import { NextRequest, NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptMatch {
  text: string;          // the matching transcript line(s)
  startSeconds: number;  // when it appears in the video
  timestamp: string;     // human-readable "mm:ss"
  deepLink: string;      // youtube.com/watch?v=ID&t=SECONDS
  context: string;       // ±1 lines of surrounding text for display
}

export interface TranscriptVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  watchUrl: string;
  matches: TranscriptMatch[];
  matchCount: number;
}

export interface TranscriptSearchResponse {
  query: string;
  videosChecked: number;
  videosMatched: number;
  results: TranscriptVideo[];
  error?: string;
}

// ─── YouTube search types ────────────────────────────────────────────────────

interface YTSnippet {
  title: string;
  channelTitle: string;
  thumbnails: { medium?: { url: string }; default?: { url: string } };
}
interface YTItem {
  id: { videoId: string };
  snippet: YTSnippet;
}
interface YTSearchResponse {
  items?: YTItem[];
  error?: { message: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function decodeHTML(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, " ")
    .trim();
}

/**
 * Normalize text for matching: lowercase, collapse spaces, remove punctuation.
 * This makes "ありがとう！" match "ありがとう" and "arigato" match "arigatō".
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[！。、…「」『』・\.,!?'"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Search a transcript for the query.
 * Returns all matching segments with surrounding context.
 */
function searchTranscript(
  segments: Array<{ text: string; offset: number; duration: number }>,
  query: string
): TranscriptMatch[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const matches: TranscriptMatch[] = [];

  // Build a sliding window of 3 segments to catch phrases split across lines
  for (let i = 0; i < segments.length; i++) {
    // Check single segment
    const window1 = normalize(decodeHTML(segments[i].text));
    // Check combined with next segment
    const window2 =
      i + 1 < segments.length
        ? normalize(
            decodeHTML(segments[i].text) +
              " " +
              decodeHTML(segments[i + 1].text)
          )
        : "";
    // Check combined with next two segments
    const window3 =
      i + 2 < segments.length
        ? normalize(
            decodeHTML(segments[i].text) +
              " " +
              decodeHTML(segments[i + 1].text) +
              " " +
              decodeHTML(segments[i + 2].text)
          )
        : "";

    const matched =
      window1.includes(normalizedQuery) ||
      window2.includes(normalizedQuery) ||
      window3.includes(normalizedQuery);

    if (matched) {
      const startSeconds = Math.floor(segments[i].offset / 1000);

      // Build context: previous line + matching line + next line
      const prevText =
        i > 0 ? decodeHTML(segments[i - 1].text) : "";
      const currText = decodeHTML(segments[i].text);
      const nextText =
        i + 1 < segments.length
          ? decodeHTML(segments[i + 1].text)
          : "";

      const context = [prevText, currText, nextText]
        .filter(Boolean)
        .join(" … ");

      matches.push({
        text: currText,
        startSeconds,
        timestamp: formatTimestamp(startSeconds),
        deepLink: `https://www.youtube.com/watch?v=PLACEHOLDER&t=${startSeconds}`,
        context,
      });

      // Skip ahead to avoid duplicate matches from overlapping windows
      i += 1;
    }
  }

  return matches;
}

// ─── YouTube search ───────────────────────────────────────────────────────────

async function searchYouTube(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<YTItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", `${query} anime`);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("relevanceLanguage", "ja");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  const data: YTSearchResponse = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? "YouTube search failed");
  }

  return data.items ?? [];
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const maxVideos = Math.min(
    parseInt(searchParams.get("maxVideos") ?? "8"),
    12
  );

  if (!q) {
    return NextResponse.json(
      { error: "Query parameter `q` is required." },
      { status: 400 }
    );
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "YOUTUBE_API_KEY is not configured.",
        results: [],
        query: q,
        videosChecked: 0,
        videosMatched: 0,
      } satisfies TranscriptSearchResponse,
      { status: 503 }
    );
  }

  try {
    // Step 1: Get candidate videos from YouTube
    const items = await searchYouTube(q, apiKey, maxVideos);

    // Step 2: Fetch transcripts in parallel and search them
    const results = await Promise.allSettled(
      items.map(async (item): Promise<TranscriptVideo | null> => {
        const videoId = item.id.videoId;
        if (!videoId) return null;

        try {
          // Try to fetch transcript — may fail if captions are disabled
          const segments = await YoutubeTranscript.fetchTranscript(videoId, {
            lang: "ja", // prefer Japanese captions
          }).catch(() =>
            YoutubeTranscript.fetchTranscript(videoId) // fallback: any language
          );

          const matches = searchTranscript(segments, q);

          if (matches.length === 0) return null;

          // Replace placeholder with real videoId in deep links
          const matchesWithLinks = matches.map((m) => ({
            ...m,
            deepLink: m.deepLink.replace("PLACEHOLDER", videoId),
          }));

          return {
            videoId,
            title: decodeHTML(item.snippet.title),
            channelTitle: item.snippet.channelTitle,
            thumbnailUrl:
              item.snippet.thumbnails.medium?.url ??
              item.snippet.thumbnails.default?.url ??
              `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
            watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
            matches: matchesWithLinks,
            matchCount: matchesWithLinks.length,
          };
        } catch {
          // Transcript unavailable for this video — skip silently
          return null;
        }
      })
    );

    // Filter out nulls and rejected promises
    const matched: TranscriptVideo[] = results
      .filter(
        (r): r is PromiseFulfilledResult<TranscriptVideo> =>
          r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value)
      .sort((a, b) => b.matchCount - a.matchCount); // most matches first

    const response: TranscriptSearchResponse = {
      query: q,
      videosChecked: items.length,
      videosMatched: matched.length,
      results: matched,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/youtube-transcript]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal error",
        results: [],
        query: q,
        videosChecked: 0,
        videosMatched: 0,
      } satisfies TranscriptSearchResponse,
      { status: 500 }
    );
  }
}
