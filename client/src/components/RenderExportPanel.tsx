import { useState } from "react";
import { api, assetUrl, downloadUrl } from "../api/client";
import type { ExportManifest, RenderManifest } from "../types";

interface Props {
  projectId: string;
  render: RenderManifest | null;
  exportManifest: ExportManifest | null;
  onRendered: (m: RenderManifest) => void;
  onExported: (m: ExportManifest) => void;
  dirtyCarousel: boolean;
}

export default function RenderExportPanel({
  projectId,
  render,
  exportManifest,
  onRendered,
  onExported,
  dirtyCarousel,
}: Props) {
  const audio = render?.reel?.audio ?? null;
  const [busy, setBusy] = useState<"render" | "export" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScript, setShowScript] = useState(false);
  const toggleScript = () => setShowScript((s) => !s);

  const voiceBadge =
    audio?.narrated && audio?.voice
      ? `voice: ${audio.voice}`
      : "system default voice";

  const runRender = async () => {
    setBusy("render");
    setError(null);
    try {
      const manifest = await api.render(projectId);
      onRendered(manifest);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runExport = async () => {
    setBusy("export");
    setError(null);
    try {
      onExported(await api.exportDeliverables(projectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      {dirtyCarousel && (
        <p className="rounded-lg bg-rust-700/30 p-3 text-sm text-blush">
          Carousel has unsaved edits — save them before rendering so the output
          matches what you see.
        </p>
      )}
      {error && <p className="text-sm text-rust-500">{error}</p>}

      <section>
        <div className="mb-3 flex items-center gap-4">
          <h3 className="text-lg font-semibold text-blush">
            One carousel · one static · one reel
          </h3>
          <button
            onClick={runRender}
            disabled={busy !== null}
            className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-rust-500 disabled:opacity-40"
          >
            {busy === "render" ? "Rendering…" : render ? "Re-render" : "Render"}
          </button>
        </div>
        {render ? (
          <>
            <p className="mb-4 text-sm text-clay">
              Rendered {new Date(render.renderedAt).toLocaleString()} · carousel
              {" "}
              {render.reel.slideCount} slides · static {render.static.width}×
              {render.static.height} · reel {render.reel.width}×{render.reel.height}
              {" "}
              ({render.reel.durationSeconds}s total)
            </p>

            {audio?.narrated ? (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-ink-800/70 p-3 text-sm text-ember">
                <span>🔊 Narrated reel</span>
                <span>{voiceBadge}</span>
                <span className="text-ember/70">· {render.reel.durationSeconds}s</span>
                <button
                  onClick={toggleScript}
                  className="font-semibold text-ember/80 transition hover:text-ember"
                  aria-expanded={showScript}
                >
                  {showScript ? "Hide script" : "Show script"}
                </button>
              </div>
            ) : (
              <p className="text-clay">
                No TTS engine found — reel plays silent with
                {render!.reel.secondsPerSlide} s/slide timing.
              </p>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              {/* ONE static graphic */}
              <div className="rounded-xl bg-ink-800 p-4">
                <h4 className="mb-2 text-sm font-semibold text-blush">
                  Static graphic
                </h4>
                <a
                  href={assetUrl(projectId, render.static.file)}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-clay/20 transition hover:border-ember"
                >
                  <img
                    src={assetUrl(projectId, render.static.file)}
                    alt="Static graphic — full carousel collage"
                    className="w-full"
                  />
                </a>
                <a
                  href={downloadUrl(projectId, "static")}
                  className="mt-3 inline-block rounded-lg bg-ink-700 px-4 py-2 text-sm font-semibold text-cream transition hover:bg-rust-700"
                  download
                >
                  ⬇ Download static.png
                </a>
              </div>

              {/* ONE reel */}
              <div className="rounded-xl bg-ink-800 p-4">
                <h4 className="mb-2 text-sm font-semibold text-blush">Reel (MP4)</h4>
                <video
                  controls
                  className="w-full rounded-lg"
                  src={assetUrl(projectId, render.reel.file)}
                />
                <a
                  href={downloadUrl(projectId, "reel")}
                  className="mt-3 inline-block rounded-lg bg-ink-700 px-4 py-2 text-sm font-semibold text-cream transition hover:bg-rust-700"
                  download
                >
                  ⬇ Download reel.mp4
                </a>
              </div>
            </div>
          </>
        ) : (
          <p className="text-clay">Not rendered yet.</p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-4">
          <h3 className="text-lg font-semibold text-blush">Deliverables export</h3>
          <button
            onClick={runExport}
            disabled={busy !== null || !render}
            className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-rust-500 disabled:opacity-40"
          >
            {busy === "export" ? "Exporting…" : "Export ZIP"}
          </button>
        </div>
        {exportManifest ? (
          <div className="text-sm text-clay">
            <p>
              {exportManifest.file} · {(exportManifest.bytes / 1024 / 1024).toFixed(2)}{" "}
              MB · {exportManifest.files.length} files
            </p>
            <ul className="mt-2 list-inside list-disc">
              {exportManifest.files.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <a
              href={downloadUrl(projectId, "zip")}
              className="mt-3 inline-block rounded-lg bg-ink-700 px-4 py-2 font-semibold text-cream transition hover:bg-rust-700"
              download
            >
              ⬇ Download deliverables ZIP
            </a>
          </div>
        ) : (
          <p className="text-clay">Render first, then export the ZIP bundle.</p>
        )}
      </section>
    </div>
  );
}
