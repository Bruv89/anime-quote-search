/**
 * src/app/api/youtube/route.ts
 *
 * GET /api/youtube?q=<query>&maxResults=8
 *
 * Calls the YouTube Data API v3 search endpoint.
 * Appends "anime" to every query so results stay on-topic.
 *
 * Requires: YOUTUBE_API_KEY in .env.local
 * Free quota: 10,000 units/day — each search costs 100 units (100 searches/day).
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  thumbnailUrl: string;       // mqdefault (320×180)
  thumbnailHqUrl: string;     // hqdefault (480×360)
  publishedAt: string;        // ISO date string
  watchUrl: string;
}

export interface YouTubeResponse {
  query: string;
  results: YouTubeVideo[];
  error?: string;
}

// ─── YouTube API types (minimal) ─────────────────────────────────────────────

interface YTSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      medium?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
  };
}

interface YTSearchResponse {
  items?: YTSearchItem[];
  error?: { message: string; code: number };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const maxResults = Math.min(
    parseInt(searchParams.get("maxResults") ?? "8"),
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
        error:
          "YOUTUBE_API_KEY is not set. Add it to your .env.local file.",
        results: [],
        query: q,
      } satisfies YouTubeResponse,
      { status: 503 }
    );
  }

  // Build the search query: append "anime" so results stay relevant
  const searchQuery = `${q} anime`;

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("type", "video");
  url.searchParams.set("videoCategoryId", "1"); // Film & Animation
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("relevanceLanguage", "ja"); // prefer Japanese-language results
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), {
      // Cache the YouTube response for 5 minutes to save quota
      next: { revalidate: 300 },
    });

    const data: YTSearchResponse = await res.json();

    if (!res.ok || data.error) {
      console.error("[/api/youtube] API error:", data.error);
      return NextResponse.json(
        {
          error: data.error?.message ?? "YouTube API request failed",
          results: [],
          query: q,
        } satisfies YouTubeResponse,
        { status: res.status }
      );
    }

    const results: YouTubeVideo[] = (data.items ?? [])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id.videoId,
        title: decodeHTMLEntities(item.snippet.title),
        description: item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl:
          item.snippet.thumbnails.medium?.url ??
          item.snippet.thumbnails.default?.url ??
          `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
        thumbnailHqUrl:
          item.snippet.thumbnails.high?.url ??
          `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
        publishedAt: item.snippet.publishedAt,
        watchUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      }));

    return NextResponse.json({ query: q, results } satisfies YouTubeResponse);
  } catch (err) {
    console.error("[/api/youtube] fetch error:", err);
    return NextResponse.json(
      {
        error: "Failed to reach YouTube API. Check your network connection.",
        results: [],
        query: q,
      } satisfies YouTubeResponse,
      { status: 500 }
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** YouTube API returns HTML entities in titles (e.g. &amp; &#39;). Decode them. */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
