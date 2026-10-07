import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { stackOf } from "../manifest/scan.mjs";
import { repoName } from "../manifest/resolve.mjs";
import { DEFAULT_GATEWAY_PORT, MANAGED_FILES, MANIFEST_FILE, SKILL_TO_WRITE, linePlanOf, mcpEntryOf, mcpPlanOf, repoEntryOf, repoPlanOf, skillDescriptionOf, skillEntryOf, skillPlanOf, withRepoLine } from "../lib/hub-workspace.mjs";

const SYNC_WALK = [
  'for root in "$1" "$1/.worktrees"; do',
  '  [ -d "$root" ] || continue',
  '  for dir in "$root"/*/ "$root"/*/*/; do',
  '    [ -e "$dir.git" ] || continue',
  '    branch=$(git -C "$dir" symbolic-ref --quiet --short HEAD 2>/dev/null) || continue',
  '    loose=$(git -C "$dir" status --porcelain 2>/dev/null | grep -cv " \\.worktrees/\\{0,1\\}$" | tr -d " ")',
  '    ahead=0',
  '    git -C "$dir" rev-parse --quiet --verify "@{u}" >/dev/null 2>&1 && ahead=$(git -C "$dir" log --oneline "@{u}..HEAD" 2>/dev/null | wc -l | tr -d " ")',
  '    rel=${dir#"$root/"}',
  '    top=0; [ "$root" = "$1" ] && case "$rel" in */*/) ;; *) top=1 ;; esac',
  '    printf "%s\\t%s\\t%s\\t%s\\t%s\\n" "$(basename "${dir%/}")" "$branch" "$loose" "$ahead" "$top"',
  '  done',
  'done',
  'true'
].join("\n");

function readSyncWalk(raw) {
  const repos = [];
  for (const line of String(raw || "").split("\n")) {
    const [name, branch, loose, ahead, top] = line.split("\t");
    if (!name || !branch) continue;
    repos.push({ name, branch, loose: Number(loose) || 0, ahead: Number(ahead) || 0, top: top === "1" });
  }
  return repos;
}

function sideOf(repos) {
  const pending = repos.filter((repo) => repo.loose || repo.ahead);
  return {
    repos: repos.length,
    pending: pending.length,
    loose: pending.reduce((total, repo) => total + repo.loose, 0),
    ahead: pending.reduce((total, repo) => total + repo.ahead, 0),
    list: pending.sort((left, right) => (right.loose + right.ahead) - (left.loose + left.ahead)),
    every: repos
  };
}

export function createWorkspaceDomain({
  sh,
  inBash,
  podUp,
  onTheServer,
  hub,
  workspaceOf,
  readManifest,
  bodyOf = async () => ({}),
  shr = async () => ({ ok: false, out: "", error: "the hive cannot run commands here" }),
  gitSaid = (error) => String(error || "?").split("\n").filter(Boolean).pop() || "?",
  readFileImpl = readFile,
  writeFileImpl = writeFile,
  mkdirImpl = (path) => mkdir(path, { recursive: true }),
  existsImpl = existsSync,
  fetchImpl = globalThis.fetch,
  readdirImpl = readdir,
  stackOfImpl = stackOf,
  gatewayPort = DEFAULT_GATEWAY_PORT,
  cloneTimeout = 600000,
  now = Date.now
}) {
  let syncCache = { at: 0, data: null, running: null };
  let hubCache = { at: 0, data: null, running: null };
  const jobs = new Map();

  async function readSync(force) {
    if (!force && syncCache.data && now() - syncCache.at < 45000) return syncCache.data;
    if (!syncCache.running) {
      syncCache.running = (async () => {
        const [hereRaw, podRaw] = await Promise.all([
          sh(...inBash(`set -- ${JSON.stringify(hub)}\n${SYNC_WALK}`), { timeout: 90000 }),
          (await podUp())
            ? onTheServer(SYNC_WALK, ["$HIVE_WORKSPACE/repos"], { timeout: 90000 }).then((result) => result.out)
            : null
        ]);
        const podRepos = podRaw === null ? [] : readSyncWalk(podRaw);
        const data = { here: sideOf(readSyncWalk(hereRaw)), pod: podRaw === null || !podRepos.length ? null : sideOf(podRepos), at: new Date(now()).toISOString() };
        syncCache = { at: now(), data, running: null };
        return data;
      })().catch(() => {
        syncCache.running = null;
        return syncCache.data || { here: sideOf([]), pod: null };
      });
    }
    return syncCache.data || syncCache.running;
  }

  async function textOf(...parts) {
    return readFileImpl(join(hub, ...parts), "utf8").catch(() => null);
  }

  async function jsonOf(...parts) {
    const text = await textOf(...parts);
    if (text === null) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  async function skillFolders() {
    const entries = await readdirImpl(join(hub, ".claude", "skills"), { withFileTypes: true }).catch(() => []);
    const folders = entries.filter((entry) => entry.isDirectory() || entry.isSymbolicLink()).map((entry) => entry.name);
    const withSkill = await Promise.all(folders.map(async (name) => {
      const inside = await readdirImpl(join(hub, ".claude", "skills", name)).catch(() => []);
      return inside.some((file) => String(file?.name ?? file) === "SKILL.md") ? name : "";
    }));
    return withSkill.filter(Boolean).sort();
  }

  async function readHub(force) {
    if (!force && hubCache.data && now() - hubCache.at < 30000) return hubCache.data;
    if (force) hubCache = { ...hubCache, data: null };
    if (!hubCache.running) {
      hubCache.running = (async () => {
        const manifestText = await textOf(MANIFEST_FILE);
        const read = manifestText === null ? { state: "none" } : { ...readManifest(manifestText), path: MANIFEST_FILE };
        const [mcpJson, servers, skillDirs] = await Promise.all([jsonOf(".mcp.json"), jsonOf(".mcp-servers", "servers.json"), skillFolders()]);
        const gateway = servers?.servers && typeof servers.servers === "object" ? Object.keys(servers.servers) : [];
        const data = { read, mcpJson, gateway, skillDirs };
        hubCache = { at: now(), data, running: null };
        return data;
      })().catch(() => {
        hubCache.running = null;
        return hubCache.data || { read: { state: "unreadable", said: "the hive could not read the hub" }, mcpJson: null, gateway: [], skillDirs: [] };
      });
    }
    return hubCache.data || hubCache.running;
  }

  function stacksOf(repos) {
    const stacks = {};
    for (const repo of repos) {
      if (!repo.top) continue;
      try {
        stacks[repo.name] = stackOfImpl(join(hub, repo.name));
      } catch {
        stacks[repo.name] = "";
      }
    }
    return stacks;
  }

  function withJobs(repos) {
    return repos.map((repo) => {
      const job = jobs.get(repo.name);
      if (!job) return repo;
      if (job.state === "cloned" && repo.cloned) {
        jobs.delete(repo.name);
        return repo;
      }
      return { ...repo, job: { state: job.state, error: job.error || "" } };
    });
  }

  async function readWorkspace(force) {
    const [{ read, mcpJson, gateway, skillDirs }, sync] = await Promise.all([readHub(force), readSync(force)]);
    const onDisk = sync?.here?.every ?? [];
    const shaped = workspaceOf(read, onDisk, { name: basename(hub), stacks: stacksOf(onDisk), mcpJson, gateway, skillDirs, gatewayPort });
    return { ...shaped, repos: withJobs(shaped.repos), hub, at: new Date(now()).toISOString() };
  }

  function invalidateSync() {
    syncCache = { at: 0, data: null, running: null };
    hubCache = { at: 0, data: null, running: null };
  }

  async function planRepoFor(typed, choices, cloned) {
    const [manifestText, ...managed] = await Promise.all([textOf(MANIFEST_FILE), ...MANAGED_FILES.map((file) => textOf(file))]);
    if (manifestText === null) return { error: `there is no ${MANIFEST_FILE} in the hub to write into` };
    const read = readManifest(manifestText);
    if (read.state !== "read") return { error: read.said || `${MANIFEST_FILE} did not read` };
    const files = Object.fromEntries(MANAGED_FILES.map((file, at) => [file, managed[at]]));
    return repoPlanOf({ entry: typed.entry, manifestText, files, cloned, choices });
  }

  async function planRepo(asked) {
    const typed = repoEntryOf(asked?.repo);
    if (typed.error) return { error: typed.error };
    const choices = asked?.block && typeof asked.block === "object" ? asked.block : {};
    return planRepoFor(typed, choices, existsImpl(join(hub, typed.name, ".git")));
  }

  async function settleStack(name) {
    let stack = "";
    try {
      stack = stackOfImpl(join(hub, name));
    } catch {
      return;
    }
    if (!stack || stack === "unknown") return;
    for (const file of MANAGED_FILES) {
      const text = await textOf(file);
      if (text === null) continue;
      const written = withRepoLine(text, name, stack);
      if (written.state === "updated") await writeFileImpl(join(hub, file), written.text).catch(() => {});
    }
  }

  function startClone(entry, name) {
    if (jobs.get(name)?.state === "cloning") return;
    jobs.set(name, { state: "cloning", at: now() });
    shr("gh", ["repo", "clone", entry, join(hub, name)], { timeout: cloneTimeout, cwd: hub }).then(async (r) => {
      if (!r.ok) {
        jobs.set(name, { state: "failed", error: gitSaid(r.error), at: now() });
        return;
      }
      jobs.set(name, { state: "cloned", at: now() });
      await settleStack(name);
      invalidateSync();
    }).catch((wrong) => {
      jobs.set(name, { state: "failed", error: String(wrong?.message || wrong), at: now() });
    }).finally(pumpClones);
  }

  function pumpClones() {
    if ([...jobs.values()].some((job) => job.state === "cloning")) return;
    const next = [...jobs.entries()].find(([, job]) => job.state === "queued");
    if (!next) return;
    const [name, job] = next;
    startClone(job.entry, name);
  }

  function queueClones(repos) {
    const queued = [];
    for (const repo of repos) {
      const state = jobs.get(repo.name)?.state;
      if (state === "cloning" || state === "queued") continue;
      jobs.set(repo.name, { state: "queued", entry: repo.entry, at: now() });
      queued.push(repo.name);
    }
    pumpClones();
    return queued;
  }

  function stopClones() {
    const stopped = [];
    for (const [name, job] of jobs) {
      if (job.state !== "queued") continue;
      jobs.delete(name);
      stopped.push(name);
    }
    return stopped;
  }

  async function addRepo(asked) {
    const plan = await planRepo(asked);
    if (plan.error) return plan;
    if (plan.asks) return { error: "say where the hive block goes before writing", plan: { ...plan, writes: undefined } };
    for (const [file, text] of Object.entries(plan.writes)) await writeFileImpl(join(hub, file), text);
    if (plan.clone) startClone(plan.entry, plan.name);
    invalidateSync();
    return { ok: true, cloning: plan.clone, plan: { ...plan, writes: undefined } };
  }

  async function manifestFor(asked) {
    const manifestText = await textOf(MANIFEST_FILE);
    if (manifestText === null) return { error: `there is no ${MANIFEST_FILE} in the hub to write into` };
    const read = readManifest(manifestText);
    if (read.state !== "read") return { error: read.said || `${MANIFEST_FILE} did not read` };
    const declared = read.manifest.repos.filter((entry) => typeof entry === "string").map(repoName);
    const choices = asked?.block && typeof asked.block === "object" ? asked.block : {};
    return { manifestText, declared, choices };
  }

  async function writePlan(plan) {
    for (const [file, text] of Object.entries(plan.writes)) {
      const path = join(hub, file);
      if (file.includes("/")) await mkdirImpl(dirname(path));
      await writeFileImpl(path, text);
    }
  }

  async function gatewayReload() {
    const token = ((await textOf(".mcp-servers", ".token")) || process.env.HIVE_MCP_GATEWAY_TOKEN || "").trim();
    if (!token || typeof fetchImpl !== "function") return { reached: false };
    try {
      const res = await fetchImpl(`http://127.0.0.1:${gatewayPort}/reload`, { method: "POST", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
      const body = await res.json().catch(() => ({}));
      return { reached: res.ok, servers: body.servidores || null, missing: body.faltando || {} };
    } catch {
      return { reached: false };
    }
  }

  async function planMcp(asked) {
    const base = await manifestFor(asked);
    if (base.error) return base;
    const entry = mcpEntryOf(asked, { declared: base.declared, gatewayPort });
    if (entry.error) return { error: entry.error };
    const [mcpJsonText, serversText, envText] = await Promise.all([textOf(".mcp.json"), textOf(".mcp-servers", "servers.json"), textOf(".env")]);
    return mcpPlanOf({ entry, manifestText: base.manifestText, mcpJsonText, serversText, envText });
  }

  async function addMcp(asked) {
    const plan = await planMcp(asked);
    if (plan.error) return plan;
    await writePlan(plan);
    invalidateSync();
    const gateway = plan.kind === "stdio" ? await gatewayReload() : { reached: false };
    return { ok: true, gateway, plan: { ...plan, writes: undefined } };
  }

  async function planSkill(asked) {
    const base = await manifestFor(asked);
    if (base.error) return base;
    const entry = skillEntryOf(asked, { declared: base.declared });
    if (entry.error) return { error: entry.error };
    const agentsText = await textOf("AGENTS.md");
    const exists = existsImpl(join(hub, ".claude", "skills", entry.name, "SKILL.md"));
    return skillPlanOf({ entry, manifestText: base.manifestText, agentsText, exists, choices: base.choices });
  }

  async function addSkill(asked) {
    const plan = await planSkill(asked);
    if (plan.error) return plan;
    if (plan.asks) return { error: "say where the skills block goes before writing", plan: { ...plan, writes: undefined } };
    await writePlan(plan);
    invalidateSync();
    return { ok: true, plan: { ...plan, writes: undefined }, file: join(hub, ".claude", "skills", plan.name, "SKILL.md") };
  }

  async function entryOnDisk(name) {
    const remote = await shr("git", ["-C", join(hub, name), "remote", "get-url", "origin"], { timeout: 10000, cwd: hub });
    const typed = repoEntryOf(String(remote?.out || "").trim());
    if (!remote?.ok || typed.error) return { error: `${name} has no GitHub remote the hive can write as org/name` };
    if (typed.name !== name) return { error: `${name} is checked out from ${typed.entry}, whose name differs` };
    return typed;
  }

  async function planRepoLine(name, choices) {
    const typed = await entryOnDisk(name);
    if (typed.error) return typed;
    return planRepoFor(typed, choices, true);
  }

  async function planSkillLine(name, choices) {
    const base = await manifestFor({ block: choices });
    if (base.error) return base;
    const description = skillDescriptionOf(await textOf(".claude", "skills", name, "SKILL.md")) || SKILL_TO_WRITE;
    const entry = skillEntryOf({ name, description, scope: "" }, { declared: base.declared });
    if (entry.error) return { error: entry.error };
    const agentsText = await textOf("AGENTS.md");
    return skillPlanOf({ entry, manifestText: base.manifestText, agentsText, exists: true, choices: base.choices });
  }

  async function planSkillFile(name, scope, choices) {
    const base = await manifestFor({ block: choices });
    if (base.error) return base;
    const entry = skillEntryOf({ name, description: SKILL_TO_WRITE, scope: Array.isArray(scope) ? scope.join(", ") : "" }, { declared: base.declared });
    if (entry.error) return { error: entry.error };
    const agentsText = await textOf("AGENTS.md");
    return skillPlanOf({ entry, manifestText: base.manifestText, agentsText, exists: false, choices: base.choices });
  }

  async function planMcpLine(name) {
    const manifestText = await textOf(MANIFEST_FILE);
    if (manifestText === null) return { error: `there is no ${MANIFEST_FILE} in the hub to write into` };
    return linePlanOf({ root: "mcps", name, scope: "*", manifestText });
  }

  const FIX_KINDS = ["repo-line", "clone-all", "skill-line", "skill-file", "mcp-line"];

  function fixesOf(shaped, what, name) {
    const wanted = (kind) => what === "all" || what === kind;
    const named = (item) => !name || item.name === name;
    const items = [];
    if (wanted("repo-line")) for (const r of (shaped.repos || []).filter((r) => !r.declared && r.cloned && named(r))) items.push({ what: "repo-line", name: r.name });
    if (wanted("skill-line")) for (const s of (shaped.skills || []).filter((s) => s.onDisk && !s.declared && named(s))) items.push({ what: "skill-line", name: s.name });
    if (wanted("skill-file")) for (const s of (shaped.skills || []).filter((s) => s.declared && !s.onDisk && named(s))) items.push({ what: "skill-file", name: s.name, scope: s.repos });
    if (wanted("mcp-line")) for (const m of (shaped.mcps || []).filter((m) => m.wired && !m.declared && named(m))) items.push({ what: "mcp-line", name: m.name });
    if (wanted("clone-all")) {
      const missing = (shaped.repos || []).filter((r) => r.declared && !r.cloned && !["cloning", "queued"].includes(r.job?.state));
      if (missing.length) items.push({ what: "clone-all", name: "", repos: missing.map((r) => ({ name: r.name, entry: r.entry })) });
    }
    return items;
  }

  async function planFixItem(item, choices) {
    if (item.what === "repo-line") return planRepoLine(item.name, choices);
    if (item.what === "skill-line") return planSkillLine(item.name, choices);
    if (item.what === "skill-file") return planSkillFile(item.name, item.scope, choices);
    if (item.what === "mcp-line") return planMcpLine(item.name);
    return { name: item.name, files: item.repos.map((r) => ({ file: `${r.name}/`, verdict: "new", say: "git clone" })), writes: {}, clone: item.repos.length };
  }

  async function fix(asked) {
    const what = String(asked?.what || "");
    if (what === "clone-stop") return asked?.apply ? { ok: true, stopped: stopClones() } : { plan: { items: [] } };
    if (what !== "all" && !FIX_KINDS.includes(what)) return { error: `the hive does not know how to fix ${what || "that"}` };
    const choices = asked?.block && typeof asked.block === "object" ? asked.block : {};
    const shaped = await readWorkspace(false);
    const wanted = fixesOf(shaped, what, String(asked?.name || ""));
    if (!wanted.length) return { error: "nothing here is out of step" };
    const items = [];
    let asks = false;
    for (const item of wanted) {
      const plan = await planFixItem(item, choices);
      if (plan.error) {
        items.push({ what: item.what, name: item.name, error: plan.error, files: [] });
        continue;
      }
      asks = asks || Boolean(plan.asks);
      if (asked?.apply && !plan.asks) {
        await writePlan(plan);
        if (item.what === "clone-all") queueClones(item.repos);
      }
      items.push({ what: item.what, name: item.name, asks: Boolean(plan.asks), files: plan.files, clone: plan.clone || 0 });
    }
    if (asked?.apply) {
      invalidateSync();
      return { ok: true, asks, items };
    }
    return { plan: { asks, items } };
  }

  function writeRoute(planIt, addIt) {
    return async (req, res, url, json) => {
      const asked = await bodyOf(req);
      const answer = asked?.apply ? await addIt(asked) : await planIt(asked);
      if (answer.error) return json(answer, 400);
      return json(asked?.apply ? answer : { plan: { ...answer, writes: undefined } });
    };
  }

  function register(on) {
    on(null, "/api/sync", async (req, res, url, json) => json(await readSync(!!url.searchParams.get("force"))));
    on(null, "/api/workspace", async (req, res, url, json) => json(await readWorkspace(!!url.searchParams.get("force"))));
    on("POST", "/api/workspace/repo", writeRoute(planRepo, addRepo));
    on("POST", "/api/workspace/mcp", writeRoute(planMcp, addMcp));
    on("POST", "/api/workspace/skill", writeRoute(planSkill, addSkill));
    on("POST", "/api/workspace/fix", async (req, res, url, json) => {
      const answer = await fix(await bodyOf(req));
      return json(answer, answer.error ? 400 : 200);
    });
  }

  return { register, readSync, readWorkspace, invalidateSync, planRepo, addRepo, planMcp, addMcp, planSkill, addSkill, fix, queueClones, stopClones, jobs };
}

export function registerWorkspaceRoutes(on, context) {
  const domain = createWorkspaceDomain(context);
  domain.register(on);
  return domain;
}

export { readSyncWalk, sideOf };
