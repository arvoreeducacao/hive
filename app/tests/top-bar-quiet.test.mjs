import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { app, state, views } from "./dom.mjs";

const DOCTOR_CORE = new URL("../doctor/doctor-core.mjs", import.meta.url).href;
registerHooks({ resolve: (spec, context, next) => next(spec === "/assets/doctor-core.mjs" ? DOCTOR_CORE : spec, context) });

const HERE = fileURLToPath(new URL("..", import.meta.url));
const top = readFileSync(join(HERE, "assets", "raycast", "top.css"), "utf8");

const st = await state();
await views();
const { $ } = await app("core");
const { render } = await app("arrange");
const { paintBlocks } = await app("mirror");
const { markHiveReach } = await app("limit-chip");
const { paintUpdate } = await app("tour");
await app("raycast-top");

const seat = (name, over = {}) => ({ name, title: name, where: "local", state: "idle", kind: "session", ...over });

function flag(on) {
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: on ? { experience: "raycast", was: "current" } : { experience: "current", was: "raycast" } }));
}

function hive(sessions, keysPerBlock) {
  st.LIMIT = 4;
  st.data = { sessions, spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a", tint: "#111" }];
  st.space = "a";
  st.blocks = keysPerBlock.map((keys, i) => ({ id: `blk${i}`, ws: "a", label: "", manual: false, keys }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.mirrorDev = "";
  st.holding = "";
  st.prs = [];
  st.limits = { accounts: [], tightest: "" };
  st.keys.block = { alt: true, code: "Digit" };
}

const bothVisuals = (check) => {
  for (const on of [false, true]) {
    flag(on);
    try { check(on ? "default" : "new"); } finally { flag(false); }
  }
};

test("the calls button is the dot and the number, and the sentence moves to the tooltip and the label", () => {
  hive([seat("s1", { state: "needs" }), seat("s2")], [["s1", "s2"]]);
  bothVisuals((visual) => {
    render();
    const calls = $("btn-calls");
    assert.equal(calls.textContent.trim(), "1", `${visual}: no words beside the number`);
    assert.equal(calls.classList.contains("calls"), false, `${visual}: no filled pill`);
    assert.equal(calls.getAttribute("aria-label"), "1 needs you");
    assert.match(calls.title, /^1 needs you · s1 · /);
  });
});

test("the workspace chip and the block tabs carry no counts; the tooltips do", () => {
  hive([seat("s1"), seat("s2"), seat("s3"), seat("s4"), seat("s5")], [["s1", "s2", "s3", "s4"], ["s5"]]);
  bothVisuals((visual) => {
    render();
    paintBlocks();
    assert.equal(document.querySelector("#btn-space em"), null, `${visual}: the number of blocks left the chip`);
    assert.match($("btn-space").title, / · 2 blocks · /);
    assert.equal(document.querySelector("#blocks button[data-i] em"), null, `${visual}: no 4/4 on a tab`);
    for (const name of document.querySelectorAll("#blocks button[data-i] span")) assert.doesNotMatch(name.textContent, / \+\d/, `${visual}: no +3 on a tab`);
  });
});

test("the update offer is an icon whose words live in the tooltip and in text only a screen reader reads", () => {
  paintUpdate({ behind: 2, tag: "hive-2026.11.24-7712d0d5", number: 903, via: "release", packaged: true, notes: [], mine: {} });
  const button = $("btn-update");
  assert.equal(button.hidden, false);
  assert.equal($("n-update"), null, "the count is not painted beside the icon any more");
  assert.equal(button.title, "Update Hive · 2 changes since your build — click to read them");
  assert.equal($("upd-said").textContent, button.title);
  assert.ok($("upd-said").classList.contains("sr-only"));
  assert.ok(button.querySelector(".lbl svg.hex"), "the hexagon is what the person sees");
  assert.match(top, /#btn-update\.upd:not\(\.busy, \.held\)::after \{[^}]*background: var\(--blue\)/, "the default visual marks the offer with a blue dot");
  paintUpdate({ behind: 0, mine: {} });
});

test("the more button is a drawn icon, not a mono letter", () => {
  const more = $("btn-more");
  assert.equal(more.textContent.trim(), "");
  assert.equal(more.querySelector("svg use")?.getAttribute("href"), "#i-more");
  assert.ok(document.getElementById("i-more"), "the sprite carries the icon");
});

test("the clock is marked lost while the hive stops answering", () => {
  markHiveReach(false);
  try {
    assert.equal($("clock").classList.contains("lost"), true);
  } finally {
    markHiveReach(true);
  }
  assert.equal($("clock").classList.contains("lost"), false);
});

test("the tooltips still say the keys the caps no longer show", () => {
  hive([seat("s1"), seat("s2"), seat("s3")], [["s1", "s2"], ["s3"]]);
  render();
  paintBlocks();
  const tabs = [...document.querySelectorAll("#blocks button[data-i]")];
  assert.ok(tabs.length > 0);
  for (const tab of tabs) assert.match(tab.title, /(⌥|Alt\+)\d$/, "each block tab ends in its key");
  assert.match(document.getElementById("btn-space").title, / · \S+$/, "the workspace chip ends in the key that opens the floors");
});
