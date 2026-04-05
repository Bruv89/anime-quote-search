"use client";

import { useState } from "react";
import { type TranscriptResult } from "@/app/api/transcript/route";
import { Clock, ExternalLink, PlayCircle, Youtube, ChevronDown, ChevronUp, BookOpen } from "lucide-react";
import VocabSaveModal from "@/components/VocabSaveModal";

interface Props {
  result:         TranscriptResult;
  index:          number;
  searchVariants: string[];
  // query not used in render but kept for API compatibility
  query?:         string;
}

const MATCH_BADGE: Record<string, { label: string; className: string }> = {
  exact:  { label: "exact",  className: "bg-green-500/15  border-green-500/30  text-green-300"  },
  prefix: { label: "prefix", className: "bg-amber-500/15  border-amber-500/30  text-amber-300"  },
  fuzzy:  { label: "fuzzy",  className: "bg-blue-500/15   border-blue-500/30   text-blue-300"   },
};

function Highlight({ text, variants }: { text: string; variants: string[] }) {
  if (!variants.length) return <span>{text}</span>;
  const escaped = variants.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex   = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts   = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-amber-400/25 text-amber-200 rounded px-0.5 not-italic font-semibold">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export default function TranscriptCard({ result, index, searchVariants }: Props) {
  const [expanded,     setExpanded]     = useState(false);
  const [imgErr,       setImgErr]       = useState(false);
  const [modalOpen,    setModalOpen]    = useState(false);
  const [modalMatchIdx, setModalMatchIdx] = useState(0);

  const primary = result.matches[0];
  const extras  = result.matches.slice(1);
  const badge   = MATCH_BADGE[primary.matchType] ?? MATCH_BADGE.exact;

  function openSaveModal(matchIdx: number) {
    setModalMatchIdx(matchIdx);
    setModalOpen(true);
  }

  const activeMatch = result.matches[modalMatchIdx];

  return (
    <>
      <article
        className="fade-up border border-white/5 rounded-2xl overflow-hidden bg-[#10101e]/60 backdrop-blur-sm hover:border-amber-500/20 transition-all duration-200"
        style={{ animationDelay: `${index * 60}ms` }}>

        {/* ── Video header ─────────────────────────────────────────────── */}
        <div className="flex gap-3 p-4">
          <a href={result.watchUrl} target="_blank" rel="noopener noreferrer"
            className="relative flex-shrink-0 w-32 h-[72px] rounded-xl overflow-hidden bg-[#18182e] group">
            <img
              src={imgErr ? `https://img.youtube.com/vi/${result.videoId}/mqdefault.jpg` : result.thumbnailUrl}
              alt={result.title} onError={() => setImgErr(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
              <PlayCircle className="w-7 h-7 text-white drop-shadow" />
            </div>
            <div className="absolute bottom-1 right-1 bg-red-600 rounded px-1 py-0.5">
              <Youtube className="w-3 h-3 text-white" />
            </div>
          </a>

          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <a href={result.watchUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm font-medium text-white hover:text-amber-300 transition-colors line-clamp-2 leading-snug">
                {result.title}
              </a>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{result.channelTitle}</p>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${badge.className}`}>
                {badge.label} match
              </span>
              <span className="text-xs text-slate-600">
                {result.matchCount} occurrence{result.matchCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* ── Primary match ─────────────────────────────────────────────── */}
        <div className="mx-4 mb-3">
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/5 border border-amber-500/10 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Transcript match at <span className="text-amber-400 font-mono">{primary.timestamp}</span>
              </p>
              <p className="text-sm text-slate-300 font-mono leading-relaxed">
                <Highlight text={primary.context} variants={searchVariants} />
              </p>
            </div>

            <div className="flex flex-col gap-1.5 flex-shrink-0">
              {/* Deep-link button */}
              <a href={primary.deepLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors shadow">
                <PlayCircle className="w-3.5 h-3.5" />
                {primary.timestamp}
              </a>
              {/* Save vocabulary button */}
              <button onClick={() => openSaveModal(0)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium transition-colors">
                <BookOpen className="w-3.5 h-3.5" />
                Salva
              </button>
            </div>
          </div>
        </div>

        {/* ── Extra matches ──────────────────────────────────────────────── */}
        {extras.length > 0 && (
          <div className="px-4 pb-4">
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? "Nascondi" : "Mostra"} altri {extras.length} match
            </button>

            {expanded && (
              <div className="mt-2 space-y-2">
                {extras.map((match, i) => (
                  <div key={i}
                    className="flex items-start justify-between gap-2 rounded-lg bg-white/[0.02] border border-white/5 p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600 mb-0.5 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span className="font-mono text-amber-500/70">{match.timestamp}</span>
                      </p>
                      <p className="text-xs text-slate-400 font-mono leading-relaxed">
                        <Highlight text={match.context} variants={searchVariants} />
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <a href={match.deepLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-300 transition-colors">
                        <ExternalLink className="w-3 h-3" />
                        <span className="font-mono">{match.timestamp}</span>
                      </a>
                      <button onClick={() => openSaveModal(i + 1)}
                        className="flex items-center gap-1 text-xs text-amber-500/60 hover:text-amber-400 transition-colors">
                        <BookOpen className="w-3 h-3" />
                        Salva
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </article>

      {/* Vocabulary save modal */}
      {modalOpen && activeMatch && (
        <VocabSaveModal
          matchText={activeMatch.context}
          videoId={result.videoId}
          videoTitle={result.title}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
