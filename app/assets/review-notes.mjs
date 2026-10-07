export const NOTE_TEXT_MAX = 2000;
export const NOTE_CODE_MAX = 300;
export const NOTES_PER_PR = 200;
export const SIDES = ["new", "old"];

const ENTITIES = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": "\"", "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };

export function plainOf(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:lt|gt|amp|quot|#39|#x27|nbsp);/g, (one) => ENTITIES[one] || one)
    .replace(/\s+$/, "")
    .slice(0, NOTE_CODE_MAX);
}

export function sideOf(row) {
  return row?.t === "removed" ? "old" : "new";
}

export function lineOf(row) {
  return sideOf(row) === "old" ? row?.a ?? null : row?.d ?? null;
}

export function cleanNote(body = {}) {
  const path = String(body.path || "").trim().slice(0, 400);
  const side = SIDES.includes(body.side) ? body.side : "new";
  const line = Math.floor(Number(body.line) || 0);
  const text = String(body.text || "").trim().slice(0, NOTE_TEXT_MAX);
  const code = plainOf(String(body.code || ""));
  if (!path) return { error: "a note needs the file it is about" };
  if (line < 1) return { error: "a note needs the line it is about" };
  if (!text) return { error: "write the note first" };
  return { path, side, line, text, code };
}

export function addNote(list, note, { id, at }) {
  const kept = Array.isArray(list) ? list : [];
  if (kept.length >= NOTES_PER_PR) return { error: `this PR already carries ${NOTES_PER_PR} notes — resolve or drop some first` };
  const born = { id, at, resolved: false, sentAt: 0, ...note };
  return { notes: [...kept, born], note: born };
}

export function editNote(list, id, patch = {}) {
  const kept = Array.isArray(list) ? list : [];
  const here = kept.find((one) => one.id === id);
  if (!here) return { error: "that note is gone" };
  const next = { ...here };
  if (typeof patch.text === "string") {
    const text = patch.text.trim().slice(0, NOTE_TEXT_MAX);
    if (!text) return { error: "write the note first" };
    next.text = text;
  }
  if (typeof patch.resolved === "boolean") next.resolved = patch.resolved;
  return { notes: kept.map((one) => (one.id === id ? next : one)), note: next };
}

export function removeNote(list, id) {
  const kept = Array.isArray(list) ? list : [];
  if (!kept.some((one) => one.id === id)) return { error: "that note is gone" };
  return { notes: kept.filter((one) => one.id !== id) };
}

export function anchorNote(note, rows) {
  const all = Array.isArray(rows) ? rows : [];
  const same = (row) => sideOf(row) === note.side && plainOf(row.text ?? row.h) === note.code;
  const exact = all.findIndex((row) => row && lineOf(row) === note.line && sideOf(row) === note.side);
  if (exact >= 0 && (!note.code || same(all[exact]))) return { index: exact, line: note.line, moved: false, lost: false };
  if (note.code) {
    let best = -1;
    for (let i = 0; i < all.length; i++) {
      if (!all[i] || !same(all[i])) continue;
      if (best < 0 || Math.abs(lineOf(all[i]) - note.line) < Math.abs(lineOf(all[best]) - note.line)) best = i;
    }
    if (best >= 0) return { index: best, line: lineOf(all[best]), moved: true, lost: false };
  }
  if (exact >= 0) return { index: exact, line: note.line, moved: false, lost: false, changed: true };
  return { index: -1, line: note.line, moved: false, lost: true };
}

export function anchorNotes(notes, rows) {
  const byRow = new Map();
  const lost = [];
  for (const note of notes || []) {
    const where = anchorNote(note, rows);
    const pinned = { ...note, ...where };
    if (where.lost) { lost.push(pinned); continue; }
    if (!byRow.has(where.index)) byRow.set(where.index, []);
    byRow.get(where.index).push(pinned);
  }
  return { byRow, lost };
}

const byPlace = (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.at - b.at;

export function openNotes(list) {
  return (Array.isArray(list) ? list : []).filter((one) => !one.resolved).sort(byPlace);
}

export function batchText({ key, url = "", notes = [] }) {
  const open = openNotes(notes);
  if (!open.length) return "";
  const head = `[hive] review notes on ${key}${url ? ` · ${url}` : ""} — ${open.length === 1 ? "1 note" : `${open.length} notes`}, each pinned to a line of the diff:`;
  const body = open.map((one, i) => {
    const mark = one.side === "old" ? "−" : "+";
    const code = one.code ? ` \`${one.code.trim().slice(0, 120)}\`` : "";
    return `${i + 1}. ${one.path}:${one.line} (${mark})${code}\n   ${one.text.replace(/\n/g, "\n   ")}`;
  });
  const foot = "Answer every note: change the code or say why it stays. Push to the same branch when you are done.";
  return [head, ...body, foot].join("\n");
}
