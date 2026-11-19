import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $ } = await app("core");
const { closePal, palKeys, palPaint } = await app("palette");
await app("hold-numbers");

const press = (over) => new dom.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...over });
const ctrl = (code, over = {}) => press({ key: code.slice(3).toLowerCase(), code, ctrlKey: true, ...over });

const raycast = (on) => {
  const was = document.body.classList.contains("experience-raycast");
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new dom.CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: was ? "raycast" : "current" } }));
};

function openFresh(mode = "") {
  st.palMode = mode;
  st.palSel = 0;
  st.palSelId = "";
  $("pal-q").value = "";
  $("pal-list").dataset.h = "";
  $("pal").hidden = false;
  palPaint();
}

const menuSel = () => [...$("pal-acts").querySelectorAll(".mi")].findIndex((el) => el.classList.contains("sel"));

test("ctrl+n goes down the palette and ctrl+p comes back up, like the arrows", () => {
  openFresh();
  try {
    palKeys(ctrl("KeyN"));
    assert.equal(st.palSel, 1);
    palKeys(ctrl("KeyN"));
    assert.equal(st.palSel, 2);
    palKeys(ctrl("KeyP"));
    assert.equal(st.palSel, 1);
    const up = ctrl("KeyP");
    palKeys(up);
    assert.equal(st.palSel, 0);
    assert.equal(up.defaultPrevented, true);
  } finally { closePal(); }
});

test("ctrl+p on the first row wraps to the last, as the up arrow does", () => {
  openFresh();
  try {
    const last = st.palRows.filter((r) => !r.sec).length - 1;
    palKeys(ctrl("KeyP"));
    assert.equal(st.palSel, last);
  } finally { closePal(); }
});

test("ctrl+shift+p and alt+n are not steps", () => {
  openFresh();
  try {
    palKeys(ctrl("KeyP", { shiftKey: true }));
    assert.equal(st.palSel, 0);
    palKeys(press({ key: "n", code: "KeyN", altKey: true }));
    assert.equal(st.palSel, 0);
  } finally { closePal(); }
});

test("with the palette on ctrl+p, actions move to ctrl+k and ctrl+n/ctrl+p walk the actions menu", () => {
  const was = st.keys.palette;
  st.keys.palette = { ctrl: true, code: "KeyP" };
  const files = st.palFiles;
  st.palFiles = { q: "", rows: [{ path: "src/one.js", name: "repo", where: "local" }], loading: false, total: 1, at: 0, error: "" };
  raycast(true);
  openFresh("file");
  try {
    assert.match($("pal-hints").textContent, /Ctrl\s*K/);
    palKeys(ctrl("KeyP"));
    assert.equal($("pal-acts")?.hidden ?? true, true, "ctrl+p is a step, not the actions menu");
    palKeys(ctrl("KeyK"));
    assert.equal($("pal-acts").hidden, false, "ctrl+k opens the actions of the selected row");
    const first = menuSel();
    palKeys(ctrl("KeyN"));
    assert.notEqual(menuSel(), first);
    palKeys(ctrl("KeyP"));
    assert.equal(menuSel(), first);
    palKeys(ctrl("KeyK"));
    assert.equal($("pal-acts").hidden, true, "ctrl+k closes it again");
  } finally {
    closePal();
    raycast(false);
    st.keys.palette = was;
    st.palFiles = files;
  }
});

test("with the palette on its own key, that key still opens the actions", () => {
  const was = st.keys.palette;
  st.keys.palette = { ctrl: true, shift: true, code: "KeyK" };
  raycast(true);
  openFresh();
  try {
    assert.match($("pal-hints").textContent, /Ctrl\s*Shift\s*K/);
    palKeys(ctrl("KeyK", { shiftKey: true }));
    assert.equal($("pal-acts").hidden, false);
  } finally {
    closePal();
    raycast(false);
    st.keys.palette = was;
  }
});

test("with the palette shut, ctrl+n and ctrl+p never reach it", () => {
  const taken = Object.entries(st.keys).filter(([, b]) => b && b.ctrl && !b.alt && !b.shift && !b.meta && (b.code === "KeyN" || b.code === "KeyP"));
  for (const [a] of taken) st.keys[a] = null;
  openFresh();
  closePal();
  st.palSel = 0;
  try {
    for (const code of ["KeyN", "KeyN", "KeyP"]) document.dispatchEvent(ctrl(code));
    assert.equal(st.palSel, 0);
    assert.equal($("pal").hidden, true);
    assert.equal($("pal-acts")?.hidden ?? true, true);
  } finally {
    for (const [a, b] of taken) st.keys[a] = b;
  }
});
