# 🎌 Kotoba Search — Anime Transcript Search Engine

> Cerca una frase in Giapponese o Romaji e trova il momento esatto nei video anime su YouTube.

**Stack:** Next.js 15 · TypeScript · Tailwind CSS · YouTube Data API v3 · youtube-transcript · wanakana

---

## Come funziona

```
Utente digita "arigato" o "ありがとう"
        │
        ▼
Costruisce varianti di ricerca:
  "arigato" → ["arigato", "ありがと", "アリガト", ...]
        │
        ▼
YouTube Data API → top 15 video anime (filtro: アニメ + Film&Animation)
        │
        ▼
Scarica trascrizioni in parallelo (timeout 7s per video)
        │
        ▼
Sliding window su 3 segmenti → trova la frase
        │
        ▼
Restituisce video con match + deep-link al secondo esatto
```

---

## Setup

### 1. Installa dipendenze
```bash
npm install
```

### 2. Configura le variabili d'ambiente
```bash
cp .env.example .env.local
```
Modifica `.env.local`:
```
YOUTUBE_API_KEY=la_tua_chiave_qui
```
Ottieni una chiave gratuita su [console.cloud.google.com](https://console.cloud.google.com) → abilita "YouTube Data API v3".

> **Quota gratuita:** 10.000 unità/giorno. Ogni ricerca = 100 unità → 100 ricerche/giorno.

### 3. Avvia
```bash
npm run dev
# → http://localhost:3000
```

---

## Struttura del progetto

```
src/
├── app/
│   ├── api/
│   │   └── transcript/route.ts   # Core engine: YouTube search + transcript scan
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # UI principale
├── components/
│   ├── SearchBar.tsx
│   └── TranscriptCard.tsx        # Card risultato con deep-link al timestamp
└── lib/
    ├── romaji.ts                  # Conversione Romaji ↔ Kana, varianti di ricerca
    └── youtube.ts                 # YouTube search con filtro anime-only
```

---

## Supporto Romaji

| Input utente | Varianti cercate |
|---|---|
| `arigato` | `arigato`, `ありがと`, `アリガト` |
| `arigatou` | `arigatou`, `ありがとう`, `アリガトウ`, `arigato`, `ありがと` |
| `ありがとう` | `ありがとう`, `arigatou`, `アリガトウ` |
| `nakama` | `nakama`, `なかま`, `ナカマ` |

---

## Sicurezza

- La chiave API è **solo** in `.env.local`, mai in Git
- `.env.local` è nel `.gitignore`
- `.env.example` contiene solo placeholder

## Comandi

| Comando | Descrizione |
|---|---|
| `npm run dev` | Server di sviluppo |
| `npm run build` | Build di produzione |
| `npm start` | Avvia la build |
