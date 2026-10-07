import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const html = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const pkg = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8"));

const REGIONS = ["foundation", "top", "rail", "tile", "tools", "overlays", "panels", "browser", "micro", "structures"];
const SCOPED = /^(?::where\(\s*)?(?:html\s*>\s*)?body(?=[^\s>+~]*\.experience-raycast(?![\w-]))/;

const sheetsIn = (dir) => readdirSync(join(HERE, "assets", dir)).filter((name) => name.endsWith(".css")).map((name) => `${dir}/${name}`);
const raycastSheets = () => sheetsIn("raycast");
const structureSheets = () => { try { return sheetsIn("structures"); } catch { return []; } };

function splitTop(text, sep) {
  const parts = [];
  let depth = 0, quote = "", from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote && text[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  parts.push(text.slice(from));
  return parts.map((one) => one.trim()).filter(Boolean);
}

function selectorsOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = [];
  const walk = (from, to, skip) => {
    let i = from;
    while (i < to) {
      const open = text.indexOf("{", i);
      if (open < 0 || open >= to) return;
      const prelude = text.slice(i, open).split(";").pop().trim();
      let depth = 1, j = open + 1, quote = "";
      for (; j < to && depth; j++) {
        const c = text[j];
        if (quote) { if (c === quote && text[j - 1] !== "\\") quote = ""; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === "{") depth++;
        else if (c === "}") depth--;
      }
      if (prelude.startsWith("@")) {
        if (/^@(media|supports|container|layer)\b/.test(prelude)) walk(open + 1, j - 1, false);
      } else if (!skip) {
        for (const one of splitTop(prelude, ",")) found.push(one);
      }
      i = j;
    }
  };
  walk(0, text.length, false);
  return found;
}

test("every region has its own sheet in app/assets/raycast, and nothing else lives there", () => {
  assert.deepEqual(raycastSheets().sort(), REGIONS.map((one) => `raycast/${one}.css`).sort());
});

test("the raycast and structure sheets are linked after experience.css, served as css and shipped in the package", () => {
  const anchor = html.indexOf('<link rel="stylesheet" href="/assets/experience.css">');
  assert.ok(anchor > 0);
  let last = anchor;
  for (const sheet of [...REGIONS.map((one) => `raycast/${one}.css`), ...structureSheets()]) {
    const at = html.indexOf(`<link rel="stylesheet" href="/assets/${sheet}">`);
    assert.ok(at > last, `${sheet} is linked after the sheet before it`);
    last = at;
    assert.ok(server.includes(`"/assets/${sheet}": ["assets/${sheet}", "text/css"]`), `${sheet} is served by STATIC`);
  }
  assert.ok(last < html.indexOf("</head>"));
  assert.ok(pkg.build.files.includes("assets/**"), "the package ships app/assets");
});

test("the scope check itself tells a scoped selector from a loose one", () => {
  for (const ok of ["body.experience-raycast", "body.experience-raycast .tile", "body.look-dimension.experience-raycast #top", ":where(body.experience-raycast) .tile", "body:where(.experience-raycast).look-dimension .x", "html > body:where(.experience-raycast)", 'body.experience-raycast[data-structure="map"] #stage']) assert.match(ok, SCOPED, ok);
  for (const bad of [".tile", "body .tile", "body.experience-raycastish .tile", ":root", "#top body.experience-raycast", "body.experience-next .tile", "html body.look-dimension .tile.experience-raycast"]) assert.doesNotMatch(bad, SCOPED, bad);
  assert.deepEqual(selectorsOf("@font-face { font-family: X; } @keyframes k { from { opacity: 0 } } @media (x) { body.experience-raycast a, .b { c: d } } :root { e: f }"), ["body.experience-raycast a", ".b", ":root"]);
});

test("every selector in a raycast or structure sheet stays inside body.experience-raycast", () => {
  for (const sheet of [...raycastSheets(), ...structureSheets()]) {
    const loose = selectorsOf(readFileSync(join(HERE, "assets", sheet), "utf8")).filter((one) => !SCOPED.test(one));
    assert.deepEqual(loose, [], `${sheet} styles outside the Raycast experience`);
  }
});

function keyframesIn(css) {
  const found = new Map();
  for (const hit of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1, i = hit.index + hit[0].length;
    for (; i < css.length && depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    found.set(hit[1], css.slice(hit.index + hit[0].length, i - 1));
  }
  return found;
}

const unwrapFallbacks = (text) => {
  let out = text, prev;
  do { prev = out; out = out.replace(/var\(--rc-[\w-]+,\s*((?:[^()]|\([^()]*\))*)\)/g, "$1"); } while (out !== prev);
  return out;
};
const flat = (text) => text.replace(/\s+/g, " ").replace(/\s*([{};,])\s*/g, "$1").trim();

test("a raycast sheet only redefines a keyframe of the app when its fallbacks give back the app's own frames", () => {
  const base = keyframesIn(html);
  for (const sheet of [...raycastSheets(), ...structureSheets()]) {
    for (const [name, body] of keyframesIn(readFileSync(join(HERE, "assets", sheet), "utf8"))) {
      if (!base.has(name)) { assert.match(name, /^rc-/, `${sheet}: a new keyframe is named rc-*, so it cannot shadow one of the app`); continue; }
      assert.equal(flat(unwrapFallbacks(body)), flat(base.get(name)), `${sheet} changes @keyframes ${name} with the flag off`);
    }
  }
});
