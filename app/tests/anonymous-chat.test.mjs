import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { seatArgv, seatCommand } from "../../server/engine/seat-command.mjs";
import { listSeats } from "../../server/peer/peer.mjs";
import { slug } from "../lib/naming.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const draftSeat = readFileSync(join(HERE, "src", "app", "draft-seat.js"), "utf8");
const panes = readFileSync(join(HERE, "src", "app", "chat-and-panes.js"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const driver = readFileSync(join(HERE, "..", "server", "engine", "driver.mjs"), "utf8");

function slice(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of the source`);
  return src.slice(a, b);
}

const PHRASE = `const phrase = (t, v) => Object.entries(v || {}).reduce((s, [k, x]) => s.split("{" + k + "}").join(x), String(t));`;

function draftHelpers(stored = {}) {
  const box = new Map(Object.entries(stored));
  const localStorage = { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => box.set(k, v) };
  const made = new Function("localStorage", `
    ${PHRASE}
    ${slice(panes, "const AGENT_NAMES", "function seatAgent(")}
    ${slice(panes, "const DRAFT_EFFORT_KINDS", "function pillLabel(")}
    const providerReady = () => true;
    const readyAgents = () => ["claude"];
    ${slice(draftSeat, "const DRAFT_KEPT", "function draftHost(d) {")}
    return { spawnPayloadOf, keepChoices, draftChoices, keptChoices, DRAFT_KEPT };
  `);
  return { ...made(localStorage), box };
}

test("an anonymous draft opens a native claude chat on this machine, flagged as anonymous", () => {
  const { spawnPayloadOf } = draftHelpers();
  const d = { where: "anonymous", kind: "terminal", repo: "acme", branch: "main", e: { agent: "codex", model: "", account: "" } };
  assert.deepEqual(spawnPayloadOf(d, "uma pergunta qualquer"), {
    name: "", prompt: "uma pergunta qualquer", images: [], where: "local", anon: true, model: "", agent: "claude",
    structured: true, account: "", repo: "", branch: ""
  });
});

test("an anonymous draft is never what the next new chat opens on", () => {
  const { keepChoices, keptChoices, DRAFT_KEPT, box } = draftHelpers({ "hive.draft": JSON.stringify({ where: "cloud" }) });
  keepChoices({ where: "anonymous", kind: "structured", e: { agent: "claude", model: "" } });
  assert.equal(keptChoices().where, "cloud");
  box.delete(DRAFT_KEPT);
  keepChoices({ where: "anonymous", kind: "structured", e: { agent: "claude", model: "" } });
  assert.equal(keptChoices().where, "local");
});

test("an anonymous draft does not seed a shelf page, reach other chats by @, or search the hub", () => {
  const send = slice(draftSeat, "async function sendDraft(d, text) {", "const r = await fetch(\"/api/spawn\"");
  assert.match(send, /const art = anon \? null : artifactTabOf\(d\.key\)/);
  assert.match(send, /anon \? \{ text: marked\.text \} : weaveHandles\(/);
  assert.match(slice(draftSeat, "async function hubFiles(where, q) {", "\n}\n"), /if \(where === DRAFT_ANONYMOUS\) return \{ files: \[\], error: "" \};/);
});

function jobs() {
  const spawning = new Map();
  const made = new Function("slug", "randomUUID", "spawning", `
    let jobCount = 0;
    const CLOUD = false;
    const podCache = { at: 0, up: false };
    const cache = { at: 0 };
    const nameFromMission = (text) => slug(String(text || "").split(" ").slice(0, 3).join("-"));
    const firstLine = (text) => String(text || "").split("\\n")[0];
    const freeNameNow = (name) => name;
    ${slice(server, "function openJob(body) {", "async function pushMissionAsset")}
    return { openJob };
  `);
  return made(slug, randomUUID, spawning);
}

test("an anonymous job carries no mission words, no title to come and a neutral name", () => {
  const { openJob } = jobs();
  const job = openJob({ anon: true, where: "local", prompt: "quanto ganha um PJ em 2026", name: "salario" });
  assert.equal(job.anon, true);
  assert.equal(job.where, "local");
  assert.match(job.name, /^anon-[a-z0-9]+$/);
  assert.equal(job.mission, "");
  assert.equal(job.titleLater, false);
});

test("anonymous never rides to the cloud, and a plain job is not anonymous", () => {
  const { openJob } = jobs();
  assert.equal(openJob({ anon: true, where: "cloud", prompt: "x" }).anon, false);
  assert.equal(openJob({ anon: "yes", where: "local", prompt: "x" }).anon, false);
  assert.equal(openJob({ where: "local", prompt: "conserta o login" }).anon, false);
});

test("the anonymous driver flag reaches the seat in tmux and in a native window", () => {
  const asked = { hub: "/tmp/hive-anon-x", name: "anon-ab12cd", stateDir: "/home/.hive", structured: true, driver: "/engine/driver.mjs", agent: "claude" };
  assert.match(seatCommand({ ...asked, anonymous: true }), / --anon$/);
  assert.doesNotMatch(seatCommand(asked), /--anon/);
  assert.ok(seatArgv({ ...asked, anonymous: true }).args.includes("--anon"));
  assert.ok(!seatArgv(asked).args.includes("--anon"));
});

test("the anonymous driver loads no settings, no MCP, no preamble and keeps no transcript", () => {
  const block = slice(driver, "if (anonymous) {\n  delete options.systemPrompt.append;", "if (chosenModel)");
  assert.match(block, /options\.settingSources = \[\];/);
  assert.match(block, /options\.strictMcpConfig = true;/);
  assert.match(block, /options\.persistSession = false;/);
  assert.match(driver, /function seatMcpServers\(configDir\) \{\n  if \(anonymous\) return \{\};/);
  assert.match(driver, /HIVE_REMOTE_CONTROL !== "0" && !anonymous\) extraArgs\["remote-control"\]/);
  assert.match(driver, /if \(anonymous \|\| !sleepAfter\(\)\) return;/);
});

test("other chats never find an anonymous one among their peers", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-peers-"));
  mkdirSync(join(base, "sessions"), { recursive: true });
  writeFileSync(join(base, "sessions", "crm-funil.json"), JSON.stringify({ cwd: "/hub" }));
  writeFileSync(join(base, "sessions", "anon-ab12cd.json"), JSON.stringify({ cwd: "/tmp/hive-anon-x", anon: true }));
  writeFileSync(join(base, "sessions", "anon-ff00aa.json"), JSON.stringify({ cwd: "/tmp/hive-anon-y" }));
  const names = (await listSeats({ HIVE_STATE_DIR: base })).map((one) => one.name);
  assert.ok(names.includes("crm-funil"));
  assert.ok(!names.some((one) => one.startsWith("anon-")), "an anonymous seat stays out of the list, flagged or not");
});

test("the server keeps anonymous seats out of the fleet file, the team, the phone and the relay", () => {
  assert.match(slice(server, "function rememberSeat(seat) {", "function forgetSeat("), /if \(seat\.anon\) \{\n    anonSeats\.set\([^]*return;\n  \}\n  fleet\.set\(/);
  assert.match(server, /panelOf\(sessions\.filter\(\(one\) => !one\.anon\), DEV,/);
  assert.match(server, /one\.where === "local" && !one\.anon\)\.map\(\(one\) => \(\{ name: one\.name, title: one\.title \|\| one\.name \}\)\)/);
  assert.match(server, /if \(anonymousSeat\("local", seat\)\) return false;/);
  assert.equal(server.match(/const asked = \{ \.\.\.mission, structured: true \};\n\s+delete asked\.anon;/g)?.length, 2);
});

test("closing an anonymous seat erases its folder, its diary and whatever claude kept of it", async () => {
  const { rm } = await import("node:fs/promises");
  const { existsSync, realpathSync } = await import("node:fs");
  const { basename, dirname } = await import("node:path");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "anon-root-")));
  const home = join(root, "hive-home");
  const hub = join(root, "hub");
  const projects = join(root, "projects");
  const name = "anon-ab12cd";
  const dir = join(root, "hive-anon-q1w2e3");
  const projectSlug = (path) => String(path).replace(/[/.]/g, "-");
  const kept = [
    join(home, "events", `${name}.ndjson`),
    join(home, "sessions", `${name}.json`),
    join(home, "shell-env", `${name}.sh`),
    join(hub, ".hive/prompts", `${name}.md`),
    join(dir, "notes.txt"),
    join(projects, projectSlug(dir), "x.jsonl")
  ];
  const untouched = join(home, "sessions", "crm-funil.json");
  for (const file of [...kept, untouched]) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "x");
  }
  const made = new Function("rm", "join", "dirname", "basename", "realpathSync", "tmpdir", "HIVE_HOME", "HUB", "CLAUDE_PROJECTS", "projectSlug", `
    const ANON_DIR_PREFIX = "hive-anon-";
    const ANON_NAME = /^anon-[a-z0-9]+$/;
    const chosenModels = new Map();
    const missionImagesFile = (file) => file + ".images.json";
    const shotsDirOf = (n) => join(HIVE_HOME, "shots", n);
    const seatRecord = () => null;
    ${slice(server, "const anonymousSeat = ", "function readdirSafe(dir) {")}
    return { eraseAnonymousSeat };
  `);
  const { eraseAnonymousSeat } = made(rm, join, dirname, basename, realpathSync, () => root, home, hub, projects, projectSlug);
  await eraseAnonymousSeat({ name, anon: true, cwd: dir });
  for (const file of kept) assert.equal(existsSync(file), false, `${file} should be gone`);
  assert.equal(existsSync(dir), false);
  assert.equal(existsSync(untouched), true);
  await eraseAnonymousSeat({ name: "crm-funil", anon: true, cwd: hub });
  assert.equal(existsSync(untouched), true, "only an anonymous name is ever erased");
  assert.equal(existsSync(hub), true, "a folder outside the temp root is never erased");
});
