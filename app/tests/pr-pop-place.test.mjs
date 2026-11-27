import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ prs: st.prs }), json: async () => ({ prs: st.prs }) });
await views();
await app("themes");
const { closePrPop, placePrPop, prPopOpen, togglePrPop } = await app("seat-menu");

const pop = document.getElementById("prpop");
const button = document.getElementById("btn-prs");

const fix = (target, name, value) => Object.defineProperty(target, name, { value, configurable: true, writable: true });

const measure = (screen, seat, host, width) => {
  fix(pop, "offsetParent", host && { getBoundingClientRect: () => host });
  fix(pop, "offsetWidth", width);
  fix(button, "getBoundingClientRect", () => seat);
  fix(globalThis, "innerWidth", screen);
};

const open = () => { if (!prPopOpen()) togglePrPop(); };

const place = (screen, seat, host, width) => {
  closePrPop();
  measure(screen, seat, host, width);
  open();
  const right = Number.parseInt(pop.style.right, 10);
  return { right, left: host.right - right - width };
};

const bar = { right: 1226 };

test("the panel hangs off the right edge of the button, not off the window", () => {
  const at = place(1240, { left: 871, right: 979 }, bar, 396);
  assert.equal(bar.right - at.right, 979, "its right edge lands on the button's right edge");
});

test("a button too far left does not push the panel past the window", () => {
  const at = place(1240, { left: 60, right: 168 }, bar, 396);
  assert.equal(at.left, 6, "it stops at the window edge instead");
});

test("a window narrower than the panel keeps it on screen", () => {
  const at = place(300, { left: 60, right: 168 }, { right: 286 }, 396);
  assert.equal(286 - at.right, 294, "the right edge sits inside the window");
});

test("the panel is only placed once it can be measured", () => {
  closePrPop();
  measure(1240, { left: 871, right: 979 }, null, 396);
  open();
  assert.equal(pop.style.right, "", "a hidden panel has no box to measure");
  placePrPop();
  assert.equal(pop.style.right, "", "and asking again does not invent one");
  closePrPop();
});

test("opening shows the panel and tells the button, closing hides both and lets go of the place", () => {
  place(1240, { left: 871, right: 979 }, bar, 396);
  assert.equal(pop.hidden, false);
  assert.equal(button.getAttribute("aria-expanded"), "true");
  closePrPop();
  assert.equal(prPopOpen(), false);
  assert.equal(pop.hidden, true);
  assert.equal(pop.style.right, "");
  assert.equal(button.getAttribute("aria-expanded"), "false");
});

test("a click away closes the panel even when the seat swallows it", () => {
  open();
  assert.equal(prPopOpen(), true);
  const seat = document.getElementById("grid") || document.body;
  const swallow = (ev) => ev.stopPropagation();
  seat.addEventListener("pointerdown", swallow);
  seat.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  seat.removeEventListener("pointerdown", swallow);
  assert.equal(prPopOpen(), false, "the panel and its button are the only places the click is spared");
  assert.equal(pop.hidden, true);
});

test("a click on the panel itself leaves it open", () => {
  open();
  pop.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  assert.equal(prPopOpen(), true);
  button.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  assert.equal(prPopOpen(), true);
  closePrPop();
});

test("a resized window puts the panel back under the button", () => {
  place(1240, { left: 60, right: 168 }, bar, 396);
  measure(1240, { left: 871, right: 979 }, bar, 396);
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(pop.style.right, "247px");
  closePrPop();
});
