import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const stretches = readFileSync(join(HERE, "src", "app", "chat-stretches.js"), "utf8");
const seats = readFileSync(join(HERE, "src", "app", "structured-seats.js"), "utf8");

function cut(text, from, to, what = "app.html") {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const rule = (selector) => cut(page, `\n  ${selector} {`, "}");

test("the left column of an open seat is one width, whatever the pane on the right is", () => {
  assert.match(page, /--open-side: \d+px;/);
  for (const selector of [".tile.open", ".tile.open.reviewing", ".tile.open.threading", ".tile.open.arting"]) {
    assert.match(rule(selector), /grid-template-columns: minmax\(0, var\(--open-side\)\)/,
      `${selector} still hard-codes its own column width`);
  }
});

test("stacked on a narrow window, the chat keeps most of the height and the card takes what is left", () => {
  const narrow = cut(page, "@media (max-width: 860px) {\n    #canvas:not(.zoom)", "@media (prefers-reduced-motion: reduce) { * {");
  assert.match(narrow, /\.tile\.open:not\(\.arting\) \{ grid-template-rows: minmax\(0, auto\) minmax\(60%, 1fr\); \}/,
    "the chat has no floor, so a long card pushes it into a strip");
  const card = narrow.slice(narrow.indexOf(".tile.open .side {"), narrow.indexOf("}", narrow.indexOf(".tile.open .side {")));
  assert.doesNotMatch(card, /max-height/,
    "the card is still measured against the window instead of its share of the tile");
});

test("the card the pane is showing wears the same grey as every other picked row", () => {
  const picked = rule(".tile.threading .t-slack.here,\n  .tile.reviewing .t-pr.here,\n  .tile.arting .t-art.here");
  assert.match(picked, /background: var\(--panel-3\)/);
  assert.match(picked, /border-color: var\(--line-3\)/);
  assert.doesNotMatch(picked, /color-mix|--picked|border-left/,
    "a card of its own colour is the one thing nothing else in the interface does");
  assert.match(rule("#rail .item.here"), /background: transparent; box-shadow: none/,
    "the rail marks the open seat by its type alone — no grey behind it, so the cards are the only picked rows wearing grey");
  assert.match(rule("#rail .item.here .name"), /color: var\(--txt\); font-weight: 600/,
    "in the rail the name going bright is the whole signal");
  const bright = rule(".tile.threading .t-slack.here .who,\n  .tile.reviewing .t-pr.here .num,\n  .tile.arting .t-art.here .name");
  assert.match(bright, /color: var\(--txt\)/, "the text going bright is the second signal");
});

test("a narrow composer says the same things in fewer characters", () => {
  assert.match(rule(".sv-composer"), /container-type: inline-size/,
    "the composer measures itself — the same seat view is wide with the pane closed and narrow with it open");
  const slim = cut(page, "@container (max-width: 470px)", "}\n  @container");
  assert.match(slim, /\.sv-pill \.dim \{ display: none/);
  assert.match(slim, /\.sv-ctx \.pct \.full \{ display: none/);
  assert.match(slim, /\.sv-ctx \.pct \.short \{ display: inline/);
  assert.match(page, /\.sv-ctx \.pct \{ white-space: nowrap/, "the percentage never breaks over two lines");
});

test("the gauge writes both wordings and lets the width pick one", () => {
  assert.match(stretches, /<span class="pct"><span class="full"><\/span><span class="short"><\/span><\/span>/);
  const paint = cut(seats, "function paintActivity(e)", "function refreshContext", "structured-seats.js");
  assert.match(paint, /\.pct \.full"\)\.textContent = `\$\{\(t \/ 1000\)/);
  assert.match(paint, /\.pct \.short"\)\.textContent = pct;/);
});
