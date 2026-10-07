import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { closeEveryPicker, closeSeatPicker, openSeatPicker, paintPills } = await app("chat-and-panes");

const LEVELS = ["low", "medium", "high", "xhigh", "max"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1), description: `${value} thinking` }));

function draft(effort = "high") {
  document.body.classList.add("experience-next");
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
  for (const stray of document.querySelectorAll(".tile, .sv-menu, .sv-scrim")) stray.remove();
  document.body.classList.remove("experience-next");
}

const key = (e, name) => e.menu.el.querySelector("input").dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
const lit = () => document.querySelectorAll(".sv-volume .vlv i:not(.dot)").length;
const shown = () => document.querySelector(".sv-volume .vn")?.textContent;

test("the effort picker is a volume bar lit up to the level the chat is on", () => {
  clear();
  const e = draft("high");
  openSeatPicker(e, "effort");
  assert.ok(e.menu.el.classList.contains("volume"));
  assert.equal(document.querySelectorAll(".sv-volume .vlv").length, 5);
  assert.equal(lit(), 12, "four bars per level, three levels up");
  assert.equal(shown(), "High");
  assert.equal(document.querySelector(".sv-volume .vdef").textContent, "(default)");
  assert.equal(document.querySelector(".sv-volume .vd"), null, "no description line under the bar");
  closeSeatPicker(e, true);
  clear();
});

test("the arrows move the bar without touching the chat until it closes", () => {
  clear();
  const e = draft("high");
  openSeatPicker(e, "effort");
  key(e, "ArrowRight");
  assert.equal(shown(), "Xhigh");
  assert.equal(document.querySelector(".sv-volume .vdef").textContent, "", "only the model's default level carries the tag");
  assert.equal(lit(), 16);
  assert.equal(e.effort, "high", "a step is a preview: every step sent would be a command the session has to answer");
  key(e, "Enter");
  assert.equal(e.effort, "xhigh");
  assert.equal(e.menu, null);
  clear();
});

test("escape leaves the level where it was", () => {
  clear();
  const e = draft("high");
  openSeatPicker(e, "effort");
  key(e, "ArrowLeft");
  key(e, "ArrowLeft");
  assert.equal(shown(), "Low");
  key(e, "Escape");
  assert.equal(e.effort, "high");
  clear();
});

test("a click away keeps what the bar shows", () => {
  clear();
  const e = draft("high");
  openSeatPicker(e, "effort");
  document.querySelectorAll(".sv-volume .vlv")[4].click();
  assert.equal(shown(), "Max");
  closeSeatPicker(e);
  assert.equal(e.effort, "max");
  clear();
});

test("the ends of the bar switch off the button that would go past them", () => {
  clear();
  const e = draft("max");
  openSeatPicker(e, "effort");
  assert.equal(document.querySelector(".sv-volume .more").disabled, true);
  assert.equal(document.querySelector(".sv-volume .less").disabled, false);
  document.querySelector(".sv-volume .less").click();
  assert.equal(shown(), "Xhigh");
  closeSeatPicker(e, true);
  const low = draft("low");
  openSeatPicker(low, "effort");
  assert.equal(document.querySelector(".sv-volume .less").disabled, true);
  closeSeatPicker(low, true);
  clear();
});

test("closing every picker at once with escape cancels the step too", () => {
  clear();
  const e = draft("high");
  openSeatPicker(e, "effort");
  key(e, "ArrowRight");
  closeEveryPicker(true);
  assert.equal(document.querySelector(".sv-menu"), null);
  assert.equal(e.effort, "high");
  clear();
});

test("the current Hive keeps the list", () => {
  clear();
  const e = draft("high");
  document.body.classList.remove("experience-next");
  openSeatPicker(e, "effort");
  assert.equal(e.menu.el.classList.contains("volume"), false);
  assert.equal(document.querySelector(".sv-volume"), null);
  assert.ok(document.querySelectorAll(".sv-menu .sv-row").length >= 5);
  closeSeatPicker(e, true);
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
