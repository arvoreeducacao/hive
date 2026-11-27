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
const { detached, hidden, hideSeat } = await app("blocks");
const { keyLabel } = await app("brand-face");
const { sawWorking } = await app("leader-key");
const mirror = await app("mirror");
const worktrees = await app("worktrees");
const { adoptSeatMarks } = await app("seat-marks");
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
  st.threadRules = { ...st.threadRules, workingSection: !!over.working };
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

test("the seats are grouped by block, and the machine is a filter that keeps its count in the tip", () => {
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
  assert.deepEqual(all.shows.map((one) => one.hint), ["3 chats", "2 chats", "1 chat"]);
  const cloud = world({ data: { pod: { up: true, name: "pod-1" }, sessions, archived: [] }, blocks, block: 1, shows: "cloud" });
  assert.deepEqual(rows(cloud), ["c"], "the filter keeps the blocks and hides the seats of the other machine");
  assert.deepEqual(cloud.groups.map((g) => g.key), ["b2"], "a block left with nothing to show goes away");
});

test("everything that does not run on this machine sits under one Remote filter, the server and the ssh hosts alike", () => {
  flag(true);
  const blocks = [{ id: "b1", ws: "w0", keys: ["a", "c", "r"] }];
  const sessions = [seat("a"), seat("c", { where: "cloud" }), seat("r", { where: "cloud", host: "ada@devbox", hostLabel: "devbox" })];
  const all = world({ data: { pod: { up: true, name: "pod-1" }, sessions, archived: [] }, blocks });
  assert.deepEqual(all.shows.map((one) => [one.key, one.label, one.count]), [["all", "All", 3], ["local", "Local", 1], ["cloud", "Remote", 2]]);
  const remote = world({ data: { pod: { up: true, name: "pod-1" }, sessions, archived: [] }, blocks, shows: "cloud" });
  assert.deepEqual(rows(remote), ["c", "r"], "the remote filter lost a chat that runs somewhere else");
});

test("the Remote filter waits for a chat that runs somewhere else", () => {
  flag(true);
  const none = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a")], archived: [] }, blocks: [{ id: "b1", ws: "w0", keys: ["a"] }] });
  assert.deepEqual(none.shows.map((one) => one.label), ["All", "Local"]);
  const one = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("r", { where: "cloud", host: "ada@devbox" })], archived: [] }, blocks: [{ id: "b1", ws: "w0", keys: ["a", "r"] }] });
  assert.deepEqual(one.shows.map((it) => it.label), ["All", "Local", "Remote"]);
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
  assert.deepEqual(model.groups.map((g) => [g.label, g.keys]), [["block 1", keyLabel(st.keys.block, 1)], ["side · block 1", ""], ["off screen", ""]]);
  assert.equal(model.groups[1].i, -1, "a block of another workspace is not reached by clicking its title");
});

test("a seat row keeps the state in its tip and on its dot, and the corner stays empty unless the chat works", () => {
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
  assert.deepEqual(["a", "b", "c", "d", "e"].map((key) => row(key).meta), ["", "", "", "", ""]);
  assert.equal("tone" in a, false);
  assert.equal("open" in a || "openKey" in a, false, "hovering a row offers no open word and no key: a click already opens it");
});

test("the meta counts how long: working since the rail saw it, stalled since the last work", () => {
  flag(true);
  assert.deepEqual([spanOf(41000), spanOf(120000), spanOf(3 * 3600000), spanOf(3 * 86400000)], ["41s", "2m", "3h", "3d"]);
  sawWorking.set("s", Date.now() - 12 * 60000);
  const model = world({ data: { pod: { up: false, name: "" }, sessions: [seat("w", { state: "working" }), seat("s", { state: "stalled" })], archived: [] }, blocks: [{ id: "b1", ws: "w0", keys: ["w", "s"] }] });
  const [w, s] = model.groups[0].items;
  assert.match(w.meta, /^\d+s$/);
  assert.equal(s.meta, "");
  assert.equal(s.said, "stalled 12m");
  assert.equal(s.hint, "s — stalled 12m");
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
  assert.equal("found" in model, false, "the search says no count and no open key");
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
  assert.deepEqual([model.empty.icon, model.empty.said, model.empty.key], ["i-cloud", "no remote sessions", keyLabel(st.keys.new)]);
  st.seatsKnown = false;
  st.data = { pod: { up: false, name: "" }, sessions: [], archived: [], spawning: [] };
  const loading = mirror.railViewModel();
  assert.equal(loading.loading, "block 1 · loading…");
  assert.equal(loading.empty, null);
  st.seatsKnown = true;
});

test("the archived fold shows nothing while shut, the first few while open, and shows more in place", () => {
  flag(true);
  const archived = Array.from({ length: ARCH_SHOWN + 1 }, (_, n) => ({ name: `old${n + 1}`, where: "local", archivedAt: Date.now() - 3 * 86400000 }));
  const shut = world({ data: { pod: { up: false, name: "" }, sessions: [], archived } });
  assert.equal(shut.parked.count, ARCH_SHOWN + 1);
  assert.equal(shut.parked.open, false);
  assert.deepEqual(shut.parked.shown, []);
  const open = world({ data: { pod: { up: false, name: "" }, sessions: [], archived }, archOpen: true, reviving: [archKey(archived[0])] });
  assert.deepEqual(open.parked.shown.map((one) => one.key), archived.slice(0, ARCH_SHOWN).map(archKey));
  assert.equal(open.parked.label, "Archived");
  assert.equal(open.parked.shown[0].when, "coming back…", "a chat coming back says so in place of its age");
  assert.equal(open.parked.shown[1].when, "3d");
  assert.equal(open.parked.shown[1].revive, "Revive", "reviving is an icon with its word in the tip");
  assert.equal(open.parked.more, "Show 1 more");
  st.archShown += 10;
  const more = mirror.railViewModel();
  assert.equal(more.parked.shown.length, ARCH_SHOWN + 1);
  assert.equal(more.parked.more, "");
  st.archShown = ARCH_SHOWN;
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
  assert.deepEqual([...host.querySelectorAll(".rail-seg [data-show]")].map((b) => b.dataset.show), ["all", "local"], "the cloud filter waits for a chat in the cloud");
  assert.equal(host.querySelector(".rail-seg b"), null, "the count went to the tip");
  assert.equal(host.querySelector("[data-show='local']").title, "1 chat");
  mirror.showOnRail("cloud");
  assert.equal(st.railShows, "cloud");
  assert.ok(host.querySelector("[data-show='cloud'][aria-pressed='true']"), "the filter in use stays even with nothing in it");
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

test("every chat with no place on the grid sits under off screen, each saying why it is there", () => {
  flag(true);
  hidden.clear();
  mirror.setHiddenOpen(true);
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana" }), seat("ends", { state: "working" }), seat("works"), seat("kid", { by: "gone" }), seat("away")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a", "ends", "works"] }],
    detached: ["away"]
  });
  hideSeat("ends", "ends");
  hideSeat("works");
  const model = mirror.railViewModel();
  const off = model.groups.find((g) => g.key === "loose");
  assert.equal(off.label, "off screen");
  assert.deepEqual(off.items.map((it) => [it.key, it.why]), [
    ["ends", "back when it finishes"],
    ["works", "back when it works"],
    ["kid", "opened by gone"],
    ["away", "in a window of its own"]
  ]);
  assert.equal(model.snoozed, null, "the hidden chats are not listed twice");
  hidden.clear();
});

test("a chat another chat opened sits under its opener, and the caret folds its subchats", () => {
  flag(true);
  hidden.clear();
  st.subchatsShut.clear();
  const data = {
    pod: { up: false, name: "" }, archived: [],
    sessions: [
      seat("bucket", { title: "Migração de Bucket" }),
      seat("files", { title: "Migrar fileslivros", by: "bucket", state: "working" }),
      seat("capas", { title: "Migrar capas", by: "bucket", state: "needs" }),
      seat("deep", { by: "files" }),
      seat("other")
    ]
  };
  let model = world({ data, blocks: [{ id: "b1", ws: "w0", keys: ["bucket", "other"] }] });
  assert.deepEqual(rows(model), ["bucket", "other"], "a subchat is no row of a block of its own");
  assert.ok(!model.groups.some((g) => g.key === "loose"), "a subchat whose opener is on the rail is not off screen");
  const opener = model.groups[0].items[0];
  assert.deepEqual(opener.kids.items.map((it) => it.key), ["files", "capas"]);
  assert.deepEqual(opener.kids.dots, ["working", "needs"]);
  assert.equal(opener.kids.open, true);
  assert.equal(opener.kids.sumSaid, "2 subchats open");
  assert.deepEqual(opener.kids.items[0].kids.items.map((it) => it.key), ["deep"], "a subchat of a subchat nests one step further");
  mirror.paintRail();
  assert.deepEqual(mirror.railKeys(), ["bucket", "files", "deep", "capas", "other"], "the keyboard walks the subchats in the order they are drawn");

  mirror.toggleSubchats("bucket");
  model = mirror.railViewModel();
  assert.equal(model.groups[0].items[0].kids.open, false, "the caret folds them");
  assert.equal(model.groups[0].items[0].kids.toggleSay, "Show its subchats");

  model = world({ data, blocks: [{ id: "b1", ws: "w0", keys: ["bucket", "other"] }], open: "capas" });
  const unfolded = model.groups[0].items[0];
  assert.equal(unfolded.kids.open, true, "the open subchat unfolds its opener");
  assert.equal(unfolded.kids.items.find((it) => it.key === "capas").sel, true);
  st.subchatsShut.clear();
});

test("a settled subchat folds into its opener as a count, not into the settled shelf", () => {
  flag(true);
  hidden.clear();
  st.subchatsShut.clear();
  st.subchatsDoneOpen.clear();
  const at = Date.now() + 1000;
  const data = {
    pod: { up: false, name: "" }, archived: [],
    sessions: [seat("desk", { title: "Produção de texto" }), seat("review", { title: "Review do papel", by: "desk" }), seat("alone")],
    marks: { review: { settledAt: at, at }, alone: { settledAt: at, at } }
  };
  world({ data, blocks: [{ id: "b1", ws: "w0", keys: ["desk"] }] });
  adoptSeatMarks();
  let model = mirror.railViewModel();
  const desk = model.groups.find((g) => g.key === "b1").items[0];
  assert.deepEqual(desk.kids.items, [], "a settled subchat is no open subchat");
  assert.deepEqual(desk.kids.dots, []);
  assert.equal(desk.kids.settled.say, "1 settled");
  assert.equal(desk.kids.settled.open, false);
  assert.equal(desk.kids.sumSaid, "1 subchat, settled");
  const shelf = model.groups.find((g) => g.shelf === "settled");
  assert.deepEqual(shelf.items.map((it) => it.key), ["alone"], "the settled shelf keeps only the chats with no opener on the rail");
  mirror.paintRail();
  $("rail-sessions").querySelector('[data-kids-done="desk"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  model = mirror.railViewModel();
  const unfolded = model.groups.find((g) => g.key === "b1").items[0].kids.settled;
  assert.deepEqual(unfolded.items.map((it) => it.key), ["review"]);
  assert.equal(unfolded.items[0].act.act, "unsettle", "a settled subchat can be reopened from its opener");
  st.subchatsDoneOpen.clear();
});

test("folding the opener of the open subchat goes back to the opener", () => {
  flag(true);
  hidden.clear();
  st.subchatsShut.clear();
  world({
    data: { pod: { up: false, name: "" }, archived: [], sessions: [seat("bucket", { title: "Migração de Bucket" }), seat("files", { title: "Migrar fileslivros", by: "bucket" }), seat("deep", { by: "files" }), seat("other")] },
    blocks: [{ id: "b1", ws: "w0", keys: ["other", "bucket"] }],
    open: "deep"
  });
  mirror.toggleSubchats("bucket");
  assert.ok(st.subchatsShut.has("bucket"), "the fold closed");
  assert.equal(st.open, null, "the subchat left the screen");
  assert.equal(st.focus, 1, "the opener took the focus in its block");
  assert.equal(mirror.railViewModel().groups[0].items.find((it) => it.key === "bucket").kids.open, false);
  mirror.toggleSubchats("bucket");
  assert.ok(!st.subchatsShut.has("bucket"), "with no subchat open the caret only unfolds");
  st.subchatsShut.clear();
});

test("the rail draws the subchats under their opener, and the caret click folds them", () => {
  flag(true);
  hidden.clear();
  st.subchatsShut.clear();
  world({
    data: { pod: { up: false, name: "" }, archived: [], sessions: [seat("bucket", { title: "Migração de Bucket" }), seat("files", { title: "Migrar fileslivros", by: "bucket" })] },
    blocks: [{ id: "b1", ws: "w0", keys: ["bucket"] }]
  });
  mirror.paintRail();
  const host = $("rail-sessions");
  assert.deepEqual([...host.querySelectorAll(".rail-kids .item")].map((el) => el.dataset.name), ["files"]);
  const caret = host.querySelector('[data-kids-toggle="bucket"]');
  assert.ok(caret, "the opener row has a caret");
  caret.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.ok(st.subchatsShut.has("bucket"));
  assert.equal(host.querySelector(".rail-kids"), null, "folded, the subchats leave the rail");
  st.subchatsShut.clear();
});

test("off screen folds to a count, and a search opens it again", () => {
  flag(true);
  hidden.clear();
  const data = { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b", { title: "Bia" })], archived: [] };
  world({ data, blocks: [{ id: "b1", ws: "w0", keys: ["a", "b"] }] });
  hideSeat("b");
  mirror.setHiddenOpen(false);
  const shut = mirror.railViewModel().groups.find((g) => g.key === "loose");
  assert.deepEqual([shut.fold, shut.items], [{ open: false, count: 1 }, []]);
  const found = world({ data, blocks: st.blocks, query: "bia" }).groups.find((g) => g.key === "loose");
  assert.deepEqual(found.items.map((it) => it.key), ["b"]);
  mirror.setHiddenOpen(true);
  hidden.clear();
});

test("an off-screen row is two lines and keeps one line in the narrow rail", () => {
  assert.match(sheet, /#rail \.item\.off \{[^}]*height: auto/);
  assert.match(sheet, /\.item\.off \.why \{/);
  assert.match(sheet, /#shell\.rail-min #rail-sessions \.item\.off \{[^}]*height: 24px/);
});

test("a parked chat says on the rail until when it is parked", () => {
  flag(true);
  hidden.clear();
  mirror.setHiddenOpen(true);
  const until = new Date(Date.now() + 2 * 60 * 60 * 1000);
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("p", { parked: { until: until.getTime(), task: "measure", at: 1 } })], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a", "p"] }]
  });
  hideSeat("p", "parked");
  const off = mirror.railViewModel().groups.find((g) => g.key === "loose");
  assert.deepEqual(off.items.map((it) => it.key), ["p"]);
  assert.equal(off.items[0].why, `parked till ${mirror.parkWhen(until.getTime())}`);
  assert.match(mirror.parkWhen(until.getTime(), new Date(until.getTime() - 60000)), /^\d{2}:\d{2}/);
  hidden.clear();
});

test("a row draws no state word: the dot says it to a screen reader, and only a working chat shows its time", async () => {
  if (!mirror.railSolid) (await app("shared")).bootSolid();
  flag(true);
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a", { title: "Ana", state: "needs" }), seat("w", { title: "Wil", state: "working" }), seat("d", { title: "Dora", state: "ready" }), seat("z", { title: "Zeca" })], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a", "w", "d", "z"] }]
  });
  mirror.paintRail();
  const host = $("rail-sessions");
  const row = (name) => host.querySelector(`.item[data-name='${name}']`);
  assert.equal(row("a").title, "Ana — needs you");
  assert.equal(row("a").querySelector(".rc-dot").getAttribute("role"), "img");
  assert.equal(row("a").querySelector(".rc-dot").getAttribute("aria-label"), "needs you");
  assert.equal(row("a").querySelector(".meta"), null, "the state word came back to the corner");
  assert.equal(row("d").querySelector(".meta"), null, "a ready chat wears a dash again");
  assert.equal(row("z").querySelector(".meta"), null, "an idle chat wears zzz again");
  assert.match(row("w").querySelector(".meta").textContent, /^\d+s$/);
  flag(false);
});

test("a block title is its name alone: no on-screen tag, the key stays", async () => {
  if (!mirror.railSolid) (await app("shared")).bootSolid();
  flag(true);
  const model = world({ data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b")], archived: [] }, blocks: [{ id: "b1", ws: "w0", keys: ["a"] }, { id: "b2", ws: "w0", keys: ["b"] }] });
  assert.equal(model.groups.some((g) => "hereSaid" in g), false);
  mirror.paintRail();
  const title = $("rail-sessions").querySelector(".rail-blk.cur > .group-title");
  assert.equal(title.querySelector("span").textContent, "block 1");
  assert.equal(title.querySelector(".on-screen"), null);
  assert.equal(title.querySelector(".rc-key").textContent, keyLabel(st.keys.block, 1));
  flag(false);
});

test("the rail headers read in sentence case sans, the rows breathe, and the block on screen sits in no box", () => {
  const rule = (selector) => {
    const at = sheet.indexOf(`:where(body.experience-raycast) ${selector} {`);
    assert.ok(at >= 0, `no rule for ${selector}`);
    return sheet.slice(at, sheet.indexOf("}", at));
  };
  const title = rule(".group-title");
  assert.match(title, /font: 500 12px var\(--sans\)/);
  assert.match(title, /text-transform: none/);
  assert.doesNotMatch(title, /var\(--mono\)/);
  assert.match(rule(".group-title > span:first-of-type::first-letter"), /text-transform: uppercase/);
  assert.match(rule("#rail-sessions .rail-blk > .item + .item"), /margin-top: 2px/);
  assert.match(rule(".rail-blk"), /margin-top: 12px/, "a block title sits 12px under the chat above it");
  assert.doesNotMatch(sheet, /\.rail-blk\.cur \{/, "the block on screen got its box back");
  assert.doesNotMatch(sheet, /\.rail-seg button b/);
  assert.match(rule(".item .meta"), /font: 400 12px var\(--sans\); font-variant-numeric: tabular-nums;/);
});

test("the filter fills the head of the rail: the room for the fold button is kept only while that button sits in the rail", () => {
  const place = readFileSync(join(HERE, "assets/draft-place.css"), "utf8");
  const ruleIn = (text, selector) => {
    const at = text.indexOf(`:where(body.experience-raycast) ${selector} {`);
    assert.ok(at >= 0, `no rule for ${selector}`);
    return text.slice(at, text.indexOf("}", at));
  };
  assert.match(ruleIn(sheet, ".rail-head"), /padding: 8px var\(--rail-toggle-room, 0px\) 8px 0;/);
  assert.match(ruleIn(sheet, "#shell:has(> #rail-toggle)"), /--rail-toggle-room: 32px/);
  assert.match(ruleIn(sheet, ".rail-seg"), /flex: 1;/);
  assert.match(ruleIn(place, ".rail-new"), /margin-right: calc\(-1 \* var\(--rail-toggle-room, 0px\)\);/);
});

test("a row with a pull request and many subchats never scrolls the rail sideways: the dots give way, whole, and the caret stays", () => {
  const rule = (selector) => {
    const at = sheet.indexOf(`:where(body.experience-raycast) ${selector} {`);
    assert.ok(at >= 0, `no rule for ${selector}`);
    return sheet.slice(at, sheet.indexOf("}", at));
  };
  assert.match(rule("#rail-list"), /overflow-x: hidden;/);
  const dots = rule(".item .rkids-sum");
  assert.match(dots, /flex: 0 1 auto;/, "the dots shrink before the row spills");
  assert.match(dots, /min-width: 6px;/, "one dot always shows");
  assert.match(dots, /flex-wrap: wrap;[^}]*height: 6px;[^}]*overflow: hidden;/, "a dot that does not fit drops whole, never cut in half");
  assert.match(rule(".item .rkids-toggle"), /flex: none;/);
});

const railDrag = (kind, on) => {
  const ev = new window.Event(kind, { bubbles: true, cancelable: true });
  ev.dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
  on.dispatchEvent(ev);
  return ev;
};

test("a block group knows its block even in another workspace, and the other groups know none", () => {
  flag(true);
  const model = world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b"), seat("loose")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a"] }, { id: "b2", ws: "w1", keys: ["b"] }]
  });
  const group = (key) => model.groups.find((g) => g.key === key);
  assert.equal(group("b1").to, 0);
  assert.equal(group("b2").to, 1);
  assert.equal(group("loose").to, undefined);
  flag(false);
});

test("a chat dragged on the rail onto a block's name moves there, and a full block opens the trade list", async () => {
  if (!mirror.railSolid) (await app("shared")).bootSolid();
  flag(true);
  const limit = st.LIMIT;
  st.LIMIT = 2;
  const paint = (blocks) => {
    const sessions = blocks.flatMap((b) => b.keys).map((name) => seat(name, { title: name.toUpperCase() }));
    world({ data: { pod: { up: false, name: "" }, sessions, archived: [] }, blocks });
    mirror.paintRail();
  };
  const host = $("rail-sessions");
  const row = (name) => host.querySelector(`.item[data-name='${name}']`);
  const title = (i) => host.querySelector(`.rail-blk[data-to='${i}'] > .group-title`);
  const kept = () => st.blocks.map((b) => [...b.keys]);

  paint([{ id: "b1", ws: "w0", keys: ["a", "b"] }, { id: "b2", ws: "w0", keys: ["c"] }]);
  let carried = row("a");
  railDrag("dragstart", carried);
  assert.equal(st.dragSeat, "a");
  assert.ok(carried.classList.contains("lifting"));
  assert.equal(railDrag("dragover", title(0)).defaultPrevented, false, "its own block is no place to drop");
  assert.equal(railDrag("dragover", row("c")).defaultPrevented, false, "a chat row stays the context drop");
  assert.equal(railDrag("dragover", title(1)).defaultPrevented, true);
  assert.ok(title(1).classList.contains("drop"));
  assert.equal(document.getElementById("btrade"), null, "a block with room takes it without a trade");
  railDrag("drop", title(1));
  railDrag("dragend", carried);
  assert.deepEqual(kept(), [["b"], ["c", "a"]]);
  assert.equal(st.dragSeat, null);
  assert.equal(host.querySelector(".lifting, .drop"), null);
  assert.equal(document.body.classList.contains("seat-dragging"), false);

  paint([{ id: "b1", ws: "w0", keys: ["a", "b"] }, { id: "b2", ws: "w0", keys: ["c", "d"] }]);
  carried = row("a");
  railDrag("dragstart", carried);
  railDrag("dragover", title(1));
  const box = document.getElementById("btrade");
  assert.deepEqual([...box.querySelectorAll(".row")].map((one) => one.dataset.key), ["c", "d"]);
  assert.equal(box.querySelector(".foot").textContent, "dropping on the block's name, and not on a chat, trades with the last.");
  railDrag("drop", box.querySelector(".row[data-key='c']"));
  mirror.paintRail();
  assert.notEqual(row("a"), carried, "the rail draws the moved chat anew in its new block");
  railDrag("dragend", carried);
  assert.deepEqual(kept(), [["c", "b"], ["a", "d"]]);
  assert.equal(document.getElementById("btrade"), null);
  assert.equal(st.dragSeat, null, "the drag ends even when its row left the rail");
  assert.equal(document.body.classList.contains("seat-dragging"), false);

  paint([{ id: "b1", ws: "w0", keys: ["a", "b"] }, { id: "b2", ws: "w0", keys: ["c", "d"] }]);
  carried = row("a");
  railDrag("dragstart", carried);
  railDrag("dragover", title(1));
  railDrag("drop", title(1));
  railDrag("dragend", carried);
  assert.deepEqual(kept(), [["d", "b"], ["c", "a"]], "the block's name trades with its last chat");

  st.LIMIT = limit;
  flag(false);
});

test("a chat with no place in a block, or in a mate's hive, is carried only as context", async () => {
  if (!mirror.railSolid) (await app("shared")).bootSolid();
  flag(true);
  st.dragSeat = null;
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b"), seat("loose")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a"] }, { id: "b2", ws: "w0", keys: ["b"] }]
  });
  mirror.paintRail();
  const host = $("rail-sessions");
  const loose = document.createElement("div");
  loose.className = "item";
  loose.dataset.name = "loose";
  host.appendChild(loose);
  railDrag("dragstart", loose);
  assert.equal(st.dragSeat, null);
  loose.remove();
  st.mirrorDev = "mate";
  railDrag("dragstart", host.querySelector(".item[data-name='a']"));
  assert.equal(st.dragSeat, null);
  st.mirrorDev = "";
  flag(false);
});

test("the block name a chat is dragged over lights up without growing, and the carried row fades", () => {
  const rule = (selector) => {
    const at = sheet.indexOf(`:where(body.experience-raycast) ${selector} {`);
    assert.ok(at >= 0, `no rule for ${selector}`);
    return sheet.slice(at, sheet.indexOf("}", at));
  };
  assert.match(rule("#rail-sessions .group-title.drop"), /box-shadow: inset 0 0 0 1px var\(--accent\)/);
  assert.doesNotMatch(rule("#rail-sessions .group-title.drop"), /padding|margin|height|border:/);
  assert.match(rule("#rail-sessions .item.lifting"), /opacity/);
});

test("a block dragged by its name on the rail moves above or below another, and the drag leaves nothing behind", async () => {
  if (!mirror.railSolid) (await app("shared")).bootSolid();
  flag(true);
  st.dragSeat = null;
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b"), seat("c")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a"], manual: true }, { id: "b2", ws: "w0", keys: ["b"], manual: true }, { id: "b3", ws: "w0", keys: ["c"], manual: true }]
  });
  mirror.paintRail();
  const host = $("rail-sessions");
  const box = (i) => host.querySelector(`.rail-blk[data-to='${i}']`);
  const head = (i) => box(i).querySelector(":scope > .group-title");
  const order = () => st.blocks.map((b) => b.id);
  const over = (kind, on, below) => {
    const ev = new window.Event(kind, { bubbles: true, cancelable: true });
    ev.dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
    ev.clientY = below ? 1 : 0;
    on.dispatchEvent(ev);
    return ev;
  };

  assert.equal(head(0).getAttribute("draggable"), "true");
  const carried = head(2);
  railDrag("dragstart", carried);
  assert.equal(st.dragBlock, "b3");
  assert.equal(st.dragSeat, null, "a block on the move carries no chat");
  assert.ok(box(2).classList.contains("lifting"));
  assert.equal(over("dragover", carried, false).defaultPrevented, false, "its own place is no place to drop");
  assert.equal(over("dragover", head(1), true).defaultPrevented, false, "below the block above it is where it already is");
  assert.equal(over("dragover", head(0), false).defaultPrevented, true);
  assert.ok(box(0).classList.contains("drop-above"));
  assert.equal(over("dragover", host.querySelector(".item[data-name='a']"), true).defaultPrevented, true);
  assert.ok(box(0).classList.contains("drop-below"));
  assert.equal(box(0).classList.contains("drop-above"), false);
  over("drop", head(0), false);
  railDrag("dragend", carried);
  assert.deepEqual(order(), ["b3", "b1", "b2"]);
  assert.equal(st.dragBlock, null);
  assert.equal(host.querySelector(".lifting, .drop-above, .drop-below"), null);
  assert.equal(document.body.classList.contains("block-dragging"), false);
  assert.equal(host.querySelector(".rail-blk[data-to='0'] > .group-title + .item").dataset.name, "c");
  flag(false);
});

test("a block from another workspace is shown on the rail but cannot be dragged", () => {
  flag(true);
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a"] }, { id: "b2", ws: "w1", keys: ["b"] }]
  });
  mirror.paintRail();
  const head = (i) => $("rail-sessions").querySelector(`.rail-blk[data-to='${i}'] > .group-title`);
  assert.equal(head(0).getAttribute("draggable"), "true");
  assert.equal(head(1).getAttribute("draggable"), null);
  flag(false);
});

test("the block being dragged fades and the drop line sits on its edge without moving anything", () => {
  const rule = (selector) => {
    const at = sheet.indexOf(`:where(body.experience-raycast) ${selector} {`);
    assert.ok(at >= 0, `no rule for ${selector}`);
    return sheet.slice(at, sheet.indexOf("}", at));
  };
  assert.match(rule("#rail-sessions .rail-blk.lifting"), /opacity/);
  for (const side of ["drop-above", "drop-below"]) {
    assert.match(rule(`#rail-sessions .rail-blk.${side}`), /box-shadow: 0 -?2px 0 var\(--accent\)/);
    assert.doesNotMatch(rule(`#rail-sessions .rail-blk.${side}`), /padding|margin|height|border:/);
  }
});

test("a block dropped in the gap between blocks lands by the nearest one, and far from every block it stays put", async () => {
  if (!mirror.railSolid) (await app("shared")).bootSolid();
  flag(true);
  st.dragSeat = null;
  world({
    data: { pod: { up: false, name: "" }, sessions: [seat("a"), seat("b"), seat("c")], archived: [] },
    blocks: [{ id: "b1", ws: "w0", keys: ["a"], manual: true }, { id: "b2", ws: "w0", keys: ["b"], manual: true }, { id: "b3", ws: "w0", keys: ["c"], manual: true }]
  });
  mirror.paintRail();
  const host = $("rail-sessions");
  const box = (i) => host.querySelector(`.rail-blk[data-to='${i}']`);
  [0, 1, 2].forEach((i) => { box(i).getBoundingClientRect = () => ({ top: 100 + i * 64, bottom: 152 + i * 64, height: 52 }); });
  const order = () => st.blocks.map((b) => b.id);
  const at = (kind, y) => {
    const ev = new window.Event(kind, { bubbles: true, cancelable: true });
    ev.dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
    ev.clientY = y;
    host.dispatchEvent(ev);
    return ev;
  };
  const carried = box(2).querySelector(":scope > .group-title");
  railDrag("dragstart", carried);
  assert.equal(at("dragover", 158).defaultPrevented, true, "the gap under block 1 is below block 1");
  assert.ok(box(0).classList.contains("drop-below"));
  assert.equal(at("dragover", 600).defaultPrevented, false, "the empty rail far below is no place to drop");
  assert.equal(host.querySelector(".drop-above, .drop-below"), null, "the line goes away with the pointer");
  at("drop", 600);
  assert.deepEqual(order(), ["b1", "b2", "b3"]);
  at("dragover", 158);
  at("drop", 158);
  railDrag("dragend", carried);
  assert.deepEqual(order(), ["b1", "b3", "b2"]);
  flag(false);
});
