"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSearch, BookOpen, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { getVocabulary } from "@/lib/vocabulary";

const LINKS = [
  { href: "/",           icon: FileSearch,  label: "Cerca"       },
  { href: "/vocabulary", icon: BookOpen,    label: "Vocabolario" },
  { href: "/progress",   icon: TrendingUp,  label: "Progressi"   },
];

export default function NavBar() {
  const path = usePathname();
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    setWordCount(getVocabulary().length);
    const handler = () => setWordCount(getVocabulary().length);
    window.addEventListener("kotoba_vocab_change", handler);
    return () => window.removeEventListener("kotoba_vocab_change", handler);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#050508]/80 backdrop-blur-md">
      <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-12">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500 to-red-500 flex items-center justify-center">
            <FileSearch className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-mono text-slate-400 tracking-widest uppercase hidden sm:block">
            Kotoba
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-1">
          {LINKS.map(({ href, icon: Icon, label }) => {
            const active = path === href;
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  active
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:block">{label}</span>
                {/* Badge for vocabulary count */}
                {href === "/vocabulary" && wordCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-px rounded-full bg-amber-500/20 text-amber-300 text-[10px]">
                    {wordCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
