import { fork } from "node:child_process";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { OWN_HISTORY_AGENT, hiveSessionRow } from "./own-history.mjs";

export const WINDOW = 262144;
export const WIDE_WINDOW = 8388608;
const EDGE_LINES = 40;
const WIDE_LINES = 200;
const WIDE_COLUMNS = 8000;
const PROMPT_CAP = 600;
const SAYS_CAP = 12;
const SAY_CAP = 400;
const TEMP_PROJECT = /^-(private-)?tmp(-|$)/;
const WORTH_KEEPING = /"type":"file-history-snapshot"|"promptSource":"typed"|"entrypoint":"/;
const SOMETHING_TYPED = /"lastPrompt":"/;
const TRANSCRIPT_ID = /^[0-9a-f-]{8,}$/i;

const unescape = (raw) => { try { return JSON.parse(`"${raw}"`); } catch { return raw; } };

export function fieldsOf(text, name) {
  const found = [];
  for (const one of String(text || "").matchAll(new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)"`, "g"))) found.push(unescape(one[1]));
  return found;
}

const firstOf = (text, name) => fieldsOf(text, name)[0] || "";
const lastOf = (text, name) => fieldsOf(text, name).pop() || "";
const shortLines = (text, take) => text.split("\n").slice(...take).map((line) => line.slice(0, WIDE_COLUMNS)).join("\n");

export async function readWindows(path, size) {
  const file = await open(path, "r");
  const bytesAt = async (from, want) => {
    const held = Buffer.alloc(Math.max(0, Math.min(want, size - from)));
    if (!held.length) return "";
    const { bytesRead } = await file.read(held, 0, held.length, from);
    return held.subarray(0, bytesRead).toString("utf8");
  };
  try {
    const headBig = await bytesAt(0, WINDOW);
    let head = headBig.split("\n").slice(0, EDGE_LINES).join("\n");
    if (!WORTH_KEEPING.test(headBig)) {
      head = shortLines(size <= WINDOW ? headBig : await bytesAt(0, WIDE_WINDOW), [0, WIDE_LINES]);
    }
    const tailBig = size <= WINDOW ? headBig : await bytesAt(Math.max(0, size - WINDOW), WINDOW);
    let tail = tailBig.split("\n").slice(-EDGE_LINES).join("\n");
    if (!SOMETHING_TYPED.test(tail)) {
      tail = shortLines(size <= WINDOW ? tailBig : await bytesAt(Math.max(0, size - WIDE_WINDOW), WIDE_WINDOW), [-WIDE_LINES]);
    }
    return { head, headBig, tail, tailBig };
  } finally {
    await file.close();
  }
}

export function transcriptRow(id, windows, mtimeMs) {
  const { head, headBig, tail, tailBig } = windows;
  if (!TRANSCRIPT_ID.test(id) || !(WORTH_KEEPING.test(headBig) || WORTH_KEEPING.test(head))) return null;
  const at = Date.parse(lastOf(tail, "timestamp")) || mtimeMs || 0;
  if (!at) return null;
  const custom = lastOf(`${head}\n${headBig}\n${tail}\n${tailBig}`, "customTitle");
  const ai = lastOf(`${tail}\n${tailBig}`, "aiTitle");
  const cwd = firstOf(head, "cwd");
  const prompt = lastOf(tail, "lastPrompt").slice(0, PROMPT_CAP);
  if (!custom && !ai && !prompt) return null;
  return {
    id, at, cwd, prompt,
    title: custom || ai || prompt.slice(0, 90) || cwd.split("/").pop() || id.slice(0, 8),
    ...(ai ? { ai } : {}),
    ...(custom ? { custom } : {})
  };
}

export function saysOf(windows) {
  const said = [];
  for (const one of [...fieldsOf(windows.head, "lastPrompt"), ...fieldsOf(windows.headBig, "lastPrompt"), ...fieldsOf(windows.tailBig, "lastPrompt"), ...fieldsOf(windows.tail, "lastPrompt")]) {
    const text = one.slice(0, SAY_CAP).trim();
    if (text && !said.includes(text)) said.push(text);
  }
  return said.slice(0, SAYS_CAP);
}

async function transcriptFiles(projectsDir) {
  let folders = [];
  try { folders = await readdir(projectsDir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const folder of folders) {
    if (!folder.isDirectory() || TEMP_PROJECT.test(folder.name)) continue;
    let inside = [];
    try { inside = await readdir(join(projectsDir, folder.name)); } catch { continue; }
    for (const name of inside) if (name.endsWith(".jsonl")) files.push(`${folder.name}/${name}`);
  }
  return files;
}

async function inPool(items, hands, work) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(hands, items.length)) }, async () => {
    for (let mine = next++; mine < items.length; mine = next++) await work(items[mine]);
  }));
}

async function syncStateOf(mirrorDir, key, mtimeMs, size) {
  if (!mirrorDir) return "";
  try {
    const mirror = await stat(join(mirrorDir, key));
    return Math.round(mirror.mtimeMs / 1000) === Math.round(mtimeMs / 1000) && mirror.size === size ? "ok" : "behind";
  } catch {
    return "behind";
  }
}

const AGENT_OF_RECORD = new RegExp(`"agent": *"(${OWN_HISTORY_AGENT.source.replace(/[$^]/g, "")})"`);
const SESSION_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const FIRST_SAY_WINDOW = 262144;
const FIRST_SAY_CAP = 2000;

async function firstSayOf(path) {
  let file;
  try { file = await open(path, "r"); } catch { return ""; }
  try {
    const held = Buffer.alloc(FIRST_SAY_WINDOW);
    const { bytesRead } = await file.read(held, 0, FIRST_SAY_WINDOW, 0);
    for (const line of held.subarray(0, bytesRead).toString("utf8").split("\n")) {
      if (line.includes(`"type":"user"`)) return line.slice(0, FIRST_SAY_CAP);
    }
    return "";
  } catch {
    return "";
  } finally {
    await file.close();
  }
}

export async function readSeatRecords({ sessionsDir, eventsDir, where = "local" } = {}) {
  const seatOf = new Map();
  const rows = [];
  let files = [];
  try { files = await readdir(sessionsDir); } catch { return { seatOf, rows }; }
  await inPool(files.filter((name) => name.endsWith(".json")), 16, async (file) => {
    const name = file.slice(0, -".json".length);
    let raw;
    try { raw = await readFile(join(sessionsDir, file), "utf8"); } catch { return; }
    if (!AGENT_OF_RECORD.test(raw)) {
      const found = SESSION_UUID.exec(raw);
      if (found) seatOf.set(found[0], name);
      return;
    }
    let meta;
    try { meta = JSON.parse(raw); } catch { return; }
    const events = join(eventsDir, `${name}.ndjson`);
    let stamp = 0;
    try { stamp = Math.round((await stat(events)).mtimeMs / 1000); } catch {}
    const row = hiveSessionRow(name, meta, stamp, await firstSayOf(events), where);
    if (row) rows.push(row);
  });
  return { seatOf, rows };
}

export async function scanTranscripts({ projectsDir, mirrorDir = "", known = {}, hands = 16, onProgress } = {}) {
  const files = await transcriptFiles(projectsDir);
  const index = {};
  const carrying = [];
  let read = 0;
  let done = 0;
  await inPool(files, hands, async (key) => {
    let live;
    try { live = await stat(join(projectsDir, key)); } catch { return; }
    const mtime = Math.round(live.mtimeMs);
    const kept = known[key];
    let entry = kept && kept.m === mtime && kept.s === live.size ? kept : null;
    if (!entry) {
      read += 1;
      try {
        const windows = await readWindows(join(projectsDir, key), live.size);
        const row = transcriptRow(key.split("/").pop().replace(/\.jsonl$/, ""), windows, mtime);
        entry = { m: mtime, s: live.size, ...(row ? { row, says: saysOf(windows) } : {}) };
      } catch {
        entry = { m: mtime, s: live.size };
      }
    }
    index[key] = entry;
    if (entry.row) carrying.push(key);
    done += 1;
    if (onProgress && done % 100 === 0) onProgress({ done, total: files.length, read });
  });
  const rows = [];
  await inPool(carrying, hands, async (key) => {
    const sync = await syncStateOf(mirrorDir, key, index[key].m, index[key].s);
    rows.push({ ...index[key].row, ...(sync ? { sync } : {}) });
  });
  if (onProgress) onProgress({ done: files.length, total: files.length, read });
  return { rows, index, files: files.length, read };
}

export function scanTranscriptsApart({ onProgress, ...scan } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = fork(new URL("./archive-scan-child.mjs", import.meta.url), [], { serialization: "advanced", stdio: ["ignore", "ignore", "inherit", "ipc"] });
    } catch (wrong) {
      reject(wrong);
      return;
    }
    let answered = false;
    const answer = (settle, value) => { if (answered) return; answered = true; settle(value); };
    child.on("message", (said) => {
      if (said.progress && onProgress) onProgress(said.progress);
      if (said.done) answer(resolve, said.done);
      if (said.failed) answer(reject, new Error(said.failed));
    });
    child.on("error", (wrong) => answer(reject, wrong));
    child.on("exit", (code, signal) => answer(reject, new Error(`the scan child left with ${signal || code} before answering`)));
    child.send({ scan });
  });
}

export function oneRowPerSession(rows) {
  const best = new Map();
  for (const row of rows) {
    if (!row?.id) continue;
    const seen = best.get(row.id);
    if (!seen) {
      best.set(row.id, row);
      continue;
    }
    const winner = row.at > seen.at || (row.at === seen.at && row.where === "local") ? row : seen;
    const folded = { ...(winner === row ? seen : row), ...winner };
    if (!winner.sync) delete folded.sync;
    best.set(row.id, folded);
  }
  return [...best.values()].sort((a, b) => b.at - a.at);
}
