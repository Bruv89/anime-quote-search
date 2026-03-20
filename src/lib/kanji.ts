/**
 * src/lib/kanji.ts
 *
 * Kuromoji wrapper — converts Japanese text (including kanji) to hiragana.
 *
 * kuromoji is a morphological analyzer for Japanese. It tokenizes text and
 * provides the "reading" (yomi) for each token, which is in katakana.
 * We convert that reading to hiragana for consistent matching.
 *
 * Example:
 *   toHiraganaReading("食い倒れ") → "くいだおれ"
 *   toHiraganaReading("等価交換") → "とうかこうかん"
 *   toHiraganaReading("ありがとう") → "ありがとう"  (already hiragana)
 *
 * The tokenizer is initialized ONCE and cached for the lifetime of the
 * server process — subsequent calls are synchronous and fast.
 */

import kuromoji from "kuromoji";
import * as wanakana from "wanakana";
import path from "path";

// ─── Tokenizer cache ──────────────────────────────────────────────────────────

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

let _tokenizer: Tokenizer | null = null;
let _initPromise: Promise<Tokenizer> | null = null;

/**
 * Lazy-initialize the kuromoji tokenizer.
 * The dictionary is loaded from node_modules/kuromoji/dict.
 * First call takes ~200–400ms; subsequent calls return the cached instance.
 */
export function getTokenizer(): Promise<Tokenizer> {
  if (_tokenizer) return Promise.resolve(_tokenizer);

  if (_initPromise) return _initPromise;

  const dicPath = path.join(process.cwd(), "node_modules", "kuromoji", "dict");

  _initPromise = new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
      if (err) {
        _initPromise = null; // allow retry on next call
        reject(err);
      } else {
        _tokenizer = tokenizer;
        resolve(tokenizer);
      }
    });
  });

  return _initPromise;
}

/**
 * Convert a Japanese string (kanji/kana/mixed) to its hiragana reading.
 *
 * Uses kuromoji tokenization: each token provides a "reading" field
 * (in katakana), which we convert to hiragana.
 * If a token has no reading (e.g. punctuation, foreign chars), the
 * surface form is kept as-is.
 *
 * Falls back to the original text if kuromoji is not available.
 */
export async function toHiraganaReading(text: string): Promise<string> {
  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);

    return tokens
      .map((token) => {
        const reading = token.reading;
        if (reading && reading !== "*") {
          // reading is katakana → convert to hiragana
          return wanakana.toHiragana(reading);
        }
        // No reading available (punctuation, latin, etc.) → keep original
        return token.surface_form;
      })
      .join("");
  } catch {
    // Fallback: return original text if kuromoji fails
    return text;
  }
}

/**
 * Synchronous version using the cached tokenizer.
 * Returns null if the tokenizer is not yet initialized.
 * Use this in hot paths where async is not practical.
 */
export function toHiraganaReadingSync(text: string): string | null {
  if (!_tokenizer) return null;

  try {
    const tokens = _tokenizer.tokenize(text);
    return tokens
      .map((token) => {
        const reading = token.reading;
        if (reading && reading !== "*") return wanakana.toHiragana(reading);
        return token.surface_form;
      })
      .join("");
  } catch {
    return null;
  }
}

/**
 * Warm up the tokenizer at server startup.
 * Call this once in the API route module so the first user request
 * doesn't pay the initialization cost.
 */
export function warmupTokenizer(): void {
  getTokenizer().catch((err) =>
    console.warn("[kuromoji] Warmup failed:", err.message)
  );
}
