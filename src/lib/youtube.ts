/**
 * src/lib/youtube.ts
 *
 * YouTube Data API v3 helpers with anime-only filtering.
 * Supports multi-query parallel search for maximum video coverage.
 */

export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  watchUrl: string;
}

interface YTItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

interface YTResponse {
  items?: YTItem[];
  error?: { message: string; code: number };
}

function decodeHTML(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Keywords that strongly indicate non-anime content
const EXCLUDE_KEYWORDS = [
  "cooking", "recipe", "football", "soccer", "news", "politics",
  "makeup", "fashion", "minecraft", "fortnite", "roblox", "tutorial",
  "how to", "unboxing", "vlog", "podcast",
];

// Keywords that confirm anime content
const ANIME_KEYWORDS = [
  "anime", "アニメ", "episode", "エピソード", "op ", " ed ", "opening",
  "ending", " sub", "dub", "reaction", "review", "manga", "マンガ",
  "漫画", "ova", "アニメ映画", "amv", "クリップ", "clip",
];

function looksLikeAnime(item: YTItem): boolean {
  const title   = item.snippet.title.toLowerCase();
  const channel = item.snippet.channelTitle.toLowerCase();
  const combined = title + " " + channel;

  if (EXCLUDE_KEYWORDS.some((kw) => combined.includes(kw))) return false;

  const hasAnimeKw  = ANIME_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()));
  const hasJapanese = /[\u3040-\u9FFF]/.test(item.snippet.title);

  return hasAnimeKw || hasJapanese;
}

/**
 * Single YouTube search call.
 * All params tuned for anime content:
 *   - videoCategoryId=1 (Film & Animation)
 *   - relevanceLanguage=ja + regionCode=JP
 *   - appends "アニメ" to query
 */
async function singleSearch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<YouTubeVideoMeta[]> {
  // If query is already Japanese, don't append アニメ — it narrows results too much
  // and causes YouTube to return generic anime pages instead of content matching
  // the specific phrase. For romaji queries we still append it.
  const hasJapanese = /[\u3040-\u9FFF]/.test(query);
  const searchQuery = hasJapanese ? query : `${query} アニメ`;

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("type", "video");
  url.searchParams.set("videoCategoryId", "1");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("relevanceLanguage", "ja");
  url.searchParams.set("regionCode", "JP");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const res  = await fetch(url.toString(), { next: { revalidate: 180 } });
  const data: YTResponse = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `YouTube API error ${res.status}`);
  }

  return (data.items ?? [])
    .filter((item) => item.id?.videoId && looksLikeAnime(item))
    .map((item) => ({
      videoId:      item.id.videoId,
      title:        decodeHTML(item.snippet.title),
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl:
        item.snippet.thumbnails.medium?.url ??
        `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
      watchUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    }));
}

/**
 * Run multiple YouTube searches in parallel using different query formulations,
 * then deduplicate by videoId.
 *
 * This is the key to covering more videos without increasing latency:
 * 3 searches × 15 results = up to 45 candidates, fetched concurrently.
 * Quota cost: 3 × 100 = 300 units per user search.
 */
export async function searchAnimeVideosMulti(
  queries: string[],
  apiKey: string,
  maxPerQuery = 15
): Promise<YouTubeVideoMeta[]> {
  const settled = await Promise.allSettled(
    queries.map((q) => singleSearch(q, apiKey, maxPerQuery))
  );

  const seen    = new Set<string>();
  const results: YouTubeVideoMeta[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const video of result.value) {
      if (!seen.has(video.videoId)) {
        seen.add(video.videoId);
        results.push(video);
      }
    }
  }

  return results;
}
