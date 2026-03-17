/**
 * src/lib/db.ts
 *
 * Single shared database connection for both the Next.js server and the
 * seed script.  On first connection we ensure:
 *   1. WAL mode is enabled (better concurrent read performance).
 *   2. Foreign keys are enforced.
 *   3. The three main tables exist (idempotent CREATE IF NOT EXISTS).
 *   4. The FTS5 virtual table `quotes_fts` exists and stays in sync via
 *      triggers.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";
import path from "path";

// ─── Connection ───────────────────────────────────────────────────────────────

const DB_PATH = path.resolve(
  process.env.DATABASE_URL ?? "./anime-quotes.db"
);

// `better-sqlite3` is synchronous; one connection per process is fine.
const sqlite = new Database(DB_PATH);

// ─── Performance pragmas ──────────────────────────────────────────────────────

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("synchronous = NORMAL");

// ─── Bootstrap tables ────────────────────────────────────────────────────────

sqlite.exec(/* sql */ `
  CREATE TABLE IF NOT EXISTS animes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    NOT NULL UNIQUE,
    title       TEXT    NOT NULL,
    title_ja    TEXT,
    created_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    anime_id       INTEGER NOT NULL REFERENCES animes(id) ON DELETE CASCADE,
    episode_number INTEGER NOT NULL,
    title          TEXT,
    source_file    TEXT    NOT NULL,
    created_at     INTEGER
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id      INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    body_ja         TEXT    NOT NULL,
    body_romaji     TEXT    NOT NULL,
    start_time      REAL    NOT NULL,
    end_time        REAL    NOT NULL,
    start_timestamp TEXT    NOT NULL,
    created_at      INTEGER
  );
`);

// ─── FTS5 virtual table & sync triggers ──────────────────────────────────────
//
// quotes_fts mirrors body_ja and body_romaji from the quotes table.
// SQLite FTS5 will tokenise both columns, so searching "arigato" will hit
// rows where body_romaji contains "arigatou / arigato", and searching
// "ありがとう" will hit rows where body_ja contains it.
//
// We use content="" (contentless FTS) with a rowid link for efficiency —
// no data duplication — plus the recommended triggers to keep it in sync.

sqlite.exec(/* sql */ `
  CREATE VIRTUAL TABLE IF NOT EXISTS quotes_fts USING fts5(
    body_ja,
    body_romaji,
    content = quotes,
    content_rowid = id,
    tokenize = 'unicode61 remove_diacritics 1'
  );

  -- Keep FTS in sync on INSERT
  CREATE TRIGGER IF NOT EXISTS quotes_ai AFTER INSERT ON quotes BEGIN
    INSERT INTO quotes_fts(rowid, body_ja, body_romaji)
    VALUES (new.id, new.body_ja, new.body_romaji);
  END;

  -- Keep FTS in sync on DELETE
  CREATE TRIGGER IF NOT EXISTS quotes_ad AFTER DELETE ON quotes BEGIN
    INSERT INTO quotes_fts(quotes_fts, rowid, body_ja, body_romaji)
    VALUES ('delete', old.id, old.body_ja, old.body_romaji);
  END;

  -- Keep FTS in sync on UPDATE
  CREATE TRIGGER IF NOT EXISTS quotes_au AFTER UPDATE ON quotes BEGIN
    INSERT INTO quotes_fts(quotes_fts, rowid, body_ja, body_romaji)
    VALUES ('delete', old.id, old.body_ja, old.body_romaji);
    INSERT INTO quotes_fts(rowid, body_ja, body_romaji)
    VALUES (new.id, new.body_ja, new.body_romaji);
  END;
`);

// ─── Drizzle ORM instance ────────────────────────────────────────────────────

export const db = drizzle(sqlite, { schema });

/** Expose the raw better-sqlite3 instance for direct SQL when needed. */
export { sqlite };
