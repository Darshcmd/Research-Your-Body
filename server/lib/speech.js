/**
 * Narration (speech) for the reel using the macOS `say` engine (offline).
 *
 *  - narrationForSlide(): build the spoken script for each slide
 *  - cleanForSpeech(): strip citations/URLs, expand symbols for TTS
 *  - narrateSlides(): synthesize one WAV segment per slide, padded to an
 *    exact duration so the video frame timing can match the audio 1:1
 *
 * If the engine is unavailable (or RYB_TTS=0), renderers fall back to a
 * silent reel with fixed per-slide timing.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const MAX_WORDS = Number(process.env.RYB_NARRATION_MAX_WORDS) || 34;
const TRAIL_PAD = 0.6; // breathing room after each slide's speech
const MIN_SLIDE = 2.5; // never flash a slide for less than this

/** Rewrite text so TTS reads it naturally. */
export function cleanForSpeech(text) {
  return (
    String(text ?? "")
      // bracketed numeric citations [42], [12, 15]
      .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, "")
      // parenthetical author-year citations (Vaswani et al., 2017)
      .replace(/\([^)]*et al\.?,?\s*\d{4}[^)]*\)/g, "")
      // URLs
      .replace(/https?:\/\/\S+/g, "")
      // percentages → words
      .replace(/(\d+(?:\.\d+)?)\s?%/g, "$1 percent")
      // page refs
      .replace(/\bp\.\s?(\d+)/g, "page $1")
      // misc symbols
      .replace(/&/g, " and ")
      .replace(/[§¶•·]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function capWords(text, max = MAX_WORDS) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= max) return text;
  return `${words.slice(0, max).join(" ").replace(/[,;:.]+$/, "")}…`;
}

/** The narration script for one slide. */
export function narrationForSlide(slide, paper, claim) {
  const cleanedHeading = cleanForSpeech(slide.heading);
  const cleanedBody = cleanForSpeech(slide.body);
  let text;
  if (slide.kind === "title") {
    const first = paper?.authors?.[0] ?? "";
    const group = (paper?.authors?.length ?? 0) > 1 ? " and colleagues" : "";
    text = `${cleanedHeading}. By ${first}${group}.`;
  } else if (slide.kind === "source") {
    text = `Read the full paper: ${cleanedBody}. Search arXiv for ${paper?.arxivId ?? "the paper"}.`;
  } else {
    const source = claim?.evidence
      ? ` Source: ${cleanForSpeech(claim.evidence.section)}, page ${claim.evidence.page}.`
      : "";
    text = `${cleanedHeading}. ${cleanedBody}${source}`;
  }
  return capWords(cleanForSpeech(text));
}

/** Is the speech engine usable on this machine? */
export async function speechAvailable() {
  if (process.env.RYB_TTS === "0") return false;
  if (process.platform !== "darwin") return false;
  try {
    await execFileAsync("say", ["-v", "?"]);
    return true;
  } catch {
    return false;
  }
}

async function aiffDuration(file) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    file,
  ]);
  return Number(stdout.trim());
}

/**
 * Synthesize narration for all slides into `narrationDir`.
 * Returns { voice, segments: [{ slideId, text, file, seconds }] } where every
 * segment WAV is exactly `seconds` long (speech + trailing silence).
 */
export async function narrateSlides(slides, paper, claims, narrationDir) {
  await fs.mkdir(narrationDir, { recursive: true });
  const voice = process.env.RYB_TTS_VOICE || undefined;
  const rate = process.env.RYB_TTS_RATE || undefined;

  const segments = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const claim = claims.find((c) => c.id === slide.claimId);
    const text = narrationForSlide(slide, paper, claim);

    const aiff = path.join(narrationDir, `seg-${i}-raw.aiff`);
    const wav = path.join(narrationDir, `seg-${i}.wav`);
    const args = [];
    if (voice) args.push("-v", voice);
    if (rate) args.push("-r", rate);
    args.push("-o", aiff, text);
    await execFileAsync("say", args);

    const speech = await aiffDuration(aiff);
    const seconds = Math.max(speech + TRAIL_PAD, MIN_SLIDE);

    // Pad/trim to the exact duration and normalize to a common format so
    // segments can be concatenated losslessly.
    await execFileAsync("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", aiff,
      "-af", "apad",
      "-t", String(seconds),
      "-ar", "44100", "-ac", "1",
      "-c:a", "pcm_s16le",
      wav,
    ]);
    await fs.rm(aiff, { force: true });
    segments.push({ slideId: slide.id, text, file: wav, seconds });
  }
  return { voice: voice ?? "system default", segments };
}
