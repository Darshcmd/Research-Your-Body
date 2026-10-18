import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

const ARXIV_API = "https://export.arxiv.org/api/query?id_list=";

/**
 * Parse the small subset of Atom XML we need from the arXiv API.
 * Returns { title, abstract, authors, published, pdfUrl, absUrl, primaryCategory }
 */
export function parseArxivAtom(xml) {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) return null;
  const entry = entryMatch[1];

  const tag = (name) => {
    const m = entry.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    return m ? m[1].trim() : null;
  };
  const decode = (s) =>
    s == null
      ? s
      : s
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim();

  const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)].map(
    (m) => decode(m[1])
  );

  const idUrl = tag("id");
  const absUrl = idUrl || null;
  const pdfLink = entry.match(
    /<link href="([^"]+)"[^>]*title="pdf"/
  );
  const category = entry.match(/<arxiv:primary_category[^>]*term="([^"]+)"/);

  return {
    title: decode(tag("title")),
    abstract: decode(tag("summary")),
    authors,
    published: tag("published"),
    updated: tag("updated"),
    absUrl,
    pdfUrl: pdfLink ? pdfLink[1] : absUrl ? absUrl.replace("/abs/", "/pdf/") : null,
    primaryCategory: category ? category[1] : null,
  };
}

export async function fetchArxivMetadata(arxivId) {
  const url = `${ARXIV_API}${encodeURIComponent(arxivId)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "ResearchYourBody/1.0 (educational pipeline)" },
  });
  if (!res.ok) {
    throw new Error(`arXiv API returned ${res.status} for ${arxivId}`);
  }
  const xml = await res.text();
  const meta = parseArxivAtom(xml);
  if (!meta || !meta.title) {
    throw new Error(`No arXiv entry found for "${arxivId}". Check the identifier.`);
  }
  return meta;
}

/** Download the paper PDF to destPath. */
export async function downloadPdf(pdfUrl, destPath) {
  const res = await fetch(pdfUrl, {
    headers: { "User-Agent": "ResearchYourBody/1.0 (educational pipeline)" },
  });
  if (!res.ok) {
    throw new Error(`Failed to download PDF (${res.status}) from ${pdfUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000 || buf.subarray(0, 5).toString() !== "%PDF-") {
    throw new Error("Downloaded file is not a valid PDF");
  }
  await fs.writeFile(destPath, buf);
  return destPath;
}

/** Extract text from a PDF using the system pdftotext (poppler).
 * Default (non-layout) mode is used because it restores reading order in
 * multi-column papers, which keeps sentences locatable for evidence offsets. */
export async function extractPdfText(pdfPath, txtPath) {
  await execFileAsync("pdftotext", [pdfPath, txtPath]);
  const raw = await fs.readFile(txtPath, "utf8");
  return raw;
}

/**
 * Split extracted text into pages on form feeds, then into sections using
 * common academic heading patterns. Returns { pages, sections } where each
 * section is { heading, pageNumber, text }.
 */
export function parseDocument(rawText) {
  const pageTexts = rawText.split("\f");
  // pdftotext -layout keeps line structure; normalize trailing whitespace per line.
  const pages = pageTexts.map((p) => p.replace(/[ \t]+$/gm, "").trimEnd());

  const headingRe =
    /^\s*(?:\d+(?:\.\d+)*\.?\s+)?(abstract|introduction|background|related work|related works|methods?|methodology|materials and methods|experimental setup|experiments?|results?(?: and discussion)?|discussion|conclusions?|limitations?|acknowledg(e)?ments?|references|appendix(?: [a-z])?)\s*[:.]?\s*$/i;

  const sections = [];
  let current = { heading: "Front", pageNumber: 1, lines: [] };

  const flush = () => {
    const text = current.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (text) {
      sections.push({
        heading: current.heading,
        pageNumber: current.pageNumber,
        text,
      });
    }
  };

  pages.forEach((page, idx) => {
    const pageNumber = idx + 1;
    page.split("\n").forEach((line) => {
      const m = line.match(headingRe);
      // Skip headings that are actually part of a sentence (inline) or captions.
      if (m && line.trim().length < 60) {
        flush();
        current = { heading: m[1].replace(/\s+/g, " ").toLowerCase(), pageNumber, lines: [] };
      } else {
        current.lines.push(line);
      }
    });
  });
  flush();

  return { pages, sections };
}

/** Full ingestion pipeline for an arXiv id. Writes pdf/txt into assetDir. */
export async function ingestArxivPaper(arxivId, assetDir) {
  const metadata = await fetchArxivMetadata(arxivId);
  if (!metadata.pdfUrl) {
    throw new Error(`No PDF link found for ${arxivId}`);
  }
  const pdfPath = path.join(assetDir, "paper.pdf");
  const txtPath = path.join(assetDir, "paper.txt");
  await downloadPdf(metadata.pdfUrl, pdfPath);
  const rawText = await extractPdfText(pdfPath, txtPath);
  const { pages, sections } = parseDocument(rawText);

  return {
    source: "arxiv",
    arxivId,
    title: metadata.title,
    abstract: metadata.abstract,
    authors: metadata.authors,
    published: metadata.published,
    absUrl: metadata.absUrl,
    pdfUrl: metadata.pdfUrl,
    primaryCategory: metadata.primaryCategory,
    pageCount: pages.length,
    sections,
    rawText,
  };
}
