import { st } from "./core.js";
import { themeCssProblem } from "/assets/theme-css.mjs";

st.contrast = 0;

st.glass = null;

st.panelMotion = 0;

st.chatWidth = "auto";

const root = () => document.documentElement;

const CONTRASTED = ["--line", "--line-2", "--line-3", "--txt-2", "--txt-3"];

const PANEL_HOSTS = "#shell, .tile, [data-panel-host]";

const reducedMotion = () => !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let themeSheet = null;

let themeStyle = null;

function applyThemeCss(css) {
  const next = typeof css === "string" && !themeCssProblem(css) ? css : "";
  if (typeof CSSStyleSheet === "function" && "adoptedStyleSheets" in document && typeof CSSStyleSheet.prototype.replaceSync === "function") {
    if (!themeSheet && !next) return;
    if (!themeSheet) {
      themeSheet = new CSSStyleSheet();
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, themeSheet];
    }
    themeSheet.replaceSync(next);
    return;
  }
  if (!themeStyle && !next) return;
  if (!themeStyle) {
    themeStyle = document.createElement("style");
    themeStyle.id = "theme-css";
    document.head.append(themeStyle);
  }
  themeStyle.textContent = next;
}

const wornCss = () => (themeSheet ? [...themeSheet.cssRules].map((rule) => rule.cssText).join("\n") : themeStyle?.textContent || "");

function paintContrast() {
  const body = document.body;
  if (!st.contrast) return;
  const seen = getComputedStyle(body);
  const ink = seen.getPropertyValue("--txt").trim();
  if (!ink) return;
  const pull = Math.round(st.contrast * 0.5);
  for (const cssVar of CONTRASTED) {
    const base = seen.getPropertyValue(cssVar).trim();
    if (base) body.style.setProperty(cssVar, `color-mix(in srgb, ${base} ${100 - pull}%, ${ink} ${pull}%)`);
  }
}

function paintAppearanceMarks(light) {
  root().dataset.appearance = light ? "light" : "dark";
  if (st.contrast) root().style.setProperty("--contrast", `${st.contrast}%`);
  else root().style.removeProperty("--contrast");
  root().toggleAttribute("data-contrast", !!st.contrast);
}

function paintGlass() {
  const on = st.glass !== null && st.glass !== undefined;
  root().toggleAttribute("data-glass", on);
  if (on) root().style.setProperty("--glass", `${st.glass}%`);
  else root().style.removeProperty("--glass");
}

function chatWidthCss(width) {
  if (width === "full") return "100vw";
  return typeof width === "number" ? `${width}px` : "";
}

function paintChatWidth() {
  const css = chatWidthCss(st.chatWidth);
  root().toggleAttribute("data-chat-width", !!css);
  if (css) root().style.setProperty("--chat-max", css);
  else root().style.removeProperty("--chat-max");
}

let panelWatch = null;

let panelRest = 0;

function movePanels() {
  if (!st.panelMotion || st.away || reducedMotion()) return;
  root().classList.add("panel-moving");
  clearTimeout(panelRest);
  panelRest = setTimeout(() => root().classList.remove("panel-moving"), st.panelMotion + 80);
}

function watchPanels() {
  root().style.setProperty("--panel-ms", `${st.panelMotion}ms`);
  if (!st.panelMotion) {
    panelWatch?.disconnect();
    panelWatch = null;
    root().style.removeProperty("--panel-ms");
    root().classList.remove("panel-moving");
    return;
  }
  if (panelWatch || typeof MutationObserver !== "function") return;
  panelWatch = new MutationObserver((changes) => {
    if (changes.some((one) => one.target.matches?.(PANEL_HOSTS))) movePanels();
  });
  panelWatch.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class", "data-panel-host"] });
}

function fontArea(name, family, size) {
  root().toggleAttribute(`data-font-${name}`, !!family);
  if (family) root().style.setProperty(`--font-${name}`, family);
  else root().style.removeProperty(`--font-${name}`);
  root().toggleAttribute(`data-font-${name}-size`, !!size);
  if (size) root().style.setProperty(`--font-${name}-size`, `${size}px`);
  else root().style.removeProperty(`--font-${name}-size`);
}

function paintFontAreas(font, withTail) {
  fontArea("prompt", font?.prompt ? withTail(font.prompt, "mono") : "", font?.promptSize || 0);
  fontArea("code", font?.code ? withTail(font.code, "mono") : "", font?.codeSize || 0);
  if (font?.smoothing === "thin") root().dataset.smoothing = "thin";
  else delete root().dataset.smoothing;
}

function adoptTuning(config) {
  st.contrast = Number.isFinite(config?.contrast) ? config.contrast : 0;
  st.glass = Number.isFinite(config?.glass) ? config.glass : null;
  st.panelMotion = Number.isFinite(config?.panelMotion) ? config.panelMotion : 0;
  st.chatWidth = config?.chatWidth ?? "auto";
  paintGlass();
  paintChatWidth();
  watchPanels();
}

export { CONTRASTED, PANEL_HOSTS, adoptTuning, applyThemeCss, movePanels, paintAppearanceMarks, paintChatWidth, paintContrast, paintFontAreas, paintGlass, watchPanels, wornCss };
