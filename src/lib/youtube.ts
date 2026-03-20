/**
 * src/lib/youtube.ts
 *
 * YouTube Data API v3 — anime-only search.
 *
 * Strategy:
 *   - Always append "アニメ" to the search query
 *   - Use videoCategoryId=1 (Film & Animation) + regionCode=JP
 *   - Post-filter: require at least one strong anime signal in title/channel
 *     (Japanese chars alone are NOT enough — too many false positives)
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

// Words that strongly indicate non-anime content
const HARD_EXCLUDE = [
  "cooking", "recipe", "football", "soccer", "news", "politics",
  "makeup", "fashion", "minecraft", "fortnite", "roblox",
  "マラソン", "観光", "旅行", "vlog", "グルメ", "食べ歩き",
  "道頓堀", "大阪観光", "市民マラソン", "応援",
];

// At least ONE of these must be present for a video to be considered anime
const ANIME_REQUIRED = [
  "anime", "アニメ", "漫画", "manga", "episode", "エピソード",
  "op ", " ed ", "opening", "ending", "amv", "mad",
  "声優", "キャラ", "名言", "セリフ", "作品", "劇場",
  "ova", "アニソン", "主題歌", "アニメーション",
  "フィギュア", "cosplay", "コスプレ",
  // Common anime title keywords
  "ちゃん", "くん", "さん",  // character name suffixes — not perfect but helpful
];

function looksLikeAnime(item: YTItem): boolean {
  const title   = item.snippet.title.toLowerCase();
  const channel = item.snippet.channelTitle.toLowerCase();
  const combined = title + " " + channel;

  // Hard exclude first
  if (HARD_EXCLUDE.some((kw) => combined.includes(kw.toLowerCase()))) return false;

  // Must have at least one anime signal
  return ANIME_REQUIRED.some((kw) => combined.includes(kw.toLowerCase()));
}

async function singleSearch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<YouTubeVideoMeta[]> {
  // Always append アニメ — this is the key to getting anime content
  const searchQuery = `${query} アニメ`;

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
 * Run multiple searches in parallel and deduplicate results.
 * With 3 queries × 20 results = up to 60 candidates before filtering.
 */
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
