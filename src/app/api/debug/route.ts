import { NextResponse } from "next/server";
import { buildSearchVariants, buildYouTubeQueries } from "@/lib/romaji";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "逃げちゃダメだ";
  const apiKey = process.env.YOUTUBE_API_KEY!;
  const results: Record<string, unknown> = { query: q };

  // 1. What variants and YouTube queries are built?
  results.searchVariants = buildSearchVariants(q);
  results.youtubeQueries = buildYouTubeQueries(q);

  // 2. Hit YouTube directly - no filter, raw results
  const ytQuery = `${q} アニメ`;
  const ytUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  ytUrl.searchParams.set("part", "snippet");
  ytUrl.searchParams.set("q", ytQuery);
  ytUrl.searchParams.set("type", "video");
  ytUrl.searchParams.set("maxResults", "5");
  ytUrl.searchParams.set("relevanceLanguage", "ja");
  ytUrl.searchParams.set("regionCode", "JP");
  ytUrl.searchParams.set("key", apiKey);

  try {
    const res = await fetch(ytUrl.toString(), { cache: "no-store" });
    const data = await res.json();
    results.youtubeStatus = res.status;
    results.youtubeError = data.error ?? null;
    results.rawVideos = (data.items ?? []).map((item: {id:{videoId:string},snippet:{title:string,channelTitle:string}}) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
    }));
    results.rawVideoCount = results.rawVideos ? (results.rawVideos as unknown[]).length : 0;
  } catch (e) {
    results.youtubeError = String(e);
  }

  // 3. Now run through our full searchAnimeVideosMulti
  try {
    const { searchAnimeVideosMulti } = await import("@/lib/youtube");
    const videos = await searchAnimeVideosMulti(buildYouTubeQueries(q), apiKey, 10);
    results.filteredVideoCount = videos.length;
    results.filteredVideos = videos.map(v => ({ id: v.videoId, title: v.title }));
  } catch (e) {
    results.filteredError = String(e);
  }

  return NextResponse.json(results);
}
