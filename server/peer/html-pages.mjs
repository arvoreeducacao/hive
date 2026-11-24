import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";

export const PAGE_COLUMN_WIDTH = 728;
export const PAGE_MIN_WIDTH = 240;
export const PAGE_MAX_WIDTH = 1600;
export const PAGE_MIN_HEIGHT = 80;
export const PAGE_MAX_HEIGHT = 2000;
export const PAGE_DEFAULT_HEIGHT = 480;
export const PAGE_MAX_FIT_HEIGHT = 20000;
export const PAGE_MAX_TITLE = 200;
export const PAGE_MAX_BYTES = 512000;
export const PAGE_MAX_INLINED_BYTES = 8 << 20;

const IMAGE_MAX_BYTES = 5 << 20;
const PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SEAT_NAME = /^[\w.-]{1,120}$/;
const IMAGE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".avif": "image/avif" };
const LOCAL_IMAGE_SRC = /(\ssrc\s*=\s*)(["'])(\/[^"'<>]+?)\2/gi;
const VIEWPORT_HEIGHT = /\d(?:\.\d+)?[sdl]?vh\b/i;
const FULL_ROOT_HEIGHT = /(?:^|[\s,}>])(?:html|body)(?:\s*,\s*(?:html|body))*\s*\{(?:[^}]*?[;\s])?\s*(?:min-)?height\s*:\s*100%/i;
const FULL_ROOT_STYLE = /<(?:html|body)\b[^>]*\sstyle\s*=\s*(["'])(?:(?:(?!\1)[^>])*?[;\s])?\s*(?:min-)?height\s*:\s*100%/i;

export const PAGE_RULES = "Self-contained: inline <style> and <script>. Local images given as absolute paths are inlined. Only public https URLs load; nothing on this machine, its network or the Hive is reachable, and links, forms, popups and nested frames do nothing.";

export const PAGE_THEME_GUIDE = "Use the theme CSS variables on :root instead of fixed colors: --background, --foreground, --muted, --muted-foreground, --card, --card-foreground, --border, --primary, --primary-foreground, --accent, --destructive, --warning, --success, --info, --code-background, --chart-1 to --chart-6, --radius, --font-sans, --font-mono. The base sheet already sets the background, the text colour and the font.";

export const PAGE_LAYOUT_GUIDE = `The frame is as wide as the reply (${PAGE_COLUMN_WIDTH}px on the desktop) and sits on the chat background. Leave html, body and the outer element without a background colour, an outer card, a border, a banner title or side padding. The Hive adds an overridable 8px gutter on html for focus rings and shadows; use fluid widths inside it. A box that needs its own background gets 16px padding and var(--radius) corners. Give charts fixed pixel heights. Let the content set the height: vh units and height:100% on html or body are refused, because the frame grows with the page.`;

export const isPageId = (id) => PAGE_ID.test(String(id || ""));

export const pagePathOf = (base, seat, id) => join(base, "renders", seat, `${id}.html`);

export function pageTitle(raw) {
  const title = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!title) return { error: "give the page a title: one short line that names what it shows" };
  if (title.length > PAGE_MAX_TITLE) return { error: `the title is longer than ${PAGE_MAX_TITLE} characters` };
  return { title };
}

const clampInt = (raw, low, high, fallback) => {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(high, Math.max(low, n));
};

export const pageHeight = (raw) => clampInt(raw, PAGE_MIN_HEIGHT, PAGE_MAX_HEIGHT, PAGE_DEFAULT_HEIGHT);

export const pageWidth = (raw) => clampInt(raw, PAGE_MIN_WIDTH, PAGE_MAX_WIDTH, PAGE_COLUMN_WIDTH);

export const pageAppearance = (raw) => (raw === "light" ? "light" : "dark");

async function readPageFile(path) {
  if (!isAbsolute(path)) return { error: `${path} is not a full path — give the .html file from the root` };
  if (!/\.html?$/i.test(path)) return { error: `${path} is not an .html file` };
  let info;
  try { info = await stat(path); } catch { return { error: `there is no file at ${path}` }; }
  if (!info.isFile()) return { error: `${path} is not a file` };
  if (info.size > PAGE_MAX_BYTES) return { error: `${path} is bigger than ${PAGE_MAX_BYTES} bytes` };
  return { html: await readFile(path, "utf8") };
}

async function inlineImages(html) {
  const missing = [];
  const found = new Map();
  for (const hit of html.matchAll(LOCAL_IMAGE_SRC)) {
    const path = hit[3];
    const type = IMAGE_TYPES[extname(path).toLowerCase()];
    if (!type || found.has(path)) continue;
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > IMAGE_MAX_BYTES) throw new Error("not inlined");
      found.set(path, `data:${type};base64,${(await readFile(path)).toString("base64")}`);
    } catch {
      found.set(path, null);
      missing.push(path);
    }
  }
  const inlined = html.replace(LOCAL_IMAGE_SRC, (whole, lead, quote, path) => {
    const data = found.get(path);
    return data ? `${lead}${quote}${data}${quote}` : whole;
  });
  return { html: inlined, missing };
}

export async function pageSource(args = {}) {
  const hasHtml = typeof args.html === "string" && args.html.length > 0;
  const hasPath = typeof args.path === "string" && args.path.trim().length > 0;
  if (hasHtml === hasPath) return { error: "pass the page either as html or as path, one of the two" };
  let html = "";
  if (hasPath) {
    const read = await readPageFile(args.path.trim());
    if (read.error) return read;
    html = read.html;
  } else {
    html = args.html;
  }
  if (Buffer.byteLength(html, "utf8") > PAGE_MAX_BYTES) return { error: `the page is bigger than ${PAGE_MAX_BYTES} bytes` };
  if (!html.trim()) return { error: "the page is empty" };
  if (VIEWPORT_HEIGHT.test(html)) return { error: "the page sizes something with vh units; the frame grows with the page, so use pixels or let the content set the height" };
  if (FULL_ROOT_HEIGHT.test(html) || FULL_ROOT_STYLE.test(html)) return { error: "the page sets height:100% on html or body; the frame grows with the page, so let the content set the height" };
  const inlined = await inlineImages(html);
  if (Buffer.byteLength(inlined.html, "utf8") > PAGE_MAX_INLINED_BYTES) return { error: `with its images inlined the page is bigger than ${PAGE_MAX_INLINED_BYTES} bytes; use smaller images or https addresses` };
  return inlined;
}

export async function keepPage({ base, seat, html }) {
  if (!SEAT_NAME.test(String(seat || ""))) throw new Error("the page has no chat to belong to");
  const id = randomUUID();
  const file = pagePathOf(base, seat, id);
  await mkdir(join(base, "renders", seat), { recursive: true });
  const draft = `${file}.tmp`;
  await writeFile(draft, html, "utf8");
  await rename(draft, file);
  return id;
}

export const renderAnswer = ({ id, title, height }) => JSON.stringify({
  render: { id, title, height },
  message: "The page is on screen above your reply. Do not describe it again or announce it."
});

export function readRenderAnswer(text) {
  let said;
  try { said = JSON.parse(String(text || "")); } catch { return null; }
  const page = said?.render;
  if (!page || !isPageId(page.id)) return null;
  const title = pageTitle(page.title);
  return { id: page.id, title: title.title || "HTML", height: pageHeight(page.height) };
}
