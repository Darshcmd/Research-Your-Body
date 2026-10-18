# Research Your Body

> Turn a **real research paper** into reviewed, sourced social content.
> Claim-level evidence in — **one editable carousel, one static graphic, and one narrated MP4 reel** out.

Pipeline: **ingest (arXiv) → claim extraction with verbatim evidence →
editable carousel → render (static.png collage + 9:16 narrated MP4 reel) →
export ZIP.** Details in How It Works below.

## At a Glance

| | |
|---|---|
| Target device / browser | Desktop-first web app, fully usable on mobile. Responsive Tailwind UI. Works in modern Chrome / Edge / Safari / Firefox. Output reel is 9:16 (1080x1920) — built for phones, Reels, TikTok, Shorts. |
| Completion status | Complete and verified end-to-end (6/6 acceptance criteria). 8/8 unit tests pass. E2E passes on real arXiv papers, silent and narrated. Client builds clean. See `implementation` for proof. |
| Trigger | Paste an arXiv ID (e.g. `1706.03762`) on the home page and hit Ingest paper. The API fetches metadata and PDF, extracts text, scores claims, and builds your carousel automatically. |
| Value | Go from dense PDF to trustworthy, citable social posts in minutes. Every claim carries a verbatim quote plus section, page, and character offsets. Review workflow survives restarts. One click renders a branded static collage, a narrated reel, and a provenance ZIP. |
| Next step | Swap the heuristic claim scorer for an LLM pass with the same evidence-offset grounding. See Roadmap below. |

## What You Get

- Real-paper ingest — arXiv Atom API metadata plus full PDF plus pdftotext extraction with section and page parsing. Handles tricky two-column PDFs.
- Claim-level evidence — heuristic scorer surfaces top finding-sentences. Each claim shows verbatim quote, section, page, and exact offsets.
- Human review — approve or reject claims and slides with notes. Everything persists in file-backed JSON and survives restarts.
- Editable carousel — title card plus claim cards plus source card. Edit headings and bodies, reorder, set per-slide status, all in the browser.
- One static graphic — all slides composed into a single branded `static.png` collage. No per-slide leftovers.
- One narrated reel — 9:16 H.264 `reel.mp4` (1080x1920, 30fps) with offline TTS narration driving per-slide timing, plus a `narration.txt` script.
- One-click export — `deliverables-<id>.zip` with carousel.json, static.png, reel.mp4, claims.json, manifest.json, paper/paper.pdf, narration.txt.

## Demo Flow

1. Home — paste an arXiv ID such as `1706.03762` (Attention Is All You Need) and ingest.
2. Claims tab — read verbatim evidence, approve or reject.
3. Carousel tab — edit wording, reorder, save.
4. Render and Export tab — render static.png and reel.mp4, preview the video, download the ZIP.

Try `2311.03037` as a second paper to see two-column handling.

## Target Devices and Browsers

- App UI: desktop-first, responsive down to about 360px wide. Tailwind layout with no native dependencies.
- Browsers: Chrome / Edge (recommended), Safari, Firefox — evergreen versions. Needs ES modules, fetch, and video for reel preview.
- Output media: `reel.mp4` is 1080x1920 vertical for phones. `static.png` is a high-res collage (e.g. 1664x2204 for 7 slides), crisp on retina and print.
- Not supported: IE11 and very old mobile WebViews. The hosted frontend preview without an API shows the UI but disables ingestion by design.

## Completion Status

All six acceptance criteria are verified end-to-end (details in `implementation`):

- 1. Ingest a real research paper (arXiv to PDF to text to sections) — verified on `1706.03762` (16 pages) and `2311.03037` (12 pages, two-column).
- 2. Display claim-level source evidence (quote plus section plus page plus offsets) — 6/6 claims slice-match rawText on both papers.
- 3. Editable carousel plus single static graphic — edit and reorder persist; static.png PNG header matches manifest; asset dir holds exactly 4 files.
- 4. Downloadable MP4 reel — ffprobe confirms H.264 1080x1920 yuv420p 30fps with faststart; video preview plus download in the client.
- 5. Preserve review status across restarts — kill, restart, statuses and notes intact.
- 6. Export deliverables ZIP with no per-slide leftovers — unzip integrity passes; correct content types on all downloads.

Test summary (last run 2026-10-18):

- `cd server && npm test` — 8 unit tests (claims, parsing, carousel, SVG): 8/8 pass.
- `node test/e2e.mjs` with `RYB_TTS=0` (silent fallback): pass.
- `node test/e2e.mjs` with `RYB_TTS=1` (narrated reel): pass.
- `cd client && npm run build` (tsc plus vite): clean.

## Research and Source Sheet

Every project ships with a machine-readable source sheet so nothing is a
black box. It lives in two places: the on-disk project (`project.json`) and
the exported `claims.json` + `manifest.json` inside the deliverables ZIP.

Per paper (from `server/lib/ingest.js` — arXiv Atom API plus PDF):

- Source: `arxiv`, arXiv ID, title, abstract, authors, published date,
  `absUrl`, `pdfUrl`, primary category, page count.
- Full artifacts on disk: `assets/paper.pdf` (original PDF) and
  `assets/paper.txt` (pdftotext output), plus parsed `sections[]` with
  heading, page number, and text, and the full `rawText`.

Per claim (from `server/lib/claims.js` — heuristic scorer, top 6, min score 3):

- Claim text (whitespace-collapsed for display), heuristic score, and review
  status (`pending` / `approved` / `rejected`) plus reviewer note.
- Evidence block: verbatim `quote`, `section`, 1-based `page`, and exact
  `start` / `end` character offsets into `paper.rawText` — E2E-verified by
  asserting `rawText.slice(start, end)` matches the quote on every claim.

Per export (from `server/lib/export.js` — `deliverables-<id>.zip`):

- `carousel.json` (editable deck), `static.png`, `reel.mp4`,
  `paper/paper.pdf`, `claims.json` (claims plus evidence plus review status),
  `manifest.json` (review summary plus file list), `narration.txt` (when narrated).

## Workflow and Automation

What is automated (no human needed):

- Ingest — arXiv metadata fetch, PDF download and validation, `pdftotext`
  extraction, page split on form feeds, section parse via academic heading
  patterns. (~1-2 min per paper, mostly download.)
- Claim extraction — sentence split with offset tracking, heuristic scoring
  (quantitative markers, finding language, section bonus, table-artifact
  penalties), top-6 selection with verbatim evidence and offsets.
- Carousel draft — title card (title, first author et al., category, year)
  plus up to 5 claim cards (rejected claims excluded, approved first) plus a
  source card, each slide linked by `claimId`.
- Render — all slides composed into one branded `static.png` collage; 9:16
  frames per slide plus offline TTS narration concatenated via ffmpeg into
  H.264 `reel.mp4`; per-slide timing is narration-driven.
- Export — one ZIP with the full source sheet above; integrity-verified
  (`unzip -t` in E2E).

What needs a human (the review loop):

- Claims tab — read each verbatim quote with its section/page, approve or
  reject, add a note where needed. This gates what enters the carousel.
- Carousel tab — edit headings/bodies for tone and length, reorder slides,
  set per-slide review status, save.
- Render and Export tab — hit Render, watch the reel preview, download the
  ZIP. Re-render after any edit.

## Estimated Human Time per Paper

Based on the verified demo state (7-slide carousel from a 12-16 page paper):

- Automated pipeline (ingest plus claims plus carousel draft): ~1-2 min,
  zero human attention.
- Human review (6 claims plus 7 slides): ~10-15 min for a careful pass —
  roughly 1-2 min per claim (read quote, check section/page, approve/reject)
  plus ~5 min polishing carousel copy and order.
- Render plus export: ~1-3 min machine time (TTS + ffmpeg + sharp), ~2 min
  human (preview reel, download ZIP).
- Total: about 15-20 min per paper, versus 2-4 hours to do claim extraction,
  sourcing, design, narration, and video editing by hand.

## Traceable Claim Sources

Every claim is traceable back to the exact sentence in the source PDF through
four independent links:

1. Verbatim quote — `claim.evidence.quote` is the exact sentence from the
   paper (newlines from pdftotext intact), shown in a quote block in the
   Claims panel.
2. Section and page — `claim.evidence.section` (e.g. `results`) and 1-based
   `claim.evidence.page`, shown next to every claim and baked into each
   carousel slide body (`Source: <section>, p. <page>`).
3. Character offsets — `claim.evidence.start` / `end` are exact offsets into
   `paper.rawText`, shown as `Offset: [start, end]` in the UI and covered by
   E2E slice-match assertions.
4. Slide linkage — every claim card carries `claimId`, so each carousel slide
   resolves to its claim, its evidence, and (via `citation` = `absUrl`) the
   canonical arXiv page. The source card links the full paper, and the ZIP
   carries `paper/paper.pdf` so the chain paper-PDF → offsets → claim →
   slide → reel is auditable offline.


## How It Works

arXiv ID → ingest (Atom API, PDF, pdftotext, sections/pages) → claims (heuristic scorer plus verbatim evidence plus offsets) → carousel (title plus claim cards plus source card, editable) → static.png (sharp branded collage, one file) plus reel.mp4 (ffmpeg 9:16 narrated reel) → ZIP (carousel plus media plus provenance).

## Stack

- `server/` — Node 20 plus Express (ESM), sharp (SVG to PNG), ffmpeg (MP4), archiver (ZIP). Offline TTS: `say` locally, eSpeak NG in Docker. Requires `pdftotext` (poppler) and `ffmpeg`/`ffprobe` on PATH.
- `client/` — Vite 4 plus React 18 plus TypeScript plus Tailwind 3 plus React Router. Same warm palette family as Know Your Body / MediLingo; this repo does not touch that product.
- Storage — file-backed JSON at `server/data/projects/<id>/project.json` plus `assets/` (atomic tmp-plus-rename writes, no DB, single user).
- CI and hosting — GitHub Actions CI (`ci.yml`), GitHub Pages client (`pages.yml`), Netlify (`netlify.toml` builds `client/`), `server/Dockerfile` for the API.

## Quickstart

Prerequisites: Node 20+, plus poppler (`pdftotext`) and FFmpeg on PATH:

```bash
# macOS:
brew install poppler ffmpeg

# Ubuntu/Debian:
sudo apt install poppler-utils ffmpeg
```

Prefer zero setup? Use the Docker path below — it bundles everything.

Run the API (port 3001):

```bash
cd server && npm install && npm run dev
```

Run the web client (port 5173; proxies /api to 3001):

```bash
cd client && npm install && npm run dev
```

Open http://localhost:5173, paste an arXiv id (e.g. `1706.03762`), and walk
the tabs: **Claims → Carousel → Render & Export**.

Docker — full API in one command:

```bash
docker build -t research-your-body-api ./server
docker run --rm -p 3001:3001 -v ryb-data:/app/data research-your-body-api
```

The API is then available at `http://localhost:3001/api/health`. Mount a
persistent volume at `/app/data` so projects survive restarts.

## Project Structure

- `client/src/pages/` — Home (ingest), ProjectPage (Claims / Carousel / Render tabs).
- `client/src/components/` — ClaimsPanel, CarouselPanel, RenderExportPanel.
- `server/server.js` — Express API.
- `server/lib/` — ingest, claims, carousel, render, speech, export, store.
- `server/test/` — 8 unit tests plus real-paper E2E (`test/e2e.mjs`).
- `server/data/projects/` — local project JSON plus assets (git-ignored).
- `.github/workflows/` — `ci.yml`, `pages.yml`.
- `implementation` — acceptance proof plus last test run.

## Deployment

GitHub Pages can host the React client, but not this project's API: ingesting
papers, saving projects, rendering media, and exporting ZIPs require the Node
server plus `ffmpeg` and `pdftotext`. The included Pages workflow deploys the
client after every push to `main`. Host `server/` on a Node-capable service,
then set the repository Actions variable `API_BASE_URL` to its public HTTPS
origin (for example, `https://api.example.com`, without a trailing slash).

In the repository, set **Settings → Pages → Build and deployment → Source** to
**GitHub Actions**. The deployed app will use hash routes, so its project links
work under the repository Pages URL.

The root `netlify.toml` builds the Vite application in `client/` and publishes
`client/dist`. If the API is hosted separately, set `VITE_API_BASE_URL` in
Netlify's environment variables to its public HTTPS origin, then trigger a new
deploy. Without that variable, the hosted site stays as a usable frontend
preview and intentionally disables paper processing rather than showing a
misleading API `404` error.

Production API checklist: build from `server/Dockerfile` (Node 20 plus ffmpeg
plus poppler plus eSpeak NG), mount a persistent disk at `/app/data`, expose
over HTTPS, and point the frontend at that origin.

## Narration

Reels are narrated with an offline TTS engine — no API key needed. Locally the
macOS `say` engine is used when available, otherwise the reel plays silent
with fixed per-slide timing. Cloud deployments use the included
`server/Dockerfile`, which installs `ffmpeg`, `pdftotext`, and eSpeak NG, so
every rendered MP4 includes an offline English narration track.

The narration is delivered in two shapes:

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

Build and run the complete API locally or on any Docker-capable host:

```bash
docker build -t research-your-body-api ./server
docker run --rm -p 3001:3001 -v ryb-data:/app/data research-your-body-api
```

The API is then available at `http://localhost:3001/api/health`. In production,
use a persistent disk mounted at `/app/data`, expose the container over HTTPS,
and point the Netlify frontend's `VITE_API_BASE_URL` at that HTTPS origin.

## Test and Configuration

```bash
cd server
npm test           # 8 unit tests (claims, parsing, carousel, SVG)
node test/e2e.mjs  # full E2E vs a REAL arXiv paper (server must be running)
# optional second paper: RYB_E2E_ARXIV_ID=2311.03037 node test/e2e.mjs
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/projects` `{arxivId}` | Ingest paper, extract claims, build carousel |
| GET | `/api/projects` | List project summaries |
| GET | `/api/projects/:id` | Full project (paper, claims, carousel, render, export) |
| DELETE | `/api/projects/:id` | Delete a project |
| PATCH | `/api/projects/:id/claims/:claimId` | Set claim review status/note |
| PUT | `/api/projects/:id/carousel` | Save edited/reordered slides |
| POST | `/api/projects/:id/render` | Render the deliverables: `static.png` (collage of all slides) + `reel.mp4` |
| POST | `/api/projects/:id/export` | Pack deliverables ZIP (carousel.json + static.png + reel.mp4 + provenance) |
| GET | `/api/projects/:id/download/{reel\|static\|zip\|pdf}` | Download artifacts |
| GET | `/api/projects/:id/assets/:file` | Preview assets (PNGs, video) |
| GET | `/api/health` | Health check |

Projects persist as JSON + assets under `server/data/projects/<id>/`, so
review status survives restarts.

## Environment

- `PORT` (default 3001), `RYB_DATA_DIR` (default `server/data/projects`),
  `RYB_SECONDS_PER_SLIDE` (default 3).
- `RYB_TTS=1` (default; set 0 for silent reels), `RYB_TTS_ENGINE=espeak-ng`
  (cloud/Docker; use auto locally), `RYB_TTS_VOICE=en`, `RYB_TTS_RATE=175`.
- `VITE_API_BASE_URL` (Netlify) / `API_BASE_URL` (Pages): public HTTPS origin
  of the API, no trailing slash.

## Roadmap / Next Steps

- LLM claim extraction with the same evidence-offset grounding (better quality
  on noisy PDFs).
- PDF upload and DOI ingestion (currently arXiv-only).
- Add and delete slides (currently edit plus reorder only).
- Per-slide timing overrides and transitions (currently fixed 3s or
  narration-driven).
- Multi-user plus auth (currently single-user local JSON, no DB).
- One-click deploy template (API plus frontend plus volume).
