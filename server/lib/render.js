/**
 * Rendering: slide PNGs (static graphics) via sharp from SVG, and the MP4
 * reel via ffmpeg (concat over repeated still frames -> H.264 + yuv420p).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { diagramForSlide, PALETTE } from "./diagrams.js";
import { speechAvailable, narrateSlides } from "./speech.js";

const execFileAsync = promisify(execFile);

export const CARD_W = 1080;
export const CARD_H = 1350; // 4:5 portrait — Instagram/LinkedIn friendly
export const REEL_W = 1080;
export const REEL_H = 1920; // 9:16

function escapeXml(s) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Naive word-wrap into <= maxChars per line. */
export function wrapText(text, maxChars) {
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line.trim());
  return lines;
}

/** Build an SVG for one slide. `height > width` means reel-frame mode.
 * `claims` enables the per-slide diagram (evidence chain / map / stats). */
export function slideToSvg(slide, paper, { width = CARD_W, height = CARD_H, claims = [] } = {}) {
  const isFrame = height > width;
  const pad = isFrame ? 110 : 90;
  const headingSize = isFrame ? 64 : 56;
  const bodySize = isFrame ? 40 : 34;
  const maxChars = isFrame ? 24 : 30;

  const headingLines = wrapText(slide.heading, maxChars);
  const bodyLines = wrapText(slide.body, isFrame ? 32 : 38);

  const kindLabel =
    slide.kind === "title" ? "PAPER" : slide.kind === "source" ? "SOURCE" : "FINDING";

  const headingBlock = headingLines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${300 + i * (headingSize + 18)}" fill="${PALETTE.text}" font-size="${headingSize}" font-weight="700" font-family="Helvetica, Arial, sans-serif">${escapeXml(l)}</text>`
    )
    .join("\n");

  const bodyStart = 300 + headingLines.length * (headingSize + 18) + 60;
  const bodyBlock = bodyLines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${bodyStart + i * (bodySize + 14)}" fill="${PALETTE.dim}" font-size="${bodySize}" font-family="Helvetica, Arial, sans-serif">${escapeXml(l)}</text>`
    )
    .join("\n");

  const citationY = height - pad - 60;
  const citation = wrapText(paper?.absUrl ?? "", isFrame ? 40 : 46)[0] ?? "";

  // Diagram zone: between body end and the citation divider.
  const bodyEnd = bodyStart + bodyLines.length * (bodySize + 14);
  const dividerY = citationY - 50;
  const diagramY = bodyEnd + (isFrame ? 56 : 44);
  const diagramH = dividerY - 24 - diagramY;
  const diagram = diagramForSlide(slide, paper, claims, {
    x: pad,
    y: diagramY,
    w: width - pad * 2,
    h: diagramH,
    scale: isFrame ? 1.35 : 1,
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${PALETTE.bg}"/>
  <rect x="0" y="0" width="${width}" height="18" fill="${PALETTE.accent}"/>
  <text x="${pad}" y="${pad + 40}" fill="${PALETTE.accent}" font-size="34" font-weight="700" letter-spacing="6" font-family="Helvetica, Arial, sans-serif">${kindLabel}</text>
  ${headingBlock}
  ${bodyBlock}
  ${diagram}
  <line x1="${pad}" y1="${dividerY}" x2="${width - pad}" y2="${dividerY}" stroke="${PALETTE.panel}" stroke-width="3"/>
  <text x="${pad}" y="${citationY}" fill="${PALETTE.dim}" font-size="28" font-family="Helvetica, Arial, sans-serif">${escapeXml(citation)}</text>
  <text x="${pad}" y="${citationY + 38}" fill="${PALETTE.dim}" font-size="24" font-family="Helvetica, Arial, sans-serif">Research Your Body · ${escapeXml((paper?.authors?.[0] ?? "") + (paper?.authors?.length > 1 ? " et al." : ""))}</text>
</svg>`;
}

/** Render one slide to PNG at the given size. Returns the output path. */
export async function renderSlidePng(slide, paper, outPath, opts = {}) {
  const svg = slideToSvg(slide, paper, opts);
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  return outPath;
}

// --- Single static graphic (collage of the whole carousel) -----------------

const COLLAGE_CELL_W = 480;
const COLLAGE_CELL_H = 600; // 4:5, matches card aspect
const COLLAGE_GAP = 48;
const COLLAGE_MARGIN = 64;
const COLLAGE_HEADER = 180;

/** Pure layout math for the collage canvas (unit-testable). */
export function collageLayout(slideCount) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(slideCount)));
  const rows = Math.ceil(slideCount / cols);
  const width =
    COLLAGE_MARGIN * 2 + cols * COLLAGE_CELL_W + (cols - 1) * COLLAGE_GAP;
  const height =
    COLLAGE_HEADER +
    COLLAGE_MARGIN +
    rows * COLLAGE_CELL_H +
    (rows - 1) * COLLAGE_GAP +
    COLLAGE_MARGIN;
  return { cols, rows, width, height };
}

/**
 * Compose ONE static graphic: a branded grid collage of every carousel slide.
 * Writes `static.png` into assetDir and returns { file, width, height }.
 */
export async function renderStaticCollage(paper, cardPaths, assetDir) {
  const { cols, width, height } = collageLayout(cardPaths.length);

  const titleLines = wrapText(paper?.title ?? "Research Your Body", 52).slice(0, 2);
  const titleSvg = titleLines
    .map(
      (l, i) =>
        `<text x="${COLLAGE_MARGIN}" y="${92 + i * 52}" fill="${PALETTE.text}" font-size="44" font-weight="700" font-family="Helvetica, Arial, sans-serif">${escapeXml(l)}</text>`
    )
    .join("\n");
  const byline =
    `Research Your Body · ${(paper?.authors?.[0] ?? "")}` +
    `${(paper?.authors?.length ?? 0) > 1 ? " et al." : ""} · ${paper?.absUrl ?? ""}`;
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${PALETTE.bg}"/>
  <rect x="0" y="0" width="${width}" height="18" fill="${PALETTE.accent}"/>
  ${titleSvg}
  <text x="${COLLAGE_MARGIN}" y="${COLLAGE_HEADER - 28}" fill="${PALETTE.dim}" font-size="24" font-family="Helvetica, Arial, sans-serif">${escapeXml(byline)}</text>
</svg>`;

  const resized = await Promise.all(
    cardPaths.map((p) =>
      sharp(p).resize(COLLAGE_CELL_W, COLLAGE_CELL_H, { fit: "fill" }).png().toBuffer()
    )
  );
  const composites = resized.map((input, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return {
      input,
      left: COLLAGE_MARGIN + c * (COLLAGE_CELL_W + COLLAGE_GAP),
      top: COLLAGE_HEADER + COLLAGE_MARGIN + r * (COLLAGE_CELL_H + COLLAGE_GAP),
    };
  });

  const out = path.join(assetDir, "static.png");
  await sharp(Buffer.from(svg)).composite(composites).png().toFile(out);
  return { file: out, width, height };
}



/**
 * Render the project's deliverable set: ONE carousel (already on the project),
 * ONE static graphic (collage of every slide), ONE reel (mp4) — narrated with
 * speech when the TTS engine is available (silent fallback otherwise).
 * Intermediate per-slide renders are deleted after composition.
 */
export async function renderProjectAssets(project, assetDir) {
  const { paper, carousel, claims } = project;
  const cardPaths = [];
  const frames = [];

  for (let i = 0; i < carousel.slides.length; i++) {
    const slide = carousel.slides[i];
    const pngName = `slide-${String(i + 1).padStart(2, "0")}.png`;
    const frameName = `frame-${String(i + 1).padStart(2, "0")}.png`;
    await renderSlidePng(slide, paper, path.join(assetDir, pngName), {
      width: CARD_W,
      height: CARD_H,
      claims,
    });
    await renderSlidePng(slide, paper, path.join(assetDir, frameName), {
      width: REEL_W,
      height: REEL_H,
      claims,
    });
    cardPaths.push(path.join(assetDir, pngName));
    frames.push(frameName);
  }

  // ONE static graphic: collage of the whole carousel.
  const collage = await renderStaticCollage(paper, cardPaths, assetDir);

  const fixedSeconds = Number(process.env.RYB_SECONDS_PER_SLIDE) || 3;
  const reelName = "reel.mp4";
  const reelPath = path.join(assetDir, reelName);

  // Speech pass: narrate each slide; timing follows the narration.
  let narration = null;
  let durations = frames.map(() => fixedSeconds);
  if (await speechAvailable()) {
    try {
      const narrationDir = path.join(assetDir, ".narration");
      const spoken = await narrateSlides(carousel.slides, paper, claims ?? [], narrationDir);
      durations = spoken.segments.map((s) => s.seconds);
      narration = {
        voice: spoken.voice,
        segments: spoken.segments.map((s) => ({
          slideId: s.slideId,
          text: s.text,
          seconds: Math.round(s.seconds * 10) / 10,
        })),
      };

      // Concatenate the normalized WAV segments into one narration track.
      const audioList = path.join(narrationDir, "audio.txt");
      const audioLines = [];
      for (const s of spoken.segments) {
        audioLines.push(`file '${s.file}'`);
      }
      await fs.writeFile(audioList, `${audioLines.join("\n")}\n`, "utf8");
      const narrationTrack = path.join(narrationDir, "narration.wav");
      await execFileAsync("ffmpeg", [
        "-y", "-hide_banner", "-loglevel", "error",
        "-f", "concat", "-safe", "0",
        "-i", audioList,
        "-c:a", "pcm_s16le",
        narrationTrack,
      ]);
      narration.track = narrationTrack;
    } catch (err) {
      console.warn(`Speech synthesis failed, falling back to silent reel: ${err.message}`);
      narration = null;
      durations = frames.map(() => fixedSeconds);
    }
  }

  // Concat demuxer with per-file duration directives (standard ffmpeg
  // slideshow recipe). The final file must be repeated to pin its duration.
  // With narration, per-slide durations match the spoken segments exactly.
  const listPath = path.join(assetDir, "frames.txt");
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    lines.push(`file '${frames[i]}'`);
    lines.push(`duration ${durations[i]}`);
  }
  await fs.writeFile(listPath, `${lines.join("\n")}\n`, "utf8");

  const ffmpegArgs = [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
  ];
  if (narration) {
    ffmpegArgs.push("-i", narration.track);
  }
  ffmpegArgs.push(
    "-vf",
    `scale=${REEL_W}:${REEL_H},format=yuv420p`,
    "-r",
    "30",
    "-c:v",
    "libx264",
  );
  if (narration) {
    ffmpegArgs.push("-c:a", "aac", "-b:a", "128k", "-ac", "1");
  }
  if (narration) {
    ffmpegArgs.push("-shortest");
  }
  ffmpegArgs.push("-movflags", "+faststart", reelPath);
  await execFileAsync("ffmpeg", ffmpegArgs);

  // Drop intermediates so the asset dir holds exactly the deliverables.
  await fs.rm(listPath, { force: true });
  for (const p of cardPaths) await fs.rm(p, { force: true });
  for (const f of frames) await fs.rm(path.join(assetDir, f), { force: true });
  if (narration) await fs.rm(path.dirname(narration.track), { recursive: true, force: true });

  const durationSeconds =
    Math.round(durations.reduce((sum, d) => sum + d, 0) * 10) / 10;

  return {
    renderedAt: new Date().toISOString(),
    static: {
      file: "static.png",
      width: collage.width,
      height: collage.height,
    },
    reel: {
      file: reelName,
      width: REEL_W,
      height: REEL_H,
      secondsPerSlide: narration ? null : fixedSeconds,
      slideCount: carousel.slides.length,
      durationSeconds,
      audio: narration
        ? { narrated: true, voice: narration.voice, segments: narration.segments }
        : { narrated: false },
    },
  };
}


