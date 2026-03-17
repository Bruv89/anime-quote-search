/**
 * db/schema.ts
 *
 * Three normalized tables:
 *   animes   → one row per series
 *   episodes → one row per episode, FK → animes
 *   quotes   → one row per subtitle line, FK → episodes
 *
 * FTS5 virtual table (quotes_fts) mirrors the quotes table and
 * enables sub-millisecond full-text search in both Japanese and Romaji.
 *
 * NOTE: Drizzle does not yet support FTS5 virtual tables via its schema
 * DSL, so we declare the regular tables here and create the FTS5 table
 * manually inside src/lib/db.ts (run-once setup) and scripts/seed.ts.
 */

import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ─── animes ─────────────────────────────────────────────────────────────────

export const animes = sqliteTable("animes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),        // e.g. "fullmetal_alchemist_brotherhood"
  title: text("title").notNull(),               // e.g. "Fullmetal Alchemist: Brotherhood"
  titleJa: text("title_ja"),                    // optional: Japanese title
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// ─── episodes ────────────────────────────────────────────────────────────────

export const episodes = sqliteTable("episodes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  animeId: integer("anime_id")
    .notNull()
    .references(() => animes.id, { onDelete: "cascade" }),
  episodeNumber: integer("episode_number").notNull(), // 1-based
  title: text("title"),                               // optional episode title
  sourceFile: text("source_file").notNull(),          // original filename
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// ─── quotes ──────────────────────────────────────────────────────────────────

export const quotes = sqliteTable("quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  episodeId: integer("episode_id")
    .notNull()
    .references(() => episodes.id, { onDelete: "cascade" }),
  /**
   * The raw Japanese / original-language text from the subtitle file.
   * This is what gets stored in the FTS5 table's `body_ja` column.
   */
  bodyJa: text("body_ja").notNull(),
  /**
   * Pre-computed Romaji transliteration produced during ingestion using
   * the `wanakana` library. Storing it avoids runtime re-computation on
   * every query and is the most performant approach for an MVP.
   *
   * Strategy chosen: DUAL-COLUMN FTS
   *   - FTS searches both bodyJa and bodyRomaji so a query in either
   *     script always finds the right rows.
   */
  bodyRomaji: text("body_romaji").notNull(),
  /** Subtitle start time in seconds (float). e.g. 65.4 → 1:05.4 */
  startTime: real("start_time").notNull(),
  /** Subtitle end time in seconds (float). */
  endTime: real("end_time").notNull(),
  /** Display-friendly timestamp string, e.g. "01:05" */
  startTimestamp: text("start_timestamp").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// ─── relations ───────────────────────────────────────────────────────────────

export const animesRelations = relations(animes, ({ many }) => ({
  episodes: many(episodes),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  anime: one(animes, { fields: [episodes.animeId], references: [animes.id] }),
  quotes: many(quotes),
}));

export const quotesRelations = relations(quotes, ({ one }) => ({
  episode: one(episodes, { fields: [quotes.episodeId], references: [episodes.id] }),
}));

// ─── TypeScript types ────────────────────────────────────────────────────────

export type Anime = typeof animes.$inferSelect;
export type NewAnime = typeof animes.$inferInsert;

export type Episode = typeof episodes.$inferSelect;
export type NewEpisode = typeof episodes.$inferInsert;

export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;

/**
 * The shape returned by the search API — a quote joined with its
 * episode and anime metadata.
 */
export type QuoteSearchResult = Quote & {
  episode: Episode & { anime: Anime };
};
