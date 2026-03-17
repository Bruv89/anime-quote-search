"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SearchBar from "@/components/SearchBar";
import QuoteCard from "@/components/QuoteCard";
import { type SearchResponse } from "@/app/api/search/route";
import { Sparkles, Github, ChevronDown } from "lucide-react";

const DEBOUNCE_MS = 320;

// ── Skeleton loader ─────────────────────────────────────────────────────────
function SkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="border border-white/5 rounded-xl p-5 space-y-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex gap-2">
        <div className="skeleton h-5 w-36 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="skeleton h-7 w-full rounded" />
      <div className="skeleton h-4 w-3/4 rounded" />
    </div>
  );
}

// ── Empty / no-results state ────────────────────────────────────────────────
function EmptyState({ query }: { query: string }) {
  return (
    <div className="text-center py-20 fade-up">
      <p className="text-5xl mb-4">探偵</p>
      <p className="text-slate-400 text-lg">
        No quotes found for{" "}
        <span className="text-violet-300 font-mono">"{query}"</span>
      </p>
      <p className="text-slate-600 text-sm mt-2">
        Try different keywords, or check your spelling.
      </p>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const LIMIT = 12;

  const fetchResults = useCallback(
    async (q: string, offset = 0) => {
      if (!q.trim()) {
        setData(null);
        setError(null);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=${offset}`
        );
        const json: SearchResponse & { error?: string } = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Search failed");
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Debounce the query
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPage(0);
    timerRef.current = setTimeout(() => fetchResults(query, 0), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, fetchResults]);

  // Scroll to results when they appear
  useEffect(() => {
    if (data && data.results.length > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [data]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchResults(query, newPage * LIMIT);
  };

  const hasResults = data && data.results.length > 0;
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
  const isInitial = !query.trim() && !data;

  return (
    <main className="min-h-screen flex flex-col">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        className={`
          flex flex-col items-center justify-center text-center px-4
          transition-all duration-500 ease-in-out
          ${hasResults ? "pt-16 pb-8" : "flex-1 py-24"}
        `}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-2 mb-6 fade-up">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-mono text-slate-400 tracking-widest uppercase">
            Kotoba Search
          </span>
        </div>

        {/* Title */}
        <h1
          className="font-display text-gradient mb-2 fade-up"
          style={{
            animationDelay: "60ms",
            fontSize: hasResults ? "2rem" : "clamp(2.5rem, 7vw, 5rem)",
            lineHeight: 1.15,
          }}
        >
          言葉を探せ
        </h1>
        {!hasResults && (
          <p
            className="text-slate-400 text-lg mb-10 fade-up max-w-md"
            style={{ animationDelay: "120ms" }}
          >
            Search exact quotes from anime — in Japanese{" "}
            <span className="text-violet-400">or</span> Romaji.
          </p>
        )}

        {/* Search bar */}
        <div
          className="w-full max-w-2xl fade-up"
          style={{ animationDelay: "180ms" }}
        >
          <SearchBar
            value={query}
            onChange={setQuery}
            isLoading={isLoading}
            placeholder="e.g. ありがとう, arigato, 等価交換…"
          />
        </div>

        {/* Stats / hints */}
        {isInitial && (
          <div
            className="flex flex-wrap justify-center gap-4 mt-8 fade-up"
            style={{ animationDelay: "240ms" }}
          >
            {[
              { label: "Fullmetal Alchemist: Brotherhood", jp: "鋼の錬金術師" },
              { label: "Cowboy Bebop", jp: "カウボーイビバップ" },
              { label: "Spirited Away", jp: "千と千尋の神隠し" },
            ].map((anime) => (
              <button
                key={anime.label}
                onClick={() => setQuery(anime.jp)}
                className="
                  group text-left px-3 py-2 rounded-lg
                  border border-white/5 bg-white/[0.02]
                  hover:border-violet-500/30 hover:bg-violet-500/5
                  transition-all text-xs
                "
              >
                <span className="text-slate-500 block">Try</span>
                <span className="text-slate-300 font-mono group-hover:text-violet-300 transition-colors">
                  {anime.jp}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Result count */}
        {data && (
          <p className="text-slate-500 text-sm mt-4 fade-up">
            {data.total === 0
              ? "No results"
              : `${data.total.toLocaleString()} quote${data.total !== 1 ? "s" : ""} found`}
            {data.normalizedQuery !== data.query && (
              <span className="ml-2 text-violet-400/70">
                (searched as "{data.normalizedQuery}")
              </span>
            )}
          </p>
        )}
      </section>

      {/* ── Results ──────────────────────────────────────────────────── */}
      <section
        ref={resultsRef}
        className="flex-1 w-full max-w-3xl mx-auto px-4 pb-24"
      >
        {/* Error */}
        {error && (
          <div className="fade-up rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Skeleton while loading */}
        {isLoading && !hasResults && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 80} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && data && data.results.length === 0 && (
          <EmptyState query={query} />
        )}

        {/* Quote cards */}
        {hasResults && (
          <>
            <div className="space-y-4">
              {data.results.map((result, i) => (
                <QuoteCard
                  key={result.quoteId}
                  result={result}
                  index={i}
                  query={query}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10 fade-up">
                <button
                  disabled={page === 0}
                  onClick={() => handlePageChange(page - 1)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  ← Prev
                </button>
                <span className="text-slate-500 text-sm px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => handlePageChange(page + 1)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:border-violet-500/40 hover:text-violet-300 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-6 text-center">
        <p className="text-slate-600 text-xs font-mono">
          Text-only · No video · No copyright infringement ·{" "}
          <span className="text-violet-800">MVP</span>
        </p>
      </footer>
    </main>
  );
}
