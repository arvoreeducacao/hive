import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const sheet = readFileSync(join(HERE, "assets", "raycast", "tile.css"), "utf8");
const seatMenu = readFileSync(join(HERE, "src", "app", "seat-menu.js"), "utf8");

const st = await state();
const { getStructured } = await app("chat-stretches");
const { paintActivity } = await app("structured-seats");
const { svConvTool, svConvToolLanded } = await app("conversation-model");
const { phrase, SV_ASK, SV_ASK_SLIM } = await app("core");

function flag(on) {
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: on ? { experience: "raycast", was: "current" } : { experience: "current", was: "raycast" } }));
}

function slice(from, to, src = seatMenu) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of the source`);
  return src.slice(a, b);
}

function model(world = {}, look = { pos: world.pos ?? -1 }) {
  return new Function("world", "seat", "look", `
    const phrase = (t, v) => Object.entries(v || {}).reduce((s, [k, x]) => s.split("{" + k + "}").join(x), String(t));
    const esc = (t) => String(t);
    const LABEL = { idle: "idle", needs: "needs you", working: "working", stalled: "stalled" };
    const PILL_LABEL = { ...LABEL, needs: "needs input", stalled: "quiet" };
    const experienceNext = () => false;
    const drivingNow = () => false;
    const GLYPH = { idle: "g-idle", needs: "g-needs", working: "g-working", stalled: "g-stalled" };
    const WHERE_ICON = { local: "#i-local", cloud: "#i-cloud" };
    const shortBranch = (b) => (String(b || "").split("/").filter(Boolean).pop() || "").replace(/^-+/, "");
    const lentFace = (dev) => dev;
    const prIsGone = (p) => p.state === "merged" || p.state === "closed";
    const prsOnCard = () => world.prs || [];
    const memoryChip = (s) => (world.memory || {})[s.name] || null;
    const prSays = () => "";
    const prTone = () => "";
    const prActions = () => [];
    const mergeTrouble = new Map();
    const freshOf = () => [];
    const previewOf = () => "";
    const threadsOfChat = () => [];
    const threadOfChat = () => null;
    const pagesOfChat = () => [];
    const showingArtifact = () => false;
    const artifactTabOf = () => ({ slug: "" });
    const artFileOf = (one) => one.path;
    const liveOf = (s) => s.live || [];
    const liveBadge = (s) => (s.live || []).length ? (s.live || []).length + " · 2m" : "";
    const liveTitle = () => "";
    const keyLabel = (key, n) => "⌘" + n;
    const canGiveBack = () => false;
    const st = { keys: { reconnect: {}, seat: {} }, lentHere: [], open: null, typing: world.typing || null, threadChat: null, reviewChat: null, openPr: "" };
    ${slice("function tileChipsModel(s) {", "function tileActions(s) {")}
    return look ? tileViewModel(seat, look) : tileViewModel(seat);
  `)(world, { name: "ana", where: "local", state: "idle", when: "2m", ...(world.seat || {}) }, look);
}

test("with the flag off the seat model is the one main paints — no head of the redesign in it", () => {
  const plain = model({ seat: { state: "working", when: "7s" } }, null);
  for (const key of ["raycast", "dot", "say", "key", "heads"]) assert.equal(key in plain, false, `${key} leaked into the default model`);
  assert.deepEqual(plain.live, { on: false, badge: "", title: "" });
});

test("with the flag on the head says the state in words, the time only for the states that run", () => {
  const working = model({ seat: { state: "working", when: "7s" } });
  assert.equal(working.raycast, true);
  assert.equal(working.dot, "working");
  assert.equal(working.say, "working · 7s");
  assert.equal(model({ seat: { state: "stalled", when: "3m" } }).say, "stalled · 3m");
  assert.equal(model({ seat: { state: "needs", when: "7s" } }).say, "needs you");
  assert.equal(model({ typing: "ana", seat: { state: "working", when: "7s" } }).say, "typing here");
});

test("the seat key shows only for the nine seats the digits reach", () => {
  assert.equal(model().key, "");
  assert.equal(model({ pos: 0 }).key, "⌘1");
  assert.equal(model({ pos: 8 }).key, "⌘9");
  assert.equal(model({ pos: 9 }).key, "");
  assert.equal(model({ pos: 0 }).keyHint, "jump to this seat");
});

test("the worktree chip is the branch cut in the middle, and it copies the whole branch", () => {
  const [tree] = model({ seat: { trees: [{ repo: "dev-workspaces", branch: "jorge/-/oms-v2-juntar-skus", path: "/w/a" }] } }).heads;
  assert.equal(tree.text, "oms-v2-j…ar-skus");
  assert.equal(tree.copy, "jorge/-/oms-v2-juntar-skus");
  assert.equal(tree.cls, "tree");
  const [main] = model({ seat: { trees: [{ repo: "acme-hub", main: true, path: "/w/b" }] } }).heads;
  assert.equal(main.text, "acme-hub");
  assert.equal(main.cls, "tree main");
  assert.equal(main.copy, "");
});

test("a cloud seat and a pull request with a failing check ride in the head too", () => {
  const heads = model({ seat: { where: "cloud" }, prs: [{ key: "hive#9", repo: "acme/hive", number: 9, state: "open", ci: "failed" }] }).heads;
  assert.deepEqual(heads.map((one) => one.cls), ["cloud", "pr bad"]);
  assert.equal(heads[1].text, "#9");
});

test("the live chip counts what runs and carries its age apart", () => {
  const live = model({ seat: { live: [1, 2] } }).live;
  assert.equal(live.count, "2");
  assert.equal(live.age, "2m");
});

test("the update path keeps main's call for the default and asks for the head only under the flag", () => {
  const update = slice("function update(el, s, pos) {", "\nfunction paintSince");
  assert.match(update, /if \(raycastOn\(\)\) side\.show\(tileViewModel\(s, \{ pos \}\)\);\n  else side\.show\(tileViewModel\(s\)\);/);
  assert.match(update, /if \(raycastOn\(\)\) paintSince\(well, s\);/);
  const job = slice("function updateJob(el, it, pos) {", "\nst.jobSide = null;");
  assert.match(job, /if \(raycastOn\(\)\) side\.show\(\{ \.\.\.jobViewModel\(it\), \.\.\.raycastJob\(it\) \}\);\n  else side\.show\(jobViewModel\(it\)\);/);
});

function side(look) {
  const host = document.createElement("div");
  const actions = new Proxy({}, { get: () => () => {} });
  const seatModel = model({ seat: { state: "working", when: "7s", trees: [{ repo: "hive", branch: "a/b", path: "/x" }] } }, look);
  const view = st.tileSide(host, seatModel, actions);
  return { host, view };
}

test("the solid side draws main's head and state row with the flag off", () => {
  const { host, view } = side(null);
  assert.ok(host.querySelector(":scope > .t-state .t-pill .label"), "the state row is gone");
  for (const gone of [".t-dot", ".t-say", ".t-hchips", ".t-key"]) assert.equal(host.querySelector(gone), null, `${gone} drew with the flag off`);
  assert.deepEqual([...host.querySelector(".t-head").children].map((el) => el.className), ["t-grip", "t-ident", "t-tags"]);
  view.dispose();
});

test("the solid side draws one line with the flag on: dot, name, state, chips, actions, key", () => {
  const { host, view } = side({ pos: 2 });
  assert.equal(host.querySelector(".t-state"), null, "the state went back to a second row");
  const order = [...host.querySelector(".t-head").children].map((el) => el.getAttribute("class").split(" ").find((c) => /^t-/.test(c)));
  assert.deepEqual(order, ["t-grip", "t-dot", "t-ident", "t-say", "t-hchips", "t-tags", "t-key"]);
  assert.equal(host.querySelector(".t-say").textContent, "working · 7s");
  assert.equal(host.querySelector(".t-key").textContent, "⌘3");
  assert.equal(host.querySelector(".t-hchips .c.tree").dataset.copy, "a/b");
  for (const pane of [".t-canopy", ".t-device", ".t-page"]) assert.ok(host.querySelector(`.t-hchips > ${pane}`), `${pane} left the head`);
  view.dispose();
});

test("only the chip that copies swallows the click — the rest still opens the seat", () => {
  const { host, view } = side({ pos: 0 });
  assert.ok(host.querySelector(".t-hchips .c.tree").$$click, "the branch chip does not copy");
  view.dispose();
  const plain = side(null);
  for (const chip of plain.host.querySelectorAll(".c")) assert.equal(chip.$$click, undefined, "a default chip started swallowing the click that opens the seat");
  plain.view.dispose();
});

const seatNamed = (name) => {
  const e = getStructured({ name, where: "local" });
  document.body.appendChild(e.host);
  return e;
};

const kids = (el) => [...el.children].map((one) => one.className.split(" ")[0]);

test("with the flag off the composer is main's, piece by piece", () => {
  flag(false);
  const e = seatNamed("rc-off");
  const form = e.host.querySelector(".sv-composer");
  assert.deepEqual(kids(form), ["sv-activity", "sv-attach", "sv-well", "sv-foot"]);
  assert.deepEqual(kids(form.querySelector(".sv-foot")), ["sv-pick", "sv-ctx", "sv-btns"]);
  assert.equal(form.querySelector("textarea").placeholder, phrase(SV_ASK));
});

test("with the flag on the composer is a box with stop and send, over a bar that opens with the activity", () => {
  flag(true);
  try {
    const e = seatNamed("rc-on");
    const form = e.host.querySelector(".sv-composer");
    assert.deepEqual(kids(form), ["sv-box", "sv-foot"]);
    assert.deepEqual(kids(form.querySelector(".sv-box")), ["sv-attach", "sv-line"]);
    assert.deepEqual(kids(form.querySelector(".sv-line")), ["sv-well", "sv-btns"]);
    assert.deepEqual(kids(form.querySelector(".sv-foot")), ["sv-activity", "sv-when", "sv-keys", "sv-halt", "sv-pick", "sv-ctx"]);
    assert.match(form.querySelector(".sv-keys").textContent, new RegExp(`${phrase("send")}.*${phrase("line")}`));
    assert.equal(form.querySelector("textarea").placeholder, phrase(SV_ASK_SLIM));
  } finally { flag(false); }
});

test("turning the flag off puts every node back where main had it, listeners and all", () => {
  flag(true);
  const e = seatNamed("rc-back");
  const form = e.host.querySelector(".sv-composer");
  const well = form.querySelector(".sv-well");
  const stop = form.querySelector(".sv-stop");
  flag(false);
  assert.deepEqual(kids(form), ["sv-activity", "sv-attach", "sv-well", "sv-foot"]);
  assert.deepEqual(kids(form.querySelector(".sv-foot")), ["sv-pick", "sv-ctx", "sv-btns"]);
  assert.equal(form.querySelector(".sv-well"), well, "the box was rebuilt instead of moved");
  assert.equal(form.querySelector(".sv-stop"), stop);
  assert.equal(form.querySelector(".sv-box, .sv-when, .sv-keys, .sv-halt"), null);
  flag(true);
  assert.deepEqual(kids(form), ["sv-box", "sv-foot"]);
  flag(false);
});

test("under the flag a running tool reads by its name, and the verbs speak the app's language", () => {
  flag(true);
  try {
    const e = seatNamed("rc-verb");
    const strip = e.host.querySelector(".sv-activity");
    e.activitySince = 0;
    e.activity = "running Bash";
    paintActivity(e);
    assert.equal(strip.querySelector(".verb").textContent, "Bash");
    assert.equal(strip.classList.contains("tool"), true);
    e.activity = "writing";
    paintActivity(e);
    assert.equal(strip.querySelector(".verb").textContent, phrase("writing the answer"));
    assert.equal(strip.classList.contains("tool"), false);
    e.activity = phrase("waiting for your answer");
    paintActivity(e);
    assert.equal(strip.classList.contains("asks"), true);
  } finally { flag(false); }
});

test("with the flag off the activity says the raw verb, as main does", () => {
  const e = seatNamed("rc-verb-off");
  e.activity = "running Bash";
  paintActivity(e);
  const strip = e.host.querySelector(".sv-activity");
  assert.equal(strip.querySelector(".verb").textContent, "running Bash");
  assert.equal(strip.classList.contains("tool"), false);
});

test("a failed tool carries the word the row shows instead of a lone ✗", () => {
  const e = getStructured({ name: "rc-failed", where: "local" });
  const card = svConvTool(e, { id: "t1", name: "Bash", input: { command: "ls" } }, false);
  assert.equal(card.failed, "");
  svConvToolLanded(e, { tool_use_id: "t1", is_error: true, content: "boom" }, false);
  assert.equal(card.failed, phrase("failed"));
});

test("every slim-composer rule of main has its undo in the tile sheet", () => {
  const slims = [...page.matchAll(/^\s*(body:not\(\.no-motion\) \.tile:not\(\.focused\):not\(\.open\) \.sv-composer:not\(\.ready\)[^{]*)\{/gm)].map((m) => m[1].trim());
  assert.ok(slims.length >= 6);
  for (const rule of slims) {
    const undo = rule.replace(/^body:not\(\.no-motion\)/, "body:where(.experience-raycast):not(.no-motion)");
    assert.ok(sheet.includes(`${undo} {`), `nothing undoes ${rule} under the flag`);
  }
});

test("the card stands still and rings coral only when the seat needs you", () => {
  assert.match(sheet, /\.tile\[data-state="needs"\] \{ --rc-shadow: var\(--ring-in\), 0 0 0 1px color-mix\(in srgb, var\(--signal\) 55%, transparent\);[^}]*animation: var\(--rc-motion, none\);/);
  assert.match(sheet, /body:where\(\.experience-raycast\)\.no-motion \.tile\[data-state="needs"\] \{ box-shadow: var\(--rc-shadow\); \}/);
  assert.match(sheet, /\.t-head \{ gap: 8px; height: 48px;/);
});

test("an empty composer keeps its hint on one line, so a narrow tile shows no scrollbar in the box", () => {
  assert.match(sheet, /\.sv-composer textarea:placeholder-shown \{ white-space: nowrap; overflow: hidden; \}/);
  assert.match(sheet, /\.tile:not\(\.focused\):not\(\.open\) \.sv-composer:not\(\.ready\):not\(\.talking\) textarea:placeholder-shown \{ white-space: nowrap; overflow: hidden; \}/, "the folded tile's revert brings the wrap back");
});
