export const MEMORY_INDEX = "MEMORY.md";

export const MEMORY_TYPES = ["user", "feedback", "project", "reference"];

export const SCOPES = ["team", "personal"];

const FENCE = "---";
const TOP_FIELD = /^([A-Za-z_][\w-]*):\s?(.*)$/;
const NESTED_FIELD = /^(\s+)([A-Za-z_][\w-]*):\s?(.*)$/;
const BLOCK_SCALAR = /^[>|][-+]?$/;
const INDEX_LINE = /^\s*[-*]\s+\[([^\]]*)\]\(<?(?:\.\/)?([^()\s<>]+?\.md)>?\)\s*(?:[—–-]\s*(.*))?$/;
const MEMORY_FILE = /^[^./\\][^/\\]*\.md$/;

export const isMemoryFile = (name) => MEMORY_FILE.test(String(name || "")) && name !== MEMORY_INDEX;

export function splitMemory(raw) {
  const lines = String(raw ?? "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== FENCE) return null;
  const closing = lines.indexOf(FENCE, 1);
  if (closing === -1) return null;
  return { frontmatter: lines.slice(1, closing), body: lines.slice(closing + 1).join("\n") };
}

export const joinMemory = ({ frontmatter, body }) => [FENCE, ...frontmatter, FENCE, body].join("\n");

function unquote(value) {
  const trimmed = String(value).trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
}

export function readFields(frontmatter) {
  const fields = new Map();
  let parent = null;
  for (const line of frontmatter) {
    const nested = NESTED_FIELD.exec(line);
    if (nested) {
      if (parent) fields.set(`${parent}.${nested[2]}`, unquote(nested[3]));
      continue;
    }
    const top = TOP_FIELD.exec(line);
    if (!top) continue;
    parent = top[2].trim() === "" ? top[1] : null;
    fields.set(top[1], unquote(top[2]));
  }
  return fields;
}

function setTopField(lines, key, rendered) {
  const at = lines.findIndex((line) => TOP_FIELD.exec(line)?.[1] === key);
  if (at === -1) {
    const metadata = lines.findIndex((line) => TOP_FIELD.exec(line)?.[1] === "metadata");
    lines.splice(metadata === -1 ? lines.length : metadata, 0, `${key}: ${rendered}`);
    return lines;
  }
  const was = TOP_FIELD.exec(lines[at])?.[2].trim() ?? "";
  let end = at + 1;
  if (BLOCK_SCALAR.test(was)) while (end < lines.length && /^\s/.test(lines[end])) end++;
  lines.splice(at, end - at, `${key}: ${rendered}`);
  return lines;
}

function setNestedField(lines, parent, child, rendered) {
  const at = lines.findIndex((line) => TOP_FIELD.exec(line)?.[1] === parent);
  if (at === -1) return [...lines, `${parent}:`, `  ${child}: ${rendered}`];
  let end = at + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
  for (let index = at + 1; index < end; index++) {
    const found = NESTED_FIELD.exec(lines[index]);
    if (found?.[2] === child) {
      lines[index] = `${found[1]}${child}: ${rendered}`;
      return lines;
    }
  }
  const indent = NESTED_FIELD.exec(lines[at + 1] ?? "")?.[1] ?? "  ";
  lines.splice(end, 0, `${indent}${child}: ${rendered}`);
  return lines;
}

export function setField(frontmatter, path, rendered) {
  const lines = [...frontmatter];
  const dot = path.indexOf(".");
  return dot === -1 ? setTopField(lines, path, rendered) : setNestedField(lines, path.slice(0, dot), path.slice(dot + 1), rendered);
}

export const oneLine = (text) => String(text ?? "").replace(/\s*\n\s*/g, " ").trim();

export const normalBody = (body) => `\n${String(body ?? "").replace(/\r\n/g, "\n").replace(/^\n+/, "").trimEnd()}\n`;

export function readMemory(file, raw) {
  const fallback = String(file).replace(/\.md$/, "");
  const parts = splitMemory(raw);
  if (!parts) return { file, name: fallback, description: "", type: "", scope: "", body: String(raw ?? ""), broken: true };
  const fields = readFields(parts.frontmatter);
  const scope = fields.get("metadata.scope") ?? fields.get("scope") ?? "";
  return {
    file,
    name: fields.get("name") || fallback,
    description: fields.get("description") ?? "",
    type: fields.get("metadata.type") ?? fields.get("type") ?? "",
    scope: SCOPES.includes(scope) ? scope : "",
    body: parts.body.replace(/^\n+/, ""),
    broken: false
  };
}

export function withScope(raw, scope) {
  if (!SCOPES.includes(scope)) throw new Error(`unknown scope ${scope}`);
  const parts = splitMemory(raw);
  if (!parts) throw new Error("the memory has no frontmatter");
  return joinMemory({ ...parts, frontmatter: setField(parts.frontmatter, "metadata.scope", scope) });
}

export function withText(raw, { description, body }) {
  const parts = splitMemory(raw);
  if (!parts) throw new Error("the memory has no frontmatter");
  let frontmatter = parts.frontmatter;
  if (description !== undefined) frontmatter = setField(frontmatter, "description", JSON.stringify(oneLine(description)));
  return joinMemory({ frontmatter, body: body === undefined ? parts.body : normalBody(body) });
}

export function indexEntries(index) {
  const out = [];
  for (const line of String(index ?? "").split("\n")) {
    const found = INDEX_LINE.exec(line);
    if (found) out.push({ line, title: found[1].trim(), file: found[2], hook: (found[3] || "").trim() });
  }
  return out;
}

export const indexEntryOf = (index, file) => indexEntries(index).find((one) => one.file === file) || null;

export function withoutIndexLine(index, file) {
  const text = String(index ?? "");
  const kept = text.split("\n").filter((line) => INDEX_LINE.exec(line)?.[2] !== file);
  return kept.join("\n");
}

export function indexLineFor({ file, title, hook }) {
  const name = oneLine(title).replace(/[[\]]/g, "") || String(file).replace(/\.md$/, "");
  const tail = oneLine(hook);
  return tail ? `- [${name}](${file}) — ${tail}` : `- [${name}](${file})`;
}

export function withIndexLines(index, lines) {
  const text = String(index ?? "").replace(/\s+$/, "");
  const present = new Set(indexEntries(text).map((one) => one.file));
  const fresh = lines.filter((line) => {
    const file = INDEX_LINE.exec(line)?.[2];
    if (!file || present.has(file)) return false;
    present.add(file);
    return true;
  });
  if (!fresh.length) return text ? `${text}\n` : "";
  return `${text ? `${text}\n` : ""}${fresh.join("\n")}\n`;
}

export function scopeInText(content) {
  const parts = splitMemory(content);
  if (!parts) return "";
  const fields = readFields(parts.frontmatter);
  const scope = fields.get("metadata.scope") ?? fields.get("scope") ?? "";
  return SCOPES.includes(scope) ? scope : "";
}
