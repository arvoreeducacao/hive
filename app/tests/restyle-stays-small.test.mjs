import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(app, "assets");
const sheets = [
  ["app.html", [...readFileSync(join(app, "app.html"), "utf8").matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n")],
  ...readdirSync(assets).filter((f) => f.endsWith(".css")).map((f) => [f, readFileSync(join(assets, f), "utf8")]),
  ...readdirSync(assets, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => readdirSync(join(assets, d.name)).filter((f) => f.endsWith(".css")).map((f) => [`${d.name}/${f}`, readFileSync(join(assets, d.name, f), "utf8")]))
];

function rules(css) {
  const out = [];
  for (const [, selector, body] of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selector.trim().startsWith("@")) continue;
    for (const one of split(selector)) out.push([one, body]);
  }
  return out;
}

function split(selector) {
  const out = [];
  let depth = 0;
  let now = "";
  for (const c of selector) {
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { out.push(now.trim()); now = ""; }
    else now += c;
  }
  if (now.trim()) out.push(now.trim());
  return out;
}

function subjectOf(selector) {
  let depth = 0;
  let last = 0;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && (c === " " || c === ">" || c === "+" || c === "~")) last = i + 1;
  }
  return selector.slice(last).trim();
}

const CHANGES_OFTEN = /\.(focused|typing|open|composer-ready|on)(?![\w-])|\[data-state/;
const ANY_ELEMENT = (subject) => {
  const bare = subject.replace(/::?(before|after)$/, "");
  return bare === "*" || /^(:not\([^()]*\))+$/.test(bare);
};

test("no rule reaches every element under a chat whose focus, typing or state keeps changing", () => {
  const found = [];
  for (const [file, css] of sheets) {
    for (const [selector] of rules(css)) {
      const subject = subjectOf(selector);
      if (!ANY_ELEMENT(subject)) continue;
      if (CHANGES_OFTEN.test(selector.slice(0, selector.length - subject.length))) found.push(`${file}: ${selector}`);
    }
  }
  assert.deepEqual(found, [], "each of these restyles the whole conversation every time that class flips: aim at one element or move the flip into a class set only when it matters");
});

const FLIPS_EVERY_TURN = /\.(focused|typing|composer-ready)(?![\w-])|\[data-state/;
const KEPT_ON_THE_TILE = new Set(sheets.flatMap(([, css]) => [...css.matchAll(/@property\s+(--[\w-]+)\s*\{[^}]*inherits:\s*false/g)].map((m) => m[1])));

test("no colour that follows the focus or the state of a chat is set on the whole chat", () => {
  const found = [];
  for (const [file, css] of sheets) {
    for (const [selector, body] of rules(css)) {
      const subject = subjectOf(selector);
      if (!/\.tile(?![\w-])/.test(subject) || !FLIPS_EVERY_TURN.test(subject)) continue;
      const inherited = [...body.matchAll(/(?:^|;)\s*(--[\w-]+)\s*:/g)].map((m) => m[1]).filter((name) => !KEPT_ON_THE_TILE.has(name));
      if (inherited.length) found.push(`${file}: ${selector} (${inherited.join(", ")})`);
    }
  }
  assert.deepEqual(found, [], "a variable set on the tile is inherited by every message in it, so a change of focus or state restyles the whole conversation: set it on the element that reads it, or register it with inherits: false when only the tile reads it");
});
