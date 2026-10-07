const WRITING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const LINE_MIN = 6;
const ALNUM_MIN = 3;

export const normalLine = (line) => String(line || "").trim().replace(/\s+/g, " ");

const worthMatching = (line) => line.length >= LINE_MIN && (line.match(/[a-zA-Z0-9]/g) || []).length >= ALNUM_MIN;

export function writtenTexts(input) {
  if (!input || typeof input !== "object") return [];
  const out = [];
  if (typeof input.new_string === "string") out.push(input.new_string);
  if (typeof input.content === "string") out.push(input.content);
  if (typeof input.new_source === "string") out.push(input.new_source);
  for (const edit of Array.isArray(input.edits) ? input.edits : []) if (typeof edit?.new_string === "string") out.push(edit.new_string);
  return out;
}

export function linesWrittenIn(transcript) {
  const written = new Set();
  const files = new Set();
  for (const raw of String(transcript || "").split("\n")) {
    if (!raw.includes('"tool_use"')) continue;
    let row;
    try { row = JSON.parse(raw); } catch { continue; }
    const content = row?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type !== "tool_use" || !WRITING_TOOLS.has(part.name)) continue;
      if (part.input?.file_path) files.add(String(part.input.file_path));
      for (const text of writtenTexts(part.input)) {
        for (const line of text.split("\n")) {
          const said = normalLine(line);
          if (worthMatching(said)) written.add(said);
        }
      }
    }
  }
  return { written, files };
}

export function plainOf(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

export function attributeFiles(files, written) {
  const out = {};
  let added = 0;
  let mine = 0;
  for (const file of files || []) {
    const lines = [];
    for (const row of file.lines || []) {
      if (row.t !== "added") continue;
      added += 1;
      const said = normalLine(plainOf(row.h));
      if (worthMatching(said) && written.has(said)) { lines.push(row.d); mine += 1; }
    }
    if (lines.length) out[file.path] = lines;
  }
  return { files: out, added, mine };
}
