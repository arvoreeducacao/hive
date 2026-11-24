import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { suggestMarkup, suggestMenu } = await app("suggest-menu");
const { commandScore, rankCommands } = await app("composer-search");
const { fileKindOf, fileParts } = await app("composer-file-kinds");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const COMMANDS = ["compact", "context", "config", "review", "prs", "init"];

const INFO = {
  review: { description: "Review a pull request", argumentHint: "" },
  prs: { description: "Track pull requests", argumentHint: "" },
  init: { description: "Write the agents file", argumentHint: "" }
};

function bench(files = [], commands = () => ({ list: COMMANDS, info: INFO })) {
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `${suggestMarkup()}<textarea></textarea>`;
  document.body.appendChild(host);
  const textarea = host.querySelector("textarea");
  const suggest = host.querySelector(".sv-suggest");
  const menu = suggestMenu({
    textarea,
    suggest,
    mine: () => "me",
    commands,
    files: { searching: () => "searching", none: () => "none", find: async () => ({ files }) }
  });
  textarea.addEventListener("input", menu.compute);
  const type = (text, caret = text.length) => {
    textarea.value = text;
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event("input"));
  };
  const rows = () => [...suggest.querySelectorAll(".sg")];
  const names = () => rows().map((row) => row.querySelector(".val").textContent);
  const press = (key, mods = {}) => {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods });
    menu.key(ev);
    return ev;
  };
  return { host, textarea, suggest, menu, type, rows, names, press, done: () => host.remove() };
}

function recordEdits() {
  const calls = [];
  document.execCommand = (command, _ui, text) => {
    const box = document.activeElement;
    calls.push([command, text]);
    box.setRangeText(command === "insertText" ? text : "", box.selectionStart, box.selectionEnd, "end");
    box.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  return { calls, stop: () => { delete document.execCommand; } };
}

const settle = (ms = 200) => new Promise((go) => setTimeout(go, ms));

test("the command search ranks a name over a description and reads descriptions only literally", () => {
  assert.deepEqual(rankCommands(COMMANDS, INFO, "pull"), ["prs", "review"]);
  assert.deepEqual(rankCommands(COMMANDS, INFO, "rvw"), ["review"], "the name matches letters in order");
  assert.deepEqual(rankCommands(COMMANDS, INFO, "/co").slice(0, 3), ["config", "compact", "context"], "a prefix wins, shorter first");
  assert.equal(commandScore("prs", "Track pull requests", "trk"), null, "a description never matches loosely");
  assert.ok(commandScore("init", "", "init") < commandScore("initialize", "", "init"), "exact beats a prefix");
  assert.ok(commandScore("review", "", "rvw") >= 100, "loose letters rank under every literal hit");
  assert.deepEqual(rankCommands(["b", "a"], {}, ""), ["a", "b"]);
});

test("the slash menu finds a command by its description and by loose letters", () => {
  const b = bench();
  b.type("/pull");
  assert.deepEqual(b.names(), ["prs", "review"]);
  b.type("/rvw");
  assert.deepEqual(b.names(), ["review"]);
  b.done();
});

test("a bare slash selects the row on top, and a command the composer offers sits with the seat's own", () => {
  const b = bench([], () => ({ list: ["review", "init", "clear", "compact"], info: { clear: { description: "Start a fresh session", family: "seat" } } }));
  b.type("/");
  assert.deepEqual(b.names(), ["clear", "compact", "init", "review"]);
  assert.ok(b.rows()[0].classList.contains("sel"));
  b.done();
});

test("an @ row shows the file kind, the name in front and the folder dimmed", async () => {
  const b = bench(["src/app/chat.ts", "docs/readme.md", "Makefile", "src/"]);
  b.type("@");
  await settle();
  const [code, doc, bare, folder] = b.rows();
  assert.equal(code.querySelector(".ft").dataset.kind, "typescript");
  assert.equal(code.querySelector(".val").textContent, "chat.ts");
  assert.equal(code.querySelector(".desc").textContent, "src/app");
  assert.equal(code.title, "src/app/chat.ts");
  assert.equal(doc.querySelector(".ft").dataset.kind, "markdown");
  assert.equal(bare.querySelector(".ft").dataset.kind, "default");
  assert.equal(bare.querySelector(".desc").textContent, "", "a file at the root has no folder");
  assert.equal(folder.querySelector(".ft").dataset.kind, "folder");
  assert.equal(folder.querySelector(".ft use").getAttribute("href"), "#i-folder");
  assert.deepEqual(fileParts("a/b/c.json"), { name: "c.json", folder: "a/b" });
  assert.equal(fileKindOf("Dockerfile"), "docker");
  b.done();
});

test("esc keeps the menu shut while the same word is typed, and a new trigger opens it", () => {
  const b = bench();
  b.type("/co");
  assert.equal(b.suggest.hidden, false);
  assert.ok(b.press("Escape").defaultPrevented);
  assert.equal(b.suggest.hidden, true);
  b.type("/com");
  assert.equal(b.suggest.hidden, true, "more letters in the dismissed word keep it shut");
  b.type("/com /");
  assert.equal(b.suggest.hidden, false, "a new slash opens the menu again");
  b.press("Escape");
  b.type("/com ");
  b.type("/com /");
  assert.equal(b.suggest.hidden, false, "deleting back past the trigger forgets the dismissal");
  b.done();
});

test("moving the caret off the dismissed word lets the next edit there open the menu", () => {
  const b = bench();
  b.type("@fo and more");
  b.type("@fo and more", 3);
  assert.equal(b.suggest.hidden, false);
  b.press("Escape");
  b.textarea.setSelectionRange(9, 9);
  b.textarea.dispatchEvent(new Event("click"));
  b.type("@foo and more", 4);
  assert.equal(b.suggest.hidden, false);
  b.done();
});

test("a pick goes in as one undoable edit and takes one space that was already there", () => {
  const b = bench();
  const edits = recordEdits();
  try {
    b.type("run /rev now", 8);
    assert.deepEqual(b.names(), ["review"]);
    assert.ok(b.press("Enter").defaultPrevented);
    assert.deepEqual(edits.calls, [["insertText", "/review "]]);
    assert.equal(b.textarea.value, "run /review now");
    assert.equal(b.suggest.hidden, true);
  } finally { edits.stop(); }
  b.done();
});

test("mod+enter and shift+tab are not swallowed by an open menu", () => {
  const b = bench();
  b.type("/co");
  assert.equal(b.press("Enter", { metaKey: true }).defaultPrevented, false);
  assert.equal(b.press("Enter", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(b.press("Tab", { shiftKey: true }).defaultPrevented, false);
  assert.equal(b.press("Tab").defaultPrevented, true);
  b.done();
});
