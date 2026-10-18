/**
 * Inline SVG diagrams for slides (posts). All are deterministic — derived
 * from the ingested paper + extracted claims, no external services:
 *
 *  - evidence chain: arXiv id → section → page → claim (finding slides)
 *  - paper map:      proportional section strip (title slide)
 *  - stats row:      findings/pages/sections at a glance (source slide)
 */

export const PALETTE = {
  bg: "#12100E",
  panel: "#1D1A16",
  accent: "#E0662B",
  text: "#F5EBDF",
  dim: "#B58777",
  good: "#5FBF8A",
};

export function escapeXml(s) {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clip(text, max) {
  const t = String(text ?? "");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Chain of provenance boxes with arrows: SOURCE → SECTION → PAGE → CLAIM. */
export function evidenceChainSvg({ x, y, w, h, paper, claim, scale = 1 }) {
  const boxH = Math.min(78 * scale, h - 44 * scale);
  const gap = 26 * scale;
  const boxW = (w - gap * 3) / 4;
  const fs = Math.max(14, Math.round(21 * scale));
  const labelFs = Math.max(11, Math.round(14 * scale));
  const items = [
    { label: "SOURCE", value: `arXiv:${paper?.arxivId ?? "?"}`, accent: false },
    { label: "SECTION", value: clip(claim?.evidence?.section ?? "—", 14), accent: false },
    { label: "PAGE", value: `${claim?.evidence?.page ?? "?"}`, accent: false },
    { label: "CLAIM", value: "verified quote", accent: true },
  ];

  const parts = [
    `<text x="${x}" y="${y + 16 * scale}" fill="${PALETTE.accent}" font-size="${labelFs}" font-weight="700" letter-spacing="${3 * scale}" font-family="Helvetica, Arial, sans-serif">WHERE THIS COMES FROM</text>`,
  ];
  const top = y + 30 * scale;
  items.forEach((item, i) => {
    const bx = x + i * (boxW + gap);
    parts.push(
      `<rect x="${bx}" y="${top}" width="${boxW}" height="${boxH}" rx="${8 * scale}" fill="${PALETTE.panel}" stroke="${item.accent ? PALETTE.accent : "#3a322b"}" stroke-width="${item.accent ? 2.5 : 1.5}"/>`
    );
    parts.push(
      `<text x="${bx + boxW / 2}" y="${top + 24 * scale}" text-anchor="middle" fill="${PALETTE.dim}" font-size="${labelFs}" letter-spacing="${1.5 * scale}" font-family="Helvetica, Arial, sans-serif">${item.label}</text>`
    );
    parts.push(
      `<text x="${bx + boxW / 2}" y="${top + 54 * scale}" text-anchor="middle" fill="${item.accent ? PALETTE.accent : PALETTE.text}" font-size="${fs}" font-weight="700" font-family="Helvetica, Arial, sans-serif">${escapeXml(item.value)}</text>`
    );
    if (i < items.length - 1) {
      const ax = bx + boxW + gap / 2;
      const ay = top + boxH / 2;
      parts.push(
        `<path d="M ${bx + boxW + 4} ${ay} L ${bx + boxW + gap - 6} ${ay}" stroke="${PALETTE.accent}" stroke-width="${2.5 * scale}"/>`,
        `<path d="M ${bx + boxW + gap - 6} ${ay} l ${-8 * scale} ${-5 * scale} l 0 ${10 * scale} z" fill="${PALETTE.accent}"/>`
      );
      void ax;
    }
  });
  return parts.join("\n");
}


/** Proportional strip of the paper's sections (title slide). */
export function paperMapSvg({ x, y, w, h, paper, scale = 1 }) {
  const sections = (paper?.sections ?? []).filter((s) => s.text.length > 0);
  if (sections.length === 0) return "";
  const labelFs = Math.max(11, Math.round(14 * scale));
  const fs = Math.max(12, Math.round(17 * scale));
  const barY = y + 30 * scale;
  const barH = Math.min(34 * scale, h - 62 * scale);
  const total = sections.reduce((sum, s) => sum + s.text.length, 0);

  const shades = [PALETTE.accent, "#C9581F", "#A34324", "#8a351d", "#6b4a3a", PALETTE.dim];
  const parts = [
    `<text x="${x}" y="${y + 16 * scale}" fill="${PALETTE.accent}" font-size="${labelFs}" font-weight="700" letter-spacing="${3 * scale}" font-family="Helvetica, Arial, sans-serif">PAPER MAP</text>`,
  ];

  let cursor = x;
  sections.forEach((s, i) => {
    const segW = (s.text.length / total) * w;
    parts.push(
      `<rect x="${cursor}" y="${barY}" width="${Math.max(segW, 2)}" height="${barH}" fill="${shades[i % shades.length]}"/>`
    );
    cursor += segW;
  });

  // Legend under the bar: section + share, capped to fit one line.
  const legendY = barY + barH + 24 * scale;
  let legendX = x;
  const legendBudget = w - 20 * scale;
  const chosen = sections.filter((s) => s.text.length / total > 0.06).slice(0, 5);
  for (const s of chosen) {
    const share = Math.round((s.text.length / total) * 100);
    const entry = `${s.heading} ${share}%`;
    parts.push(
      `<text x="${legendX}" y="${legendY}" fill="${PALETTE.dim}" font-size="${fs}" font-family="Helvetica, Arial, sans-serif">${escapeXml(clip(entry, 24))}</text>`
    );
    legendX += entry.length * fs * 0.56 + 26 * scale;
    if (legendX > x + legendBudget) break;
  }
  return parts.join("\n");
}

/** Big numbers: findings / pages / sections (source slide). */
export function statsRowSvg({ x, y, w, h, paper, claimCount, scale = 1 }) {
  const stats = [
    { value: String(claimCount ?? 0), label: "findings" },
    { value: String(paper?.pageCount ?? 0), label: "pages" },
    { value: String((paper?.sections ?? []).length), label: "sections" },
  ];
  const labelFs = Math.max(11, Math.round(14 * scale));
  const valueFs = Math.max(34, Math.round(56 * scale));
  const statFs = Math.max(12, Math.round(18 * scale));
  const cellW = w / stats.length;
  const parts = [
    `<text x="${x}" y="${y + 16 * scale}" fill="${PALETTE.accent}" font-size="${labelFs}" font-weight="700" letter-spacing="${3 * scale}" font-family="Helvetica, Arial, sans-serif">AT A GLANCE</text>`,
  ];
  const baseY = y + 30 * scale;
  stats.forEach((s, i) => {
    const cx = x + i * cellW + cellW / 2;
    parts.push(
      `<text x="${cx}" y="${baseY + valueFs}" text-anchor="middle" fill="${PALETTE.text}" font-size="${valueFs}" font-weight="700" font-family="Helvetica, Arial, sans-serif">${escapeXml(s.value)}</text>`,
      `<text x="${cx}" y="${baseY + valueFs + 26 * scale}" text-anchor="middle" fill="${PALETTE.dim}" font-size="${statFs}" font-family="Helvetica, Arial, sans-serif">${escapeXml(s.label)}</text>`
    );
    if (i > 0) {
      parts.push(
        `<line x1="${x + i * cellW}" y1="${baseY + 8 * scale}" x2="${x + i * cellW}" y2="${baseY + valueFs + 30 * scale}" stroke="${PALETTE.panel}" stroke-width="2"/>`
      );
    }
  });
  return parts.join("\n");
}

/** Pick the diagram for a slide (or "" if none fits). */
export function diagramForSlide(slide, paper, claims, { x, y, w, h, scale = 1 }) {
  if (h < 110 * scale) return "";
  if (slide.kind === "claim") {
    const claim = claims.find((c) => c.id === slide.claimId);
    if (!claim) return "";
    return evidenceChainSvg({ x, y, w, h, paper, claim, scale });
  }
  if (slide.kind === "title") return paperMapSvg({ x, y, w, h, paper, scale });
  if (slide.kind === "source")
    return statsRowSvg({
      x,
      y,
      w,
      h,
      paper,
      claimCount: claims.length,
      scale,
    });
  return "";
}
