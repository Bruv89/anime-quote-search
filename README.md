# 🎌 Anime Quote Search Engine — MVP

> Search exact quotes from anime in **Japanese** (Kanji/Kana) or **Romaji**.

Built with **Next.js 15 (App Router) · TypeScript · Tailwind CSS · SQLite FTS5 · Drizzle ORM · wanakana**

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Seed the database
This reads every `.srt` / `.ass` file inside `./data/subtitles/<AnimeFolder>/`,
parses the subtitles, pre-computes Romaji, and populates `anime-quotes.db`.

```bash
npm run seed
```

You should see output like:
```
📂  Found 3 anime folder(s)

  ➕  Created anime: "Fullmetal Alchemist Brotherhood" (id=1)
     📄  Parsing episode 1: ep01.srt
          └─ 10 subtitle lines extracted
          └─ ✅  10 quotes inserted
  ...

✅  Seeding complete — 32 quotes in DB, 32 in FTS index
```

### 3. Start the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Adding Your Own Subtitles

1. Create a folder inside `./data/subtitles/` — the folder name becomes the **anime title** (underscores → spaces).
2. Drop `.srt` or `.ass` files in it. The filename is used to infer the episode number (e.g. `ep01.srt`, `S01E03.ass`).
3. Re-run `npm run seed` — existing records are skipped automatically (idempotent).

```
data/
└── subtitles/
    ├── Attack_on_Titan/
    │   ├── ep01.srt
    │   └── ep02.srt
    └── My_Hero_Academia/
        └── ep01.ass
```

---

## Architecture

```
anime-quote-search/
├── data/subtitles/         # Drop subtitle files here
├── db/
│   └── schema.ts           # Drizzle ORM schema (animes, episodes, quotes)
├── scripts/
│   └── seed.ts             # Ingestion script
├── src/
│   ├── app/
│   │   ├── api/search/
│   │   │   └── route.ts    # GET /api/search?q=...
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx        # Homepage + search UI
│   ├── components/
│   │   ├── QuoteCard.tsx   # Single result card
│   │   └── SearchBar.tsx   # Search input
│   └── lib/
│       └── db.ts           # DB singleton + FTS5 bootstrap
├── drizzle.config.ts
├── tailwind.config.ts
└── package.json
```

### Romaji Strategy

The seed script pre-computes Romaji for every quote using `wanakana.toRomaji()`
and stores it in the `body_romaji` column. The FTS5 virtual table (`quotes_fts`)
indexes **both** `body_ja` and `body_romaji`, so:

| User types | FTS searches |
|------------|-------------|
| `arigato`  | `body_romaji: "arigato"` OR `body_ja: "ありがと"` |
| `ありがとう` | `body_ja: "ありがとう"` |
| `等価交換`  | `body_ja: "等価交換"` |

This avoids any runtime transliteration overhead on the hot search path.

---

## API

```
GET /api/search?q=<query>&limit=20&offset=0
```

**Response:**
```json
{
  "query": "arigato",
  "normalizedQuery": "arigato",
  "total": 1,
  "results": [
    {
      "quoteId": 10,
      "bodyJa": "ありがとう、アルフォンス。",
      "bodyRomaji": "arigatou, arufonsu.",
      "startTimestamp": "01:30",
      "startTime": 90.0,
      "endTime": 93.8,
      "episodeId": 1,
      "episodeNumber": 1,
      "episodeTitle": null,
      "animeId": 1,
      "animeTitle": "Fullmetal Alchemist Brotherhood",
      "animeSlug": "fullmetal_alchemist_brotherhood"
    }
  ]
}
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run seed` | Ingest subtitles → populate DB |
| `npm run db:studio` | Open Drizzle Studio (DB GUI) |

---

## Legal

This tool is **text-only**. No video playback, no image scraping, no subtitle redistribution.
You must supply your own legally-obtained subtitle files.
