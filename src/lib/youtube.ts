/**
 * src/lib/youtube.ts
 *
 * YouTube Data API v3 helper — enforces anime-only results.
 *
 * Strategy to get ONLY anime content:
 *   1. Append "アニメ" (anime in Japanese) to every query
 *   2. videoCategoryId = 1 (Film & Animation)
 *   3. relevanceLanguage = "ja" (bias toward Japanese content)
 *   4. regionCode = "JP"
 *   5. Post-filter: skip videos whose title/channel look non-anime
 */

export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  watchUrl: string;
  publishedAt: string;
}

interface YTItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      medium?: { url: string };
      high?: { url: string };
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
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Heuristic post-filter: exclude obvious non-anime content.
 * We keep videos that look like anime episodes, reviews, or reactions.
 */
function looksLikeAnime(item: YTItem): boolean {
  const title   = item.snippet.title.toLowerCase();
  const channel = item.snippet.channelTitle.toLowerCase();

  // Hard exclude: music covers, cooking, sports, news
  const exclude = [
    "cooking", "recipe", "football", "soccer", "news", "politics",
    "makeup", "fashion", "vlog", "minecraft", "fortnite", "roblox",
  ];
  if (exclude.some((kw) => title.includes(kw) || channel.includes(kw))) {
    return false;
  }

  // Soft include: prefer titles/channels with anime keywords
  const animeKeywords = [
    "anime", "アニメ", "episode", "ep.", "エピソード", "OP", "ED",
    "opening", "ending", "sub", "dub", "reaction", "review",
    "manga", "マンガ", "漫画", "ova", "movie", "映画",
  ];
  const hasAnimeKeyword = animeKeywords.some(
    (kw) => title.includes(kw) || channel.includes(kw)
  );

  // Always allow if it contains Japanese characters (likely genuine JP content)
  const hasJapanese = /[\u3040-\u9FFF]/.test(item.snippet.title);

  return hasAnimeKeyword || hasJapanese;
}

export async function searchAnimeVideos(
  query: string,
  apiKey: string,
  maxResults = 15
): Promise<YouTubeVideoMeta[]> {
  // Force anime context: append アニメ and the original query
  const searchQuery = `${query} アニメ`;

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("type", "video");
  url.searchParams.set("videoCategoryId", "1");      // Film & Animation
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("relevanceLanguage", "ja");   // bias toward Japanese
  url.searchParams.set("regionCode", "JP");          // Japanese region
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const res  = await fetch(url.toString(), { next: { revalidate: 300 } });
  const data: YTResponse = await res.json();

  if (!res.ok || data.error) {
    throw new Error(
      data.error?.message ?? `YouTube API error ${res.status}`
    );
  }

  return (data.items ?? [])
    .filter((item) => item.id?.videoId && looksLikeAnime(item))
    .map((item) => ({
      videoId:      item.id.videoId,
      title:        decodeHTML(item.snippet.title),
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl:
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
      watchUrl:    `https://www.youtube.com/watch?v=${item.id.videoId}`,
      publishedAt:  item.snippet.publishedAt,
    }));
}
