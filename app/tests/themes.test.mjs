import { test, after } from "node:test";
import assert from "node:assert/strict";
import { THEME_UI_VARS, THEME_TERM_KEYS, hex6, cleanThemeDef, themeShareJson, parseThemeShare, BUILTIN_THEMES } from "../assets/themes.mjs";
import { cleanThemeName, cleanThemes, THEME_UI_KEYS, THEME_TERMINAL_KEYS } from "../lib/config.mjs";
import { app, state } from "./dom.mjs";

const th = { THEME_UI_VARS, THEME_TERM_KEYS, hex6, cleanThemeDef, themeShareJson, parseThemeShare, BUILTIN_THEMES };
const srv = { cleanThemeName, cleanThemes, THEME_UI_KEYS, THEME_TERMINAL_KEYS };

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { keepPastedTheme, openThemes, saveThemeFromEditor, setTheme, themesOn } = await app("themes");

const saved = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (where, opts) => {
  if (String(where) === "/api/config") saved.push(JSON.parse(opts.body).config);
  return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" });
};
after(() => { globalThis.fetch = realFetch; });

bootSolid();

test("every built-in theme names every colour the app wears", () => {
  const uiKeys = Object.keys(th.THEME_UI_VARS);
  for (const t of th.BUILTIN_THEMES) {
    for (const key of uiKeys) assert.ok(t.def.ui[key], `${t.name} is missing ui.${key}`);
    for (const key of th.THEME_TERM_KEYS) assert.ok(t.def.terminal[key], `${t.name} is missing terminal.${key}`);
  }
});

test("every built-in colour is hex, so the share json needs no cleanup", () => {
  for (const t of th.BUILTIN_THEMES) {
    const kept = th.cleanThemeDef(t.def);
    assert.deepEqual(Object.keys(kept.ui).length, Object.keys(t.def.ui).length, t.name);
    assert.deepEqual(Object.keys(kept.terminal).length, Object.keys(t.def.terminal).length, t.name);
  }
});

test("the client and the server agree on which colours a theme has", () => {
  assert.deepEqual(Object.keys(th.THEME_UI_VARS), srv.THEME_UI_KEYS);
  assert.deepEqual(th.THEME_TERM_KEYS, srv.THEME_TERMINAL_KEYS);
});

test("a shared theme comes back whole through paste", () => {
  for (const t of th.BUILTIN_THEMES) {
    const r = th.parseThemeShare(th.themeShareJson(t.name, t.def));
    assert.equal(r.error, undefined);
    assert.equal(r.name, t.name);
    assert.deepEqual(r.def.ui, Object.fromEntries(Object.entries(t.def.ui).map(([k, v]) => [k, v.toUpperCase()])));
  }
});

test("paste refuses what is not a hive theme", () => {
  assert.ok(th.parseThemeShare("not json").error);
  assert.ok(th.parseThemeShare("[1,2]").error);
  assert.ok(th.parseThemeShare('{"name":"x","ui":{}}').error);
  assert.ok(th.parseThemeShare('{"hive-theme":1,"ui":{"bg":"#000000"}}').error, "no name");
  assert.ok(th.parseThemeShare('{"hive-theme":1,"name":"x","ui":{"bg":"red"}}').error, "no colour survived");
});

test("paste keeps the good colours and drops the rest", () => {
  const r = th.parseThemeShare(JSON.stringify({
    "hive-theme": 1, name: "  meu tema  ",
    ui: { bg: "#123", accent: "#CD694A", evil: "#000000", txt: "url(javascript:x)" },
    terminal: { red: "#ff5555", cursor: 12 }
  }));
  assert.equal(r.error, undefined);
  assert.equal(r.name, "meu tema");
  assert.deepEqual(r.def.ui, { bg: "#123", accent: "#CD694A" });
  assert.deepEqual(r.def.terminal, { red: "#FF5555" });
});

test("hex6 widens the short form for the colour inputs", () => {
  assert.equal(th.hex6("#123"), "#112233");
  assert.equal(th.hex6("#cd694a"), "#CD694A");
  assert.equal(th.hex6("#CD694AFF"), "#CD694A");
});

test("the server keeps a clean theme untouched", () => {
  const problems = [];
  const themes = srv.cleanThemes({ mine: { ui: { bg: "#0C0C0C" }, terminal: { red: "#F7768E" } } }, "x", problems);
  assert.deepEqual(problems, []);
  assert.deepEqual(themes, { mine: { ui: { bg: "#0C0C0C" }, terminal: { red: "#F7768E" } } });
});

test("the server drops what is not a colour and says so", () => {
  const problems = [];
  const themes = srv.cleanThemes({ mine: { ui: { bg: "red", nope: "#000000" }, terminal: {} } }, "x", problems);
  assert.deepEqual(themes.mine.ui, {});
  assert.equal(problems.length, 2);
});

test("the server refuses themes that are not an object", () => {
  const problems = [];
  assert.deepEqual(srv.cleanThemes("all of them", "x", problems), {});
  assert.equal(problems.length, 1);
});

test("the active theme name is a trimmed string, empty means the default", () => {
  const problems = [];
  assert.equal(srv.cleanThemeName(undefined, "x", problems), "");
  assert.equal(srv.cleanThemeName("  Nord  ", "x", problems), "Nord");
  assert.deepEqual(problems, []);
  assert.equal(srv.cleanThemeName(7, "x", problems), "");
  assert.equal(problems.length, 1);
});

const cards = () => [...document.querySelectorAll("#thm-grid .thm-card")];
const cardNamed = (name) => cards().find((one) => one.dataset.name === name);
const shown = (which) => !$(`thm-${which}`).hidden;

test("openThemes paints one card per theme and marks the worn one", () => {
  st.customThemes = {};
  st.themePreview = null;
  st.themeEditing = null;
  st.themeName = "Nord";
  st.configPath = "~/.hive/config.jsonc";
  saved.length = 0;

  openThemes();
  assert.equal(themesOn(), true);
  assert.equal(shown("browse"), true);
  assert.equal(shown("edit"), false);
  assert.equal(shown("paste"), false);
  assert.equal(cards().length, th.BUILTIN_THEMES.length);
  assert.equal($("thm-cfg").textContent, "~/.hive/config.jsonc");
  const nord = cardNamed("Nord");
  assert.equal(nord.querySelector("b").textContent, "Nord");
  assert.equal(nord.querySelector(".tag.on").textContent, "wearing");

  setTheme("Dracula");
  assert.equal(st.themeName, "Dracula");
  assert.deepEqual(saved.at(-1), { theme: "Dracula" });

  $("thm-json").value = th.themeShareJson("Feito Pelo Colega", { ui: { accent: "#FF0000" }, terminal: {} });
  keepPastedTheme();
  assert.equal(shown("edit"), true, "paste opens the editor");
  assert.equal($("thm-name").value, "Feito Pelo Colega", "the name arrives from the json");

  $("thm-name").value = "Meu Tema";
  saveThemeFromEditor();
  assert.equal(st.themeName, "Meu Tema");
  assert.ok(st.customThemes["Meu Tema"]);
  assert.equal(st.customThemes["Meu Tema"].ui.accent, "#FF0000");
  assert.deepEqual(Object.keys(saved.at(-1)).sort(), ["theme", "themes"]);
  assert.equal(shown("browse"), true);
  const mine = cardNamed("Meu Tema");
  assert.equal(mine.querySelector(".tag.on").textContent, "wearing");
  assert.equal(mine.querySelector(".tag:not(.on)").textContent, "yours");
});

test("the tertiary text of every theme reads at AA on the panels it sits on", async () => {
  const { BUILTIN_THEMES } = await import("../assets/themes.mjs");
  const lum = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const FLOOR = { "Solarized Light": 4.3 };
  for (const theme of BUILTIN_THEMES) {
    const { txt3, panel, panel2, bg } = theme.def.ui;
    const floor = FLOOR[theme.name] || 4.5;
    for (const surface of [bg, panel, panel2]) {
      assert.ok(contrast(txt3, surface) >= floor, `${theme.name}: txt3 ${txt3} on ${surface} reads at ${contrast(txt3, surface).toFixed(2)}, under ${floor}`);
    }
  }
});
