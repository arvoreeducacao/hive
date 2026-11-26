import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";
import { dropClass, putAttr, putData, putDisabled, putHidden, putText, putTitle } from "../src/app/dom-writes.js";

const st = await state();
const { paneOfSeat, stopBeat } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");

const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" });
after(() => {
  for (const beat of ["threads", "prs"]) stopBeat(beat);
  globalThis.fetch = realFetch;
});

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive() {
  st.LIMIT = 4;
  st.data = { sessions: ["ana", "bia"].map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["ana", "bia"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  paneOfSeat.clear();
  render();
}

const settle = () => new Promise((then) => setImmediate(then));

test("each helper writes only when the value changes, so a repaint leaves no mutation behind", async () => {
  const el = document.createElement("button");
  document.body.appendChild(el);
  putHidden(el, true);
  putAttr(el, "aria-pressed", "true");
  putTitle(el, "fold");
  putData(el, "state", "idle");
  putText(el, "go");
  putDisabled(el, true);
  el.classList.add("on");
  const seen = [];
  const watch = new window.MutationObserver((records) => seen.push(...records));
  watch.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
  putHidden(el, true);
  putAttr(el, "aria-pressed", "true");
  putTitle(el, "fold");
  putData(el, "state", "idle");
  putText(el, "go");
  putDisabled(el, true);
  dropClass(el, "off");
  await settle();
  assert.deepEqual(seen.map((one) => one.attributeName || one.type), []);
  putHidden(el, false);
  putAttr(el, "aria-pressed", "false");
  dropClass(el, "on");
  await settle();
  watch.disconnect();
  assert.deepEqual(seen.map((one) => one.attributeName), ["hidden", "aria-pressed", "class"]);
  assert.equal(el.hidden, false);
  el.remove();
});

test("a missing element still throws, so a render that falls is named instead of passing in silence", () => {
  for (const write of [() => putHidden(null, true), () => putAttr(null, "aria-pressed", "true"), () => putText(null, "0"), () => putTitle(null, "x"), () => putData(null, "state", "idle"), () => putDisabled(null, true), () => dropClass(null, "on")]) {
    assert.throws(write, TypeError);
  }
});

test("painting the seats again with nothing changed rewrites no attribute with the value it already had", async () => {
  hive();
  await settle();
  render();
  await settle();
  const same = [];
  const watch = new window.MutationObserver((records) => {
    for (const one of records) {
      if (one.type !== "attributes" || one.attributeName === "class" || one.attributeName === "style") continue;
      if (one.target.getAttribute(one.attributeName) === one.oldValue) same.push(`${one.attributeName} on ${one.target.className || one.target.id || one.target.tagName}`);
    }
  });
  watch.observe(document.body, { attributes: true, attributeOldValue: true, subtree: true });
  render();
  render();
  await settle();
  watch.disconnect();
  const fromTheTiles = same.filter((one) => /t-fold|t-canopy|t-shot|t-device|t-page|t-name|tile|plane|mirror|canvas|btn-calls|sv-send|sv-stop/.test(one));
  assert.deepEqual(fromTheTiles, [], `a repaint rewrote what was already there: ${[...new Set(fromTheTiles)].join(", ")}`);
});
