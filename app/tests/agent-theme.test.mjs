import { test } from "node:test";
import assert from "node:assert/strict";
import { agentThemePatch, BUILTIN_THEME_NAMES, themeGuide } from "../lib/agent-theme.mjs";
import { cleanPatch, cleanThemes } from "../lib/config.mjs";

const config = (extra = {}) => ({ theme: "Hive", themeLight: "Bonsai Light", appearance: "fixed", themes: {}, ...extra });

test("use wears a theme that exists, and is how the agent undoes", () => {
  assert.deepEqual(agentThemePatch(config(), { use: "Nord" }), { patch: { theme: "Nord" }, wearing: "Nord" });
  assert.match(agentThemePatch(config(), { use: "Nope" }).error, /no theme called Nope/);
  assert.match(agentThemePatch(config(), { use: "Nord", canvas: "#000000", accent: "#FFFFFF" }).error, /leave canvas/);
});

test("following the system, a theme goes to the slot of its own tone", () => {
  const sys = config({ appearance: "system" });
  assert.deepEqual(agentThemePatch(sys, { use: "Solarized Light" }).patch, { themeLight: "Solarized Light" });
  assert.deepEqual(agentThemePatch(sys, { use: "Dracula" }).patch, { theme: "Dracula" });
  const made = agentThemePatch(sys, { name: "Paper", canvas: "#FAF7F0", accent: "#B4572E" });
  assert.equal(made.patch.themeLight, "Paper");
  assert.equal(made.patch.theme, undefined);
  assert.deepEqual(agentThemePatch(config(), { appearance: "system" }), { patch: { appearance: "system" }, wearing: "" });
  assert.match(agentThemePatch(config(), { appearance: "dark" }).error, /appearance should be/);
});

test("a saved theme takes new colours and css without canvas and accent", () => {
  const had = config({ themes: { Nightfall: { ui: { bg: "#1A1B26", accent: "#7AA2F7" }, terminal: { red: "#FF0000" }, css: ".a{}", by: "agent" } } });
  const made = agentThemePatch(had, { name: "Nightfall", colors: { accent: "#00FFAA" } });
  assert.equal(made.patch.themes.Nightfall.ui.accent, "#00FFAA");
  assert.equal(made.patch.themes.Nightfall.ui.bg, "#1A1B26");
  assert.equal(made.patch.themes.Nightfall.css, ".a{}");
  const cleared = agentThemePatch(had, { name: "Nightfall", css: "" });
  assert.equal(cleared.patch.themes.Nightfall.css, undefined);
  assert.match(agentThemePatch(config(), { name: "Fresh", colors: { accent: "#00FFAA" } }).error, /needs canvas and accent/);
  assert.match(agentThemePatch(config(), { name: "Fresh", canvas: "#000000", accent: "#FFFFFF", colors: { nope: "#000000" } }).error, /colors.nope/);
});

test("the agent cannot take a built-in name, a long name or css that loads a file", () => {
  for (const name of BUILTIN_THEME_NAMES) assert.match(agentThemePatch(config(), { name, canvas: "#000000", accent: "#FFFFFF" }).error, /built-in/);
  assert.match(agentThemePatch(config(), { name: "x".repeat(61), canvas: "#000000", accent: "#FFFFFF" }).error, /at most 60/);
  assert.match(agentThemePatch(config(), { name: "Leak", canvas: "#000000", accent: "#FFFFFF", css: "@import 'x.css';" }).error, /@import/);
  assert.match(agentThemePatch(config(), {}).error, /give use/);
});

test("what the agent writes passes the config's own cleaning untouched", () => {
  const made = agentThemePatch(config(), { name: "Nightfall", canvas: "#1A1B26", accent: "#7AA2F7", css: ".sv-user{border-radius:2px}" });
  const { clean, problems } = cleanPatch(made.patch);
  assert.deepEqual(problems, []);
  assert.deepEqual(clean.themes, made.patch.themes);
});

test("a hand-edited config with css that loads a file keeps the colours and drops the css", () => {
  const problems = [];
  const themes = cleanThemes({ Leak: { ui: { bg: "#000000" }, css: "a{background:url(https://example.com/x)}", by: "agent" } }, "config", problems);
  assert.deepEqual(themes.Leak, { ui: { bg: "#000000" }, terminal: {}, by: "agent" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /css was left out/);
});

test("the guide tells the agent what it can touch", () => {
  const guide = themeGuide(config({ appearance: "system", themes: { Paper: { ui: { bg: "#FAF7F0" }, terminal: {} } } }));
  assert.equal(guide.current.appearance, "system");
  assert.deepEqual(guide.yours, [{ name: "Paper", by: "person", hasCss: false, light: true }]);
  assert.ok(guide.roles.some((line) => line.startsWith("accent:")));
  assert.ok(guide.rules.some((line) => line.includes("Hive")));
});
