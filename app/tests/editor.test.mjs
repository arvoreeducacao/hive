import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { openInEditor, closeEditorTab, editors, editorInBlock, fileKey, baseName, monacoLanguageOf, fileViewModel } =
  await app("files-editor");

const asked = [];
const wasFetch = globalThis.fetch;
globalThis.fetch = async (at) => {
  asked.push(String(at));
  return { ok: true, json: async () => ({ text: "the file", language: "typescript" }) };
};
after(() => { globalThis.fetch = wasFetch; });

const settle = () => new Promise((done) => setTimeout(done, 0));

const shape = () => st.blocks.map((b) => [...b.keys]);

function fresh() {
  editors.clear();
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.blocks = [{ id: "b1", ws: st.space, label: "", manual: false, keys: [] }];
  asked.length = 0;
}

const FILE = { repo: "api", name: "api", branch: "main", path: "src/shared/cron-lock.service.ts", where: "local" };
const OTHER = { ...FILE, path: "src/shared/redis.service.ts" };

test("the file lands in a tile of the block, and the tile is not a seat", async () => {
  fresh();
  const ed = openInEditor(FILE);
  await settle();
  assert.deepEqual(shape(), [[`file:${ed.id}`]]);
  assert.equal(editors.size, 1);
  assert.equal(editorInBlock(), ed);
  assert.equal(st.data.sessions.some((s) => s.name === `file:${ed.id}`), false, "the editor key was taken for a seat");
  assert.equal(ed.tabs.length, 1);
  assert.equal(ed.tabs[0].path, FILE.path);
  assert.equal(ed.tabs[0].where, "local");
});

test("a second file becomes a tab of the editor already on screen", async () => {
  fresh();
  const ed = openInEditor(FILE);
  openInEditor(OTHER);
  await settle();
  assert.deepEqual(shape(), [[`file:${ed.id}`]], "no second tile");
  assert.equal(editorInBlock().tabs.length, 2);
  assert.equal(editorInBlock().active, 1, "the one you just opened is the one you see");
});

test("⇧⏎ opens a second editor instead of another tab", async () => {
  fresh();
  const first = openInEditor(FILE);
  const beside = openInEditor(OTHER, { beside: true });
  await settle();
  assert.notEqual(first.id, beside.id);
  assert.deepEqual(shape(), [[`file:${first.id}`, `file:${beside.id}`]]);
  assert.equal(first.tabs.length, 1);
  assert.equal(beside.tabs.length, 1);
});

test("the same file twice is the same tab, brought forward", async () => {
  fresh();
  openInEditor(FILE);
  openInEditor(OTHER);
  openInEditor(FILE);
  await settle();
  const ed = editorInBlock();
  assert.equal(ed.tabs.length, 2);
  assert.equal(ed.active, 0);
});

test("a hit from the code search carries the line it was found on", async () => {
  fresh();
  openInEditor({ ...FILE, line: 43 });
  await settle();
  assert.equal(editorInBlock().tabs[0].line, 43);
});

test("the file is read from the side it lives on", async () => {
  fresh();
  openInEditor({ ...FILE, where: "cloud" });
  await settle();
  assert.equal(asked.length, 1);
  assert.match(asked[0], /where=cloud/);
  assert.match(asked[0], /repo=api/);
  assert.match(asked[0], /path=src%2Fshared%2Fcron-lock\.service\.ts/);
  assert.equal(editorInBlock().tabs[0].text, "the file");
  assert.equal(editorInBlock().tabs[0].loading, false);
});

test("closing the last tab closes the tile, and the block loses the key", async () => {
  fresh();
  const ed = openInEditor(FILE);
  await settle();
  await closeEditorTab(ed, 0);
  assert.deepEqual(shape(), [[]]);
  assert.equal(editors.size, 0);
});

test("closing one of two tabs keeps the tile", async () => {
  fresh();
  const ed = openInEditor(FILE);
  openInEditor(OTHER);
  await settle();
  await closeEditorTab(ed, 1);
  assert.equal(editorInBlock().tabs.length, 1);
  assert.equal(editorInBlock().tabs[0].path, FILE.path);
  assert.deepEqual(shape(), [[`file:${ed.id}`]]);
});

test("a full block opens the editor in a block that has room", async () => {
  fresh();
  st.blocks[0].keys = Array.from({ length: st.LIMIT }, (_, i) => `seat-${i}`);
  const ed = openInEditor(FILE);
  await settle();
  assert.equal(st.blocks.length, 2, "the editor was squeezed into a block with no room");
  assert.equal(shape()[0].length, st.LIMIT, "the full block lost a seat to make room for the file");
  assert.deepEqual(shape()[1], [`file:${ed.id}`]);
  assert.equal(st.blocks[1].manual, true, "the block the file opened is not held open");
});

test("the key of a file is where it lives plus repo plus path", () => {
  assert.equal(fileKey(FILE), "local|api|src/shared/cron-lock.service.ts");
  assert.equal(fileKey({ ...FILE, where: "cloud" }), "cloud|api|src/shared/cron-lock.service.ts");
  assert.equal(baseName("a/b/c.ts"), "c.ts");
});

test("the language comes from the extension, and an unknown one still opens", () => {
  assert.equal(monacoLanguageOf("a/b/cron-lock.service.ts"), "typescript");
  assert.equal(monacoLanguageOf("lib/acme/jobs/cron_lock.ex"), "elixir");
  assert.equal(monacoLanguageOf("infra/Dockerfile"), "dockerfile");
  assert.equal(monacoLanguageOf("notes"), "plaintext");
});

test("the view model marks the tab you are on and the one holding changes", async () => {
  fresh();
  const ed = openInEditor(FILE);
  openInEditor(OTHER);
  await settle();
  ed.tabs[0].dirty = true;
  const model = fileViewModel(ed);
  assert.deepEqual(model.bar.tabs.map((t) => t.name), ["cron-lock.service.ts", "redis.service.ts"]);
  assert.deepEqual(model.bar.tabs.map((t) => t.on), [false, true]);
  assert.deepEqual(model.bar.tabs.map((t) => t.dirty), [true, false]);
  assert.equal(model.bar.dirty, false, "the bar lit save for a tab that is not the one on screen");
  assert.deepEqual(model.bar.tabs.map((t) => t.at), [0, 1]);
});

test("the view model says which side the file lives on, and what the editor is doing", async () => {
  fresh();
  const ed = openInEditor({ ...FILE, where: "cloud" });
  await settle();
  assert.deepEqual(fileViewModel(ed).status.where.map((w) => w.text), ["pod", "api · main", FILE.path]);
  assert.equal(fileViewModel(ed).status.said, "");
  ed.saving = true;
  assert.equal(fileViewModel(ed).status.said, "saving…");
  ed.saving = false;
  ed.said = "saved";
  assert.equal(fileViewModel(ed).status.said, "saved");
});
