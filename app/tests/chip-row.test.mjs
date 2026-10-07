import { test } from "node:test";
import assert from "node:assert/strict";
import { treesThatFit } from "../src/app/chip-row.js";

test("every worktree stays when the row has room for all of them", () => {
  assert.equal(treesThatFit({ room: 600, gap: 5, fixed: [], trees: [140, 120, 110], more: 30 }), 3);
});

test("the first worktree shrinks down to 80px before any other one is folded into the count", () => {
  assert.equal(treesThatFit({ room: 80 + 5 + 120, gap: 5, fixed: [], trees: [300, 120], more: 30 }), 2);
});

test("what does not fit after the first one shrinks is folded, leaving room for the +N", () => {
  assert.equal(treesThatFit({ room: 300, gap: 5, fixed: [], trees: [200, 120, 110, 100], more: 30 }), 2);
  assert.equal(treesThatFit({ room: 120, gap: 5, fixed: [], trees: [200, 120, 110], more: 30 }), 1);
});

test("the lent keyboard never shrinks, so it takes its room first", () => {
  assert.equal(treesThatFit({ room: 330, gap: 5, fixed: [140], trees: [200, 120], more: 30 }), 1);
  assert.equal(treesThatFit({ room: 350, gap: 5, fixed: [140], trees: [200, 120], more: 30 }), 2);
});

test("one worktree alone is never folded", () => {
  assert.equal(treesThatFit({ room: 10, gap: 5, fixed: [200], trees: [300], more: 30 }), 1);
});
