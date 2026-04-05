/**
 * src/app/api/word-info/route.ts
 *
 * POST { text: string }
 * → { words: WordInfo[] }
 *
 * Pipeline:
 *   1. Tokenize text with kuromoji → extract content words (nouns, verbs, adj)
 *   2. For each unique word (max 12): parallel Jisho lookup + Tatoeba examples
 *   3. Return sorted by JLPT level (N5 first, unknown last)
 */

import { NextRequest, NextResponse } from "next/server";
import * as wanakana from "wanakana";
import { getTokenizer } from "@/lib/kanji";
import type { WordInfo, JLPTLevel, Frequency } from "@/lib/vocabulary";

// ─── Jisho types (minimal) ────────────────────────────────────────────────────

interface JishoEntry {
  slug: string;
  is_common: boolean;
  tags: string[];
  jlpt: string[];
  japanese: { word?: string; reading?: string }[];
  senses: {
    english_definitions: string[];
    parts_of_speech: string[];
  }[];
}

interface JishoResponse { data: JishoEntry[]; }

// ─── Tatoeba types (minimal) ──────────────────────────────────────────────────

interface TatoebaSentence {
  text: string;
  translations: { text: string; lang: string }[][];
}

interface TatoebaResponse { results: TatoebaSentence[]; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

// POS tags to INCLUDE (kuromoji IPADIC Japanese)
const INCLUDE_POS = new Set([
  "名詞",     // noun
  "動詞",     // verb
  "形容詞",   // i-adjective
  "形容動詞", // na-adjective
  "副詞",     // adverb
  "感動詞",   // interjection
]);

// Sub-categories to EXCLUDE even within included POS
const EXCLUDE_POS_DETAIL = new Set([
  "非自立",     // auxiliary-like nouns (こと, もの...)
  "数",         // numbers
  "接尾",       // suffixes
  "代名詞",     // only exclude specific pronouns handled below
]);

function parseJLPT(jlptTags: string[]): JLPTLevel {
  if (!jlptTags.length) return "unknown";
  const tag = jlptTags[0]; // e.g. "jlpt-n5"
  const match = tag.match(/jlpt-n(\d)/i);
  if (!match) return "unknown";
  return `N${match[1]}` as JLPTLevel;
}

function parseFrequency(isCommon: boolean, tags: string[]): Frequency {
  if (isCommon) {
    const hasNewsTag = tags.some((t) => t.startsWith("news1") || t.startsWith("news2"));
    return hasNewsTag ? "very_common" : "common";
  }
  return tags.some((t) => t.includes("wanikani")) ? "uncommon" : "rare";
}

const JLPT_ORDER: Record<JLPTLevel, number> = {
  N5: 0, N4: 1, N3: 2, N2: 3, N1: 4, unknown: 5,
};

// ─── Jisho lookup ─────────────────────────────────────────────────────────────

async function lookupJisho(word: string): Promise<JishoEntry | null> {
  try {
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data: JishoResponse = await res.json();
    // Return first entry that actually matches our word
    return (
      data.data.find(
        (e) => e.japanese.some((j) => j.word === word || j.reading === word)
      ) ?? data.data[0] ?? null
    );
  } catch { return null; }
}

// ─── Tatoeba examples ─────────────────────────────────────────────────────────

async function lookupTatoeba(word: string): Promise<{ ja: string; en: string }[]> {
  try {
    const url = `https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query=${encodeURIComponent(word)}&limit=2`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data: TatoebaResponse = await res.json();
    return (data.results ?? [])
      .slice(0, 2)
      .map((s) => ({
        ja: s.text,
        en: s.translations?.[0]?.[0]?.text ?? "",
      }))
      .filter((e) => e.en);
  } catch { return []; }
}

// ─── Tokenization + extraction ────────────────────────────────────────────────

async function extractContentWords(text: string): Promise<string[]> {
  const tokenizer = await getTokenizer();
  const tokens    = tokenizer.tokenize(text);

  const seen  = new Set<string>();
  const words: string[] = [];

  for (const t of tokens) {
    const pos       = t.pos as string;
    const posDetail = (t.pos_detail_1 as string) ?? "";
    const base      = (t.basic_form as string) ?? t.surface_form;

    if (!INCLUDE_POS.has(pos)) continue;
    if (EXCLUDE_POS_DETAIL.has(posDetail)) continue;
    if (base === "*" || base.length < 2) continue;
    // Skip pure hiragana short words (likely functional words)
    if (/^[\u3040-\u309F]{1,2}$/.test(base)) continue;
    if (seen.has(base)) continue;

    seen.add(base);
    words.push(base);

    if (words.length >= 12) break; // cap at 12 words
  }

  return words;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let text = "";
  try {
    const body = await req.json();
    text = (body.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: "Field 'text' is required." }, { status: 400 });
  }

  // Extract content words via kuromoji
  const contentWords = await extractContentWords(text);

  if (contentWords.length === 0) {
    return NextResponse.json({ words: [] });
  }

  // Parallel lookup for all words
  const results = await Promise.allSettled(
    contentWords.map(async (word): Promise<WordInfo | null> => {
      const [entry, examples] = await Promise.all([
        lookupJisho(word),
        lookupTatoeba(word),
      ]);

      if (!entry) return null;

      const jpEntry  = entry.japanese[0] ?? {};
      const reading  = jpEntry.reading ?? word;
      const wordForm = jpEntry.word    ?? reading;
      const romaji   = wanakana.toRomaji(reading, { convertLongVowelMark: true });

      return {
        word:          wordForm,
        reading,
        romaji,
        meanings:      entry.senses.flatMap((s) => s.english_definitions).slice(0, 4),
        jlpt:          parseJLPT(entry.jlpt),
        isCommon:      entry.is_common,
        frequency:     parseFrequency(entry.is_common, entry.tags),
        partsOfSpeech: [...new Set(entry.senses.flatMap((s) => s.parts_of_speech))].slice(0, 2),
        examples,
      } satisfies WordInfo;
    })
  );

  const words: WordInfo[] = results
    .filter((r): r is PromiseFulfilledResult<WordInfo> =>
      r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value)
    .sort((a, b) => JLPT_ORDER[a.jlpt] - JLPT_ORDER[b.jlpt]);

  return NextResponse.json({ words });
}
