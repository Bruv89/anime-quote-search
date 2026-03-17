"use client";

import { useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export default function SearchBar({
  value,
  onChange,
  isLoading = false,
  placeholder = "Search in Japanese or Romaji…",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on "/" keypress (like GitHub / VS Code)
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
    <div className="relative border-glow rounded-2xl bg-ink-800/80 backdrop-blur-md transition-all">
      {/* Search icon */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
        {isLoading ? (
          <div className="w-5 h-5 rounded-full border-2 border-violet-400/30 border-t-violet-400 animate-spin" />
        ) : (
          <Search className="w-5 h-5 text-violet-400/60" />
        )}
      </div>

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="
          w-full bg-transparent text-white placeholder:text-slate-500
          pl-12 pr-12 py-4 text-lg rounded-2xl outline-none
          font-body caret-violet-400
        "
      />

      {/* Clear button */}
      {value && (
        <button
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="
            absolute right-4 top-1/2 -translate-y-1/2
            text-slate-500 hover:text-slate-300 transition-colors
          "
          aria-label="Clear search"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Keyboard hint */}
      {!value && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:flex items-center">
          <kbd className="text-xs text-slate-600 border border-slate-700 rounded px-1.5 py-0.5 font-mono">
            /
          </kbd>
        </div>
      )}
    </div>
  );
}
