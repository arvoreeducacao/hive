export const TREE_LISTED = 50000;

export const FILE_SHOWN = 1 << 20;

export const MATCHES_SHOWN = 200;

export const TREE_FRESH = 15000;

export const TREES_KEPT = 32;

const MARK = "#hive:";

const PRUNED = ["node_modules", ".git", "dist", "build", ".next", ".venv", "_build", "deps", ".worktrees"];

const ENTER = [
  'cd "$1" 2>/dev/null || { echo "#hive:gone"; exit 0; }',
  'top=$(pwd -P)'
];

export const TREE_SCRIPT = [
  ...ENTER,
  'if [ -n "$2" ]; then',
  '  cd "./$2" 2>/dev/null || { echo "#hive:gone"; exit 0; }',
  '  case "$(pwd -P)/" in "$top"/*) ;; *) echo "#hive:outside"; exit 0 ;; esac',
  'fi',
  'if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then',
  '  echo "#hive:git"',
  '  echo "#hive:files"',
  `  git --no-optional-locks ls-files -z --cached --others --exclude-standard 2>/dev/null | tr '\\0' '\\n' | head -n ${TREE_LISTED + 1}`,
  '  echo "#hive:deleted"',
  `  git --no-optional-locks ls-files -z --deleted 2>/dev/null | tr '\\0' '\\n' | head -n ${TREE_LISTED}`,
  'else',
  '  echo "#hive:files"',
  `  find . -type d \\( ${PRUNED.map((name) => `-name ${name}`).join(" -o ")} \\) -prune -o \\( -type f -o -type l \\) -print 2>/dev/null | sed 's|^\\./||' | head -n ${TREE_LISTED + 1}`,
  'fi',
  'echo "#hive:end"'
].join("\n");

export const READ_SCRIPT = [
  ...ENTER,
  'f="./$2"',
  '[ -e "$f" ] || { echo "#hive:missing"; exit 0; }',
  'real=$(realpath "$f" 2>/dev/null || readlink -f "$f" 2>/dev/null) || { echo "#hive:missing"; exit 0; }',
  'case "$real" in "$top"/*) ;; *) echo "#hive:outside"; exit 0 ;; esac',
  '[ -d "$real" ] && { echo "#hive:folder"; exit 0; }',
  '[ -f "$real" ] || { echo "#hive:missing"; exit 0; }',
  'size=$(wc -c < "$real" | tr -d " ")',
  'echo "#hive:size"; echo "$size"',
  'whole=$(head -c 8000 "$real" | wc -c | tr -d " ")',
  "kept=$(head -c 8000 \"$real\" | tr -d '\\000' | wc -c | tr -d \" \")",
  '[ "$whole" = "$kept" ] || { echo "#hive:binary"; exit 0; }',
  '[ "$size" -le "$3" ] || { echo "#hive:big"; exit 0; }',
  'echo "#hive:body"',
  'base64 < "$real"',
  'echo "#hive:end"'
].join("\n");

export function isProjectPath(path) {
  const text = String(path || "");
  return !!text && text.length < 400 && !text.startsWith("/") && !text.startsWith("-")
    && !text.includes("\\") && !text.includes("\n") && !text.includes("\0")
    && !text.split("/").some((part) => part === ".." || part === "." || part === "");
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

export function readTree(raw) {
  const parts = sections(raw);
  if (parts.has("gone")) return { state: "gone", files: [], nested: [], cut: false, git: false };
  if (parts.has("outside")) return { state: "outside", files: [], nested: [], cut: false, git: false };
  if (!parts.has("end")) return { state: "unread", files: [], nested: [], cut: false, git: false };
  const deleted = new Set((parts.get("deleted") || []).filter(Boolean));
  const listed = (parts.get("files") || []).filter(Boolean);
  const cut = listed.length > TREE_LISTED;
  const files = [];
  const nested = [];
  for (const path of listed.slice(0, TREE_LISTED)) {
    if (path.endsWith("/")) {
      const repo = path.replace(/\/+$/, "");
      if (isProjectPath(repo)) nested.push(repo);
      continue;
    }
    if (!deleted.has(path) && isProjectPath(path)) files.push(path);
  }
  return { state: "ok", git: parts.has("git"), files: [...new Set(files)], nested, cut };
}

export function readProjectFile(raw) {
  const parts = sections(raw);
  for (const state of ["gone", "missing", "outside", "folder"]) if (parts.has(state)) return { state };
  const size = Number((parts.get("size") || [])[0]) || 0;
  if (parts.has("binary")) return { state: "binary", size };
  if (parts.has("big")) return { state: "big", size };
  if (!parts.has("body") || !parts.has("end")) return { state: "unread" };
  const bytes = Buffer.from((parts.get("body") || []).join("").replace(/\s/g, ""), "base64");
  return { state: "ok", size, text: bytes.toString("utf8") };
}

const nameSort = (a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }) || (a < b ? -1 : a > b ? 1 : 0);

export function treeIndex(files, nested = []) {
  const dirs = new Map();
  const ensure = (path) => {
    let node = dirs.get(path);
    if (node) return node;
    node = { dirs: new Set(), files: [], nested: false };
    dirs.set(path, node);
    if (path) {
      const at = path.lastIndexOf("/");
      ensure(at < 0 ? "" : path.slice(0, at)).dirs.add(at < 0 ? path : path.slice(at + 1));
    }
    return node;
  };
  ensure("");
  for (const file of files) {
    const at = file.lastIndexOf("/");
    ensure(at < 0 ? "" : file.slice(0, at)).files.push(at < 0 ? file : file.slice(at + 1));
  }
  for (const repo of nested) ensure(repo).nested = true;
  return dirs;
}

const joined = (dir, name) => (dir ? `${dir}/${name}` : name);

export function listDir(index, dir = "") {
  const node = index.get(dir);
  if (!node) return { dir, dirs: [], files: [], missing: true };
  const dirs = [...node.dirs].sort(nameSort).map((name) => {
    let path = joined(dir, name);
    let label = name;
    let inner = index.get(path);
    while (inner && !inner.nested && !inner.files.length && inner.dirs.size === 1) {
      const [only] = inner.dirs;
      path = joined(path, only);
      label = `${label}/${only}`;
      inner = index.get(path);
    }
    return { name: label, path, nested: !!inner?.nested };
  });
  const files = [...node.files].sort(nameSort).map((name) => ({ name, path: joined(dir, name) }));
  return { dir, dirs, files };
}

export function findPaths(files, q, limit = MATCHES_SHOWN) {
  const needle = String(q || "").trim().toLowerCase();
  if (!needle) return { paths: [], total: 0 };
  const scored = [];
  for (const path of files) {
    const lower = path.toLowerCase();
    const base = lower.slice(lower.lastIndexOf("/") + 1);
    const score = base.startsWith(needle) ? 0 : base.includes(needle) ? 1 : lower.includes(needle) ? 2 : -1;
    if (score >= 0) scored.push([score, path]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length || nameSort(a[1], b[1]));
  return { paths: scored.slice(0, limit).map((one) => one[1]), total: scored.length };
}

const prefixed = (mount, path) => (mount ? `${mount}/${path}` : path);

function withMount(listing, mount) {
  if (!mount) return listing;
  return {
    ...listing,
    dir: prefixed(mount, listing.dir).replace(/\/$/, ""),
    dirs: listing.dirs.map((one) => ({ ...one, path: prefixed(mount, one.path) })),
    files: listing.files.map((one) => ({ ...one, path: prefixed(mount, one.path) }))
  };
}

export function createProjectFiles({ run, now = Date.now, fresh = TREE_FRESH }) {
  const held = new Map();

  async function listing(asked, mount, force) {
    const key = `${asked.where}|${asked.name}|${asked.tree || ""}|${mount}`;
    const hit = held.get(key);
    if (!force && hit?.value && now() - hit.at < fresh) return hit.value;
    if (hit?.running) return hit.running;
    const running = (async () => {
      const said = await run(asked, TREE_SCRIPT, [mount]);
      const tree = readTree(said.out);
      const value = { ...tree, root: said.dir || "", index: tree.state === "ok" ? treeIndex(tree.files, tree.nested) : new Map(), error: tree.state === "unread" ? String(said.error || "").slice(0, 160) : "" };
      held.delete(key);
      held.set(key, { at: now(), value, running: null });
      for (const old of [...held.keys()].slice(0, Math.max(0, held.size - TREES_KEPT))) held.delete(old);
      return value;
    })().catch((wrong) => {
      held.delete(key);
      return { state: "unread", files: [], nested: [], index: new Map(), root: "", cut: false, git: false, error: String(wrong?.message || wrong).slice(0, 160) };
    });
    held.set(key, { ...(hit || { at: 0, value: null }), running });
    return running;
  }

  const mountOf = (top, path) => top.nested.find((repo) => path === repo || path.startsWith(`${repo}/`)) || "";

  async function tree(asked) {
    const force = !!asked.force;
    const top = await listing(asked, "", force);
    const head = { state: top.state, root: top.root, git: top.git, cut: top.cut, total: top.files.length, ...(top.error ? { error: top.error } : {}) };
    if (top.state !== "ok") return head;
    const q = String(asked.q || "");
    if (q.trim()) {
      const mounted = [];
      for (const repo of top.nested) {
        const hit = held.get(`${asked.where}|${asked.name}|${asked.tree || ""}|${repo}`)?.value;
        if (hit?.state === "ok") mounted.push(...hit.files.map((path) => prefixed(repo, path)));
      }
      const found = findPaths([...top.files, ...mounted], q);
      return { ...head, q, matches: found.paths, matched: found.total };
    }
    const dir = String(asked.dir || "");
    const mount = mountOf(top, dir);
    if (!mount) return { ...head, listing: listDir(top.index, dir) };
    const inner = await listing(asked, mount, force);
    if (inner.state !== "ok") return { ...head, listing: { dir, dirs: [], files: [], missing: true, error: inner.error || inner.state } };
    const rest = dir === mount ? "" : dir.slice(mount.length + 1);
    return { ...head, listing: withMount(listDir(inner.index, rest), mount) };
  }

  async function file(asked) {
    const said = await run(asked, READ_SCRIPT, [asked.path, String(FILE_SHOWN)]);
    const read = readProjectFile(said.out);
    if (read.state === "unread") return { ...read, error: String(said.error || "").slice(0, 160) || "could not read the file" };
    return read;
  }

  return { tree, file, forget: () => held.clear() };
}
