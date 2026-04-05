"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SearchBar from "@/components/SearchBar";
import TranscriptCard from "@/components/TranscriptCard";
import { type TranscriptSearchResponse } from "@/app/api/transcript/route";
import { FileSearch, Youtube } from "lucide-react";

const DEBOUNCE_MS = 600;

function Skeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="border border-white/5 rounded-2xl p-4 space-y-3 bg-[#10101e]/60"
      style={{ animationDelay: `${delay}ms` }}>
      <div className="flex gap-3">
        <div className="skeleton w-32 h-[72px] rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-3 w-1/2 rounded" />
          <div className="skeleton h-5 w-24 rounded-full" />
        </div>
      </div>
      <div className="skeleton h-20 w-full rounded-xl" />
    </div>
  );
}

function VariantPills({ variants }: { variants: string[] }) {
  if (!variants.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 fade-up">
      <span>Searched as:</span>
      {variants.map((v) => (
        <span key={v} className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono">
          {v}
        </span>
      ))}
    </div>
  );
}

const EXAMPLE_QUERIES = [
  { label: "ありがとう",        hint: "grazie" },
  { label: "諦めたらそこで",    hint: "Slam Dunk" },
  { label: "逃げちゃダメだ",   hint: "Evangelion" },
  { label: "arigato",          hint: "romaji" },
  { label: "nakama",           hint: "compagni" },
  { label: "頑張れ",           hint: "forza" },
];

type FilterType = "all" | "dialogue" | "extended";

export default function HomePage() {
  const [query,   setQuery]   = useState("");
  const [data,    setData]    = useState<TranscriptSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [phase,   setPhase]   = useState<"idle" | "searching" | "done">("idle");
  const [filter,  setFilter]  = useState<FilterType>("all");

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const fetchResults = useCallback(async (q: string) => {
    if (!q.trim()) { setData(null); setError(null); setPhase("idle"); return; }
    setLoading(true); setError(null); setPhase("searching");
    try {
      const res  = await fetch(`/api/transcript?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setData(json);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("done");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setData(null); setPhase("idle"); setFilter("all"); return; }
    timerRef.current = setTimeout(() => fetchResults(query), DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, fetchResults]);

  // Reset filter when new results arrive
  useEffect(() => { setFilter("all"); }, [data]);

  useEffect(() => {
    if (data && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data]);

  const hasQuery   = query.trim().length > 0;
  const hasResults = data && data.results.length > 0;

  // Derived counts
  const dialogueCount = data?.results.filter((r) => r.tier === "dialogue").length ?? 0;
  const extendedCount = data?.results.filter((r) => r.tier === "extended").length ?? 0;

  // Filtered results
  const visibleDialogue = !hasResults ? [] :
    filter === "extended" ? [] : data.results.filter((r) => r.tier === "dialogue");
  const visibleExtended = !hasResults ? [] :
    filter === "dialogue" ? [] : data.results.filter((r) => r.tier === "extended");

  return (
    <main className="min-h-screen flex flex-col">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className={`flex flex-col items-center justify-center text-center px-4 transition-all duration-500 ${hasQuery ? "pt-12 pb-6" : "flex-1 py-24"}`}>
        <div className="flex items-center gap-2 mb-5 fade-up">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center shadow-lg">
            <FileSearch className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-mono text-slate-400 tracking-widest uppercase">Kotoba Search</span>
        </div>

        <h1 className="font-display mb-2 fade-up" style={{
          animationDelay: "60ms",
          fontSize: hasQuery ? "2rem" : "clamp(2.5rem, 7vw, 5rem)",
          lineHeight: 1.15,
          background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 40%, #ef4444 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
        }}>言葉を探せ</h1>

        {!hasQuery && (
          <>
            <p className="text-slate-400 text-lg mb-2 fade-up max-w-lg" style={{ animationDelay: "120ms" }}>
              Scrivi una frase in <span className="text-amber-400">Giapponese</span> o <span className="text-amber-400">Romaji</span>.
            </p>
            <p className="text-slate-500 text-sm mb-10 fade-up flex items-center gap-2" style={{ animationDelay: "150ms" }}>
              <Youtube className="w-4 h-4 text-red-500" />
              Troveremo il momento esatto nei video anime su YouTube.
            </p>
          </>
        )}

        <div className="w-full max-w-2xl fade-up" style={{ animationDelay: "180ms" }}>
          <SearchBar value={query} onChange={setQuery} isLoading={loading}
            placeholder="es. ありがとう, arigato, nakama, 諦めたら…" />
        </div>

        {!hasQuery && (
          <div className="flex flex-wrap justify-center gap-2 mt-7 fade-up" style={{ animationDelay: "240ms" }}>
            {EXAMPLE_QUERIES.map((chip) => (
              <button key={chip.label} onClick={() => setQuery(chip.label)}
                className="group px-3 py-1.5 rounded-lg border border-white/5 bg-white/[0.02] hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-xs text-left">
                <span className="text-slate-500 block text-[10px]">{chip.hint}</span>
                <span className="text-slate-300 font-mono group-hover:text-amber-300 transition-colors">{chip.label}</span>
              </button>
            ))}
          </div>
        )}

        {hasQuery && (
          <div className="mt-3 fade-up text-xs text-slate-500">
            {phase === "searching" && <span className="text-amber-400/70 animate-pulse">⚡ Scansione trascrizioni in corso…</span>}
            {phase === "done" && data && (
              <span>
                {data.videosMatched > 0
                  ? `✓ ${data.videosMatched} video trovati su ${data.videosChecked} analizzati`
                  : `Nessun match in ${data.videosChecked} video analizzati`}
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {hasQuery && (
        <section ref={resultsRef} className="flex-1 w-full max-w-3xl mx-auto px-4 pb-24 space-y-5">

          {/* Variants */}
          {data && data.searchVariants.length > 1 && (
            <VariantPills variants={data.searchVariants} />
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-4">
              <p className="text-xs text-center text-slate-600 animate-pulse py-2">Recupero trascrizioni da YouTube…</p>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} delay={i * 120} />)}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="fade-up rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
              <p className="text-red-300 font-medium">⚠️ Errore</p>
              <p className="text-red-400/70 mt-1">{error}</p>
            </div>
          )}

          {/* No results */}
          {!loading && data && data.results.length === 0 && !error && (
            <div className="text-center py-20 fade-up">
              <p className="text-5xl mb-4">🎌</p>
              <p className="text-slate-400 text-lg">Nessun match per <span className="text-amber-300 font-mono">"{query}"</span></p>
              <p className="text-slate-600 text-sm mt-2">Prova con una frase diversa o controlla l&apos;ortografia.</p>
            </div>
          )}

          {/* ── Filter bar ─────────────────────────────────────────────── */}
          {hasResults && !loading && (
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  { value: "all"      as FilterType, label: "Tutti",              count: data.results.length, icon: "🔍", color: "text-slate-300  border-slate-500/50  bg-slate-500/10"  },
                  { value: "dialogue" as FilterType, label: "Anime · Dialoghi",   count: dialogueCount,       icon: "🎭", color: "text-green-300  border-green-500/50  bg-green-500/10"  },
                  { value: "extended" as FilterType, label: "Canzoni · AMV",      count: extendedCount,       icon: "🎵", color: "text-purple-300 border-purple-500/50 bg-purple-500/10" },
                ] as const
              ).filter((btn) => btn.count > 0 || btn.value === "all").map((btn) => (
                <button key={btn.value} onClick={() => setFilter(btn.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    filter === btn.value
                      ? btn.color
                      : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
                  }`}>
                  <span>{btn.icon}</span>
                  <span>{btn.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === btn.value ? "bg-white/15" : "bg-white/5"}`}>
                    {btn.count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ── Tier 1: dialogue ────────────────────────────────────────── */}
          {hasResults && visibleDialogue.length > 0 && (
            <div className="space-y-4">
              {visibleDialogue.map((result, i) => (
                <TranscriptCard key={result.videoId} result={result} index={i}
                  query={query} searchVariants={data.searchVariants} />
              ))}
            </div>
          )}

          {/* ── Tier 2: extended (songs/AMV) ────────────────────────────── */}
          {hasResults && visibleExtended.length > 0 && (
            <div className={visibleDialogue.length > 0 ? "mt-4" : ""}>
              {/* Divider shown only when both tiers visible */}
              {visibleDialogue.length > 0 && filter === "all" && (
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-white/5" />
                  <p className="text-xs text-slate-600 font-mono px-2">Canzoni · AMV · Compilation</p>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              )}

              {/* Banner only when NO dialogue results exist */}
              {visibleDialogue.length === 0 && filter !== "extended" && (
                <div className="mb-5 rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3 text-xs text-amber-400/70 font-mono leading-relaxed text-center">
                  Nessun match trovato in clip anime con dialoghi.<br />
                  Contenuto correlato trovato (canzoni, AMV, compilation).
                </div>
              )}

              <div className={`space-y-4 ${filter !== "extended" && visibleDialogue.length > 0 ? "opacity-75" : ""}`}>
                {visibleExtended.map((result, i) => (
                  <TranscriptCard key={result.videoId} result={result}
                    index={visibleDialogue.length + i}
                    query={query} searchVariants={data.searchVariants} />
                ))}
              </div>
            </div>
          )}

          {/* Empty filter state */}
          {hasResults && visibleDialogue.length === 0 && visibleExtended.length === 0 && (
            <div className="text-center py-10 fade-up">
              <p className="text-slate-500 text-sm">Nessun risultato per il filtro selezionato.</p>
            </div>
          )}
        </section>
      )}

      <footer className="border-t border-white/5 py-5 text-center">
        <p className="text-slate-700 text-xs font-mono">YouTube Data API v3 · youtube-transcript · wanakana · kuromoji</p>
      </footer>
    </main>
  );
}
