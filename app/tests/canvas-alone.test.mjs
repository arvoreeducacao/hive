import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const asked = [];
const toldItIsReading = [];
window.hiveWindow = {
  act: (what) => asked.push(what),
  readingAlone: (on) => toldItIsReading.push(on),
  onLeaveReading: () => {}
};

const st = await state();
await views();

const { aloneOn, setAlone, toggleAlone } = await app("canvas-alone");
const { screenWentBackToAWindow } = await app("screen-alone");

const chrome = () => ({
  body: document.body,
  button: document.getElementById("btn-alone"),
  out: document.getElementById("btn-narrow")
});

function canvas({ full = false } = {}) {
  asked.length = 0;
  toldItIsReading.length = 0;
  document.documentElement.classList.toggle("fullscreen", full);
  st.alone = false;
  setAlone(false);
  asked.length = 0;
  toldItIsReading.length = 0;
  return chrome();
}

test("the chat alone hides the app around it and takes the screen", () => {
  const els = canvas();
  setAlone(true);
  assert.equal(els.body.classList.contains("alone"), true, "the bar, the rail and the strip are still eating the screen");
  assert.equal(els.button.getAttribute("aria-pressed"), "true");
  assert.equal(els.out.hidden, false, "with the chrome gone, the way out has to be on screen");
  assert.deepEqual(asked, ["full"], "covering the app bar is not full screen — the window has to go too");
});

test("leaving puts the app back and returns the window", () => {
  const els = canvas();
  setAlone(true);
  toggleAlone();
  assert.equal(els.body.classList.contains("alone"), false);
  assert.equal(els.out.hidden, true);
  assert.equal(aloneOn(), false);
  assert.deepEqual(asked, ["full", "windowed"]);
});

test("the chat never asks the window to eat escape — the composer needs that key", () => {
  canvas();
  setAlone(true);
  assert.deepEqual(toldItIsReading, [false], "escape belongs to the composer here; only the shelf, trapped behind an iframe, may take it");
});

test("a window already full screen is left as the person put it", () => {
  canvas({ full: true });
  setAlone(true);
  assert.deepEqual(asked, [], "it was already full screen — nothing to take");
  setAlone(false);
  assert.deepEqual(asked, [], "and nothing to give back");
});

test("leaving full screen by the window drops the reading with it", () => {
  const els = canvas();
  setAlone(true);
  document.documentElement.classList.remove("fullscreen");
  screenWentBackToAWindow();
  assert.equal(els.body.classList.contains("alone"), false, "in a window, that chat would be sitting on top of the app bar");
  assert.deepEqual(asked, ["full"], "the window is already back — asking again would fight the person");
});

test("the button in the strip is wired — not just the function behind it", () => {
  const els = canvas();
  els.button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(aloneOn(), true, "the strip button has to be the thing that opens it, or only tests can");
  els.out.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(aloneOn(), false, "and the pill has to be the thing that closes it");
});
