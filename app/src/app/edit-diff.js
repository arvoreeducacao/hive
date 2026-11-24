import { shortPath } from "./tool-face.js";

const EDIT_TOOL = /^edit$/i;
const MULTI_EDIT_TOOL = /^multiedit$/i;
const WRITE_TOOL = /^write$/i;
const CREATED = /\bcreated\b/i;
const LINES_SHOWN = 400;
const LCS_CEILING = 250000;

const linesOf = (text) => {
  const lines = String(text ?? "").split("\n");
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
};

const same = (text) => ({ cls: "ctx", text: ` ${text}` });
const gone = (text) => ({ cls: "del", text: `-${text}` });
const came = (text) => ({ cls: "add", text: `+${text}` });

function walk(before, after) {
  const width = after.length + 1;
  const longest = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      longest[i * width + j] = before[i] === after[j]
        ? longest[(i + 1) * width + j + 1] + 1
        : Math.max(longest[(i + 1) * width + j], longest[i * width + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) { out.push(same(before[i])); i++; j++; }
    else if (longest[(i + 1) * width + j] >= longest[i * width + j + 1]) out.push(gone(before[i++]));
    else out.push(came(after[j++]));
  }
  while (i < before.length) out.push(gone(before[i++]));
  while (j < after.length) out.push(came(after[j++]));
  return out;
}

function lineDiff(beforeText, afterText) {
  const before = beforeText === "" ? [] : linesOf(beforeText);
  const after = afterText === "" ? [] : linesOf(afterText);
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
  const left = before.slice(head, before.length - tail);
  const right = after.slice(head, after.length - tail);
  const middle = left.length * right.length > LCS_CEILING ? [...left.map(gone), ...right.map(came)] : walk(left, right);
  return [...before.slice(0, head).map(same), ...middle, ...before.slice(before.length - tail).map(same)];
}

function changesOf(name, input) {
  const tool = String(name || "");
  const inp = input && typeof input === "object" ? input : {};
  if (EDIT_TOOL.test(tool) && typeof inp.old_string === "string" && typeof inp.new_string === "string") return lineDiff(inp.old_string, inp.new_string);
  if (MULTI_EDIT_TOOL.test(tool) && Array.isArray(inp.edits)) {
    return inp.edits
      .filter((one) => typeof one?.old_string === "string" && typeof one?.new_string === "string")
      .flatMap((one, at) => [...(at ? [{ cls: "ctx", text: "⋯" }] : []), ...lineDiff(one.old_string, one.new_string)]);
  }
  if (WRITE_TOOL.test(tool) && typeof inp.content === "string") return lineDiff("", inp.content);
  return null;
}

export function editOf(name, input) {
  const file = input && typeof input === "object" && typeof input.file_path === "string" ? input.file_path : "";
  const changes = file ? changesOf(name, input) : null;
  if (!changes?.length) return null;
  const added = changes.filter((one) => one.cls === "add").length;
  const removed = changes.filter((one) => one.cls === "del").length;
  const shown = changes.slice(0, LINES_SHOWN);
  if (changes.length > shown.length) shown.push({ cls: "ctx", text: `… ${changes.length - shown.length}` });
  return {
    file,
    path: shortPath(file),
    added,
    removed,
    write: WRITE_TOOL.test(String(name || "")),
    lines: shown.map((one, key) => ({ key, ...one }))
  };
}

export function editLanded(edit, { failed = false, text = "" } = {}) {
  if (!edit || failed) return null;
  if (edit.write && !CREATED.test(String(text))) return null;
  return edit;
}
