import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

await app("themes");
const { placePrPop, prPopOpen } = await app("seat-menu");

const pop = document.getElementById("prpop");
const button = document.getElementById("btn-prs");

const fix = (target, name, value) => Object.defineProperty(target, name, { value, configurable: true, writable: true });

const place = (screen, seat, host, width) => {
  pop.style.right = "";
  fix(pop, "offsetParent", { getBoundingClientRect: () => host });
  fix(pop, "offsetWidth", width);
  fix(button, "getBoundingClientRect", () => seat);
  fix(globalThis, "innerWidth", screen);
  placePrPop();
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
  pop.style.right = "";
  fix(pop, "offsetParent", null);
  placePrPop();
  assert.equal(pop.style.right, "", "a hidden panel has no box to measure");
});

test("a click away closes the panel even when the seat swallows it", () => {
  pop.hidden = false;
  assert.equal(prPopOpen(), true);
  const seat = document.getElementById("grid") || document.body;
  const swallow = (ev) => ev.stopPropagation();
  seat.addEventListener("pointerdown", swallow);
  seat.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  seat.removeEventListener("pointerdown", swallow);
  assert.equal(prPopOpen(), false, "the panel and its button are the only places the click is spared");
});

test("a click on the panel itself leaves it open", () => {
  pop.hidden = false;
  pop.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  assert.equal(prPopOpen(), true);
  button.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));
  assert.equal(prPopOpen(), true);
  pop.hidden = true;
});

test("a resized window puts the panel back under the button", () => {
  pop.hidden = false;
  pop.style.right = "";
  fix(pop, "offsetParent", { getBoundingClientRect: () => bar });
  fix(pop, "offsetWidth", 396);
  fix(button, "getBoundingClientRect", () => ({ left: 871, right: 979 }));
  fix(globalThis, "innerWidth", 1240);
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(pop.style.right, "247px");
  pop.hidden = true;
});
