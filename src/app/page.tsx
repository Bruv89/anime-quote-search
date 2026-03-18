"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SearchBar from "@/components/SearchBar";
import QuoteCard from "@/components/QuoteCard";
import YouTubeCard from "@/components/YouTubeCard";
import { type SearchResponse } from "@/app/api/search/route";
import { type YouTubeResponse } from "@/app/api/youtube/route";
import { Sparkles, Database, Youtube } from "lucide-react";

const DEBOUNCE_MS = 400;

// ── Skeleton loaders ─────────────────────────────────────────────────────────

function QuoteSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="border border-white/5 rounded-xl p-5 space-y-3" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex gap-2">
        <div className="skeleton h-5 w-36 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
      <div className="skeleton h-7 w-full rounded" />
      <div className="skeleton h-4 w-3/4 rounded" />
    </div>
  );
}

function YouTubeSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex gap-4 border border-white/5 rounded-xl p-3" style={{ animationDelay: `${delay}ms` }}>
      <div className="skeleton w-36 h-20 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function Tab({
  active,
  onClick,
  icon,
  label,
  count,
  color = "violet",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
  color?: "violet" | "red";
}) {
  const activeClass =
    color === "red"
      ? "border-red-500/50 text-red-300 bg-red-500/10"
      : "border-violet-500/50 text-violet-300 bg-violet-500/10";
  const inactiveClass =
    "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20";

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
        active ? activeClass : inactiveClass
      }`}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full ${
            active
              ? color === "red"
                ? "bg-red-500/20 text-red-300"
                : "bg-violet-500/20 text-violet-300"
              : "bg-white/10 text-slate-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"quotes" | "youtube">("quotes");

  // Local quotes state
  const [quotesData, setQuotesData] = useState<SearchResponse | null>(null);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // YouTube state
  const [ytData, setYtData] = useState<YouTubeResponse | null>(null);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const LIMIT = 12;

  // ── Fetchers ──────────────────────────────────────────────────────────────

  const fetchQuotes = useCallback(async (q: string, offset = 0) => {
    if (!q.trim()) {
      setQuotesData(null);
      setQuotesError(null);
      return;
    }
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=${LIMIT}&offset=${offset}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setQuotesData(json);
    } catch (e) {
      setQuotesError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  const fetchYouTube = useCallback(async (q: string) => {
    if (!q.trim()) {
      setYtData(null);
      setYtError(null);
      return;
    }
    setYtLoading(true);
    setYtError(null);
    try {
      const res = await fetch(
        `/api/youtube?q=${encodeURIComponent(q)}&maxResults=8`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "YouTube search failed");
      setYtData(json);
    } catch (e) {
      setYtError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setYtLoading(false);
    }
  }, []);

  // ── Debounced trigger ─────────────────────────────────────────────────────

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPage(0);
    timerRef.current = setTimeout(() => {
      fetchQuotes(query, 0);
      fetchYouTube(query);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, fetchQuotes, fetchYouTube]);

  // Auto-scroll to results
  useEffect(() => {
    if ((quotesData || ytData) && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [quotesData, ytData]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchQuotes(query, newPage * LIMIT);
  };

  const hasQuery = query.trim().length > 0;
  const hasQuotes = quotesData && quotesData.results.length > 0;
  const hasVideos = ytData && ytData.results.length > 0;
  const totalPages = quotesData ? Math.ceil(quotesData.total / LIMIT) : 0;

  return (
    <main className="min-h-screen flex flex-col">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className={`flex flex-col items-center justify-center text-center px-4 transition-all duration-500 ${
          hasQuery ? "pt-14 pb-6" : "flex-1 py-24"
        }`}
      >
        {/* Logo mark */}
        <div className="flex items-center gap-2 mb-5 fade-up">
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
            fontSize: hasQuery ? "2rem" : "clamp(2.5rem, 7vw, 5rem)",
            lineHeight: 1.15,
          }}
        >
          言葉を探せ
        </h1>

        {!hasQuery && (
          <p
            className="text-slate-400 text-lg mb-10 fade-up max-w-md"
            style={{ animationDelay: "120ms" }}
          >
            Search anime quotes — in Japanese{" "}
            <span className="text-violet-400">or</span> Romaji.
            <br />
            <span className="text-sm text-slate-500">
              Find matching videos on YouTube too.
            </span>
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
            isLoading={quotesLoading || ytLoading}
            placeholder="e.g. ありがとう, arigato, 等価交換…"
          />
        </div>

        {/* Quick chips */}
        {!hasQuery && (
          <div
            className="flex flex-wrap justify-center gap-3 mt-8 fade-up"
            style={{ animationDelay: "240ms" }}
          >
            {[
              { label: "等価交換", hint: "FMA Brotherhood" },
              { label: "ありがとう", hint: "grazie" },
              { label: "夢を見ていた", hint: "Cowboy Bebop" },
              { label: "働く", hint: "Spirited Away" },
            ].map((chip) => (
              <button
                key={chip.label}
                onClick={() => setQuery(chip.label)}
                className="group px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02] hover:border-violet-500/30 hover:bg-violet-500/5 transition-all text-xs text-left"
              >
                <span className="text-slate-500 block">{chip.hint}</span>
                <span className="text-slate-300 font-mono group-hover:text-violet-300 transition-colors">
                  {chip.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Result summary line */}
        {hasQuery && (
          <p className="text-slate-500 text-xs mt-3 fade-up">
            {quotesData?.total
              ? `${quotesData.total} quote${quotesData.total !== 1 ? "s" : ""} in database`
              : quotesLoading
              ? "searching…"
              : "no local quotes found"}
            {ytData?.results.length
              ? ` · ${ytData.results.length} YouTube videos`
              : ""}
          </p>
        )}
      </section>

      {/* ── Results area ──────────────────────────────────────────────────── */}
      {hasQuery && (
        <section
          ref={resultsRef}
          className="flex-1 w-full max-w-3xl mx-auto px-4 pb-24"
        >
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <Tab
              active={activeTab === "quotes"}
              onClick={() => setActiveTab("quotes")}
              icon={<Database className="w-4 h-4" />}
              label="Local Quotes"
              count={quotesData?.total}
              color="violet"
            />
            <Tab
              active={activeTab === "youtube"}
              onClick={() => setActiveTab("youtube")}
              icon={<Youtube className="w-4 h-4" />}
              label="YouTube"
              count={ytData?.results.length}
              color="red"
            />
          </div>

          {/* ── LOCAL QUOTES TAB ────────────────────────────────────────── */}
          {activeTab === "quotes" && (
            <>
              {quotesLoading && !hasQuotes && (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <QuoteSkeleton key={i} delay={i * 80} />
                  ))}
                </div>
              )}

              {quotesError && (
                <div className="fade-up rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
                  ⚠️ {quotesError}
                </div>
              )}

              {!quotesLoading &&
                quotesData &&
                quotesData.results.length === 0 && (
                  <div className="text-center py-16 fade-up">
                    <p className="text-4xl mb-3">探偵</p>
                    <p className="text-slate-400">
                      No quotes found for{" "}
                      <span className="text-violet-300 font-mono">
                        "{query}"
                      </span>
                    </p>
                    <p className="text-slate-600 text-sm mt-1">
                      Try the YouTube tab to find videos.
                    </p>
                  </div>
                )}

              {hasQuotes && (
                <>
                  <div className="space-y-4">
                    {quotesData.results.map((result, i) => (
                      <QuoteCard
                        key={result.quoteId}
                        result={result}
                        index={i}
                        query={query}
                      />
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-10">
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
            </>
          )}

          {/* ── YOUTUBE TAB ─────────────────────────────────────────────── */}
          {activeTab === "youtube" && (
            <>
              {ytLoading && !hasVideos && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <YouTubeSkeleton key={i} delay={i * 60} />
                  ))}
                </div>
              )}

              {ytError && (
                <div className="fade-up rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm space-y-1">
                  <p className="text-red-300 font-medium">⚠️ YouTube error</p>
                  <p className="text-red-400/70">{ytError}</p>
                  {ytError.includes("YOUTUBE_API_KEY") && (
                    <p className="text-slate-500 text-xs mt-2">
                      Add{" "}
                      <code className="bg-white/5 px-1 rounded">
                        YOUTUBE_API_KEY=your_key
                      </code>{" "}
                      to your{" "}
                      <code className="bg-white/5 px-1 rounded">
                        .env.local
                      </code>{" "}
                      file and restart the dev server.
                    </p>
                  )}
                </div>
              )}

              {!ytLoading &&
                ytData &&
                ytData.results.length === 0 &&
                !ytError && (
                  <div className="text-center py-16 fade-up">
                    <p className="text-4xl mb-3">📺</p>
                    <p className="text-slate-400">
                      No YouTube results for{" "}
                      <span className="text-red-300 font-mono">"{query}"</span>
                    </p>
                  </div>
                )}

              {hasVideos && (
                <>
                  <p className="text-xs text-slate-600 mb-4 fade-up">
                    Results for{" "}
                    <span className="font-mono text-slate-500">
                      "{query} anime"
                    </span>{" "}
                    — click any card to watch on YouTube.
                  </p>
                  <div className="space-y-3">
                    {ytData.results.map((video, i) => (
                      <YouTubeCard key={video.videoId} video={video} index={i} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-5 text-center">
        <p className="text-slate-600 text-xs font-mono">
          Local search · SQLite FTS5 · YouTube Data API v3
        </p>
      </footer>
    </main>
  );
}
