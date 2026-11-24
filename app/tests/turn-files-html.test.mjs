import { test } from "node:test";
import assert from "node:assert/strict";
import "./dom.mjs";

const { checkpointsOfTurns, pathIn, turnFilesHtml, turnFilesTree } = await import(new URL("../src/app/turn-files-html.js", import.meta.url).href);

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const phrase = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (_, key) => String(vars[key]));
const ctx = { esc, phrase };

const PATHS = [
  { path: "app/src/app/turn-files.js", added: 10, removed: 2 },
  { path: "app/src/app/turn-files-html.js", added: 80, removed: 0 },
  { path: "app/tests/turn-files.test.mjs", added: 5, removed: 1 },
  { path: "README.md", added: 1, removed: 1 }
];

const TURN = { ordinal: 4, at: 5000, files: 4, added: 96, removed: 4, paths: PATHS };

test("the files of a turn grow into a tree: folders first, a lone folder chain folded into one row, each folder summing its files", () => {
  const [app, readme] = turnFilesTree(PATHS);
  assert.equal(app.kind, "dir");
  assert.equal(app.name, "app");
  assert.deepEqual([app.added, app.removed], [95, 3]);
  assert.deepEqual(app.children.map((one) => one.name), ["src/app", "tests"]);
  assert.deepEqual(app.children[0].children.map((one) => one.name), ["turn-files-html.js", "turn-files.js"]);
  assert.equal(readme.kind, "file");
});

test("a checkpoint belongs to the last turn asked before it was kept, and a baseline or an empty one to none", () => {
  const list = [{ ordinal: 1, at: 0, baseline: true, files: 0 }, { ordinal: 2, at: 2000, files: 1 }, { ordinal: 3, at: 9000, files: 2 }, { ordinal: 4, at: 9500, files: 0 }];
  const byTurn = checkpointsOfTurns([1000, 5000, 12000], list);
  assert.deepEqual([...byTurn].map(([turn, one]) => [turn, one.ordinal]), [[0, 2], [1, 3]]);
  assert.equal(checkpointsOfTurns([2400], [{ ordinal: 5, at: 2000, files: 1 }]).get(0)?.ordinal, 5, "kept in the same second the turn was asked");
});

test("the card says how many files and lines changed, opens the diff on the first file, and starts with the folders closed", () => {
  const box = document.createElement("div");
  box.innerHTML = turnFilesHtml({ turn: TURN }, ctx);
  assert.match(box.querySelector(".tx-cf-sum").textContent, /4 changed files\+96-4/);
  const open = box.querySelector(".tx-cf-open");
  assert.deepEqual([open.dataset.act, open.dataset.n, open.dataset.file], ["turn-diff", "4", "app/src/app/turn-files.js"]);
  assert.deepEqual([...box.querySelectorAll(".tx-cf-row")].map((one) => one.textContent), ["app+95-3", "README.md+1-1"]);
  assert.equal(box.querySelector('[data-act="cf-all"]').getAttribute("aria-label"), "Expand all folders");
});

test("expanding all folders shows every file, and a folder closed by hand stays closed", () => {
  const box = document.createElement("div");
  box.innerHTML = turnFilesHtml({ turn: TURN, all: true, open: new Map([["app/tests", false]]) }, ctx);
  const rows = [...box.querySelectorAll(".tx-cf-row")];
  assert.deepEqual(rows.map((one) => one.querySelector(".tx-cf-name").textContent), ["app", "src/app", "turn-files-html.js", "turn-files.js", "tests", "README.md"]);
  assert.equal(rows[2].style.paddingLeft, "36px");
  assert.equal(rows[4].getAttribute("aria-expanded"), "false");
});

test("a turn of files at the root draws no folder toggle", () => {
  const box = document.createElement("div");
  box.innerHTML = turnFilesHtml({ turn: { ...TURN, files: 1, paths: [PATHS[3]] } }, ctx);
  assert.equal(box.querySelector('[data-act="cf-all"]'), null);
  assert.match(box.querySelector(".tx-cf-sum").textContent, /^1 changed file/);
});

test("an edit links to the diff of its turn by the path the turn kept, even through a symlinked one", () => {
  assert.equal(pathIn(TURN, "/private/w/hive/README.md"), "README.md");
  assert.equal(pathIn(TURN, "/w/hive/app/src/app/turn-files.js"), "app/src/app/turn-files.js");
  assert.equal(pathIn(TURN, "/w/hive/other.js"), "");
  assert.equal(pathIn(null, "a.js"), "");
});
