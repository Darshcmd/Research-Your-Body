import { useState } from "react";
import type { Carousel, Claim, ReviewStatus } from "../types";

interface Props {
  carousel: Carousel;
  claims: Claim[];
  onSave: (slides: Carousel["slides"]) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

export default function CarouselPanel({ carousel, claims, onSave, onDirtyChange }: Props) {
  const [slides, setSlides] = useState<Carousel["slides"]>(() =>
    carousel.slides.map((s) => ({ ...s }))
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const mutate = (next: Carousel["slides"]) => {
    setSlides(next);
    setDirty(true);
    onDirtyChange(true);
    setMessage(null);
  };

  const editSlide = (index: number, patch: Partial<Carousel["slides"][number]>) => {
    mutate(slides.map((s, i) => (i === index ? { ...s, ...patch, edited: true } : s)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    [next[index], next[target]] = [next[target], next[index]];
    mutate(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(slides);
      setDirty(false);
      onDirtyChange(false);
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const claimById = (id: string | null) => claims.find((c) => c.id === id);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-clay">
          Edit headings, bodies, order, and per-slide review status. Changes are
          saved to the server and picked up by the renderer.
        </p>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-rust-500 disabled:opacity-40"
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
      {message && <p className="mb-3 text-sm text-blush">{message}</p>}

      <ol className="space-y-4">
        {slides.map((slide, i) => {
          const claim = claimById(slide.claimId);
          return (
            <li key={slide.id} className="rounded-xl bg-ink-800 p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded bg-ink-700 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-clay">
                  {slide.id} · {slide.kind}
                  {slide.edited ? " · edited" : ""}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="rounded bg-ink-700 px-2 py-1 text-sm hover:bg-rust-700 disabled:opacity-30"
                    aria-label={`Move ${slide.id} up`}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === slides.length - 1}
                    className="rounded bg-ink-700 px-2 py-1 text-sm hover:bg-rust-700 disabled:opacity-30"
                    aria-label={`Move ${slide.id} down`}
                  >
                    ↓
                  </button>
                  <select
                    value={slide.reviewStatus}
                    onChange={(e) =>
                      editSlide(i, { reviewStatus: e.target.value as ReviewStatus })
                    }
                    className="rounded bg-ink-700 px-2 py-1 text-sm text-cream"
                    aria-label={`Review status for ${slide.id}`}
                  >
                    <option value="pending">pending</option>
                    <option value="approved">approved</option>
                    <option value="rejected">rejected</option>
                  </select>
                </div>
              </div>

              <input
                value={slide.heading}
                onChange={(e) => editSlide(i, { heading: e.target.value })}
                className="w-full rounded-lg border border-clay/20 bg-ink-900 px-3 py-2 font-semibold focus:border-ember focus:outline-none"
                aria-label={`Heading for ${slide.id}`}
              />
              <textarea
                value={slide.body}
                onChange={(e) => editSlide(i, { body: e.target.value })}
                rows={2}
                className="mt-2 w-full rounded-lg border border-clay/20 bg-ink-900 px-3 py-2 text-sm focus:border-ember focus:outline-none"
                aria-label={`Body for ${slide.id}`}
              />

              {claim && (
                <details className="mt-2 text-sm text-clay">
                  <summary className="cursor-pointer hover:text-blush">
                    Linked claim evidence
                  </summary>
                  <blockquote className="mt-2 border-l-2 border-ember/60 pl-3 italic">
                    “{claim.evidence.quote}” — {claim.evidence.section}, p.
                    {claim.evidence.page}
                  </blockquote>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
