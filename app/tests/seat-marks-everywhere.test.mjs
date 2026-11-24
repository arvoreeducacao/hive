import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const sent = [];
const erased = [];
const realFetch = globalThis.fetch;
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = (url, init) => {
  if (String(url).includes("/api/inbox/marks")) {
    sent.push(JSON.parse(init.body));
    return Promise.resolve(answered({ ok: true, taken: [], settled: [], marks: {} }));
  }
  if (String(url).includes("/api/seat/erase")) {
    erased.push(JSON.parse(init.body));
    return Promise.resolve(answered({ ok: true }));
  }
  return Promise.resolve(answered({ sessions: [], state: "clean", files: [] }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { runHud } = await app("hud");
const { setStructure } = await app("structure");
const mirror = await app("mirror");
const marks = await app("seat-marks");
const { marksMenuRows } = await app("seat-marks-menu");
const { seatMenuCommands } = await app("seat-menu");
const { shelvesModel } = await app("seat-shelves");

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
const seat = (name, extra = {}) => ({ name, title: `chat ${name}`, where: "local", state: "idle", kind: "chat", finish: { at: ago(0.01) }, ...extra });

function lay() {
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: ["a", "b", "c", "d"].map((name) => seat(name)), spawning: [], archived: [], pod: { up: false, name: "" }, marks: {} };
  st.prs = [];
  st.team = { me: "jonas", devs: [] };
  st.data.spawning = [];
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["a", "b"] }, { id: "b1", ws: "w0", label: "", manual: true, keys: ["c", "d"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.railQuery = "";
  st.railShows = "all";
  render();
}

const inBlocks = (name) => st.blocks.some((b) => b.keys.includes(name));
const groupsOf = () => mirror.railViewModel().groups;
const shelf = (id) => groupsOf().find((g) => g.shelf === id);

lay();

test("the menu of a chat offers pin, settle, snooze with the options, settle on its own and delete for good", () => {
  const rows = marksMenuRows(st.data.sessions[0]);
  assert.deepEqual(rows.map((one) => one.label), ["Open beside", "Pin", "Settle", "Snooze", "Settle on its own"]);
  const snooze = rows[3].sub.filter((one) => !one.sep).map((one) => one.label);
  assert.ok(snooze.length >= 4, "the options of the menu plus Custom and Edit");
  assert.deepEqual(snooze.slice(-2), ["Custom…", "Edit options…"]);
  assert.deepEqual(rows[4].sub.map((one) => one.label), ["Follow settings", "Never"]);
  assert.ok(seatMenuCommands(st.data.sessions[0]).some((one) => one.label === "Delete for good…"), "the cockpit commands carry them too");
  assert.deepEqual(marksMenuRows({ name: "anon-1", anon: true }), [], "an anonymous chat is erased on close and has no marks");
});

test("settling a chat in the classic takes it out of its block into Settled, and undo puts it back where it was", () => {
  marks.settleSeats(["a"]);
  assert.equal(inBlocks("a"), false);
  const settled = shelf("settled");
  assert.deepEqual(settled.items.map((one) => one.key), ["a"]);
  assert.deepEqual(settled.items[0].act, { act: "unsettle", say: "Reopen" });
  assert.ok(sent.at(-1).marks.a.settledAt, "the mark goes to the hive");
  assert.ok(runHud(), "the undo of the notice runs");
  render();
  assert.equal(marks.seatSection("a"), "active");
  assert.deepEqual([...st.blocks[0].keys].sort(), ["a", "b"], "it lands back in its own block");
  assert.equal(shelf("settled"), undefined);
});

test("opening a settled chat shows it without reopening it, and leaving it puts it back on the shelf", async () => {
  const { goTo } = await app("focus-navigation");
  marks.settleSeats(["c"], { undo: false });
  assert.equal(inBlocks("c"), false);
  goTo("c");
  assert.equal(inBlocks("c"), true);
  assert.equal(marks.seatSection("c"), "settled");
  const settled = shelf("settled");
  assert.ok(settled.items.find((one) => one.key === "c")?.sel, "it stays on the shelf, picked");
  goTo("b");
  render();
  assert.equal(inBlocks("c"), false);
  marks.unsettleSeats(["c"]);
  render();
  assert.equal(inBlocks("c"), true);
});

test("a snoozed chat waits on its shelf with Wake, and comes back marked when its time runs out", () => {
  marks.snoozeSeats(["d"], Date.now() + 3600000, { undo: false });
  assert.equal(inBlocks("d"), false);
  const snoozed = shelf("snoozed");
  assert.deepEqual(snoozed.items.map((one) => one.key), ["d"]);
  assert.equal(snoozed.items[0].act.act, "wake");
  assert.match(snoozed.items[0].why, /^back /);
  marks.snoozeSeats(["d"], Date.now() - 1, { undo: false });
  render();
  assert.equal(inBlocks("d"), true);
  const row = groupsOf().flatMap((g) => g.items).find((one) => one.key === "d");
  assert.deepEqual(row.tag, { say: "Woke", tone: "woke" });
  marks.seenSeat("d");
  render();
  assert.equal(groupsOf().flatMap((g) => g.items).find((one) => one.key === "d").tag, null);
});

test("a pinned chat sits in Pinned at the top, and its pin is the button that unpins", () => {
  marks.togglePinSeat("b");
  const groups = groupsOf();
  assert.equal(groups[0].key, "pinned");
  assert.deepEqual(groups[0].items.map((one) => one.key), ["b"]);
  assert.equal(groups[0].items[0].pinned, true);
  mirror.paintRail();
  const unpin = $("rail-sessions").querySelector('[data-unpin="b"]');
  assert.ok(unpin, "the pin is drawn in the row");
  unpin.click();
  assert.equal(marks.seatSection("b"), "active");
});

test("the settled shelf shows five and offers the rest", () => {
  st.data.sessions.push(...["e", "f", "g", "h", "i", "j"].map((name) => seat(name)));
  marks.settleSeats(["a", "c", "e", "f", "g", "h", "i", "j"], { undo: false });
  st.railShelves.more = false;
  st.railShelves.settled = true;
  const settled = shelf("settled");
  assert.equal(settled.fold.count, 8);
  assert.equal(settled.items.length, 5);
  assert.equal(settled.more, "Show 3 more");
  marks.unsettleSeats(["a", "c", "e", "f", "g", "h", "i", "j"]);
  st.data.sessions.splice(4);
  render();
});

test("in a structure with no rail the shelves sit in a dock, and in the stage they close the column", () => {
  marks.settleSeats(["a"], { undo: false });
  marks.snoozeSeats(["c"], Date.now() + 3600000, { undo: false });
  setStructure("map", { quiet: true });
  render();
  const dock = document.getElementById("shelves-dock");
  assert.equal(dock.hidden, false);
  assert.match(dock.querySelector(".shv-pill").textContent, /1 snoozed.*1 settled/);
  dock.querySelector(".shv-pill").click();
  render();
  const reopen = dock.querySelector('[data-shelves-act="unsettle"][data-of="a"]');
  assert.ok(reopen, "Reopen is on the row of the settled chat");
  reopen.click();
  render();
  assert.equal(marks.seatSection("a"), "active");
  assert.deepEqual(shelvesModel().snoozed.map((one) => one.name), ["c"]);
  setStructure("stage", { quiet: true });
  render();
  assert.equal(document.getElementById("shelves-dock").hidden, true, "the stage draws them in its own column");
  assert.ok($("structure-root").querySelector('.stg-wing .seat-shelves [data-shelves-act="wake"][data-of="c"]'));
  marks.wakeSeats(["c"]);
  setStructure("classic", { quiet: true });
  render();
  assert.equal(document.getElementById("shelves-dock").hidden, true);
});

test("in the inbox a settled chat opens from its shelf and stays settled", () => {
  lay();
  marks.settleSeats(["d"], { undo: false });
  st.LIMIT = 2;
  setStructure("inbox", { quiet: true });
  render();
  const root = $("structure-root");
  const shelf = root.querySelector('.tx-shelf[data-shelf="settled"]');
  if (shelf.getAttribute("aria-expanded") !== "true") shelf.click();
  root.querySelector('.tx-row[data-key="d"]').click();
  assert.equal(root.querySelector(".tx-row.sel")?.dataset.key, "d");
  assert.equal(marks.seatSection("d"), "settled");
  marks.unsettleSeats(["d"]);
  setStructure("classic", { quiet: true });
  st.LIMIT = 4;
  render();
});

test("with the setting on, unpinning and archiving ask first, and a no keeps the chat as it was", async () => {
  const { archiveSeatNow } = mirror;
  st.confirm = { unpin: true, archive: true };
  await marks.togglePinSeat("b");
  assert.equal(marks.seatSection("b"), "pinned", "pinning never asks");
  const unpinning = marks.togglePinSeat("b");
  assert.match($("c-title").textContent, /Unpin “chat b”\?/);
  st.confirmResolve(false);
  await unpinning;
  assert.equal(marks.seatSection("b"), "pinned");
  const archiving = archiveSeatNow(st.data.sessions.find((one) => one.name === "b"));
  assert.match($("c-title").textContent, /Archive “chat b”\?/);
  st.confirmResolve(false);
  await archiving;
  const again = marks.togglePinSeat("b");
  st.confirmResolve(true);
  await again;
  assert.equal(marks.seatSection("b"), "active");
  st.confirm = undefined;
});

test("deleting for good asks first, and only a yes reaches the hive", async () => {
  const { askToErase } = await app("seat-marks-menu");
  const asking = askToErase([{ name: "b", where: "local", title: "chat b" }]);
  assert.ok($("confirm").classList.contains("on"));
  assert.match($("c-title").textContent, /Delete “chat b” for good\?/);
  st.confirmResolve(false);
  assert.equal(await asking, false);
  assert.deepEqual(erased, []);
  const again = askToErase([{ name: "b", where: "local", title: "chat b" }]);
  st.confirmResolve(true);
  await again;
  assert.deepEqual(erased, [{ name: "b", where: "local" }]);
  lay();
});
