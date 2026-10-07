import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
const { seatMenuRows, tileViewModel } = await app("seat-menu");
const { paintWebChipOfChat, webOfSeat } = await app("chat-and-panes");

function rule(selector) {
  const at = page.indexOf(`\n  ${selector} {`);
  assert.ok(at >= 0, `no rule for ${selector} in app.html`);
  return page.slice(at, page.indexOf("}", at));
}

const seat = (over = {}) => ({ name: "alfa", where: "local", state: "idle", when: "2m", ...over });

function hive(seats = [seat()]) {
  st.data = { pod: { up: false, name: "" }, sessions: seats, archived: [] };
  st.blocks = [{ id: "b1", ws: "w1", keys: seats.map((s) => s.name) }];
  st.block = 0;
  st.open = "";
  st.typing = "";
  st.prs = [];
  st.threads = [];
  st.LIMIT = 4;
  st.keys = {};
  st.folded = [];
}

function tileWith(html) {
  const el = document.createElement("div");
  el.className = "tile";
  el.dataset.name = "alfa";
  el.innerHTML = html;
  return el;
}

test("a narrow card drops the chips to the next line instead of squeezing the state", () => {
  const row = rule(".t-state");
  assert.match(row, /flex-wrap: wrap;/);
  assert.match(row, /row-gap: \d/);
});

test("the state pill keeps its width, so the clock never lands on the word", () => {
  const pill = rule(".t-pill");
  assert.match(pill, /flex: none;/);
  assert.match(pill, /max-width: 100%;/);
  assert.match(pill, /overflow: hidden;/);
});

test("a card too narrow even for the pill ellipsises the word instead of spilling it", () => {
  const label = rule(".t-state .label");
  assert.match(label, /overflow: hidden;/);
  assert.match(label, /text-overflow: ellipsis;/);
  assert.match(label, /white-space: nowrap;/);
});

test("the state row reads in one fixed order, so the clock never floats", () => {
  const order = (selector) => {
    const found = rule(selector).match(/order: (\d)/);
    assert.ok(found, `${selector} has no order`);
    return Number(found[1]);
  };
  const seen = [".t-pill", ".t-state .when", ".t-where", ".t-live", ".t-canopy", ".t-device", ".t-page"].map(order);
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), "the row is not in reading order");
  assert.equal(new Set(seen).size, seen.length, "two things share a place in the row");
  assert.doesNotMatch(rule(".t-state .when"), /margin-left: auto/);
  assert.doesNotMatch(rule(".t-where"), /margin-left: auto/);
});

test("only the state wears the round badge — everything else is a chip", () => {
  assert.match(rule(".t-pill"), /border-radius: 999px/);
  for (const chip of [".t-page", ".t-canopy", ".t-device", ".t-live"]) {
    assert.doesNotMatch(rule(chip), /border-radius: 999px/, `${chip} still competes with the state pill`);
  }
});

test("the card says where it runs only when that is news", () => {
  hive();
  assert.equal(tileViewModel(seat()).whereChip, null, "a local seat wearing a 'local' chip is a row of noise");
  const away = tileViewModel(seat({ where: "pod" })).whereChip;
  assert.equal(away.text, "pod");
  assert.equal(away.cls, "pod");
  assert.match(rule(".t-where:empty"), /display: none/);
});

test("a page with no host — file:// — shows its name, not the whole path", () => {
  hive();
  const el = tileWith(`<div class="t-state"><button class="t-page" hidden><svg></svg><span></span></button></div>`);
  webOfSeat.set("alfa", { active: 0, asleep: false, tabs: [{ url: "file:///w/docs/tela%20nova.html" }] });
  paintWebChipOfChat(el, seat());
  assert.equal(el.querySelector(".t-page").hidden, false);
  assert.equal(el.querySelector(".t-page span").textContent, "tela nova.html");

  webOfSeat.set("alfa", { active: 0, asleep: false, tabs: [{ url: "https://arvore.dev/livros/1" }] });
  paintWebChipOfChat(el, seat());
  assert.equal(el.querySelector(".t-page span").textContent, "arvore.dev", "a page with a host says the host, not its path");
  webOfSeat.delete("alfa");
});

test("the rare buttons wait for the pointer, and the seat menu still reaches them", () => {
  hive();
  assert.match(rule(".t-tags .t-web, .t-tags .t-phone, .t-tags .t-edit"), /display: none/);
  assert.match(page, /@media \(hover: none\) \{ \.t-tags \.t-web/);

  const labels = seatMenuRows(seat()).map((r) => r.label);
  assert.ok(labels.includes("open the browser here"), "the button is hidden and the menu no longer offers it — the browser is unreachable on a trackpad");
  assert.ok(labels.includes("open the phone here"));
  for (const label of ["open the browser here", "open the phone here"]) {
    assert.equal(typeof seatMenuRows(seat()).find((r) => r.label === label).go, "function");
  }

  const tags = tileViewModel(seat()).tags;
  assert.equal(tags.web, "open the browser here", "the hidden button lost the words the menu row still uses");
  assert.equal(tags.phone, "open the phone here");
});
