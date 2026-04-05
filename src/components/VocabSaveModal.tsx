"use client";

import { useEffect, useState } from "react";
import { X, BookOpen, Check, Loader2, AlertCircle, Star } from "lucide-react";
import type { WordInfo, JLPTLevel } from "@/lib/vocabulary";
import { saveWord, isWordSaved } from "@/lib/vocabulary";

interface Props {
  matchText:   string;
  videoId:     string;
  videoTitle:  string;
  onClose:     () => void;
}

const JLPT_BADGE: Record<JLPTLevel, string> = {
  N5: "bg-green-500/20  text-green-300  border-green-500/40",
  N4: "bg-blue-500/20   text-blue-300   border-blue-500/40",
  N3: "bg-amber-500/20  text-amber-300  border-amber-500/40",
  N2: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  N1: "bg-red-500/20    text-red-300    border-red-500/40",
  unknown: "bg-slate-500/20 text-slate-400 border-slate-500/40",
};

const FREQ_LABEL: Record<string, { label: string; stars: number }> = {
  very_common: { label: "molto comune",  stars: 5 },
  common:      { label: "comune",        stars: 4 },
  uncommon:    { label: "non comune",    stars: 2 },
  rare:        { label: "raro",          stars: 1 },
};

export default function VocabSaveModal({ matchText, videoId, videoTitle, onClose }: Props) {
  const [words,    setWords]    = useState<WordInfo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Fetch word info on open
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res  = await fetch("/api/word-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: matchText }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Errore API");
        if (!cancelled) {
          const words: WordInfo[] = data.words ?? [];
          setWords(words);
          // Pre-select words not already saved
          setSelected(new Set(words.filter((w) => !isWordSaved(w.word)).map((w) => w.word)));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Errore sconosciuto");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [matchText]);

  function toggle(word: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word); else next.add(word);
      return next;
    });
  }

  function handleSave() {
    const toSave = words.filter((w) => selected.has(w.word));
    for (const w of toSave) {
      saveWord(w, { videoId, videoTitle, matchText });
    }
    // Notify NavBar badge
    window.dispatchEvent(new Event("kotoba_vocab_change"));
    setSaved(true);
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0a0a12] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Salva vocabolario</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source text */}
        <div className="px-5 py-3 border-b border-white/5 bg-white/[0.02]">
          <p className="text-xs text-slate-500 mb-1">Dalla trascrizione:</p>
          <p className="text-sm text-slate-300 font-mono leading-relaxed">{matchText}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 text-amber-400 animate-spin" />
              <p className="text-sm text-slate-500">Analisi delle parole in corso…</p>
              <p className="text-xs text-slate-600">Jisho · Tatoeba</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && words.length === 0 && (
            <div className="text-center py-10 text-slate-500 text-sm">
              Nessuna parola significativa trovata nel testo.
            </div>
          )}

          {!loading && words.map((w) => {
            const alreadySaved = isWordSaved(w.word) && !selected.has(w.word);
            const isSelected   = selected.has(w.word);
            const freq         = FREQ_LABEL[w.frequency] ?? FREQ_LABEL.rare;
            const isExpanded   = expanded === w.word;

            return (
              <div key={w.word}
                className={`rounded-xl border transition-all ${
                  isSelected
                    ? "border-amber-500/40 bg-amber-500/5"
                    : alreadySaved
                    ? "border-green-500/20 bg-green-500/5 opacity-60"
                    : "border-white/5 bg-white/[0.02]"
                }`}>
                <div className="flex items-start gap-3 p-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => !alreadySaved && toggle(w.word)}
                    disabled={alreadySaved}
                    className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-all ${
                      alreadySaved
                        ? "border-green-500/40 bg-green-500/20"
                        : isSelected
                        ? "border-amber-500 bg-amber-500"
                        : "border-white/20 hover:border-amber-500/50"
                    }`}>
                    {(isSelected || alreadySaved) && <Check className="w-3 h-3 text-white" />}
                  </button>

                  {/* Word info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-display text-white">{w.word}</span>
                      <span className="text-sm text-slate-400 font-mono">{w.reading}</span>
                      <span className={`text-[10px] border rounded-full px-2 py-px ${JLPT_BADGE[w.jlpt]}`}>
                        {w.jlpt === "unknown" ? "?" : w.jlpt}
                      </span>
                      {alreadySaved && (
                        <span className="text-[10px] text-green-400">già salvata</span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{w.romaji}</p>
                    <p className="text-sm text-slate-300 mt-1">{w.meanings.slice(0, 3).join("; ")}</p>

                    {/* Frequency stars */}
                    <div className="flex items-center gap-1 mt-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-2.5 h-2.5 ${i < freq.stars ? "text-amber-400 fill-amber-400" : "text-slate-700"}`} />
                      ))}
                      <span className="text-[10px] text-slate-600 ml-1">{freq.label}</span>
                    </div>

                    {/* Examples toggle */}
                    {w.examples.length > 0 && (
                      <>
                        <button
                          onClick={() => setExpanded(isExpanded ? null : w.word)}
                          className="text-[10px] text-amber-500/60 hover:text-amber-400 mt-2 transition-colors">
                          {isExpanded ? "▲ nascondi esempi" : `▼ ${w.examples.length} fras${w.examples.length > 1 ? "i" : "e"} di esempio`}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            {w.examples.map((ex, i) => (
                              <div key={i} className="rounded-lg bg-white/[0.03] border border-white/5 p-2">
                                <p className="text-xs text-white font-mono">{ex.ja}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{ex.en}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!loading && words.length > 0 && !saved && (
          <div className="px-5 py-4 border-t border-white/5 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              {selected.size} parol{selected.size === 1 ? "a" : "e"} selezionat{selected.size === 1 ? "a" : "e"}
            </span>
            <div className="flex gap-2">
              <button onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/10 text-xs text-slate-400 hover:text-slate-300 transition-colors">
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={selected.size === 0}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed text-black text-xs font-bold transition-colors">
                Salva {selected.size > 0 ? selected.size : ""} parol{selected.size === 1 ? "a" : "e"}
              </button>
            </div>
          </div>
        )}

        {saved && (
          <div className="px-5 py-4 border-t border-white/5 flex items-center justify-center gap-2 text-green-400 text-sm">
            <Check className="w-4 h-4" />
            Parole salvate!
          </div>
        )}
      </div>
    </div>
  );
}
