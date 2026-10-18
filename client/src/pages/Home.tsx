import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ProjectSummary } from "../types";

export default function Home() {
  const [arxivId, setArxivId] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.listProjects().then(setProjects).catch((e) => setError(e.message));
  }, []);

  const ingest = async (e: FormEvent) => {
    e.preventDefault();
    if (!arxivId.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const project = await api.createProject(arxivId.trim());
      navigate(`/project/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-bold">
          Research <span className="text-ember">Your</span> Body
        </h1>
        <p className="mt-3 text-clay">
          Turn a real research paper into reviewed, sourced social content —
          claim-level evidence in, carousel + reel out.
        </p>
      </header>

      <form onSubmit={ingest} className="rounded-xl bg-ink-800 p-6">
        <label htmlFor="arxivId" className="block text-sm font-semibold text-blush">
          arXiv paper ID
        </label>
        <div className="mt-2 flex gap-3">
          <input
            id="arxivId"
            value={arxivId}
            onChange={(e) => setArxivId(e.target.value)}
            placeholder="e.g. 1706.03762"
            className="flex-1 rounded-lg border border-clay/30 bg-ink-900 px-4 py-2 text-cream placeholder:text-clay/60 focus:border-ember focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-ember px-5 py-2 font-semibold text-ink-900 transition hover:bg-rust-500 disabled:opacity-50"
          >
            {loading ? "Ingesting…" : "Ingest paper"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-rust-500">{error}</p>}
      </form>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-blush">Your projects</h2>
        {projects.length === 0 ? (
          <p className="text-clay">No projects yet. Ingest a paper to get started.</p>
        ) : (
          <ul className="space-y-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/project/${p.id}`}
                  className="block rounded-lg bg-ink-800 p-4 transition hover:bg-ink-700"
                >
                  <div className="font-semibold">{p.title ?? p.arxivId}</div>
                  <div className="mt-1 text-sm text-clay">
                    arXiv:{p.arxivId} · {p.claimCount} claims · {p.slideCount} slides
                    {p.rendered ? " · rendered" : ""}
                    {p.exported ? " · exported" : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
