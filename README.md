# Research Your Body

Turn a **real research paper** into reviewed, sourced social content:
claim-level evidence in → **one editable carousel, one static graphic, and
one downloadable MP4 reel** out.

Pipeline: **ingest (arXiv) → claim extraction with verbatim evidence →
editable carousel → render (PNG cards + 9:16 MP4 reel) → export ZIP.**

## Stack

- `server/` — Node + Express (ESM), sharp (SVG→PNG), ffmpeg (MP4), archiver
  (ZIP). Requires `pdftotext` (poppler) and `ffmpeg`/`ffprobe` on PATH.
- `client/` — Vite + React + TypeScript + Tailwind (same stack as the
  Know Your Body / MediLingo app; this project does not modify that product).

## Run

```bash
# API server (port 3001)
cd server && npm install && npm run dev

# Web client (port 5173; proxies /api → 3001)
cd client && npm install && npm run dev
```

Open http://localhost:5173, paste an arXiv id (e.g. `1706.03762`), and walk
the tabs: **Claims → Carousel → Render & Export**.

## Narration

Reels are narrated with the macOS `say` engine (offline TTS) when a speech
engine is available; otherwise the reel plays silent with fixed per-slide
timing. The narration is delivered in two shapes:

- **In the reel** — `narrateSlides()` writes one WAV segment per slide
  (`server/lib/speech.js`: `narrateSlides`, `cleanForSpeech`, `narrationForSlide`),
  padded to a minimum duration, normalized to 44.1 kHz mono `pcm_s16le`, and
  concatenated into `narration.wav`. Per-slide durations come from the
  spoken segments, so the reel timing is narration-driven.
- **Out of the reel** — the deliverables ZIP includes `narration.txt`, a
  numbered script (`N. [slide:<id>] <text> (<seconds>s)`) for the reviewer.

The server manifest (`render.reel.audio`) reports `{ narrated, voice,
durationSeconds, segments }` at render time, and `render.reel.secondsPerSlide`
is `null` for narrated reels (timing is carried by the audio, not by `fps=30`
per-slide constants).

## Test

```bash
cd server
npm test           # 8 unit tests (claims, parsing, carousel, SVG)
node test/e2e.mjs  # full E2E vs a REAL arXiv paper (server must be running)
# optional: RYB_E2E_ARXIV_ID=2311.03037 node test/e2e.mjs
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/projects` `{arxivId}` | Ingest paper, extract claims, build carousel |
| GET | `/api/projects/:id` | Full project (paper, claims, carousel, render, export) |
| PATCH | `/api/projects/:id/claims/:claimId` | Set claim review status/note |
| PUT | `/api/projects/:id/carousel` | Save edited/reordered slides |
| POST | `/api/projects/:id/render` | Render the deliverables: `static.png` (collage of all slides) + `reel.mp4` |
| POST | `/api/projects/:id/export` | Pack deliverables ZIP (carousel.json + static.png + reel.mp4 + provenance) |
| GET | `/api/projects/:id/download/{reel\|static\|zip\|pdf}` | Download artifacts |
| GET | `/api/projects/:id/assets/:file` | Preview assets (PNGs, video) |

Projects persist as JSON + assets under `server/data/projects/<id>/`, so
review status survives restarts.

## Environment

- `PORT` (default 3001), `RYB_DATA_DIR` (default `server/data/projects`),
  `RYB_SECONDS_PER_SLIDE` (default 3).
# Research-Your-Body
