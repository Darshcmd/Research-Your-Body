/**
 * Export: bundle deliverables (MP4 reel, static PNGs, claims JSON with
 * evidence, carousel JSON, paper PDF/metadata, manifest) into one ZIP.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";

/**
 * Build deliverables/<projectId>-export.zip inside assetDir.
 * Returns { file, bytes, files } manifest of what was packed.
 */
export async function exportProjectZip(project, assetDir) {
  const outName = `deliverables-${project.id}.zip`;
  const outPath = path.join(assetDir, outName);

  const packed = [];

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(output);

    const addIfExists = (absPath, nameInZip) => {
      if (fs.existsSync(absPath)) {
        archive.file(absPath, { name: nameInZip });
        packed.push(nameInZip);
      }
    };

    // The three deliverables: one carousel, one static graphic, one reel
    // (+ provenance: source PDF, claims with evidence, manifest).
    if (project.render) {
      addIfExists(path.join(assetDir, project.render.static.file), "static.png");
      addIfExists(path.join(assetDir, project.render.reel.file), "reel.mp4");
    }

    // Paper source
    addIfExists(path.join(assetDir, "paper.pdf"), "paper/paper.pdf");

    // Structured deliverables
    const claimsDoc = {
      paper: {
        title: project.paper?.title,
        arxivId: project.arxivId,
        absUrl: project.paper?.absUrl,
        authors: project.paper?.authors,
      },
      exportedAt: new Date().toISOString(),
      claims: project.claims.map((c) => ({
        id: c.id,
        claim: c.text,
        reviewStatus: c.reviewStatus,
        evidence: c.evidence,
      })),
    };
    archive.append(JSON.stringify(claimsDoc, null, 2), { name: "claims.json" });
    packed.push("claims.json");

    archive.append(JSON.stringify(project.carousel, null, 2), {
      name: "carousel.json",
    });
    packed.push("carousel.json");

    const manifest = {
      project: project.id,
      title: project.paper?.title,
      arxivId: project.arxivId,
      render: project.render,
      reviewSummary: {
        claims: project.claims.reduce((acc, c) => {
          acc[c.reviewStatus] = (acc[c.reviewStatus] ?? 0) + 1;
          return acc;
        }, {}),
        slides: project.carousel.slides.reduce((acc, s) => {
          acc[s.reviewStatus] = (acc[s.reviewStatus] ?? 0) + 1;
          return acc;
        }, {}),
      },
      files: packed,
    };
    archive.append(JSON.stringify(manifest, null, 2), {
      name: "manifest.json",
    });
    packed.push("manifest.json");

    // Narration script, when speech is available.
    const reel = project.render?.reel ?? {};
    const audio = reel.audio ?? {};
    if (audio.narrated && Array.isArray(audio.segments) && audio.segments.length) {
      const script = [
        `Narration script — ${manifest.title ?? project.id}`,
        `Project: ${project.id}  ·  Exported: ${new Date().toISOString()}`,
        `Voice: ${audio.voice ?? "system default"}  ·  Slides: ${audio.segments.length}`,
        ...audio.segments.map(
          (s, i) =>
            `${i + 1}. [slide:${s.slideId}] ${s.text}  (${s.seconds}s)`
        ),
      ];
      archive.append(
        script.map((l) => l + "\n").join(""),
        { name: "narration.txt" }
      );
      packed.push("narration.txt");
    }

    archive.finalize();
  });

  const stat = await fsp.stat(outPath);
  return { file: outName, bytes: stat.size, files: packed };
}
