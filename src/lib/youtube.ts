/**
 * src/lib/youtube.ts
 *
 * YouTube Data API v3 — anime-only search.
 *
 * Since we always append "アニメ" to every query, YouTube's own algorithm
 * already biases results toward anime content. Our post-filter only needs
 * to remove obvious false positives (sports events, cooking vlogs, etc.)
 * — we should NOT require explicit anime keywords in the title, because
 * many valid anime clips have plain titles like "くいだおれ太郎が劇場支配人".
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
    thumbnails: { medium?: { url: string }; default?: { url: string } };
  };
}
interface YTResponse {
  items?: YTItem[];
  error?: { message: string; code: number };
}

function decodeHTML(t: string): string {
  return t
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

// Only hard-exclude content that is CLEARLY not anime
// (sports events, cooking, travel vlogs, etc.)
const HARD_EXCLUDE = [
  "cooking", "recipe", "football", "soccer",
  "makeup", "minecraft", "fortnite", "roblox",
  "マラソン", "市民マラソン", "応援", "グルメ食べ歩き",
  "大阪観光", "旅行vlog",
];

function looksLikeAnime(item: YTItem): boolean {
  const combined = (item.snippet.title + " " + item.snippet.channelTitle).toLowerCase();
  // Only remove obvious non-anime — trust YouTube's アニメ query for the rest
  return !HARD_EXCLUDE.some((kw) => combined.includes(kw.toLowerCase()));
}

async function singleSearch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<YouTubeVideoMeta[]> {
  // Always append アニメ — YouTube understands this and biases toward anime
  const searchQuery = `${query} アニメ`;

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("type", "video");
  // Removed videoCategoryId=1 (Film & Animation) — many anime clips are
  // categorized as Entertainment or People & Blogs, causing 0 results.
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("relevanceLanguage", "ja");
  url.searchParams.set("regionCode", "JP");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const res  = await fetch(url.toString(), { cache: 'no-store' });
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

export async function searchAnimeVideosMulti(
  queries: string[],
  apiKey: string,
  maxPerQuery = 20
): Promise<YouTubeVideoMeta[]> {
  const settled = await Promise.allSettled(
    queries.map((q) => singleSearch(q, apiKey, maxPerQuery))
  );

  const seen    = new Set<string>();
  const results: YouTubeVideoMeta[] = [];

  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const v of r.value) {
      if (!seen.has(v.videoId)) {
        seen.add(v.videoId);
        results.push(v);
      }
    }
  }

  return results;
}
