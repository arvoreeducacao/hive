import { BUILTIN_THEMES, THEME_TERM_KEYS, THEME_UI_VARS } from "./themes.mjs";

export const THEME_CSS_MAX = 20000;

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LOCAL_ADDRESS = /^[ \t\n\f\r]*["']?(?:data:|#)/i;
const FETCHING_FUNCTIONS = /image-set\(|(?:^|[^a-z0-9_-])src\(/i;

export function themeCssProblem(css) {
  if (css === undefined || css === null || css === "") return "";
  if (typeof css !== "string") return "css should be text";
  if (css.length > THEME_CSS_MAX) return `css holds at most ${THEME_CSS_MAX} characters`;
  if (css.includes("\\")) return "css cannot hold a backslash, because an escape can spell a url()";
  if (/@import/i.test(css)) return "css cannot @import a file";
  if (FETCHING_FUNCTIONS.test(css)) return "css cannot use image-set() or src(), because they load files";
  for (const found of css.matchAll(/url\(/gi)) {
    if (!LOCAL_ADDRESS.test(css.slice(found.index + found[0].length))) return "css cannot load a file: url() takes only a data: address or an #id";
  }
  return "";
}

const channels = (hex) => {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? [...c].map((x) => x + x).join("") : c.slice(0, 6);
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
};

const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

export function mixHex(from, to, amount) {
  const a = channels(from);
  const b = channels(to);
  return toHex(a.map((v, at) => v + (b[at] - v) * amount));
}

export function hexIsLight(hex) {
  if (!HEX.test(String(hex || "").trim()) && !/^#[0-9a-fA-F]{8}$/.test(String(hex || "").trim())) return false;
  const [r, g, b] = channels(String(hex).trim()).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b >= 0.5;
}

const baseOf = (light) => BUILTIN_THEMES.find((one) => one.name === (light ? "Bonsai Light" : "Hive")).def;

export function themeFromColors({ canvas, accent, colors = {} } = {}) {
  if (!HEX.test(String(canvas || "")) || !HEX.test(String(accent || ""))) return null;
  const light = hexIsLight(canvas);
  const ink = light ? "#000000" : "#FFFFFF";
  const shade = light ? "#FFFFFF" : "#000000";
  const txt = mixHex(ink, canvas, light ? 0.12 : 0.08);
  const base = baseOf(light);
  const ui = {
    bg: toHex(channels(canvas)),
    panel: mixHex(canvas, ink, 0.03),
    panel2: mixHex(canvas, ink, 0.06),
    panel3: mixHex(canvas, ink, 0.09),
    well: mixHex(canvas, shade, light ? 0.5 : 0.25),
    line: mixHex(canvas, ink, 0.1),
    line2: mixHex(canvas, ink, 0.18),
    line3: mixHex(canvas, ink, 0.26),
    txt,
    txt2: mixHex(txt, canvas, 0.36),
    txt3: mixHex(txt, canvas, 0.5),
    accent: toHex(channels(accent)),
    accentD: mixHex(accent, canvas, 0.55),
    accentHi: mixHex(accent, ink, 0.25),
    accentBg: mixHex(accent, canvas, 0.85),
    green: base.ui.green,
    yellow: base.ui.yellow,
    blue: base.ui.blue,
    violet: base.ui.violet
  };
  const terminal = {
    ...base.terminal,
    background: mixHex(canvas, shade, light ? 0.3 : 0.15),
    foreground: txt,
    cursor: ui.accent,
    selectionBackground: mixHex(accent, canvas, 0.7)
  };
  for (const [key, value] of Object.entries(colors || {})) {
    if (typeof value !== "string" || !HEX.test(value.trim())) continue;
    if (key in THEME_UI_VARS) ui[key] = toHex(channels(value.trim()));
    else if (THEME_TERM_KEYS.includes(key)) terminal[key] = toHex(channels(value.trim()));
  }
  return { ui, terminal };
}
