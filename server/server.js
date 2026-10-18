/**
 * Research Your Body — paper → claims → carousel → reel pipeline server.
 */
import express from "express";
import cors from "cors";
import path from "node:path";
import {
  ensureDataDir,
  createProject,
  getProject,
  listProjects,
  saveProject,
  deleteProject,
  projectAssetDir,
  DATA_DIR,
} from "./lib/store.js";
import { ingestArxivPaper } from "./lib/ingest.js";
import { extractClaims } from "./lib/claims.js";
import { buildCarousel } from "./lib/carousel.js";
import { renderProjectAssets } from "./lib/render.js";
import { exportProjectZip } from "./lib/export.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({ origin: true }));

const PORT = Number(process.env.PORT) || 3001;
const VALID_STATUSES = ["pending", "approved", "rejected"];

async function loadProject(req, res) {
  const project = await getProject(req.params.id);
  if (!project) {
    res.status(404).json({ error: `Project ${req.params.id} not found` });
    return null;
  }
  return project;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "research-your-body" });
});

app.get("/api/projects", async (_req, res) => {
  const projects = await listProjects();
  res.json(
    projects.map((p) => ({
      id: p.id,
      arxivId: p.arxivId,
      title: p.paper?.title ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      claimCount: p.claims.length,
      slideCount: p.carousel.slides.length,
      rendered: Boolean(p.render),
      exported: Boolean(p.export),
    }))
  );
});

app.post("/api/projects", async (req, res) => {
  const arxivId = String(req.body?.arxivId ?? "")
    .trim()
    .replace(/^https?:\/\/(www\.)?arxiv\.org\/(abs|pdf)\//, "")
    .replace(/v\d+$/, "")
    .replace(/\.pdf$/, "");
  if (!/^\d{4}\.\d{4,5}$/.test(arxivId) && !/^[a-z-]+(\.[A-Z]{2})?\/\d{7}$/.test(arxivId)) {
    return res.status(400).json({
      error:
        "Invalid arXiv id. Use a modern id like 1706.03762 or an old-style id like hep-th/9901001.",
    });
  }

  try {
    const project = await createProject({ arxivId });
    const assetDir = await projectAssetDir(project.id);
    project.paper = await ingestArxivPaper(arxivId, assetDir);
    project.claims = extractClaims(project.paper);
    project.carousel = buildCarousel(project.paper, project.claims);
    await saveProject(project);
    res.status(201).json(project);
  } catch (err) {
    console.error(`Ingest failed for ${arxivId}:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  const project = await loadProject(req, res);
  if (project) res.json(project);
});

app.delete("/api/projects/:id", async (req, res) => {
  const ok = await deleteProject(req.params.id);
  if (ok) res.status(204).end();
  else res.status(404).json({ error: "Project not found" });
});

// --- Claims: claim-level review status -------------------------------------

app.patch("/api/projects/:id/claims/:claimId", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;
  const claim = project.claims.find((c) => c.id === req.params.claimId);
  if (!claim) return res.status(404).json({ error: `Claim ${req.params.claimId} not found` });

  const { reviewStatus, note } = req.body ?? {};
  if (reviewStatus !== undefined) {
    if (!VALID_STATUSES.includes(reviewStatus)) {
      return res.status(400).json({ error: `reviewStatus must be one of ${VALID_STATUSES}` });
    }
    claim.reviewStatus = reviewStatus;
  }
  if (note !== undefined) claim.note = String(note).slice(0, 2000);

  await saveProject(project);
  res.json(claim);
});

// --- Carousel: editable slides ---------------------------------------------

app.put("/api/projects/:id/carousel", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;
  const slides = req.body?.slides;
  if (!Array.isArray(slides) || slides.length === 0) {
    return res.status(400).json({ error: "slides must be a non-empty array" });
  }
  for (const s of slides) {
    if (typeof s.heading !== "string" || typeof s.body !== "string") {
      return res.status(400).json({ error: "each slide needs string heading/body" });
    }
    if (s.reviewStatus !== undefined && !VALID_STATUSES.includes(s.reviewStatus)) {
      return res.status(400).json({ error: `reviewStatus must be one of ${VALID_STATUSES}` });
    }
  }
  // Preserve identity fields from the server model where possible.
  project.carousel = {
    ...project.carousel,
    slides: slides.map((s, i) => ({
      id: s.id ?? `slide-${i + 1}`,
      kind: s.kind ?? "claim",
      claimId: s.claimId ?? null,
      heading: String(s.heading),
      body: String(s.body),
      citation: String(s.citation ?? project.paper?.absUrl ?? ""),
      reviewStatus: s.reviewStatus ?? "pending",
      edited: s.edited ?? true,
    })),
    updatedAt: new Date().toISOString(),
  };
  await saveProject(project);
  res.json(project.carousel);
});

// --- Render: PNGs + MP4 reel ------------------------------------------------

app.post("/api/projects/:id/render", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;
  if (!project.paper || project.carousel.slides.length === 0) {
    return res.status(409).json({ error: "Project has no paper or no slides to render" });
  }
  try {
    const assetDir = await projectAssetDir(project.id);
    project.render = await renderProjectAssets(project, assetDir);
    await saveProject(project);
    res.json(project.render);
  } catch (err) {
    console.error(`Render failed for ${project.id}:`, err);
    res.status(500).json({ error: `Render failed: ${err.message}` });
  }
});

// --- Export: ZIP of deliverables --------------------------------------------

app.post("/api/projects/:id/export", async (req, res) => {
  const project = await loadProject(req, res);
  if (!project) return;
  if (!project.render) {
    return res.status(409).json({ error: "Render the project before exporting" });
  }
  try {
    const assetDir = await projectAssetDir(project.id);
    project.export = await exportProjectZip(project, assetDir);
    await saveProject(project);
    res.json(project.export);
  } catch (err) {
    console.error(`Export failed for ${project.id}:`, err);
    res.status(500).json({ error: `Export failed: ${err.message}` });
  }
});

// --- Asset downloads --------------------------------------------------------

app.get("/api/projects/:id/assets/:file", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const file = path.basename(req.params.file);
  const abs = path.join(DATA_DIR, project.id, "assets", file);
  res.sendFile(abs, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: `Asset ${file} not found` });
  });
});

app.get("/api/projects/:id/download/:artifact", async (req, res) => {
  const project = await getProject(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });
  const map = {
    reel: project.render?.reel?.file,
    static: project.render?.static?.file,
    zip: project.export?.file,
    pdf: "paper.pdf",
  };
  const file = map[req.params.artifact];
  if (!file) return res.status(404).json({ error: "Artifact not available" });
  const abs = path.join(DATA_DIR, project.id, "assets", file);
  res.download(abs, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File not generated yet" });
  });
});

await ensureDataDir();
app.listen(PORT, () => {
  console.log(`Research Your Body server listening on http://localhost:${PORT}`);
});

