import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PER_GROUP, STACKED, activateTerminal, groupHeadersShown, groupWord, nextNumber, normalizeGroups, placeTerminal, removeTerminal, renameTerminal, splitFull, visibleNames } from "../src/app/chat-terminal-groups.js";

const fresh = () => ({ terminals: [], groups: [], active: "" });
const entry = (s, name) => ({ name, n: nextNumber(s) });
const add = (s, name, mode = "new", dir) => placeTerminal(s, entry(s, name), mode, dir);

test("the first terminal is a group of its own and the active one, whatever the mode", () => {
  const s = fresh();
  assert.equal(add(s, "a", "split"), true);
  assert.deepEqual(s.groups.map((group) => group.names), [["a"]]);
  assert.equal(s.active, "a");
  assert.equal(s.terminals[0].n, 1);
  assert.equal(groupWord(s.groups[0]), "Single");
  assert.equal(groupHeadersShown(s), false);
});

test("a split goes right after the active terminal, in its group, and the direction is the group's", () => {
  const s = fresh();
  add(s, "a");
  add(s, "b", "split");
  activateTerminal(s, "a");
  add(s, "c", "split", STACKED);
  assert.deepEqual(s.groups.map((group) => group.names), [["a", "c", "b"]]);
  assert.equal(s.groups[0].dir, STACKED);
  assert.equal(groupWord(s.groups[0]), "Stacked");
  assert.equal(s.active, "c");
  assert.deepEqual(visibleNames(s), ["a", "c", "b"]);
  assert.equal(groupHeadersShown(s), true);
});

test("a group holds at most four, and a split past that is refused without touching anything", () => {
  const s = fresh();
  for (const name of ["a", "b", "c", "d"]) add(s, name, "split");
  assert.equal(MAX_PER_GROUP, 4);
  assert.equal(splitFull(s), true);
  assert.equal(add(s, "e", "split"), false);
  assert.equal(s.terminals.length, 4);
  assert.equal(s.active, "d");
  assert.equal(add(s, "e", "new"), true, "a new terminal still opens, in a group of its own");
  assert.deepEqual(visibleNames(s), ["e"]);
  assert.equal(splitFull(s), false);
});

test("closing the active terminal hands over to the next in its group, then the previous, then the nearest elsewhere", () => {
  const s = fresh();
  add(s, "a");
  add(s, "b", "split");
  add(s, "c", "split");
  add(s, "z");
  activateTerminal(s, "b");
  removeTerminal(s, "b");
  assert.equal(s.active, "c");
  removeTerminal(s, "c");
  assert.equal(s.active, "a");
  removeTerminal(s, "a");
  assert.equal(s.active, "z");
  assert.deepEqual(s.groups.map((group) => group.names), [["z"]]);
  removeTerminal(s, "z");
  assert.equal(s.active, "");
  assert.deepEqual(s.groups, []);
});

test("numbers are the smallest free oneso a closed Terminal 2 is the next one again", () => {
  const s = fresh();
  add(s, "a");
  add(s, "b");
  add(s, "c");
  removeTerminal(s, "b");
  add(s, "d");
  assert.deepEqual(s.terminals.map((one) => one.n), [1, 3, 2]);
});

test("a rename keeps the place, the group and the focus of the terminal", () => {
  const s = fresh();
  add(s, "a");
  add(s, "sh-wanted", "split");
  renameTerminal(s, "sh-wanted", "given");
  assert.deepEqual(s.groups[0].names, ["a", "given"]);
  assert.equal(s.active, "given");
});

test("a stored layout that went wrong is put right: unknown names dropped, every terminal placed once, ids unique", () => {
  const s = {
    terminals: [{ name: "a", n: 1 }, { name: "b", n: 2 }, { name: "c", n: 3 }],
    groups: [{ id: "g", dir: "sideways", names: ["a", "ghost", "a"] }, { id: "g", dir: STACKED, names: ["a", "b"] }],
    active: "ghost"
  };
  normalizeGroups(s);
  assert.deepEqual(s.groups.map((group) => group.names), [["a"], ["b"], ["c"]]);
  assert.equal(new Set(s.groups.map((group) => group.id)).size, 3);
  assert.equal(s.groups[0].dir, "row");
  assert.equal(s.groups[1].dir, STACKED);
  assert.equal(s.active, "a");
});
