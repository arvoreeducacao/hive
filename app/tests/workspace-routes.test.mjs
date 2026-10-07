import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorkspaceDomain } from "../routes/workspace.mjs";
import { readManifest as readManifestForReal, workspaceOf as workspaceOfForReal } from "../lib/hub-workspace.mjs";

function workspaceHarness(over = {}) {
  const routes = new Map();
  const commands = [];
  const at = Date.parse("2026-08-31T20:00:00.000Z");
  let localSync = "alpha\tmain\t2\t1\t1\nbeta\tmain\t0\t0\t1\n";
  let podSync = "";
  let podIsUp = false;
  const files = new Map([
    ["/workspace/hub/hive.json", JSON.stringify({ repos: ["o/alpha", "o/gamma"], skills: { delivery: "*" }, mcps: { linear: "*" } })],
    ["/workspace/hub/.mcp.json", JSON.stringify({ mcpServers: { linear: { type: "http", url: "https://mcp.linear.app/mcp" }, sentry: { type: "http", url: "http://127.0.0.1:4671/mcp/sentry" } } })],
    ["/workspace/hub/.mcp-servers/servers.json", JSON.stringify({ servers: { sentry: { command: "npx" } } })],
  ]);
  const dirs = new Map([
    ["/workspace/hub/.claude/skills", [
      { name: "delivery", isDirectory: () => true, isSymbolicLink: () => false },
      { name: "README.md", isDirectory: () => false, isSymbolicLink: () => false },
      { name: "empty", isDirectory: () => true, isSymbolicLink: () => false },
      { name: "thermos", isDirectory: () => false, isSymbolicLink: () => true },
      { name: "dangling", isDirectory: () => false, isSymbolicLink: () => true }
    ]],
    ["/workspace/hub/.claude/skills/delivery", ["SKILL.md"]],
    ["/workspace/hub/.claude/skills/empty", []],
    ["/workspace/hub/.claude/skills/thermos", ["SKILL.md", "assets"]],
  ]);
  const sh = async (command, args, options) => {
    commands.push({ command, args, options });
    if (command === "bash") return localSync;
    return "";
  };
  const clones = [];
  let cloneAnswer = { ok: true, out: "", error: "" };
  const shr = (command, args, options) => new Promise((resolve) => {
    commands.push({ command, args, options });
    clones.push({ command, args, resolve: () => resolve(cloneAnswer) });
  });
  const written = new Map();
  const made = [];
  const reloads = [];
  let body = {};
  const domain = createWorkspaceDomain({
    sh,
    inBash: (script) => ["bash", ["-c", script]],
    podUp: async () => podIsUp,
    onTheServer: async () => ({ out: podSync }),
    hub: "/workspace/hub",
    workspaceOf: over.workspaceOf || ((read, repos, extras) => ({ state: read.state, said: read.said, repos, extras })),
    readManifest: over.readManifest || ((text) => ({ state: "read", manifest: JSON.parse(text), issues: [] })),
    bodyOf: async () => body,
    shr: over.shr ? over.shr(shr) : shr,
    gitSaid: (error) => String(error).split("\n").pop(),
    readFileImpl: async (path) => {
      if (!files.has(path)) throw new Error("ENOENT");
      return files.get(path);
    },
    writeFileImpl: async (path, text) => { written.set(path, text); files.set(path, text); },
    mkdirImpl: async (path) => { made.push(path); },
    fetchImpl: async (url, init) => { reloads.push({ url, auth: init?.headers?.authorization }); return { ok: true, json: async () => ({ ok: true, servidores: { novos: ["posthog"], removidos: [], mudados: [] }, faltando: { posthog: ["POSTHOG_API_KEY"] } }) }; },
    existsImpl: (path) => dirs.has(path.replace(/\/\.git$/, "")),
    readdirImpl: async (path) => {
      if (!dirs.has(path)) throw new Error("ENOENT");
      return dirs.get(path);
    },
    stackOfImpl: (dir) => (dir.endsWith("/alpha") ? "nestjs" : "unknown"),
    now: () => at
  });
  domain.register((method, path, handler) => routes.set(path, { method, handler }));
  const call = async (path, query = "") => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({}, {}, new URL(`http://hive${path}${query}`), json);
    return answers;
  };
  const post = async (path, asked) => {
    body = asked;
    return call(path);
  };
  const finishClone = async (answer = { ok: true, out: "", error: "" }) => {
    cloneAnswer = answer;
    clones.shift()?.resolve();
    await new Promise((tick) => setImmediate(tick));
  };
  return {
    routes,
    commands,
    domain,
    call,
    post,
    files,
    dirs,
    written,
    made,
    reloads,
    clones,
    finishClone,
    setLocalSync: (value) => { localSync = value; },
    setPod: (up, value = "") => { podIsUp = up; podSync = value; }
  };
}

test("the workspace room registers two reads, the three writes that add something, and the one that adjusts", () => {
  const { routes } = workspaceHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/sync", null],
    ["/api/workspace", null],
    ["/api/workspace/repo", "POST"],
    ["/api/workspace/mcp", "POST"],
    ["/api/workspace/skill", "POST"],
    ["/api/workspace/fix", "POST"]
  ]);
});

test("sync shapes both machines and keeps the walk cached until force or invalidation", async () => {
  const hive = workspaceHarness();
  hive.setPod(true, "alpha\tmain\t0\t3\t1\n");
  const first = await hive.call("/api/sync");
  assert.deepEqual(first[0].value.here, {
    repos: 2,
    pending: 1,
    loose: 2,
    ahead: 1,
    list: [{ name: "alpha", branch: "main", loose: 2, ahead: 1, top: true }],
    every: [
      { name: "alpha", branch: "main", loose: 2, ahead: 1, top: true },
      { name: "beta", branch: "main", loose: 0, ahead: 0, top: true }
    ]
  });
  assert.equal(first[0].value.pod.ahead, 3);
  await hive.call("/api/sync");
  assert.equal(hive.commands.filter((call) => call.command === "bash").length, 1);
  await hive.call("/api/sync", "?force=1");
  assert.equal(hive.commands.filter((call) => call.command === "bash").length, 2);
  hive.domain.invalidateSync();
  await hive.call("/api/sync");
  assert.equal(hive.commands.filter((call) => call.command === "bash").length, 3);
});

test("workspace reads the four sources of the hub in process and hands them to the shaper with the disk", async () => {
  const hive = workspaceHarness();
  const [{ value }] = await hive.call("/api/workspace");
  assert.equal(value.state, "read");
  assert.equal(value.hub, "/workspace/hub");
  assert.deepEqual(value.repos.map((repo) => repo.name), ["alpha", "beta"]);
  assert.equal(value.extras.name, "hub");
  assert.deepEqual(value.extras.stacks, { alpha: "nestjs", beta: "unknown" });
  assert.deepEqual(Object.keys(value.extras.mcpJson.mcpServers), ["linear", "sentry"]);
  assert.deepEqual(value.extras.gateway, ["sentry"]);
  assert.deepEqual(value.extras.skillDirs, ["delivery", "thermos"]);
  assert.equal(value.extras.gatewayPort, 4671);
  assert.equal(hive.commands.some((call) => String(call.args?.[0] || "").endsWith(".mjs")), false);
});

test("a hub with no hive.json is none, and one whose manifest vanished later is none after a forced read", async () => {
  const hive = workspaceHarness();
  const [{ value: before }] = await hive.call("/api/workspace");
  assert.equal(before.state, "read");
  hive.files.delete("/workspace/hub/hive.json");
  const [{ value: cached }] = await hive.call("/api/workspace");
  assert.equal(cached.state, "read");
  const [{ value: after }] = await hive.call("/api/workspace", "?force=1");
  assert.equal(after.state, "none");
  assert.deepEqual(after.repos.map((repo) => repo.name), ["alpha", "beta"]);
});

test("a .mcp.json that does not parse and a missing skills folder degrade to nothing, not to an error", async () => {
  const hive = workspaceHarness();
  hive.files.set("/workspace/hub/.mcp.json", "{ nope");
  hive.files.delete("/workspace/hub/.mcp-servers/servers.json");
  const [{ value }] = await hive.call("/api/workspace", "?force=1");
  assert.equal(value.extras.mcpJson, null);
  assert.deepEqual(value.extras.gateway, []);
});

test("server hands workspace routes to their room instead of keeping them in the hallway", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /registerWorkspaceRoutes\(on,/);
  assert.doesNotMatch(server, /url\.pathname === "\/api\/(?:sync|workspace)/);
  assert.doesNotMatch(server, /hub-load\.mjs|hub-plan\.mjs|@arvoretech\/hub-core/);
});

const claudeWithBlock = "# hub\n\n## Repositories\n\n<!-- >>> hive -->\n- **./alpha** — nestjs\n<!-- <<< hive -->\n";

test("asking about a repository plans the writes without touching a file, and a bad name is refused", async () => {
  const hive = workspaceHarness();
  hive.files.set("/workspace/hub/CLAUDE.md", claudeWithBlock);
  hive.files.set("/workspace/hub/AGENTS.md", claudeWithBlock);
  const [{ value, status }] = await hive.post("/api/workspace/repo", { repo: "o/delta" });
  assert.equal(status, 200);
  assert.deepEqual(value.plan.files.map((f) => [f.file, f.verdict]), [["hive.json", "changes"], ["CLAUDE.md", "changes"], ["AGENTS.md", "changes"], ["delta/", "new"]]);
  assert.equal(value.plan.writes, undefined);
  assert.equal(hive.written.size, 0);
  const [bad] = await hive.post("/api/workspace/repo", { repo: "delta" });
  assert.equal(bad.status, 400);
  assert.match(bad.value.error, /org\/name/);
});

test("writing adds the lines, starts the clone in the background, and the panel sees the repository cloning", async () => {
  const hive = workspaceHarness();
  hive.files.set("/workspace/hub/CLAUDE.md", claudeWithBlock);
  hive.files.set("/workspace/hub/AGENTS.md", claudeWithBlock);
  const [{ value }] = await hive.post("/api/workspace/repo", { repo: "https://github.com/o/delta", apply: true });
  assert.equal(value.ok, true);
  assert.equal(value.cloning, true);
  assert.deepEqual([...hive.written.keys()], ["/workspace/hub/hive.json", "/workspace/hub/CLAUDE.md", "/workspace/hub/AGENTS.md"]);
  assert.deepEqual(JSON.parse(hive.written.get("/workspace/hub/hive.json")).repos, ["o/alpha", "o/delta", "o/gamma"]);
  assert.match(hive.written.get("/workspace/hub/CLAUDE.md"), /- \*\*\.\/alpha\*\* — nestjs\n- \*\*\.\/delta\*\*\n<!-- <<< hive -->/);
  assert.deepEqual(hive.clones[0].args, ["repo", "clone", "o/delta", "/workspace/hub/delta"]);

  hive.setLocalSync("alpha\tmain\t2\t1\t1\nbeta\tmain\t0\t0\t1\n");
  const [{ value: during }] = await hive.call("/api/workspace");
  assert.equal(during.repos.find((r) => r.name === "delta")?.job?.state, undefined);
  const [{ value: shapedDuring }] = await hive.call("/api/workspace");
  assert.equal(shapedDuring.repos.some((r) => r.job), false);
});

test("a clone that ends updates the line with the stack, and a clone that fails says why and can be tried again", async () => {
  const hive = workspaceHarness();
  hive.files.set("/workspace/hub/CLAUDE.md", claudeWithBlock);
  hive.files.set("/workspace/hub/AGENTS.md", claudeWithBlock);
  hive.domain.jobs.set("gamma", { state: "cloning", at: 0 });
  const [{ value: cloning }] = await hive.call("/api/workspace");
  assert.equal(cloning.repos.some((r) => r.job?.state === "cloning"), false);

  await hive.post("/api/workspace/repo", { repo: "o/delta", apply: true });
  hive.dirs.set("/workspace/hub/delta", []);
  await hive.finishClone({ ok: true, out: "", error: "" });
  assert.match(hive.files.get("/workspace/hub/CLAUDE.md"), /- \*\*\.\/delta\*\* — unknown|- \*\*\.\/delta\*\*\n/);

  await hive.post("/api/workspace/repo", { repo: "o/epsilon", apply: true });
  await hive.finishClone({ ok: false, out: "", error: "fatal: repository not found\ngh: could not clone" });
  assert.equal(hive.domain.jobs.get("epsilon").state, "failed");
  assert.equal(hive.domain.jobs.get("epsilon").error, "gh: could not clone");
  const [{ value: again }] = await hive.post("/api/workspace/repo", { repo: "o/epsilon", apply: true });
  assert.equal(again.ok, true);
  assert.deepEqual(again.plan.files.map((f) => f.verdict), ["same", "same", "same", "new"]);
  assert.equal(hive.domain.jobs.get("epsilon").state, "cloning");
});

test("a file without the hive block holds the write until the person says where the block goes", async () => {
  const hive = workspaceHarness();
  hive.files.set("/workspace/hub/CLAUDE.md", "# hub\n\n## Repositories\n\n- **./alpha**\n");
  hive.files.set("/workspace/hub/AGENTS.md", claudeWithBlock);
  const [held] = await hive.post("/api/workspace/repo", { repo: "o/delta", apply: true });
  assert.equal(held.status, 400);
  assert.match(held.value.error, /where the hive block goes/);
  assert.equal(held.value.plan.files[1].verdict, "no-block");
  assert.equal(hive.written.size, 0);
  const [{ value }] = await hive.post("/api/workspace/repo", { repo: "o/delta", apply: true, block: { "CLAUDE.md": "top" } });
  assert.equal(value.ok, true);
  assert.match(hive.written.get("/workspace/hub/CLAUDE.md"), /## Repositories\n\n<!-- >>> hive -->\n- \*\*\.\/delta\*\*\n<!-- <<< hive -->/);
});

test("adding a stdio mcp writes the three files, asks the gateway to reload, and names the variable the .env lacks", async () => {
  const hive = workspaceHarness();
  hive.files.set("/workspace/hub/.mcp-servers/.token", "tok-123\n");
  hive.files.set("/workspace/hub/.env", "OTHER=1\n");
  const [{ value: plan }] = await hive.post("/api/workspace/mcp", { name: "posthog", kind: "stdio", command: "npx -y posthog-mcp", env: "POSTHOG_API_KEY", scope: "alpha" });
  assert.deepEqual(plan.plan.files.map((f) => [f.file, f.verdict]), [["hive.json", "changes"], [".mcp.json", "changes"], [".mcp-servers/servers.json", "changes"], [".env", "missing"]]);
  assert.equal(hive.written.size, 0);
  const [{ value }] = await hive.post("/api/workspace/mcp", { name: "posthog", kind: "stdio", command: "npx -y posthog-mcp", env: "POSTHOG_API_KEY", scope: "alpha", apply: true });
  assert.equal(value.ok, true);
  assert.deepEqual([...hive.written.keys()], ["/workspace/hub/hive.json", "/workspace/hub/.mcp.json", "/workspace/hub/.mcp-servers/servers.json"]);
  assert.deepEqual(JSON.parse(hive.written.get("/workspace/hub/hive.json")).mcps, { linear: "*", posthog: ["alpha"] });
  assert.deepEqual(hive.reloads, [{ url: "http://127.0.0.1:4671/reload", auth: "Bearer tok-123" }]);
  assert.deepEqual(value.gateway.servers.novos, ["posthog"]);
  assert.deepEqual(value.gateway.missing, { posthog: ["POSTHOG_API_KEY"] });
  const [bad] = await hive.post("/api/workspace/mcp", { name: "x", url: "https://x", scope: "zeta" });
  assert.equal(bad.status, 400);
  assert.match(bad.value.error, /zeta is not in hive.json/);
});

test("a remote mcp only touches hive.json and .mcp.json and does not wake the gateway", async () => {
  const hive = workspaceHarness();
  const [{ value }] = await hive.post("/api/workspace/mcp", { name: "notion", url: "https://mcp.notion.com/mcp", apply: true });
  assert.equal(value.ok, true);
  assert.deepEqual([...hive.written.keys()], ["/workspace/hub/hive.json", "/workspace/hub/.mcp.json"]);
  assert.deepEqual(JSON.parse(hive.written.get("/workspace/hub/.mcp.json")).mcpServers.notion, { type: "http", url: "https://mcp.notion.com/mcp" });
  assert.deepEqual(hive.reloads, []);
  assert.equal(value.gateway.reached, false);
});

test("adding a skill writes the scope, the SKILL.md in its folder and the index line, and waits for the block when it is missing", async () => {
  const hive = workspaceHarness();
  hive.files.set("/workspace/hub/AGENTS.md", "# hub\n\n## Rest\n");
  const [held] = await hive.post("/api/workspace/skill", { name: "copy-check-mobile", description: "Copy no app.", scope: "alpha", apply: true });
  assert.equal(held.status, 400);
  assert.match(held.value.error, /where the skills block goes/);
  assert.equal(hive.written.size, 0);
  const [{ value }] = await hive.post("/api/workspace/skill", { name: "copy-check-mobile", description: "Copy no app.", scope: "alpha", apply: true, block: { "AGENTS.md": "end" } });
  assert.equal(value.ok, true);
  assert.equal(value.file, "/workspace/hub/.claude/skills/copy-check-mobile/SKILL.md");
  assert.deepEqual(hive.made, ["/workspace/hub/.claude/skills/copy-check-mobile"]);
  assert.match(hive.written.get("/workspace/hub/.claude/skills/copy-check-mobile/SKILL.md"), /^---\nname: copy-check-mobile\n/);
  assert.match(hive.written.get("/workspace/hub/AGENTS.md"), /<!-- >>> hive:skills -->\n- \*\*copy-check-mobile\*\*/);
  assert.deepEqual(JSON.parse(hive.written.get("/workspace/hub/hive.json")).skills, { delivery: "*", "copy-check-mobile": ["alpha"] });
});

const forReal = { workspaceOf: workspaceOfForReal, readManifest: readManifestForReal };

const agentsWithSkills = "# hub\n\n<!-- >>> hive:skills -->\n- **delivery** — entrega · vale em: todos os repositórios · `.claude/skills/delivery/SKILL.md`\n<!-- <<< hive:skills -->\n";

const gitRemote = (answers) => (shr) => (command, args, options) => {
  if (command === "git" && args[2] === "remote") return Promise.resolve(answers[args[1].split("/").pop()] || { ok: false, out: "", error: "fatal: not a git repository" });
  return shr(command, args, options);
};

test("adjusting an mcp wired without a line writes only the hive.json line, and refuses what is not out of step", async () => {
  const hive = workspaceHarness(forReal);
  const [{ value: preview }] = await hive.post("/api/workspace/fix", { what: "mcp-line", name: "sentry" });
  assert.deepEqual(preview.plan.items.map((i) => [i.what, i.name, i.files.map((f) => [f.file, f.verdict])]), [["mcp-line", "sentry", [["hive.json", "changes"]]]]);
  assert.equal(hive.written.size, 0);
  const [{ value }] = await hive.post("/api/workspace/fix", { what: "mcp-line", name: "sentry", apply: true });
  assert.equal(value.ok, true);
  assert.deepEqual([...hive.written.keys()], ["/workspace/hub/hive.json"]);
  assert.deepEqual(JSON.parse(hive.written.get("/workspace/hub/hive.json")).mcps, { linear: "*", sentry: "*" });
  const [refused] = await hive.post("/api/workspace/fix", { what: "mcp-line", name: "linear" });
  assert.equal(refused.status, 400);
  assert.match(refused.value.error, /nothing here is out of step/);
  const [unknown] = await hive.post("/api/workspace/fix", { what: "paint-it" });
  assert.equal(unknown.status, 400);
});

test("adjusting a skill folder without a line reads its description from the SKILL.md and lists it in AGENTS.md", async () => {
  const hive = workspaceHarness(forReal);
  hive.files.set("/workspace/hub/AGENTS.md", agentsWithSkills);
  hive.files.set("/workspace/hub/.claude/skills/thermos/SKILL.md", "---\nname: thermos\ndescription: Mantém o café quente.\n---\n\n# thermos\n");
  const [{ value }] = await hive.post("/api/workspace/fix", { what: "skill-line", apply: true });
  assert.equal(value.ok, true);
  assert.deepEqual(value.items.map((i) => [i.what, i.name, i.files.map((f) => f.verdict)]), [["skill-line", "thermos", ["changes", "same", "changes"]]]);
  assert.deepEqual(JSON.parse(hive.files.get("/workspace/hub/hive.json")).skills, { delivery: "*", thermos: "*" });
  assert.match(hive.files.get("/workspace/hub/AGENTS.md"), /- \*\*thermos\*\* — Mantém o café quente\. · vale em: todos os repositórios/);
  assert.equal(hive.written.has("/workspace/hub/.claude/skills/thermos/SKILL.md"), false);
});

test("adjusting a skill line without a folder creates the SKILL.md to be written, and holds while AGENTS.md has no block", async () => {
  const hive = workspaceHarness(forReal);
  hive.files.set("/workspace/hub/hive.json", JSON.stringify({ repos: ["o/alpha"], skills: { delivery: "*", "copy-check": ["alpha"] }, mcps: {} }, null, 2));
  hive.files.set("/workspace/hub/AGENTS.md", "# hub\n");
  const [{ value: held }] = await hive.post("/api/workspace/fix", { what: "skill-file", name: "copy-check", apply: true });
  assert.equal(held.ok, true);
  assert.equal(held.asks, true);
  assert.equal(hive.written.size, 0);
  const [{ value }] = await hive.post("/api/workspace/fix", { what: "skill-file", name: "copy-check", apply: true, block: { "AGENTS.md": "end" } });
  assert.equal(value.asks, false);
  assert.match(hive.written.get("/workspace/hub/.claude/skills/copy-check/SKILL.md"), /^---\nname: copy-check\ndescription: descreva aqui quando esta skill vale\n/);
  assert.match(hive.written.get("/workspace/hub/AGENTS.md"), /- \*\*copy-check\*\* — descreva aqui quando esta skill vale · vale em: alpha/);
  assert.equal(hive.written.has("/workspace/hub/hive.json"), false);
});

test("adjusting a repository on disk without a line reads its origin, and says when the origin is not on GitHub", async () => {
  const hive = workspaceHarness({ ...forReal, shr: gitRemote({ beta: { ok: true, out: "git@github.com:o/beta.git\n", error: "" } }) });
  hive.files.set("/workspace/hub/CLAUDE.md", claudeWithBlock);
  hive.files.set("/workspace/hub/AGENTS.md", claudeWithBlock);
  const [{ value }] = await hive.post("/api/workspace/fix", { what: "repo-line", name: "beta", apply: true });
  assert.equal(value.ok, true);
  assert.deepEqual(value.items.map((i) => [i.name, i.files.map((f) => [f.file, f.verdict])]), [["beta", [["hive.json", "changes"], ["CLAUDE.md", "changes"], ["AGENTS.md", "changes"], ["beta/", "same"]]]]);
  assert.deepEqual(JSON.parse(hive.files.get("/workspace/hub/hive.json")).repos, ["o/alpha", "o/beta", "o/gamma"]);
  assert.equal(hive.clones.length, 0);

  const elsewhere = workspaceHarness({ ...forReal, shr: gitRemote({ beta: { ok: true, out: "https://gitlab.com/o/beta.git\n", error: "" } }) });
  const [{ value: refused }] = await elsewhere.post("/api/workspace/fix", { what: "repo-line", name: "beta" });
  assert.match(refused.plan.items[0].error, /no GitHub remote/);
});

test("clone them all queues the declared repositories and clones one at a time, and stop empties the queue", async () => {
  const hive = workspaceHarness(forReal);
  hive.files.set("/workspace/hub/hive.json", JSON.stringify({ repos: ["o/alpha", "o/gamma", "o/delta", "o/epsilon"], skills: {}, mcps: {} }, null, 2));
  const [{ value: preview }] = await hive.post("/api/workspace/fix", { what: "clone-all" });
  assert.deepEqual(preview.plan.items[0].files.map((f) => f.file), ["delta/", "epsilon/", "gamma/"]);
  const [{ value }] = await hive.post("/api/workspace/fix", { what: "clone-all", apply: true });
  assert.equal(value.ok, true);
  assert.equal(value.items[0].clone, 3);
  assert.deepEqual([...hive.domain.jobs].map(([name, job]) => [name, job.state]), [["delta", "cloning"], ["epsilon", "queued"], ["gamma", "queued"]]);
  assert.equal(hive.clones.length, 1);
  const [{ value: during }] = await hive.call("/api/workspace");
  assert.deepEqual(during.repos.filter((r) => r.job).map((r) => [r.name, r.job.state]), [["delta", "cloning"], ["epsilon", "queued"], ["gamma", "queued"]]);
  await hive.finishClone({ ok: false, out: "", error: "gh: could not clone" });
  assert.deepEqual([...hive.domain.jobs].map(([name, job]) => [name, job.state]), [["delta", "failed"], ["epsilon", "cloning"], ["gamma", "queued"]]);
  const [{ value: stopped }] = await hive.post("/api/workspace/fix", { what: "clone-stop", apply: true });
  assert.deepEqual(stopped.stopped, ["gamma"]);
  assert.deepEqual([...hive.domain.jobs].map(([name, job]) => [name, job.state]), [["delta", "failed"], ["epsilon", "cloning"]]);
  await hive.finishClone({ ok: true, out: "", error: "" });
  assert.equal(hive.clones.length, 0);
});

test("adjust everything walks every divergence in one call, keeps going past the one that fails, and names it", async () => {
  const hive = workspaceHarness({ ...forReal, shr: gitRemote({}) });
  hive.files.set("/workspace/hub/AGENTS.md", agentsWithSkills);
  hive.files.set("/workspace/hub/.claude/skills/thermos/SKILL.md", "# thermos\n\nGuarda o café.\n");
  const [{ value }] = await hive.post("/api/workspace/fix", { what: "all", apply: true });
  assert.equal(value.ok, true);
  assert.deepEqual(value.items.map((i) => [i.what, i.name, Boolean(i.error)]), [["repo-line", "beta", true], ["skill-line", "thermos", false], ["mcp-line", "sentry", false], ["clone-all", "", false]]);
  const manifest = JSON.parse(hive.files.get("/workspace/hub/hive.json"));
  assert.deepEqual(manifest.skills, { delivery: "*", thermos: "*" });
  assert.deepEqual(manifest.mcps, { linear: "*", sentry: "*" });
  assert.match(hive.files.get("/workspace/hub/AGENTS.md"), /- \*\*thermos\*\* — Guarda o café\./);
  assert.deepEqual([...hive.domain.jobs].map(([name, job]) => [name, job.state]), [["gamma", "cloning"]]);
});
