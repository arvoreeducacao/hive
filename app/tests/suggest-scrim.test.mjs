import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, views } from "./dom.mjs";

await views();

const { suggestMarkup, suggestMenu } = await app("suggest-menu");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

function bench({ lineTop = 0, menuBottom = 0, composerTop = menuBottom + 8 } = {}) {
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
  const done = () => { document.createElement = realCreate; tile.remove(); };
  return { tile, textarea, suggest, menu, type, done };
}

test("the menu opens with no shade and no move", () => {
  const b = bench({ menuBottom: 600, lineTop: 680 });
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
