/**
 * src/lib/youtube.ts
 *
 * YouTube search with two-tier classification:
 *   Tier 1 "dialogue" — actual anime episodes/clips where characters speak
 *   Tier 2 "extended" — songs, AMVs, compilations (still anime-related but not dialogue)
 *
 * We always fetch both tiers. The API route decides what to show.
 */

export interface YouTubeVideoMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  watchUrl: string;
  tier: "dialogue" | "extended";
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

// Keywords that indicate MUSIC / AMV / compilation — not direct dialogue
const MUSIC_KEYWORDS = [
  // Japanese
  "アニソン", "主題歌", "op ", " ed ", "オープニング", "エンディング",
  "bgm", "ost", "サウンドトラック", "歌ってみた", "弾いてみた",
  "amv", "mad", "名言集", "名言まとめ", "セリフ集", "泣ける",
  "感動mad", "感動amv", "mixed edit", "edit",
  // English
  "opening", "ending", "soundtrack", "music video", "full song",
  "lyric", "lyrics", "covered by", "cover",
];

// Keywords that strongly indicate actual episode content / dialogue
const DIALOGUE_KEYWORDS = [
  "第", "話", "episode", "ep.", "エピソード", "本編",
  "クリップ", "clip", "シーン", "scene",
  "公式", "official", "フル", "full",
];

// Hard exclude — clearly not anime at all
const HARD_EXCLUDE = [
  "マラソン", "市民マラソン", "観光", "グルメ",
  "cooking", "recipe", "minecraft", "fortnite",
  "makeup", "fashion",
];

function classify(item: YTItem): "dialogue" | "extended" | "exclude" {
  const title   = item.snippet.title.toLowerCase();
  const channel = item.snippet.channelTitle.toLowerCase();
  const combined = title + " " + channel;

  // Hard exclude first
  if (HARD_EXCLUDE.some((kw) => combined.includes(kw.toLowerCase()))) {
    return "exclude";
  }

  // Check for music/compilation signals
  const isMusic = MUSIC_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()));

  // Check for dialogue/episode signals
  const isDialogue = DIALOGUE_KEYWORDS.some((kw) => combined.includes(kw.toLowerCase()));

  if (isDialogue && !isMusic) return "dialogue";
  if (isMusic) return "extended";

  // Default: if it has Japanese characters and passed hard exclude → extended
  // We're lenient here because dialogue clips often have generic titles
  const hasJapanese = /[\u3040-\u9FFF]/.test(item.snippet.title);
  return hasJapanese ? "dialogue" : "extended";
}

async function singleSearch(
  query: string,
  apiKey: string,
  maxResults: number
): Promise<YouTubeVideoMeta[]> {
  const searchQuery = `${query} アニメ`;

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("relevanceLanguage", "ja");
  url.searchParams.set("regionCode", "JP");
  url.searchParams.set("safeSearch", "moderate");
  url.searchParams.set("key", apiKey);

  const res  = await fetch(url.toString(), { cache: "no-store" });
  const data: YTResponse = await res.json();

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `YouTube API error ${res.status}`);
  }

  return (data.items ?? [])
    .map((item) => {
      const tier = classify(item);
      if (tier === "exclude" || !item.id?.videoId) return null;
      return {
        videoId:      item.id.videoId,
        title:        decodeHTML(item.snippet.title),
        channelTitle: item.snippet.channelTitle,
        thumbnailUrl:
          item.snippet.thumbnails.medium?.url ??
          `https://img.youtube.com/vi/${item.id.videoId}/mqdefault.jpg`,
        watchUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        tier,
      } satisfies YouTubeVideoMeta;
    })
    .filter((v): v is YouTubeVideoMeta => v !== null);
}

export async function searchAnimeVideosMulti(
  queries: string[],
  apiKey: string,
  maxPerQuery = 25
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

  // Dialogue videos first, then extended
  return results.sort((a, b) => {
    if (a.tier === b.tier) return 0;
    return a.tier === "dialogue" ? -1 : 1;
  });
}
