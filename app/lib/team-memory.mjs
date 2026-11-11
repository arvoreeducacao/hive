import { MEMORY_INDEX, indexLineFor, isMemoryFile, joinMemory, readMemory, setField, splitMemory, withIndexLines, withText, withoutIndexLine } from "./memory-files.mjs";
import { INDEX_MAX_BYTES, INDEX_MAX_LINES, TEAM_MEMORY_DIR, checkTeamFile, checkTeamMemory, findSecrets } from "./team-memory-rules.mjs";

const REMOTE = /github\.com[:/]([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;
const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const LOGIN = /^[A-Za-z0-9-]{1,39}$/;
const PR_FIELDS = "number,title,url,author,headRefName,headRefOid,files,statusCheckRollup,reviewDecision,createdAt,isDraft";
const CHECK_GOOD = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const CHECK_PENDING = new Set(["PENDING", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED", "EXPECTED"]);
const TREE_QUERY = "query($owner:String!,$name:String!,$expr:String!){repository(owner:$owner,name:$name){object(expression:$expr){... on Tree{entries{name type object{... on Blob{text}}}}}}}";

export const repoOfRemote = (url) => {
  const found = REMOTE.exec(String(url || "").trim());
  return found ? `${found[1]}/${found[2]}` : "";
};

export const isRepo = (text) => REPO.test(String(text || ""));

export const teamPath = (file) => `${TEAM_MEMORY_DIR}/${file}`;

export function teamFileName(file) {
  const stem = String(file || "").replace(/\.md$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${stem || "memoria"}.md`;
}

export function teamCopy(raw, file) {
  const parts = splitMemory(raw);
  if (!parts) return null;
  let frontmatter = setField(parts.frontmatter, "name", file.replace(/\.md$/, ""));
  frontmatter = setField(frontmatter, "metadata.scope", "team");
  frontmatter = frontmatter.filter((line) => !/^\s+originSessionId:/.test(line));
  return joinMemory({ ...parts, frontmatter });
}

function indexSizeProblems(index) {
  const problems = [];
  const lines = String(index).trimEnd().split("\n").length;
  if (lines > INDEX_MAX_LINES) problems.push({ file: MEMORY_INDEX, kind: "index-lines", what: String(lines) });
  const bytes = Buffer.byteLength(String(index));
  if (bytes > INDEX_MAX_BYTES) problems.push({ file: MEMORY_INDEX, kind: "index-bytes", what: String(bytes) });
  return problems;
}

export function proposalChanges({ memories, teamIndex = "", teamFiles = [] }) {
  const taken = new Set(teamFiles);
  const problems = [];
  const files = {};
  const lines = [];
  const placed = [];
  for (const one of memories) {
    const file = teamFileName(one.file);
    if (taken.has(file) || files[file]) {
      problems.push({ file, kind: "exists", from: one.id });
      continue;
    }
    const raw = teamCopy(one.raw, file);
    if (raw === null) {
      problems.push({ file, kind: "no-frontmatter", from: one.id });
      continue;
    }
    const memory = readMemory(file, raw);
    problems.push(...checkTeamFile(file, raw).map((problem) => ({ ...problem, from: one.id })), ...findSecrets(file, raw).map((problem) => ({ ...problem, from: one.id })));
    files[file] = raw;
    placed.push({ id: one.id, file, name: memory.name, description: memory.description });
    lines.push(indexLineFor({ file, title: one.title || memory.name, hook: one.hook || memory.description }));
  }
  const index = withIndexLines(teamIndex, lines);
  problems.push(...indexSizeProblems(index), ...findSecrets(MEMORY_INDEX, lines.join("\n")));
  const changes = [...Object.entries(files).map(([file, content]) => ({ path: teamPath(file), content })), { path: teamPath(MEMORY_INDEX), content: index }];
  return { changes, placed, problems, blocked: problems.length > 0 };
}

export function editChanges({ file, raw, description, body }) {
  if (!isMemoryFile(file)) return { problems: [{ file, kind: "file-name" }], blocked: true, changes: [] };
  const content = withText(raw, { description, body });
  const problems = [...checkTeamFile(file, content), ...findSecrets(file, content)];
  return { changes: [{ path: teamPath(file), content }], problems, blocked: problems.length > 0 };
}

export function deleteChanges({ file, teamIndex }) {
  if (!isMemoryFile(file)) return { problems: [{ file, kind: "file-name" }], blocked: true, changes: [] };
  return { changes: [{ path: teamPath(file), content: null }, { path: teamPath(MEMORY_INDEX), content: withoutIndexLine(teamIndex, file) }], problems: [], blocked: false };
}

export function rollupState(rollup) {
  const checks = Array.isArray(rollup) ? rollup : [];
  if (!checks.length) return "none";
  const states = checks.map((one) => String(one?.conclusion || one?.state || one?.status || "").toUpperCase());
  if (states.some((one) => one && !CHECK_GOOD.has(one) && !CHECK_PENDING.has(one) && one !== "COMPLETED")) return "failing";
  if (states.some((one) => CHECK_PENDING.has(one) || !one || one === "COMPLETED")) return "pending";
  return "passing";
}

export function branchFor(login, files, at = new Date()) {
  const who = LOGIN.test(String(login || "")) ? String(login).toLowerCase() : "hive";
  const stem = (files[0] || "memoria").replace(/\.md$/, "").slice(0, 40).replace(/-+$/, "");
  const stamp = at.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  return `${who}/-/memoria-${stem}-${stamp}`;
}

function treeOf(answer) {
  const entries = answer?.data?.repository?.object?.entries;
  if (!Array.isArray(entries)) return { index: "", files: {}, found: false };
  const files = {};
  let index = "";
  for (const one of entries) {
    if (one?.type !== "blob" || typeof one.object?.text !== "string") continue;
    if (one.name === MEMORY_INDEX) index = one.object.text;
    else if (isMemoryFile(one.name) && one.name !== "README.md") files[one.name] = one.object.text;
  }
  return { index, files, found: true };
}

const lastLine = (text, fallback) => String(text || "").split("\n").map((one) => one.trim()).filter(Boolean).pop() || fallback;

export function createTeamMemoryHub({ gh, repo, base = "main", now = () => new Date() }) {
  let login = null;

  const repoNow = async () => {
    const name = typeof repo === "function" ? await repo() : repo;
    return isRepo(name) ? name : "";
  };

  async function ghJson(args, input) {
    const said = await gh(args, input === undefined ? {} : { input: JSON.stringify(input) });
    if (!said.ok) return { error: lastLine(said.error, "gh refused") };
    try { return { value: JSON.parse(said.out || "null") }; } catch { return { error: "gh did not answer in JSON" }; }
  }

  async function me() {
    if (login) return login;
    const said = await gh(["api", "user", "--jq", ".login"], {});
    const name = said.ok ? String(said.out || "").trim() : "";
    if (LOGIN.test(name)) login = name;
    return login || "";
  }

  async function tree(ref) {
    const name = await repoNow();
    const [owner, short] = name.split("/");
    const said = await ghJson(["api", "graphql", "-f", `query=${TREE_QUERY}`, "-F", `owner=${owner}`, "-F", `name=${short}`, "-f", `expr=${ref}:${TEAM_MEMORY_DIR}`]);
    if (said.error) return { error: said.error };
    return treeOf(said.value);
  }

  async function team() {
    const name = await repoNow();
    if (!name) return { state: "no-repo" };
    const read = await tree(base);
    if (read.error) return { state: "down", why: read.error, repo: name };
    const memories = Object.entries(read.files).map(([file, raw]) => ({ ...readMemory(file, raw), raw })).sort((a, b) => a.name.localeCompare(b.name));
    return { state: "ok", repo: name, found: read.found, index: read.index, memories, me: await me() };
  }

  async function proposals() {
    const name = await repoNow();
    if (!name) return { state: "no-repo" };
    const said = await ghJson(["pr", "list", "-R", name, "--state", "open", "--limit", "50", "--json", PR_FIELDS]);
    if (said.error) return { state: "down", why: said.error, repo: name };
    const touching = (Array.isArray(said.value) ? said.value : []).filter((pr) => (pr.files || []).some((one) => String(one.path || "").startsWith(`${TEAM_MEMORY_DIR}/`)));
    const out = [];
    for (const pr of touching) {
      const head = await tree(pr.headRefOid || pr.headRefName);
      const changed = (pr.files || []).filter((one) => String(one.path || "").startsWith(`${TEAM_MEMORY_DIR}/`));
      const memories = changed.map((one) => {
        const file = one.path.slice(TEAM_MEMORY_DIR.length + 1);
        const raw = head.files?.[file];
        const kind = String(one.changeType || "").toUpperCase();
        if (file === MEMORY_INDEX) return null;
        if (kind === "DELETED" || raw === undefined) return { file, change: "deleted", name: file.replace(/\.md$/, ""), description: "", body: "" };
        return { file, change: kind === "ADDED" ? "added" : "modified", ...readMemory(file, raw) };
      }).filter(Boolean);
      out.push({
        number: pr.number,
        title: pr.title,
        url: pr.url,
        author: pr.author?.login || "",
        createdAt: pr.createdAt || "",
        draft: !!pr.isDraft,
        review: pr.reviewDecision || "",
        checks: rollupState(pr.statusCheckRollup),
        problems: head.error ? [] : checkTeamMemory({ index: head.index, files: head.files }),
        memories
      });
    }
    return { state: "ok", repo: name, me: await me(), proposals: out };
  }

  async function openChange({ title, body, message, changes, branchFiles }) {
    const name = await repoNow();
    if (!name) return { error: "no team memory repository" };
    const ref = await ghJson(["api", `repos/${name}/git/ref/heads/${base}`]);
    if (ref.error) return { error: ref.error };
    const parent = ref.value?.object?.sha;
    const commit = await ghJson(["api", `repos/${name}/git/commits/${parent}`]);
    if (commit.error) return { error: commit.error };
    const entries = changes.map((one) => (one.content === null
      ? { path: one.path, mode: "100644", type: "blob", sha: null }
      : { path: one.path, mode: "100644", type: "blob", content: one.content }));
    const made = await ghJson(["api", "-X", "POST", `repos/${name}/git/trees`, "--input", "-"], { base_tree: commit.value?.tree?.sha, tree: entries });
    if (made.error) return { error: made.error };
    const next = await ghJson(["api", "-X", "POST", `repos/${name}/git/commits`, "--input", "-"], { message, tree: made.value?.sha, parents: [parent] });
    if (next.error) return { error: next.error };
    const branch = branchFor(await me(), branchFiles, now());
    const pushed = await ghJson(["api", "-X", "POST", `repos/${name}/git/refs`, "--input", "-"], { ref: `refs/heads/${branch}`, sha: next.value?.sha });
    if (pushed.error) return { error: pushed.error };
    const pr = await ghJson(["api", "-X", "POST", `repos/${name}/pulls`, "--input", "-"], { title, body, head: branch, base });
    if (pr.error) return { error: pr.error };
    return { number: pr.value?.number, url: pr.value?.html_url, repo: name, branch };
  }

  async function propose({ memories, title, body }) {
    const name = await repoNow();
    if (!name) return { state: "no-repo" };
    const current = await tree(base);
    if (current.error) return { state: "down", why: current.error };
    const built = proposalChanges({ memories, teamIndex: current.index, teamFiles: Object.keys(current.files) });
    if (built.blocked) return { state: "blocked", problems: built.problems };
    const opened = await openChange({ title, body, message: title, changes: built.changes, branchFiles: built.placed.map((one) => one.file) });
    if (opened.error) return { state: "down", why: opened.error };
    return { state: "ok", pr: opened, placed: built.placed };
  }

  async function changeTeam({ file, kind, description, body, title, prBody }) {
    const name = await repoNow();
    if (!name) return { state: "no-repo" };
    const current = await tree(base);
    if (current.error) return { state: "down", why: current.error };
    const raw = current.files[file];
    if (raw === undefined) return { state: "gone" };
    const built = kind === "delete" ? deleteChanges({ file, teamIndex: current.index }) : editChanges({ file, raw, description, body });
    if (built.blocked) return { state: "blocked", problems: built.problems };
    const opened = await openChange({ title, body: prBody, message: title, changes: built.changes, branchFiles: [file] });
    if (opened.error) return { state: "down", why: opened.error };
    return { state: "ok", pr: opened };
  }

  async function approve(number) {
    const name = await repoNow();
    if (!name) return { state: "no-repo" };
    const n = Number(number);
    if (!Number.isInteger(n) || n < 1) return { state: "bad", why: "no such pull request" };
    const pr = await ghJson(["pr", "view", String(n), "-R", name, "--json", "author,state,files"]);
    if (pr.error) return { state: "down", why: pr.error };
    if (pr.value?.state !== "OPEN") return { state: "bad", why: "the pull request is not open" };
    if (!(pr.value?.files || []).some((one) => String(one.path || "").startsWith(`${TEAM_MEMORY_DIR}/`))) return { state: "bad", why: "the pull request does not touch the team memory" };
    const mine = await me();
    if (!mine) return { state: "down", why: "gh is not signed in" };
    if (String(pr.value?.author?.login || "").toLowerCase() === mine.toLowerCase()) return { state: "own" };
    const reviewed = await gh(["pr", "review", String(n), "-R", name, "--approve"], {});
    if (!reviewed.ok) return { state: "down", why: lastLine(reviewed.error, "gh refused the review") };
    const merged = await gh(["pr", "merge", String(n), "-R", name, "--merge"], {});
    if (!merged.ok) return { state: "approved", why: lastLine(merged.error, "gh refused the merge") };
    return { state: "ok" };
  }

  async function prStates(prs) {
    const out = new Map();
    for (const one of prs) {
      if (!isRepo(one.repo) || !Number.isInteger(Number(one.number))) continue;
      const said = await ghJson(["pr", "view", String(one.number), "-R", one.repo, "--json", "state"]);
      if (!said.error && said.value?.state) out.set(`${one.repo}#${one.number}`, said.value.state);
    }
    return out;
  }

  return { repo: repoNow, me, team, proposals, propose, changeTeam, approve, prStates };
}

