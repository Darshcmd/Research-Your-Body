import test from "node:test";
import assert from "node:assert/strict";
import { splitSentences, locateInRaw, extractClaims } from "../lib/claims.js";
import { parseDocument, parseArxivAtom } from "../lib/ingest.js";
import { buildCarousel } from "../lib/carousel.js";
import { slideToSvg, wrapText, collageLayout } from "../lib/render.js";

test("splitSentences keeps offsets and handles decimals", () => {
  const text = "The model improved by 5.3%. We tested 100 patients. Results were clear!";
  const s = splitSentences(text);
  assert.equal(s.length, 3);
  assert.equal(s[0].text, "The model improved by 5.3%.");
  assert.equal(text.slice(s[0].start, s[0].end), s[0].text);
  assert.equal(text.slice(s[1].start, s[1].end), s[1].text);
});

test("locateInRaw finds verbatim offsets across whitespace", () => {
  const raw = "Intro line.\n\nThe finding   is\nimportant here. Tail.";
  const loc = locateInRaw(raw, "The finding is important here.");
  assert.ok(loc, "location should be found");
  assert.equal(raw.slice(loc.start, loc.end).replace(/\s+/g, " "), "The finding is important here.");
});

const SAMPLE_PAPER = {
  title: "Sample Study",
  abstract:
    "We randomly assigned 200 adults to two groups. The intervention group showed a 15% improvement in outcomes compared with placebo (p < 0.01).",
  sections: [
    {
      heading: "introduction",
      pageNumber: 1,
      text: "Prior work has studied this question over many years across different populations and settings.",
    },
    {
      heading: "results",
      pageNumber: 3,
      text:
        "We find that treatment A significantly reduces blood pressure versus control. " +
        "Figure 2 shows the timeline of the study procedures and visits. " +
        "Adverse events were lower in the treatment group by 12% relative to placebo arm.",
    },
    {
      heading: "references",
      pageNumber: 9,
      text: "1. Smith J. Prior work. Journal. 2020.",
    },
  ],
  rawText: "",
  pageCount: 10,
};
SAMPLE_PAPER.rawText = [SAMPLE_PAPER.abstract, ...SAMPLE_PAPER.sections.map((s) => s.text)].join(
  "\n\n"
);

test("extractClaims returns claims with claim-level evidence", () => {
  const claims = extractClaims(SAMPLE_PAPER, { limit: 5 });
  assert.ok(claims.length >= 2, `expected >=2 claims, got ${claims.length}`);
  for (const c of claims) {
    assert.ok(c.id.startsWith("claim-"));
    assert.ok(c.evidence.quote.length > 0);
    assert.ok(c.evidence.section.length > 0);
    assert.ok(c.evidence.page >= 1);
    assert.equal(c.reviewStatus, "pending");
  }
  // The strongest quantitative finding should be present.
  const joined = claims.map((c) => c.text).join(" || ");
  assert.match(joined, /15%|p < 0\.01|significantly reduces|12%/);
  // Reference-list sentences must not become claims.
  assert.doesNotMatch(joined, /Smith J\./);
});

test("parseDocument splits pages and detects headings", () => {
  const raw = "Title stuff\nAbstract\nWe find a 10% effect in group A.\f\n1 Introduction\nBackground text here.\n2 Results\nMore findings, 20% improvement.\f\nReferences\n1. Some ref.";
  const { pages, sections } = parseDocument(raw);
  assert.equal(pages.length, 3);
  const headings = sections.map((s) => s.heading);
  assert.ok(headings.includes("abstract"));
  assert.ok(headings.includes("introduction"));
  assert.ok(headings.includes("results"));
  assert.ok(headings.includes("references"));
});

test("parseArxivAtom extracts metadata", () => {
  const xml = `<?xml version='1.0'?><feed><entry><id>http://arxiv.org/abs/1706.03762v7</id><title>Attention Is All You Need</title><summary>The dominant sequence transduction models &amp; more.</summary><link href="https://arxiv.org/pdf/1706.03762v7" rel="related" title="pdf"/><arxiv:primary_category term="cs.CL"/><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author><published>2017-06-12T17:57:34Z</published></entry></feed>`;
  const meta = parseArxivAtom(xml);
  assert.equal(meta.title, "Attention Is All You Need");
  assert.match(meta.abstract, /dominant sequence transduction models & more/);
  assert.deepEqual(meta.authors, ["Ashish Vaswani", "Noam Shazeer"]);
  assert.equal(meta.primaryCategory, "cs.CL");
  assert.equal(meta.pdfUrl, "https://arxiv.org/pdf/1706.03762v7");
});

test("buildCarousel makes title, claim, and source slides linked to claims", () => {
  const claims = extractClaims(SAMPLE_PAPER, { limit: 5 });
  const carousel = buildCarousel(SAMPLE_PAPER, claims);
  assert.ok(carousel.slides.length >= 3);
  assert.equal(carousel.slides[0].kind, "title");
  assert.equal(carousel.slides[carousel.slides.length - 1].kind, "source");
  const claimSlides = carousel.slides.filter((s) => s.kind === "claim");
  assert.ok(claimSlides.length >= 1);
  for (const s of claimSlides) {
    assert.ok(s.claimId, "claim slide must reference a claim id");
    assert.ok(claims.some((c) => c.id === s.claimId));
  }
});

test("slideToSvg escapes XML and wraps text", () => {
  const svg = slideToSvg(
    { kind: "claim", heading: "A & B <C>", body: "body text", citation: "" },
    { absUrl: "https://arxiv.org/abs/1234.56789", authors: ["Jane Doe"] }
  );
  assert.match(svg, /A &amp; B &lt;C&gt;/);
  assert.match(svg, /<svg width="1080" height="1350"/);
  const lines = wrapText("one two three four five six", 9);
  assert.ok(lines.every((l) => l.length <= 9));
});

test("collageLayout grids every slide into one canvas", () => {
  // 7 slides -> ceil(sqrt(7)) = 3 cols, 3 rows
  const l7 = collageLayout(7);
  assert.equal(l7.cols, 3);
  assert.equal(l7.rows, 3);
  assert.equal(l7.width, 64 * 2 + 3 * 480 + 2 * 48); // margin*2 + cells + gaps
  assert.equal(l7.height, 180 + 64 + 3 * 600 + 2 * 48 + 64);
  // 1 slide -> single cell
  const l1 = collageLayout(1);
  assert.equal(l1.cols, 1);
  assert.equal(l1.rows, 1);
  assert.ok(l1.width < l1.height, "single-slide canvas is portrait");
  // 4 slides -> 2x2
  const l4 = collageLayout(4);
  assert.equal(l4.cols, 2);
  assert.equal(l4.rows, 2);
});
