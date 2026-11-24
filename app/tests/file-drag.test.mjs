import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, state, views } from "./dom.mjs";
import { renderMarkdown } from "../assets/markdown.mjs";

const { draggableFile, fileDragHandler, hubOf } = createRequire(import.meta.url)("../main/file-drag.js");

await views();
const st = await state();
const drag = await app("file-drag");
const rich = await app("markdown-rich");
const { getStructured } = await app("chat-stretches");
const { turnFilesHtml } = await import("../src/app/turn-files-html.js");

const root = realpathSync(mkdtempSync(join(tmpdir(), "hive-file-drag-")));
after(() => rmSync(root, { recursive: true, force: true }));
const home = join(root, "home");
const hub = join(root, "hub");
const repo = join(hub, "repo");
const folder = join(repo, "app");
const elsewhere = join(root, "elsewhere");
for (const dir of [join(home, "sessions"), join(folder, "src"), elsewhere, join(repo, ".git")]) mkdirSync(dir, { recursive: true });
writeFileSync(join(folder, "src", "login file.js"), "x");
writeFileSync(join(repo, "README.md"), "x");
writeFileSync(join(hub, "notes.md"), "x");
writeFileSync(join(elsewhere, "secret.txt"), "x");
symlinkSync(join(elsewhere, "secret.txt"), join(folder, "src", "sneaky.txt"));
writeFileSync(join(home, "sessions", "fix-login.json"), JSON.stringify({ cwd: folder }));
writeFileSync(join(home, "sessions", "lost.json"), JSON.stringify({ cwd: join(root, "gone") }));

const where = { home, hub };

test("a path in the chat's folder is resolved to the real file", () => {
  assert.equal(draggableFile({ name: "fix-login", path: "src/login file.js" }, where), join(folder, "src", "login file.js"));
  assert.equal(draggableFile({ name: "fix-login", path: join(folder, "src", "login file.js") }, where), join(folder, "src", "login file.js"));
  assert.equal(draggableFile({ name: "fix-login", path: "./src/../src/login file.js" }, where), join(folder, "src", "login file.js"));
});

test("a path the turn's checkpoint names from the repository top is found there too", () => {
  assert.equal(draggableFile({ name: "fix-login", path: "README.md" }, where), join(repo, "README.md"));
});

test("a file in the hub is allowed, even outside the chat's folder", () => {
  assert.equal(draggableFile({ name: "fix-login", path: join(hub, "notes.md") }, where), join(hub, "notes.md"));
});

test("anything outside the chat's folder and the hub is refused, symlinks and dot-dots included", () => {
  assert.equal(draggableFile({ name: "fix-login", path: join(elsewhere, "secret.txt") }, where), null);
  assert.equal(draggableFile({ name: "fix-login", path: "../../../elsewhere/secret.txt" }, where), null);
  assert.equal(draggableFile({ name: "fix-login", path: "src/sneaky.txt" }, where), null);
  assert.equal(draggableFile({ name: "fix-login", path: "/etc/hosts" }, where), null);
  assert.equal(draggableFile({ name: "fix-login", path: "src/missing.js" }, where), null);
  assert.equal(draggableFile({ name: "fix-login", path: "" }, where), null);
  assert.equal(draggableFile({ name: "fix-login", path: "src/a\0b" }, where), null);
});

test("a chat that is not on this machine, or not a chat name, drags nothing", () => {
  assert.equal(draggableFile({ name: "nobody", path: "src/login file.js" }, where), null);
  assert.equal(draggableFile({ name: "../home/sessions/fix-login", path: "src/login file.js" }, where), null);
  assert.equal(draggableFile({ name: "lost", path: "src/login file.js" }, where), null);
});

test("the hub comes from the environment, or from the hive's config file", () => {
  assert.equal(hubOf({ HIVE_HUB: "/a/hub" }, home), "/a/hub");
  assert.equal(hubOf({}, home), "");
  writeFileSync(join(home, "config"), 'HIVE_DEV=ana\nHIVE_HUB="/b/hub"\n');
  assert.equal(hubOf({}, home), "/b/hub");
});

test("the main process starts a native drag only for a Hive window and a file it allows", async () => {
  const dragged = [];
  const sender = { startDrag: (what) => dragged.push(what) };
  const handle = fileDragHandler({ home, hub: () => hub, isHiveWindow: (one) => one === sender, iconOf: async () => "file-icon" });
  assert.deepEqual(await handle({ sender: { startDrag: () => dragged.push("stranger") } }, { name: "fix-login", path: "src/login file.js" }), { ok: false, error: "only a Hive window drags files out" });
  assert.equal((await handle({ sender }, { name: "fix-login", path: join(elsewhere, "secret.txt") })).ok, false);
  assert.deepEqual(dragged, []);
  assert.deepEqual(await handle({ sender }, { name: "fix-login", path: "src/login file.js" }), { ok: true, file: join(folder, "src", "login file.js") });
  assert.deepEqual(dragged, [{ file: join(folder, "src", "login file.js"), icon: "file-icon" }]);
  const broken = fileDragHandler({ home, hub, isHiveWindow: () => true, iconOf: async () => { throw new Error("no icon"); } });
  assert.deepEqual(await broken({ sender }, { name: "fix-login", path: "src/login file.js" }), { ok: false, error: "no icon" });
});

const asked = [];
const bridge = { drag: async (ask) => { asked.push(ask); return { ok: true }; } };

function chatHost(name, where = "local", extra = {}) {
  const e = getStructured({ name, where, ...extra });
  document.body.appendChild(e.host);
  return e;
}

function dragFrom(el) {
  const ev = new Event("dragstart", { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

test("a file chip in a sent message is draggable in a local chat and asks the main process for a native drag", async () => {
  window.hiveFiles = bridge;
  asked.length = 0;
  const e = chatHost("drag-local");
  const box = document.createElement("div");
  box.innerHTML = '<span class="ctx-chip" data-kind="file" data-path="src/login.js"></span><span class="ctx-chip" data-kind="folder" data-path="src/"></span>';
  e.scroll.appendChild(box);
  drag.markFileDrags(e, box);
  const [file, folderChip] = box.children;
  assert.equal(file.getAttribute("draggable"), "true");
  assert.equal(folderChip.hasAttribute("draggable"), false, "only files leave the chat");
  const ev = dragFrom(file);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(ev.defaultPrevented, true, "the HTML drag gives way to the native one");
  assert.deepEqual(asked, [{ name: "drag-local", path: "src/login.js" }]);
});

test("a cloud chat, another machine's chat or an app without the bridge keeps its chips still", async () => {
  window.hiveFiles = bridge;
  asked.length = 0;
  for (const e of [chatHost("drag-cloud", "cloud"), chatHost("drag-mirror", "local", { mirror: { dev: "carla" } })]) {
    const box = document.createElement("div");
    box.innerHTML = '<span class="ctx-chip" data-kind="file" data-path="src/login.js"></span>';
    e.scroll.appendChild(box);
    drag.markFileDrags(e, box);
    assert.equal(box.firstChild.hasAttribute("draggable"), false);
    assert.equal(dragFrom(box.firstChild).defaultPrevented, false);
  }
  delete window.hiveFiles;
  assert.equal(drag.canDragFilesOf({ name: "drag-local", where: "local" }), false);
  assert.deepEqual(asked, []);
});

test("a file chip in an answer is draggable once the chat's folder has the file", async () => {
  window.hiveFiles = bridge;
  st.data = { hub: "/Users/ana/hub", sessions: [{ name: "drag-answer", where: "local", cwd: "/Users/ana/hub/api", title: "API", state: "idle" }] };
  const before = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ files: ["src/app.ts"] }) });
  try {
    const el = document.createElement("div");
    el.className = "sv-msg md";
    el.innerHTML = renderMarkdown("open `src/app.ts`");
    document.body.appendChild(el);
    rich.enrichMarkdown(el, { seat: { name: "drag-answer", where: "local" } });
    let chip = null;
    for (let i = 0; i < 30 && !chip; i++) {
      await new Promise((r) => setTimeout(r, 10));
      chip = el.querySelector(".md-chip[data-kind=file]");
    }
    assert.ok(chip, el.innerHTML);
    assert.equal(chip.getAttribute("draggable"), "true");
    asked.length = 0;
    dragFrom(chip);
    assert.deepEqual(asked, [{ name: "drag-answer", path: "src/app.ts" }]);
    st.data.sessions.push({ name: "drag-answer", where: "cloud", cwd: "/workspace/repos/api", title: "API", state: "idle" });
    const cloud = document.createElement("div");
    cloud.innerHTML = renderMarkdown("open `src/app.ts`");
    document.body.appendChild(cloud);
    rich.enrichMarkdown(cloud, { seat: { name: "drag-answer", where: "cloud" } });
    let far = null;
    for (let i = 0; i < 30 && !far; i++) {
      await new Promise((r) => setTimeout(r, 10));
      far = cloud.querySelector(".md-chip[data-kind=file]");
    }
    assert.ok(far, cloud.innerHTML);
    assert.equal(far.hasAttribute("draggable"), false, "a cloud chat's chip opens the file but does not leave the app");
  } finally {
    globalThis.fetch = before;
  }
});

test("the files a turn touched can be dragged out of the turn's file list of a local chat", async () => {
  window.hiveFiles = bridge;
  asked.length = 0;
  const say = { esc: (t) => String(t), phrase: (t, v) => String(t).replace(/\{(\w+)\}/g, (w, k) => (v && k in v ? v[k] : w)) };
  const turn = { ordinal: 3, files: 1, added: 1, removed: 0, paths: [{ path: "src/login.js", added: 1, removed: 0 }] };
  assert.ok(!turnFilesHtml({ turn, all: true }, say).includes("draggable"));
  const e = chatHost("drag-turn");
  const list = document.createElement("div");
  list.className = "tx-cf";
  list.innerHTML = turnFilesHtml({ turn, all: true, drag: true }, say);
  e.scroll.appendChild(list);
  const row = list.querySelector('.tx-cf-row[data-file="src/login.js"]');
  assert.equal(row.getAttribute("draggable"), "true");
  dragFrom(row);
  assert.deepEqual(asked, [{ name: "drag-turn", path: "src/login.js" }]);
});

test("a refused drag says so, unless the mouse was already let go", async () => {
  window.hiveFiles = { drag: async () => ({ ok: false, error: "that file is not in this chat's folder on this machine" }) };
  const e = chatHost("drag-refused");
  const box = document.createElement("div");
  box.innerHTML = '<span class="ctx-chip" data-kind="file" data-path="src/gone.js"></span>';
  e.scroll.appendChild(box);
  drag.markFileDrags(e, box);
  await drag.startFileDrag({ target: box.firstChild, preventDefault() {}, stopPropagation() {} });
  const hud = document.getElementById("hud");
  assert.ok(hud.textContent.includes("The file could not be dragged out"), hud.textContent);
  delete window.hiveFiles;
});
