/**
 * src/lib/vocabulary.ts
 * Client-side localStorage vocabulary storage.
 * All functions check for SSR safety.
 */

export type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1" | "unknown";
export type Frequency  = "very_common" | "common" | "uncommon" | "rare";

export interface Example {
  ja: string;
  en: string;
}

export interface WordInfo {
  word:          string;       // kanji or kana form
  reading:       string;       // hiragana reading
  romaji:        string;       // romaji
  meanings:      string[];     // English meanings
  jlpt:          JLPTLevel;
  isCommon:      boolean;
  frequency:     Frequency;
  partsOfSpeech: string[];
  examples:      Example[];
}

export interface SavedWord extends WordInfo {
  id:               string;
  savedAt:          number;
  sourceVideoId?:   string;
  sourceVideoTitle?: string;
  sourceMatchText?: string;
}

const KEY = "kotoba_vocabulary";

function isBrowser() { return typeof window !== "undefined"; }

export function getVocabulary(): SavedWord[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedWord[]) : [];
  } catch { return []; }
}

export function saveWord(
  word: WordInfo,
  source?: { videoId: string; videoTitle: string; matchText: string }
): { saved: boolean; word: SavedWord } {
  const vocab = getVocabulary();
  const existing = vocab.find((w) => w.word === word.word);
  if (existing) return { saved: false, word: existing };

  const saved: SavedWord = {
    ...word,
    id:               `${word.word}_${Date.now()}`,
    savedAt:          Date.now(),
    sourceVideoId:    source?.videoId,
    sourceVideoTitle: source?.videoTitle,
    sourceMatchText:  source?.matchText,
  };

  vocab.push(saved);
  if (isBrowser()) localStorage.setItem(KEY, JSON.stringify(vocab));
  return { saved: true, word: saved };
}

export function deleteWord(id: string): void {
  if (!isBrowser()) return;
  const vocab = getVocabulary().filter((w) => w.id !== id);
  localStorage.setItem(KEY, JSON.stringify(vocab));
}

export function isWordSaved(word: string): boolean {
  return getVocabulary().some((w) => w.word === word);
}

export function getVocabByJLPT(): Record<JLPTLevel, SavedWord[]> {
  const vocab = getVocabulary();
  const out: Record<JLPTLevel, SavedWord[]> = {
    N5: [], N4: [], N3: [], N2: [], N1: [], unknown: [],
  };
  for (const w of vocab) out[w.jlpt].push(w);
  return out;
}

// Approximate total words per JLPT level (widely cited estimates)
export const JLPT_TOTALS: Record<Exclude<JLPTLevel, "unknown">, number> = {
  N5: 800,
  N4: 1500,
  N3: 3750,
  N2: 6000,
  N1: 10000,
};

export const JLPT_COLORS: Record<Exclude<JLPTLevel, "unknown">, string> = {
  N5: "#22c55e",  // green
  N4: "#3b82f6",  // blue
  N3: "#f59e0b",  // amber
  N2: "#f97316",  // orange
  N1: "#ef4444",  // red
};
