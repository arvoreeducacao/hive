import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { readFileSync } from "node:fs";
import { BLOCK_SIZE_DEFAULT, BRAND_FACE_DEFAULT, GAZE_DEFAULT, LIMITS_FOOT_DEFAULT, LOOK_DEFAULT, PETS_OFF, TOOL_CALLS_DEFAULT, VISUAL_DEFAULT } from "../lib/config.mjs";
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
  assert.equal(panes.length, 13);
  for (const pane of panes) assert.ok(pane.querySelector(".set-group .set-card .set-row"), `${pane.dataset.pane} has no card`);
  for (const row of $("pref-body").querySelectorAll(".set-row[data-control]")) {
    assert.ok(row.querySelector(".set-title")?.textContent.trim(), `${row.dataset.control} has no title`);
    for (const id of row.dataset.control.split(/\s+/)) assert.ok($(id) && row.contains($(id)), `${id} is not inside its row`);
  }
});

test("the controls keep the ids the rest of the app reaches for", () => {
  const ids = ["f-look", "f-lang", "f-sans", "f-mono", "f-term", "f-chat-line", "f-chat-gap", "cfg-path", "cfg-ignored", "f-visual", "t-stt", "stt-say", "stt-box", "f-stt-model", "stt-state", "stt-bar", "stt-get", "stt-stop", "stt-drop", "f-stt-mic", "f-stt-lang", "cfg-mug", "cfg-open", "cfg-pick", "cfg-face", "cfg-roll", "cfg-strip", "f-pet", "f-brand", "f-gaze", "s-needs", "p-needs", "t-needs", "s-answered", "p-answered", "t-answered", "p-asked", "t-knocks", "s-knocks-say", "s-volume", "s-volume-n", "f-layout", "f-size", "f-shots", "f-tools", "f-compact", "t-context-usage", "s-context-usage-say", "t-agent-updates", "s-agent-updates-say", "f-quiet-days", "f-diary-days", "slack-state", "slack-code-box", "slack-code", "slack-connect", "slack-forget", "help-hint", "help-leader", "help-keys", "btn-dim", "k-dim", "btn-share", "btn-phone", "btn-machines", "in-machine", "ver"];
  for (const id of ids) assert.equal(document.querySelectorAll(`#${id}`).length, 1, `#${id} should be on the page once`);
});

test("the defaults the cards reset to are the ones the config file falls back to", () => {
  assert.equal(SETTING_DEFAULTS["f-look"], LOOK_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-visual"], VISUAL_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-gaze"], GAZE_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-brand"], BRAND_FACE_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-pet"], PETS_OFF);
  assert.equal(SETTING_DEFAULTS["f-tools"], TOOL_CALLS_DEFAULT);
  assert.equal(SETTING_DEFAULTS["t-limits-foot"], LIMITS_FOOT_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-size"], BLOCK_SIZE_DEFAULT);
  assert.equal(SETTING_DEFAULTS["f-quiet-days"][0], String(QUIET_DAYS_DEFAULT));
  assert.equal(SETTING_DEFAULTS["f-diary-days"][0], String(DIARY_DAYS_DEFAULT));
});

test("the switches that left the ⋯ menu live in their sections and reset to what a new hive starts with", () => {
  const paneOf = (id) => $(id).closest(".pref-pane").dataset.pane;
  assert.equal(paneOf("btn-dim"), "screen");
  assert.equal(paneOf("btn-share"), "notices");
  assert.ok($("btn-share").closest(".set-card").contains($("t-knocks")), "sharing sits next to the knock, in Team");
  for (const id of ["in-machine", "btn-machines", "btn-phone", "ver"]) assert.equal(paneOf(id), "machines", `${id} is not in Machines`);
  assert.ok($("pref-nav").querySelector('button[data-pane="machines"]'), "Machines has its tab");
  for (const id of ["btn-dim", "btn-share", "btn-phone", "btn-machines"]) assert.ok($(id).classList.contains("flip"), `${id} is not a switch`);
  assert.equal(SETTING_DEFAULTS["btn-dim"], true);
  assert.equal(SETTING_DEFAULTS["btn-share"], true);
  assert.equal(SETTING_DEFAULTS["btn-phone"], false);
  assert.equal(SETTING_DEFAULTS["btn-machines"], false);
  assert.equal(SETTING_DEFAULTS["in-machine"], "");
  const menu = document.getElementById("more");
  for (const id of ["btn-dim", "btn-share", "btn-phone", "btn-machines", "in-machine", "ver"]) assert.ok(!menu.contains($(id)), `${id} is still in the ⋯ menu`);
  assert.ok(!menu.firstElementChild.classList.contains("sep"), "the menu does not open on a separator");
});

test("the ⋯ menu writes its keys as grey text, and the settings speak in sentence case with plain selects", () => {
  const page = readFileSync(new URL("../app.html", import.meta.url), "utf8");
  const panels = readFileSync(new URL("../assets/raycast/panels.css", import.meta.url), "utf8");
  const rule = (sheet, selector) => sheet.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{([^}]*)\\}`))?.[1] || "";
  const keys = rule(page, "#top #more .ghost kbd");
  assert.match(keys, /border: 0/);
  assert.match(keys, /background: none/);
  const head = rule(page, "#help .set-head");
  assert.match(head, /text-transform: none/);
  assert.match(head, /font-size: 13px/);
  assert.match(head, /font-family: var\(--sans\)/);
  assert.doesNotMatch(panels, /#help \.set-head \{[^}]*--mono/, "the default look does not put the group heads back in mono");
  assert.match(rule(page, "#help .set-ctl select"), /font-family: var\(--sans\)/);
});

test("a moved switch that is off shows its way back, and taking it turns it on through its own handler", () => {
  const flip = $("btn-share");
  flip.classList.remove("on");
  let clicks = 0;
  const count = () => { clicks += 1; flip.classList.add("on"); };
  flip.addEventListener("click", count);
  paintSettingResets();
  const back = flip.closest(".set-row").querySelector(".set-reset");
  assert.equal(back.hidden, false);
  back.click();
  assert.ok(clicks >= 1);
  flip.removeEventListener("click", count);
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

test("painting settings that did not change writes nothing, so the panel never wakes its own watcher", async () => {
  paintSettingResets();
  const writes = [];
  const watch = new window.MutationObserver((records) => writes.push(...records));
  watch.observe($("pref-body"), { subtree: true, attributes: true });
  paintSettingResets();
  await settle();
  watch.disconnect();
  assert.deepEqual(writes.map((one) => `${one.target.id || one.target.className} ${one.attributeName}`), []);
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
