const ATTRS = `(?:"[^"]*"|'[^']*'|[^>"'])*`;
const SVG_BLOCK = new RegExp(`<svg\\b${ATTRS}>[\\s\\S]*?<\\/svg>`, "gi");
const OPEN_TAG = new RegExp(`^<svg\\b${ATTRS}>`, "i");
const VIEWBOX = /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)\s*["']/i;
const ARIA = /aria-label\s*=\s*"([^"]*)"|aria-label\s*=\s*'([^']*)'/i;
const VAR_CALL = /var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^()]*?)\s*)?\)/gi;
const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

export const FIGURE_MARK = (n) => `leaf-figure-${n}`;
export const IMAGE_MARK = (n) => `leaf-image-${n}`;

const DATA_SRC = new RegExp(`<img\\b(${ATTRS})>`, "gi");
const DATA_URL = /\bsrc\s*=\s*(?:"data:(image\/[a-z+]+);base64,([^"]*)"|'data:(image\/[a-z+]+);base64,([^']*)')/i;

export function liftDataImages(html) {
  const images = [];
  const page = String(html || "").replace(DATA_SRC, (whole, attrs) => {
    const found = DATA_URL.exec(attrs);
    if (!found) return whole;
    const contentType = (found[1] || found[3] || "").toLowerCase();
    const packed = String(found[2] || found[4] || "").replace(/\s+/g, "");
    if (!contentType || packed.length < 64) return whole;
    const n = images.length;
    images.push({ n, contentType, data: packed, bytes: Math.floor((packed.length * 3) / 4) });
    return `<img${attrs.replace(found[0], ` src="${IMAGE_MARK(n)}"`)}>`;
  });
  return { html: page, images };
}

export const HIVE_LIGHT = {
  ground: "#FAF9F7",
  raise: "#F2F0EC",
  sink: "#E8E5DF",
  rule: "#DCD8D0",
  ink: "#1A1917",
  "ink-2": "#45423C",
  "ink-3": "#7A756C",
  key: "#A8482A",
  "key-strong": "#CD694A",
  "key-soft": "#F9EDE7",
  bar: "#C9C3B8",
  ok: "#3D7F55",
  mono: "Menlo, ui-monospace, monospace",
  ui: "-apple-system, system-ui, sans-serif",
  display: "-apple-system, system-ui, sans-serif",
  body: "Georgia, serif"
};

const escapeAttr = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sizeOf(open) {
  const box = VIEWBOX.exec(open);
  if (!box) return null;
  const width = Number(box[3]);
  const height = Number(box[4]);
  if (!(width > 0) || !(height > 0)) return null;
  return { width, height };
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

const unescapeAttr = (text) =>
  String(text).replace(/&(amp|lt|gt|quot|apos|#39);/g, (whole, name) => ENTITIES[name] ?? whole);

export function labelOf(open) {
  const found = ARIA.exec(open);
  const said = found ? found[1] ?? found[2] ?? "" : "";
  return unescapeAttr(said).replace(/\s+/g, " ").trim();
}

const inAttribute = (value) => String(value).replace(/&(?![a-z#][a-z0-9#]*;)/gi, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function resolveVars(text, palette) {
  let said = text;
  for (let round = 0; round < 4 && VAR_CALL.test(said); round += 1) {
    VAR_CALL.lastIndex = 0;
    said = said.replace(VAR_CALL, (whole, name, fallback) => {
      const held = palette[name];
      if (held) return inAttribute(held);
      if (fallback && fallback.trim()) return inAttribute(fallback.trim());
      return palette.ink;
    });
  }
  VAR_CALL.lastIndex = 0;
  return said;
}

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const RULE = /([^{}]+)\{([^{}]*)\}/g;
const SIMPLE_CLASS = /^\.([a-zA-Z][\w-]*)$/;
const CLASSED = new RegExp(`<([a-zA-Z][\\w:-]*)(${ATTRS.slice(0, -1)}?\\bclass\\s*=\\s*(?:"([^"]*)"|'([^']*)')${ATTRS})>`, "g");

export function cssOf(html) {
  const said = [];
  let found;
  STYLE_BLOCK.lastIndex = 0;
  while ((found = STYLE_BLOCK.exec(String(html || "")))) said.push(found[1]);
  return said.join("\n");
}

export function withoutAtRules(css) {
  let said = "";
  let i = 0;
  const text = String(css || "");
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at < 0) return said + text.slice(i);
    said += text.slice(i, at);
    const open = text.indexOf("{", at);
    const stop = text.indexOf(";", at);
    if (open < 0 || (stop >= 0 && stop < open)) {
      i = stop < 0 ? text.length : stop + 1;
      continue;
    }
    let depth = 0;
    let j = open;
    for (; j < text.length; j += 1) {
      if (text[j] === "{") depth += 1;
      else if (text[j] === "}" && --depth === 0) break;
    }
    i = j + 1;
  }
  return said;
}

const PLAIN_ROOT = /^(:root|html|body)$/i;
const CUSTOM_PROP = /--([a-zA-Z][\w-]*)\s*:\s*([^;]+)/g;

export function paletteOf(css, base = HIVE_LIGHT) {
  const palette = { ...base };
  const flat = withoutAtRules(String(css || "").replace(/\/\*[\s\S]*?\*\//g, ""));
  let found;
  RULE.lastIndex = 0;
  while ((found = RULE.exec(flat))) {
    if (!found[1].split(",").some((one) => PLAIN_ROOT.test(one.trim()))) continue;
    CUSTOM_PROP.lastIndex = 0;
    let prop;
    while ((prop = CUSTOM_PROP.exec(found[2]))) {
      const value = prop[2].trim();
      if (value) palette[prop[1]] = value;
    }
  }
  return palette;
}

export function classRules(css) {
  const rules = new Map();
  const flat = withoutAtRules(String(css || "").replace(/\/\*[\s\S]*?\*\//g, ""));
  let found;
  RULE.lastIndex = 0;
  while ((found = RULE.exec(flat))) {
    const declarations = found[2].trim().replace(/\s+/g, " ");
    if (!declarations) continue;
    for (const selector of found[1].split(",")) {
      const name = SIMPLE_CLASS.exec(selector.trim())?.[1];
      if (!name) continue;
      rules.set(name, `${rules.get(name) || ""}${declarations.endsWith(";") ? declarations : `${declarations};`}`);
    }
  }
  return rules;
}

export function inlineClasses(svg, rules) {
  if (!rules.size) return svg;
  CLASSED.lastIndex = 0;
  return svg.replace(CLASSED, (whole, tag, attrs, quoted, single) => {
    const names = (quoted ?? single ?? "").split(/\s+/).filter(Boolean);
    const declarations = escapeAttr(names.map((name) => rules.get(name) || "").join(""));
    if (!declarations) return whole;
    const closed = /\/\s*$/.test(attrs);
    const body = closed ? attrs.replace(/\/\s*$/, "") : attrs;
    const tail = closed ? "/>" : ">";
    const held = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(body);
    if (held) {
      const mine = held[1] ?? held[2] ?? "";
      return `<${tag}${body.replace(held[0], `style="${declarations}${mine}"`)}${tail}`;
    }
    return `<${tag}${body} style="${declarations}"${tail}`;
  });
}

export const groundOf = (palette) =>
  palette.raise || palette.surface || palette.background || palette.ground || "#FFFFFF";

export function standaloneSvg(svg, palette = HIVE_LIGHT, rules = new Map()) {
  const open = OPEN_TAG.exec(svg)?.[0] || "";
  if (!open) return { error: "that is not an svg" };

  let head = open;
  if (!/\bxmlns\s*=/i.test(head)) head = head.replace(/^<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  if (/xlink:/i.test(svg) && !/\bxmlns:xlink\s*=/i.test(head)) {
    head = head.replace(/^<svg\b/i, `<svg xmlns:xlink="${XLINK_NS}"`);
  }

  const size = sizeOf(head);
  if (size && !/\bwidth\s*=/i.test(head)) {
    head = head.replace(/^<svg\b/i, `<svg width="${size.width}" height="${size.height}"`);
  }

  const ground = `<rect width="100%" height="100%" fill="${groundOf(palette)}"/>`;
  const body = inlineClasses(svg.slice(open.length), rules);
  const whole = resolveVars(`${inlineClasses(head, rules)}${ground}${body}`, palette)
    .replace(/currentColor/g, palette.ink);

  return { svg: whole, bytes: Buffer.byteLength(whole), label: labelOf(open), ...(size || {}) };
}

export function liftFigures(html, base = HIVE_LIGHT) {
  const figures = [];
  const css = cssOf(html);
  const own = paletteOf(css, {});
  const palette = { ...base, ...own };
  const rules = classRules(css);
  palette.raise = own.raise || own.surface || own.background || own.ground || groundOf(base);
  const page = String(html || "").replace(SVG_BLOCK, (block) => {
    const made = standaloneSvg(block, palette, rules);
    if (made.error) return block;
    const n = figures.length;
    figures.push({ n, svg: made.svg, bytes: made.bytes, label: made.label, width: made.width, height: made.height });
    return `<img src="${FIGURE_MARK(n)}" alt="${escapeAttr(made.label)}">`;
  });
  return { html: page, figures };
}

export function pinFigures(html, urls, mark = FIGURE_MARK) {
  let page = String(html || "");
  urls.forEach((url, n) => {
    if (!url) return;
    page = page.split(mark(n)).join(url);
  });
  return page;
}

export function stripWeight(html) {
  return String(html || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}
