import { phrase } from "./i18n.mjs";

export const THEME_UI_VARS = {
  bg: "--bg", panel: "--panel", panel2: "--panel-2", panel3: "--panel-3", well: "--well",
  line: "--line", line2: "--line-2", line3: "--line-3",
  txt: "--txt", txt2: "--txt-2", txt3: "--txt-3",
  accent: "--accent", accentD: "--accent-d", accentHi: "--accent-hi", accentBg: "--accent-bg",
  green: "--green", yellow: "--yellow", blue: "--blue", violet: "--violet"
};
export const THEME_TERM_KEYS = ["background", "foreground", "cursor", "selectionBackground",
  "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan", "brightWhite"];
const THEME_HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const THEME_SHARE_KIND = "hive-theme";
export const THEME_NAME_MAX = 60;

export function hex6(color) {
  const c = String(color).replace("#", "");
  if (c.length === 3) return ("#" + [...c].map((x) => x + x).join("")).toUpperCase();
  return ("#" + c.slice(0, 6)).toUpperCase();
}

export function cleanThemeDef(raw) {
  const def = { ui: {}, terminal: {} };
  const keep = (from, keys, into) => {
    if (!from || typeof from !== "object" || Array.isArray(from)) return;
    for (const key of keys) {
      const v = from[key];
      if (typeof v === "string" && THEME_HEX.test(v.trim())) into[key] = v.trim().toUpperCase();
    }
  };
  keep(raw?.ui, Object.keys(THEME_UI_VARS), def.ui);
  keep(raw?.terminal, THEME_TERM_KEYS, def.terminal);
  return def;
}

export function themeShareJson(name, def) {
  return JSON.stringify({ [THEME_SHARE_KIND]: 1, name, ui: def.ui, terminal: def.terminal }, null, 2);
}

export function parseThemeShare(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return { error: phrase("this is not json — paste the whole block the other dev shared") }; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: phrase("the json should be an object") };
  if (raw[THEME_SHARE_KIND] !== 1) return { error: phrase('this json is not a hive theme — it should carry "hive-theme": 1') };
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, THEME_NAME_MAX) : "";
  if (!name) return { error: phrase("the theme arrived without a name") };
  const def = cleanThemeDef(raw);
  if (!Object.keys(def.ui).length && !Object.keys(def.terminal).length) return { error: phrase("no colour in this json survived — every value should be hex like #CD694A") };
  return { name, def };
}

export const RAYCAST_THEME = { name: "Raycast", def: {
  ui: { bg: "#040506", panel: "#07080A", panel2: "#111214", panel3: "#1B1C1E", well: "#131416",
    line: "#1B1C1E", line2: "#2F3031", line3: "#363739",
    txt: "#FFFFFF", txt2: "#9C9C9D", txt3: "#7C7D7E",
    accent: "#E6E6E6", accentD: "#454647", accentHi: "#FFFFFF", accentBg: "#1D1E20",
    green: "#59D499", yellow: "#FFC531", blue: "#56C2FF", violet: "#9C9C9D" },
  terminal: { background: "#040506", foreground: "#DCDCDC", cursor: "#E6E6E6", selectionBackground: "#373839",
    black: "#1B1C1E", red: "#FF8A8A", green: "#59D499", yellow: "#FFC531",
    blue: "#63A1FF", magenta: "#BEA0FF", cyan: "#56C2FF", white: "#9C9C9D",
    brightBlack: "#7A7B7C", brightRed: "#FFA8A8", brightGreen: "#9BE6C1", brightYellow: "#FFD66B",
    brightBlue: "#8AB8FF", brightMagenta: "#D4BFFF", brightCyan: "#8AD4FF", brightWhite: "#FFFFFF" } } };

export const BUILTIN_THEMES = [
  { name: "Hive", def: {
    ui: { bg: "#0C0C0C", panel: "#131313", panel2: "#191919", panel3: "#202020", well: "#0A0A0A",
      line: "#262626", line2: "#3A3A3A", line3: "#4E4E4E",
      txt: "#EDEBE7", txt2: "#9C988F", txt3: "#85817B",
      accent: "#CD694A", accentD: "#6E3826", accentHi: "#E5866A", accentBg: "#241310",
      green: "#4EA96F", yellow: "#E0AF68", blue: "#7DCFFF", violet: "#8A7CB0" },
    terminal: { background: "#0A0A0A", foreground: "#EDEBE7", cursor: "#CD694A", selectionBackground: "#3B2C24",
      black: "#15161E", red: "#F7768E", green: "#4EA96F", yellow: "#E0AF68",
      blue: "#7AA2F7", magenta: "#BB9AF7", cyan: "#7DCFFF", white: "#C6C1B8",
      brightBlack: "#4C463E", brightRed: "#F7768E", brightGreen: "#9ECE6A", brightYellow: "#E0AF68",
      brightBlue: "#7AA2F7", brightMagenta: "#BB9AF7", brightCyan: "#7DCFFF", brightWhite: "#FFFDF9" } } },
  { name: "Bonsai", def: {
    ui: { bg: "#121D24", panel: "#151E23", panel2: "#1A2830", panel3: "#20323C", well: "#0D1B22",
      line: "#2A3A42", line2: "#35525C", line3: "#406A76",
      txt: "#E6FAF7", txt2: "#B7C7CB", txt3: "#7C98A1",
      accent: "#40CAB6", accentD: "#1C4D47", accentHi: "#66DCCE", accentBg: "#173236",
      green: "#4EC685", yellow: "#FDD351", blue: "#6394F3", violet: "#B29CE7" },
    terminal: { background: "#0D1B22", foreground: "#E6FAF7", cursor: "#40CAB6", selectionBackground: "#1C4D47",
      black: "#0A1419", red: "#FA5371", green: "#4EC685", yellow: "#FDD351",
      blue: "#6394F3", magenta: "#9272DC", cyan: "#66DCCE", white: "#B7C7CB",
      brightBlack: "#7C98A1", brightRed: "#FC98AB", brightGreen: "#B3E577", brightYellow: "#FDDC74",
      brightBlue: "#8DAEF6", brightMagenta: "#C8B9EE", brightCyan: "#8DE5DA", brightWhite: "#E6FAF7" } } },
  { name: "Bonsai Light", def: {
    ui: { bg: "#FAFDFF", panel: "#FFFFFF", panel2: "#FFFFFF", panel3: "#E6FAF7", well: "#E9F4F6",
      line: "#E9F4F6", line2: "#D5E4E7", line3: "#B8CDD2",
      txt: "#053B4B", txt2: "#45717D", txt3: "#547B84",
      accent: "#39AF9F", accentD: "#266E64", accentHi: "#5CDDCF", accentBg: "#E6FAF7",
      green: "#3DA169", yellow: "#C99800", blue: "#4F81F1", violet: "#8764D8" },
    terminal: { background: "#E9F4F6", foreground: "#053B4B", cursor: "#39AF9F", selectionBackground: "#C9F4ED",
      black: "#053B4B", red: "#FA163E", green: "#3DA169", yellow: "#C99800",
      blue: "#4F81F1", magenta: "#8764D8", cyan: "#39AF9F", white: "#D5E4E7",
      brightBlack: "#709097", brightRed: "#FA5371", brightGreen: "#4EC685", brightYellow: "#FDC200",
      brightBlue: "#6394F3", brightMagenta: "#9272DC", brightCyan: "#5CDDCF", brightWhite: "#F0F9FB" } } },
  { name: "Solarized Light", def: {
    ui: { bg: "#FDF6E3", panel: "#FDF6E3", panel2: "#EEE8D5", panel3: "#EEE8D5", well: "#FDF6E3",
      line: "#EEE8D5", line2: "#93A1A1", line3: "#839496",
      txt: "#586E75", txt2: "#657B83", txt3: "#586E75",
      accent: "#268BD2", accentD: "#1B5E8C", accentHi: "#72B4E2", accentBg: "#E9F3FA",
      green: "#859900", yellow: "#B58900", blue: "#268BD2", violet: "#6C71C4" },
    terminal: { background: "#FDF6E3", foreground: "#657B83", cursor: "#268BD2", selectionBackground: "#EEE8D5",
      black: "#073642", red: "#DC322F", green: "#859900", yellow: "#B58900",
      blue: "#268BD2", magenta: "#D33682", cyan: "#2AA198", white: "#EEE8D5",
      brightBlack: "#002B36", brightRed: "#CB4B16", brightGreen: "#586E75", brightYellow: "#657B83",
      brightBlue: "#839496", brightMagenta: "#6C71C4", brightCyan: "#93A1A1", brightWhite: "#FDF6E3" } } },
  { name: "Tokyo Night", def: {
    ui: { bg: "#16161E", panel: "#1A1B26", panel2: "#1F2335", panel3: "#24283B", well: "#131320",
      line: "#292E42", line2: "#3B4261", line3: "#545C7E",
      txt: "#C0CAF5", txt2: "#A9B1D6", txt3: "#808AB4",
      accent: "#7AA2F7", accentD: "#3D59A1", accentHi: "#B4C4FA", accentBg: "#1B2439",
      green: "#9ECE6A", yellow: "#E0AF68", blue: "#7DCFFF", violet: "#BB9AF7" },
    terminal: { background: "#131320", foreground: "#C0CAF5", cursor: "#7AA2F7", selectionBackground: "#283457",
      black: "#15161E", red: "#F7768E", green: "#9ECE6A", yellow: "#E0AF68",
      blue: "#7AA2F7", magenta: "#BB9AF7", cyan: "#7DCFFF", white: "#A9B1D6",
      brightBlack: "#414868", brightRed: "#F7768E", brightGreen: "#9ECE6A", brightYellow: "#E0AF68",
      brightBlue: "#7AA2F7", brightMagenta: "#BB9AF7", brightCyan: "#7DCFFF", brightWhite: "#C0CAF5" } } },
  { name: "Gruvbox Dark", def: {
    ui: { bg: "#1D2021", panel: "#242728", panel2: "#282828", panel3: "#32302F", well: "#181A1B",
      line: "#3C3836", line2: "#504945", line3: "#665C54",
      txt: "#EBDBB2", txt2: "#BDAE93", txt3: "#9B8D7A",
      accent: "#D65D0E", accentD: "#7C3A03", accentHi: "#FE8019", accentBg: "#2E2010",
      green: "#B8BB26", yellow: "#FABD2F", blue: "#83A598", violet: "#D3869B" },
    terminal: { background: "#181A1B", foreground: "#EBDBB2", cursor: "#FE8019", selectionBackground: "#504945",
      black: "#282828", red: "#CC241D", green: "#98971A", yellow: "#D79921",
      blue: "#458588", magenta: "#B16286", cyan: "#689D6A", white: "#A89984",
      brightBlack: "#928374", brightRed: "#FB4934", brightGreen: "#B8BB26", brightYellow: "#FABD2F",
      brightBlue: "#83A598", brightMagenta: "#D3869B", brightCyan: "#8EC07C", brightWhite: "#EBDBB2" } } },
  { name: "Nord", def: {
    ui: { bg: "#242933", panel: "#2E3440", panel2: "#353C4A", panel3: "#3B4252", well: "#20242D",
      line: "#3B4252", line2: "#4C566A", line3: "#616E88",
      txt: "#ECEFF4", txt2: "#D8DEE9", txt3: "#9DA7BA",
      accent: "#88C0D0", accentD: "#3F5A63", accentHi: "#8FBCBB", accentBg: "#243138",
      green: "#A3BE8C", yellow: "#EBCB8B", blue: "#81A1C1", violet: "#B48EAD" },
    terminal: { background: "#20242D", foreground: "#D8DEE9", cursor: "#88C0D0", selectionBackground: "#434C5E",
      black: "#3B4252", red: "#BF616A", green: "#A3BE8C", yellow: "#EBCB8B",
      blue: "#81A1C1", magenta: "#B48EAD", cyan: "#88C0D0", white: "#E5E9F0",
      brightBlack: "#4C566A", brightRed: "#BF616A", brightGreen: "#A3BE8C", brightYellow: "#EBCB8B",
      brightBlue: "#81A1C1", brightMagenta: "#B48EAD", brightCyan: "#8FBCBB", brightWhite: "#ECEFF4" } } },
  { name: "Dracula", def: {
    ui: { bg: "#1E1F29", panel: "#282A36", panel2: "#2F3240", panel3: "#343746", well: "#191A21",
      line: "#343746", line2: "#44475A", line3: "#5A5D74",
      txt: "#F8F8F2", txt2: "#A8ABBE", txt3: "#8F9ABB",
      accent: "#FF79C6", accentD: "#8A3E6C", accentHi: "#FF92D0", accentBg: "#2E1E2C",
      green: "#50FA7B", yellow: "#F1FA8C", blue: "#8BE9FD", violet: "#BD93F9" },
    terminal: { background: "#191A21", foreground: "#F8F8F2", cursor: "#FF79C6", selectionBackground: "#44475A",
      black: "#21222C", red: "#FF5555", green: "#50FA7B", yellow: "#F1FA8C",
      blue: "#BD93F9", magenta: "#FF79C6", cyan: "#8BE9FD", white: "#F8F8F2",
      brightBlack: "#6272A4", brightRed: "#FF6E6E", brightGreen: "#69FF94", brightYellow: "#FFFFA5",
      brightBlue: "#D6ACFF", brightMagenta: "#FF92DF", brightCyan: "#A4FFFF", brightWhite: "#FFFFFF" } } },
  { name: "Rosé Pine", def: {
    ui: { bg: "#191724", panel: "#1F1D2E", panel2: "#26233A", panel3: "#2A273F", well: "#141220",
      line: "#26233A", line2: "#403D52", line3: "#524F67",
      txt: "#E0DEF4", txt2: "#908CAA", txt3: "#8E8AA5",
      accent: "#EBBCBA", accentD: "#8C5F5E", accentHi: "#F2CDCC", accentBg: "#2A2027",
      green: "#9CCFD8", yellow: "#F6C177", blue: "#31748F", violet: "#C4A7E7" },
    terminal: { background: "#141220", foreground: "#E0DEF4", cursor: "#EBBCBA", selectionBackground: "#403D52",
      black: "#26233A", red: "#EB6F92", green: "#9CCFD8", yellow: "#F6C177",
      blue: "#31748F", magenta: "#C4A7E7", cyan: "#EBBCBA", white: "#E0DEF4",
      brightBlack: "#6E6A86", brightRed: "#EB6F92", brightGreen: "#9CCFD8", brightYellow: "#F6C177",
      brightBlue: "#31748F", brightMagenta: "#C4A7E7", brightCyan: "#EBBCBA", brightWhite: "#E0DEF4" } } }
];
