/**
 * Claim-level extraction with verbatim source evidence.
 *
 * Each claim records:
 *  - text:      the claim sentence (cleaned)
 *  - evidence:  verbatim quote from the paper (with offsets into rawText)
 *  - section:   which paper section it came from
 *  - page:      1-based page number of the evidence
 *  - start/end: character offsets into the paper's raw extracted text
 */

const CLAIM_SECTION_BONUS = {
  abstract: 3,
  results: 4,
  "results and discussion": 4,
  discussion: 3,
  conclusion: 4,
  conclusions: 4,
  experiments: 2,
  introduction: 1,
};

const CLAIM_MARKERS = [
  // quantitative findings
  { re: /\b\d+(\.\d+)?\s?%/g, score: 3 },
  { re: /\b\d+(\.\d+)?x\b/gi, score: 2 },
  { re: /\bp\s?[<=>]\s?0?\.\d+/g, score: 3 },
  { re: /\b(confidence interval|odds? ratio|hazard ratio|relative risk)\b/gi, score: 3 },
  // comparative / superlative results
  { re: /\b(significantly|substantially|outperform(ed|s)?|superior|improv(e|es|ed|ement)|reduc(e|es|ed|tion)|increas(e|es|ed)|higher|lower|greater|faster|cheaper)\b/gi, score: 2 },
  { re: /\b(state[- ]of[- ]the[- ]art|best[- ]performing|novel|unprecedented)\b/gi, score: 2 },
  // finding language
  { re: /\b(we (find|found|show|demonstrate|observe|conclude)|our (results|findings|analysis|experiments) (show|suggest|indicate|demonstrate))\b/gi, score: 3 },
  { re: /\b(results? (show|suggest|indicate|demonstrate|reveal|confirm))\b/gi, score: 2 },
  { re: /\b(suggests? that|implies that|demonstrates that)\b/gi, score: 1 },
];

const NON_CLAIM_RE =
  /\b(figure|fig\.|table|see also|copyright|arxiv:|doi|et al\.,? \d{4})\b/i;

/** Heuristics to reject pdftotext table/figure artifacts. */
function tableArtifactPenalty(sentence) {
  let penalty = 0;
  const citationBrackets = sentence.match(/\[\d+(?:,\s*\d+)*\]/g) ?? [];
  if (citationBrackets.length >= 2) penalty -= 4;
  const digits = sentence.replace(/\s/g, "").match(/\d/g)?.length ?? 0;
  const total = sentence.replace(/\s/g, "").length || 1;
  if (digits / total > 0.25) penalty -= 5;
  // Rows from layout-mode tables have wide multi-space gutters.
  const gutters = sentence.match(/[^\s]\s{3,}[^\s]/g)?.length ?? 0;
  if (gutters >= 2) penalty -= 5;
  if (/^\W/.test(sentence)) penalty -= 2;
  return penalty;
}


/** Split text into sentences, preserving offsets into the original string. */
export function splitSentences(text) {
  const sentences = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      const next = text[i + 1];
      const isDecimal = /\d/.test(text[i - 1]) && /\d/.test(text[i + 1] ?? "");
      const isAbbrev = /[A-Z]\.$/.test(text.slice(Math.max(0, i - 3), i + 1));
      if (!isDecimal && !isAbbrev && (next === undefined || /\s/.test(next))) {
        let end = i + 1;
        while (end < text.length && /["')\]]/.test(text[end])) end++;
        if (end === text.length || /\s/.test(text[end])) {
          const raw = text.slice(start, end);
          const trimmedStart = raw.search(/\S/);
          if (trimmedStart !== -1) {
            sentences.push({
              text: raw.trim(),
              start: start + trimmedStart,
              end: start + raw.trimEnd().length,
            });
          }
          start = end;
        }
      }
    }
  }
  const tail = text.slice(start);
  const trimmedStart = tail.search(/\S/);
  if (trimmedStart !== -1) {
    sentences.push({
      text: tail.trim(),
      start: start + trimmedStart,
      end: start + tail.trimEnd().length,
    });
  }
  return sentences;
}

/** Normalize whitespace so we can locate a sentence inside rawText. */
export function locateInRaw(rawText, sentenceText) {
  const target = sentenceText.replace(/\s+/g, " ").trim();
  // Build a whitespace-normalized haystack plus a map from each normalized
  // index back to its raw index (for runs of whitespace, the last raw char).
  let haystack = "";
  const map = [];
  let pendingWs = false;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i];
    if (/\s/.test(ch)) {
      if (haystack.length > 0) pendingWs = true;
    } else {
      if (pendingWs) {
        haystack += " ";
        map.push(i - 1);
        pendingWs = false;
      }
      haystack += ch;
      map.push(i);
    }
  }
  const idx = haystack.indexOf(target);
  if (idx === -1) return null;
  const start = map[idx];
  const endIdx = idx + target.length - 1;
  const end = map[endIdx] + 1;
  return { start, end };
}


function scoreSentence(sentence, sectionHeading) {
  let score = 0;
  for (const marker of CLAIM_MARKERS) {
    if (marker.re.test(sentence)) score += marker.score;
    marker.re.lastIndex = 0;
  }
  score += CLAIM_SECTION_BONUS[sectionHeading.toLowerCase()] ?? 0;

  const words = sentence.split(/\s+/).length;
  if (words < 8) score -= 3;
  if (words > 60) score -= 2;
  if (NON_CLAIM_RE.test(sentence)) score -= 3;
  if (/^\(?\d+\)?$/.test(sentence)) score -= 5;
  score += tableArtifactPenalty(sentence);
  return score;
}

/**
 * Extract top claims from a parsed paper ({ abstract, sections, rawText, pageCount }).
 * Returns claims sorted by score, each with claim-level evidence.
 */
export function extractClaims(paper, { limit = 6, minScore = 3 } = {}) {
  const candidates = [];

  if (paper.abstract) {
    candidates.push({ heading: "abstract", pageNumber: 1, text: paper.abstract });
  }
  for (const section of paper.sections) {
    if (/references|acknowledg|appendix/.test(section.heading)) continue;
    candidates.push(section);
  }

  const results = [];
  const seen = new Set();
  for (const section of candidates) {
    for (const sent of splitSentences(section.text)) {
      if (sent.text.split(/\s+/).length < 8) continue;
      const key = sent.text.toLowerCase().replace(/\W/g, "").slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);

      const score = scoreSentence(sent.text, section.heading);
      if (score < minScore) continue;

      // Evidence is the verbatim sentence; locate it in full raw text for offsets.
      const loc = locateInRaw(paper.rawText ?? section.text, sent.text);
      results.push({
        text: sent.text,
        score,
        section: section.heading,
        page: section.pageNumber,
        start: loc ? loc.start : null,
        end: loc ? loc.end : null,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map((c, i) => ({
    id: `claim-${i + 1}`,
    // Display text: whitespace collapsed. The evidence quote below stays
    // verbatim (newlines from pdftotext layout intact) and `start`/`end` are
    // exact character offsets into paper.rawText for highlighting.
    text: c.text.replace(/\s+/g, " ").trim(),
    evidence: {
      quote: c.text,
      section: c.section,
      page: c.page,
      start: c.start,
      end: c.end,
    },
    score: c.score,
    reviewStatus: "pending",
  }));
}

