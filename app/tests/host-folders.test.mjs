import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const { closeFolderMenu, closeFolderMenuIn, folderRows, folderSaid, openFolderMenu } = await app("host-folders");

const TREE = {
  "/home/ada": { parent: "/home", folders: [{ name: "Documents", git: false }, { name: "My Projects", git: false }, { name: "Projects", git: false }] },
  "/home/ada/Projects": { parent: "/home/ada", folders: [{ name: "api", git: false }, { name: "hub", git: true }] },
  "/home/ada/Projects/hub": { parent: "/home/ada/Projects", folders: [] }
};

const asked = [];

async function pull(host, path) {
  asked.push([host, path]);
  const at = path === "~/Projects" ? "/home/ada/Projects" : path || "/home/ada";
  return TREE[at] ? { path: at, home: "/home/ada", git: false, more: 0, ...TREE[at] } : { error: `${at} is not a folder on this server` };
}

function stage() {
  document.body.innerHTML = '<div class="row"><button type="button" class="pick"></button></div><textarea></textarea>';
  asked.length = 0;
  return { anchor: document.querySelector(".pick"), composer: document.querySelector("textarea") };
}

const settle = async () => { for (let n = 0; n < 6; n += 1) await new Promise((done) => setTimeout(done, 0)); };
const input = () => document.querySelector(".sv-folder-menu input");
const press = (key) => input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
const type = (text) => { input().value = text; input().dispatchEvent(new Event("input", { bubbles: true })); };
const rows = () => [...document.querySelectorAll(".sv-folder-menu .list button")].map((row) => row.querySelector(".l").textContent);

test("a folder is shown from the home folder when it is under it, and whole when it is not", () => {
  assert.equal(folderSaid("/home/ada", "/home/ada"), "~");
  assert.equal(folderSaid("/home/ada/Projects/hub", "/home/ada/"), "~/Projects/hub");
  assert.equal(folderSaid("/home/adam/x", "/home/ada"), "/home/adam/x");
  assert.equal(folderSaid("/srv/app", ""), "/srv/app");
  assert.equal(folderSaid("", "/home/ada"), "");
});

test("the list leads with the folder itself and the way up, and a filter leaves only the folders, the ones that start with it first", () => {
  const seen = { path: "/home/ada", home: "/home/ada", parent: "/home", folders: TREE["/home/ada"].folders };
  assert.deepEqual(folderRows(seen).map((one) => [one.kind, one.path]), [
    ["use", "/home/ada"], ["go", "/home"], ["go", "/home/ada/Documents"], ["go", "/home/ada/My Projects"], ["go", "/home/ada/Projects"]
  ]);
  assert.deepEqual(folderRows(seen, "proj").map((one) => one.label), ["Projects", "My Projects"]);
  assert.deepEqual(folderRows({ path: "/", home: "/home/ada", parent: "", folders: [{ name: "srv", git: false }] }).map((one) => one.path), ["/", "/srv"]);
  assert.equal(folderRows({ ...seen, folders: [{ name: "hub", git: true }] })[2].note, "git");
  assert.deepEqual(folderRows(null), []);
});

test("the menu opens on the folder the host already keeps, and enter takes that folder", async () => {
  const { anchor, composer } = stage();
  const picked = [];
  openFolderMenu(anchor, { host: "ada@devbox", start: "/home/ada/Projects", pull, onPick: (path, home) => picked.push([path, home]), refocus: () => composer.focus() });
  await settle();
  assert.deepEqual(asked, [["ada@devbox", "/home/ada/Projects"]]);
  assert.deepEqual(rows(), ["open the chat here", "..", "api", "hub"]);
  assert.equal(anchor.getAttribute("aria-expanded"), "true");
  press("Enter");
  assert.deepEqual(picked, [["/home/ada/Projects", "/home/ada"]]);
  assert.equal(document.querySelector(".sv-folder-menu"), null);
  assert.equal(anchor.getAttribute("aria-expanded"), "false");
});

test("typing a name walks into the folder, a typed path jumps to it, and backspace on nothing goes up", async () => {
  const { anchor } = stage();
  const picked = [];
  openFolderMenu(anchor, { host: "ada@devbox", pull, onPick: (path) => picked.push(path) });
  await settle();
  type("proj");
  assert.deepEqual(rows(), ["Projects", "My Projects"]);
  press("Enter");
  await settle();
  assert.equal(input().value, "", "the filter stayed on after walking in");
  assert.deepEqual(rows(), ["open the chat here", "..", "api", "hub"]);
  press("ArrowDown");
  press("ArrowDown");
  press("ArrowDown");
  press("Enter");
  await settle();
  assert.deepEqual(rows(), ["open the chat here", ".."]);
  press("Backspace");
  await settle();
  assert.deepEqual(rows(), ["open the chat here", "..", "api", "hub"]);
  type("~/Projects");
  press("Enter");
  await settle();
  assert.equal(asked.at(-1)[1], "~/Projects");
  type("/nowhere");
  press("Enter");
  await settle();
  assert.match(document.querySelector(".sv-folder-menu .none.bad").textContent, /is not a folder on this server/);
  assert.deepEqual(rows(), ["open the chat here", "..", "api", "hub"], "a path that is not there took the list away");
  assert.deepEqual(picked, []);
  closeFolderMenu();
});

test("a kept folder that is gone from the host opens the home folder instead of an empty list", async () => {
  const { anchor } = stage();
  openFolderMenu(anchor, { host: "ada@devbox", start: "/home/ada/gone", pull, onPick: () => {} });
  await settle();
  assert.deepEqual(asked.map((one) => one[1]), ["/home/ada/gone", ""]);
  assert.deepEqual(rows(), ["open the chat here", "..", "Documents", "My Projects", "Projects"]);
  closeFolderMenu();
});

test("escape closes the menu and hands the keyboard back, and a menu is closed only by the panel that holds it", async () => {
  const { anchor, composer } = stage();
  openFolderMenu(anchor, { host: "ada@devbox", pull, onPick: () => {}, refocus: () => composer.focus() });
  await settle();
  closeFolderMenuIn(document.createElement("div"));
  assert.ok(document.querySelector(".sv-folder-menu"), "another panel closed this panel's menu");
  press("Escape");
  assert.equal(document.querySelector(".sv-folder-menu"), null);
  assert.equal(document.activeElement, composer);
  openFolderMenu(anchor, { host: "ada@devbox", pull, onPick: () => {} });
  closeFolderMenuIn(document.body);
  assert.equal(document.querySelector(".sv-folder-menu"), null);
});
