import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEME_UI_VARS } from "../assets/themes.mjs";
import { app, state } from "./dom.mjs";

const st = await state();
const { COLOR, RAYCAST_COLOR, RAYCAST_FONT, RAYCAST_TERMINAL, RAYCAST_THEME, THEME, stateColor, raycastOn } = await app("core");
const { applyFonts, applyTheme } = await app("shared");
const { TERM_LOOK } = await app("terminal-pool");

const sheet = readFileSync(new URL("../assets/raycast/foundation.css", import.meta.url), "utf8");
const DEFAULTS = { sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif', mono: "ui-monospace, SFMono-Regular, Menlo, monospace", terminalSize: 12, chatLineHeight: 1.55, chatSpacing: 10 };
const root = () => document.documentElement.style;

function wear(on) {
  const was = raycastOn() ? "raycast" : "current";
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was } }));
}

test("with the flag off the seat states keep the colours of the current Hive", () => {
  wear(false);
  for (const state of Object.keys(COLOR)) assert.equal(stateColor(state), COLOR[state]);
  assert.equal(COLOR.needs, "var(--accent)");
});

test("with the flag on each seat state has one colour, and only needs wears the signal", () => {
  wear(true);
  assert.deepEqual(RAYCAST_COLOR, { needs: "var(--signal)", answered: "var(--blue)", working: "var(--yellow)", done: "var(--green)", ready: "var(--txt-2)", stalled: "var(--yellow)", idle: "var(--txt-3)" });
  for (const state of Object.keys(COLOR)) assert.equal(stateColor(state), RAYCAST_COLOR[state]);
  wear(false);
});

test("the default fonts become Inter and Geist Mono only while the flag is on, and a font you chose stays yours", () => {
  st.fontDefaults = DEFAULTS;
  wear(false);
  applyFonts({ ...DEFAULTS });
  assert.equal(root().getPropertyValue("--sans"), DEFAULTS.sans);
  assert.equal(root().getPropertyValue("--mono"), DEFAULTS.mono);
  wear(true);
  assert.equal(root().getPropertyValue("--sans"), RAYCAST_FONT.sans);
  assert.equal(root().getPropertyValue("--mono"), RAYCAST_FONT.mono);
  assert.equal(TERM_LOOK.fontFamily, RAYCAST_FONT.mono);
  assert.deepEqual(st.fontPrefs, DEFAULTS, "the panel still shows what the file says");
  applyFonts({ ...DEFAULTS, sans: "Menlo" });
  assert.match(root().getPropertyValue("--sans"), /^Menlo, /);
  assert.equal(root().getPropertyValue("--mono"), RAYCAST_FONT.mono);
  wear(false);
  assert.match(root().getPropertyValue("--sans"), /^Menlo, /);
  assert.equal(root().getPropertyValue("--mono"), DEFAULTS.mono);
  applyFonts({ ...DEFAULTS });
});

test("the terminals wear the Raycast palette on the default theme only while the flag is on", () => {
  st.themeName = "Hive";
  st.themePreview = null;
  wear(false);
  applyTheme();
  assert.notDeepEqual(TERM_LOOK.theme, RAYCAST_TERMINAL);
  assert.equal(TERM_LOOK.theme.background, THEME.background);
  assert.equal(root().getPropertyValue("--signal"), "");
  wear(true);
  assert.deepEqual(TERM_LOOK.theme, RAYCAST_TERMINAL);
  assert.equal(root().getPropertyValue("--signal"), "", "the default theme takes its signal from the sheet");
  wear(false);
  assert.equal(TERM_LOOK.theme.background, THEME.background);
});

test("a theme you wear keeps its colours under the flag, and its accent becomes the signal", () => {
  st.themeName = "Tokyo Night";
  wear(true);
  applyTheme();
  const accent = root().getPropertyValue("--accent");
  assert.ok(accent);
  assert.equal(root().getPropertyValue("--signal"), accent);
  assert.equal(document.body.style.getPropertyValue("--signal"), accent);
  assert.notDeepEqual(TERM_LOOK.theme, RAYCAST_TERMINAL);
  wear(false);
  assert.equal(root().getPropertyValue("--signal"), "");
  assert.equal(document.body.style.getPropertyValue("--signal"), "");
  st.themeName = "Hive";
  applyTheme();
});

test("the foundation sheet carries the Raycast palette, the signal and the shared pieces", () => {
  for (const [key, cssVar] of Object.entries(THEME_UI_VARS)) {
    assert.match(sheet, new RegExp(`${cssVar}: ${RAYCAST_THEME.def.ui[key]};`, "i"), `${cssVar} matches RAYCAST_THEME`);
  }
  assert.match(sheet, /--signal: #FF6363;/);
  assert.match(sheet, /--red: var\(--signal\);/);
  assert.match(sheet, /--r4: 16px;/);
  assert.match(sheet, /@font-face \{ font-family: Inter;[^}]*inter-normal-latin\.woff2/);
  assert.match(sheet, /font-feature-settings: "calt", "kern", "liga", "ss03";/);
  for (const piece of [".rc-key", ".rc-badge", ".rc-dot", ...["needs", "answered", "working", "done", "ready", "stalled", "idle"].map((s) => `.rc-dot.${s}`)]) {
    assert.ok(sheet.includes(`:where(body.experience-raycast) ${piece} {`), piece);
  }
  assert.match(sheet, /:where\(body\.experience-raycast\) :where\(:focus-visible[^{]*\{ outline: 2px solid var\(--accent\); outline-offset: 2px; \}/);
  assert.match(sheet, /:where\(body\.experience-raycast\) ::-webkit-scrollbar \{ width: 6px; height: 6px;/);
});
