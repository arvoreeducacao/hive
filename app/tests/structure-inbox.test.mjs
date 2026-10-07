import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const archived = [];
let hive = null;
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  if (String(url).includes("/api/seat/archive")) archived.push(JSON.parse(init.body).name);
  if (String(url).includes("/api/hive") && hive) return Promise.resolve(answered(JSON.parse(JSON.stringify(hive.data))));
  return Promise.resolve(answered({ sessions: [], ok: true }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
hive = st;
const { $, IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { setStructure, structureWorn } = await app("structure");
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
  asks: { state: "needs", title: "sessao crm expirada", trees: [{ repo: "arvore-crm-web", branch: "joao/sessao-expirada" }], finish: { seq: 2, at: ago(2), text: "Achei por que a **sessão** cai.\n\n- item 1\n- item 2\n\nJá posso abrir PR do item 1 no `arvore-crm-web`?" } },
  busy: { state: "working", title: "hive raycast visual", now: "Integração bate com o canvas nos dois visuais.", verb: "Bash", measure: "15ms", liveSince: ago(0) },
  back: { state: "done", title: "valores incoerentes", trees: [{ repo: "oms-web", branch: "joao/valores-lote" }], finish: { seq: 3, at: ago(6), text: "Não é bug de cálculo: o Pipeline soma o prometido.\n\nOs outros dois lotes batem." } }
};

function lay() {
  const names = Object.keys(SEATS);
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map((name) => ({ name, where: "local", kind: "chat", structured: true, model: "Opus 5.5", ...SEATS[name] })), spawning: [], archived: [], pod: { up: false, name: "" } };
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
  st.prs = [{ session: "back", repo: "arvoreeducacao/oms-web", number: 35, ci: "failed", url: "https://github.com/arvoreeducacao/oms-web/pull/35", key: "pr35" }];
  st.team = { me: "jott4", devs: [{ dev: "jott4", key: "k-me", seats: [] }, { dev: "mees", key: "k-mees", up: true, seats: [{ name: "x", title: "fila do time", state: "working", now: "rodando a suíte" }] }] };
  render();
}

const rows = () => [...$("structure-root").querySelectorAll(".ix-row")].map((el) => el.dataset.key);
const selected = () => $("structure-root").querySelector(".ix-row.sel")?.dataset.key;
const press = (key, extra = {}) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  (extra.target || document.body).dispatchEvent(ev);
  return ev;
};
const same = (a, b, said) => assert.ok(a === b, said);
const view = (id) => $("structure-root").querySelector(`[data-view="${id}"]`);

lay();

test("the inbox is built and says it is ready", () => {
  assert.equal(inbox.id, "inbox");
  assert.equal(inbox.ready, true);
});

test("the last words of a seat come from what it left: the question when it asks, the lead when it answered, the status while it works", () => {
  assert.equal(inbox.lastWords({ state: "needs", finish: SEATS.asks.finish }), "Já posso abrir PR do item 1 no arvore-crm-web?");
  assert.equal(inbox.lastWords({ state: "needs", asks: [{ id: "a", questions: [{ question: "Qual escola?" }] }], finish: SEATS.asks.finish }), "Qual escola?");
  assert.equal(inbox.lastWords({ state: "done", finish: SEATS.back.finish }), "Não é bug de cálculo: o Pipeline soma o prometido.");
  assert.equal(inbox.lastWords({ state: "working", now: "rodando a suíte", finish: SEATS.back.finish }), "rodando a suíte");
  assert.equal(inbox.lastWords({ state: "idle", description: "toda hora eu tenho que logar" }), "toda hora eu tenho que logar");
  assert.equal(inbox.lastWords({ state: "idle" }), "");
  assert.ok(inbox.lastWords({ state: "done", finish: { text: "a ".repeat(400) } }).length <= 240);
});

test("the states fall into four groups, in the order of who needs you", () => {
  assert.deepEqual(["needs", "answered", "done", "working", "stalled", "ready", "idle"].map(inbox.groupOf), ["needs", "back", "back", "busy", "busy", "rest", "rest"]);
});

test("entering wears the inbox: the queue holds every seat of every block, ordered by who needs you", () => {
  setStructure("inbox", { quiet: true });
  assert.equal(structureWorn(), "inbox");
  assert.equal(document.body.dataset.structure, "inbox");
  assert.deepEqual(rows(), ["asks", "back", "busy", "quiet"]);
  const groups = [...$("structure-root").querySelectorAll(".ix-group")].map((el) => el.textContent.replace(/\d+$/, ""));
  assert.deepEqual(groups, ["Asking for you", "Answered", "Working", "Ready and still"]);
  const ask = $("structure-root").querySelector('.ix-row[data-key="asks"]');
  assert.match(ask.textContent, /Já posso abrir PR do item 1/);
  assert.match(ask.textContent, /arvore-crm-web/);
  assert.match(ask.textContent, /joao\/sessao-expirada/);
  assert.match(ask.querySelector(".ix-time").textContent, /^2m$/);
  const back = $("structure-root").querySelector('.ix-row[data-key="back"]');
  assert.match(back.querySelector(".pr.fail").textContent, /oms-web#35/);
  assert.match($("structure-root").querySelector('.ix-row[data-key="busy"] .live').textContent, /Bash 15ms/);
});

test("the filters count what they hold, and the views count the team and the failing PRs", () => {
  const n = (id) => view(id).querySelector(".n").textContent;
  assert.equal(n("needs"), "1");
  assert.ok(view("needs").classList.contains("hot"));
  assert.equal(n("back"), "1");
  assert.equal(n("busy"), "1");
  assert.equal(n("all"), "4");
  assert.equal(n("team"), "1");
  assert.equal(n("prs"), "1 failing");
});

test("a filter narrows the queue, and an empty one says so", () => {
  view("needs").click();
  assert.deepEqual(rows(), ["asks"]);
  assert.equal($("structure-root").querySelector(".ix-lhead h2").textContent, "Asking for you");
  view("prs").click();
  assert.deepEqual(rows(), ["back"]);
  view("block:b1").click();
  assert.deepEqual(rows(), ["back", "busy"]);
  view("team").click();
  assert.deepEqual(rows(), ["team:k-mees:x"]);
  view("all").click();
  assert.deepEqual(rows(), ["asks", "back", "busy", "quiet"]);
});

test("the focused seat is read in the column, with its real tile, and the rest stays off the screen", () => {
  assert.equal(selected(), "quiet");
  const host = $("structure-root").querySelector(".ix-host");
  same(tiles.get("quiet").parentElement, host, "the focused seat is in the reading column");
  same(tiles.get("asks").parentElement, $("canvas"), "a seat nobody reads stays on the canvas");
  assert.equal($("structure-root").querySelector(".ix-title h1").textContent, "revisor diario");
});

test("clicking a row reads that seat, from any block, and the same tile moves", () => {
  $("structure-root").querySelector('.ix-row[data-key="back"]').click();
  assert.equal(st.block, 1);
  assert.equal(selected(), "back");
  const tile = tiles.get("back");
  $("structure-root").querySelector('.ix-row[data-key="quiet"]').click();
  assert.equal(st.block, 0);
  $("structure-root").querySelector('.ix-row[data-key="back"]').click();
  same(tiles.get("back"), tile, "the tile is the same one");
  same(tile.parentElement, $("structure-root").querySelector(".ix-host"), "the tile moved to the reading column");
  assert.match($("structure-root").querySelector(".ix-rhead").textContent, /oms-web/);
  assert.match($("structure-root").querySelector(".ix-rhead a").getAttribute("href"), /pull\/35/);
});

test("j and k walk the queue, and stay put at its ends", () => {
  $("structure-root").querySelector('.ix-row[data-key="asks"]').click();
  assert.ok(press("j").defaultPrevented);
  assert.equal(selected(), "back");
  press("j");
  press("j");
  press("j");
  assert.equal(selected(), "quiet");
  press("k");
  assert.equal(selected(), "busy");
});

test("j is a letter like any other while you type", () => {
  const box = tiles.get("busy").querySelector(".sv-composer textarea");
  box.focus();
  const ev = press("j", { target: box });
  assert.equal(ev.defaultPrevented, false);
  assert.equal(selected(), "busy");
  box.blur();
});

test("enter goes to the composer of the seat being read", () => {
  const ev = press("Enter");
  assert.ok(ev.defaultPrevented);
  same(document.activeElement, tiles.get("busy").querySelector(".sv-composer textarea"), "the composer has the focus");
  document.activeElement.blur();
});

test("reply and go to the next sends the words and opens the next one waiting on you", () => {
  $("structure-root").querySelector('.ix-row[data-key="asks"]').click();
  assert.match($("structure-root").querySelector(".ix-next").textContent, /valores incoerentes/);
  const box = tiles.get("asks").querySelector(".sv-composer textarea");
  let sent = 0;
  box.closest("form").addEventListener("submit", () => { sent += 1; }, { once: true });
  box.focus();
  box.value = "pode tocar";
  const ev = press("Enter", { target: box, metaKey: IS_MAC, ctrlKey: !IS_MAC });
  assert.ok(ev.defaultPrevented);
  assert.equal(sent, 1);
  assert.equal(selected(), "back");
  same(tiles.get("back").parentElement, $("structure-root").querySelector(".ix-host"), "the next seat is read");
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

test("e archives the seat being read with the archive that already exists, and the next one is read", async () => {
  $("structure-root").querySelector('.ix-row[data-key="back"]').click();
  archived.length = 0;
  assert.ok(press("e").defaultPrevented);
  await new Promise((go) => setTimeout(go, 0));
  assert.deepEqual(archived, ["back"]);
  assert.equal(selected(), "busy");
});

test("a seat of the team is read as a card that opens their hive", () => {
  view("team").click();
  $("structure-root").querySelector('.ix-row[data-key="team:k-mees:x"]').click();
  assert.match($("structure-root").querySelector(".ix-pick").textContent, /rodando a suíte/);
  assert.ok($("structure-root").querySelector('.ix-pick [data-act="team"][data-machine="k-mees"]'));
  assert.equal($("structure-root").querySelector(".ix-host").children.length, 0);
  view("all").click();
});

test("leaving gives every tile back to the classic", () => {
  setStructure("classic", { quiet: true });
  assert.equal(document.body.dataset.structure, "classic");
  assert.equal($("structure-root").children.length, 0);
  same(tiles.get(st.blocks[st.block].keys[st.focus]).parentElement, $("canvas"), "the classic took the tile back");
  assert.equal(press("j").defaultPrevented, false);
});
