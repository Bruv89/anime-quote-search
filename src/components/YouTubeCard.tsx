"use client";

import { type YouTubeVideo } from "@/app/api/youtube/route";
import { ExternalLink, PlayCircle, Youtube } from "lucide-react";
import { useState } from "react";

interface Props {
  video: YouTubeVideo;
  index: number;
}

export default function YouTubeCard({ video, index }: Props) {
  const [imgError, setImgError] = useState(false);

  const fallbackThumb = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`;

  return (
    <a
      href={video.watchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group card-hover fade-up flex gap-4 border border-white/5 rounded-xl p-3 bg-ink-800/40 backdrop-blur-sm hover:border-red-500/30 hover:bg-red-500/5 transition-all"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* ── Thumbnail ────────────────────────────────────────────────── */}
      <div className="relative flex-shrink-0 w-36 h-20 rounded-lg overflow-hidden bg-ink-700">
        <img
          src={imgError ? fallbackThumb : video.thumbnailUrl}
          alt={video.title}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
          <PlayCircle className="w-8 h-8 text-white drop-shadow-lg" />
        </div>
        {/* YouTube badge */}
        <div className="absolute bottom-1 right-1 bg-red-600 rounded px-1 py-0.5">
          <Youtube className="w-3 h-3 text-white" />
        </div>
      </div>

      {/* ── Info ─────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <h3 className="text-sm font-medium text-white leading-snug line-clamp-2 group-hover:text-red-300 transition-colors">
            {video.title}
          </h3>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {video.channelTitle}
          </p>
        </div>

        {video.description && (
          <p className="text-xs text-slate-600 line-clamp-1 mt-1">
            {video.description}
          </p>
        )}
      </div>

      {/* ── External link icon ───────────────────────────────────────── */}
      <div className="flex-shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink className="w-4 h-4 text-slate-400" />
      </div>
    </a>
  );
}
