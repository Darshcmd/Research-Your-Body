import type { Carousel, Project, ProjectSummary, RenderManifest, ExportManifest, ReviewStatus } from "../types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  createProject: (arxivId: string) =>
    request<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ arxivId }),
    }),
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  setClaimReview: (id: string, claimId: string, reviewStatus: ReviewStatus, note?: string) =>
    request(`/api/projects/${id}/claims/${claimId}`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus, ...(note !== undefined ? { note } : {}) }),
    }),
  saveCarousel: (id: string, slides: Carousel["slides"]) =>
    request<Carousel>(`/api/projects/${id}/carousel`, {
      method: "PUT",
      body: JSON.stringify({ slides }),
    }),
  render: (id: string) =>
    request<RenderManifest>(`/api/projects/${id}/render`, { method: "POST" }),
  exportDeliverables: (id: string) =>
    request<ExportManifest>(`/api/projects/${id}/export`, { method: "POST" }),
};

export const assetUrl = (projectId: string, file: string) =>
  `/api/projects/${projectId}/assets/${encodeURIComponent(file)}`;

export const downloadUrl = (
  projectId: string,
  artifact: "reel" | "static" | "zip" | "pdf"
) => `/api/projects/${projectId}/download/${artifact}`;
