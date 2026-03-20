/**
 * src/lib/kanji.ts
 *
 * Kuromoji wrapper — converts Japanese text (including kanji) to hiragana.
 */

import kuromoji from "kuromoji";
import * as wanakana from "wanakana";
import path from "path";

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

let _tokenizer: Tokenizer | null = null;
let _initPromise: Promise<Tokenizer> | null = null;

export function getTokenizer(): Promise<Tokenizer> {
  if (_tokenizer) return Promise.resolve(_tokenizer);
  if (_initPromise) return _initPromise;

  const dicPath = path.join(process.cwd(), "node_modules", "kuromoji", "dict");

  _initPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
      if (err) {
        _initPromise = null;
        reject(err);
      } else {
        _tokenizer = tokenizer;
        resolve(tokenizer);
      }
    });
  });

  return _initPromise;
}

/** Convert kanji+kana text to its hiragana reading. */
export async function toHiraganaReading(text: string): Promise<string> {
  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    return tokens
      .map((token) => {
        const reading = token.reading;
        if (reading && reading !== "*") return wanakana.toHiragana(reading);
        return token.surface_form;
      })
      .join("");
  } catch {
    return text;
  }
}

/**
 * Pre-convert an array of segment texts to hiragana in one batch.
 * Returns a Map from original text → hiragana reading.
 * Uses a single tokenizer instance for all conversions.
 */
export async function batchToHiragana(texts: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(texts)];

  try {
    const tokenizer = await getTokenizer();

    for (const text of unique) {
      try {
        const tokens = tokenizer.tokenize(text);
        const reading = tokens
          .map((t) => {
            if (t.reading && t.reading !== "*") return wanakana.toHiragana(t.reading);
            return t.surface_form;
          })
          .join("");
        result.set(text, reading);
      } catch {
        result.set(text, text);
      }
    }
  } catch {
    // kuromoji failed entirely — map everything to itself
    for (const text of unique) result.set(text, text);
  }

  return result;
}

export function warmupTokenizer(): void {
  getTokenizer().catch(() => {});
}
