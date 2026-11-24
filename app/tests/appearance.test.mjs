import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { wornThemeName } = await app("core");
const { applyTheme, adoptTheme, applyFonts, bootSolid } = await app("shared");
const { setTheme, setAppearance } = await app("themes");
const { movePanels, wornCss } = await app("appearance");

const saved = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (where, opts) => {
  if (String(where) === "/api/config") saved.push(JSON.parse(opts.body).config);
  return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" });
};
after(() => { globalThis.fetch = realFetch; });

bootSolid();

const html = document.documentElement;

const adopt = (config) => adoptTheme({ config: { theme: "Hive", themes: {}, ...config } });

test("with nothing chosen the app wears one theme and none of the new marks", () => {
  adopt({});
  assert.equal(st.appearance, "fixed");
  assert.equal(wornThemeName(), "Hive");
  for (const mark of ["data-glass", "data-chat-width", "data-contrast", "data-font-prompt", "data-font-code", "data-smoothing"]) assert.equal(html.hasAttribute(mark), false, mark);
  assert.equal(html.classList.contains("panel-moving"), false);
  assert.equal(document.body.style.getPropertyValue("--line"), "");
  assert.equal(wornCss(), "");
});

test("following the system wears the light theme while macOS is light and the dark one otherwise", () => {
  adopt({ theme: "Nord", themeLight: "Solarized Light", appearance: "system" });
  st.systemLight = false;
  assert.equal(wornThemeName(), "Nord");
  st.systemLight = true;
  assert.equal(wornThemeName(), "Solarized Light");
  applyTheme();
  assert.equal(html.dataset.appearance, "light");
  adopt({ theme: "Nord", themeLight: "Solarized Light", appearance: "fixed" });
  assert.equal(wornThemeName(), "Nord");
  st.systemLight = false;
});

test("wearing a theme while following the system fills the slot of its own tone", () => {
  adopt({ theme: "Nord", themeLight: "Bonsai Light", appearance: "system" });
  saved.length = 0;
  setTheme("Solarized Light");
  assert.equal(st.themeLight, "Solarized Light");
  assert.equal(st.themeName, "Nord");
  setTheme("Dracula");
  assert.equal(st.themeName, "Dracula");
  assert.deepEqual(saved, [{ themeLight: "Solarized Light" }, { theme: "Dracula" }]);
});

test("turning on the system mode moves a light theme to the light slot", () => {
  adopt({ theme: "Solarized Light", themeLight: "Bonsai Light", appearance: "fixed" });
  saved.length = 0;
  setAppearance("system");
  assert.deepEqual(saved, [{ appearance: "system", themeLight: "Solarized Light", theme: "Hive" }]);
  st.systemLight = true;
  assert.equal(wornThemeName(), "Solarized Light");
  setAppearance("fixed");
  assert.deepEqual(saved[1], { appearance: "fixed", theme: "Solarized Light" });
  assert.equal(wornThemeName(), "Solarized Light");
  st.systemLight = false;
});

test("a theme's css is worn with it, and css that loads a file never reaches the page", () => {
  adopt({ theme: "Agent", themes: { Agent: { ui: { bg: "#101820" }, terminal: {}, css: ".sv-user { border-radius: 3px; }", by: "agent" } } });
  assert.match(wornCss(), /border-radius: ?3px/);
  adopt({ theme: "Leak", themes: { Leak: { ui: { bg: "#101820" }, terminal: {}, css: ".a { background: url(https://example.com/x); }" } } });
  assert.equal(wornCss(), "");
  adopt({ theme: "Hive" });
  assert.equal(wornCss(), "");
});

test("contrast pulls lines and dim text towards the text colour, and zero leaves them alone", () => {
  adopt({ theme: "Nord", contrast: 40 });
  assert.match(document.body.style.getPropertyValue("--line"), /^color-mix\(in srgb, .+ 80%, .+ 20%\)$/);
  assert.equal(html.hasAttribute("data-contrast"), true);
  adopt({ theme: "Nord", contrast: 0 });
  assert.doesNotMatch(document.body.style.getPropertyValue("--line"), /color-mix/);
  assert.equal(html.hasAttribute("data-contrast"), false);
  adopt({ theme: "Hive", contrast: 40 });
  assert.match(document.body.style.getPropertyValue("--line"), /color-mix/);
  adopt({ theme: "Hive", contrast: 0 });
  for (const cssVar of ["--line", "--line-2", "--line-3", "--txt-2", "--txt-3"]) assert.equal(document.body.style.getPropertyValue(cssVar), "", cssVar);
});

test("glass and chat width mark the page only when chosen", () => {
  adopt({ glass: 80, chatWidth: 760 });
  assert.equal(html.style.getPropertyValue("--glass"), "80%");
  assert.equal(html.style.getPropertyValue("--chat-max"), "760px");
  adopt({ glass: null, chatWidth: "full" });
  assert.equal(html.hasAttribute("data-glass"), false);
  assert.equal(html.style.getPropertyValue("--chat-max"), "100vw");
  adopt({ chatWidth: "auto" });
  assert.equal(html.hasAttribute("data-chat-width"), false);
});

test("panels move only while a speed is chosen, and stop moving after it", async () => {
  adopt({ panelMotion: 0 });
  movePanels();
  assert.equal(html.classList.contains("panel-moving"), false);
  adopt({ panelMotion: 120 });
  assert.equal(html.style.getPropertyValue("--panel-ms"), "120ms");
  document.getElementById("shell").classList.toggle("rail-min");
  await new Promise((done) => setTimeout(done, 0));
  assert.equal(html.classList.contains("panel-moving"), true);
  await new Promise((done) => setTimeout(done, 260));
  assert.equal(html.classList.contains("panel-moving"), false);
  document.getElementById("shell").classList.toggle("rail-min");
  adopt({ panelMotion: 0 });
  assert.equal(html.style.getPropertyValue("--panel-ms"), "");
});

test("each area can wear its own font, and the terminal takes its own", async () => {
  const { TERM_LOOK } = await app("terminal-pool");
  st.fontDefaults = { sans: "a", mono: "b", terminalSize: 12, chatLineHeight: 1.55, chatSpacing: 10 };
  applyFonts({ ...st.fontDefaults, prompt: "Hack", promptSize: 14, code: "Fira Code", terminal: "JetBrains Mono", smoothing: "thin" });
  assert.match(html.style.getPropertyValue("--font-prompt"), /^Hack/);
  assert.equal(html.style.getPropertyValue("--font-prompt-size"), "14px");
  assert.match(html.style.getPropertyValue("--font-code"), /^Fira Code/);
  assert.equal(html.hasAttribute("data-font-code-size"), false);
  assert.equal(html.dataset.smoothing, "thin");
  assert.match(TERM_LOOK.fontFamily, /^JetBrains Mono/);
  applyFonts({ ...st.fontDefaults });
  assert.equal(html.hasAttribute("data-font-prompt"), false);
  assert.equal(html.dataset.smoothing, undefined);
  assert.doesNotMatch(TERM_LOOK.fontFamily, /JetBrains/);
});

const change = (id, value, kind = "change") => {
  const el = document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new Event(kind, { bubbles: true }));
};

test("the settings rows save each choice and paint it back", async () => {
  await app("appearance-panel");
  adopt({});
  saved.length = 0;
  change("f-glass", "80");
  change("f-chat-width", "760");
  change("f-panel-speed", "200");
  change("f-contrast", "30");
  assert.deepEqual(saved, [{ glass: 80 }, { chatWidth: 760 }, { panelMotion: 200 }, { contrast: 30 }]);
  assert.equal(document.getElementById("f-panel-speed-n").textContent, "200 ms");
  assert.equal(document.getElementById("f-contrast-n").textContent, "+30%");
  change("f-glass", "auto");
  change("f-chat-width", "auto");
  assert.deepEqual(saved.slice(4), [{ glass: null }, { chatWidth: "auto" }]);
  assert.equal(html.hasAttribute("data-glass"), false);
  change("f-appearance", "system");
  assert.equal(saved.at(-1).appearance, "system");
  assert.equal(st.appearance, "system");
  change("f-appearance", "fixed");
  assert.equal(st.appearance, "fixed");
  adopt({});
});

test("separate fonts open the area rows, and turning them off clears every area", () => {
  st.fontDefaults = { sans: "a", mono: "b", terminalSize: 12, chatLineHeight: 1.55, chatSpacing: 10 };
  applyFonts({ ...st.fontDefaults });
  adopt({});
  const rows = document.getElementById("font-areas");
  assert.equal(rows.hidden, true);
  document.getElementById("t-font-areas").click();
  assert.equal(rows.hidden, false);
  assert.equal(document.getElementById("t-font-areas").getAttribute("aria-pressed"), "true");
  saved.length = 0;
  change("f-font-prompt", "Hack");
  change("f-font-prompt-size", "40");
  change("f-font-code-size", "13");
  assert.equal(saved[0].font.prompt, "Hack");
  assert.equal(saved[1].font.promptSize, undefined);
  assert.equal(saved[2].font.codeSize, 13);
  assert.equal(saved[2].font.sans, "a");
  document.getElementById("t-font-areas").click();
  const last = saved.at(-1).font;
  assert.equal(last.prompt, undefined);
  assert.equal(last.codeSize, undefined);
  assert.equal(rows.hidden, true);
  document.getElementById("t-font-thin").click();
  assert.equal(saved.at(-1).font.smoothing, "thin");
  document.getElementById("t-font-thin").click();
  assert.equal(saved.at(-1).font.smoothing, undefined);
});

test("every new row's way back is the value the config starts from", async () => {
  const config = await import("../lib/config.mjs");
  const back = (id) => document.getElementById(id).dataset.default;
  assert.equal(back("f-appearance"), config.APPEARANCE_DEFAULT);
  assert.equal(back("f-contrast"), String(config.CONTRAST_DEFAULT));
  assert.equal(back("f-glass"), config.GLASS_AUTO === null ? "auto" : String(config.GLASS_AUTO));
  assert.equal(back("f-chat-width"), config.CHAT_WIDTH_DEFAULT);
  assert.equal(back("f-panel-speed"), String(config.PANEL_MOTION_DEFAULT));
  for (const id of ["f-font-prompt", "f-font-prompt-size", "f-font-code", "f-font-code-size", "f-font-terminal"]) assert.equal(back(id), "");
  for (const id of ["t-font-areas", "t-font-thin"]) assert.equal(back(id), "false");
});

test("the rescue key puts the default theme back from anywhere, even when a theme hides the whole page", async () => {
  const { THEME_RESCUE_KEY } = await app("themes");
  const { IS_MAC } = await app("core");
  const hidden = { ui: { bg: "#101820" }, terminal: {}, css: "body { display: none !important; }", by: "agent" };
  const press = (target, extra = {}) => target.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyT", key: "t", ctrlKey: true, altKey: true, metaKey: !!THEME_RESCUE_KEY.meta, shiftKey: !!THEME_RESCUE_KEY.shift, bubbles: true, cancelable: true, ...extra }));
  assert.deepEqual(THEME_RESCUE_KEY, IS_MAC ? { ctrl: true, alt: true, meta: true, code: "KeyT" } : { ctrl: true, alt: true, shift: true, code: "KeyT" });
  const composer = document.createElement("textarea");
  composer.className = "sv-composer-text";
  const terminal = document.createElement("textarea");
  terminal.className = "xterm-helper-textarea";
  document.body.append(composer, terminal);
  let reached = 0;
  terminal.addEventListener("keydown", () => { reached += 1; });
  for (const target of [composer, terminal, document.body]) {
    adopt({ theme: "Agent", appearance: "system", themeLight: "Agent", themes: { Agent: { ...hidden } } });
    assert.match(wornCss(), /display: ?none/);
    saved.length = 0;
    target.focus?.();
    press(target);
    assert.equal(wornThemeName(), "Hive");
    assert.equal(st.appearance, "fixed");
    assert.equal(wornCss(), "");
    assert.equal(st.customThemes.Agent.css, undefined);
    assert.equal(saved.at(-1).theme, "Hive");
    assert.equal(saved.at(-1).appearance, "fixed");
    assert.equal(saved.at(-1).themes.Agent.css, undefined);
  }
  assert.equal(reached, 0);
  adopt({ theme: "Night", appearance: "system", themeLight: "Paper", themes: { Night: { ...hidden }, Paper: { ui: { bg: "#FAF7F0" }, terminal: {}, css: "body { opacity: 0 !important; }", by: "agent" } } });
  saved.length = 0;
  press(document.body);
  assert.equal(st.customThemes.Night.css, undefined);
  assert.equal(st.customThemes.Paper.css, undefined);
  assert.equal(saved.at(-1).themes.Paper.css, undefined);
  adopt({ theme: "Nord" });
  press(document.body, { shiftKey: !THEME_RESCUE_KEY.shift });
  assert.equal(wornThemeName(), "Nord");
  composer.remove();
  terminal.remove();
  adopt({});
});

test("the rescue key shows as a fixed row in the shortcuts, and the palette offers the same", async () => {
  const { keysViewModel } = await app("leader-key");
  const said = JSON.stringify(keysViewModel());
  assert.match(said, /themeRescue/);
  const palette = await import("node:fs").then((fs) => fs.readFileSync(new URL("../src/app/palette.js", import.meta.url), "utf8"));
  assert.match(palette, /back to the default theme/);
});

test("no default shortcut, on the Mac or elsewhere, sits on the rescue key", async () => {
  const { MAC_KEYS, CTRL_KEYS } = await app("core");
  const same = (a, b) => !!a && a.code === b.code && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.meta === !!b.meta && !!a.shift === !!b.shift;
  const mac = { ctrl: true, alt: true, meta: true, code: "KeyT" };
  const other = { ctrl: true, alt: true, shift: true, code: "KeyT" };
  assert.deepEqual(Object.entries(MAC_KEYS).filter(([, key]) => same(key, mac)), []);
  assert.deepEqual(Object.entries(CTRL_KEYS).filter(([, key]) => same(key, other)), []);
});

test("an element marked data-panel-host slides with the panel speed, and stays still at 0", async () => {
  const { readFileSync } = await import("node:fs");
  const sheet = readFileSync(new URL("../assets/appearance.css", import.meta.url), "utf8");
  const rule = sheet.slice(sheet.indexOf("html.panel-moving [data-panel-host]"));
  assert.match(rule, /^html\.panel-moving \[data-panel-host\] \{[^}]*transition-property: width, height, transform, opacity, grid-template-columns, grid-template-rows !important;[^}]*transition-duration: var\(--panel-ms\) !important;/);
  const drawer = document.createElement("div");
  drawer.className = "chat-term";
  drawer.dataset.panelHost = "";
  document.body.append(drawer);
  const settle = () => new Promise((done) => setTimeout(done, 0));
  adopt({ panelMotion: 400 });
  drawer.classList.toggle("open");
  await settle();
  assert.equal(html.classList.contains("panel-moving"), true);
  assert.equal(html.style.getPropertyValue("--panel-ms"), "400ms");
  await new Promise((done) => setTimeout(done, 520));
  assert.equal(html.classList.contains("panel-moving"), false);
  drawer.dataset.panelHost = "closed";
  await settle();
  assert.equal(html.classList.contains("panel-moving"), true);
  adopt({ panelMotion: 0 });
  assert.equal(html.classList.contains("panel-moving"), false);
  drawer.classList.toggle("open");
  await settle();
  assert.equal(html.classList.contains("panel-moving"), false);
  assert.equal(html.style.getPropertyValue("--panel-ms"), "");
  drawer.remove();
});
