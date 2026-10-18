import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type {
  Carousel,
  ExportManifest,
  Project,
  RenderManifest,
  ReviewStatus,
} from "../types";
import ClaimsPanel from "../components/ClaimsPanel";
import CarouselPanel from "../components/CarouselPanel";
import RenderExportPanel from "../components/RenderExportPanel";

type Tab = "claims" | "carousel" | "render";

export default function ProjectPage() {
  const { id = "" } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("claims");
  const [dirtyCarousel, setDirtyCarousel] = useState(false);

  const load = useCallback(() => {
    api
      .getProject(id)
      .then(setProject)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onReview = async (claimId: string, status: ReviewStatus) => {
    try {
      await api.setClaimReview(id, claimId, status);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSaveCarousel = async (slides: Carousel["slides"]) => {
    await api.saveCarousel(id, slides);
    setDirtyCarousel(false);
    load();
  };

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-rust-500">{error}</p>
        <Link to="/" className="mt-4 block text-ember underline">
          ← Back home
        </Link>
      </div>
    );
  }

  if (!project) {
    return <p className="p-16 text-clay">Loading…</p>;
  }

  const approvedClaims = project.claims.filter(
    (c) => c.reviewStatus === "approved"
  ).length;

  const tabs: { key: Tab; label: string }[] = [
    { key: "claims", label: `Claims (${project.claims.length})` },
    { key: "carousel", label: `Carousel (${project.carousel.slides.length})` },
    { key: "render", label: "Render & Export" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link to="/" className="text-sm text-ember hover:underline">
        ← All projects
      </Link>
      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-bold">{project.paper?.title}</h1>
        <p className="mt-2 text-clay">
          {project.paper?.authors.slice(0, 3).join(", ")}
          {project.paper && project.paper.authors.length > 3 ? " et al." : ""} ·{" "}
          <a
            href={project.paper?.absUrl ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-ember hover:underline"
          >
            arXiv:{project.arxivId}
          </a>{" "}
          · {project.paper?.pageCount} pages · {approvedClaims}/
          {project.claims.length} claims approved
        </p>
      </header>

      <nav className="mb-6 flex gap-2 border-b border-clay/20 pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-ember text-ink-900"
                : "text-clay hover:bg-ink-800 hover:text-cream"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "claims" && (
        <ClaimsPanel claims={project.claims} onReview={onReview} />
      )}
      {tab === "carousel" && (
        <CarouselPanel
          key={project.updatedAt}
          carousel={project.carousel}
          claims={project.claims}
          onSave={onSaveCarousel}
          onDirtyChange={setDirtyCarousel}
        />
      )}
      {tab === "render" && (
        <RenderExportPanel
          projectId={project.id}
          render={project.render}
          exportManifest={project.export}
          dirtyCarousel={dirtyCarousel}
          onRendered={(m: RenderManifest) => {
            setProject({ ...project, render: m });
          }}
          onExported={(m: ExportManifest) => {
            setProject({ ...project, export: m });
          }}
        />
      )}
    </div>
  );
}
