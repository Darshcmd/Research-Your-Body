/**
 * Carousel generation: turn reviewed/top claims into an editable slide deck.
 * Slide 1 is a title card, slides 2..n are claim cards, last slide is a
 * source card. Every slide carries claimId (except title/source) so the UI
 * can show claim-level evidence next to each slide.
 */

const MAX_CLAIM_SLIDES = 5;

function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : cut.length).trimEnd()}…`;
}

export function buildCarousel(paper, claims) {
  const slides = [];
  const firstAuthor = paper.authors?.[0] ?? "Unknown";
  const authorCount = paper.authors?.length ?? 0;

  slides.push({
    id: "slide-1",
    kind: "title",
    claimId: null,
    heading: paper.title,
    body:
      `${firstAuthor}${authorCount > 1 ? " et al." : ""} · ${paper.primaryCategory ?? "arXiv"}` +
      (paper.published ? ` · ${paper.published.slice(0, 4)}` : ""),
    citation: paper.absUrl ?? "",
    reviewStatus: "approved", // title card has no claim to review
    edited: false,
  });

  // Prefer approved claims, then pending, then rejected last (or drop rejected).
  const rank = { approved: 0, pending: 1 };
  const ordered = [...claims]
    .filter((c) => c.reviewStatus !== "rejected")
    .sort((a, b) => (rank[a.reviewStatus] ?? 2) - (rank[b.reviewStatus] ?? 2));

  ordered.slice(0, MAX_CLAIM_SLIDES).forEach((claim, i) => {
    slides.push({
      id: `slide-${i + 2}`,
      kind: "claim",
      claimId: claim.id,
      heading: truncate(claim.text, 180),
      body: `Source: ${claim.evidence.section}, p. ${claim.evidence.page}`,
      citation: paper.absUrl ?? "",
      reviewStatus: "pending",
      edited: false,
    });
  });

  slides.push({
    id: `slide-${slides.length + 1}`,
    kind: "source",
    claimId: null,
    heading: "Read the full paper",
    body: paper.title,
    citation: paper.absUrl ?? "",
    reviewStatus: "approved",
    edited: false,
  });

  return { slides, generatedAt: new Date().toISOString() };
}
