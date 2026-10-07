import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app, dom } from "./dom.mjs";

const source = readFileSync(new URL("../src/app/chat-and-panes.js", import.meta.url), "utf8");
const { clickLeavesPicker, closeSeatPicker, openSeatPicker, pickerRow } = await app("chat-and-panes");
const { structPool } = await app("structured-seats");
const { dropStructured } = await app("terminal-history");

function slice(from, to) {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of chat-and-panes.js`);
  return source.slice(a, b);
}

function loose(cls) {
  const node = document.createElement("div");
  if (cls) node.className = cls;
  node.dataset.pickerTest = "1";
  document.body.appendChild(node);
  return node;
}

function seat(name) {
  const host = loose("sv");
  host.innerHTML = `<div class="sv-composer"><span class="sv-pill sv-pill-model"></span><textarea></textarea></div>`;
  return { name, host, catalog: [{ value: "opus", label: "Opus", group: "" }] };
}

function clear() {
  for (const stray of document.querySelectorAll("[data-picker-test], .sv-menu")) stray.remove();
  structPool.clear();
}

test("a click on a row inside the open picker never reads as away", () => {
  clear();
  const menu = loose("sv-menu");
  const row = pickerRow({ label: "Opus" });
  menu.appendChild(row);
  assert.equal(clickLeavesPicker(row), false, "this is the click that picks a model — sweeping the menu here is why nothing happened");
});

test("a click on the pill is the pill's own business", () => {
  clear();
  const pill = loose("sv-pill sv-pill-model");
  assert.equal(clickLeavesPicker(pill), false);
});

test("a click anywhere else closes the picker", () => {
  clear();
  assert.equal(clickLeavesPicker(loose()), true);
  const composer = loose("sv-composer");
  const inside = document.createElement("textarea");
  composer.appendChild(inside);
  assert.equal(clickLeavesPicker(inside), true);
});

test("a target that cannot answer closest is treated as away, not as a crash", () => {
  assert.equal(clickLeavesPicker(null), true);
  assert.equal(clickLeavesPicker(undefined), true);
  assert.equal(clickLeavesPicker({}), true);
});

test("the picker registers no document listener of its own", () => {
  const opening = slice("function openSeatPicker(e, kind)", "const say = (headline, body)");
  assert.doesNotMatch(
    opening,
    /document\.addEventListener\(\s*["']mousedown["']/,
    "one listener per open is one per open to leak: a seat dropped with a picker in it left its handler on the document holding a detached node, and every mousedown after that swept the live picker away"
  );
});

test("what the picker hands out no longer carries a listener to clean up", () => {
  clear();
  const e = seat("picker-seat");
  openSeatPicker(e, "model");
  assert.equal(e.menu.kind, "model");
  assert.ok(e.menu.el.classList.contains("sv-menu"));
  assert.equal(typeof e.menu.repaint, "function");
  assert.deepEqual(Object.keys(e.menu).sort(), ["el", "kind", "repaint"], "a handle nobody removes is a handle that outlives its seat");
});

test("closing a picker does not depend on a handle it may not hold", () => {
  clear();
  const e = seat("picker-seat");
  openSeatPicker(e, "model");
  assert.equal(document.querySelectorAll(".sv-menu").length, 1);
  assert.ok(e.host.querySelector(".sv-pill-model").classList.contains("open"));
  loose("sv-menu");
  closeSeatPicker({});
  assert.equal(document.querySelectorAll(".sv-menu").length, 0, "the sweep is what makes a picker that outlived its bookkeeping still close");
  assert.equal(document.querySelectorAll(".sv-pill.open").length, 0);
  assert.doesNotMatch(slice("function closeSeatPicker(e, cancel = false)", "function clickLeavesPicker"), /removeEventListener/);
});

test("a seat view that goes away takes its picker with it", () => {
  clear();
  const e = seat("dropped-seat");
  structPool.set(e.name, e);
  openSeatPicker(e, "model");
  assert.equal(document.querySelectorAll(".sv-menu").length, 1);
  dropStructured(e.name);
  assert.equal(e.menu, null);
  assert.equal(document.querySelectorAll(".sv-menu").length, 0, "dropping the view left an open menu painted over the hive with no seat behind it");
});

test("the sweep still asks the document, so a stray menu cannot survive it", () => {
  clear();
  const e = seat("swept-seat");
  structPool.set(e.name, e);
  openSeatPicker(e, "model");
  const row = e.menu.el.querySelector("input");
  row.dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(document.querySelectorAll(".sv-menu").length, 1, "a mousedown inside the menu swept the menu the pointer was in");

  loose().dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true }));
  assert.equal(document.querySelectorAll(".sv-menu").length, 0);
  assert.match(
    slice('document.addEventListener("mousedown"', "function pickerRow("),
    /for \(const e of structPool\.values\(\)\) if \(e\.menu\) closeSeatPicker\(e, cancel\);/,
    "the sweep leaves the seats holding a handle to a menu that is no longer on the screen"
  );
});

test("a mousedown in one menu leaves the menu under the cursor alone", () => {
  clear();
  const e = seat("two-menus");
  structPool.set(e.name, e);
  openSeatPicker(e, "model");
  const first = loose("sv-menu");
  document.body.insertBefore(first, document.body.firstChild);
  const live = e.menu.el.querySelector("input");
  live.dispatchEvent(new dom.MouseEvent("mousedown", { bubbles: true }));
  assert.ok(e.menu, "asking the FIRST .sv-menu whether it holds the target answers for a different menu than the one under the cursor");
});
