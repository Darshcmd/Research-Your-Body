/**
 * End-to-end verification of the full Research Your Body pipeline against a
 * REAL arXiv paper. Usage:
 *   node test/e2e.mjs            (expects server on :3001)
 *   RYB_BASE_URL=... node test/e2e.mjs
 *
 * Verifies: ingest → claims with evidence → editable carousel → review
 * status persistence → render (PNG + MP4 via ffprobe) → export ZIP
 * integrity → downloads.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.RYB_BASE_URL ?? "http://localhost:3001";
const ARXIV_ID = process.env.RYB_E2E_ARXIV_ID ?? "1706.03762";

const step = (msg) => console.log(`\n▶ ${msg}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);

async function main() {
  step(`Health check at ${BASE}`);
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.ok, true);
  ok("server healthy");

  step(`Ingest real paper arXiv:${ARXIV_ID}`);
  const createRes = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arxivId: ARXIV_ID }),
  });
  assert.equal(createRes.status, 201, `ingest failed: ${createRes.status}`);
  let project = await createRes.json();
  ok(
    `project ${project.id}: "${project.paper.title}" (${project.paper.pageCount} pages, ${project.paper.authors.length} authors)`
  );
  assert.ok(project.paper.pageCount > 1, "paper should have multiple pages");
  assert.ok(project.paper.rawText.length > 5000, "raw text should be substantial");

  step("Claim-level source evidence");
  assert.ok(project.claims.length >= 3, `expected >=3 claims, got ${project.claims.length}`);
  for (const c of project.claims) {
    assert.ok(c.evidence.quote.length > 20, `${c.id} needs a real quote`);
    assert.ok(c.evidence.section, `${c.id} needs a section`);
    assert.ok(c.evidence.page >= 1, `${c.id} needs a page number`);
    assert.ok(c.evidence.start !== null, `${c.id} needs raw-text offsets`);
    const slice = project.paper.rawText.slice(c.evidence.start, c.evidence.end);
    assert.equal(
      slice.replace(/\s+/g, " "),
      c.evidence.quote.replace(/\s+/g, " "),
      `${c.id} evidence must match raw text at [${c.evidence.start},${c.evidence.end}]`
    );
  }
  ok(`${project.claims.length} claims, all with verbatim evidence matched to raw text offsets`);

  step("Editable carousel + review status persistence");
  const patch = await fetch(`${BASE}/api/projects/${project.id}/claims/${project.claims[0].id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewStatus: "approved", note: "e2e check" }),
  });
  assert.equal(patch.status, 200);
  const slides = project.carousel.slides.map((s) => ({ ...s }));
  slides[1] = { ...slides[1], heading: "E2E edited headline", reviewStatus: "approved" };
  [slides[1], slides[2]] = [slides[2], slides[1]]; // reorder
  const put = await fetch(`${BASE}/api/projects/${project.id}/carousel`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slides }),
  });
  assert.equal(put.status, 200);
  const reread = await (await fetch(`${BASE}/api/projects/${project.id}`)).json();
  assert.equal(reread.claims[0].reviewStatus, "approved");
  assert.equal(reread.claims[0].note, "e2e check");
  // slides[1] (edited) was swapped into position 2, so find it by id.
  const edited = reread.carousel.slides.find((s) => s.id === "slide-2");
  assert.equal(edited.heading, "E2E edited headline");
  assert.equal(reread.carousel.slides[1].id, "slide-3", "reorder should be persisted");
  assert.equal(reread.carousel.slides[1].kind, "claim");
  ok("carousel edit + reorder + claim approval persisted");


  step("Render: one static graphic + one reel");
  const renderRes = await fetch(`${BASE}/api/projects/${project.id}/render`, { method: "POST" });
  assert.equal(renderRes.status, 200, "render failed");
  const render = await renderRes.json();
  assert.equal(render.static.file, "static.png", "exactly one static graphic expected");
  assert.equal(render.reel.file, "reel.mp4", "exactly one reel expected");
  assert.equal(render.reel.slideCount, reread.carousel.slides.length);
  ok(
    `static ${render.static.width}x${render.static.height} + reel ${render.reel.width}x${render.reel.height} (${render.reel.durationSeconds}s planned)`
  );

  // Validate the MP4 and static PNG on disk with ffprobe / header bytes.
  const assetsDir = path.join(
    process.env.RYB_DATA_DIR ?? fileURLToPath(new URL("../data/projects", import.meta.url)),
    project.id,
    "assets"
  );
  const reelPath = path.join(assetsDir, render.reel.file);
  assert.ok(fs.existsSync(reelPath), "reel.mp4 missing on disk");
  const probe = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-show_entries", "stream=codec_name,width,height,pix_fmt",
    "-of", "json",
    reelPath,
  ]);
  const info = JSON.parse(probe.toString());
  const stream = info.streams[0];
  assert.equal(stream.codec_name, "h264", "reel must be H.264");
  assert.equal(stream.width, 1080);
  assert.equal(stream.height, 1920);
  assert.equal(stream.pix_fmt, "yuv420p", "reel must be yuv420p for social platforms");
  const duration = Number(info.format.duration);
  assert.ok(
    duration >= render.reel.durationSeconds * 0.9 && duration <= render.reel.durationSeconds + 5,
    `reel duration ${duration}s outside expected range`
  );
  ok(`ffprobe: ${stream.codec_name} ${stream.width}x${stream.height} ${stream.pix_fmt}, ${duration.toFixed(1)}s`);

  const staticPath = path.join(assetsDir, render.static.file);
  assert.ok(fs.existsSync(staticPath), "static.png missing on disk");
  const pngHead = fs.readFileSync(staticPath);
  assert.equal(pngHead.readUInt32BE(16), render.static.width);
  assert.equal(pngHead.readUInt32BE(20), render.static.height);
  ok(`static.png is ${render.static.width}x${render.static.height}`);

  // The asset dir must hold exactly the deliverables — no per-slide leftovers.
  const assetFiles = fs.readdirSync(assetsDir).sort();
  assert.deepEqual(
    assetFiles,
    ["paper.pdf", "paper.txt", "reel.mp4", "static.png"],
    `unexpected files in assets dir: ${assetFiles.join(", ")}`
  );
  ok("assets dir holds exactly paper.pdf, paper.txt, static.png, reel.mp4");


  step("Export deliverables ZIP");
  const exportRes = await fetch(`${BASE}/api/projects/${project.id}/export`, { method: "POST" });
  assert.equal(exportRes.status, 200, "export failed");
  const exp = await exportRes.json();
  const zipPath = path.join(assetsDir, exp.file);
  assert.ok(fs.existsSync(zipPath), "zip missing on disk");
  const listing = execFileSync("unzip", ["-l", zipPath]).toString();
  for (const required of ["reel.mp4", "static.png", "carousel.json", "claims.json", "manifest.json", "paper/paper.pdf"]) {
    assert.ok(listing.includes(required), `zip missing ${required}`);
  }
  assert.ok(!listing.includes("slides/"), "zip must not contain per-slide PNGs");
  execFileSync("unzip", ["-t", zipPath], { stdio: "pipe" }); // throws on corruption
  ok(`zip OK (${(exp.bytes / 1024 / 1024).toFixed(2)} MB, ${exp.files.length} files, integrity tested)`);
  const audioStream = info.streams.find((s) => s.codec_type === 'audio');
  if (render.audio?.narrated) {
    assert.ok(audioStream, "narrated reel must contain an audio stream");
    const total = render.audio.segments.reduce((sum, s) => sum + s.seconds, 0);
    assert.ok(parseFloat(audioStream.duration) > 0, "audio stream must be non-silent");
    assert.ok(
      parseFloat(audioStream.duration) >= total * 0.9,
      `audio duration ${audioStream.duration}s is shorter than narration ${total}s`
    );
    assert.ok(listing.includes("narration.txt"), "ZIP must include narration.txt when TTS is available");
  } else {
    assert.ok(!audioStream || parseFloat(audioStream.duration) === 0, "silent reel must carry no audio");
  }
  ok(
    `audio ${render.audio?.narrated ? "narrated" : "silent"} — ${audioStream ? audioStream.codec_name + " " + audioStream.duration + "s" : "none" }`
  );
  step("Downloads");
  for (const [artifact, type] of [
    ["reel", "video/mp4"],
    ["static", "image/png"],
    ["zip", "application/zip"],
    ["pdf", "application/pdf"],
  ]) {
    const res = await fetch(`${BASE}/api/projects/${project.id}/download/${artifact}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", new RegExp(type.split("/")[1]));
    await res.arrayBuffer();
  }
  ok("reel/zip/pdf all download with correct content types");

  step("Cleanup test project");
  const del = await fetch(`${BASE}/api/projects/${project.id}`, { method: "DELETE" });
  assert.equal(del.status, 204);
  assert.ok(!fs.existsSync(path.dirname(assetsDir)), "project dir should be gone");
  ok("deleted");

  console.log(`\n✅ ALL E2E CHECKS PASSED (paper: ${ARXIV_ID})`);
}

main().catch((err) => {
  console.error("\n❌ E2E FAILED:", err.message);
  process.exit(1);
});
