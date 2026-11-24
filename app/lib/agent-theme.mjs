import { BUILTIN_THEMES, HIVE_CLASSIC_THEME, THEME_NAME_MAX } from "../assets/themes.mjs";
import { hexIsLight, themeCssProblem, themeFromColors, THEME_CSS_MAX } from "../assets/theme-css.mjs";
import { APPEARANCE_CHOICES, THEME_TERMINAL_KEYS, THEME_UI_KEYS, isPlainObject } from "./config.mjs";

export const BUILTIN_THEME_NAMES = [...BUILTIN_THEMES, HIVE_CLASSIC_THEME].map((one) => one.name);

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const builtinDef = (name) => [...BUILTIN_THEMES, HIVE_CLASSIC_THEME].find((one) => one.name === name)?.def || null;

const ROLE_SAID = {
  bg: "the window behind everything", panel: "cards and panels", panel2: "raised surfaces, the composer", panel3: "the top surfaces, hover",
  well: "sunken areas, the terminal well", line: "hairlines", line2: "stronger borders", line3: "the loudest borders",
  txt: "text", txt2: "dim text", txt3: "faint text", accent: "the accent, selection and the main button", accentD: "the accent's dark edge",
  accentHi: "the accent's light edge", accentBg: "a wash of the accent behind selected rows", green: "done and ok", yellow: "waiting and warnings",
  blue: "links and info", violet: "a fourth tint"
};

export const THEME_CSS_HOOKS = [
  ["html[data-appearance=\"light\"], html[data-appearance=\"dark\"]", "the tone of the theme being worn"],
  ["#top", "the title bar"],
  ["#rail", "the list of chats on the left"],
  ["#canvas", "where the chats sit"],
  [".tile", "a chat card"],
  [".sv-scroll", "the conversation scroller"],
  [".sv-user", "the person's message"],
  [".sv-msg", "the agent's answer"],
  [".md-codebox", "a code block"],
  [".sv-composer", "the composer"],
  ["#pal .pal-sheet", "the command palette"],
  ["#help .box", "the settings"],
  [".menu", "a menu"],
  [".modal", "a dialog's backdrop"]
];

export function themeGuide(config) {
  const yours = Object.entries(config?.themes || {}).filter(([name]) => !BUILTIN_THEME_NAMES.includes(name));
  return {
    current: { appearance: config?.appearance || "fixed", theme: config?.theme || "Hive", themeLight: config?.themeLight || "" },
    builtIn: BUILTIN_THEME_NAMES,
    yours: yours.map(([name, def]) => ({ name, by: def.by || "person", hasCss: !!def.css, light: hexIsLight(def.ui?.bg || "") })),
    roles: THEME_UI_KEYS.map((key) => `${key}: ${ROLE_SAID[key]}`),
    terminal: THEME_TERMINAL_KEYS,
    selectors: THEME_CSS_HOOKS.map(([selector, says]) => `${selector}: ${says}`),
    rules: [
      "Colors first: canvas and accent (hex) make a whole palette, and colors overrides single roles or terminal keys. CSS only for what colors cannot do.",
      `css applies after the app's own styles and holds at most ${THEME_CSS_MAX} characters. It cannot load anything: no @import, no image-set() or src(), no backslash escapes, and url() only with a data: address or an #id.`,
      "Class names other than the selectors listed can change between releases. Add !important when the app's own rule wins.",
      "You cannot see the result. Change a little, then ask the person how it looks.",
      "appearance \"system\" wears one theme while macOS is light and another while it is dark; the theme goes to the slot of its own tone. \"fixed\" wears one theme always.",
      `To undo, wear a built-in theme with use: ${BUILTIN_THEME_NAMES.join(", ")}. The person can always press ⌃⌥⌘T (Ctrl+Alt+Shift+T off the Mac) to get the default theme back without the css.`
    ]
  };
}

function nameOf(raw) {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { error: "give the theme a name" };
  if (name.length > THEME_NAME_MAX) return { error: `a theme name has at most ${THEME_NAME_MAX} characters` };
  return { name };
}

function slotFor(name, def, appearance) {
  if (appearance === "system" && hexIsLight(def?.ui?.bg || "")) return { themeLight: name };
  return { theme: name };
}

function paletteOf(input, had) {
  const colors = isPlainObject(input.colors) ? input.colors : {};
  const knownRole = (key) => THEME_UI_KEYS.includes(key) || THEME_TERMINAL_KEYS.includes(key);
  const wrongColor = Object.entries(colors).find(([key, value]) => !knownRole(key) || typeof value !== "string" || !HEX.test(value.trim()));
  if (wrongColor) return { error: `colors.${wrongColor[0]} should be a role the theme knows, in hex like #CD694A` };
  if (input.canvas !== undefined || input.accent !== undefined) {
    const made = themeFromColors({ canvas: input.canvas, accent: input.accent, colors });
    if (!made) return { error: "canvas and accent go together, as hex like #1A1B26" };
    return { def: made };
  }
  if (!had) return { error: "a new theme needs canvas and accent" };
  const def = { ui: { ...had.ui }, terminal: { ...had.terminal } };
  for (const [key, value] of Object.entries(colors)) {
    if (THEME_UI_KEYS.includes(key)) def.ui[key] = value.trim().toUpperCase();
    else def.terminal[key] = value.trim().toUpperCase();
  }
  return { def };
}

export function agentThemePatch(config, input = {}) {
  if (!isPlainObject(input)) return { error: "the theme should be an object" };
  const appearance = input.appearance;
  if (appearance !== undefined && !APPEARANCE_CHOICES.includes(appearance)) return { error: `appearance should be ${APPEARANCE_CHOICES.join(" or ")}` };
  const wanted = appearance || config?.appearance || "fixed";
  const themes = { ...(config?.themes || {}) };
  const makes = ["canvas", "accent", "colors", "css"].some((key) => input[key] !== undefined);
  if (input.use !== undefined && makes) return { error: "use wears a theme that exists; leave canvas, accent, colors and css out of it" };
  if (input.use !== undefined) {
    const { name, error } = nameOf(input.use);
    if (error) return { error };
    const def = builtinDef(name) || themes[name];
    if (!def) return { error: `there is no theme called ${name}. Built in: ${BUILTIN_THEME_NAMES.join(", ")}` };
    return { patch: { ...slotFor(name, def, wanted), ...(appearance ? { appearance } : {}) }, wearing: name };
  }
  if (!makes) {
    if (!appearance) return { error: "give use, a theme to make (name with canvas and accent, colors or css), or appearance" };
    return { patch: { appearance }, wearing: "" };
  }
  const { name, error } = nameOf(input.name);
  if (error) return { error };
  if (BUILTIN_THEME_NAMES.includes(name)) return { error: `${name} is a built-in theme; give yours another name` };
  const palette = paletteOf(input, themes[name]);
  if (palette.error) return { error: palette.error };
  const css = input.css === undefined ? themes[name]?.css || "" : input.css;
  const wrongCss = themeCssProblem(css);
  if (wrongCss) return { error: wrongCss };
  themes[name] = { ...palette.def, ...(css ? { css } : {}), by: "agent" };
  return { patch: { themes, ...slotFor(name, themes[name], wanted), ...(appearance ? { appearance } : {}) }, wearing: name };
}
