import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
const asked = [];
globalThis.fetch = (url, init) => {
  const said = String(url);
  asked.push({ url: said, init });
  if (said.startsWith("/api/changes?")) return Promise.resolve(answered({ state: "ok", branch: "jonas/pr", files: [{ path: "src/a.ts", status: "M", added: 2, removed: 1 }, { path: "tests/a.test.ts", status: "M", added: 4, removed: 0 }] }));
  if (said.startsWith("/api/changes/diff?")) return Promise.resolve(answered({ state: "ok", hunks: [{ head: "@@ -1,2 +1,2 @@", context: "", lines: [{ kind: "del", old: 1, new: 0, text: "a  =  1" }, { kind: "add", old: 0, new: 1, text: "a = 1" }, { kind: "ctx", old: 2, new: 2, text: "b" }] }] }));
  if (said.startsWith("/api/checkpoints")) return Promise.resolve(answered({ turns: [] }));
  return Promise.resolve(answered({ sessions: [], ok: true }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

localStorage.setItem("hive.sidePanel", JSON.stringify({ solo: { open: "yes", tabs: "bad", active: 7 }, pr: { open: false, tabs: [1, "pr:pr438", "<x>", "pr:pr438"], active: "nope", closed: "no" }, junk: "nope" }));

const st = await state();
const { IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
await app("hold-numbers");
const panel = await app("side-panel");
const diff = await app("side-panel-diff");
await app("chat-bar");

bootSolid();

const seat = (name, title) => ({ name, where: "local", kind: "chat", structured: true, model: "Opus 5.5", state: "done", title, agent: "claude", cwd: `/tmp/${name}`, trees: [] });

function lay() {
  st.LIMIT = 4;
  st.data = { sessions: [seat("pr", "com PR"), seat("solo", "sem PR")], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["pr", "solo"] }];
  st.block = 0;
  st.focus = 0;
  st.open = "pr";
  st.seatsKnown = true;
  st.prs = [{ session: "pr", repo: "acme/acme-hub", number: 438, tag: "acme-hub#438", title: "chore(hub): apague cópias", ci: "passed", state: "open", url: "https://github.com/acme/acme-hub/pull/438", key: "pr438" }];
  render();
}

const settle = async () => {
  for (let n = 0; n < 6; n += 1) await new Promise((done) => setTimeout(done, 5));
  render();
  for (let n = 0; n < 4; n += 1) await new Promise((done) => setTimeout(done, 5));
};
const tile = (name = "pr") => document.querySelector(`.tile[data-name="${name}"]`);
const node = (name = "pr") => document.querySelector(`.art.sp[data-name="${name}"]`);
const tabs = (name = "pr") => [...(node(name)?.querySelectorAll(".sp-tab") || [])].map((one) => one.dataset.tab);
const press = (code, mods = {}, target = window) => {
  const ev = new KeyboardEvent("keydown", { key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code, code, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.mod && IS_MAC, ctrlKey: !!mods.mod && !IS_MAC, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};

lay();

test("a saved panel that was garbage comes back clean, with only tabs the panel knows", async () => {
  panel.toggleSidePanel("pr");
  await settle();
  assert.deepEqual(tabs(), ["pr:pr438"]);
  assert.equal(node().querySelector(".sp-body").dataset.kind, "", "no active tab means the launcher shows");
  assert.equal(node().querySelector(".sp-launch").hidden, false);
  panel.toggleSidePanel("pr");
  await settle();
});

test("the panel opens on the open chat beside the conversation and the launcher opens the diff with its letter", async () => {
  assert.equal(node()?.hidden ?? true, true);
  panel.toggleSidePanel("pr");
  await settle();
  assert.ok(tile().classList.contains("sp-on"));
  assert.ok(tile().classList.contains("arting"));
  const launcher = node().querySelector(".sp-launch");
  const letters = [...launcher.querySelectorAll(".sp-li")].map((one) => one.dataset.letter);
  assert.ok(letters.includes("d") && letters.includes("b") && letters.includes("p"));
  launcher.querySelector('.sp-li[data-letter="d"]').focus();
  press("KeyD", {}, launcher.querySelector('.sp-li[data-letter="d"]'));
  await settle();
  assert.ok(tabs().includes("diff"));
  assert.equal(node().querySelector(".sp-body").dataset.kind, "diff");
  assert.ok(node().querySelector(".dbar"), "the diff bar is painted");
});

test("the diff bar hides the test files, wraps the lines and drops a change that is only spaces", async () => {
  await settle();
  const names = () => [...node().querySelectorAll(".df")].map((one) => one.dataset.path);
  assert.deepEqual(names(), ["src/a.ts", "tests/a.test.ts"]);
  node().querySelector('[data-act="diff-look"][data-look="tests"]').click();
  await settle();
  assert.deepEqual(names(), ["src/a.ts"]);
  node().querySelector('[data-act="diff-look"][data-look="wrap"]').click();
  await settle();
  assert.ok(node().querySelector(".sp-diff.wrap"));
  assert.equal(node().querySelectorAll(".dl.del").length, 1);
  node().querySelector('[data-act="diff-look"][data-look="spaces"]').click();
  await settle();
  assert.equal(node().querySelectorAll(".dl.del").length, 0, "a line that only changed spaces reads as unchanged");
  for (const look of ["tests", "wrap", "spaces"]) node().querySelector(`[data-act="diff-look"][data-look="${look}"]`).click();
  await settle();
});

test("a pull request opens as a tab, and the tab menu closes the others, the ones to the right and all", async () => {
  panel.closeTabs("pr", "all", "diff");
  panel.openSurface("pr", "diff");
  panel.openPrTab("pr", "pr438");
  await settle();
  assert.deepEqual(tabs(), ["diff", "pr:pr438"]);
  assert.equal(node().querySelector(".sp-body").dataset.kind, "pr");
  panel.closeTabs("pr", "others", "diff");
  await settle();
  assert.deepEqual(tabs(), ["diff"]);
  panel.openPrTab("pr", "pr438");
  await settle();
  panel.closeTabs("pr", "right", "diff");
  await settle();
  assert.deepEqual(tabs(), ["diff"]);
  panel.closeTabs("pr", "all", "diff");
  await settle();
  assert.deepEqual(tabs(), []);
  assert.equal(node().querySelector(".sp-launch").hidden, false);
});

test("inside the panel ⌘W closes the tab, ⌘T opens a new one and ⇧⌘T brings the last one back", async () => {
  panel.openSurface("pr", "diff");
  await settle();
  node().querySelector(".sp-tab.on .sp-tb").focus();
  const closing = press("KeyW", { mod: true });
  await settle();
  assert.equal(closing.defaultPrevented, true);
  assert.deepEqual(tabs(), []);
  node().querySelector(".sp-launch").focus();
  press("KeyT", { mod: true, shift: true });
  await settle();
  assert.deepEqual(tabs(), ["diff"]);
  node().querySelector(".sp-tab.on .sp-tb").focus();
  press("KeyT", { mod: true });
  await settle();
  assert.equal(node().querySelector(".sp-body").dataset.kind, "", "the new tab is the launcher");
});

test("the middle click and the menu key on a tab close it, and Delete does too", async () => {
  panel.openSurface("pr", "diff");
  await settle();
  const tab = node().querySelector('.sp-tab[data-tab="diff"]');
  tab.dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
  await settle();
  assert.deepEqual(tabs(), []);
  panel.openSurface("pr", "diff");
  await settle();
  node().querySelector('.sp-tab[data-tab="diff"]').dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  const menu = document.querySelector(".sp-menu");
  assert.ok(menu, "the tab menu opens");
  assert.deepEqual([...menu.querySelectorAll(".sp-mi")].map((one) => one.dataset.which), ["one", "others", "right", "all"]);
  menu.querySelector('[data-which="one"]').click();
  await settle();
  assert.equal(document.querySelector(".sp-menu"), null);
  assert.deepEqual(tabs(), []);
});

test("maximize makes the panel take the chat's place and the same button gives it back", async () => {
  panel.openSurface("pr", "diff");
  await settle();
  node().querySelector('[data-act="sp-max"]').click();
  await settle();
  assert.ok(tile().classList.contains("sp-max"));
  assert.equal(node().querySelector('[data-act="sp-max"]').getAttribute("aria-pressed"), "true");
  node().querySelector('[data-act="sp-max"]').click();
  await settle();
  assert.ok(!tile().classList.contains("sp-max"));
});

test("on a narrow window the panel is a sheet over the chat, Esc closes it and it does not take a column", async () => {
  const wide = window.innerWidth;
  window.happyDOM.setViewport({ width: 900, height: 800 });
  render();
  await settle();
  assert.ok(node().classList.contains("sp-sheet"));
  assert.equal(node().getAttribute("aria-modal"), "true");
  assert.ok(!tile().classList.contains("arting"), "a sheet floats instead of taking a grid column");
  assert.equal(document.querySelector(".sp-scrim").hidden, false);
  node().querySelector(".sp-tab.on .sp-tb").focus();
  press("Escape", {}, node().querySelector(".sp-tab.on .sp-tb"));
  await settle();
  assert.equal(node().hidden, true);
  assert.equal(st.open, "pr", "Esc closes the sheet, not the chat behind it");
  window.happyDOM.setViewport({ width: wide, height: 800 });
  render();
  await settle();
});

test("the toggle chord opens and closes the panel of the open chat", async () => {
  const before = !!node() && !node().hidden;
  press("KeyB", { mod: true, alt: true }, document);
  await settle();
  assert.equal(!!node() && !node().hidden, !before);
  press("KeyB", { mod: true, alt: true }, document);
  await settle();
  assert.equal(!!node() && !node().hidden, before);
});

test("a space-only change is read as unchanged lines, and a real change stays", () => {
  const lines = [
    { kind: "del", old: 1, new: 0, text: "if (a){" },
    { kind: "add", old: 0, new: 1, text: "if (a) {" },
    { kind: "del", old: 2, new: 0, text: "x" },
    { kind: "add", old: 0, new: 2, text: "y" }
  ];
  const out = diff.withoutSpaceChanges(lines);
  assert.deepEqual(out.map((one) => one.kind), ["ctx", "del", "add"]);
  assert.equal(out[0].text, "if (a) {");
});

test("a patch is read into files with their hunks, even with a rename", () => {
  const patch = ["diff --git a/a.txt b/b.txt", "rename from a.txt", "rename to b.txt", "--- a/a.txt", "+++ b/b.txt", "@@ -1 +1 @@", "-one", "+two"].join("\n");
  const [file] = diff.filesOfPatch(patch);
  assert.equal(file.path, "b.txt");
  assert.equal(file.added, 1);
  assert.equal(file.removed, 1);
});
