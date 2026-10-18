# Implementation Status — Research Your Body

> Started from an empty directory on 2026-10-18 (no prior repository or
> status file existed on this machine; the Know Your Body / MediLingo app at
> `/Users/darshsoni/VSC/Know Your Body/MediLingo` was left untouched).
>
> Status legend: `[x]` verified end-to-end · `[ ]` not started

## Acceptance criteria

### [x] 1. Ingest a real research paper
- arXiv id → metadata via arXiv Atom API, full PDF download, text extraction
  via `pdftotext` (poppler), section/page parsing.
- Default (non-layout) pdftotext mode chosen after discovering two-column
  papers (e.g. arXiv:2311.03037) get interleaved under `-layout`, which broke
  sentence→offset mapping.
- **Verified**: E2E ingested arXiv:1706.03762 ("Attention Is All You Need",
  16 pages) and arXiv:2311.03037 (clinical ML, 12 pages, two-column);
  PDF + extracted text saved on disk; abstract/authors/category parsed.

### [x] 2. Display claim-level source evidence
- Heuristic scorer (quantitative markers, finding language, section bonus,
  table-artifact penalties) extracts top sentences as claims.
- Every claim carries evidence: verbatim quote, section name, 1-based page,
  and exact character offsets into `paper.rawText`.
- Client Claims panel shows the quote block + section/page/offsets per claim.
- **Verified**: E2E asserts every claim's `rawText.slice(start,end)` matches
  the evidence quote (whitespace-normalized) — 6/6 claims on both papers.
  Unit tests cover sentence splitting, offset location, table rejection.

### [x] 3. Generate an editable carousel and static graphic
- Carousel = title card + claim cards (linked by `claimId`) + source card.
- Client Carousel panel: edit heading/body, reorder (↑/↓), per-slide review
  status; `PUT /carousel` persists edits (marked `edited: true`).
- **ONE static graphic**: every carousel slide is composed into a single
  branded `static.png` collage (grid of 480×600 cells, `collageLayout`
  = ceil√n columns, header with title + byline; e.g. 7 slides → 1664×2204).
  Intermediate per-slide PNGs are deleted after composition so the asset
  dir holds exactly the deliverables.
- **Verified**: E2E edits a heading, reorders slides, re-reads and asserts
  persistence; asserts `render.static.file === "static.png"`, PNG header
  bytes match the manifest dims, and the assets dir contains exactly
  `paper.pdf, paper.txt, static.png, reel.mp4` (no per-slide leftovers).
  Collage visually inspected — all slides present under branded header.

### [x] 4. Render a downloadable MP4 reel
- ONE reel: 9:16 (1080×1920) frames per slide + ffmpeg concat demuxer →
  H.264 yuv420p 30fps `reel.mp4` (`+faststart`).
- Client shows `<video>` preview + "Download reel.mp4"; served with
  `video/mp4`.
- **Verified**: ffprobe on rendered reel: `h264 1080x1920 yuv420p, 30/1 fps,
  ~24s` (7 slides × 3s, last frame extended by concat semantics — within the
  E2E tolerance and expected ffmpeg behavior). Both papers rendered.

### [x] 5. Preserve review status
- Claims: `PATCH .../claims/:id` sets pending/approved/rejected + note.
- Slides: review status saved with the carousel.
- Storage is file-backed JSON (`server/data/projects/<id>/project.json`),
  atomic write via tmp+rename.
- **Verified**: set claim-1=approved (with note) and claim-3=rejected, killed
  and restarted the server, re-read: statuses + note intact. E2E also
  asserts persistence across API reads.

### [x] 6. Export the deliverables
- Deliverable contract: **one carousel, one static graphic, one reel.**
- `POST .../export` packs `deliverables-<id>.zip`:
  `carousel.json` (the editable carousel deck), `static.png` (the single
  static graphic), `reel.mp4` (the single reel), plus provenance:
  `paper/paper.pdf`, `claims.json` (claims + evidence + review status),
  `manifest.json` (review summary + file list). No per-slide PNGs.
- Client shows the file list + "Download deliverables ZIP".
- **Verified**: `unzip -t` integrity passes; required entries present and
  `slides/` absent (6 files); downloads return correct content types
  (`static` → image/png, reel → video/mp4, zip, pdf). 1.72 MB (1706.03762)
  / 2.37 MB (2311.03037).

## Test summary (last run 2026-10-18, after the one-carousel/one-static/one-reel change)

| Suite | Result |
| --- | --- |
| `cd server && npm test` (8 unit tests) | ✅ 8/8 pass |
| `node test/e2e.mjs` RYB_TTS=0 (silent fallback) | ✅ all checks pass |
| `node test/e2e.mjs` RYB_TTS=1 (narrated reel) | ✅ all checks pass |
| `cd client && npm run build` (tsc + vite) | ✅ builds clean |

E2E render step now asserts: `static.png` exists at manifest dims, reel is
H.264 1080×1920 yuv420p with expected duration, the assets dir contains
**exactly** `paper.pdf, paper.txt, static.png, reel.mp4`, the ZIP contains
`carousel.json + static.png + reel.mp4 + claims.json + manifest.json +
paper/paper.pdf` and **no** `slides/` folder, and `/download/static` serves
`image/png`.

## Demo state

Project `8505d16b622d` (arXiv:1706.03762) is left in `server/data/projects/`
with 6 claims, an edited + reordered 7-slide carousel, approved/rejected
review statuses, and re-rendered under the one-static contract (single 1664×2204
`static.png` collage + 1080×1920 `reel.mp4`, narrated with `say`, 77.3s / 7
slides). Its deliverables ZIP now contains `narration.txt` (7 files). Projects
`8ba4174e129b` and `1e7ba3e891f1` are untouched.

## Known limitations / next steps

- Claim extraction is heuristic (no LLM); fine for demo, but an LLM pass
  (with the same evidence-offset grounding) would improve claim quality on
  noisy PDFs.
- Single-user, no auth; storage is local JSON (no DB).
- Reel timing is per-slide fixed (3s default, `RYB_SECONDS_PER_SLIDE`); no
  per-slide overrides or transitions yet.
- Carousel supports edit/reorder but not add/delete slides.
- arXiv-only ingestion (PDF upload or DOI ingestion not implemented).
