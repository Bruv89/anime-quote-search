"use client";

import { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, Star, BookOpen } from "lucide-react";
import type { SavedWord, JLPTLevel } from "@/lib/vocabulary";
import { JLPT_COLORS } from "@/lib/vocabulary";

interface Props {
  word:     SavedWord;
  onDelete: (id: string) => void;
}

const JLPT_BG: Record<JLPTLevel, string> = {
  N5: "bg-green-500/10  border-green-500/30  text-green-300",
  N4: "bg-blue-500/10   border-blue-500/30   text-blue-300",
  N3: "bg-amber-500/10  border-amber-500/30  text-amber-300",
  N2: "bg-orange-500/10 border-orange-500/30 text-orange-300",
  N1: "bg-red-500/10    border-red-500/30    text-red-300",
  unknown: "bg-slate-500/10 border-slate-500/30 text-slate-400",
};

const FREQ_STARS: Record<string, number> = {
  very_common: 5, common: 4, uncommon: 2, rare: 1,
};

const FREQ_LABEL: Record<string, string> = {
  very_common: "molto comune", common: "comune", uncommon: "non comune", rare: "raro",
};

export default function VocabCard({ word, onDelete }: Props) {
  const [showExamples, setShowExamples] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stars = FREQ_STARS[word.frequency] ?? 1;
  const color = JLPT_COLORS[word.jlpt as keyof typeof JLPT_COLORS] ?? "#64748b";

  return (
    <div className="rounded-2xl border border-white/5 bg-[#10101e]/60 backdrop-blur-sm overflow-hidden hover:border-white/10 transition-all">
      {/* Top color strip */}
      <div className="h-0.5" style={{ backgroundColor: color }} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* JLPT badge */}
            <span className={`text-[10px] border rounded-full px-2 py-px font-medium ${JLPT_BG[word.jlpt]}`}>
              {word.jlpt === "unknown" ? "N?" : word.jlpt}
            </span>
            {/* Common indicator */}
            {word.isCommon && (
              <span className="text-[10px] bg-white/5 text-slate-400 rounded-full px-2 py-px">comune</span>
            )}
          </div>

          {/* Delete button */}
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button onClick={() => setConfirmDelete(false)}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1">annulla</button>
              <button onClick={() => onDelete(word.id)}
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg border border-red-500/30 bg-red-500/10">
                elimina
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="text-slate-700 hover:text-slate-500 transition-colors p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Word + reading */}
        <div className="mb-1">
          <span className="text-2xl font-display text-white">{word.word}</span>
          <span className="text-sm text-slate-400 font-mono ml-2">{word.reading}</span>
        </div>
        <p className="text-xs text-slate-500 font-mono mb-3">{word.romaji}</p>

        {/* Meanings */}
        <div className="space-y-0.5 mb-3">
          {word.meanings.slice(0, 4).map((m, i) => (
            <p key={i} className="text-sm text-slate-300">
              <span className="text-slate-600 mr-1">{i + 1}.</span>{m}
            </p>
          ))}
        </div>

        {/* POS tags */}
        {word.partsOfSpeech.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {word.partsOfSpeech.map((pos) => (
              <span key={pos} className="text-[10px] bg-white/5 text-slate-500 rounded px-1.5 py-0.5">{pos}</span>
            ))}
          </div>
        )}

        {/* Frequency stars */}
        <div className="flex items-center gap-1 mb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={`w-3 h-3 ${i < stars ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
          ))}
          <span className="text-xs text-slate-600 ml-1">{FREQ_LABEL[word.frequency] ?? word.frequency}</span>
        </div>

        {/* Examples toggle */}
        {word.examples.length > 0 && (
          <div>
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="flex items-center gap-1 text-xs text-amber-500/60 hover:text-amber-400 transition-colors">
              {showExamples ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showExamples ? "Nascondi" : `${word.examples.length} fras${word.examples.length > 1 ? "i" : "e"} di esempio`}
            </button>

            {showExamples && (
              <div className="mt-2 space-y-2">
                {word.examples.map((ex, i) => (
                  <div key={i} className="rounded-lg bg-white/[0.02] border border-white/5 p-2.5">
                    <p className="text-xs text-white font-mono leading-relaxed">{ex.ja}</p>
                    <p className="text-xs text-slate-500 mt-1">{ex.en}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Source */}
        {word.sourceVideoTitle && (
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-1.5">
            <BookOpen className="w-3 h-3 text-slate-700" />
            <a href={`https://www.youtube.com/watch?v=${word.sourceVideoId}`}
              target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors truncate">
              {word.sourceVideoTitle}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
