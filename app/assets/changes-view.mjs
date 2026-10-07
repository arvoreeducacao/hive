export const PATH_ROOM = 34;

export const WELL_LINES = 6;

export function splitPath(path, room = PATH_ROOM) {
  const parts = String(path || "").split("/").filter(Boolean);
  const base = parts.pop() || "";
  if (!parts.length) return { dir: "", base: middleCut(base, room) };
  const dir = parts.length > 2 ? `${parts[0]}/…/` : `${parts.join("/")}/`;
  return { dir, base: middleCut(base, Math.max(12, room - dir.length)) };
}

export function middleCut(text, room) {
  const said = String(text || "");
  if (said.length <= room) return said;
  const keep = room - 1;
  const tail = Math.ceil(keep / 2);
  return `${said.slice(0, keep - tail)}…${said.slice(-tail)}`;
}

export function shortHome(path, home = "") {
  const said = String(path || "");
  if (home && said.startsWith(`${home}/`)) return `~/${said.slice(home.length + 1)}`;
  const parts = said.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : said;
}

export const reviewedKey = (name, tree, path) => `${name}|${tree}|${path}`;

export function reviewedOf(marks, name, tree, file, signature) {
  return marks[reviewedKey(name, tree, file.path)] === signature;
}

export function stepFile(paths, at, by) {
  if (!paths.length) return "";
  const now = paths.indexOf(at);
  if (now < 0) return paths[by < 0 ? paths.length - 1 : 0];
  return paths[Math.min(paths.length - 1, Math.max(0, now + by))];
}

export function nextUnreviewed(paths, at, reviewed) {
  const now = Math.max(0, paths.indexOf(at));
  const order = [...paths.slice(now + 1), ...paths.slice(0, now)];
  return order.find((path) => !reviewed.has(path)) || "";
}

export function diffRows(hunks, cap = Infinity) {
  const rows = [];
  let shown = 0;
  let hidden = 0;
  for (const [at, hunk] of hunks.entries()) {
    if (shown >= cap) { hidden += hunk.lines.length; continue; }
    rows.push({ key: `h${at}`, kind: "hunk", old: "", new: "", sign: "", text: `${hunk.head}${hunk.context ? ` ${hunk.context}` : ""}` });
    for (const [line, one] of hunk.lines.entries()) {
      if (shown >= cap) { hidden++; continue; }
      shown++;
      rows.push({
        key: `h${at}l${line}`,
        kind: one.kind,
        old: one.old ? String(one.old) : "",
        new: one.new ? String(one.new) : "",
        sign: one.kind === "add" ? "+" : one.kind === "del" ? "−" : "",
        text: one.text
      });
    }
  }
  return { rows, hidden };
}

export function contextWindow(max) {
  const n = Number(max) || 0;
  if (n >= 1e6) return `${Math.round(n / 1e5) / 10}M`.replace(".0M", "M");
  return `${Math.round(n / 1000)}k`;
}

export function byteSize(n) {
  const bytes = Number(n) || 0;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${Math.round(bytes / (1 << 10))} KB`;
  return `${bytes} B`;
}
