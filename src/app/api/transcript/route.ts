/**
 * src/app/api/transcript/route.ts
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

// ─── Types ────────────────────────────────────────────────────────────────────

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
  tier: "dialogue" | "extended";
}

export interface TranscriptSearchResponse {
  query: string;
  searchVariants: string[];
  videosChecked: number;
  videosMatched: number;
  results: TranscriptResult[];
  /** True if ALL matched results are "extended" (songs/AMV) — no pure dialogue found */
  onlyExtended: boolean;
  error?: string;
}

interface Segment {
  text: string;
  offset: number;
  duration: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function decodeHTML(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, " ").trim();
}

async function fetchTranscript(videoId: string, ms = 7000): Promise<Segment[]> {
  const race = <T>(p: Promise<T>) =>
    Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error("t/o")), ms))]);
  try {
    return await race(YoutubeTranscript.fetchTranscript(videoId, { lang: "ja" })) as Segment[];
  } catch {
    try { return await race(YoutubeTranscript.fetchTranscript(videoId)) as Segment[]; }
    catch { return []; }
  }
}

async function pool<T>(tasks: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = [];
  const q = [...tasks];
  const worker = async () => { while (q.length) out.push(await q.shift()!()); };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return out;
}

// ─── Build all representations for a text ────────────────────────────────────

/**
 * Given a text and its pre-computed hiragana reading, return all string
 * representations to try matching against.
 *
 * "食い倒れの街"  →  [
 *   "食い倒れの街",           // raw
 *   "くいだおれのまち",        // kuromoji reading
 *   "kuidaorenoмachi",        // romaji of reading
 *   "kuidaoreno machi",       // simplified romaji
 * ]
 */
function representations(raw: string, hiraganaReading: string): string[] {
  const s = new Set<string>();
  s.add(raw);

  if (hiraganaReading && hiraganaReading !== raw) {
    s.add(hiraganaReading);

    const r = wanakana.toRomaji(hiraganaReading, { convertLongVowelMark: true });
    s.add(r);

    // long-vowel simplification: ou→o, uu→u, oo→o
    const simplified = r.replace(/ou/gi, "o").replace(/uu/gi, "u").replace(/oo/gi, "o");
    if (simplified !== r) s.add(simplified);
  }

  // partial romaji (wanakana handles kana, leaves kanji as-is)
  const partial = wanakana.toRomaji(raw, { convertLongVowelMark: true });
  if (partial !== raw) s.add(partial);

  return Array.from(s);
}

// ─── Transcript scanning ──────────────────────────────────────────────────────

/**
 * Scan transcript segments.
 *
 * @param segReadings  Per-segment hiragana reading, same length as segments.
 *                     segReadings[i] = kuromoji reading of segments[i].text
 *
 * For each sliding window of 1-3 segments:
 *   - combine the RAW texts  → rawWindow
 *   - combine the READINGS   → readingWindow  (this is the fix!)
 *   - call representations() on both
 *   - try matchText() against all variants
 */
function scanTranscript(
  segments: Segment[],
  segReadings: string[],
  variants: string[],
  videoId: string
): TranscriptMatch[] {
  const matches: TranscriptMatch[] = [];
  let lastSec = -999;

  for (let i = 0; i < segments.length; i++) {
    const startSec = Math.floor((segments[i].offset ?? 0) / 1000);
    if (startSec - lastSec < 2) continue;

    // Build windows: raw text + corresponding reading
    const windows: Array<{ raw: string; reading: string }> = [];

    for (let w = 1; w <= 3 && i + w - 1 < segments.length; w++) {
      const rawParts     = [];
      const readingParts = [];
      for (let k = 0; k < w; k++) {
        rawParts.push(decodeHTML(segments[i + k].text));
        readingParts.push(segReadings[i + k] ?? decodeHTML(segments[i + k].text));
      }
      windows.push({
        raw:     rawParts.join(" "),
        reading: readingParts.join(" "),
      });
    }

    // Collect all text representations from all windows
    const allReps = new Set<string>();
    for (const { raw, reading } of windows) {
      for (const r of representations(raw, reading)) allReps.add(r);
    }

    // Try matching
    let best: MatchResult | null = null;
    for (const rep of allReps) {
      const m = matchText(rep, variants);
      if (m && (!best || m.score > best.score)) {
        best = m;
        if (best.score === 100) break;
      }
    }

    if (!best) continue;

    lastSec = startSec;

    const prev = i > 0 ? decodeHTML(segments[i - 1].text) : "";
    const curr = decodeHTML(segments[i].text);
    const next = i + 1 < segments.length ? decodeHTML(segments[i + 1].text) : "";

    matches.push({
      text:           curr,
      context:        [prev, curr, next].filter(Boolean).join(" … "),
      matchedVariant: best.matchedVariant,
      matchType:      best.type,
      matchScore:     best.score,
      startSeconds:   startSec,
      timestamp:      fmt(startSec),
      deepLink:       `https://www.youtube.com/watch?v=${videoId}&t=${startSec}`,
    });

    i += 1;
  }

  return matches;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
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
    // Phase 1: fetch videos
    const videos = await searchAnimeVideosMulti(ytQueries, apiKey, 25);

    // Phase 2: fetch all transcripts in parallel
    const fetched = await pool(
      videos.map((video) => () =>
        fetchTranscript(video.videoId).then((segs) => ({ video, segs }))
      ),
      12
    );

    // Phase 3: collect every unique segment text and batch-convert to hiragana
    // This is fully awaited before any matching starts.
    const uniqueTexts = [...new Set(
      fetched.flatMap(({ segs }) => segs.map((s) => decodeHTML(s.text)))
    )];
    const hiraganaMap = await batchToHiragana(uniqueTexts);

    // Phase 4: for each video, build per-segment reading array, then scan
    const results: TranscriptResult[] = [];

    for (const { video, segs } of fetched) {
      if (segs.length === 0) continue;

      // Build segReadings[i] = hiragana reading of segment i
      // This is the key fix: windows combine readings correctly
      const segReadings = segs.map((s) => {
        const decoded = decodeHTML(s.text);
        return hiraganaMap.get(decoded) ?? decoded;
      });

      const matches = scanTranscript(segs, segReadings, variants, video.videoId);
      if (matches.length === 0) continue;

      const bestScore = Math.max(...matches.map((m) => m.matchScore));
      results.push({ ...video, matches, matchCount: matches.length, bestScore });
    }

    results.sort((a, b) => {
      // Dialogue tier always before extended tier
      if (a.tier !== b.tier) return a.tier === "dialogue" ? -1 : 1;
      // Within same tier: best score first, then most matches
      return b.bestScore - a.bestScore || b.matchCount - a.matchCount;
    });

    return NextResponse.json(
      { query: q, searchVariants: variants, videosChecked: videos.length, videosMatched: results.length, results } satisfies TranscriptSearchResponse,
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
