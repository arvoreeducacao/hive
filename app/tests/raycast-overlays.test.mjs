import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const sheet = readFileSync(join(HERE, "assets", "raycast", "overlays.css"), "utf8");

const st = await state();
await views();
const { phrase } = await app("core");
const { keyCaps, keyParts, previousState, showWhich } = await app("leader-key");
const { questionCard } = await app("chat-and-panes");
const notices = await app("chimes-and-notices");
const { palModel, palPreviewViewModel } = await app("palette");
const { seatMenuRows, menuViewModel } = await app("seat-menu");
const { ask, closeConfirm } = await app("pod");
const { emptyWallModel, closeSeat } = await app("tiles");
const { paintNudge } = await app("team");
await app("raycast-overlays");

const turn = (on) => {
  const was = document.body.classList.contains("experience-raycast");
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: was ? "raycast" : "current" } }));
};

const withFlag = async (fn) => {
  turn(true);
  try { return await fn(); } finally { turn(false); }
};

const settle = () => new Promise((done) => setImmediate(done));
const fire = (el, kind) => el.dispatchEvent(new window.MouseEvent(kind, { bubbles: true, cancelable: true }));
const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const took = () => {
  const seen = [];
  return { seen, send: (answers) => { seen.push(answers); return { ok: true }; } };
};

const seat = (over = {}) => ({ name: "q1", title: "valores incoerentes", where: "local", agent: "claude", state: "idle", ...over });

function hive(seats = [seat()]) {
  st.data = { pod: { up: true, name: "pod-1" }, sessions: seats, archived: [], spawning: [] };
  st.blocks = [{ id: "b1", ws: st.space, keys: seats.map((s) => s.name) }];
  st.block = 0;
  st.open = "";
  st.typing = "";
  st.prs = [];
  st.threads = [];
}

const ONE = [{ header: "conserto", question: "por onde o áudio volta?", options: [
  { label: "CloudFront", description: "desfaz em um deploy" },
  { label: "CORS no bucket", description: "mexe em produção" }
] }];

const SHAPES = ["confirm", "nudge", "composer", "pal"];

test("turning the flag on and off again leaves every overlay's markup byte for byte as it was", () => {
  const before = SHAPES.map((id) => document.getElementById(id).outerHTML);
  turn(true);
  assert.ok(document.getElementById("c-x"), "the confirm has no close button with the flag on");
  assert.ok(document.getElementById("nudge-kind"), "the request does not say which kind it is");
  assert.ok(document.getElementById("n-agent"), "the new-chat form has no agent dropdown");
  assert.ok(document.getElementById("mission-where"), "the new-chat head does not say where it opens");
  assert.equal(document.querySelectorAll("#cmp-controls .nf-row").length, 6);
  assert.equal(document.querySelector("#pal-scope").getAttribute("role"), "button");
  turn(false);
  assert.deepEqual(SHAPES.map((id) => document.getElementById(id).outerHTML), before);
  for (const id of ["c-x", "nudge-kind", "n-agent", "mission-where", "mission-cancel", "nf-hint", "pal-acts"]) assert.equal(document.getElementById(id), null, `${id} outlived the flag`);
});

test("a key label is cut into the caps the eye reads", () => {
  assert.deepEqual(keyParts("⌘⇧K"), ["⌘", "⇧", "K"]);
  assert.deepEqual(keyParts("ctrl+alt+S"), ["ctrl", "alt", "S"]);
  assert.deepEqual(keyParts("Enter"), ["↵"]);
  assert.deepEqual(keyParts("—"), []);
  assert.deepEqual(keyParts("⌃B N"), ["⌃", "B", "N"]);
  assert.deepEqual(keyParts("⌘+"), ["⌘", "+"]);
  assert.equal(keyCaps("⌘K"), '<span class="rc-key">⌘</span><span class="rc-key">K</span>');
});

test("the leader overlay writes its chords as key caps only with the flag, and as main's bold text without it", () => {
  st.leader = { ctrl: true, code: "KeyB" };
  st.chords = { palette: { code: "KeyK" } };
  st.typing = "";
  showWhich();
  assert.match(document.getElementById("which-head").innerHTML, /<b>/);
  assert.doesNotMatch(document.getElementById("which-grid").innerHTML, /rc-key/);
  turn(true);
  showWhich();
  assert.match(document.getElementById("which-head").innerHTML, /rc-key/);
  assert.match(document.getElementById("which-grid").innerHTML, /rc-key/);
  turn(false);
  document.getElementById("which").classList.remove("on");
});

test("with the flag, two questions are one card: a pick only selects, and answering walks to the second before it sends", () => withFlag(async () => {
  const got = took();
  const card = questionCard([
    { header: "a", question: "primeira?", options: [{ label: "sim" }, { label: "não" }] },
    { header: "b", question: "segunda?", options: [{ label: "agora" }, { label: "depois" }] }
  ], got.send);
  const steps = [...card.querySelectorAll(".qstep")];
  fire(card.querySelectorAll(".qo")[0], "click");
  assert.deepEqual(steps.map((s) => s.hidden), [false, true], "a pick walked away on its own");
  fire(card.querySelectorAll(".qo")[1], "click");
  fire(card.querySelector(".qnext"), "click");
  await settle();
  assert.deepEqual(steps.map((s) => s.hidden), [true, false]);
  assert.deepEqual(got.seen, []);
  fire(steps[1].querySelectorAll(".qo")[0], "click");
  fire(card.querySelector(".qnext"), "click");
  await settle();
  assert.deepEqual(got.seen, [{ "primeira?": "não", "segunda?": "agora" }]);
}));

test("with the flag, enter on a picked option answers, a digit only picks, and later folds the card without answering", () => withFlag(async () => {
  const got = took();
  const card = questionCard(ONE, got.send);
  assert.match(card.querySelector(".qhint").textContent, /1–2/);
  key(card.querySelectorAll(".qo")[0], "2");
  assert.ok(card.querySelectorAll(".qo")[1].classList.contains("sel"));
  assert.deepEqual(got.seen, [], "a digit sent the answer");
  fire(card.querySelector(".qlater"), "click");
  assert.ok(card.classList.contains("later"));
  assert.ok(!card.classList.contains("answered"));
  assert.match(card.querySelector(".qwake").textContent, /por onde o áudio volta\?/);
  fire(card.querySelector(".qwake"), "click");
  assert.ok(!card.classList.contains("later"));
  key(card.querySelectorAll(".qo")[1], "Enter");
  await settle();
  assert.deepEqual(got.seen, [{ "por onde o áudio volta?": "CORS no bucket" }]);
}));

test("without the flag the question card is the one main has: no later, no wake, no chosen mark", () => {
  const card = questionCard(ONE, took().send);
  for (const cls of ["qlater", "qwake", "qchosen", "qgrow"]) assert.equal(card.querySelector(`.${cls}`), null, `.${cls} leaked out of the flag`);
  assert.equal(card.querySelector(".qnext .qkey").textContent, "⇧⏎");
});

test("with the flag, a seat that starts asking gets a card in the corner until it stops asking", () => withFlag(() => {
  const asks = seat({ state: "needs", now: "Parou e pergunta: OC ou SKU?" });
  hive([{ ...asks, state: "working" }]);
  previousState.clear();
  notices.announceChange();
  st.data = { ...st.data, sessions: [asks] };
  notices.announceChange();
  const card = document.querySelector("#canopyNotices .cn-seat-card");
  assert.ok(card, "the seat that needs you said so only outside the app");
  assert.ok(card.classList.contains("needs"));
  assert.equal(card.querySelector(".cn-say").textContent, asks.now);
  st.data = { ...st.data, sessions: [{ ...asks, state: "working" }] };
  notices.announceChange();
  assert.ok(card.classList.contains("going"));
  card.remove();
}));

test("with the flag, the next-one key opens the newest seat card, answered ones included", () => withFlag(() => {
  const answers = seat({ state: "answered", summary: "Terminei." });
  hive([{ ...answers, state: "working" }]);
  st.answeredAlert = true;
  previousState.clear();
  notices.announceChange();
  st.data = { ...st.data, sessions: [answers] };
  notices.announceChange();
  st.answeredAlert = false;
  const card = document.querySelector("#canopyNotices .cn-seat-card");
  assert.ok(card, "the answer left no card in the corner");
  assert.match(card.querySelector(".cn-go").textContent, /Open/);
  assert.equal(notices.openNewestSeatNotice(), true);
  assert.ok(card.classList.contains("going"));
  assert.equal(notices.openNewestSeatNotice(), false);
  card.remove();
}));

test("without the flag a seat that starts asking puts no card in the app", () => {
  const asks = seat({ state: "needs" });
  hive([{ ...asks, state: "working" }]);
  previousState.clear();
  notices.announceChange();
  st.data = { ...st.data, sessions: [asks] };
  notices.announceChange();
  assert.equal(document.querySelector("#canopyNotices .cn-seat-card"), null);
});

test("an answer's card is neutral and says who answered", () => {
  const model = notices.seatNoticeModel(seat({ title: "validar editoras", state: "answered", summary: "O PR põe na OC o livro." }));
  assert.equal(model.title, "validar editoras answered");
  assert.equal(model.stays, true);
  assert.doesNotMatch(sheet, /\.cn-seat-card(?!\.needs)[^{]*\{[^}]*--signal/, "the signal colour leaked into the neutral cards");
});

test("with the flag the seat menu carries icons and keys, folds the blocks into one row and closes with an ellipsis", () => withFlag(() => {
  hive([seat(), seat({ name: "q2" })]);
  st.blocks.push({ id: "b2", ws: st.space, keys: [] });
  const rows = seatMenuRows(seat());
  assert.ok(rows.filter((r) => !r.sep).every((r) => r.icon), "a row lost its icon");
  const move = rows.find((r) => r.sub);
  assert.equal(move.label, phrase("move to a block"));
  assert.deepEqual(move.sub.map((r) => r.label), [phrase("block {n}", { n: 2 }), phrase("a block of its own")]);
  assert.equal(rows.at(-1).label, phrase("close the seat…"));
}));

test("without the flag the seat menu keeps its rows and its model keeps its shape", () => {
  hive([seat(), seat({ name: "q2" })]);
  const rows = seatMenuRows(seat());
  assert.ok(rows.every((r) => !r.icon && !r.sub));
  assert.equal(rows.at(-1).label, phrase("close the seat"));
  assert.deepEqual(Object.keys(menuViewModel("a", [{ label: "go" }]).rows[0]), ["key", "at", "label", "note", "danger", "off"]);
});

test("with the flag the palette writes each seat's state beside its name and details the picked one", () => withFlag(() => {
  hive([seat({ state: "needs", model: "Opus 5.5" })]);
  const rows = palModel("");
  const row = rows.find((r) => r.id === "seat:q1");
  assert.equal(row.state, "needs");
  assert.equal(row.badge, "b1");
  assert.equal(row.icon, "i-claude");
  assert.match(rows.find((r) => r.sec === phrase("go to")).note, /1/);
  st.palRows = rows;
  st.palSel = rows.filter((r) => !r.sec).indexOf(row);
  st.palMode = "";
  const detail = palPreviewViewModel();
  assert.equal(detail.mode, "seat");
  assert.equal(detail.name, "valores incoerentes");
  assert.ok(detail.facts.some((f) => f.key === "model"));
}));

test("with the flag the palette details a seat by its state, model, branch and PR, and a command by its keys", () => withFlag(() => {
  const one = {
    name: "a", title: "apagar oc recebida", where: "local", state: "working", when: "2m", agent: "claude", kind: "structured", model: "Opus 5.5",
    trees: [{ repo: "ops-data-fixes", branch: "jorge-team/-/apaga-nota-de-teste-900031" }], prs: ["https://github.com/org/ops-data-fixes/pull/144"]
  };
  st.blocks = [{ id: "b1", ws: st.space, keys: ["z", "a"] }];
  st.prs = [];
  st.threads = [];
  st.palMode = "";
  st.palRows = [{ sec: "go to" }, { id: "seat:a", seat: one, name: one.title, icon: "i-claude" }, { id: "action:0", icon: "i-bolt", name: "new chat", ctx: "an empty seat", key: "⌘N" }];
  st.palSel = 0;
  const said = palPreviewViewModel();
  assert.equal(said.where, "local · block 1 · seat 2");
  const fact = (k) => said.facts.find((f) => f.key === k);
  assert.equal(fact("state").text, "working · 2m");
  assert.equal(fact("branch").copy, one.trees[0].branch);
  assert.ok(fact("branch").mono.includes("…") && fact("branch").mono.endsWith("900031"));
  assert.equal(fact("pr").mono, "ops-data-fixes#144");
  st.palSel = 1;
  assert.deepEqual([...palPreviewViewModel().keys], ["⌘", "N"]);
  st.palSel = 7;
  assert.equal(palPreviewViewModel().mode, "note");
}));

test("without the flag the palette rows and its preview are main's", () => {
  hive([seat({ state: "needs" })]);
  const row = palModel("").find((r) => r.id === "seat:q1");
  assert.equal(row.state, undefined);
  assert.equal(row.icon, "i-local");
  st.palMode = "";
  assert.equal(palPreviewViewModel().mode, "off");
});

test("with the flag the close confirm names the seat in its title and its button carries its key", () => withFlag(async () => {
  hive([seat()]);
  const was = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    const done = closeSeat(seat(), null);
    await settle();
    assert.equal(document.getElementById("c-title").textContent, phrase("Close “{name}”?", { name: "valores incoerentes" }));
    assert.ok(document.getElementById("c-who").hidden, "the name is said twice");
    assert.ok(document.querySelector("#c-yes .rc-key"));
    closeConfirm(false);
    await done;
  } finally { globalThis.fetch = was; }
}));

test("without the flag the confirm button is plain text, as main has it", async () => {
  const done = ask("Close this seat?", "gone", "close the seat", {});
  assert.equal(document.getElementById("c-yes").innerHTML, "close the seat");
  closeConfirm(false);
  await done;
});

test("the empty wall teaches the keys: four ways to start and the last archived chats to revive", () => {
  st.data = { sessions: [], spawning: [], archived: [
    { name: "old", where: "local", title: "apagar pedido de teste 48", model: "Opus 5.5", archivedAt: Date.now() - 86400000 },
    { name: "older", where: "cloud", title: "explorar estorno", archivedAt: Date.now() - 3 * 86400000 },
    { name: "oldest", where: "local", title: "x", archivedAt: Date.now() - 9 * 86400000 }
  ], pod: { up: true, name: "pod-1" } };
  const wall = emptyWallModel();
  assert.equal(wall.head, "No seat open");
  assert.equal(wall.server, "server pod-1 up");
  assert.deepEqual(wall.rows.map((r) => r.act).slice(0, 2), ["new", "term"]);
  assert.equal(wall.rows.at(-1).act, "find");
  assert.deepEqual(wall.parked.map((r) => r.name), ["old", "older"]);
  assert.match(wall.mark, /hive-mark/);
  st.data = { ...st.data, sessions: [{ name: "a", where: "local", state: "idle" }] };
  assert.equal(emptyWallModel().head, "Nothing in this block");
});

test("with the flag the request from someone else says which kind it is and its button carries its key", () => withFlag(() => {
  hive([seat()]);
  const asked = { from: "juno", seat: "q1", at: Date.now(), kind: "ask", text: "posso?" };
  st.knocksOpen = [asked];
  st.nudgeQueue = [asked];
  paintNudge();
  assert.equal(document.getElementById("nudge-yes").textContent, `${phrase("let it in")} ↵`);
  assert.equal(document.getElementById("nudge-kind").textContent, phrase("question from someone else"));
  assert.match(document.getElementById("nudge-seat").innerHTML, / · /);
  st.knocksOpen = [];
  st.nudgeQueue = [];
  paintNudge();
}));

test("a question card in a narrow tile keeps its options and buttons inside the tile", () => {
  assert.match(readFileSync(join(HERE, "app.html"), "utf8"), /\.sv-q, \.sv-q \.qstep \{ grid-template-columns: minmax\(0, 1fr\); \}/, "the card's column grew to its widest line");
  assert.match(sheet, /\.sv-q \.qnav \{[^}]*flex-wrap: wrap/, "later and answer stay on one line past the edge");
});

test("the palette's preview title takes a second line before it gives up on the words", () => {
  assert.match(sheet, /\.pal-det \.dh b span \{[^}]*-webkit-line-clamp: 2/);
  assert.doesNotMatch(sheet, /\.pal-det \.dh b span \{[^}]*white-space: nowrap/);
});

test("a doctor fix in the palette shows where it runs and the command it copies or runs", () => withFlag(() => {
  st.palMode = "";
  st.alerts = { ...st.alerts, count: 1, items: [{ id: "pod-pull", state: "warn", headline: "the seats are behind", fix: { label: "fast-forward the hub checkout", command: "hive-pod exec 'git -C /workspace/hub pull --ff-only'", podScript: "git -C /workspace/hub pull --ff-only" } }] };
  st.palRows = palModel("");
  st.palSel = st.palRows.filter((r) => !r.sec).findIndex((r) => r.id === "env:pod-pull");
  const said = palPreviewViewModel();
  const fact = (k) => said.facts.find((f) => f.key === k);
  assert.equal(fact("where").text, phrase("on the server"));
  assert.equal(fact("command").mono, "git -C /worksp…ull --ff-only");
  st.alerts = { ...st.alerts, items: [{ id: "login", state: "fail", headline: "x", fix: { label: "log Claude in on the server", command: "/Users/someone/Developer/hub/dev-workspaces/acme/scripts/pod-login.sh" } }] };
  st.palRows = palModel("");
  st.palSel = st.palRows.filter((r) => !r.sec).findIndex((r) => r.id === "env:login");
  const local = palPreviewViewModel().facts;
  assert.equal(local.length, 1, "a command that runs here does not claim a place next to a label about the server");
  assert.ok(local[0].mono.startsWith("~/") && local[0].mono.endsWith("pod-login.sh"), local[0].mono);
  st.alerts = { ...st.alerts, items: [{ id: "setup", state: "warn", headline: "x", fix: { label: "prepare this machine, in Git Bash", command: "bash setup.sh" } }, { id: "avd", state: "warn", headline: "y", fix: { label: "create the hive-pixel AVD", command: "avdmanager create" } }] };
  const names = palModel("").filter((r) => r.id?.startsWith("env:")).map((r) => r.name);
  assert.deepEqual(names, [`${phrase("run")}: ${phrase("{what}, in Git Bash", { what: phrase("prepare this machine") })}`, `${phrase("run")}: ${phrase("create the {avd} AVD", { avd: "hive-pixel" })}`]);
  assert.equal(fact("command").copy, "hive-pod exec 'git -C /workspace/hub pull --ff-only'");
  st.alerts = { ...st.alerts, count: 0, items: [] };
}));
