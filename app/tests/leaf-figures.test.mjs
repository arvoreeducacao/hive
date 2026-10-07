import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FIGURE_MARK,
  HIVE_LIGHT,
  classRules,
  cssOf,
  paletteOf,
  labelOf,
  liftFigures,
  pinFigures,
  sizeOf,
  standaloneSvg,
  stripWeight
} from "../lib/leaf-figures.mjs";

const DIAGRAM = `<svg viewBox="0 0 760 314" role="img" style="font-family: var(--mono)" aria-label="Hoje o texto vira HTML na estante,   e para na engenharia.">
  <rect x="8" y="26" width="118" height="46" fill="none" stroke="currentColor" stroke-opacity=".45"/>
  <text x="67" y="47" fill="currentColor">assento</text>
  <text x="655" y="90" fill="#CD694A">produto para aqui</text>
</svg>`;

test("the drawing becomes a file that stands on its own", () => {
  const made = standaloneSvg(DIAGRAM);
  assert.equal(made.error, undefined);
  assert.match(made.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(made.svg, /width="760" height="314"/);
  assert.equal(made.width, 760);
  assert.equal(made.height, 314);
});

test("nothing that only a stylesheet could resolve is left inside", () => {
  const made = standaloneSvg(DIAGRAM);
  assert.equal(/currentColor/.test(made.svg), false);
  assert.equal(/var\(--/.test(made.svg), false);
  assert.match(made.svg, new RegExp(HIVE_LIGHT.ink));
  assert.match(made.svg, /font-family: Menlo/);
  assert.match(made.svg, /#CD694A/);
});

test("the drawing carries its own light ground, so it reads in a dark page too", () => {
  const made = standaloneSvg(DIAGRAM);
  const ground = made.svg.indexOf(`<rect width="100%" height="100%" fill="${HIVE_LIGHT.raise}"/>`);
  assert.ok(ground > 0);
  assert.ok(ground < made.svg.indexOf("assento"));
});

test("a var nobody defined falls back to what the page wrote, then to the ink", () => {
  const made = standaloneSvg(`<svg viewBox="0 0 10 10"><text fill="var(--nope, #123456)">a</text><text fill="var(--other)">b</text></svg>`);
  assert.match(made.svg, /#123456/);
  assert.match(made.svg, new RegExp(HIVE_LIGHT.ink));
});

test("what is not an svg is refused, instead of becoming an empty file", () => {
  assert.match(standaloneSvg("<div>nada</div>").error, /not an svg/);
  assert.equal(sizeOf('<svg viewBox="0 0 0 10">'), null);
  assert.equal(sizeOf("<svg>"), null);
});

test("the aria-label becomes the alt text, which is the only description a blind reader gets", () => {
  assert.equal(labelOf('<svg aria-label="o mecanismo   inteiro">'), "o mecanismo inteiro");
  assert.equal(labelOf("<svg aria-label='de aspas simples'>"), "de aspas simples");
  assert.equal(labelOf("<svg>"), "");
});

test("lifting a page leaves an img in the place of every drawing", () => {
  const page = `<h1>t</h1><figure>${DIAGRAM}<figcaption>a legenda</figcaption></figure><p>texto</p><figure><svg viewBox="0 0 4 4"><text>b</text></svg></figure>`;
  const lifted = liftFigures(page);

  assert.equal(lifted.figures.length, 2);
  assert.equal(/<svg/.test(lifted.html), false);
  assert.match(lifted.html, new RegExp(`<img src="${FIGURE_MARK(0)}" alt="Hoje o texto vira HTML na estante, e para na engenharia."`));
  assert.match(lifted.html, new RegExp(`<img src="${FIGURE_MARK(1)}" alt=""`));
  assert.match(lifted.html, /a legenda/);
  assert.match(lifted.html, /<p>texto<\/p>/);
});

test("the quotes of a label never break out of the alt attribute", () => {
  const lifted = liftFigures(`<svg viewBox="0 0 4 4" aria-label='a &quot;coisa&quot; <b>'></svg>`);
  assert.match(lifted.html, /alt="a &quot;coisa&quot; &lt;b&gt;"/);
});

test("pinning puts the real address in, and leaves the page alone when an upload failed", () => {
  const lifted = liftFigures(`<figure>${DIAGRAM}</figure><figure><svg viewBox="0 0 4 4"></svg></figure>`);
  const pinned = pinFigures(lifted.html, ["/api/uploads/u/abc.svg", ""]);

  assert.match(pinned, /<img src="\/api\/uploads\/u\/abc\.svg"/);
  assert.match(pinned, new RegExp(`<img src="${FIGURE_MARK(1)}"`));
});

test("the embedded font and the stylesheet come off before the page is sent", () => {
  const heavy = `<style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style><link rel="stylesheet" href="x"><script>a()</script><p>o texto</p>`;
  const light = stripWeight(heavy);

  assert.equal(light, "<p>o texto</p>");
  assert.ok(light.length < heavy.length);
});

test("a page with no drawing comes out exactly as it went in", () => {
  const page = "<h1>t</h1><p>só texto</p>";
  const lifted = liftFigures(page);
  assert.equal(lifted.html, page);
  assert.deepEqual(lifted.figures, []);
});

const PLAN_PAGE = `<style>
  .d-box { fill: none; stroke: #d2d9c9; stroke-width: 1; }
  .d-box-accent { fill: none; stroke: #b5761a; }
  .d-t, .d-m { font-family: monospace; }
  .d-t { font-size: 13px; fill: #191d18; }
  .d-m { font-size: 11px; fill: #55604f; }
  .diagram svg { max-width: 100%; }
  @media (prefers-color-scheme: dark) { .d-t { fill: #e9ece2; } }
</style>
<figure><svg viewBox="0 0 200 60" aria-label="o mecanismo">
  <rect class="d-box" x="10" y="10" width="80" height="40"/>
  <text class="d-t" x="20" y="30" style="letter-spacing:.1em">assento</text>
  <text class="d-m" x="20" y="46">markdown</text>
  <rect class="d-box-accent" x="110" y="10" width="80" height="40"/>
</svg></figure>`;

test("the rules of the page ride along, so a drawing styled by class survives", () => {
  const lifted = liftFigures(PLAN_PAGE);
  const svg = lifted.figures[0].svg;

  assert.match(svg, /<rect class="d-box" x="10" y="10" width="80" height="40" style="fill: none; stroke: #d2d9c9; stroke-width: 1;"\/>/);
  assert.match(svg, /stroke: #b5761a/);
  assert.match(svg, /style="font-family: monospace;font-size: 13px; fill: #191d18;/);
  assert.equal(/class="d-box"[^>]*fill="#1A1917"/.test(svg), false);
  assert.equal(/\/ style=/.test(svg), false);
});

test("what the element already wrote in its own style wins over the class", () => {
  const svg = liftFigures(PLAN_PAGE).figures[0].svg;
  const text = /<text class="d-t"[^>]*style="([^"]*)"/.exec(svg)[1];

  assert.ok(text.indexOf("letter-spacing:.1em") > text.indexOf("font-size: 13px"));
});

test("only a plain class rule is inlined, never a nested or media selector", () => {
  const rules = classRules(cssOf(PLAN_PAGE));

  assert.equal(rules.has("d-box"), true);
  assert.equal(rules.has("diagram"), false);
  assert.equal(rules.get("d-t").includes("#e9ece2"), false);
});

test("a page with no stylesheet at all still lifts its drawings", () => {
  const lifted = liftFigures(`<svg viewBox="0 0 4 4"><rect class="orfa" x="0" y="0"/></svg>`);

  assert.equal(lifted.figures.length, 1);
  assert.match(lifted.figures[0].svg, /class="orfa"/);
  assert.equal(/style=/.test(lifted.figures[0].svg), false);
});

test("the palette is read from the page, because every boilerplate has its own", () => {
  const page = `<style>
    :root { --surface: #fbfcf9; --accent: #b5761a; --ink-soft: #55604f; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface: #191c16; } }
  </style>
  <svg viewBox="0 0 10 10"><rect class="b"/></svg>
  <style>.b { fill: var(--surface); stroke: var(--accent); }</style>`;
  const palette = paletteOf(cssOf(page));

  assert.equal(palette.surface, "#fbfcf9");
  assert.equal(palette.accent, "#b5761a");
  assert.equal(palette.ink, HIVE_LIGHT.ink);

  const svg = liftFigures(page).figures[0].svg;
  assert.match(svg, /fill: #fbfcf9; stroke: #b5761a;/);
  assert.equal(/#191c16/.test(svg), false);
});

test("the dark half of the page never wins, because the figure carries a light ground", () => {
  const page = `<style>
    :root { --surface: #fbfcf9; --ink: #191d18; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --surface: #191c16; --ink: #e9ece2; } }
    :root[data-theme="dark"] { --surface: #191c16; --ink: #e9ece2; }
    .b { fill: var(--surface); stroke: var(--ink); }
  </style><svg viewBox="0 0 10 10"><rect class="b"/></svg>`;
  const palette = paletteOf(cssOf(page));

  assert.equal(palette.surface, "#fbfcf9");
  assert.equal(palette.ink, "#191d18");

  const svg = liftFigures(page).figures[0].svg;
  assert.equal(/#191c16|#e9ece2/.test(svg), false);
  assert.match(svg, /<rect width="100%" height="100%" fill="#fbfcf9"\/>/);
});

const QUOTED_FONT = `<style>
  :root { --mono: "IBM Plex Mono", ui-monospace, monospace; }
  .lbl { font-family: var(--mono); fill: #7d8877; }
</style><svg viewBox="0 0 10 10"><text class="lbl">A VIA NOVA</text></svg>`;

test("a font name in quotes does not break the attribute it lands in", () => {
  const svg = liftFigures(QUOTED_FONT).figures[0].svg;

  assert.match(svg, /font-family: &quot;IBM Plex Mono&quot;/);
  assert.equal(/=\s*"[^"]*"[^\s/>]/.test(svg), false);
});

test("every drawing lifted from a real page is well formed xml", async () => {
  const { spawnSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const found = spawnSync("xmllint", ["--version"], { encoding: "utf8" });
  if (found.error) return;

  const dir = mkdtempSync(join(tmpdir(), "leaf-figures-"));
  const pages = [QUOTED_FONT, PLAN_PAGE, `<figure>${DIAGRAM}</figure>`];

  pages.forEach((page, i) => {
    liftFigures(page).figures.forEach((figure, n) => {
      const file = join(dir, `p${i}-f${n}.svg`);
      writeFileSync(file, figure.svg);
      const said = spawnSync("xmllint", ["--noout", file], { encoding: "utf8" });
      assert.equal(said.status, 0, `${file}: ${said.stderr}`);
    });
  });
});
