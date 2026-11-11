import { MEMORY_INDEX, MEMORY_TYPES, readFields, splitMemory } from "./memory-files.mjs";

export const TEAM_MEMORY_DIR = ".claude/team-memory";

export const INDEX_MAX_LINES = 200;

export const INDEX_MAX_BYTES = 25_000;

const TEAM_FILE = /^[a-z0-9][a-z0-9-]*\.md$/;

const INDEX_LINK = /\]\(<?(?:\.\/)?([^()\s<>]+?\.md)>?\)/g;

export const SECRET_PATTERNS = [
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["API key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["user secret", /\b(?:api_token|reset_password_token|encrypted_password)\s*[:=]\s*\S{8,}/]
];

export function findSecrets(file, text) {
  return SECRET_PATTERNS.filter(([, pattern]) => pattern.test(String(text ?? ""))).map(([what]) => ({ file, kind: "secret", what }));
}

export function checkTeamFile(file, raw) {
  const problems = [];
  const stem = String(file).replace(/\.md$/, "");
  if (!TEAM_FILE.test(file)) problems.push({ file, kind: "file-name" });
  const parts = splitMemory(raw);
  if (!parts) return [...problems, { file, kind: "no-frontmatter" }];
  const fields = readFields(parts.frontmatter);
  const type = fields.get("metadata.type") ?? fields.get("type") ?? "";
  if (fields.get("name") !== stem) problems.push({ file, kind: "name", want: stem });
  if (!fields.get("description")) problems.push({ file, kind: "no-description" });
  if (!MEMORY_TYPES.includes(type)) problems.push({ file, kind: "type", what: type });
  if (!parts.body.trim()) problems.push({ file, kind: "empty" });
  return problems;
}

export function checkTeamIndex(index, files) {
  const problems = [];
  const text = String(index ?? "");
  const lines = text.trimEnd().split("\n");
  if (lines.length > INDEX_MAX_LINES) problems.push({ file: MEMORY_INDEX, kind: "index-lines", what: String(lines.length) });
  const bytes = Buffer.byteLength(text);
  if (bytes > INDEX_MAX_BYTES) problems.push({ file: MEMORY_INDEX, kind: "index-bytes", what: String(bytes) });
  const linked = new Set([...text.matchAll(INDEX_LINK)].map((found) => found[1]));
  for (const target of linked) if (!files.has(target)) problems.push({ file: MEMORY_INDEX, kind: "dangling", what: target });
  for (const file of files) if (!linked.has(file)) problems.push({ file, kind: "unlisted" });
  return problems;
}

export function checkTeamMemory({ index, files }) {
  const names = new Set(Object.keys(files));
  return [
    ...checkTeamIndex(index, names),
    ...findSecrets(MEMORY_INDEX, index),
    ...Object.entries(files).flatMap(([file, raw]) => [...checkTeamFile(file, raw), ...findSecrets(file, raw)])
  ];
}
