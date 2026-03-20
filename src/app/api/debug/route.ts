import { NextResponse } from "next/server";
import { buildSearchVariants, buildYouTubeQueries, matchText } from "@/lib/romaji";
import { batchToHiragana } from "@/lib/kanji";
import { searchAnimeVideosMulti } from "@/lib/youtube";
import { YoutubeTranscript } from "youtube-transcript";

export async function GET() {
  const results: Record<string, unknown> = {};
  const apiKey = process.env.YOUTUBE_API_KEY!;

  const variants = buildSearchVariants("kuidaore");
  results.variants = variants;

  const videos = await searchAnimeVideosMulti(buildYouTubeQueries("kuidaore"), apiKey, 12);
  results.video_count = videos.length;

  const transcriptResults = [];

  for (const video of videos) {
    let segs: { text: string }[] = [];
    let error = "";

    try {
      segs = await YoutubeTranscript.fetchTranscript(video.videoId, { lang: "ja" });
    } catch {
      try {
        segs = await YoutubeTranscript.fetchTranscript(video.videoId);
      } catch (e2) {
        error = String(e2);
      }
    }

    const texts = segs.map((s) => s.text);
    const map = await batchToHiragana(texts);
    const readings = texts.map((t) => map.get(t) ?? t);

    const matchFound = readings.some((r) => matchText(r, variants) !== null)
      || texts.some((t) => matchText(t, variants) !== null);

    transcriptResults.push({
      id: video.videoId,
      title: video.title,
      segmentCount: segs.length,
      hasTranscript: segs.length > 0,
      matchFound,
      error: error || undefined,
      sample: segs.slice(0, 5).map((s) => s.text),
    });
  }

  results.transcripts = transcriptResults;
  return NextResponse.json(results);
}