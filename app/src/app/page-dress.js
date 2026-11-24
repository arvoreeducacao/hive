import { PAGE_SHIELD, disarmShadowRoots } from "/assets/page-shield.mjs";

const HEIGHT_MESSAGE = "hive-page-height";
const ESCAPE_MESSAGE = "hive-page-escape";

const PAGE_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' https: data: blob:",
  "style-src 'unsafe-inline' https: data:",
  "img-src https: data: blob:",
  "font-src https: data:",
  "media-src https: data: blob:",
  "connect-src https:",
  "worker-src blob: data:",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "webrtc 'block'"
].join("; ");

const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const FONT_MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

const PALETTES = {
  dark: {
    "--background": "#0a0a0a", "--foreground": "#f5f5f5",
    "--muted": "rgb(255 255 255 / .04)", "--muted-foreground": "#818181",
    "--card": "#111111", "--card-foreground": "#f5f5f5",
    "--popover": "#141414", "--popover-foreground": "#f5f5f5",
    "--secondary": "rgb(255 255 255 / .06)", "--secondary-foreground": "#f5f5f5",
    "--border": "rgb(255 255 255 / .08)", "--ring": "oklch(0.571 0.21 264)",
    "--primary": "oklch(0.571 0.21 264)", "--primary-foreground": "#ffffff",
    "--accent": "rgb(255 255 255 / .06)", "--accent-foreground": "#f5f5f5",
    "--destructive": "#f26b6b", "--destructive-foreground": "#ffffff",
    "--warning": "#f59e0b", "--warning-foreground": "#0a0a0a",
    "--success": "#10b981", "--success-foreground": "#0a0a0a",
    "--info": "#3b82f6", "--info-foreground": "#ffffff",
    "--code-background": "rgb(255 255 255 / .03)",
    "--chart-1": "oklch(0.65 0.19 264)", "--chart-2": "#10b981", "--chart-3": "#f59e0b",
    "--chart-4": "#a78bfa", "--chart-5": "#3b82f6", "--chart-6": "#f26b6b"
  },
  light: {
    "--background": "#fcfcfc", "--foreground": "#27272a",
    "--muted": "#f4f4f5", "--muted-foreground": "#71717a",
    "--card": "#ffffff", "--card-foreground": "#27272a",
    "--popover": "#ffffff", "--popover-foreground": "#27272a",
    "--secondary": "#f4f4f5", "--secondary-foreground": "#27272a",
    "--border": "#e4e4e7", "--ring": "oklch(0.488 0.217 264)",
    "--primary": "oklch(0.488 0.217 264)", "--primary-foreground": "#ffffff",
    "--accent": "#f4f4f5", "--accent-foreground": "#27272a",
    "--destructive": "#dc2626", "--destructive-foreground": "#ffffff",
    "--warning": "#d97706", "--warning-foreground": "#ffffff",
    "--success": "#059669", "--success-foreground": "#ffffff",
    "--info": "#3b82f6", "--info-foreground": "#ffffff",
    "--code-background": "#fafafa",
    "--chart-1": "oklch(0.488 0.217 264)", "--chart-2": "#059669", "--chart-3": "#d97706",
    "--chart-4": "#7c3aed", "--chart-5": "#2563eb", "--chart-6": "#dc2626"
  }
};

const MEASURE = "(() => { const b = document.body; if (!b) return 0; const r = b.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(document.documentElement).paddingBottom) || 0; const gap = parseFloat(getComputedStyle(b).marginBottom) || 0; return Math.ceil(Math.max(r.top + scrollY + b.scrollHeight, r.bottom + scrollY) + gap + pad); })()";

const HEIGHT_REPORTER = `(() => { const say = () => { try { parent.postMessage({ type: "${HEIGHT_MESSAGE}", height: ${MEASURE} }, "*"); } catch {} }; addEventListener("load", () => { say(); setTimeout(say, 300); setTimeout(say, 1200); }); document.addEventListener("DOMContentLoaded", () => { say(); if (typeof ResizeObserver === "function") new ResizeObserver(say).observe(document.body); }); })();`;

const ESCAPE_REPORTER = `addEventListener("keydown", (e) => { if (e.key === "Escape") { try { parent.postMessage({ type: "${ESCAPE_MESSAGE}" }, "*"); } catch {} } }, true);`;

const THEME_FROM = {
  "--background": ["--bg"], "--foreground": ["--txt"],
  "--muted": ["--panel-2"], "--muted-foreground": ["--txt-2"],
  "--card": ["--panel"], "--card-foreground": ["--txt"],
  "--popover": ["--panel-3", "--panel-2"], "--popover-foreground": ["--txt"],
  "--secondary": ["--panel-2"], "--secondary-foreground": ["--txt"],
  "--border": ["--line"], "--ring": ["--accent"],
  "--primary": ["--accent"], "--primary-foreground": ["--bg"],
  "--accent": ["--panel-3", "--panel-2"], "--accent-foreground": ["--txt"],
  "--destructive": ["--red"], "--destructive-foreground": ["--bg"],
  "--warning": ["--yellow"], "--warning-foreground": ["--bg"],
  "--success": ["--green"], "--success-foreground": ["--bg"],
  "--info": ["--blue"], "--info-foreground": ["--bg"],
  "--code-background": ["--panel-2"],
  "--chart-1": ["--accent"], "--chart-2": ["--green"], "--chart-3": ["--yellow"],
  "--chart-4": ["--violet"], "--chart-5": ["--blue"], "--chart-6": ["--red"],
  "--radius": ["--r-card", "--r2"], "--font-sans": ["--sans"], "--font-mono": ["--mono"]
};

const CSS_VALUE = /^[^<>{};\\]{1,240}$/;

const BASE_LOOK = { "--radius": "10px", "--font-sans": FONT_SANS, "--font-mono": FONT_MONO };

function rgbOf(color) {
  const probe = document.createElement("span");
  probe.style.color = color || "#000";
  document.body.append(probe);
  const said = getComputedStyle(probe).color;
  probe.remove();
  return (said.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
}

const toneOf = (color) => {
  const [r, g, b] = rgbOf(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5 ? "light" : "dark";
};

function groundOf(el) {
  for (let at = el; at && at.nodeType === 1; at = at.parentElement) {
    const color = getComputedStyle(at).backgroundColor;
    if (color && color !== "transparent" && !/^rgba\([^)]*,\s*0\)$/.test(color)) return color;
  }
  return "";
}

function liveTheme(host) {
  const read = getComputedStyle(document.body);
  const vars = {};
  for (const [name, sources] of Object.entries(THEME_FROM)) {
    const value = sources.map((one) => read.getPropertyValue(one).trim()).find((one) => CSS_VALUE.test(one));
    if (value) vars[name] = value;
  }
  const ground = host ? groundOf(host) : "";
  if (CSS_VALUE.test(ground)) vars["--background"] = ground;
  return { tone: toneOf(vars["--background"]), vars };
}

const themeFor = (appearance) => {
  const live = liveTheme(null);
  return !appearance || appearance === live.tone ? live : { tone: appearance === "light" ? "light" : "dark", vars: {} };
};

function lookOf(raw) {
  const theme = typeof raw === "string" ? { tone: raw, vars: {} } : raw;
  const tone = theme?.tone === "light" ? "light" : "dark";
  return { tone, look: { ...PALETTES[tone], ...BASE_LOOK, ...(theme?.vars || {}) } };
}

function pageSheet(raw) {
  const { tone, look } = lookOf(raw);
  const vars = Object.entries(look).map(([name, value]) => `${name}: ${value};`).join(" ");
  return `:root { ${vars} color-scheme: ${tone}; }`
    + " html { margin: 0; padding: 8px; background: var(--background); }"
    + " body { margin: 0; color: var(--foreground); font: 14px/1.5 var(--font-sans); }";
}

function dressPage(html, theme, { report = false, escape = false } = {}) {
  const scripts = [report ? HEIGHT_REPORTER : "", escape ? ESCAPE_REPORTER : ""].filter(Boolean).map((code) => `<script>${code}</script>`).join("");
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PAGE_POLICY}"><script>${PAGE_SHIELD}</script><style>${pageSheet(theme)}</style>${scripts}`;
  const source = disarmShadowRoots(html);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(source);
  return doctype ? `${doctype[0]}${head}${source.slice(doctype[0].length)}` : `<!DOCTYPE html>${head}${source}`;
}

const attributeOf = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const PREVIEW_HOLDER = `addEventListener("message", (event) => { const frame = document.querySelector("iframe"); if (!frame || event.source !== frame.contentWindow || event.data?.type !== "${HEIGHT_MESSAGE}") return; const height = Math.ceil(Number(event.data.height)); if (height > 0) frame.style.height = height + "px"; });`;

function previewStage(html, appearance, theme = { tone: appearance, vars: {} }) {
  const ground = theme.vars["--background"] || (PALETTES[theme.tone] || PALETTES.dark)["--background"];
  return `<!DOCTYPE html><meta charset="utf-8"><style>html, body { margin: 0; background: ${ground}; } iframe { display: block; width: 100%; height: 800px; border: 0; }</style>`
    + `<iframe sandbox="allow-scripts" csp="${attributeOf(PAGE_POLICY)}" referrerpolicy="no-referrer" srcdoc="${attributeOf(dressPage(html, theme, { report: true }))}"></iframe><script>${PREVIEW_HOLDER}</script>`;
}


function makePageFrame(html, { title, theme, report = false, escape = false }) {
  const frame = document.createElement("iframe");
  frame.className = "sv-page-frame";
  frame.title = title;
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("csp", PAGE_POLICY);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.srcdoc = dressPage(html, theme, { report, escape });
  return frame;
}

const APP_DOMAIN = /^(?:https|wss):\/\/(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*(?::\d{1,5})?$/i;

const APP_VARIABLES = {
  "--color-background-primary": "--background", "--color-background-secondary": "--card", "--color-background-tertiary": "--muted",
  "--color-background-inverse": "--foreground", "--color-background-info": "--info", "--color-background-danger": "--destructive",
  "--color-background-warning": "--warning", "--color-background-success": "--success",
  "--color-text-primary": "--foreground", "--color-text-secondary": "--muted-foreground", "--color-text-tertiary": "--muted-foreground",
  "--color-text-inverse": "--background", "--color-text-info": "--info", "--color-text-danger": "--destructive",
  "--color-text-success": "--success", "--color-text-warning": "--warning",
  "--color-border-primary": "--border", "--color-border-secondary": "--border", "--color-border-danger": "--destructive",
  "--color-ring-primary": "--ring", "--font-sans": "--font-sans", "--font-mono": "--font-mono", "--border-radius-md": "--radius"
};

const appDomains = (list) => (Array.isArray(list) ? list.filter((one) => typeof one === "string" && APP_DOMAIN.test(one)).slice(0, 32) : []);

function appPolicy(csp) {
  const resources = appDomains(csp?.resourceDomains).join(" ");
  const connect = appDomains(csp?.connectDomains).join(" ") || "'none'";
  const withResources = (rule) => (resources ? `${rule} ${resources}` : rule);
  return [
    "default-src 'none'",
    withResources("script-src 'unsafe-inline' 'unsafe-eval' data: blob:"),
    withResources("style-src 'unsafe-inline' data:"),
    withResources("img-src data: blob:"),
    withResources("font-src data:"),
    withResources("media-src data: blob:"),
    `connect-src ${connect}`,
    "worker-src blob: data:",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "webrtc 'block'"
  ].join("; ");
}

function appVariables(theme) {
  const { look } = lookOf(theme);
  return Object.fromEntries(Object.entries(APP_VARIABLES).filter(([, from]) => look[from]).map(([name, from]) => [name, look[from]]));
}

function dressApp(html, theme, csp) {
  const { tone } = lookOf(theme);
  const vars = Object.entries(appVariables(theme)).map(([name, value]) => `${name}: ${value};`).join(" ");
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${appPolicy(csp)}"><script>${PAGE_SHIELD}</script><style>:root { ${vars} color-scheme: ${tone}; }</style>`;
  const source = disarmShadowRoots(html);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(source);
  return doctype ? `${doctype[0]}${head}${source.slice(doctype[0].length)}` : `<!DOCTYPE html>${head}${source}`;
}

function makeAppFrame(html, { title, theme, csp, permissions }) {
  const frame = document.createElement("iframe");
  frame.className = "sv-mcp-app-frame";
  frame.title = title;
  frame.setAttribute("sandbox", "allow-scripts allow-forms");
  frame.setAttribute("csp", appPolicy(csp));
  frame.setAttribute("referrerpolicy", "no-referrer");
  if (permissions?.clipboardWrite) frame.setAttribute("allow", "clipboard-write");
  frame.srcdoc = dressApp(html, theme, csp);
  return frame;
}

export { ESCAPE_MESSAGE, HEIGHT_MESSAGE, MEASURE, PAGE_POLICY, PALETTES, appPolicy, appVariables, dressApp, dressPage, liveTheme, makeAppFrame, makePageFrame, previewStage, themeFor };
