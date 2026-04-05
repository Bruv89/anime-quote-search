"use client";

import { useState, useEffect } from "react";
import { TrendingUp, BookOpen, Trophy, Clock } from "lucide-react";
import { getVocabByJLPT, JLPT_TOTALS, JLPT_COLORS, type JLPTLevel, type SavedWord } from "@/lib/vocabulary";
import Link from "next/link";

const LEVEL_DESC: Record<string, string> = {
  N5: "Livello base — vocaboli quotidiani essenziali",
  N4: "Livello elementare — conversazione di base",
  N3: "Livello intermedio — testi e conversazioni comuni",
  N2: "Livello avanzato — giornali, letteratura moderna",
  N1: "Livello superiore — qualsiasi testo autentico",
};

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

function CircleProgress({ pct, color, size = 80 }: { pct: number; color: string; size?: number }) {
  const r    = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }} />
    </svg>
  );
}

export default function ProgressPage() {
  const [byLevel, setByLevel] = useState<Record<JLPTLevel, SavedWord[]>>({
    N5: [], N4: [], N3: [], N2: [], N1: [], unknown: [],
  });

  useEffect(() => { setByLevel(getVocabByJLPT()); }, []);

  const totalSaved   = Object.values(byLevel).flat().length;
  const totalKnown   = LEVELS.reduce((s, l) => s + byLevel[l].length, 0);
  const recentWords  = Object.values(byLevel)
    .flat()
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 5);

  return (
    <div className="min-h-screen pt-16 pb-24">
      <div className="max-w-3xl mx-auto px-4">

        {/* Header */}
        <div className="py-8">
          <div className="flex items-center gap-3 mb-1">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-display text-white">I miei progressi JLPT</h1>
          </div>
          <p className="text-slate-500 text-sm ml-8">
            {totalSaved} parol{totalSaved === 1 ? "a" : "e"} salvat{totalSaved === 1 ? "a" : "e"} in totale
          </p>
        </div>

        {totalSaved === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">📊</p>
            <p className="text-slate-400 text-lg mb-2">Nessun progresso ancora.</p>
            <p className="text-slate-600 text-sm mb-6">
              Inizia salvando parole dai match trovati su YouTube.
            </p>
            <Link href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm hover:bg-amber-500/30 transition-colors">
              Vai alla ricerca
            </Link>
          </div>
        ) : (
          <>
            {/* JLPT Level cards */}
            <div className="space-y-4 mb-10">
              {LEVELS.map((level) => {
                const saved   = byLevel[level].length;
                const total   = JLPT_TOTALS[level];
                const pct     = Math.min(Math.round((saved / total) * 100), 100);
                const color   = JLPT_COLORS[level];

                return (
                  <div key={level}
                    className="rounded-2xl border border-white/5 bg-[#10101e]/60 p-5 flex items-center gap-5">
                    {/* Circle progress */}
                    <div className="relative flex-shrink-0">
                      <CircleProgress pct={pct} color={color} size={72} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold" style={{ color }}>{pct}%</span>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-lg font-bold" style={{ color }}>{level}</span>
                        {pct >= 100 && <Trophy className="w-4 h-4 text-amber-400" />}
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{LEVEL_DESC[level]}</p>

                      {/* Bar */}
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>

                      <p className="text-xs text-slate-600 mt-1.5">
                        <span style={{ color }} className="font-medium">{saved}</span>
                        {" "}/ {total.toLocaleString()} parole
                        {saved > 0 && (
                          <span className="ml-2 text-slate-700">
                            · ultima: <span className="text-slate-500">
                              {byLevel[level][byLevel[level].length - 1]?.word}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Unknown level words */}
              {byLevel.unknown.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-[#10101e]/40 p-4 flex items-center gap-4">
                  <div className="text-2xl text-slate-600">N?</div>
                  <div>
                    <p className="text-sm text-slate-500">
                      <span className="text-white font-medium">{byLevel.unknown.length}</span>
                      {" "}parol{byLevel.unknown.length === 1 ? "a" : "e"} senza livello JLPT
                    </p>
                    <p className="text-xs text-slate-700">Parole fuori dai livelli standard o non trovate in Jisho</p>
                  </div>
                </div>
              )}
            </div>

            {/* Recent additions */}
            {recentWords.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <h2 className="text-sm font-medium text-slate-400">Aggiunte recentemente</h2>
                </div>
                <div className="space-y-2">
                  {recentWords.map((w) => {
                    const color = JLPT_COLORS[w.jlpt as keyof typeof JLPT_COLORS] ?? "#64748b";
                    return (
                      <div key={w.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#10101e]/40 px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-display text-white">{w.word}</span>
                          <span className="text-xs text-slate-500 font-mono">{w.reading}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{w.meanings[0]}</span>
                          <span className="text-[10px] rounded-full px-2 py-px border"
                            style={{ color, borderColor: `${color}44`, backgroundColor: `${color}11` }}>
                            {w.jlpt === "unknown" ? "N?" : w.jlpt}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick link to vocabulary */}
            <div className="text-center">
              <Link href="/vocabulary"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm hover:bg-amber-500/20 transition-colors">
                <BookOpen className="w-4 h-4" />
                Vedi tutto il vocabolario
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
