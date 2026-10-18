import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DATA_DIR = process.env.RYB_DATA_DIR
  ? path.resolve(process.env.RYB_DATA_DIR)
  : path.join(__dirname, "..", "data", "projects");

const PROJECT_FILE = "project.json";

function projectDir(id) {
  return path.join(DATA_DIR, id);
}

function projectFile(id) {
  return path.join(projectDir(id), PROJECT_FILE);
}

export function newProjectId() {
  return crypto.randomBytes(6).toString("hex");
}

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/** Create an empty project skeleton on disk and return it. */
export async function createProject({ arxivId }) {
  const id = newProjectId();
  const project = {
    id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    arxivId,
    paper: null,
    claims: [],
    carousel: { slides: [] },
    render: null,
    export: null,
  };
  await fs.mkdir(path.join(projectDir(id), "assets"), { recursive: true });
  await saveProject(project);
  return project;
}

export async function projectAssetDir(id) {
  const dir = path.join(projectDir(id), "assets");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  const file = projectFile(project.id);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(project, null, 2), "utf8");
  await fs.rename(tmp, file);
  return project;
}

export async function getProject(id) {
  if (!/^[a-f0-9]{12}$/.test(id)) return null;
  try {
    const raw = await fs.readFile(projectFile(id), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listProjects() {
  let ids = [];
  try {
    ids = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }
  const projects = [];
  for (const id of ids) {
    const p = await getProject(id);
    if (p) projects.push(p);
  }
  projects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return projects;
}

export async function deleteProject(id) {
  const dir = projectDir(id);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
