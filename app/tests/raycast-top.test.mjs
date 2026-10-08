import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { app, state, views } from "./dom.mjs";

const DOCTOR_CORE = new URL("../doctor/doctor-core.mjs", import.meta.url).href;
registerHooks({ resolve: (spec, context, next) => next(spec === "/assets/doctor-core.mjs" ? DOCTOR_CORE : spec, context) });

const st = await state();
await views();
const { keyLabel } = await app("brand-face");
const { blockTitle, labelOf, ofBlock } = await app("blocks");
const { blockKey, blocksViewModel, paintBlocks } = await app("mirror");
const { render, stripViewModel } = await app("arrange");
const { SOON, limitAge, limitChipViewModel, renewsAt } = await app("limit-chip");
const { prButtonViewModel } = await app("seat-menu");
const { paintTasks } = await app("tasks");
const { paintAgentUpdates } = await app("agent-updates");
const { topDressed } = await app("raycast-top");

const seat = (name, over = {}) => ({ name, title: name, where: "local", state: "idle", kind: "session", ...over });

function flag(on) {
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: on ? { experience: "raycast", was: "current" } : { experience: "current", was: "raycast" } }));
}

function hive(sessions, keysPerBlock, over = {}) {
  st.LIMIT = 4;
  st.data = { sessions, spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a", tint: "#111" }];
  st.space = "a";
  st.blocks = keysPerBlock.map((keys, i) => ({ id: `blk${i}`, ws: "a", label: "", manual: false, keys }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.mirrorDev = "";
  st.holding = "";
  st.prs = [];
  st.limits = { accounts: [], tightest: "" };
  st.keys.block = { alt: true, code: "Digit" };
  Object.assign(st, over);
}

function shape(node) {
  if (node.nodeType === 3) return JSON.stringify(node.nodeValue);
  if (node.nodeType !== 1) return "";
  if (node.classList.contains("xterm-rows")) return "<xterm-rows>";
  const attrs = [...node.attributes].map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort().join(" ");
  return `<${node.localName} ${attrs}>${[...node.childNodes].map(shape).join("")}</${node.localName}>`;
}

const bar = () => ["top", "foot", "shell"].map((id) => shape(document.getElementById(id))).join("\n");

test("the flag dresses the existing bar into the Raycast shape and gives every node back when it goes off", () => {
  hive([seat("s1"), seat("s2"), seat("s3"), seat("s4"), seat("s5")], [["s1", "s2", "s3", "s4"], ["s5"]]);
  render();
  paintBlocks();
  paintTasks();
  paintAgentUpdates();
  const before = bar();
  flag(true);
  assert.equal(topDressed(), true);
  const top = document.getElementById("top");
  assert.equal(document.getElementById("strip").parentElement, top, "the active block is the command bar, inside the top");
  assert.equal(document.getElementById("rail-toggle").parentElement, top);
  assert.equal(document.getElementById("clock").parentElement, document.getElementById("foot"));
  assert.deepEqual([...document.querySelectorAll("#meta > .it")].map((b) => b.id), ["btn-calls", "btn-tasks", "btn-prs", "btn-alerts"]);
  assert.equal(document.getElementById("btn-agents").parentElement.id, "more");
  assert.equal(document.getElementById("foot").hidden, false, "the footer is always there, it carries the clock");
  flag(false);
  assert.equal(topDressed(), false);
  render();
  paintBlocks();
  assert.equal(bar(), before, "with the flag off again the bar is node for node what it was");
});

test("the block on screen is the command bar and the other blocks are keys to jump to", () => {
  hive([seat("s1"), seat("s2", { state: "needs" }), seat("s3"), seat("s4"), seat("s5", { state: "needs" })], [["s1", "s2", "s3", "s4"], ["s5"]]);
  flag(true);
  try {
    render();
    paintBlocks();
    const tabs = [...document.querySelectorAll("#blocks button[data-i]")];
    assert.deepEqual(tabs.map((b) => b.dataset.i), ["1"], "the pressed block is not a tab any more");
    assert.equal(tabs[0].querySelector(".rc-key").textContent, keyLabel(st.keys.block, 2));
    assert.ok(tabs[0].querySelector(".rc-dot.needs"), "a block with someone calling wears the dot");
    assert.ok(document.querySelector("#btn-space .chev"));
    assert.equal(document.querySelector("#strip .num").textContent, blockKey(1));
    assert.equal(document.querySelector("#strip .seats").textContent, "4 seats");
    assert.equal(document.getElementById("calls-say").textContent, "need you");
    assert.match(document.getElementById("btn-calls").title, /^s2 · s5 · /);
  } finally {
    flag(false);
  }
});

test("with the flag the label of a block is the first seat, and its title names every seat", () => {
  hive([seat("a", { title: "validar editoras compra" }), seat("b", { title: "apagar oc recebida" }), seat("c", { title: "valores incoerentes" })], [["a", "b", "c"]]);
  const b = st.blocks[0];
  assert.equal(labelOf(b, ofBlock(b)).txt, "validar editoras compra +2", "the default keeps its +N");
  flag(true);
  try {
    assert.equal(labelOf(b, ofBlock(b)).txt, "validar editoras compra");
    assert.equal(blockTitle(b, ofBlock(b)), "validar editoras compra and 2 more seats: apagar oc recebida, valores incoerentes");
    b.keys = ["a", "b"];
    assert.equal(blockTitle(b, ofBlock(b)), "validar editoras compra and 1 more seat: apagar oc recebida");
    b.manual = true;
    b.label = "compras";
    assert.equal(blockTitle(b, ofBlock(b)), "compras: validar editoras compra, apagar oc recebida");
    const model = stripViewModel(b, ofBlock(b));
    assert.equal(model.num, keyLabel(st.keys.block, 1));
    assert.equal(model.seats, "2 seats");
    assert.equal(model.bold, "");
    assert.equal(stripViewModel(b, ofBlock(b).slice(0, 1)).seats, "1 seat");
    const tab = blocksViewModel().tabs[0];
    assert.equal(tab.hint, keyLabel(st.keys.block, 1));
    assert.equal(tab.title, `compras: validar editoras compra, apagar oc recebida · ${tab.hint}`);
    assert.equal("tally" in tab, false);
  } finally {
    flag(false);
  }
  assert.deepEqual(Object.keys(blocksViewModel().tabs[0]).sort(), ["calls", "i", "key", "n", "name", "pressed", "tally", "title"]);
});

test("the PR button names its state in words and a dot, and only with the flag", () => {
  let n = 0;
  const open = (over) => ({ key: `o/r#${++n}`, repo: "own/repo", number: n, state: "open", ci: "running", ...over });
  hive([], [], { prs: [open({ ci: "failed" }), open()] });
  assert.deepEqual(prButtonViewModel(), { key: "prbtn", lead: "1", word: " failing ", count: "· 2 PRs" });
  flag(true);
  try {
    assert.deepEqual(prButtonViewModel(), { key: "prbtn", rc: true, tone: "needs", lead: "1", word: "PR failing" });
    st.prs = [open(), open(), open()];
    assert.deepEqual(prButtonViewModel(), { key: "prbtn", rc: true, tone: "working", lead: "3", word: "PRs running" });
    st.prs = [open({ state: "merged", ci: "passed" })];
    assert.deepEqual(prButtonViewModel(), { key: "prbtn", rc: true, tone: "", lead: "1", word: "PR" });
  } finally {
    flag(false);
  }
});

const roomy = { account: "default", label: "Claude", provider: "claude", signedIn: true, limits: [] };

test("the footer says when the tightest login renews and how old the numbers are, only with the flag", () => {
  const soon = new Date(Date.now() + 2 * 3600000).toISOString();
  const later = new Date(Date.now() + 4 * 86400000).toISOString();
  const spent = { ...roomy, account: "acme", limits: [{ kind: "session", percent: 100, resets_at: soon }, { kind: "weekly_all", percent: 62, resets_at: later }] };
  hive([], [], { limits: { accounts: [spent], tightest: "acme", seen: Date.now() - 5 * 60000 } });
  const plain = limitChipViewModel();
  assert.equal("resets" in plain, false);
  assert.equal(plain.accounts[0].parts[0].k, "5h");
  flag(true);
  try {
    const model = limitChipViewModel();
    assert.equal(model.age, "5 min ago");
    assert.equal(model.accounts[0].parts[0].k, `back ${renewsAt(soon)}`, "a spent window says when it comes back");
    assert.equal(model.accounts[0].parts[1].k, "week");
    assert.deepEqual(model.resets.map((one) => one.text), [`week renews ${renewsAt(later)}`]);
    assert.equal(document.getElementById("lim-age").textContent, "5 min ago", "the reload button says how old the numbers are");
  } finally {
    flag(false);
  }
});

test("a renewal soon is said as the hour, a later one with its day, and the age of the numbers in words", () => {
  const now = Date.parse("2026-10-01T03:00:00Z");
  assert.match(renewsAt(new Date(now + 70 * 60000).toISOString(), now), /^\d{2}:\d{2}$/);
  assert.match(renewsAt(new Date(now + SOON + 60000).toISOString(), now), /^\S+ \d{2}:\d{2}$/);
  assert.equal(renewsAt("not a date", now), "");
  assert.equal(limitAge(0, now), "");
  assert.equal(limitAge(now - 20000, now), "just now");
  assert.equal(limitAge(now - 3 * 3600000, now), "3 h ago");
});

test("the doctor line draws a hairline instead of a dot between its parts, and a lost doctor is not red", async () => {
  let said = { error: "socket closed" };
  globalThis.fetch = async () => ({ status: 200, json: async () => said });
  await import("/assets/status-strip.mjs?v=3");
  const strip = document.getElementById("status-strip");
  flag(true);
  await window.hiveDoctorPull(false);
  try {
    assert.equal(strip.className, "lost");
    assert.ok(strip.querySelector("i.sep"));
    assert.ok(strip.querySelector('button.go[data-doctor="reload"]'), "check again is a real button, not a quiet word");
    said = { items: [{ id: "x", state: "warn", title: "the build is old", detail: "three releases behind" }] };
    await window.hiveDoctorPull(false);
    assert.equal(strip.className, "warn");
    assert.ok(strip.querySelector("i.sep"));
  } finally {
    flag(false);
  }
  assert.ok(strip.querySelector("span.sep"), "with the flag off the line is drawn as before");
  assert.equal(strip.querySelector("span.sep").textContent, "·");
});
