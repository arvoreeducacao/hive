import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const draftSeat = readFileSync(join(HERE, "src", "app", "draft-seat.js"), "utf8");
const blocks = readFileSync(join(HERE, "src", "app", "blocks.js"), "utf8");
const panes = readFileSync(join(HERE, "src", "app", "chat-and-panes.js"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of the source`);
  return src.slice(a, b);
}

const PHRASE = `const phrase = (t, v) => Object.entries(v || {}).reduce((s, [k, x]) => s.split("{" + k + "}").join(x), String(t));`;

const helpers = new Function(`
  ${PHRASE}
  ${slice(panes, "const AGENT_NAMES", "function seatAgent(")}
  ${slice(panes, "const DRAFT_EFFORT_KINDS", "function pillLabel(")}
  const providerReady = () => true;
  const readyAgents = () => ["claude"];
  const esc = (t) => String(t);
  const svgIcon = (n) => "<svg>" + n + "</svg>";
  ${slice(draftSeat, "const DRAFT_KINDS", "function draftHost(d) {")}
  return { draftChoices, spawnPayloadOf, hexPoints, hiveMark, pickerCommandOf, DRAFT_KINDS, DRAFT_WHERES };
`)();

test("a fresh draft starts on claude, local, native chat when nothing was kept", () => {
  assert.deepEqual(helpers.draftChoices(null), { agent: "claude", model: "", where: "local", kind: "structured" });
  assert.deepEqual(helpers.draftChoices({}), { agent: "claude", model: "", where: "local", kind: "structured" });
});

test("what the person chose last time comes back, and junk does not", () => {
  assert.deepEqual(helpers.draftChoices({ agent: "codex", model: "gpt-5", where: "cloud", kind: "terminal" }),
    { agent: "codex", model: "gpt-5", where: "cloud", kind: "terminal" });
  assert.deepEqual(helpers.draftChoices({ agent: "gemini", model: 7, where: "moon", kind: "shell" }),
    { agent: "claude", model: "", where: "local", kind: "structured" });
});

test("a first message that is only /model, /effort or /account opens that picker instead of the chat", () => {
  assert.equal(helpers.pickerCommandOf("/model"), "model");
  assert.equal(helpers.pickerCommandOf("  /effort \n"), "effort");
  assert.equal(helpers.pickerCommandOf("/account"), "account");
  assert.equal(helpers.pickerCommandOf("/model opus"), "");
  assert.equal(helpers.pickerCommandOf("troca o /model pra mim"), "");
  assert.equal(helpers.pickerCommandOf("/compact"), "");
  assert.equal(helpers.pickerCommandOf(""), "");
});

test("sending the draft asks for the picker before anything spawns", () => {
  const send = slice(draftSeat, "async function sendDraft(d, text) {", "const r = await fetch(\"/api/spawn\"");
  assert.ok(send.indexOf("pickerCommandOf(text)") < send.indexOf("d.sending = true"), "the picker command is caught before the draft starts sending");
  assert.match(send, /openSeatPicker\(d\.e, picker\)/);
});

test("the first message travels with every choice the draft holds", () => {
  const d = { where: "local", kind: "structured", repo: "acme", branch: "main", e: { agent: "opencode", model: "anthropic/claude-x", account: "work" } };
  assert.deepEqual(helpers.spawnPayloadOf(d, "conserta o login"), {
    name: "", prompt: "conserta o login", images: [], where: "local", model: "anthropic/claude-x", agent: "opencode",
    structured: true, account: "work", repo: "", branch: ""
  });
});

test("a cloud draft carries repo and branch and leaves the local account behind", () => {
  const d = { where: "cloud", kind: "terminal", repo: " api ", branch: "main", e: { agent: "claude", model: "", account: "work" } };
  assert.deepEqual(helpers.spawnPayloadOf(d, "x"), {
    name: "", prompt: "x", images: [], where: "cloud", model: "", agent: "claude", structured: false, account: "", repo: "api", branch: "main"
  });
});

test("a first message with a picture keeps the mark in the words and carries the file beside them", () => {
  const d = { where: "local", kind: "structured", e: { agent: "claude", model: "", account: "" } };
  const payload = helpers.spawnPayloadOf(d, "centraliza isso [Image #1]", ["/tmp/shot.png"]);
  assert.equal(payload.prompt, "centraliza isso [Image #1]");
  assert.deepEqual(payload.images, ["/tmp/shot.png"]);
});

test("the mark is a honeycomb of seven cells with the middle one lit", () => {
  const svg = helpers.hiveMark();
  assert.equal((svg.match(/<polygon/g) || []).length, 7);
  assert.equal((svg.match(/class="lit"/g) || []).length, 1);
  assert.equal(helpers.hexPoints(0, 0, 1).split(" ").length, 6);
});

test("a draft key resolves through the block like a job does, and vanishes with the draft", () => {
  const itemOf = new Function("drafts", "st", `
    const draftItem = (key) => { const d = drafts.get(key.slice(6)); return d ? { id: d.id, key, kind: "draft" } : null; };
    const editors = new Map();
    ${slice(blocks, "function itemOf(key) {", "const ofBlock =")}
    return itemOf;
  `);
  const drafts = new Map([["d1", { id: "d1" }]]);
  const st = { data: { spawning: [], sessions: [{ name: "ana" }] } };
  assert.deepEqual(itemOf(drafts, st)("draft:d1"), { id: "d1", key: "draft:d1", kind: "draft" });
  assert.equal(itemOf(drafts, st)("draft:d2"), null);
  assert.equal(itemOf(drafts, st)("ana").kind, "session");
});

test("tidy keeps a draft key only while the draft exists", () => {
  const kept = slice(blocks, `} else if (c.startsWith("draft:")) {`, `} else if (!alive.has(c)`);
  assert.match(kept, /drafts\.has\(c\.slice\(6\)\)/);
});

test("the picker asks the app, not a driver, for a draft's catalogue", () => {
  const head = slice(panes, "function refreshCatalog(e, refresh) {", "const settle =");
  assert.match(head, /if \(e\.draft\) return refreshDraftCatalog\(e\);/);
  const draftPull = slice(panes, "function refreshDraftCatalog(e) {", "function draftTakesAgent");
  assert.match(draftPull, /\/api\/catalog\?agent=/);
});

test("switching agents on a draft forgets the model and the catalogue of the one before", () => {
  const takes = slice(panes, "function draftTakesAgent(e, agent) {", "document.addEventListener(\"mousedown\"");
  assert.match(takes, /e\.agent = agent;/);
  assert.match(takes, /e\.model = "";/);
  assert.match(takes, /e\.catalog = null;/);
});

test("a chat waiting on a plan is not a chat working, whichever door the tail came in by", () => {
  const parser = slice(server, "function parseStructuredTail(", "function structuredStateOf(");
  assert.match(parser, /if \(e\.subtype === "plan"\) pending\.set\(e\.id, \[\]\);/,
    "a plan waiting has to hold the seat the way a question does, or the rail says it is working");
  assert.match(parser, /e\.subtype === "plan_approved" \|\| e\.subtype === "plan_dismissed"/,
    "and it has to let go when the plan closes");
});

test("a name born again forgets the children the old chat opened", () => {
  const run = slice(server, "async function runJob(job, body) {", "\n}\n");
  assert.match(run, /forgetOldKin\(HIVE_HOME, job\.name\)/,
    "a name born again is not the chat that opened those children");
});

test("the seat is named from the mission at once and the title comes later, off the critical path", () => {
  const open = slice(server, "function openJob(body) {", "async function pushMissionAssets");
  assert.match(open, /name: freeNameNow\(named \|\| nameFromMission\(body\.prompt\)\)/);
  assert.doesNotMatch(open, /"naming"/);
  const run = slice(server, "async function runJob(job, body) {", "\n}\n");
  assert.doesNotMatch(run, /await nameSession\(/);
  assert.match(run, /titleInTheBackground\(job\.name, job\.where, prompt, body\.agent\)/);
});

test("an image that does not reach the pod keeps its slot, so no mark points at the wrong picture", async () => {
  const push = new Function("existsSync", "readFile", "cloudReach", "join", "HUB", `
    ${slice(server, "async function pushMissionAsset(local) {", "async function seedStatus")}
    return pushMissionAssets;
  `)(
    (path) => path !== "/hub/.hive/assets/one.png",
    async () => Buffer.from("x"),
    { putFile: async () => ({ ok: true }) },
    (...parts) => parts.join("/"),
    "/hub"
  );
  const pushed = await push("olha [Image #1] e [Image #2]", ["/hub/.hive/assets/one.png", "/hub/.hive/assets/two.png"]);
  assert.equal(pushed.images.length, 2, "a falha encolheu a lista e deslocou as marcas");
  assert.equal(pushed.images[1], "/workspace/hive/assets/two.png");
  assert.equal(pushed.images[0], "/hub/.hive/assets/one.png", "o slot que falhou guarda o caminho de origem, que o driver degrada para texto");
});

test("a seat that already carries a title of its own is left alone by the background namer", () => {
  const title = slice(server, "async function titleTheSeat(name, where, title, { over = false } = {}) {", "function titleInTheBackground");
  assert.match(title, /!over && found\.title && found\.title !== name/);
  assert.match(title, /!over && \/\^title:\\s\*\\S\/im\.test\(had\)/);
  assert.match(title, /op: "setTitle"/);
});

test("the word a seat gave itself outranks the panel's guess, and a hand outranks both", () => {
  const label = slice(server, "  const own = structuredInfo?.title", "  stampTitle(");
  assert.match(label, /mine \|\| own \|\| status\.title/);
  const titleOf = new Function(`
    const cleanTitle = (raw) => String(raw || "").split("\\n")[0].replace(/^["'\`\\s]+|["'\`.\\s]+$/g, "").slice(0, 60);
    ${slice(server, "function structuredTitleOf(sessionJson) {", "function structuredModelOf")}
    return structuredTitleOf;
  `)();
  assert.equal(titleOf(JSON.stringify({ session_id: "x", title: "excluir escola de disparos da régua" })), "excluir escola de disparos da régua");
  assert.equal(titleOf(JSON.stringify({ session_id: "x" })), "");
  assert.equal(titleOf("not json"), "");
});

test("while the background name is on its way the seat says so, and stops saying so once any title lands", () => {
  const seat = slice(server, "  return {\n    name,\n    title: label || name,", "    mine: !!mine,");
  assert.match(seat, /naming: !label && namingNow\.has\(seatKey\(where, name\)\)/);
  const background = slice(server, "function titleInTheBackground(name, where, prompt, agent) {", "async function runJob");
  assert.match(background, /\.finally\(\(\) => \{ namingNow\.delete\(seatKey\(where, name\)\)/);
  const paint = readFileSync(join(HERE, "src", "app", "chat-name.js"), "utf8");
  assert.match(paint, /const html = s\.naming \? "" : esc\(s\.title \|\| s\.name\)/);
  const run = slice(server, "async function runJob(job, body) {", "\n}\n");
  assert.match(run, /namingNow\.add\(seatKey\(job\.where, job\.name\)\);\n\s+titleInTheBackground\(job\.name, job\.where, prompt, body\.agent\)/);
  assert.ok(run.indexOf("titleInTheBackground(") < run.indexOf("await newChat("), "the name is asked for before the window is even up");
  const guess = slice(server, "async function guessedTitle(prompt, agent) {", "function titleInTheBackground");
  assert.match(guess, /tries < NAME_TRIES/);
  const fallback = slice(server, "function titleInTheBackground(name, where, prompt, agent) {", "async function runJob");
  assert.match(fallback, /guess \|\| cleanTitle\(firstLine\(prompt\)\)/);
});


test("Astra's selected thinking level travels with the first message", () => {
  for (const effort of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
    const draft = { where: "local", kind: "structured", e: { agent: "codex", model: "gpt-6-astra", effort } };
    assert.equal(helpers.spawnPayloadOf(draft, "fix it").effort, effort);
    draft.where = "cloud";
    assert.equal(helpers.spawnPayloadOf(draft, "fix it").effort, effort);
  }
});
