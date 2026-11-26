import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { closeSeatPicker, openSeatPicker, paintPills } = await app("chat-and-panes");

const LEVELS = ["low", "medium", "high", "xhigh", "max"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1), description: `${value} thinking` }));

function draft(effort = "high") {
  const tile = document.createElement("div");
  tile.className = "tile";
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-composer"><div class="sv-pick"><span class="sv-pill sv-pill-model"></span><span class="sv-pill sv-pill-effort"></span></div><textarea></textarea></div>`;
  tile.appendChild(host);
  document.body.appendChild(tile);
  return { name: `volume-${Math.random()}`, host, draft: true, effort, model: "opus", catalog: [{ value: "opus", label: "Opus", group: "", efforts: LEVELS, defaultEffort: "high" }] };
}

function clear() {
  for (const stray of document.querySelectorAll(".tile, .sv-menu")) stray.remove();
}

test("the effort picker is a list of the levels", () => {
  clear();
  const e = draft("high");
  openSeatPicker(e, "effort");
  assert.ok(document.querySelectorAll(".sv-menu .sv-row").length >= 5);
  closeSeatPicker(e);
  clear();
});

test("a chat on the model's default names the level on the pill and says it is the default", () => {
  clear();
  const e = draft("");
  e.draft = false;
  paintPills(e);
  const pill = e.host.querySelector(".sv-pill-effort");
  assert.equal(pill.querySelector(".txt").textContent, "High");
  assert.equal(pill.querySelector(".dim").textContent, " (default)");
  e.effort = "low";
  paintPills(e);
  assert.equal(pill.querySelector(".txt").textContent, "Low");
  assert.equal(pill.querySelector(".dim").textContent, "", "a level picked by hand is not the default");
  clear();
});
