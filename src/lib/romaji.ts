/**
 * src/lib/romaji.ts
 *
 * Romaji ↔ Japanese conversion + multi-level fuzzy matching engine.
 *
 * Matching levels (applied in cascade, fastest first):
 *   1. Exact substring   — "gomen"   in "gomennasai"          score: 100
 *   2. Prefix match      — "gomen"   prefix of word "gomennasai" score: 85
 *   3. Levenshtein fuzzy — "arigto"  ~ "arigato" (≥80% sim)   score: 70+
 *
 * The score is returned so callers can rank results by match quality.
 */

import * as wanakana from "wanakana";

// ─── Language detection ───────────────────────────────────────────────────────

export function containsJapanese(text: string): boolean {
  return /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(text);
}

export function isRomaji(text: string): boolean {
  return /^[\x00-\x7F\s]+$/.test(text.trim());
}

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize for matching: lowercase, strip punctuation, collapse spaces.
 * Also converts long vowel marks (ā→a, ō→o, ū→u) for romaji tolerance.
 */
export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[āâ]/g, "a").replace(/[ōô]/g, "o").replace(/[ūû]/g, "u")
    .replace(/[īî]/g, "i").replace(/[ēê]/g, "e")
    .replace(/[！。、…「」『』・【】（）\[\]().,!?'"ー～〜\-_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Levenshtein distance ─────────────────────────────────────────────────────

/**
 * Standard Levenshtein edit distance between two strings.
 * O(n·m) time and O(min(n,m)) space.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use the shorter string as the column to save memory
  if (a.length > b.length) [a, b] = [b, a];

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr = new Array(a.length + 1).fill(0);

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,       // deletion
        curr[i - 1] + 1,   // insertion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

/**
 * Similarity score [0, 1] based on Levenshtein.
 * 1.0 = identical, 0.0 = completely different.
 */
export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// ─── Match result ─────────────────────────────────────────────────────────────

export interface MatchResult {
  /** The variant that matched (e.g. "ありがとう" when user typed "arigato") */
  matchedVariant: string;
  /** 100=exact substring, 85=prefix, 70-99=fuzzy */
  score: number;
  /** Human-readable match type */
  type: "exact" | "prefix" | "fuzzy";
}

// ─── Core matching logic ──────────────────────────────────────────────────────

const FUZZY_THRESHOLD = 0.78; // minimum similarity to count as a fuzzy match
const MIN_FUZZY_LEN   = 4;    // don't fuzzy-match very short strings (too many false positives)

/**
 * Try to match `text` against all `variants`.
 * Returns the best MatchResult or null if no match found.
 *
 * Levels:
 *   1. Exact substring:  normalizedText includes normalizedVariant
 *      → also catches "gomen" inside "gomennasai" ✓
 *   2. Prefix match:     any whitespace-separated token in the text starts with the variant
 *      → catches "gomen" as prefix of "gomennasai" when punctuation splits things
 *   3. Fuzzy word match: any token in the text has similarity ≥ FUZZY_THRESHOLD with the variant
 *      → catches typos like "arigto" → "arigato"
 */
export function matchText(text: string, variants: string[]): MatchResult | null {
  const nText = norm(text);
  if (!nText) return null;

  let best: MatchResult | null = null;

  for (const variant of variants) {
    const nVariant = norm(variant);
    if (!nVariant) continue;

    // ── Level 1: exact substring ─────────────────────────────────────────────
    if (nText.includes(nVariant)) {
      return { matchedVariant: variant, score: 100, type: "exact" };
    }

    // ── Level 2: prefix match ────────────────────────────────────────────────
    // Split text into tokens (works for both romaji and Japanese where
    // there are no spaces, so the whole string is one "word")
    const tokens = nText.split(/\s+/);
    const prefixMatch = tokens.some((token) => token.startsWith(nVariant));
    if (prefixMatch) {
      const candidate: MatchResult = { matchedVariant: variant, score: 85, type: "prefix" };
      if (!best || candidate.score > best.score) best = candidate;
      continue; // still check other variants for exact match
    }

    // ── Level 3: fuzzy word match ────────────────────────────────────────────
    if (nVariant.length >= MIN_FUZZY_LEN) {
      let bestSim = 0;
      for (const token of tokens) {
        if (Math.abs(token.length - nVariant.length) > 3) continue; // quick length filter
        const sim = similarity(nVariant, token);
        if (sim > bestSim) bestSim = sim;
      }

      // Also try similarity against the whole normalized text for short phrases
      if (nText.length <= nVariant.length * 2) {
        const wholeSim = similarity(nVariant, nText);
        if (wholeSim > bestSim) bestSim = wholeSim;
      }

      if (bestSim >= FUZZY_THRESHOLD) {
        const score = 70 + Math.round(bestSim * 29); // 70–99 range
        const candidate: MatchResult = { matchedVariant: variant, score, type: "fuzzy" };
        if (!best || candidate.score > best.score) best = candidate;
      }
    }
  }

  return best;
}

// ─── Search variant builder ───────────────────────────────────────────────────

/**
 * Given a user query, build all variants to search against transcripts.
 *
 * Examples:
 *   "arigato"    → ["arigato", "ありがと", "アリガト", "arigatou", "ありがとう"]
 *   "ありがとう"  → ["ありがとう", "arigatou", "アリガトウ", "ありがと"]
 *   "等価交換"   → ["等価交換", "toukakoukan"]
 */
export function buildSearchVariants(query: string): string[] {
  const q = query.trim();
  if (!q) return [];

  const variants = new Set<string>();
  variants.add(q);

  if (isRomaji(q)) {
    // Convert to kana — only add if result is pure kana (no leftover latin chars)
    const hira = wanakana.toHiragana(q);
    const kata = wanakana.toKatakana(q);
    const pureKana = (s: string) => !/[a-zA-Z]/.test(s);
    if (hira !== q && pureKana(hira)) variants.add(hira);
    if (kata !== q && pureKana(kata)) variants.add(kata);

    // Long vowel variants: "ou"→"o", "uu"→"u"
    const simplified = q.replace(/ou/gi, "o").replace(/uu/gi, "u");
    if (simplified !== q) {
      variants.add(simplified);
      const hiraSimp = wanakana.toHiragana(simplified);
      const kataSimp = wanakana.toKatakana(simplified);
      if (hiraSimp !== simplified) variants.add(hiraSimp);
      if (kataSimp !== simplified) variants.add(kataSimp);
    }


  } else if (containsJapanese(q)) {
    // Japanese input: add romaji and alternate script
    const romaji = wanakana.toRomaji(q, { convertLongVowelMark: true });
    if (romaji !== q) variants.add(romaji);

    if (wanakana.isHiragana(q)) {
      variants.add(wanakana.toKatakana(q));
    } else if (wanakana.isKatakana(q)) {
      variants.add(wanakana.toHiragana(q));
    }
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * Build multiple YouTube search query strings from one user query.
 * Running these in parallel gives 3x more candidate videos.
 */
export function buildYouTubeQueries(query: string): string[] {
  // Build the maximum useful set of YouTube query strings.
  // youtube.ts appends "アニメ" to each one automatically.
  //
  // Why we need multiple scripts:
  //   "くいだおれ アニメ"  → YouTube finds hiragana matches
  //   "クイダオレ アニメ"  → YouTube finds katakana matches  
  //   "食い倒れ アニメ"   → YouTube finds kanji matches (not derivable from kana alone)
  //   "kuidaore アニメ"   → romaji fallback for English-titled channels
  //
  // We can't convert hiragana→kanji (that's a different problem), so we
  // send all the kana/romaji variants we have and let YouTube handle the rest.

  const set = new Set<string>();

  const pureKana = (s: string) => !/[a-zA-Z]/.test(s);

  if (isRomaji(query)) {
    // Romaji → kana first (YouTube understands kana better than romaji for Japanese content)
    const hira = wanakana.toHiragana(query);
    const kata = wanakana.toKatakana(query);
    if (hira !== query && pureKana(hira)) set.add(hira);
    if (kata !== query && pureKana(kata)) set.add(kata);
    set.add(query); // romaji last
  } else if (containsJapanese(query)) {
    set.add(query); // original first (kanji/mixed most specific for YouTube)

    if (wanakana.isKatakana(query)) {
      // Katakana → also search hiragana and romaji
      set.add(wanakana.toHiragana(query));
      const r = wanakana.toRomaji(query, { convertLongVowelMark: true });
      if (r !== query) set.add(r);
    } else if (wanakana.isHiragana(query)) {
      // Hiragana → also search katakana and romaji
      // NOTE: YouTube's index sometimes contains kanji versions of the word.
      // We can't convert hiragana→kanji, but romaji often maps to kanji in YT's index.
      set.add(wanakana.toKatakana(query));
      const r = wanakana.toRomaji(query, { convertLongVowelMark: true });
      if (r !== query) set.add(r);
    } else {
      // Mixed kanji/kana — add romaji
      const r = wanakana.toRomaji(query, { convertLongVowelMark: true });
      if (r !== query) set.add(r);
    }
  } else {
    set.add(query);
  }

  return Array.from(set).slice(0, 4); // allow 4 queries for Japanese input
}
