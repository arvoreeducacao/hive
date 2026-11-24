import { PAGE_SHIELD, disarmShadowRoots } from "./page-shield.mjs";

export const PAGE_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' data: blob:",
  "style-src 'unsafe-inline' data:",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "worker-src blob: data:",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "webrtc 'block'"
].join("; ");

export const PAGE_HOST = "/phone/page-host";
export const PAGE_HOST_POLICY = `sandbox allow-scripts; ${PAGE_POLICY}; frame-ancestors 'self'`;
export const PAGE_READY_MESSAGE = "hive-page-ready";
export const PAGE_SOURCE_MESSAGE = "hive-page-source";
export const PAGE_SHOWN_MESSAGE = "hive-page-shown";
export const PAGE_PING_MESSAGE = "hive-page-ping";
export const PAGE_HEIGHT_MESSAGE = "hive-page-height";
export const PAGE_MIN_HEIGHT = 80;
export const PAGE_MAX_HEIGHT = 2000;
export const PAGE_DEFAULT_HEIGHT = 480;
export const PAGE_MAX_TITLE = 200;

const PALETTE = {
  "--background": "#0C0C0C", "--foreground": "#EDEBE7",
  "--muted": "#191919", "--muted-foreground": "#9C988F",
  "--card": "#131313", "--card-foreground": "#EDEBE7",
  "--popover": "#191919", "--popover-foreground": "#EDEBE7",
  "--secondary": "#202020", "--secondary-foreground": "#EDEBE7",
  "--border": "#262626", "--ring": "#CD694A",
  "--primary": "#CD694A", "--primary-foreground": "#0C0C0C",
  "--accent": "#202020", "--accent-foreground": "#EDEBE7",
  "--destructive": "#D9574B", "--destructive-foreground": "#0C0C0C",
  "--warning": "#E0AF68", "--warning-foreground": "#0C0C0C",
  "--success": "#4EA96F", "--success-foreground": "#0C0C0C",
  "--info": "#3b82f6", "--info-foreground": "#ffffff",
  "--code-background": "#131313",
  "--chart-1": "#CD694A", "--chart-2": "#4EA96F", "--chart-3": "#E0AF68",
  "--chart-4": "#a78bfa", "--chart-5": "#3b82f6", "--chart-6": "#D9574B"
};

const FONT_SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif';
const FONT_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const MEASURE = "(() => { const b = document.body; if (!b) return 0; const r = b.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(document.documentElement).paddingBottom) || 0; const gap = parseFloat(getComputedStyle(b).marginBottom) || 0; return Math.ceil(Math.max(r.top + scrollY + b.scrollHeight, r.bottom + scrollY) + gap + pad); })()";

const PRESENCE_REPORTER = `(() => { const up = parent; const say = () => { try { up.postMessage({ type: "${PAGE_SHOWN_MESSAGE}" }, "*"); } catch {} }; addEventListener("message", (event) => { if (event.source === up && event.data?.type === "${PAGE_PING_MESSAGE}") say(); }); say(); })();`;

const HEIGHT_REPORTER = `(() => { const up = parent; const say = () => { try { up.postMessage({ type: "${PAGE_HEIGHT_MESSAGE}", height: ${MEASURE} }, "*"); } catch {} }; addEventListener("load", () => { say(); setTimeout(say, 300); setTimeout(say, 1200); }); document.addEventListener("DOMContentLoaded", () => { say(); if (typeof ResizeObserver === "function") new ResizeObserver(say).observe(document.body); }); })();`;

const SHEET = `:root { ${Object.entries(PALETTE).map(([name, value]) => `${name}: ${value};`).join(" ")} --radius: 10px; --font-sans: ${FONT_SANS}; --font-mono: ${FONT_MONO}; color-scheme: dark; }`
  + " html { margin: 0; padding: 8px; background: var(--background); -webkit-text-size-adjust: 100%; }"
  + " body { margin: 0; color: var(--foreground); font: 14px/1.5 var(--font-sans); }";

export function dressPage(html, { report = false } = {}) {
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${PAGE_POLICY}"><style>${SHEET}</style><script>${PAGE_SHIELD}</script><script>${PRESENCE_REPORTER}</script>${report ? `<script>${HEIGHT_REPORTER}</script>` : ""}`;
  const source = disarmShadowRoots(html);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(source);
  return doctype ? `${doctype[0]}${head}${source.slice(doctype[0].length)}` : `<!DOCTYPE html>${head}${source}`;
}

export const pageTitleOf = (raw) => String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, PAGE_MAX_TITLE) || "HTML";

export function pageHeightOf(raw) {
  const height = Math.round(Number(raw));
  if (!Number.isFinite(height) || height <= 0) return PAGE_DEFAULT_HEIGHT;
  return Math.min(PAGE_MAX_HEIGHT, Math.max(PAGE_MIN_HEIGHT, height));
}

export function fitHeightOf(raw) {
  const height = Number(raw);
  if (!Number.isFinite(height) || height <= 0) return 0;
  return Math.min(PAGE_MAX_HEIGHT, Math.max(PAGE_MIN_HEIGHT, Math.ceil(height)));
}
