import { randomBytes } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { MEMORY_INDEX, SCOPES, indexEntryOf, isMemoryFile, readMemory, withScope, withoutIndexLine } from "./memory-files.mjs";

const PROJECT = /^[^./\\][^/\\]*$/;
const ENTRY_ID = /^[\w-]{1,80}$/;
const SEARCH_ROOM = 1500;
const CWD_IN_TRANSCRIPT = /"cwd":"((?:[^"\\]|\\.)*)"/;
const TRANSCRIPT_HEAD = 64 * 1024;

export class MemoryError extends Error {
  constructor(status, why) {
    super(why);
    this.status = status;
    this.why = why;
  }
}

const missing = (error) => error?.code === "ENOENT" || error?.code === "ENOTDIR";

async function readOrNull(path) {
  try { return await readFile(path, "utf8"); } catch (error) { if (missing(error)) return null; throw error; }
}

async function writeAtomic(path, text) {
  const temporary = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, path);
}

export function splitMemoryId(id) {
  const text = String(id ?? "");
  const at = text.indexOf("/");
  if (at < 1) return null;
  const project = text.slice(0, at);
  const file = text.slice(at + 1);
  if (!PROJECT.test(project) || !isMemoryFile(file)) return null;
  return { project, file };
}

export function memoryIdOfPath(path, projectsRoot) {
  const rest = relative(projectsRoot, String(path ?? ""));
  const parts = rest.split(sep);
  if (parts.length !== 3 || parts[1] !== "memory" || rest.startsWith("..")) return "";
  return splitMemoryId(`${parts[0]}/${parts[2]}`) ? `${parts[0]}/${parts[2]}` : "";
}

async function cwdOfProject(projectDir) {
  let names = [];
  try { names = (await readdir(projectDir)).filter((one) => one.endsWith(".jsonl")); } catch { return ""; }
  for (const name of names.slice(0, 5)) {
    let handle = null;
    try {
      handle = await open(join(projectDir, name), "r");
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(TRANSCRIPT_HEAD), 0, TRANSCRIPT_HEAD, 0);
      const found = CWD_IN_TRANSCRIPT.exec(buffer.subarray(0, bytesRead).toString("utf8"));
      if (found) return JSON.parse(`"${found[1]}"`);
    } catch {} finally { await handle?.close().catch(() => {}); }
  }
  return "";
}

export function projectLabel(project, cwd, home) {
  if (cwd) return home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd;
  const homeSlug = home ? `${home.replace(/[^A-Za-z0-9]/g, "-")}-` : "";
  return homeSlug && project.startsWith(homeSlug) ? `~/${project.slice(homeSlug.length)}` : project;
}

export function createLocalMemories({ projectsRoot, dataDir, home = "", now = () => new Date() }) {
  const labels = new Map();
  let queue = Promise.resolve();

  const exclusive = (run) => {
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };

  const marksFile = () => join(dataDir, "proposed.json");
  const journalDir = () => join(dataDir, "journal");

  async function readMarks() {
    try {
      const held = JSON.parse(await readFile(marksFile(), "utf8"));
      return held && typeof held === "object" && !Array.isArray(held) ? held : {};
    } catch { return {}; }
  }

  async function writeMarks(marks) {
    await mkdir(dataDir, { recursive: true });
    await writeAtomic(marksFile(), JSON.stringify(marks, null, 2));
  }

  async function folders() {
    let entries = [];
    try { entries = await readdir(projectsRoot, { withFileTypes: true }); } catch { return []; }
    const seen = new Map();
    for (const entry of entries.filter((one) => one.isDirectory() && PROJECT.test(one.name)).sort((a, b) => a.name.localeCompare(b.name))) {
      const dir = join(projectsRoot, entry.name, "memory");
      let real = "";
      let symlinked = false;
      try {
        if (!(await stat(dir)).isDirectory()) continue;
        symlinked = (await lstat(dir)).isSymbolicLink();
        real = await realpath(dir);
      } catch { continue; }
      const held = seen.get(real);
      if (held && !(held.symlinked && !symlinked)) continue;
      seen.set(real, { project: entry.name, dir: real, symlinked });
    }
    return [...seen.values()];
  }

  async function labelOf(project) {
    if (!labels.has(project)) labels.set(project, projectLabel(project, await cwdOfProject(join(projectsRoot, project)), home));
    return labels.get(project);
  }

  async function where(id) {
    const split = splitMemoryId(id);
    if (!split) throw new MemoryError(400, "no such memory");
    let dir = "";
    try { dir = await realpath(join(projectsRoot, split.project, "memory")); } catch { throw new MemoryError(404, "no such memory"); }
    return { ...split, dir, path: join(dir, split.file), index: join(dir, MEMORY_INDEX) };
  }

  async function knownDirs() {
    return new Set((await folders()).map((one) => one.dir));
  }

  async function commit(label, changes, extra = {}) {
    const effective = changes.filter((one) => one.before !== one.after);
    if (!effective.length) return null;
    for (const change of effective) {
      if ((await readOrNull(change.path)) !== change.before) throw new MemoryError(409, "the file changed outside the panel");
    }
    for (const change of effective) {
      if (change.after === null) await unlink(change.path).catch((error) => { if (!missing(error)) throw error; });
      else await writeAtomic(change.path, change.after);
    }
    const entry = { id: `${now().getTime()}-${randomBytes(3).toString("hex")}`, at: now().toISOString(), label, changes: effective, ...extra };
    await mkdir(journalDir(), { recursive: true });
    await writeFile(join(journalDir(), `${entry.id}.json`), JSON.stringify(entry, null, 2));
    return entry;
  }

  async function removeChanges(at) {
    const before = await readOrNull(at.path);
    if (before === null) throw new MemoryError(404, "no such memory");
    const changes = [{ path: at.path, before, after: null }];
    const index = await readOrNull(at.index);
    if (index !== null) changes.push({ path: at.index, before: index, after: withoutIndexLine(index, at.file) });
    return changes;
  }

  async function list() {
    const marks = await readMarks();
    const projects = [];
    const memories = [];
    for (const folder of await folders()) {
      let names = [];
      try { names = (await readdir(folder.dir)).filter(isMemoryFile).sort(); } catch { continue; }
      if (!names.length) continue;
      const index = (await readOrNull(join(folder.dir, MEMORY_INDEX))) ?? "";
      projects.push({ id: folder.project, label: await labelOf(folder.project), count: names.length });
      for (const file of names) {
        const path = join(folder.dir, file);
        const raw = await readOrNull(path);
        if (raw === null) continue;
        const memory = readMemory(file, raw);
        const entry = indexEntryOf(index, file);
        let at = 0;
        try { at = (await stat(path)).mtimeMs; } catch {}
        memories.push({
          id: `${folder.project}/${file}`,
          project: folder.project,
          file,
          name: memory.name,
          title: entry?.title || "",
          hook: entry?.hook || "",
          description: memory.description,
          type: memory.type,
          scope: memory.scope,
          broken: memory.broken,
          listed: !!entry,
          text: memory.body.slice(0, SEARCH_ROOM),
          at,
          proposed: marks[path] || null
        });
      }
    }
    projects.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return { projects, memories };
  }

  async function one(id) {
    const at = await where(id);
    const raw = await readOrNull(at.path);
    if (raw === null) throw new MemoryError(404, "no such memory");
    const index = (await readOrNull(at.index)) ?? "";
    const entry = indexEntryOf(index, at.file);
    return { id: `${at.project}/${at.file}`, path: at.path, raw, ...readMemory(at.file, raw), title: entry?.title || "", hook: entry?.hook || "" };
  }

  async function statuses(ids) {
    const out = {};
    for (const id of ids) {
      try {
        const at = await where(id);
        const raw = await readOrNull(at.path);
        out[id] = raw === null ? { gone: true } : { gone: false, scope: readMemory(at.file, raw).scope };
      } catch { out[id] = { gone: true }; }
    }
    return out;
  }

  const setScope = (id, scope) => exclusive(async () => {
    if (!SCOPES.includes(scope)) throw new MemoryError(400, "unknown scope");
    const at = await where(id);
    const before = await readOrNull(at.path);
    if (before === null) throw new MemoryError(404, "no such memory");
    let after;
    try { after = withScope(before, scope); } catch { throw new MemoryError(422, "the memory has no frontmatter"); }
    return commit(`scope ${scope}: ${at.file}`, [{ path: at.path, before, after }]);
  });

  const setScopes = (pairs) => exclusive(async () => {
    const changes = [];
    for (const { id, scope } of pairs) {
      if (!SCOPES.includes(scope)) throw new MemoryError(400, "unknown scope");
      const at = await where(id);
      const before = await readOrNull(at.path);
      if (before === null) continue;
      try { changes.push({ path: at.path, before, after: withScope(before, scope) }); } catch {}
    }
    return commit(`scope of ${changes.length} memories`, changes);
  });

  const remove = (id) => exclusive(async () => {
    const at = await where(id);
    return commit(`removed ${at.file}`, await removeChanges(at));
  });

  const undo = (entryId) => exclusive(async () => {
    if (!ENTRY_ID.test(String(entryId ?? ""))) throw new MemoryError(400, "no such change");
    let entry;
    try { entry = JSON.parse(await readFile(join(journalDir(), `${entryId}.json`), "utf8")); } catch { throw new MemoryError(404, "no such change"); }
    if (entry.undoneBy) throw new MemoryError(409, "already undone");
    const dirs = await knownDirs();
    const reversed = entry.changes.map((one) => ({ path: one.path, before: one.after, after: one.before }));
    for (const change of reversed) {
      const dir = change.path.slice(0, change.path.lastIndexOf(sep));
      if (!dirs.has(dir)) throw new MemoryError(400, "that change is outside the memory folders");
    }
    const undone = await commit(`undo: ${entry.label}`, reversed, { undoes: entry.id });
    if (!undone) throw new MemoryError(409, "nothing to undo");
    await writeFile(join(journalDir(), `${entry.id}.json`), JSON.stringify({ ...entry, undoneBy: undone.id }, null, 2));
    if (entry.settled) {
      const marks = await readMarks();
      for (const one of entry.settled) marks[one.path] = one.mark;
      await writeMarks(marks);
    }
    return undone;
  });

  const markProposed = (ids, pr) => exclusive(async () => {
    const marks = await readMarks();
    for (const id of ids) {
      const at = await where(id);
      marks[at.path] = { number: Number(pr.number), url: String(pr.url || ""), repo: String(pr.repo || ""), at: now().toISOString() };
    }
    await writeMarks(marks);
  });

  async function pendingPrs() {
    const marks = await readMarks();
    return [...new Map(Object.values(marks).map((one) => [`${one.repo}#${one.number}`, { repo: one.repo, number: one.number }])).values()];
  }

  const settle = (stateOf) => exclusive(async () => {
    const marks = await readMarks();
    const changes = [];
    const settled = [];
    const merged = new Map();
    let dropped = false;
    for (const [path, mark] of Object.entries(marks)) {
      const state = stateOf(`${mark.repo}#${mark.number}`);
      if (state !== "MERGED" && state !== "CLOSED") continue;
      delete marks[path];
      dropped = true;
      if (state !== "MERGED") continue;
      const dir = path.slice(0, path.lastIndexOf(sep));
      const file = path.slice(path.lastIndexOf(sep) + 1);
      const before = await readOrNull(path);
      if (before !== null) changes.push({ path, before, after: null });
      settled.push({ path, mark });
      const indexPath = join(dir, MEMORY_INDEX);
      const held = changes.find((one) => one.path === indexPath);
      const index = held ? held.after : await readOrNull(indexPath);
      if (index !== null) {
        const after = withoutIndexLine(index, file);
        if (held) held.after = after;
        else changes.push({ path: indexPath, before: index, after });
      }
      merged.set(mark.number, (merged.get(mark.number) || 0) + 1);
    }
    let entry = null;
    if (changes.length) entry = await commit(`came into the team: ${[...merged.keys()].map((n) => `#${n}`).join(", ")}`, changes, { settled });
    if (dropped) await writeMarks(marks);
    return { entry: entry?.id || null, merged: [...merged].map(([number, count]) => ({ number, count })) };
  });

  return { folders, list, one, statuses, setScope, setScopes, remove, undo, markProposed, pendingPrs, settle, where };
}
