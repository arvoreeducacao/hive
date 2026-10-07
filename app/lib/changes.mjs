export const CHANGED_SHOWN = 300;

export const AHEAD_SHOWN = 30;

export const DIFF_BYTES = 400000;

export const DIFF_LINES = 4000;

const MARK = "#hive:";

const ENTER = [
  'cd "$1" 2>/dev/null || { echo "#hive:gone"; exit 0; }',
  'top=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "#hive:norepo"; exit 0; }',
  'cd "$top" || exit 0',
  'g() { git --no-optional-locks -c core.quotepath=off "$@"; }'
];

export const CHANGES_SCRIPT = [
  ...ENTER,
  'base=$(g symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)',
  '[ -n "$base" ] || for b in origin/main origin/master main master; do g rev-parse -q --verify "$b" >/dev/null 2>&1 && { base=$b; break; }; done',
  'echo "#hive:top"; echo "$top"',
  'echo "#hive:branch"; g rev-parse --abbrev-ref HEAD 2>/dev/null',
  'echo "#hive:head"; g rev-parse --short HEAD 2>/dev/null',
  'echo "#hive:base"; echo "$base"',
  `echo "#hive:status"; g status --porcelain=v1 -uall 2>/dev/null | head -${CHANGED_SHOWN}`,
  `echo "#hive:numstat"; g diff HEAD --numstat 2>/dev/null | head -${CHANGED_SHOWN}`,
  `g ls-files --others --exclude-standard 2>/dev/null | head -${CHANGED_SHOWN} | while IFS= read -r f; do g diff --no-index --numstat -- /dev/null "$f" 2>/dev/null; done`,
  `echo "#hive:ahead"; if [ -n "$base" ]; then g log --format='%h%x09%s' "$base..HEAD" -n ${AHEAD_SHOWN} 2>/dev/null; fi`,
  'echo "#hive:end"'
].join("\n");

export const DIFF_SCRIPT = [
  ...ENTER,
  'if g ls-files --error-unmatch -- "$2" >/dev/null 2>&1; then g diff HEAD -- "$2"; else g diff --no-index -- /dev/null "$2"; fi 2>/dev/null | head -c ' + DIFF_BYTES,
  'echo; echo "#hive:sizes"',
  'g cat-file -s "HEAD:$2" 2>/dev/null || echo 0',
  'if [ -f "$2" ]; then wc -c < "$2"; else echo 0; fi'
].join("\n");

export const DISCARD_SCRIPT = [
  ...ENTER,
  'if g cat-file -e "HEAD:$2" 2>/dev/null; then g checkout HEAD -- "$2" || exit 1',
  'else g rm -q --cached --ignore-unmatch -- "$2" >/dev/null 2>&1; rm -f -- "$2" || exit 1; fi',
  'echo "#hive:done"'
].join("\n");

export function isChangePath(path) {
  const text = String(path || "");
  return !!text && text.length < 400 && !text.startsWith("/") && !text.startsWith("-")
    && !text.includes("\\") && !text.includes("\n") && !text.split("/").includes("..");
}

function sections(raw) {
  const out = new Map();
  let at = "";
  for (const line of String(raw || "").split("\n")) {
    if (line.startsWith(MARK)) {
      at = line.slice(MARK.length).trim();
      out.set(at, []);
      continue;
    }
    if (at) out.get(at).push(line);
  }
  return out;
}

function unquote(path) {
  const text = String(path || "").trim();
  if (!text.startsWith('"')) return text;
  try { return JSON.parse(text); } catch { return text.slice(1, -1); }
}

function landedName(path) {
  const text = String(path || "");
  const braced = text.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braced) return `${braced[1]}${braced[3]}${braced[4]}`.replace(/\/\//g, "/");
  return text.includes(" => ") ? text.split(" => ").pop() : text;
}

const STATUS_LETTER = { "??": "A", A: "A", M: "M", D: "D", R: "R", C: "A", U: "U", T: "M" };

function letterOf(code) {
  if (code === "??") return "A";
  if (code.includes("U") || code === "AA" || code === "DD") return "U";
  for (const one of [code[1], code[0]]) if (one && one !== " " && STATUS_LETTER[one]) return STATUS_LETTER[one];
  return "M";
}

function readStatus(lines) {
  const files = [];
  for (const line of lines) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    const [from, to] = rest.includes(" -> ") ? rest.split(" -> ") : ["", rest];
    files.push({ status: letterOf(code), path: unquote(to), from: from ? unquote(from) : "", untracked: code === "??" });
  }
  return files;
}

function readNumstat(lines) {
  const counts = new Map();
  for (const line of lines) {
    const [added, removed, ...rest] = line.split("\t");
    if (!rest.length) continue;
    const name = landedName(unquote(rest.join("\t").replace(/^\/dev\/null => /, "")));
    const binary = added === "-" && removed === "-";
    counts.set(name, { added: binary ? 0 : Number(added) || 0, removed: binary ? 0 : Number(removed) || 0, binary });
  }
  return counts;
}

function readAhead(lines) {
  return lines.filter(Boolean).map((line) => {
    const [sha, ...subject] = line.split("\t");
    return { sha: sha.trim(), subject: subject.join("\t").trim() };
  }).filter((one) => one.sha);
}

const firstOf = (parts, key) => String(parts.get(key)?.find(Boolean) || "").trim();

export function readChanges(raw) {
  const parts = sections(raw);
  if (parts.has("gone")) return { state: "gone", files: [], ahead: [], added: 0, removed: 0 };
  if (parts.has("norepo")) return { state: "norepo", files: [], ahead: [], added: 0, removed: 0 };
  if (!parts.has("end")) return { state: "unread", files: [], ahead: [], added: 0, removed: 0 };
  const counts = readNumstat(parts.get("numstat") || []);
  const files = readStatus(parts.get("status") || []).map((file) => ({
    ...file,
    ...(counts.get(file.path) || { added: 0, removed: 0, binary: false })
  }));
  const top = firstOf(parts, "top");
  return {
    state: "ok",
    top,
    repo: top.split("/").filter(Boolean).pop() || "",
    branch: firstOf(parts, "branch"),
    head: firstOf(parts, "head"),
    base: firstOf(parts, "base"),
    files,
    ahead: readAhead(parts.get("ahead") || []),
    added: files.reduce((sum, file) => sum + file.added, 0),
    removed: files.reduce((sum, file) => sum + file.removed, 0)
  };
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

export function readDiff(raw) {
  const text = String(raw || "");
  if (text.startsWith(`${MARK}gone`)) return { state: "gone", binary: false, hunks: [], cut: 0 };
  if (text.startsWith(`${MARK}norepo`)) return { state: "norepo", binary: false, hunks: [], cut: 0 };
  const at = text.lastIndexOf(`\n${MARK}sizes\n`);
  const body = at < 0 ? text : text.slice(0, at);
  const sizes = at < 0 ? [] : text.slice(at).split("\n").slice(2).map((one) => Number(one.trim()) || 0);
  const binary = /^Binary files .* differ$/m.test(body) || /^GIT binary patch$/m.test(body);
  const hunks = [];
  let hunk = null;
  let left = 0;
  let right = 0;
  let shown = 0;
  let cut = 0;
  for (const line of body.split("\n")) {
    const head = line.match(HUNK);
    if (head) {
      left = Number(head[1]);
      right = Number(head[2]);
      hunk = { head: line.replace(/ @@ .*$/, " @@"), context: head[3] || "", lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk || line.startsWith("\\")) continue;
    const sign = line[0];
    if (sign !== "+" && sign !== "-" && sign !== " ") continue;
    if (shown >= DIFF_LINES) { cut++; continue; }
    shown++;
    if (sign === "+") hunk.lines.push({ kind: "add", old: 0, new: right++, text: line.slice(1) });
    else if (sign === "-") hunk.lines.push({ kind: "del", old: left++, new: 0, text: line.slice(1) });
    else hunk.lines.push({ kind: "ctx", old: left++, new: right++, text: line.slice(1) });
  }
  return { state: "ok", binary, hunks, cut, before: sizes[0] || 0, after: sizes[1] || 0 };
}

export function changeSignature(file) {
  return `${file.status}:${file.added}:${file.removed}`;
}
