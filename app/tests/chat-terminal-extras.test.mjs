import { test } from "node:test";
import { app } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Electron/30.0.0 hive", configurable: true });

const { assert, composerOf, drawerOf, lay, pool, read, settle, toggleKeys } = await import("./chat-terminal-harness.mjs");
const { openLink } = await app("terminal-pool");
const web = await app("chat-and-panes");

const opened = [];
const realOpen = window.open;
window.open = (url) => { opened.push(String(url)); return null; };

lay("classic");
read("ada");
toggleKeys();
await settle();

const pane = () => drawerOf("ada").querySelector(".ct-pane");
const menuItem = (id) => document.querySelector(`.term-menu [data-id="${id}"]`);
const rightClick = (node) => node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));

test("a link in a terminal of the chat opens in the browser of that chat's panel", () => {
  opened.length = 0;
  openLink({ target: pane().querySelector(".ct-well") }, "http://localhost:4173/lotes");
  assert.deepEqual(opened, [], "the link does not leave the app");
  assert.ok(web.webStateOf("ada").tabs.some((tab) => tab.url === "http://localhost:4173/lotes"), "a tab of the chat's browser holds the page");
});

test("a link outside the terminals of a chat still opens the way it did", () => {
  opened.length = 0;
  openLink({ target: document.body }, "https://example.com/");
  assert.deepEqual(opened, ["https://example.com/"]);
});

test("Add to chat waits for a selection, then puts the selected lines in the composer as a block", async () => {
  const e = pool.get("ada-terminal");
  rightClick(pane());
  await settle();
  assert.ok(menuItem("add"), "the menu of a chat's terminal offers Add to chat");
  assert.ok(menuItem("add").disabled, "with nothing selected there is nothing to add");
  assert.ok(menuItem("bottom"), "the menu still has Jump to latest");
  document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  const { hasSelection, getSelection } = e.term;
  e.term.hasSelection = () => true;
  e.term.getSelection = () => "npm ERR! missing script: dev\n";
  try {
    rightClick(pane());
    await settle();
    assert.equal(menuItem("add").disabled, false);
    menuItem("add").click();
    await settle();
    assert.equal(document.querySelector(".term-menu"), null, "the menu closes");
    assert.match(composerOf("ada").value, /```console\nnpm ERR! missing script: dev\n```/);
    assert.equal(document.activeElement, composerOf("ada"), "the composer takes the keyboard to go on writing");
  } finally {
    e.term.hasSelection = hasSelection;
    e.term.getSelection = getSelection;
    window.open = realOpen;
  }
});
