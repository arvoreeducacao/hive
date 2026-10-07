import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

function slice(from, to) {
  const a = page.indexOf(from);
  const b = page.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of app.html`);
  return page.slice(a, b);
}

const { getStructured, svNarrow } = await app("chat-stretches");
const { svConvSeed } = await app("conversation-model");
const { paintSubs, svSubPin } = await app("subagents-dock");
const { structPool } = await app("structured-seats");
const { mountSubs } = await import(new URL("../src/views.js", import.meta.url).href);

let seq = 0;

function pane() {
  const name = `seat-${++seq}`;
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  e.subsView = mountSubs(e.host.querySelector(".sv-subs .sublist"));
  return e;
}

const launch = (e, id) => svSubPin(e, { id, input: { subagent_type: "explore", description: `look at ${id}` } });

const widthOf = (host, px) => Object.defineProperty(host, "clientWidth", { value: px, configurable: true });

test("the dock is a card with a head and a list of its own", () => {
  const e = pane();
  const dock = e.host.querySelector(".sv-subs");
  assert.equal(dock.dataset.fold, "auto");
  assert.ok(dock.querySelector(".shead"), "the card has a head you can fold by");
  assert.ok(dock.querySelector(".sublist"), "and a list of its own");
  assert.deepEqual([...dock.children].map((el) => el.className), ["shead", "sublist"]);
  structPool.delete(e.name);
});

test("a launched subagent lands in the list, not loose in the card", () => {
  const e = pane();
  launch(e, "b1");
  const dock = e.host.querySelector(".sv-subs");
  assert.equal(dock.querySelectorAll(".sublist .sv-sub").length, 1);
  assert.equal(dock.querySelector(".sv-sub .sname").textContent, "explore");
  assert.equal(dock.querySelector(".sv-sub .sarg").textContent, "look at b1");
  assert.deepEqual([...dock.children].map((el) => el.className), ["shead", "sublist"]);
  structPool.delete(e.name);
});

test("the head counts what is running, and says nothing when the dock is empty", () => {
  const busy = pane();
  for (const id of ["b1", "b2", "b3"]) launch(busy, id);
  const dock = busy.host.querySelector(".sv-subs");
  assert.equal(dock.querySelector(".scount").textContent, "3");
  assert.ok(dock.classList.contains("on"));

  const idle = pane();
  paintSubs(idle);
  const quiet = idle.host.querySelector(".sv-subs");
  assert.equal(quiet.querySelector(".scount").textContent, "0");
  assert.ok(!quiet.classList.contains("on"));
  structPool.delete(busy.name);
  structPool.delete(idle.name);
});

test("a folded card hides the list, and a narrow pane folds it before anyone asks", () => {
  const css = slice(".sv-subs { display: none", ".sv-sub {");
  assert.match(css, /\.sv-subs\[data-fold="shut"\] \.sublist, \.sv-narrow \.sv-subs\[data-fold="auto"\] \.sublist \{ display: none; \}/);
  const e = pane();
  launch(e, "b1");
  const dock = e.host.querySelector(".sv-subs");
  dock.querySelector(".shead").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(dock.dataset.fold, "open", "a list with no height on screen opens when you ask");
  structPool.delete(e.name);
});

test("the three rows above the box wear the same floating skin", () => {
  const css = slice("  .sv-queue { display: none", ".sv-composer { position: relative");
  for (const rule of [".sv-subs {", ".sv-queue {"]) {
    const at = css.indexOf(rule);
    assert.ok(at >= 0, `${rule} should live in that stretch of css`);
    assert.match(css.slice(at, at + 420), /var\(--float-bg\)/);
    assert.match(css.slice(at, at + 420), /border-radius: 12px/);
  }
  assert.match(slice(".sv-jump { position: absolute", ".sv-jump:hover"), /var\(--float-bg\)|color-mix/);
});

test("the pane knows it is narrow, and only says so when it changes", () => {
  const e = pane();
  widthOf(e.host, 900);
  svNarrow(e);
  assert.ok(!e.host.classList.contains("sv-narrow"));
  widthOf(e.host, 520);
  svNarrow(e);
  assert.ok(e.host.classList.contains("sv-narrow"));
  widthOf(e.host, 900);
  svNarrow(e);
  assert.ok(!e.host.classList.contains("sv-narrow"));
  structPool.delete(e.name);
});

test("in the new hive the card never folds and a subagent row never opens", () => {
  document.body.classList.add("experience-next");
  try {
    const e = pane();
    launch(e, "b1");
    const dock = e.host.querySelector(".sv-subs");
    dock.querySelector(".shead").dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(dock.dataset.fold, "auto", "the head folded the card");
    const summary = dock.querySelector(".sv-sub summary");
    const click = new window.MouseEvent("click", { bubbles: true, cancelable: true });
    summary.dispatchEvent(click);
    assert.equal(click.defaultPrevented, true, "the row would open on click");
    structPool.delete(e.name);
  } finally {
    document.body.classList.remove("experience-next");
  }
});

test("in the new hive the rows above the box keep the same room on both sides", () => {
  const css = readFileSync(join(HERE, "assets", "experience.css"), "utf8");
  assert.match(css, /body\.experience-next \.sv \{ --sv-bar: 0px !important; \}/);
  assert.match(css, /body\.experience-next :is\(\.sv-subs\[data-fold="shut"\], \.sv-narrow \.sv-subs\[data-fold="auto"\]\) \.sublist \{ display: flex; \}/);
});
