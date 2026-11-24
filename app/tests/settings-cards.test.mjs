import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { BLOCK_SIZE_DEFAULT, BRAND_FACE_DEFAULT, GAZE_DEFAULT, LOOK_DEFAULT, PETS_OFF, STRUCTURE_DEFAULT, TOOL_CALLS_DEFAULT, VISUAL_DEFAULT } from "../lib/config.mjs";
import { QUIET_DAYS_DEFAULT } from "../lib/quiet-seats.mjs";
import { DIARY_DAYS_DEFAULT } from "../lib/diary-prune.mjs";

await state();
await views();
globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "{}", json: async () => ({}) });
const { $ } = await app("core");
await app("themes");
const { SETTING_DEFAULTS, paintSettingResets, searchSettings, foldText } = await app("settings-cards");

const settle = () => new Promise((done) => setTimeout(done, 20));
const rows = () => [...$("pref-body").querySelectorAll(".set-row")];
const visibleRows = () => rows().filter((row) => !row.classList.contains("miss")).map((row) => row.dataset.control || row.querySelector(".set-title")?.textContent || "");

test("every pane is made of groups of cards, and every control row names its title and its controls", () => {
  const panes = [...$("pref-body").querySelectorAll(".pref-pane")];
  assert.equal(panes.length, 12);
  for (const pane of panes) assert.ok(pane.querySelector(".set-group .set-card .set-row"), `${pane.dataset.pane} has no card`);
  for (const row of $("pref-body").querySelectorAll(".set-row[data-control]")) {
    assert.ok(row.querySelector(".set-title")?.textContent.trim(), `${row.dataset.control} has no title`);
    for (const id of row.dataset.control.split(/\s+/)) assert.ok($(id) && row.contains($(id)), `${id} is not inside its row`);
  }
});

test("the controls keep the ids the rest of the app reaches for", () => {
  const ids = ["f-look", "f-lang", "f-sans", "f-mono", "f-term", "f-chat-line", "f-chat-gap", "cfg-path", "cfg-ignored", "f-visual", "experience-toggle", "experience-state", "experience-recovery", "t-stt", "stt-say", "stt-box", "f-stt-model", "stt-state", "stt-bar", "stt-get", "stt-stop", "stt-drop", "f-stt-mic", "f-stt-lang", "cfg-mug", "cfg-open", "cfg-pick", "cfg-face", "cfg-roll", "cfg-strip", "f-pet", "f-brand", "f-gaze", "s-needs", "p-needs", "t-needs", "s-answered", "p-answered", "t-answered", "s-asked-say", "p-asked", "t-knocks", "s-knocks-say", "s-volume", "s-volume-n", "f-layout", "f-size", "f-shots", "f-tools", "f-compact", "t-context-usage", "s-context-usage-say", "t-agent-updates", "s-agent-updates-say", "f-quiet-days", "f-diary-days", "slack-state", "slack-code-box", "slack-code", "slack-connect", "slack-forget", "help-hint", "help-leader", "help-keys"];
  for (const id of ids) assert.equal(document.querySelectorAll(`#${id}`).length, 1, `#${id} should be on the page once`);
});

test("the defaults the cards reset to are the ones the config file falls back to", () => {
  assert.equal(SETTING_DEFAULTS["f-look"], LOOK_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-structure"], STRUCTURE_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-visual"], VISUAL_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-gaze"], GAZE_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-brand"], BRAND_FACE_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-pet"], PETS_OFF);
  assert.equal(SETTING_DEFAULTS["f-tools"], TOOL_CALLS_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-size"], BLOCK_SIZE_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-quiet-days"][0], String(QUIET_DAYS_DEFAULT));
  assert.equal(SETTING_DEFAULTS["f-diary-days"][0], String(DIARY_DAYS_DEFAULT));
});

test("a changed row shows the way back to the default, and taking it restores the value through the control's own handler", async () => {
  const pick = $("f-tools");
  pick.innerHTML = '<option value="all">all</option><option value="zen">zen</option>';
  pick.value = "zen";
  let heard = "";
  const hear = (event) => { heard = event.target.value; };
  pick.addEventListener("change", hear);
  paintSettingResets();
  const back = pick.closest(".set-row").querySelector(".set-reset");
  assert.ok(back, "the row has the button");
  assert.equal(back.hidden, false, "it shows while the value is not the default");
  assert.match(back.getAttribute("aria-label"), /tool calls in the chat/);
  back.click();
  assert.equal(pick.value, "all");
  assert.equal(heard, "all", "the change went through the listener that saves it");
  paintSettingResets();
  assert.equal(back.hidden, true, "and it hides once the value is back");
  pick.removeEventListener("change", hear);
});

test("a switch in a card is a switch to a screen reader, and its reset flips it back", async () => {
  const flip = $("t-context-usage");
  flip.classList.add("on");
  let clicks = 0;
  const count = () => { clicks += 1; flip.classList.toggle("on"); };
  flip.addEventListener("click", count);
  paintSettingResets();
  assert.equal(flip.getAttribute("role"), "switch");
  assert.equal(flip.getAttribute("aria-checked"), "true");
  const back = flip.closest(".set-row").querySelector(".set-reset");
  assert.equal(back.hidden, false);
  back.click();
  assert.equal(clicks, 1);
  paintSettingResets();
  assert.equal(flip.getAttribute("aria-checked"), "false");
  assert.equal(back.hidden, true);
  flip.removeEventListener("click", count);
  await settle();
});

test("a row without a known default never offers a reset", () => {
  paintSettingResets();
  assert.equal($("f-stt-mic").closest(".set-row").querySelector(".set-reset"), null);
  assert.equal($("f-lang").closest(".set-row").querySelector(".set-reset"), null, "the language is a choice, not a default to go back to");
});

test("the search looks in every section at once and keeps only the rows that match", () => {
  const found = searchSettings("font");
  assert.ok(found >= 2);
  assert.ok($("pref-body").classList.contains("searching"));
  const shown = visibleRows();
  assert.ok(shown.includes("f-sans") && shown.includes("f-mono"));
  assert.ok(!shown.includes("f-tools"));
  assert.equal($("pref-nav").querySelector('button[data-pane="look"]').classList.contains("miss"), false);
  assert.equal($("pref-nav").querySelector('button[data-pane="slack"]').classList.contains("miss"), true);
  assert.equal($("pref-none").hidden, true);
});

test("words match in any order and without accents, and a section name brings its whole section", () => {
  searchSettings("chat closed");
  assert.ok(visibleRows().includes("f-diary-days"));
  searchSettings("intérface");
  assert.ok(visibleRows().includes("f-sans"));
  searchSettings("notices");
  const shown = visibleRows();
  for (const id of ["s-needs t-needs", "s-answered t-answered", "s-volume", "t-knocks"]) assert.ok(shown.includes(id), `${id} is in the notices section`);
});

test("a search with no answer says so, and clearing it puts the one section back", () => {
  assert.equal(searchSettings("xylophone"), 0);
  assert.equal($("pref-none").hidden, false);
  searchSettings("");
  assert.equal($("pref-body").classList.contains("searching"), false);
  assert.equal($("pref-none").hidden, true);
  assert.equal(rows().some((row) => row.classList.contains("miss")), false);
  assert.equal([...$("pref-nav").querySelectorAll("button.miss")].length, 0);
});

test("the plain window has its own search box, and Escape in it clears before it closes anything", () => {
  const box = $("pref-search");
  assert.ok(box);
  box.value = "volume";
  box.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual(visibleRows(), ["s-volume"]);
  const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  box.dispatchEvent(esc);
  assert.equal(esc.defaultPrevented, true);
  assert.equal(box.value, "");
  assert.equal($("pref-body").classList.contains("searching"), false);
});

test("Escape in the search of the dressed window clears the search and keeps the window open", () => {
  const box = document.createElement("input");
  box.id = "pref-find";
  $("help").querySelector(".box").prepend(box);
  box.value = "notices";
  box.dispatchEvent(new Event("input", { bubbles: true }));
  searchSettings(box.value);
  const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  box.dispatchEvent(esc);
  assert.equal(esc.defaultPrevented, true);
  assert.equal(box.value, "");
  assert.equal($("pref-body").classList.contains("searching"), false);
  box.remove();
});

test("folding drops accents and case", () => {
  assert.equal(foldText("Ação RÁPIDA"), "acao rapida");
});
