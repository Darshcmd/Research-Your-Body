export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Evidence {
  quote: string;
  section: string;
  page: number;
  start: number | null;
  end: number | null;
}

export interface Claim {
  id: string;
  text: string;
  evidence: Evidence;
  score: number;
  reviewStatus: ReviewStatus;
  note?: string;
}

export interface Slide {
  id: string;
  kind: "title" | "claim" | "source";
  claimId: string | null;
  heading: string;
  body: string;
  citation: string;
  reviewStatus: ReviewStatus;
  edited: boolean;
}

export interface Carousel {
  slides: Slide[];
  generatedAt?: string;
}

export interface RenderManifest {
  renderedAt: string;
  static: {
    file: string;
    width: number;
    height: number;
  };
  reel: {
    file: string;
    width: number;
    height: number;
    secondsPerSlide: number | null; // null => reel is narrated, not timed
    slideCount: number;
    durationSeconds: number;
    audio: {
      narrated: boolean;
      voice?: string;
      durationSeconds: number;
      segments?: { slideId: string; text: string; seconds: number }[];
    } | null;
  };
}

export interface ExportManifest {
  file: string;
  bytes: number;
  files: string[];
}

export interface Paper {
  source: string;
  arxivId: string;
  title: string;
  abstract: string;
  authors: string[];
  published: string | null;
  absUrl: string | null;
  pdfUrl: string | null;
  primaryCategory: string | null;
  pageCount: number;
  sections: { heading: string; pageNumber: number; text: string }[];
  rawText: string;
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  arxivId: string;
  paper: Paper | null;
  claims: Claim[];
  carousel: Carousel;
  render: RenderManifest | null;
  export: ExportManifest | null;
}

export interface ProjectSummary {
  id: string;
  arxivId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  claimCount: number;
  slideCount: number;
  rendered: boolean;
  exported: boolean;
}
