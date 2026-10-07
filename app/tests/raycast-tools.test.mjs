import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, state, views } from "./dom.mjs";

await views();
const st = await state();
const { raycastOn, RAYCAST_TERMINAL } = await app("core");
const { changes, changesModel, infoViewModel, paintDiffOfChat, paintInfoOfChat } = await app("seat-changes");
const { paintWellKeys } = await app("terminal-history");
const { TERM_LOOK } = await app("terminal-pool");
const { openLinkMenu, closeLinkMenu } = await app("plane");
const { suggestMarkup, suggestMenu } = await app("suggest-menu");
const { openSeatPicker, closeSeatPicker } = await app("chat-and-panes");
const { providerTransferState } = await app("provider-transfer");
const { getStructured } = await app("chat-stretches");
const { svSubPin } = await app("subagents-dock");
const { svConvSeed } = await app("conversation-model");
const { structPool } = await app("structured-seats");
const { mountSubs } = await import(new URL("../src/views.js", import.meta.url).href);

const sheet = readFileSync(new URL("../assets/raycast/tools.css", import.meta.url), "utf8");

function wear(on) {
  const was = raycastOn() ? "raycast" : "current";
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was } }));
}

function seatNamed(name, extra = {}) {
  const s = { name, where: "local", state: "idle", trees: [{ path: "/w/api", repo: "api", branch: "ana/-/net", main: false }], ...extra };
  st.data = { ...(st.data || {}), sessions: [...(st.data?.sessions || []).filter((one) => one.name !== name), s] };
  return s;
}

const READ = {
  state: "ok", top: "/w/api", repo: "api", branch: "ana/-/net", head: "abc1234", base: "origin/main",
  files: [
    { status: "M", path: "src/sum.ts", from: "", untracked: false, added: 3, removed: 2, binary: false },
    { status: "A", path: "src/new.ts", from: "", untracked: true, added: 2, removed: 0, binary: false }
  ],
  ahead: [{ sha: "1234567", subject: "fix(oms): net after the sum" }],
  added: 5, removed: 2, tree: "/w/api", trees: []
};

test("with the flag off the open seat has no info column and asks git nothing", (t) => {
  wear(false);
  const s = seatNamed("tools-off");
  st.open = s.name;
  t.after(() => { st.open = null; });
  const model = infoViewModel(s);
  assert.deepEqual([model.open, model.where, model.changes, model.last, model.acts], [false, null, null, null, null]);
  assert.equal(changes.has(s.name), false, "nothing was fetched for the seat");
});

test("with the flag on the open seat reads where it works, what changed and the commits ahead", (t) => {
  wear(true);
  const s = seatNamed("tools-on");
  st.open = s.name;
  changes.set(s.name, { at: Date.now(), data: READ, asking: false });
  t.after(() => { st.open = null; changes.delete(s.name); wear(false); });
  const model = infoViewModel(s);
  assert.equal(model.open, true);
  assert.deepEqual(model.where.rows.map((row) => [row.key, row.value]), [["repo", "api"], ["tree", "/w/api"], ["branch", "ana/-/net"]]);
  const list = changesModel(s);
  assert.equal(list.state, "ok");
  assert.deepEqual(list.rows.map((row) => [row.letter, row.leaf, row.added, row.removed]), [["M", "sum.ts", "+3", "−2"], ["A", "new.ts", "+2", ""]]);
  assert.deepEqual(list.count, { added: "+5", removed: "−2" });
  assert.equal(list.ahead.rows[0].sha, "1234567");
  assert.match(list.progress.text, /0/);
  assert.equal(model.acts.backKey, "esc");
});

test("the info column mounts into the open side only with the flag, and leaves with it", (t) => {
  const s = seatNamed("tools-col");
  const el = document.createElement("div");
  el.className = "tile open";
  el.innerHTML = '<div class="side"><div class="actions"></div></div>';
  document.body.appendChild(el);
  st.open = s.name;
  changes.set(s.name, { at: Date.now(), data: READ, asking: false });
  const acts = () => ({ back() {}, reconnect() {}, close() {} });
  t.after(() => { el.remove(); st.open = null; changes.delete(s.name); wear(false); });
  wear(false);
  paintInfoOfChat(el, s, acts);
  assert.equal(el.querySelector(".i-col"), null);
  wear(true);
  paintInfoOfChat(el, s, acts);
  const col = el.querySelector(".side > .i-col");
  assert.ok(col, "the column hangs off the side");
  assert.ok(col.querySelector(".i-where"));
  assert.equal(col.querySelectorAll(".cd-row").length, 2);
  assert.ok(col.querySelector(".actions.i-acts .rc-key"));
  wear(false);
  paintInfoOfChat(el, s, acts);
  assert.equal(el.querySelector(".i-col"), null);
});

test("a diff left open closes when the flag goes off", (t) => {
  const s = seatNamed("tools-diff");
  const el = document.createElement("div");
  document.body.appendChild(el);
  t.after(() => { el.remove(); st.diffChat = null; st.open = null; wear(false); });
  st.open = s.name;
  st.diffChat = s.name;
  wear(false);
  paintDiffOfChat(el, s);
  assert.equal(st.diffChat, null);
  assert.equal(el.querySelector(".cd-window"), null);
});

test("the terminal footer says the key that matters only with the flag, and gives the cover back without it", (t) => {
  const el = document.createElement("div");
  el.innerHTML = '<div class="well"><span class="badge">live terminal</span><div class="cover"><span>click or ↵ to type in this session</span></div></div>';
  document.body.appendChild(el);
  t.after(() => { el.remove(); wear(false); });
  const s = { name: "tools-term", structured: false };
  const before = el.innerHTML;
  wear(false);
  paintWellKeys(el, s);
  assert.equal(el.innerHTML, before, "the flag off touches nothing");
  wear(true);
  paintWellKeys(el, s);
  const keys = el.querySelector(".well > .well-keys");
  assert.ok(keys);
  assert.ok(keys.querySelector(".rc-key"));
  assert.ok(el.querySelector(".cover .rc-key"));
  assert.equal(el.querySelector(".badge").nextElementSibling, keys);
  wear(false);
  paintWellKeys(el, s);
  assert.equal(el.querySelector(".well-keys"), null);
  assert.equal(el.querySelector(".cover .rc-key"), null);
});

test("the terminal reads at 1.5 lines and on the dimmer palette only with the flag", () => {
  wear(false);
  assert.equal(TERM_LOOK.lineHeight, 1);
  wear(true);
  assert.equal(TERM_LOOK.lineHeight, 1.5);
  assert.equal(RAYCAST_TERMINAL.red, "#FF8A8A", "a failing test does not shout like a seat that needs you");
  assert.equal(RAYCAST_TERMINAL.background, "#040506");
  wear(false);
  assert.equal(TERM_LOOK.lineHeight, 1);
});

test("the link menu between two seats gets cancel and the keys only with the flag", (t) => {
  const plane = document.getElementById("plane");
  t.after(() => { closeLinkMenu(); wear(false); });
  wear(false);
  openLinkMenu("ana", "bia", 10, 10);
  let menu = plane.querySelector(".plink-menu");
  assert.equal(menu.querySelector(".pl-cancel"), null);
  assert.equal(menu.querySelectorAll("button").length, 1);
  closeLinkMenu();
  wear(true);
  openLinkMenu("ana", "bia", 10, 10);
  menu = plane.querySelector(".plink-menu");
  assert.ok(menu.querySelector(".pl-cancel .rc-key"));
  assert.ok(menu.querySelector(".pl-go .rc-key"));
});

function slashBench() {
  const host = document.createElement("div");
  host.innerHTML = `${suggestMarkup()}<textarea></textarea>`;
  document.body.appendChild(host);
  const textarea = host.querySelector("textarea");
  const suggest = host.querySelector(".sv-suggest");
  const menu = suggestMenu({
    textarea, suggest, mine: () => "me",
    commands: () => ({ list: ["compact", "context", "config", "review"], info: {} }),
    files: { searching: () => "", none: () => "", find: async () => ({ files: [] }) }
  });
  const type = (text) => { textarea.value = text; textarea.setSelectionRange(text.length, text.length); menu.compute(); };
  return { host, suggest, type };
}

test("the slash menu underlines the typed part and draws its keys only with the flag", (t) => {
  const off = slashBench();
  t.after(() => { off.host.remove(); wear(false); });
  wear(false);
  const plain = off.suggest.querySelector(".sgkeys").innerHTML;
  off.type("/co");
  assert.equal(off.suggest.querySelector("u"), null);
  assert.equal(off.suggest.querySelector(".sgkeys").innerHTML, plain);
  const on = slashBench();
  t.after(() => on.host.remove());
  wear(true);
  on.type("/co");
  assert.equal(on.suggest.querySelector(".sg u").textContent, "co");
  assert.ok(on.suggest.querySelector(".sgkeys .rc-key"));
  assert.match(on.suggest.querySelector(".sgkeys .n").textContent, /3/);
  on.type("/zz");
  assert.ok(on.suggest.querySelector(".none b"));
});

function pickerSeat() {
  const host = document.createElement("div");
  host.innerHTML = '<div class="sv-composer"><button class="sv-pill-model"></button><button class="sv-pill-effort"></button><textarea></textarea></div>';
  document.body.appendChild(host);
  return {
    draft: true, name: "draft:tools-picker", agent: "claude", where: "local", model: "opus", effort: "", host,
    catalog: [{ value: "opus", label: "Opus", defaultEffort: "high", efforts: ["low", "high"].map((value) => ({ value, label: value })) }]
  };
}

test("model and thinking share one picker with its keys drawn, only with the flag", (t) => {
  const e = pickerSeat();
  t.after(() => { closeSeatPicker(e); e.host.remove(); wear(false); });
  wear(false);
  openSeatPicker(e, "effort");
  assert.deepEqual(Object.keys(e.menu).sort(), ["el", "kind", "repaint"]);
  assert.equal(e.menu.kind, "effort");
  assert.equal(e.menu.el.querySelector(".mf"), null);
  closeSeatPicker(e);
  wear(true);
  openSeatPicker(e, "effort");
  assert.equal(e.menu.kind, "model");
  assert.equal(e.menu.asked, "effort");
  assert.ok(e.menu.el.querySelector(".mf .rc-key"));
  assert.ok(e.menu.el.querySelector(".grp.thinking"));
  assert.deepEqual([...e.menu.el.querySelectorAll(".sv-row.effort")].map((row) => row.querySelector("b").textContent), ["low", "high"]);
});

test("a failed provider change offers to try again, only with the flag", (t) => {
  const e = getStructured({ name: "tools-transfer", where: "local", agent: "claude", model: "opus" });
  document.body.appendChild(e.host);
  t.after(() => { e.host.remove(); wear(false); });
  const failed = { phase: "failed", error: "no <login>", agent: "codex", model: "gpt" };
  wear(false);
  providerTransferState(e, failed);
  const bar = e.host.querySelector(".sv-provider-transfer");
  assert.equal(bar.children.length, 0);
  assert.match(bar.textContent, /no <login>/);
  wear(true);
  providerTransferState(e, failed);
  assert.ok(bar.classList.contains("failed"));
  assert.ok(bar.querySelector(".warn"));
  assert.equal(bar.querySelectorAll("button").length, 1);
  providerTransferState(e, { phase: "preparing", agent: "codex" });
  assert.equal(bar.querySelector(".r").textContent, "2/3");
  assert.ok(bar.querySelector(".spin"));
  wear(false);
  providerTransferState(e, failed);
  assert.equal(bar.classList.contains("failed"), false);
  assert.equal(bar.children.length, 0);
});

test("the dock counts the minutes of the oldest subagent only with the flag", (t) => {
  const e = getStructured({ name: "tools-subs", where: "local" });
  e.conv = svConvSeed();
  e.subsView = mountSubs(e.host.querySelector(".sv-subs .sublist"));
  t.after(() => { structPool.delete(e.name); wear(false); });
  wear(false);
  svSubPin(e, { id: "t1", name: "Agent", input: { subagent_type: "Explore", description: "map the repo" } });
  e.conv.subs[0].dataset.t0 = String(Date.now() - 5 * 60000);
  svSubPin(e, { id: "t2", name: "Agent", input: { subagent_type: "Explore", description: "read the tests" } });
  const count = () => e.host.querySelector(".sv-subs .scount").textContent;
  assert.equal(count(), "2");
  wear(true);
  svSubPin(e, { id: "t3", name: "Agent", input: { subagent_type: "Plan", description: "plan it" } });
  assert.match(count(), /^3 · 5 /);
});

test("the tools sheet resets before it sets, and names its own keyframe", () => {
  assert.match(sheet, /@keyframes rc-cdsk/);
  assert.doesNotMatch(sheet, /animation: cdsk/);
  for (const line of sheet.split("\n")) {
    const body = line.match(/\{ (.*) \}$/)?.[1];
    if (!body || body.includes("{")) continue;
    const decls = body.split(/;\s*/).filter(Boolean);
    const firstSet = decls.findIndex((one) => !/: unset$/.test(one));
    const lateReset = decls.findIndex((one, at) => at > firstSet && firstSet >= 0 && /: unset$/.test(one));
    assert.equal(lateReset, -1, `a reset after a value can undo a shorthand: ${line.slice(0, 120)}`);
  }
  assert.match(sheet, /:where\(body\.experience-raycast\) \.tile\.open \.side > \.actions \{ display: none; \}/);
  assert.match(sheet, /:where\(body\.experience-raycast\) \.i-col \{ display: contents; \}/);
});
