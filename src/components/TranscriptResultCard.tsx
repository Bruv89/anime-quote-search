"use client";

import { type TranscriptVideo } from "@/app/api/youtube-transcript/route";
import { Clock, ExternalLink, PlayCircle, Youtube, Zap } from "lucide-react";
import { useState } from "react";

interface Props {
  video: TranscriptVideo;
  index: number;
  query: string;
}

/** Highlight the query inside a text string. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-red-500/25 text-red-200 rounded px-0.5 not-italic font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export default function TranscriptResultCard({ video, index, query }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const primaryMatch = video.matches[0];
  const extraMatches = video.matches.slice(1);

  return (
    <article
      className="fade-up border border-white/5 rounded-xl overflow-hidden bg-ink-800/40 backdrop-blur-sm hover:border-red-500/20 transition-all"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* ── Header: video info ────────────────────────────────────────── */}
      <div className="flex gap-3 p-4">
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 w-32 h-[72px] rounded-lg overflow-hidden bg-ink-700">
          <img
            src={imgError ? `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg` : video.thumbnailUrl}
            alt={video.title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-1 right-1 bg-red-600 rounded px-1 py-0.5">
            <Youtube className="w-3 h-3 text-white" />
          </div>
        </div>

        {/* Title + channel */}
        <div className="flex-1 min-w-0">
          <a
            href={video.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-white hover:text-red-300 transition-colors line-clamp-2 leading-snug"
          >
            {video.title}
          </a>
          <p className="text-xs text-slate-500 mt-1">{video.channelTitle}</p>
          {/* Match count badge */}
          <div className="flex items-center gap-1 mt-2">
            <span className="inline-flex items-center gap-1 text-xs bg-red-500/10 border border-red-500/20 text-red-300 rounded-full px-2 py-0.5">
              <Zap className="w-3 h-3" />
              {video.matchCount} match{video.matchCount !== 1 ? "es" : ""} in transcript
            </span>
          </div>
        </div>
      </div>

      {/* ── Primary match ─────────────────────────────────────────────── */}
      <div className="mx-4 mb-3 rounded-lg bg-red-500/5 border border-red-500/10 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Found at {primaryMatch.timestamp}
            </p>
            <p className="text-sm text-slate-300 leading-relaxed font-mono">
              <Highlight text={primaryMatch.context} query={query} />
            </p>
          </div>
          {/* Deep link — opens video at exact timestamp */}
          <a
            href={primaryMatch.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            title={`Watch at ${primaryMatch.timestamp}`}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            {primaryMatch.timestamp}
          </a>
        </div>
      </div>

      {/* ── Extra matches (collapsed by default) ──────────────────────── */}
      {extraMatches.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <span>{expanded ? "▲ Hide" : "▼ Show"}</span>
            <span>
              {extraMatches.length} more match{extraMatches.length !== 1 ? "es" : ""}
            </span>
          </button>

          {expanded && (
            <div className="mt-2 space-y-2">
              {extraMatches.map((match, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-2 rounded-lg bg-white/[0.02] border border-white/5 p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-600 mb-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {match.timestamp}
                    </p>
                    <p className="text-xs text-slate-400 font-mono leading-relaxed">
                      <Highlight text={match.context} query={query} />
                    </p>
                  </div>
                  <a
                    href={match.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-400 hover:text-red-300 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {match.timestamp}
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
