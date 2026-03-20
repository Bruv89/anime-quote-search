"use client";

import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, isLoading = false, placeholder }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") inputRef.current?.blur();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="relative border border-white/10 rounded-2xl bg-[#10101e]/80 backdrop-blur-md transition-all focus-within:border-amber-500/50 focus-within:shadow-[0_0_30px_rgba(245,158,11,0.15)]">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        {isLoading ? (
          <div className="w-5 h-5 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
        ) : (
          <Search className="w-5 h-5 text-amber-400/50" />
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search in Japanese or Romaji…"}
        autoComplete="off"
        spellCheck={false}
        className="w-full bg-transparent text-white placeholder:text-slate-600 pl-12 pr-12 py-4 text-lg rounded-2xl outline-none caret-amber-400"
      />

      {value ? (
        <button
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Clear"
        >
          <X className="w-4 h-4" />
        </button>
      ) : (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:block">
          <kbd className="text-xs text-slate-700 border border-slate-800 rounded px-1.5 py-0.5 font-mono">/</kbd>
        </div>
      )}
    </div>
  );
}
