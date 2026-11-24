import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, state } from "./dom.mjs";
import { forgetMarksCache, keepMarks, readMarks } from "../lib/inbox-marks.mjs";

const markHome = mkdtempSync(join(tmpdir(), "hive-inbox-structure-"));
const marksSent = [];
const archived = [];
let hive = null;
let kept = null;
let subs = [];
const SUB_EVENTS = [
  { type: "user", message: { role: "user", content: "revise o diff do recebimento" } },
  { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Achei dois problemas no diff." }] } }
];
const asked = [];
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (String(url).includes("/api/seat/archive")) archived.push(JSON.parse(init.body).name);
  if (String(url).includes("/api/checkpoints") && kept) {
    asked.push(String(url));
    return Promise.resolve(answered(String(url).includes("/diff") ? { patch: kept.patch } : { turns: kept.turns }));
  }
  if (String(url).includes("/api/subagents/events")) return Promise.resolve(answered({ events: SUB_EVENTS }));
  if (String(url).includes("/api/subagents")) return Promise.resolve(answered({ agents: subs }));
  if (String(url).includes("/api/hive") && hive) return Promise.resolve(answered(JSON.parse(JSON.stringify(hive.data))));
  if (String(url).includes("/api/inbox/marks")) {
    const body = JSON.parse(init.body);
    marksSent.push(body);
    return Promise.resolve(answered({ ok: true, ...keepMarks(markHome, body.marks, { moving: body.moving === true }) }));
  }
  return Promise.resolve(answered({ sessions: [], ok: true }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => {
  globalThis.fetch = realFetch;
  rmSync(markHome, { recursive: true, force: true });
  forgetMarksCache();
});

const st = await state();
hive = st;
const { $, IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { setStructure, structureWorn } = await app("structure");
const { structPool } = await app("structured-seats");
const conv = await app("conversation-model");
const { svReset } = await app("chat-stretches");
const { svEvent } = await app("chat-and-panes");
const { inbox } = await import(new URL("../src/structures/inbox.js", import.meta.url).href);

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

let held = null;
const enterInbox = inbox.enter;
inbox.enter = (ctx) => { held = ctx; return enterInbox(ctx); };
const ctxOf = () => held;

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

const SEATS = {
  quiet: { state: "idle", title: "revisor diario", finish: { seq: 1, at: ago(60 * 30), text: "Retro de ontem enviada no Hive.\n\nVolto às 19h." } },
  asks: { state: "needs", title: "sessao crm expirada", trees: [{ repo: "crm-web", branch: "jonas/sessao-expirada", main: true }], finish: { seq: 2, at: ago(2), text: "Achei por que a **sessão** cai.\n\n- item 1\n- item 2\n\nJá posso abrir PR do item 1 no `crm-web`?" } },
  busy: { state: "working", title: "hive raycast visual", now: "Integração bate com o canvas nos dois visuais.", verb: "Bash", measure: "15ms", turnSince: ago(83 / 60) },
  back: { state: "done", title: "valores incoerentes", trees: [{ repo: "oms-web", branch: "jonas/valores-lote" }], finish: { seq: 3, at: ago(6), text: "Não é bug de cálculo: o Pipeline soma o prometido.\n\nOs outros dois lotes batem." } }
};

function lay() {
  const names = Object.keys(SEATS);
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map((name) => ({ name, where: "local", kind: "chat", structured: true, model: "Opus 5.5", ...SEATS[name] })), spawning: [], archived: [], pod: { up: false, name: "" }, marks: readMarks(markHome) };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["quiet", "asks"] }, { id: "b1", ws: "w0", label: "", manual: true, keys: ["busy", "back"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.prs = [{ session: "back", repo: "acme/oms-web", number: 35, ci: "failed", url: "https://github.com/acme/oms-web/pull/35", key: "pr35" }];
  st.team = { me: "jonas", devs: [{ dev: "jonas", key: "k-me", seats: [] }, { dev: "mees", key: "k-mees", up: true, seats: [{ name: "x", title: "fila do time", state: "working", now: "rodando a suíte" }] }] };
  st.threadRules = { ...st.threadRules, workingSection: false };
  render();
}

const root = () => $("structure-root");
const rows = () => [...root().querySelectorAll(".tx-row")].map((el) => el.dataset.key);
const selected = () => root().querySelector(".tx-row.sel")?.dataset.key;
const rowEl = (key) => root().querySelector(`.tx-row[data-key="${key}"]`);
const press = (key, extra = {}) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  (extra.target || document.body).dispatchEvent(ev);
  return ev;
};
const same = (a, b, said) => assert.ok(a === b, said);
const marks = () => Object.fromEntries(Object.entries(readMarks(markHome)).filter(([, mark]) => Object.keys(mark).some((field) => field !== "at")));
const shelf = (id) => root().querySelector(`[data-shelf="${id}"]`);

localStorage.removeItem("hive.inbox.marks");
localStorage.removeItem("hive.inbox.shelves");
lay();

test("the inbox is built and says it is ready", () => {
  assert.equal(inbox.id, "inbox");
  assert.equal(inbox.ready, true);
});

test("the last words of a seat come from what it left: the question when it asks, the lead when it answered, the status while it works", () => {
  assert.equal(inbox.lastWords({ state: "needs", finish: SEATS.asks.finish }), "Já posso abrir PR do item 1 no crm-web?");
  assert.equal(inbox.lastWords({ state: "needs", asks: [{ id: "a", questions: [{ question: "Qual escola?" }] }], finish: SEATS.asks.finish }), "Qual escola?");
  assert.equal(inbox.lastWords({ state: "done", finish: SEATS.back.finish }), "Não é bug de cálculo: o Pipeline soma o prometido.");
  assert.equal(inbox.lastWords({ state: "working", now: "rodando a suíte", finish: SEATS.back.finish }), "rodando a suíte");
  assert.equal(inbox.lastWords({ state: "idle", description: "toda hora eu tenho que logar" }), "toda hora eu tenho que logar");
  assert.equal(inbox.lastWords({ state: "idle" }), "");
  assert.ok(inbox.lastWords({ state: "done", finish: { text: "a ".repeat(400) } }).length <= 240);
});

test("the states fall into the groups of who needs you", () => {
  assert.deepEqual(["needs", "answered", "done", "working", "stalled", "ready", "idle"].map(inbox.groupOf), ["needs", "back", "back", "busy", "busy", "rest", "rest"]);
});

test("the status follows T3: a question is input, a stop without one is approval, a fresh reply is finished, and a resting seat shows only its time", () => {
  assert.equal(inbox.statusOf({ state: "needs", asks: [{ questions: [{ question: "?" }] }] }), "input");
  assert.equal(inbox.statusOf({ state: "needs" }), "approval");
  assert.equal(inbox.statusOf({ state: "working" }), "working");
  assert.equal(inbox.statusOf({ state: "stalled" }), "waiting");
  assert.equal(inbox.statusOf({ state: "answered" }), "done");
  assert.equal(inbox.statusOf({ state: "idle" }), null);
  assert.equal(inbox.statusOf({ state: "idle" }, { unread: true }), "done");
  assert.equal(inbox.statusOf({ state: "idle" }, { wokeAt: 1 }), "woke");
  assert.equal(inbox.statusOf({ state: "idle" }, {}, true), "secret");
  assert.equal(inbox.statusOf({ state: "idle" }, {}, false, true), "limited");
  assert.equal(inbox.statusOf({ state: "working" }, {}, false, true), "working");
});

test("entering wears the T3 sidebar: one card per chat, newest first, with project, title, branch and the status in the corner", () => {
  setStructure("inbox", { quiet: true });
  assert.equal(structureWorn(), "inbox");
  assert.equal(document.body.dataset.structure, "inbox");
  assert.deepEqual(rows(), ["busy", "asks", "back", "quiet"]);
  const ask = rowEl("asks");
  assert.match(ask.querySelector(".tx-proj").textContent, /crm-web/);
  assert.equal(ask.querySelector(".tx-title").textContent, "sessao crm expirada");
  assert.match(ask.querySelector(".tx-br").textContent, /jonas\/sessao-expirada/);
  assert.match(ask.querySelector(".tx-st").textContent, /Approval/);
  assert.equal(ask.getAttribute("aria-label"), "sessao crm expirada");
  assert.equal(ask.title, "", "the hover card replaces the native tooltip");
  assert.match(rowEl("busy").querySelector(".tx-st").textContent, /Working1m/);
  assert.ok(rowEl("busy").querySelector(".tx-dur[data-t0]"));
  assert.match(rowEl("back").querySelector(".tx-st").textContent, /Finished/);
  assert.equal(rowEl("back").querySelector(".tx-prb").textContent, "35", "like T3, the number goes without # and the badge carries no CI tint");
  assert.match(rowEl("quiet").querySelector(".tx-st").textContent, /^\d+d$/);
  assert.equal(root().querySelector(".tx-row .tx-diff"), null, "T3 keeps the diff off the card");
  assert.equal(ask.querySelector(".tx-wt"), null, "the main checkout is not a worktree");
  assert.ok(rowEl("back").querySelector(".tx-wt"));
});

test("a long branch is cut in the middle like T3: the last segment stays whole and the cut snaps to a word", () => {
  assert.deepEqual(inbox.splitMiddle("jonas-costa/-/sem-agents-md"), { head: "jonas-costa/-/", tail: "sem-agents-md" });
  assert.deepEqual(inbox.splitMiddle("feat/a-very-long-segment-that-runs-on"), { head: "feat/a-very-long-segment-that-", tail: "runs-on" });
  assert.equal(inbox.splitMiddle("main"), null, "a short name is left whole");
  assert.equal(rowEl("back").querySelector(".tx-mid-tail").textContent, "valores-lote");
});

test("several pull requests fold into one badge that counts them, in the colour of the one still open", () => {
  st.prs.push({ session: "back", repo: "acme/oms-web", number: 36, state: "merged", url: "https://github.com/acme/oms-web/pull/36", key: "pr36" });
  render();
  const badge = rowEl("back").querySelector(".tx-prb");
  assert.equal(badge.textContent, "+2");
  assert.ok(badge.classList.contains("pr-open"));
  st.prs.pop();
  render();
  assert.equal(rowEl("back").querySelector(".tx-prb").textContent, "35");
});

test("resting on a chat opens T3's hover card beside it, with project, machine, branch, model and its pull requests", async () => {
  rowEl("back").dispatchEvent(new Event("pointerover", { bubbles: true }));
  assert.equal(root().querySelector(".tx-tip"), null, "the card waits before it opens");
  await new Promise((go) => setTimeout(go, 650));
  const tip = root().querySelector(".tx-tip");
  assert.ok(tip);
  assert.match(tip.querySelector(".tx-tip-title").textContent, /valores incoerentes/);
  assert.match(tip.textContent, /oms-web/);
  assert.match(tip.textContent, /jonas\/valores-lote/);
  assert.match(tip.textContent, /Opus 5\.5/);
  assert.match(tip.querySelector(".tx-tip-foot").textContent, /#35/);
  root().querySelector(".tx-scroll").dispatchEvent(new Event("pointerdown", { bubbles: true }));
  assert.equal(root().querySelector(".tx-tip"), null, "a click puts it away");
});

test("the focused seat is read in the middle, with its real tile, and the details sit on the right", () => {
  assert.equal(selected(), "quiet");
  same(tiles.get("quiet").parentElement, root().querySelector(".tx-host"), "the focused seat is in the reading column");
  same(tiles.get("asks").parentElement, $("canvas"), "a seat nobody reads stays on the canvas");
  assert.match(root().querySelector(".tx-crumb-title").textContent, /revisor diario/);
  assert.equal(root().querySelector(".tx-details").hidden, true, "like T3, the details start closed");
  root().querySelector('.tx-head [data-act="details"]').click();
  const details = root().querySelector(".tx-details");
  assert.equal(details.hidden, false);
  assert.match(details.textContent, /Opus 5\.5/);
});

test("the details list the chat's subagents like T3: the running ones on top, the rest folded under Previous agents", async () => {
  const t0 = Date.now() - 125000;
  subs = [
    { id: "live1", title: "Mapear o contrato", status: "running", startedAt: t0, endedAt: 0, model: "claude-sonnet-5-5" },
    { id: "done1", title: "Thermo: qualidade", status: "done", startedAt: t0 - 600000, endedAt: t0 - 60000, model: "claude-opus-5-5" },
    { id: "cut1", title: "Construir a página", status: "stopped", startedAt: t0 - 900000, endedAt: t0 - 700000, model: "claude-opus-5-5" }
  ];
  const toggle = () => root().querySelector('.tx-head [data-act="details"]').click();
  toggle();
  toggle();
  await new Promise((go) => setTimeout(go, 20));
  const details = root().querySelector(".tx-details");
  const rowsIn = () => [...details.querySelectorAll(".tx-sub")].map((el) => el.dataset.id);
  assert.deepEqual(rowsIn(), ["live1"], "only the running one shows before the fold opens");
  assert.ok(details.querySelector('.tx-sub[data-id="live1"] .tx-sub-dot.st-running'));
  assert.match(details.querySelector('.tx-sub[data-id="live1"] .tx-sub-ms').textContent, /^2m$/);
  const fold = details.querySelector('[data-act="subs-fold"]');
  assert.match(fold.textContent, /Previous agents\s*2/);
  fold.click();
  assert.deepEqual(rowsIn(), ["live1", "done1", "cut1"]);
  assert.match(details.querySelector('.tx-sub[data-id="done1"] .tx-sub-ms').textContent, /^9m$/);
});

test("a subagent opens as its own read-only chat, with T3's bar in place of the composer, and Open parent goes back", async () => {
  root().querySelector('.tx-details .tx-sub[data-id="done1"]').click();
  await new Promise((go) => setTimeout(go, 30));
  const host = root().querySelector(".tx-host:not(.tx-subhost)");
  const sub = root().querySelector(".tx-subhost");
  assert.equal(host.hidden, true, "the parent steps aside");
  assert.equal(sub.hidden, false);
  assert.match(sub.querySelector(".sv-scroll").textContent, /revise o diff do recebimento/);
  assert.match(sub.querySelector(".sv-scroll").textContent, /Achei dois problemas no diff/);
  const bar = sub.querySelector(".tx-subbar").textContent;
  assert.match(bar, /Opus 5\.5/);
  assert.match(bar, /Finished in 9m/);
  assert.match(bar, /Runs on its own/);
  assert.match(root().querySelector(".tx-head").textContent, /revisor diario.*Thermo: qualidade/s, "the crumbs walk from the parent to the subagent");
  assert.equal(selected(), "quiet", "the sidebar keeps the parent selected");
  sub.querySelector('.tx-subbar [data-act="sub-close"]').click();
  assert.equal(sub.hidden, true);
  assert.equal(host.hidden, false);
  root().querySelector('.tx-details .tx-sub[data-id="live1"]').click();
  await new Promise((go) => setTimeout(go, 30));
  assert.match(sub.querySelector(".tx-subbar").textContent, /Working for 2m/);
  press("Escape");
  assert.equal(sub.hidden, true, "Esc goes back to the parent too");
  subs = [];
  render();
});

test("an open chat gets T3's attach button, and the checkout strip stays with new chats only", async () => {
  await new Promise((go) => setTimeout(go, 0));
  const host = root().querySelector(".tx-host");
  assert.ok(host.querySelector(".sv-btns > .tx-clip"));
  assert.equal(host.querySelector(".tx-ctx"), null);
});

const at = (e, ms) => { e.heardAt = Date.now(); e.at = ms; };
const landedTool = (e, id, name, input) => {
  const card = conv.svConvTool(e, { id, name, input }, false);
  card.running = false;
  card.stat = "ok";
  return card;
};
const settle = () => new Promise((go) => setTimeout(go, 50));

test("a settled turn folds its work behind one line that says how long it took, and opens on click", async () => {
  const e = structPool.get("quiet");
  svReset(e);
  at(e, 1000);
  conv.svConvLine(e, "sv-user", "arruma o build");
  landedTool(e, "w1", "Read", { file_path: "/tmp/a.js" });
  at(e, 5000);
  conv.svConvSaid(e, "achei o erro");
  landedTool(e, "w2", "Bash", { command: "npm test" });
  at(e, 39000);
  conv.svConvSaid(e, "pronto");
  await settle();
  const scroll = root().querySelector(".tx-host .sv-scroll");
  const fold = scroll.querySelector(":scope > .tl-fold");
  assert.ok(fold, "the line sits right under the ask");
  assert.equal(fold.previousElementSibling.classList.contains("sv-user"), true);
  assert.match(fold.textContent, /Worked for 38s/);
  assert.equal(scroll.querySelectorAll(":scope > .sv-tool").length, 0, "the calls are folded away");
  const end = [...scroll.querySelectorAll(":scope > .sv-msg")].at(-1);
  assert.equal(end.hidden, false);
  assert.match(end.textContent, /pronto/);
  assert.match(end.querySelector(":scope > .sv-stamp .tx-clock")?.textContent || "", /\d:\d\d/, "the footer says the clock time, like T3");
  fold.querySelector("button").click();
  await settle();
  assert.equal(scroll.querySelector(".tl-fold button").getAttribute("aria-expanded"), "true");
  assert.equal(scroll.querySelectorAll(":scope > .sv-tool").length, 2, "open, every call is back in its place");
  scroll.querySelector(".tl-fold button").click();
  await settle();
  assert.equal(scroll.querySelectorAll(":scope > .sv-tool").length, 0);
  svReset(e);
});

test("a settled answer carries the files its turn changed, as T3's card, and a file opens that turn's diff on it", async () => {
  const quiet = st.data.sessions.find((one) => one.name === "quiet");
  quiet.trees = [{ repo: "hive", branch: "ana/-/x", path: "/w/hive" }];
  const paths = [{ path: "app/src/a.js", added: 3, removed: 1 }, { path: "app/src/b.js", added: 1, removed: 0 }, { path: "README.md", added: 2, removed: 2 }];
  kept = {
    turns: [{ ordinal: 1, at: 0, baseline: true, files: 0, added: 0, removed: 0 }, { ordinal: 2, at: 20000, files: 3, added: 6, removed: 3, paths }],
    patch: "diff --git a/README.md b/README.md\n--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/app/src/a.js b/app/src/a.js\n@@ -1 +1 @@\n-x\n+y"
  };
  const e = structPool.get("quiet");
  svReset(e);
  at(e, 10000);
  conv.svConvLine(e, "sv-user", "muda os arquivos");
  at(e, 19000);
  conv.svConvSaid(e, "mudei");
  render();
  await settle();
  const scroll = root().querySelector(".tx-host .sv-scroll");
  const end = () => [...scroll.querySelectorAll(":scope > .sv-msg")].at(-1);
  const card = end().querySelector(":scope > .tx-cf");
  assert.ok(card, "the answer of the turn carries the card");
  assert.match(card.querySelector(".tx-cf-sum").textContent, /3 changed files\+6-3/);
  assert.equal(root().querySelector(".tx-files"), null, "no strip above the composer: T3 keeps the files with each answer");
  card.querySelector('[data-act="cf-dir"]').click();
  await settle();
  assert.deepEqual([...end().querySelectorAll(".tx-cf-row .tx-cf-name")].map((one) => one.textContent), ["app/src", "a.js", "b.js", "README.md"]);
  [...end().querySelectorAll(".tx-cf-row")].find((one) => one.dataset.file === "app/src/a.js").click();
  await new Promise((go) => setTimeout(go, 20));
  assert.match(asked.at(-1), /\/api\/checkpoints\/diff\?name=quiet&ordinal=2/);
  const patch = root().querySelector(".tx-patch");
  assert.ok(patch, "the diff of the turn opens");
  assert.equal(patch.querySelector('[data-file="app/src/a.js"]')?.textContent, "diff --git a/app/src/a.js b/app/src/a.js");
  patch.querySelector('[data-act="patch-close"]').click();
  svReset(e);
  delete quiet.trees;
  kept = null;
  render();
});

test("a chat at work says how long the turn has run right under what was asked, and the line leaves when it stops", async () => {
  rowEl("busy").click();
  await settle();
  const e = structPool.get("busy");
  svReset(e);
  at(e, Date.now() - 83000);
  conv.svConvLine(e, "sv-user", "roda tudo");
  e.turnOpen = true;
  conv.svConvShow(e);
  await settle();
  const scroll = root().querySelector(".tx-host .sv-scroll");
  const line = scroll.querySelector(":scope > .tl-working");
  assert.ok(line, "the working line opens the turn, under the ask");
  assert.equal(line.previousElementSibling.classList.contains("sv-user"), true);
  assert.match(line.textContent, /Working for 1m \d+s/, "past a minute it keeps the seconds, like T3");
  assert.ok(scroll.querySelector(":scope > .tl-live"), "the tail says it is thinking while nothing else moves");
  svEvent(e, { type: "result" });
  await settle();
  assert.equal(scroll.querySelector(".tl-working"), null);
  assert.equal(scroll.querySelector(".tl-live"), null);
  svReset(e);
  rowEl("quiet").click();
});

test("a turn the person stopped folds under the line that says when, instead of how long it worked", async () => {
  const e = structPool.get("quiet");
  svReset(e);
  at(e, 1000);
  conv.svConvLine(e, "sv-user", "faz");
  landedTool(e, "s1", "Bash", { command: "sleep 30" });
  at(e, 13000);
  conv.svConvSaid(e, "comecei");
  conv.svConvStopped(e);
  await settle();
  const scroll = root().querySelector(".tx-host .sv-scroll");
  const fold = scroll.querySelector(":scope > .tl-fold");
  assert.match(fold.textContent, /You stopped after 12s/);
  assert.equal(scroll.querySelector(":scope > .sv-stopped"), null, "the stop line does not repeat under its own fold");
  assert.equal(scroll.querySelectorAll(":scope > .sv-tool").length, 0);
  svReset(e);
});

test("the end of the timeline says the chat is snoozed or settled, with the way back on the line", async () => {
  const e = structPool.get("quiet");
  svReset(e);
  at(e, 1000);
  conv.svConvLine(e, "sv-user", "oi");
  at(e, 2000);
  conv.svConvSaid(e, "olá");
  rowEl("quiet").click();
  press("s");
  ctxOf().focusSeat("quiet");
  await settle();
  const line = root().querySelector(".tx-host .sv-scroll > .tl-status");
  assert.ok(line, "a settled chat says so at the end of its timeline");
  assert.match(line.textContent, /Settled/);
  line.querySelector(".tl-inline").click();
  await settle();
  assert.equal(root().querySelector(".tx-host .sv-scroll > .tl-status"), null, "Un-settle puts it back and the line goes");
  svReset(e);
});

test("the composer of a Claude chat has T3's Build and Plan switch, on a click and on shift+tab", async () => {
  await new Promise((go) => setTimeout(go, 0));
  const e = structPool.get("quiet");
  const asked = [];
  e.ws = { readyState: 1, send(text) {
    const cmd = JSON.parse(text);
    asked.push(cmd.mode);
    const done = e.pending.get(cmd.cid);
    e.pending.delete(cmd.cid);
    done?.({ ok: true, data: { mode: cmd.mode === "plan" ? "plan" : "default" } });
  } };
  const toggle = () => root().querySelector(".tx-host .sv-pick > .tx-mode");
  assert.equal(toggle().textContent, "Build");
  assert.equal(toggle().getAttribute("aria-pressed"), "false");
  toggle().click();
  await new Promise((go) => setTimeout(go, 10));
  assert.deepEqual(asked, ["plan"]);
  assert.equal(e.mode, "plan");
  assert.equal(toggle().textContent, "Plan");
  assert.equal(toggle().getAttribute("aria-pressed"), "true");
  const box = root().querySelector(".tx-host .sv-composer textarea");
  box.focus();
  press("Tab", { shiftKey: true, target: box });
  await new Promise((go) => setTimeout(go, 10));
  assert.deepEqual(asked, ["plan", "normal"]);
  assert.equal(toggle().textContent, "Build");
  box.blur();
  e.agent = "codex";
  ctxOf().render();
  await new Promise((go) => setTimeout(go, 10));
  assert.equal(toggle(), null, "an agent without plan mode gets no switch");
  delete e.agent;
  e.ws = null;
});

test("clicking a card reads that seat, from any block, and the same tile moves", () => {
  rowEl("back").click();
  assert.equal(st.block, 1);
  assert.equal(selected(), "back");
  const tile = tiles.get("back");
  rowEl("quiet").click();
  assert.equal(st.block, 0);
  rowEl("back").click();
  same(tiles.get("back"), tile, "the tile is the same one");
  same(tile.parentElement, root().querySelector(".tx-host"), "the tile moved to the reading column");
  assert.match(root().querySelector(".tx-head").textContent, /oms-web/);
  assert.match(root().querySelector(".tx-head a.tx-ob-pr").getAttribute("href"), /pull\/35/);
  assert.match(root().querySelector(".tx-details").textContent, /jonas\/valores-lote/);
});

test("a PR opens beside the chat, the way T3 shows it, and the chat stays whole", async () => {
  const { diffs, talks, commits } = await app("thread");
  Object.assign(st.prs[0], { title: "valores do lote", state: "merged", author: "jonas", base: "main", branch: "jonas/valores-lote", files: 1, added: 2, removed: 1, body: "## Summary\n\nveja [o outro](https://example.com/x)", checks: [] });
  talks.set("pr35", [{ who: "mees", when: ago(5), body: "<details><summary>achados</summary>um</details>", kind: "review", verdict: "approved" }]);
  commits.set("pr35", [{ sha: "abc1234", title: "fix: lote", who: "jonas", when: ago(9) }]);
  diffs.set("pr35", [{ path: "src/lote.ts", added: 2, removed: 1, lines: [{ t: "added", a: null, d: 1, h: "const a = 1" }] }]);
  rowEl("back").click();
  root().querySelector(".tx-head a.tx-ob-pr").click();
  const panel = root().querySelector(".tx-prside");
  assert.equal(panel.hidden, false);
  same(tiles.get("back").parentElement, root().querySelector(".tx-host"), "the chat keeps its column");
  assert.equal(root().querySelector(".tx-details").hidden, true, "the PR takes the place of the details");
  assert.match(panel.querySelector(".tp-repo").textContent, /acme\/oms-web #35/);
  assert.equal(panel.querySelector(".tp-title").textContent, "valores do lote");
  assert.match(panel.querySelector(".tp-badge").className, /s-merged/);
  assert.equal(panel.querySelector(".tp-code").textContent, "gh pr checkout 35");
  assert.match(panel.querySelector(".tp-branch").textContent, /main.*jonas\/valores-lote/);
  assert.deepEqual([...panel.querySelectorAll(".tp-seg button")].map((b) => b.dataset.tab), ["summary", "timeline", "code"]);
  assert.match(panel.querySelector(".tp-ck").textContent, /No checks reported/);
  assert.match(panel.querySelector(".tp-fields").textContent, /mees/, "who reviewed shows as a reviewer");
  assert.equal(panel.querySelector(".tp-cmt .tp-md").textContent.includes("<details>"), false, "the html a bot leaves is not shown as text");
  panel.querySelector('[data-tab="timeline"]').click();
  assert.deepEqual([...panel.querySelectorAll(".tp-ev")].map((ev) => ev.textContent.includes("abc1234") ? "commit" : "review"), ["commit", "review"], "oldest first, the way it happened");
  panel.querySelector('[data-tab="code"]').click();
  assert.equal(panel.querySelector(".tp-diff"), null, "a file opens only when asked");
  panel.querySelector(".tp-fhead").click();
  assert.match(panel.querySelector(".tp-diff").textContent, /const a = 1/);
});

test("the comment being written survives the panel repainting around it", () => {
  const panel = root().querySelector(".tx-prside");
  panel.querySelector(".tp-fab").click();
  const box = panel.querySelector(".tp-text");
  box.value = "olha a linha 3";
  box.dispatchEvent(new Event("input", { bubbles: true }));
  st.prs[0].title = "valores do lote, de novo";
  render();
  same(panel.querySelector(".tp-text"), box, "the box is the same element");
  assert.equal(box.value, "olha a linha 3");
  panel.querySelector('.tp-compose [data-act="pr-compose"]').click();
});

test("a link inside the PR goes to the browser and never takes over the window", () => {
  const opened = [];
  const was = window.open;
  window.open = (url) => opened.push(url);
  const panel = root().querySelector(".tx-prside");
  panel.querySelector('[data-tab="summary"]').click();
  const link = panel.querySelector('.tp-md a[href="https://example.com/x"]');
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(ev);
  window.open = was;
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(opened, ["https://example.com/x"]);
});

test("the PR closes by its button, by escape, and by its own header button, and any PR link opens it", async () => {
  const panel = root().querySelector(".tx-prside");
  panel.querySelector('[data-act="pr-close"]').click();
  assert.equal(panel.hidden, true);
  const { goToPr } = await app("seat-menu");
  goToPr(st.prs[0]);
  assert.equal(panel.hidden, false, "a chip or a link in the chat lands in the same panel");
  assert.ok(press("Escape").defaultPrevented);
  assert.equal(panel.hidden, true);
  root().querySelector(".tx-head a.tx-ob-pr").click();
  root().querySelector(".tx-head a.tx-ob-pr").click();
  assert.equal(panel.hidden, true, "the header button toggles it");
});

test("j and k walk the list, and stay put at its ends", () => {
  rowEl("busy").click();
  assert.ok(press("j").defaultPrevented);
  assert.equal(selected(), "asks");
  press("j");
  press("j");
  press("j");
  assert.equal(selected(), "quiet");
  press("k");
  assert.equal(selected(), "back");
});

test("the jump keys open the card in that slot", () => {
  const ev = press("2", { metaKey: IS_MAC, ctrlKey: !IS_MAC });
  assert.ok(ev.defaultPrevented);
  assert.equal(selected(), "asks");
  assert.equal(rowEl("busy").querySelector(".tx-jumphint").textContent.slice(-1), "1");
});

test("j is a letter like any other while you type", () => {
  const box = tiles.get("asks").querySelector(".sv-composer textarea");
  box.focus();
  const ev = press("j", { target: box });
  assert.equal(ev.defaultPrevented, false);
  assert.equal(selected(), "asks");
  box.blur();
});

test("enter goes to the composer of the seat being read", () => {
  const ev = press("Enter");
  assert.ok(ev.defaultPrevented);
  same(document.activeElement, tiles.get("asks").querySelector(".sv-composer textarea"), "the composer has the focus");
  document.activeElement.blur();
});

test("settle moves the chat to the Settled shelf, which opens on a click and gives it back", () => {
  rowEl("back").click();
  assert.ok(press("s").defaultPrevented);
  assert.ok(marks().back.settledAt);
  assert.ok(!rows().includes("back"));
  assert.notEqual(selected(), "back");
  assert.match(shelf("settled").textContent, /^Settled1$/);
  shelf("settled").click();
  assert.ok(rows().includes("back"));
  rowEl("back").querySelector('[data-act="unsettle"]').click();
  assert.equal(marks().back, undefined);
  shelf("settled")?.click();
});

test("a chat whose PRs all landed settles by itself, and giving it back keeps it out", () => {
  assert.equal(inbox.landed([{ state: "merged" }, { state: "merged" }]), true);
  assert.equal(inbox.landed([{ state: "merged" }, { state: "open" }]), false);
  assert.equal(inbox.landed([]), false);
  st.prs[0].state = "merged";
  st.data.sessions.find((one) => one.name === "back").state = "idle";
  render();
  if (shelf("settled").classList.contains("open")) shelf("settled").click();
  assert.ok(!rows().includes("back"));
  assert.match(shelf("settled").textContent, /^Settled1$/);
  shelf("settled").click();
  assert.ok(rowEl("back").classList.contains("compact"), "a settled chat reads as one compact line, as in T3");
  rowEl("back").querySelector('[data-act="unsettle"]').click();
  assert.ok(marks().back.stayActive > 0, "giving it back keeps it out of the automatic settle");
  assert.ok(rows().includes("back"));
  st.prs[0].state = "open";
  st.data.sessions.find((one) => one.name === "back").state = "done";
  render();
});

test("p pins the chat above the rest", () => {
  rowEl("quiet").click();
  press("p");
  assert.equal(rows()[0], "quiet");
  assert.ok(rowEl("quiet").querySelector('.tx-mark'));
  press("p");
  assert.equal(marks().quiet, undefined);
  assert.equal(rows()[0], "busy");
});

test("the marks live in the hive: a pin made in another window arrives with the hive, and a stale copy does not undo a newer change", () => {
  const sent = marksSent.length;
  rowEl("quiet").click();
  press("p");
  assert.equal(marksSent.length, sent + 1, "the pin goes to the hive, not to this browser");
  assert.equal(localStorage.getItem("hive.inbox.marks"), null);
  const stale = { quiet: { at: 1 } };
  st.data = { ...st.data, marks: stale };
  render();
  assert.equal(rows()[0], "quiet", "a copy older than the pin does not unpin it");
  press("p");
  st.data = { ...st.data, marks: { busy: { pinnedAt: 1, at: Date.now() - 1 } } };
  render();
  assert.equal(rows()[0], "busy", "a pin made elsewhere shows here");
  assert.ok(rowEl("busy").querySelector(".tx-mark"));
  rowEl("busy").click();
  press("p");
  assert.equal(marks().busy, undefined);
  st.data = { ...st.data, marks: readMarks(markHome) };
  render();
  assert.equal(rows()[0], "busy");
  assert.equal(rowEl("busy").querySelector(".tx-mark"), null);
});

test("snoozing from the card menu hides the chat until its time, under its own shelf", () => {
  rowEl("asks").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  const item = root().querySelector('.tx-menu [data-mi="snooze:o0"]');
  assert.ok(item, "the menu offers the snooze presets");
  item.click();
  assert.ok(marks().asks.snoozeUntil > Date.now());
  assert.ok(!rows().includes("asks"));
  assert.match(shelf("snoozed").textContent, /^Snoozed1$/);
  shelf("snoozed").click();
  rowEl("asks").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  root().querySelector('.tx-menu [data-mi="unsnooze"]').click();
  assert.equal(marks().asks, undefined);
  assert.ok(rows().includes("asks"));
});

test("Custom… opens T3's dialog: a date and time, or a duration, and the chat sleeps until then", () => {
  rowEl("asks").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  const presets = [...root().querySelectorAll('.tx-menu [data-mi^="snooze:"]')];
  assert.ok(presets.every((one) => one.dataset.mi === "snooze:custom" || one.querySelector(".tx-mhint")?.textContent), "each preset shows when it wakes");
  root().querySelector('.tx-menu [data-mi="snooze:custom"]').click();
  const dialog = root().querySelector(".snz-dialog");
  assert.ok(dialog);
  assert.match(dialog.textContent, /Custom snooze/);
  same(document.activeElement, dialog.querySelector('input[name="date"]'), "the date takes the focus");
  dialog.querySelector('input[name="time"]').value = "00:00";
  dialog.querySelector('input[name="date"]').value = "2020-01-01";
  dialog.querySelector(".snz-btn.primary").click();
  assert.match(dialog.querySelector(".snz-err").textContent, /valid date and time in the future/);
  assert.equal(dialog.querySelector(".snz-err").hidden, false);
  assert.ok(rows().includes("asks"), "a refused date snoozes nothing");
  dialog.querySelector('[data-mode="duration"]').click();
  assert.equal(dialog.querySelector('[data-for="date"]').hidden, true);
  assert.equal(dialog.querySelector(".snz-err").hidden, true);
  dialog.querySelector('input[name="amount"]').value = "3";
  dialog.querySelector('select[name="unit"]').value = "days";
  const before = Date.now();
  dialog.querySelector(".snz-btn.primary").click();
  assert.equal(root().querySelector(".snz-dialog"), null);
  const until = marks().asks.snoozeUntil;
  assert.ok(until >= before + 3 * 86400000 && until <= Date.now() + 3 * 86400000);
  assert.match(shelf("snoozed").textContent, /^Snoozed1$/);
  assert.ok(!rows().includes("asks") || rowEl("asks").closest(".tx-shelves"), "it left the active list");
  const opened = shelf("snoozed").classList.contains("open");
  if (!opened) shelf("snoozed").click();
  rowEl("asks").querySelector('[data-act="unsnooze"]').click();
  assert.equal(marks().asks, undefined);
  if (!opened) shelf("snoozed")?.click();
});

test("Escape and Cancel close the custom snooze without snoozing", () => {
  rowEl("asks").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  root().querySelector('.tx-menu [data-mi="snooze:custom"]').click();
  const box = root().querySelector('.snz-dialog input[name="date"]');
  assert.ok(press("Escape", { target: box }).defaultPrevented);
  assert.equal(root().querySelector(".snz-dialog"), null);
  rowEl("asks").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  root().querySelector('.tx-menu [data-mi="snooze:custom"]').click();
  assert.equal(press("j", { target: root().querySelector('.snz-dialog [data-mode="date"]') }).defaultPrevented, false, "keys belong to the dialog while it is open");
  root().querySelector('.snz-dialog [data-snz="cancel"]').click();
  assert.equal(root().querySelector(".snz-dialog"), null);
  assert.equal(marks().asks, undefined);
  assert.ok(rows().includes("asks"));
});

test("the search narrows the cards by title, project and branch", () => {
  const q = root().querySelector(".tx-q");
  q.value = "oms";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(rows(), ["back"]);
  q.value = "";
  q.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(rows(), ["busy", "asks", "back", "quiet"]);
});

test("reply and go to the next sends the words and opens the next one waiting on you", () => {
  rowEl("asks").click();
  const box = tiles.get("asks").querySelector(".sv-composer textarea");
  let sent = 0;
  box.closest("form").addEventListener("submit", () => { sent += 1; }, { once: true });
  box.focus();
  box.value = "pode tocar";
  const ev = press("Enter", { target: box, metaKey: IS_MAC, ctrlKey: !IS_MAC });
  assert.ok(ev.defaultPrevented);
  assert.equal(sent, 1);
  assert.equal(selected(), "back");
  same(tiles.get("back").parentElement, root().querySelector(".tx-host"), "the next seat is read");
});

test("with nothing written, the combination is left to the app", () => {
  const box = tiles.get("back").querySelector(".sv-composer textarea");
  let sent = 0;
  const count = () => { sent += 1; };
  box.closest("form").addEventListener("submit", count);
  box.focus();
  box.value = "";
  const taken = inbox.keydown(new KeyboardEvent("keydown", { key: "Enter", metaKey: IS_MAC, ctrlKey: !IS_MAC }), ctxOf());
  box.closest("form").removeEventListener("submit", count);
  box.blur();
  assert.equal(taken, false);
  assert.equal(sent, 0);
  assert.equal(selected(), "back");
});

test("on a new chat, mod+enter belongs to the draft: it is not taken as reply and go to the next", async () => {
  const { discardDraft, openDraft } = await app("draft-seat");
  const d = openDraft();
  const box = d.e.host.querySelector("textarea");
  let sent = 0;
  const count = () => { sent += 1; };
  box.closest("form").addEventListener("submit", count);
  box.value = "conserta o retry";
  const taken = inbox.keydown(new KeyboardEvent("keydown", { key: "Enter", metaKey: IS_MAC, ctrlKey: !IS_MAC }), ctxOf());
  box.closest("form").removeEventListener("submit", count);
  box.value = "";
  assert.equal(taken, false);
  assert.equal(sent, 0, "the inbox sent the draft as a plain reply, so it could never start in the background");
  assert.equal(selected(), d.key);
  box.blur();
  discardDraft(d);
  lay();
});

test("e archives the seat being read with the archive that already exists, and the next one is read", async () => {
  rowEl("back").click();
  archived.length = 0;
  assert.ok(press("e").defaultPrevented);
  await new Promise((go) => setTimeout(go, 0));
  assert.deepEqual(archived, ["back"]);
  assert.equal(selected(), "quiet");
});

test("a seat of the team is read as a card that opens their hive", () => {
  shelf("team").click();
  rowEl("team:k-mees:x").click();
  assert.match(root().querySelector(".tx-pick").textContent, /rodando a suíte/);
  assert.ok(root().querySelector('.tx-pick [data-act="team"][data-machine="k-mees"]'));
  assert.equal(root().querySelector(".tx-host").hidden, true);
  shelf("team").click();
});

test("the archived chats sit on their own shelf, and reopen through the archive that already exists", async () => {
  st.data.archived = [{ name: "velho", where: "local", title: "chat antigo", model: "opus", cwd: "/x/oms-web", archivedAt: Date.now() - 3600000 }];
  render();
  assert.match(shelf("archived").textContent, /^Archived1$/);
  shelf("archived").click();
  const row = root().querySelector('.tx-row.compact[data-arch="velho"]');
  assert.match(row.textContent, /chat antigo/);
  assert.equal(row.querySelector(".tx-fav").textContent, "OW");
  const asked = [];
  const before = globalThis.fetch;
  globalThis.fetch = (url, init) => { if (String(url).includes("/api/seat/unarchive")) asked.push(JSON.parse(init.body)); return before(url, init); };
  row.querySelector('[data-act="revive"]').click();
  await new Promise((go) => setTimeout(go, 0));
  assert.deepEqual(asked, [{ name: "velho", where: "local" }]);
  asked.length = 0;
  assert.ok(press("T", { shiftKey: true, metaKey: IS_MAC, ctrlKey: !IS_MAC }).defaultPrevented);
  await new Promise((go) => setTimeout(go, 0));
  globalThis.fetch = before;
  st.data.archived = [];
  shelf("archived")?.click();
  render();
});

test("leaving gives every tile back to the classic", () => {
  setStructure("classic", { quiet: true });
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal(root().children.length, 0);
  same(tiles.get(st.blocks[st.block].keys[st.focus]).parentElement, $("canvas"), "the classic took the tile back");
  assert.equal(press("j").defaultPrevented, false);
  localStorage.removeItem("hive.inbox.marks");
  localStorage.removeItem("hive.inbox.shelves");
});

test("the first load moves the marks this browser held to the hive, keeps what the hive already had, and clears the browser only after the hive took them", async () => {
  rmSync(join(markHome, "inbox-marks.json"), { force: true });
  forgetMarksCache();
  keepMarks(markHome, { asks: { pinnedAt: 5, at: Date.now() + 60000 } });
  localStorage.setItem("hive.inbox.marks", JSON.stringify({ quiet: { pinnedAt: 2 }, asks: { settledAt: 9 }, back: {} }));
  st.data = { ...st.data, marks: readMarks(markHome) };
  setStructure("inbox", { quiet: true });
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(marksSent.at(-1).moving, true);
  assert.deepEqual(Object.keys(marks()).sort(), ["asks", "quiet"]);
  assert.equal(marks().quiet.pinnedAt, 2);
  assert.equal(marks().asks.settledAt, undefined, "the hive's own mark wins over the browser's");
  assert.equal(localStorage.getItem("hive.inbox.marks"), null);
  assert.deepEqual(rows().slice(0, 2).sort(), ["asks", "quiet"]);
  const sent = marksSent.length;
  setStructure("classic", { quiet: true });
  setStructure("inbox", { quiet: true });
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(marksSent.length, sent, "once moved, nothing is moved again");
  setStructure("classic", { quiet: true });
});

test("a hive that keeps no marks leaves them in this browser, and the browser keeps every one until the hive can take them", async () => {
  const { marks: _, ...rest } = st.data;
  st.data = rest;
  localStorage.removeItem("hive.inbox.marks");
  const sent = marksSent.length;
  setStructure("inbox", { quiet: true });
  rowEl("quiet").click();
  if (rowEl("quiet").querySelector(".tx-unpin")) press("p");
  press("p");
  assert.equal(marksSent.length, sent);
  assert.ok(JSON.parse(localStorage.getItem("hive.inbox.marks")).quiet.pinnedAt);
  const answering = globalThis.fetch;
  globalThis.fetch = (url, init) => (String(url).includes("/api/inbox/marks") ? Promise.resolve({ ok: false, status: 404, json: async () => ({}) }) : answering(url, init));
  st.data = { ...st.data, marks: {} };
  render();
  await new Promise((go) => setTimeout(go, 0));
  assert.ok(JSON.parse(localStorage.getItem("hive.inbox.marks")).quiet.pinnedAt, "a hive that refused the move does not cost the browser its marks");
  globalThis.fetch = answering;
  st.data = { ...st.data, marks: {} };
  render();
  await new Promise((go) => setTimeout(go, 0));
  assert.equal(localStorage.getItem("hive.inbox.marks"), null, "the next word from the hive tries the move again");
  assert.ok(marks().quiet.pinnedAt);
  setStructure("classic", { quiet: true });
});

test("with the Working section on, a chat at work waits in its own shelf and comes back when it stops", () => {
  setStructure("inbox", { quiet: true });
  st.threadRules = { ...st.threadRules, workingSection: true };
  render();
  assert.ok(!rows().includes("busy"), "the busy chat leaves the active list");
  assert.match(shelf("working").textContent, /^Working1$/);
  st.data.sessions.find((one) => one.name === "busy").state = "done";
  render();
  assert.ok(rows().includes("busy"));
  assert.equal(shelf("working"), null);
  st.data.sessions.find((one) => one.name === "busy").state = "working";
  st.threadRules = { ...st.threadRules, workingSection: false };
  setStructure("classic", { quiet: true });
});
