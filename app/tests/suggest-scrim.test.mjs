import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, views } from "./dom.mjs";

await views();

const { suggestMarkup, suggestMenu } = await app("suggest-menu");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

function bench({ next = true, lineTop = 0, menuBottom = 0, composerTop = menuBottom + 8 } = {}) {
  document.body.classList.toggle("experience-next", next);
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.innerHTML = `${suggestMarkup()}<div class="sv-composer"><div class="sv-attach"></div><div class="sv-well"><div class="sv-ink"></div><textarea></textarea></div></div>`;
  document.body.appendChild(tile);
  const textarea = tile.querySelector("textarea");
  const suggest = tile.querySelector(".sv-suggest");
  suggest.getBoundingClientRect = () => ({ top: menuBottom, bottom: menuBottom, left: 0, right: 0, width: 0, height: 0 });
  tile.querySelector(".sv-composer").getBoundingClientRect = () => ({ top: composerTop, bottom: composerTop + 80, left: 0, right: 0, width: 0, height: 80 });
  const realCreate = document.createElement.bind(document);
  const menu = suggestMenu({
    textarea,
    suggest,
    mine: () => "",
    commands: () => ({ list: ["compact", "context"], info: { compact: { description: "", argumentHint: "<optional custom summarization instructions>" } } }),
    files: { searching: () => "", none: () => "", find: async () => ({ files: [] }) }
  });
  document.createElement = (tag) => {
    const el = realCreate(tag);
    if (tag === "span") { el.getBoundingClientRect = () => ({ top: lineTop, bottom: lineTop, left: 0, right: 0, width: 0, height: 0 }); }
    return el;
  };
  const type = (text) => {
    textarea.value = text;
    textarea.setSelectionRange(text.length, text.length);
    menu.compute();
  };
  const done = () => { document.createElement = realCreate; tile.remove(); document.body.classList.remove("experience-next"); };
  return { tile, textarea, suggest, menu, type, done };
}

test("an open menu darkens the chat behind it, and closing it lifts the shade", () => {
  const b = bench();
  b.type("/");
  assert.equal(b.suggest.hidden, false);
  assert.equal(b.tile.querySelectorAll(".sv-scrim").length, 1, "the chat goes dark while the menu is open");
  b.type("/c");
  assert.equal(b.tile.querySelectorAll(".sv-scrim").length, 1, "typing on keeps one shade, not one per keystroke");
  b.menu.key(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  assert.equal(b.tile.querySelectorAll(".sv-scrim").length, 0, "esc takes the shade away with the menu");
  b.done();
});

test("a press on the shade closes the menu and keeps the words in the box", () => {
  const b = bench();
  b.type("ask /");
  const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  b.tile.querySelector(".sv-scrim").dispatchEvent(press);
  assert.equal(press.defaultPrevented, true, "the box keeps the focus");
  assert.equal(b.suggest.hidden, true);
  assert.equal(b.tile.querySelector(".sv-scrim"), null);
  assert.equal(b.textarea.value, "ask /");
  b.done();
});

test("the menu sits just above the line being typed, not on top of the whole box", () => {
  const b = bench({ menuBottom: 600, lineTop: 680 });
  b.type("first line\nsecond line\n/");
  assert.equal(b.suggest.style.transform, "translateY(74px)");
  assert.ok(b.suggest.classList.contains("over-text"), "the strip under the card hides the lines it now sits on");
  b.menu.close();
  assert.equal(b.suggest.style.transform, "", "a closed menu goes back to its place");
  assert.ok(!b.suggest.classList.contains("over-text"));
  b.done();
});

test("a line already at the top of the box leaves the menu where it was", () => {
  const b = bench({ menuBottom: 600, lineTop: 604 });
  b.type("/");
  assert.equal(b.suggest.style.transform, "");
  assert.ok(!b.suggest.classList.contains("over-text"), "a menu above the box paints no strip outside it");
  b.done();
});

test("a slash on the first line of the box leaves the menu above the box, border and all", () => {
  const b = bench({ menuBottom: 600, lineTop: 617 });
  b.textarea.getBoundingClientRect = () => ({ top: 608, bottom: 680, left: 0, right: 0, width: 0, height: 72 });
  b.textarea.style.paddingTop = "9px";
  b.type("/");
  assert.equal(b.suggest.style.transform, "");
  assert.ok(!b.suggest.classList.contains("over-text"));
  b.done();
});

test("a box with a command already marked opens the menu the same way", () => {
  const b = bench({ menuBottom: 600, lineTop: 680 });
  const ink = b.tile.querySelector(".sv-ink");
  ink.innerHTML = '<span class="ink-cmd">/context</span> look\n/';
  b.tile.querySelector(".sv-composer").classList.add("inked");
  b.type("/context look\n/");
  assert.equal(b.suggest.hidden, false);
  assert.equal(b.tile.querySelectorAll(".sv-scrim").length, 1);
  assert.equal(b.suggest.style.transform, "translateY(74px)");
  assert.match(ink.innerHTML, /ink-cmd/, "measuring the line leaves the marked command where it was");
  assert.equal(b.tile.querySelectorAll(".sv-ink").length, 1, "the measuring copy is gone");
  b.done();
});

test("the current hive keeps its menu as it was: no shade and no move", () => {
  const b = bench({ next: false, menuBottom: 600, lineTop: 680 });
  b.type("a\n/");
  assert.equal(b.tile.querySelector(".sv-scrim"), null);
  assert.equal(b.suggest.style.transform, "");
  b.done();
});

test("a long argument hint gives way instead of pushing the list sideways", () => {
  const page = readFileSync(new URL("../app.html", import.meta.url), "utf8");
  assert.match(page, /\.sv-suggest \.sg-list \{[^}]*overflow-x: hidden/);
  assert.match(page, /\.sv-suggest \.sg \.hint \{ flex: 0 1000 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;/);
});

test("a working chat pushes its box down for the activity tag, and the menu follows the box instead of floating above the gap", () => {
  const b = bench({ menuBottom: 600, composerTop: 630, lineTop: 660 });
  b.textarea.getBoundingClientRect = () => ({ top: 650, bottom: 700, left: 0, right: 0, width: 0, height: 50 });
  b.textarea.style.paddingTop = "10px";
  b.type("/");
  assert.equal(b.suggest.style.transform, "translateY(22px)", "8px above the box, as when the chat is quiet");
  assert.ok(!b.suggest.classList.contains("over-text"), "the box border stays in sight");
  b.done();
});

test("with pictures in the box the menu comes down to the line being typed, past the pictures", () => {
  const b = bench({ menuBottom: 600, composerTop: 608, lineTop: 690 });
  const tray = b.tile.querySelector(".sv-attach");
  tray.getBoundingClientRect = () => ({ top: 620, bottom: 676, left: 0, right: 0, width: 0, height: 56 });
  b.textarea.getBoundingClientRect = () => ({ top: 680, bottom: 720, left: 0, right: 0, width: 0, height: 40 });
  b.textarea.style.paddingTop = "10px";
  b.type("/");
  assert.equal(b.suggest.style.transform, "translateY(84px)");
  assert.ok(b.suggest.classList.contains("over-text"));
  b.done();
});
