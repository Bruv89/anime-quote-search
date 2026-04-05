"use client";

import { useState, useEffect, useCallback } from "react";
import VocabCard from "@/components/VocabCard";
import { getVocabulary, deleteWord, type SavedWord, type JLPTLevel } from "@/lib/vocabulary";
import { BookOpen, Search, Trash2 } from "lucide-react";

const LEVELS: (JLPTLevel | "all")[] = ["all", "N5", "N4", "N3", "N2", "N1", "unknown"];

const LEVEL_STYLE: Record<string, string> = {
  all:     "text-slate-300  border-slate-500/50  bg-slate-500/10",
  N5:      "text-green-300  border-green-500/50  bg-green-500/10",
  N4:      "text-blue-300   border-blue-500/50   bg-blue-500/10",
  N3:      "text-amber-300  border-amber-500/50  bg-amber-500/10",
  N2:      "text-orange-300 border-orange-500/50 bg-orange-500/10",
  N1:      "text-red-300    border-red-500/50    bg-red-500/10",
  unknown: "text-slate-400  border-slate-600/50  bg-slate-600/10",
};

export default function VocabularyPage() {
  const [words,        setWords]       = useState<SavedWord[]>([]);
  const [filter,       setFilter]      = useState<JLPTLevel | "all">("all");
  const [searchQuery,  setSearchQuery] = useState("");

  const load = useCallback(() => setWords(getVocabulary()), []);
  useEffect(() => { load(); }, [load]);

  function handleDelete(id: string) {
    deleteWord(id);
    load();
    window.dispatchEvent(new Event("kotoba_vocab_change"));
  }

  // Filter and search
  const visible = words.filter((w) => {
    if (filter !== "all" && w.jlpt !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        w.word.includes(q) ||
        w.reading.includes(q) ||
        w.romaji.toLowerCase().includes(q) ||
        w.meanings.some((m) => m.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const countByLevel = (level: JLPTLevel | "all") =>
    level === "all" ? words.length : words.filter((w) => w.jlpt === level).length;

  return (
    <div className="min-h-screen pt-16 pb-24">
      <div className="max-w-4xl mx-auto px-4">

        {/* Header */}
        <div className="py-8">
          <div className="flex items-center gap-3 mb-1">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-display text-white">Il mio vocabolario</h1>
          </div>
          <p className="text-slate-500 text-sm ml-8">
            {words.length} parol{words.length === 1 ? "a" : "e"} salvat{words.length === 1 ? "a" : "e"}
          </p>
        </div>

        {words.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">📖</p>
            <p className="text-slate-400 text-lg mb-2">Nessuna parola salvata ancora.</p>
            <p className="text-slate-600 text-sm">
              Cerca una frase anime e clicca "📚 Salva" su un match per iniziare.
            </p>
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Cerca per kanji, lettura, romaji o significato…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#10101e] border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-amber-500/40 transition-colors"
              />
            </div>

            {/* Level filter tabs */}
            <div className="flex flex-wrap gap-2 mb-6">
              {LEVELS.filter((l) => l === "all" || countByLevel(l) > 0).map((level) => (
                <button key={level} onClick={() => setFilter(level)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    filter === level
                      ? LEVEL_STYLE[level]
                      : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
                  }`}>
                  <span>{level === "all" ? "Tutte" : level === "unknown" ? "N?" : level}</span>
                  <span className={`px-1.5 py-px rounded-full text-[10px] ${filter === level ? "bg-white/15" : "bg-white/5"}`}>
                    {countByLevel(level)}
                  </span>
                </button>
              ))}
            </div>

            {/* Words grid */}
            {visible.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm">
                Nessuna parola corrisponde ai filtri selezionati.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {visible
                  .sort((a, b) => b.savedAt - a.savedAt)
                  .map((w) => (
                    <VocabCard key={w.id} word={w} onDelete={handleDelete} />
                  ))}
              </div>
            )}

            {/* Clear all */}
            {words.length > 0 && (
              <div className="mt-12 pt-6 border-t border-white/5 flex justify-center">
                <button
                  onClick={() => {
                    if (confirm(`Eliminare tutte le ${words.length} parole salvate?`)) {
                      words.forEach((w) => deleteWord(w.id));
                      load();
                      window.dispatchEvent(new Event("kotoba_vocab_change"));
                    }
                  }}
                  className="flex items-center gap-2 text-xs text-slate-600 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                  Elimina tutto il vocabolario
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
