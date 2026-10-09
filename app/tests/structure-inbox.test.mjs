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
  asks: { state: "needs", title: "sessao crm expirada", trees: [{ repo: "crm-web", branch: "jonas/sessao-expirada" }], finish: { seq: 2, at: ago(2), text: "Achei por que a **sessão** cai.\n\n- item 1\n- item 2\n\nJá posso abrir PR do item 1 no `crm-web`?" } },
  busy: { state: "working", title: "hive raycast visual", now: "Integração bate com o canvas nos dois visuais.", verb: "Bash", measure: "15ms", liveSince: ago(0) },
  back: { state: "done", title: "valores incoerentes", trees: [{ repo: "oms-web", branch: "jonas/valores-lote" }], finish: { seq: 3, at: ago(6), text: "Não é bug de cálculo: o Pipeline soma o prometido.\n\nOs outros dois lotes batem." } }
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
  st.prs = [{ session: "back", repo: "acme/oms-web", number: 35, ci: "failed", url: "https://github.com/acme/oms-web/pull/35", key: "pr35" }];
  st.team = { me: "juno", devs: [{ dev: "juno", key: "k-me", seats: [] }, { dev: "mees", key: "k-mees", up: true, seats: [{ name: "x", title: "fila do time", state: "working", now: "rodando a suíte" }] }] };
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
const marks = () => JSON.parse(localStorage.getItem("hive.inbox.marks") || "{}");
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

test("a chat is snoozed until its time, then settled, then pinned, else active", () => {
  const now = 1000;
  assert.equal(inbox.sectionOf({ snoozeUntil: 2000, pinnedAt: 1 }, now), "snoozed");
  assert.equal(inbox.sectionOf({ snoozeUntil: 500 }, now), "active");
  assert.equal(inbox.sectionOf({ settledAt: 1, pinnedAt: 1 }, now), "settled");
  assert.equal(inbox.sectionOf({ pinnedAt: 1 }, now), "pinned");
  assert.equal(inbox.sectionOf({}, now), "active");
});

test("a snooze that ran out wakes the chat, and new words from a settled chat bring it back", () => {
  const seats = [{ key: "a", state: "idle" }, { key: "b", state: "needs", finish: { at: new Date(5000).toISOString() } }];
  const kept = { a: { snoozeUntil: 900 }, b: { settledAt: 4000 } };
  assert.equal(inbox.settleMarks(kept, seats, 1000), true);
  assert.deepEqual(kept, { a: { wokeAt: 1000 } });
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
  assert.match(ask.title, /Já posso abrir PR do item 1/);
  assert.match(rowEl("busy").querySelector(".tx-st").textContent, /Working\d+s/);
  assert.ok(rowEl("busy").querySelector(".tx-dur[data-t0]"));
  assert.match(rowEl("back").querySelector(".tx-st").textContent, /Finished/);
  assert.match(rowEl("back").querySelector(".tx-prb.fail").textContent, /#35/);
  assert.match(rowEl("quiet").querySelector(".tx-st").textContent, /^\d+d$/);
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
  assert.match(shelf("settled").textContent, /Settled \(1\)/);
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
  assert.match(shelf("settled").textContent, /Settled \(1\)/);
  shelf("settled").click();
  assert.ok(rowEl("back").classList.contains("compact"), "a settled chat reads as one compact line, as in T3");
  rowEl("back").querySelector('[data-act="unsettle"]').click();
  assert.equal(marks().back.stayActive, true);
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

test("snoozing from the card menu hides the chat until its time, under its own shelf", () => {
  rowEl("asks").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  const item = root().querySelector('.tx-menu [data-mi="snooze:1h"]');
  assert.ok(item, "the menu offers the snooze presets");
  item.click();
  assert.ok(marks().asks.snoozeUntil > Date.now());
  assert.ok(!rows().includes("asks"));
  assert.match(shelf("snoozed").textContent, /Snoozed \(1\)/);
  shelf("snoozed").click();
  rowEl("asks").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  root().querySelector('.tx-menu [data-mi="unsnooze"]').click();
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
  assert.match(shelf("archived").textContent, /Archived \(1\)/);
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
