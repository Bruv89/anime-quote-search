"use client";

import { type SearchResultItem } from "@/app/api/search/route";
import { Clock, Tv, BookOpen } from "lucide-react";

interface Props {
  result: SearchResultItem;
  index: number;
  query: string;
}

/** Highlight matching tokens in `text` for the given `query`. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;

  // Build a simple word-boundary regex from the query tokens
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (tokens.length === 0) return <span>{text}</span>;

  const regex = new RegExp(`(${tokens.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark
            key={i}
            className="bg-violet-500/20 text-violet-200 rounded px-0.5 not-italic"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export default function QuoteCard({ result, index, query }: Props) {
  return (
    <article
      className="card-hover fade-up border-glow rounded-xl p-5 bg-ink-800/60 backdrop-blur-sm"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* ── Header: anime + episode ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-full px-2.5 py-0.5">
          <Tv className="w-3 h-3" />
          {result.animeTitle}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <BookOpen className="w-3 h-3" />
          Episode {result.episodeNumber}
          {result.episodeTitle ? ` — ${result.episodeTitle}` : ""}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 ml-auto">
          <Clock className="w-3 h-3" />
          {result.startTimestamp}
        </span>
      </div>

      {/* ── Japanese text ────────────────────────────────────────────── */}
      <p className="font-display text-xl leading-relaxed text-white mb-2">
        <Highlight text={result.bodyJa} query={query} />
      </p>

      {/* ── Romaji transliteration ───────────────────────────────────── */}
      <p className="font-mono text-sm text-slate-400 leading-relaxed">
        <Highlight text={result.bodyRomaji} query={query} />
      </p>
    </article>
  );
}
