import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const sheet = readFileSync(join(HERE, "assets/raycast/rail.css"), "utf8");

const st = await state();
const { $ } = await app("core");
const { detached } = await app("blocks");
const { keyLabel } = await app("brand-face");
const { sawWorking } = await app("leader-key");
const mirror = await app("mirror");
const worktrees = await app("worktrees");
const { ARCH_SHOWN, archKey, spanOf } = mirror;

const flag = (on) => {
  const was = document.body.classList.contains("experience-raycast") ? "raycast" : "current";
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was } }));
};

const seat = (name, over = {}) => ({ name, where: "local", state: "idle", ...over });

const world = (over = {}) => {
  st.keys = { ...st.keys, palette: { meta: true, code: "KeyK" } };
  st.data = { pod: { up: false, name: "" }, sessions: [], archived: [], spawning: [], ...(over.data || {}) };
  st.blocks = over.blocks || [];
  st.block = over.block || 0;
  st.space = over.space || "w0";
  st.open = over.open || null;
  st.focus = over.focus || 0;
  st.seatsKnown = true;
  st.archOpen = !!over.archOpen;
  st.archNote = over.archNote || "";
  st.railShows = over.shows || "all";
  st.railQuery = over.query || "";
  st.railSearching = !!over.query;
  st.railCursor = over.cursor || 0;
  detached.clear();
  for (const name of over.detached || []) detached.add(name);
  mirror.reviving.clear();
  for (const key of over.reviving || []) mirror.reviving.add(key);
  return mirror.railViewModel();
};

const rows = (model) => model.groups.flatMap((g) => g.items.map((it) => it.key));

test("with the flag off the rail model is the one of the current Hive: grouped by machine, no filter, no search", () => {
  flag(false);
  const model = world({ data: { pod: { up: true, name: "pod-1" }, sessions: [seat("a")], archived: [] }, blocks: [{ id: "b1", ws: "w0", keys: ["a"] }] });
  assert.deepEqual(model.groups.map((g) => g.key), ["cloud", "local"]);
  assert.equal(model.raycast, undefined);
  assert.equal(model.shows, undefined);
  assert.deepEqual(Object.keys(model).sort(), ["groups", "note", "parked", "snoozed"]);
  assert.equal(model.groups[1].items[0].tag, "b1");
});

test("with the flag off the worktrees stay at the top of the list and there is no folded-rail tooltip", () => {
  flag(false);
  assert.equal($("rail-wt").parentElement.id, "rail-list");
  assert.equal($("rail-list").firstElementChild.id, "rail-wt");
  assert.equal($("rail-wt").hasAttribute("data-no-t"), false);
  assert.equal(document.getElementById("rail-tip"), null);
});

test("the flag moves the worktrees to the foot of the rail with a tooltip beside it, and turning it off puts them back", () => {
  flag(true);
  assert.equal($("knock-dock").nextElementSibling.id, "rail-wt");
  assert.equal($("rail-wt").hasAttribute("data-no-t"), true);
  assert.ok(document.getElementById("rail-tip"));
  assert.equal(document.getElementById("rail-tip").hidden, true);
  flag(false);
  assert.equal($("rail-list").firstElementChild.id, "rail-wt");
  assert.equal($("rail-wt").hasAttribute("data-no-t"), false);
  assert.equal(document.getElementById("rail-tip"), null);
});

test("the seats are grouped by block, and the machine is a filter with a count on each side", () => {
  flag(true);
  const blocks = [{ id: "b1", ws: "w0", keys: ["a"] }, { id: "b2", ws: "w0", keys: ["c", "d"] }];
  const sessions = [seat("a"), seat("c", { where: "cloud" }), seat("d")];
  const all = world({ data: { pod: { up: true, name: "pod-1" }, sessions, archived: [] }, blocks, block: 1 });
  assert.equal(all.raycast, true);
  assert.deepEqual(all.groups.map((g) => g.key), ["b1", "b2"]);
  assert.deepEqual(all.groups.map((g) => g.label), ["block 1", "block 2"]);
  assert.deepEqual(all.groups.map((g) => g.keys), [keyLabel(st.keys.block, 1), keyLabel(st.keys.block, 2)], "a block wears the key that reaches it");
  assert.deepEqual(all.groups.map((g) => g.here), [false, true], "only the block on screen sits in the well");
  assert.deepEqual(all.shows.map((one) => [one.key, one.count, one.on]), [["all", 3, true], ["local", 2, false], ["cloud", 1, false]]);
  const cloud = world({ data: { pod: { up: true, name: "pod-1" }, sessions, archived: [] }, blocks, block: 1, shows: "cloud" });
  assert.deepEqual(rows(cloud), ["c"], "the filter keeps the blocks and hides the seats of the other machine");
  assert.deepEqual(cloud.groups.map((g) => g.key), ["b2"], "a block left with nothing to show goes away");
});

test("a block of another workspace is named after it and has no key, and a seat in no block comes last", () => {
  flag(true);
  const spaces = st.spaces;
  st.spaces = [{ id: "w0", name: "" }, { id: "w1", name: "side" }];
  const model = world({
    data: { pod: { up: false, name: "" }, sessions: [seat("loose"), seat("far"), seat("a")], archived: [] },
    blocks: [{ id: "x1", ws: "w1", keys: ["far"] }, { id: "b1", ws: "w0", keys: ["a"] }]
  });
  st.spaces = spaces;
  assert.deepEqual(rows(model), ["a", "far", "loose"], "the workspace on screen first, then the others, then the seats in no block");
  assert.deepEqual(model.groups.map((g) => [g.label, g.keys]), [["block 1", keyLabel(st.keys.block, 1)], ["side · block 1", ""], ["outside the blocks", ""]]);
  assert.equal(model.groups[1].i, -1, "a block of another workspace is not reached by clicking its title");
});

test("a seat row carries the state written out, so the colour is never alone", () => {
  flag(true);
  const model = world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana", state: "needs", live: [1, 2] }), seat("b", { state: "answered" }), seat("c", { state: "done" }), seat("d", { state: "ready" }), seat("e")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["b", "c", "d", "e"] }, { id: "b2", ws: "w0", keys: ["a"] }],
    block: 1
  });
  const row = (key) => model.groups.flatMap((g) => g.items).find((it) => it.key === key);
  const a = row("a");
  assert.deepEqual(a.parts, { pre: "Ana", hit: "", post: "" });
  assert.equal(a.said, "needs you");
  assert.equal(a.hint, "Ana — needs you · 2 running");
  assert.deepEqual([a.meta, a.tone], ["needs you", "need"]);
  assert.deepEqual([row("b").meta, row("c").meta, row("d").meta, row("e").meta], ["answered", "finished", "—", "zzz"]);
  assert.equal(a.openKey, keyLabel(st.keys.seat, 1), "a seat of the block on screen offers its own key on hover");
  assert.equal(row("b").openKey, "", "a seat of another block has no seat key to offer");
});

test("the meta counts how long: working since the rail saw it, stalled since the last work", () => {
  flag(true);
  assert.deepEqual([spanOf(41000), spanOf(120000), spanOf(3 * 3600000), spanOf(3 * 86400000)], ["41s", "2m", "3h", "3d"]);
  sawWorking.set("s", Date.now() - 12 * 60000);
  const model = world({ data: { pod: { up: false, name: "" }, sessions: [seat("w", { state: "working" }), seat("s", { state: "stalled" })], archived: [] }, blocks: [{ id: "b1", ws: "w0", keys: ["w", "s"] }] });
  const [w, s] = model.groups[0].items;
  assert.match(w.meta, /^\d+s$/);
  assert.equal(w.tone, "t");
  assert.equal(s.meta, "stalled 12m");
  sawWorking.delete("s");
});

test("the seat on screen is the selected row, and nothing is selected while reading a mate's hive", () => {
  flag(true);
  const blocks = [{ id: "b1", ws: "w0", keys: ["a", "b"] }];
  const data = { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b")], archived: [] };
  assert.deepEqual(world({ data, blocks, focus: 1 }).groups[0].items.map((it) => it.sel), [false, true]);
  assert.deepEqual(world({ data, blocks, open: "a" }).groups[0].items.map((it) => it.sel), [true, false]);
  st.mirrorDev = "ana";
  assert.deepEqual(mirror.railViewModel().groups[0].items.map((it) => it.sel), [false, false]);
  st.mirrorDev = "";
});

test("a seat living in a window of its own says so, and wears an arrow", () => {
  flag(true);
  const model = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana" })], archived: [] }, detached: ["a"] });
  const [a] = model.groups[0].items;
  assert.equal(a.hint, "Ana — in a window of its own — click to bring it back");
  assert.equal(a.away, true);
});

test("the search keeps the blocks, marks what matched, and puts the cursor on the first hit", () => {
  flag(true);
  const model = world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "grafico share editora" }), seat("b", { title: "Livreiro" }), seat("c", { title: "validar editoras" })], archived: [{ name: "old", title: "editar nota", where: "local", archivedAt: 0 }] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a", "b"] }, { id: "b2", ws: "w0", keys: ["c"] }],
    query: "EDIT"
  });
  assert.equal(model.searching, true);
  assert.deepEqual(rows(model), ["a", "c"]);
  assert.deepEqual(model.groups[0].items[0].parts, { pre: "grafico share ", hit: "edit", post: "ora" });
  assert.equal(model.found, "2 of 3 seats");
  assert.deepEqual(model.groups.flatMap((g) => g.items).map((it) => !!it.cursor), [true, false]);
  assert.equal(model.parked.open, true, "the archived seats that match open on their own");
  assert.deepEqual(model.parked.shown.map((one) => one.parts.hit), ["edit"]);
  assert.equal(model.empty, null);
  const moved = world({ data: st.data, blocks: st.blocks, query: "edit", cursor: 9 });
  assert.deepEqual(moved.groups.flatMap((g) => g.items).map((it) => !!it.cursor), [false, true], "the cursor stays on the last hit");
  const none = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a")], archived: [] }, query: "a2b" });
  assert.deepEqual(none.groups, []);
  assert.equal(none.empty.said, "nothing with “a2b”");
  assert.equal(none.empty.key, keyLabel(st.keys.palette), "nothing found points at the palette, which searches more");
});

test("an empty rail is one line with the key that fills it, and a rail still loading is not empty", () => {
  flag(true);
  const model = world({ data: { pod: { up: true, name: "pod-1" }, sessions: [seat("a")], archived: [] }, shows: "cloud" });
  assert.deepEqual(model.groups, []);
  assert.deepEqual([model.empty.icon, model.empty.said, model.empty.key], ["i-cloud", "no sessions in the cloud", keyLabel(st.keys.new)]);
  st.seatsKnown = false;
  st.data = { pod: { up: false, name: "" }, sessions: [], archived: [], spawning: [] };
  const loading = mirror.railViewModel();
  assert.equal(loading.loading, "block 1 · loading…");
  assert.equal(loading.empty, null);
  st.seatsKnown = true;
});

test("the archived fold shows nothing while shut, the first few while open, and offers to see the rest", () => {
  flag(true);
  const archived = Array.from({ length: ARCH_SHOWN + 1 }, (_, n) => ({ name: `old${n + 1}`, where: "local", archivedAt: Date.now() - 3 * 86400000 }));
  const shut = world({ data: { pod: { up: false, name: "" }, sessions: [], archived } });
  assert.equal(shut.parked.count, ARCH_SHOWN + 1);
  assert.equal(shut.parked.open, false);
  assert.deepEqual(shut.parked.shown, []);
  const open = world({ data: { pod: { up: false, name: "" }, sessions: [], archived }, archOpen: true, reviving: [archKey(archived[0])] });
  assert.deepEqual(open.parked.shown.map((one) => one.key), archived.slice(0, ARCH_SHOWN).map(archKey));
  assert.equal(open.parked.shown[0].action, "coming back…");
  assert.equal(open.parked.shown[1].action, "revive");
  assert.equal(open.parked.shown[1].when, "3d");
  assert.equal(open.parked.more, "+ 1 more · see all");
});

test("the filter is remembered, and an unknown one is refused", async () => {
  if (!mirror.railSolid) (await app("shared")).bootSolid();
  flag(true);
  world({ data: { pod: { up: false, name: "" }, sessions: [seat("a")], archived: [] } });
  mirror.showOnRail("cloud");
  assert.equal(st.railShows, "cloud");
  assert.equal(localStorage.getItem(mirror.RAIL_SHOWS_KEY), "cloud");
  mirror.showOnRail("constructor");
  assert.equal(st.railShows, "cloud");
  mirror.showOnRail("all");
});

test("the team rail is a grid of faces with a tally, a search hit list, and a line that offers to try again", () => {
  flag(true);
  const team = st.team;
  st.team = { me: "me", here: "me@mac", devs: [
    { key: "ana@a", dev: "ana", machine: "a", up: true, seats: [{ name: "s1", title: "editar nota" }] },
    { key: "bia@b", dev: "bia", machine: "b", up: false, seats: [] }
  ] };
  st.railQuery = "";
  const model = mirror.teamRailViewModel();
  assert.equal(model.raycast, true);
  assert.equal(model.shown, true);
  assert.equal(model.tally, "1 of 2");
  assert.equal(model.hits, null);
  st.railQuery = "edit";
  const hits = mirror.teamRailViewModel().hits;
  assert.deepEqual(hits.map((one) => [one.key, one.who, one.parts.hit]), [["ana@a/s1", "ana · ", "edit"]]);
  st.railQuery = "";
  st.teamTrouble = Date.now();
  assert.equal(mirror.teamRailViewModel().trouble.said, "could not reach the cluster");
  st.teamTrouble = 0;
  flag(false);
  assert.deepEqual(Object.keys(mirror.teamRailViewModel()).sort(), ["groups", "key"], "the current Hive keeps its team model");
  st.team = team;
});

test("the worktrees foot carries the keys and the three numbers only with the flag", () => {
  st.data = { ...st.data, worktrees: { count: 4, idle: 1, sized: false, bytes: 0, idleBytes: 0 } };
  const { worktreeRailViewModel } = worktrees;
  flag(false);
  assert.equal(worktreeRailViewModel().idle, "yes");
  flag(true);
  const model = worktreeRailViewModel();
  assert.equal(model.raycast, true);
  assert.deepEqual(model.said, ["4", "1 idle", "measuring…"]);
  flag(false);
});

test("/ opens the rail search only with the flag", async () => {
  const { bootSolid } = await app("shared");
  world({ data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana" })], archived: [] }, blocks: [{ id: "b1", ws: "w0", keys: ["a"] }] });
  if (!mirror.railSolid) bootSolid();
  flag(false);
  document.activeElement?.blur?.();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
  assert.equal(st.railSearching, false, "the current Hive does not know the / key");
  assert.equal($("rail-sessions").querySelector(".rail-head"), null);
  flag(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
  assert.equal(st.railSearching, true);
  const host = $("rail-sessions");
  const input = $("rail-q");
  assert.ok(input, "the search field opens");
  input.value = "an";
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(st.railQuery, "an");
  assert.equal(host.querySelector(".item[data-name='a'] mark.hl").textContent, "An");
  input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(st.railQuery, "");
  assert.equal(st.railSearching, false, "esc clears the search and gives the filter back");
  assert.deepEqual([...host.querySelectorAll(".rail-seg [data-show]")].map((b) => b.dataset.show), ["all", "local", "cloud"]);
  host.querySelector("[data-show='cloud']").click();
  assert.equal(st.railShows, "cloud");
  assert.ok(host.querySelector(".rail-empty"), "the empty cloud says so in one line");
  host.querySelector("[data-show='all']").click();
  flag(false);
  assert.equal(host.querySelector(".rail-head"), null, "turning the flag off brings the current rail back");
  assert.equal(host.querySelector(".group-title span").textContent, "local · your machine");
});

test("every rule of the rail sheet lives inside the flag, and the folded rail is 56px wide", () => {
  assert.match(sheet, /:where\(body\.experience-raycast\) #shell\.rail-min \{ --rail-w: 56px; \}/);
  assert.match(sheet, /:where\(body\.experience-raycast\) #rail \{[^}]*grid-template-rows: minmax\(0, 1fr\) auto auto;/);
  assert.doesNotMatch(sheet, /\.item[^{]*\{[^}]*(text-shadow: 0|font-weight: 600)/, "no rail row glows or goes bold");
});
