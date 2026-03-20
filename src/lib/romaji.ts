/**
 * src/lib/romaji.ts
 *
 * Utilities for handling Romaji ↔ Japanese conversion.
 * Used to make transcript search work for users who type
 * in Latin characters (e.g. "arigato" → "ありがとう").
 */

import * as wanakana from "wanakana";

/** Returns true if the string contains at least one kana or kanji character. */
export function containsJapanese(text: string): boolean {
  return /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(text);
}

/** Returns true if the string is pure ASCII (likely Romaji input). */
export function isRomaji(text: string): boolean {
  return /^[\x00-\x7F\s]+$/.test(text.trim());
}

/**
 * Given a user query, return all search variants we should try against
 * a Japanese transcript.
 *
 * Examples:
 *   "arigato"    → ["arigato", "ありがと", "アリガト"]
 *   "arigatou"   → ["arigatou", "ありがとう", "アリガトウ"]
 *   "ありがとう"  → ["ありがとう", "アリガトウ", "arigatou"]
 *   "等価交換"   → ["等価交換"]
 */
export function buildSearchVariants(query: string): string[] {
  const q = query.trim();
  if (!q) return [];

  const variants = new Set<string>();
  variants.add(q);

  if (isRomaji(q)) {
    // Romaji input: convert to both hiragana and katakana
    const hiragana = wanakana.toHiragana(q);
    const katakana = wanakana.toKatakana(q);
    if (hiragana !== q) variants.add(hiragana);
    if (katakana !== q) variants.add(katakana);

    // Also try with long vowel variations:
    // "arigatou" → "ありがとう" AND "arigatō" → strip the ō → "arigato"
    const simplified = q.replace(/ou/gi, "o").replace(/uu/gi, "u");
    if (simplified !== q) {
      variants.add(simplified);
      variants.add(wanakana.toHiragana(simplified));
      variants.add(wanakana.toKatakana(simplified));
    }
  } else if (containsJapanese(q)) {
    // Japanese input: add romaji and alternate script
    const romaji = wanakana.toRomaji(q, { convertLongVowelMark: true });
    if (romaji !== q) variants.add(romaji);

    // If hiragana, add katakana and vice versa
    if (wanakana.isHiragana(q)) {
      variants.add(wanakana.toKatakana(q));
    } else if (wanakana.isKatakana(q)) {
      variants.add(wanakana.toHiragana(q));
    }
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * Normalize a text string for fuzzy matching:
 * lowercase, remove punctuation, collapse whitespace.
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[！。、…「」『』・【】（）\[\]().,!?'"ー～〜]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if `text` contains any of the given search variants.
 * Returns the matched variant or null.
 */
export function findVariantMatch(
  text: string,
  variants: string[]
): string | null {
  const normalizedText = normalizeForMatch(text);
  for (const variant of variants) {
    if (normalizedText.includes(normalizeForMatch(variant))) {
      return variant;
    }
  }
  return null;
}
