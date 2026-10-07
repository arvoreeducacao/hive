import { after, test } from "node:test";
import assert from "node:assert/strict";
import { PT_BR } from "../assets/i18n.mjs";
import { app, state } from "./dom.mjs";

const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ sessions: [] }), text: async () => "{}" });
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { setStructure, structureWorn } = await app("structure");
const { ember, emberModel } = await import(new URL("../src/structures/ember.js", import.meta.url).href);

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const seat = (name, state = "idle", extra = {}) => ({ name, title: name, where: "local", state, kind: "chat", ...extra });

function lay(blocks, states = {}) {
  const names = blocks.flat();
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map((name) => seat(name, states[name])), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = blocks.map((keys, i) => ({ id: `b${i}`, ws: "w0", label: i ? "second" : "", manual: true, keys: [...keys] }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.threadChat = null;
  st.reviewChat = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threads = [];
  st.prs = [];
  st.team = { me: "me", here: "me@mac", sharing: true, machines: false, devs: [{ key: "ana@pod", dev: "ana", machine: "pod", seats: [{ name: "x" }, { name: "y" }], up: true }, { key: "bia@pod", dev: "bia", machine: "pod", seats: [], up: true }] };
  render();
}

const press = (init) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
};

const mod = IS_MAC ? { metaKey: true } : { ctrlKey: true };

const ROW = (key, state, block, at, more = {}) => ({ key, name: key, title: key, kind: "session", state, block, at, here: block === 0, ...more });

test("the page is the seat in focus, and the queue is the rest of the block plus whoever needs you elsewhere", () => {
  const seats = [ROW("far", "needs", 1, 0), ROW("ask", "needs", 0, 2), ROW("run", "working", 0, 1), ROW("me", "ready", 0, 0), ROW("calm", "idle", 1, 1)];
  const model = emberModel({ seats, focused: "run", block: 0 });
  assert.equal(model.page.key, "run");
  assert.equal(model.page.at, 1);
  assert.deepEqual(model.cards.map((one) => one.key), ["far", "ask", "me"]);
  assert.equal(model.others, 3);
  assert.deepEqual(model.cards.map((one) => [one.asks, one.away]), [[true, true], [true, false], [false, false]]);
  assert.equal(model.cards[0].at, -1, "a seat of another block has no ⌘ number here");
});

test("without a seat in focus the page falls back to the first of the block, and an empty block has no page", () => {
  const seats = [ROW("b", "working", 0, 1), ROW("a", "ready", 0, 0)];
  assert.equal(emberModel({ seats, focused: null, block: 0 }).page.key, "b");
  const none = emberModel({ seats: [], focused: null, block: 0 });
  assert.equal(none.page, null);
  assert.deepEqual(none.cards, []);
});

test("only the card that needs you carries quick answers, and the last thing said beats the empty status", () => {
  const seats = [ROW("ask", "needs", 0, 1, { when: "4 min" }), ROW("done", "done", 0, 2, { description: "the brief" }), ROW("page", "ready", 0, 0)];
  const heard = (one) => ({ text: one.key === "ask" ? "Open the PR?" : "", answers: ["Yes, open", "Both", "Diff first", "Later"].slice(0, 3) });
  const model = emberModel({ seats, focused: "page", block: 0, cursor: "done", heard });
  const [ask, done] = model.cards;
  assert.deepEqual(ask.answers, ["Yes, open", "Both", "Diff first"]);
  assert.equal(ask.text, "Open the PR?");
  assert.equal(ask.when, "4 min");
  assert.deepEqual(done.answers, []);
  assert.equal(done.text, "the brief");
  assert.deepEqual(model.cards.map((one) => one.picked), [false, true]);
});

test("ember is ready and speaks portuguese", () => {
  assert.equal(ember.id, "ember");
  assert.equal(ember.ready, true);
  for (const line of ["The other {n}", "Nobody else", "bring to the page", "switch", "switch block", "{n} in the background", "no seats here yet", "open a chat and it becomes the page; the rest line up on the right", "every other seat of this block shows up here, the one that needs you on top"]) {
    assert.ok(PT_BR[line], `"${line}" is not translated`);
  }
});

test("entering puts the real tile on the page, the others as cards, the other blocks below and the team in the foot", () => {
  lay([["a", "b", "c"], ["d"]], { b: "needs", c: "working", d: "needs" });
  const tileOfA = tiles.get("a");
  setStructure("ember", { quiet: true });
  assert.equal(structureWorn(), "ember");
  const root = $("structure-root");
  assert.equal(root.querySelector(".em-title").textContent, "a");
  assert.equal(tiles.get("a"), tileOfA, "the tile is the same one, moved");
  assert.equal(tileOfA.parentElement, root.querySelector(".em-tile"));
  const cards = [...root.querySelectorAll(".em-card")];
  assert.deepEqual(cards.map((one) => one.dataset.key), ["b", "d", "c"]);
  assert.ok(cards[0].classList.contains("needs"));
  assert.ok(cards[0].querySelector(".em-strip"), "the card that needs you wears the coral strip");
  assert.ok(cards[1].querySelector(".em-away"), "a seat of another block says where it is");
  assert.equal(cards[2].querySelector(".em-strip"), null);
  assert.equal(root.querySelector(".em-qhead h3").textContent, "The other 3");
  assert.deepEqual([...root.querySelectorAll(".em-next")].map((one) => one.dataset.block), ["1"]);
  const team = $("foot").querySelector(".em-team");
  assert.ok(team, "the team rides in the foot");
  assert.deepEqual([...team.querySelectorAll(".em-mate")].map((one) => one.dataset.dev), ["ana@pod", "bia@pod"]);
  assert.equal(team.querySelector(".em-mate b").textContent, "2");
  setStructure("classic", { quiet: true });
  assert.equal($("foot").querySelector(".em-team"), null, "leaving takes the team strip out of the foot");
  assert.equal(tileOfA.parentElement, $("canvas"));
});

test("painting again reuses the cards instead of rebuilding them", () => {
  lay([["a", "b", "c"]], { b: "working" });
  setStructure("ember", { quiet: true });
  const before = [...$("structure-root").querySelectorAll(".em-card")];
  render();
  const again = [...$("structure-root").querySelectorAll(".em-card")];
  assert.deepEqual(again, before);
  setStructure("classic", { quiet: true });
});

test("clicking a card brings that seat to the page", () => {
  lay([["a", "b", "c"]], { c: "working" });
  setStructure("ember", { quiet: true });
  $("structure-root").querySelector('.em-card[data-key="c"]').click();
  assert.equal(st.focus, 2);
  assert.equal($("structure-root").querySelector(".em-title").textContent, "c");
  assert.equal(tiles.get("c").parentElement, $("structure-root").querySelector(".em-tile"));
  assert.equal(tiles.get("a").parentElement, $("canvas"), "the seat that left the page goes back to the canvas");
  setStructure("classic", { quiet: true });
});

test("the mod arrows walk the queue and return brings the picked card to the page", () => {
  lay([["a", "b", "c"]]);
  setStructure("ember", { quiet: true });
  const root = $("structure-root");
  assert.equal(press({ key: "ArrowDown", code: "ArrowDown", ...mod }).defaultPrevented, true);
  assert.equal(root.querySelector(".em-card.picked").dataset.key, "b");
  press({ key: "ArrowDown", code: "ArrowDown", ...mod });
  press({ key: "ArrowDown", code: "ArrowDown", ...mod });
  assert.equal(root.querySelector(".em-card.picked").dataset.key, "c", "the cursor stops at the end of the queue");
  press({ key: "ArrowUp", code: "ArrowUp", ...mod });
  assert.equal(root.querySelector(".em-card.picked").dataset.key, "b");
  assert.equal(press({ key: "Enter", code: "Enter" }).defaultPrevented, true);
  assert.equal(root.querySelector(".em-title").textContent, "b");
  assert.equal(root.querySelector(".em-card.picked"), null);
  assert.equal(ember.keydown(new KeyboardEvent("keydown", { key: "Enter", code: "Enter" }), { onPlane: () => false, inField: () => false }), false, "without a picked card return is the app's again");
  setStructure("classic", { quiet: true });
});

test("escape drops the cursor, and nothing is taken while typing in a field", () => {
  lay([["a", "b"]]);
  setStructure("ember", { quiet: true });
  const root = $("structure-root");
  press({ key: "ArrowDown", code: "ArrowDown", ...mod });
  assert.ok(root.querySelector(".em-card.picked"));
  assert.equal(press({ key: "Escape", code: "Escape" }).defaultPrevented, true);
  assert.equal(root.querySelector(".em-card.picked"), null);
  const box = $("cmp-in");
  box.focus();
  assert.equal(press({ key: "ArrowDown", code: "ArrowDown", ...mod }).defaultPrevented, false);
  box.blur();
  setStructure("classic", { quiet: true });
});

function askIn(key, labels) {
  const card = document.createElement("div");
  card.className = "sv-q";
  const step = document.createElement("div");
  step.className = "qstep";
  const clicked = [];
  for (const label of labels) {
    const btn = document.createElement("button");
    btn.className = "qo";
    btn.innerHTML = `<span class="qol">${label}</span>`;
    btn.addEventListener("click", () => clicked.push(label));
    step.append(btn);
  }
  const next = document.createElement("button");
  next.className = "qnext";
  next.addEventListener("click", () => clicked.push("sent"));
  card.append(step, next);
  const host = document.createElement("div");
  host.className = "sv-scroll";
  host.append(card);
  tiles.get(key).append(host);
  return { clicked, remove: () => host.remove() };
}

test("the card that needs you shows its answers 1–3, and a digit or a click answers it without leaving the page", () => {
  lay([["a", "b"]], { b: "needs" });
  render();
  const asked = askIn("b", ["Yes, open", "Both together", "Diff first", "Later"]);
  setStructure("ember", { quiet: true });
  const root = $("structure-root");
  const quick = [...root.querySelectorAll('.em-card[data-key="b"] .em-q')];
  assert.deepEqual(quick.map((one) => one.textContent), ["1Yes, open", "2Both together", "3Diff first"]);
  assert.equal(press({ key: "2", code: "Digit2" }).defaultPrevented, true);
  assert.deepEqual(asked.clicked, ["Both together", "sent"]);
  quick[0].click();
  assert.deepEqual(asked.clicked.slice(2), ["Yes, open", "sent"]);
  assert.equal(root.querySelector(".em-title").textContent, "a", "answering from the queue keeps the page where it was");
  assert.equal(press({ key: "7", code: "Digit7" }).defaultPrevented, false, "a digit past the answers is the app's");
  asked.remove();
  setStructure("classic", { quiet: true });
});

test("the row of another block switches to it, and its first seat becomes the page", () => {
  lay([["a"], ["d"]]);
  setStructure("ember", { quiet: true });
  $("structure-root").querySelector('.em-next[data-block="1"]').click();
  assert.equal(st.block, 1);
  assert.equal($("structure-root").querySelector(".em-title").textContent, "d");
  setStructure("classic", { quiet: true });
});

test("an empty block says so instead of leaving a blank page", () => {
  lay([[]]);
  setStructure("ember", { quiet: true });
  const root = $("structure-root");
  assert.equal(root.querySelector(".em-title").textContent, "no seats here yet");
  assert.equal(root.querySelector(".em-empty").hidden, false);
  assert.equal(root.querySelectorAll(".em-card").length, 0);
  assert.equal(root.querySelector(".em-calm").hidden, false);
  setStructure("classic", { quiet: true });
});
