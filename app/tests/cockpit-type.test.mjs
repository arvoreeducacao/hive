import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanFont, cleanPatch, COCKPIT_PIXEL_CHOICES, FONT_DEFAULTS } from "../lib/config.mjs";
import { app, dom, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(HERE, path), "utf8");
const cockpitCss = read("assets/structures/cockpit.css");

const st = await state();
const { $, fontFromPanel } = await app("core");
const { applyFonts } = await app("shared");
await app("themes");

const look = { ...FONT_DEFAULTS, sans: "Inter", mono: "Menlo" };

const option = (select, value) => {
  const one = document.createElement("option");
  one.value = value;
  select.append(one);
};

for (const [id, values] of [["f-ck-even", ["off", "on"]], ["f-ck-strong", ["off", "on"]], ["f-ck-pixel", COCKPIT_PIXEL_CHOICES]]) {
  if (!$(id).options.length) for (const value of values) option($(id), value);
}

test("the cockpit keeps its text as it was when the config says nothing", () => {
  const problems = [];
  const font = cleanFont(undefined, "here", problems);
  assert.equal(font.cockpitEven, false);
  assert.equal(font.cockpitStrong, false);
  assert.equal(font.cockpitPixel, "off");
  assert.deepEqual(problems, []);
});

test("the three cockpit choices are kept, and a wrong one falls back and says why", () => {
  const kept = [];
  const font = cleanFont({ cockpitEven: true, cockpitStrong: true, cockpitPixel: "cozette" }, "here", kept);
  assert.deepEqual([font.cockpitEven, font.cockpitStrong, font.cockpitPixel], [true, true, "cozette"]);
  assert.deepEqual(kept, []);
  const refused = [];
  const wrong = cleanFont({ cockpitEven: "yes", cockpitPixel: "comic" }, "here", refused);
  assert.deepEqual([wrong.cockpitEven, wrong.cockpitPixel], [false, "off"]);
  assert.deepEqual(refused, [
    "here: font.cockpitEven should be true or false",
    `here: font.cockpitPixel should be ${COCKPIT_PIXEL_CHOICES.join(", ")}`
  ]);
});

test("a font patch carries the cockpit choices into the file", () => {
  const { clean, problems } = cleanPatch({ font: { cockpitEven: true, cockpitPixel: "departure" } });
  assert.equal(clean.font.cockpitEven, true);
  assert.equal(clean.font.cockpitStrong, false);
  assert.equal(clean.font.cockpitPixel, "departure");
  assert.deepEqual(problems, []);
});

test("applying a font marks the body with each cockpit choice, and turning it off takes the mark away", () => {
  applyFonts({ ...look, cockpitEven: true, cockpitStrong: true, cockpitPixel: "departure" });
  const root = document.body;
  assert.equal(root.classList.contains("ck-even"), true);
  assert.equal(root.classList.contains("ck-strong"), true);
  assert.equal(root.dataset.ckPixel, "departure");
  applyFonts(look);
  assert.equal(root.classList.contains("ck-even"), false);
  assert.equal(root.classList.contains("ck-strong"), false);
  assert.equal(root.dataset.ckPixel, undefined);
});

test("the look panel reads the three choices back into the font", () => {
  st.fontDefaults = { ...FONT_DEFAULTS, sans: "sans", mono: "mono" };
  $("f-ck-even").value = "on";
  $("f-ck-strong").value = "off";
  $("f-ck-pixel").value = "cozette";
  const font = fontFromPanel();
  assert.deepEqual([font.cockpitEven, font.cockpitStrong, font.cockpitPixel], [true, false, "cozette"]);
});

test("picking a pixel font in the panel reaches the page at once", () => {
  const fetched = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  st.fontDefaults = { ...FONT_DEFAULTS, sans: "sans", mono: "mono" };
  st.fontPrefs = { ...look };
  try {
    $("f-ck-pixel").value = "departure";
    $("f-ck-pixel").dispatchEvent(new dom.Event("change", { bubbles: true }));
    assert.equal(document.body.dataset.ckPixel, "departure");
  } finally {
    globalThis.fetch = fetched;
    applyFonts(look);
  }
});

test("the cockpit text reads its size, spacing, line, font, ink and stroke from variables", () => {
  assert.match(cockpitCss, /#structure-root\.ck \{ --ck-font: var\(--mono\); --ck-size: 12px; --ck-small: 11px; --ck-track: \.01em;/);
  assert.match(cockpitCss, /\.ck-host \.sv \{ font-family: var\(--ck-font\); font-size: var\(--ck-size\); line-height: var\(--ck-line\); letter-spacing: var\(--ck-track\);/);
  assert.doesNotMatch(cockpitCss, /var\(--chat-line, 1\.55\)\)?;?[^\n]*font-size: 12px/);
  assert.doesNotMatch(cockpitCss, /letter-spacing: \.01em;[^\n]*var\(--ck-font\)/);
});

test("the code in an answer follows the cockpit font too, and keeps its own line height until a pixel font asks for whole pixels", () => {
  assert.match(cockpitCss, /\.ck-host \.sv-msg code \{[^}]*font-family: var\(--ck-font\); font-size: var\(--ck-size\);/);
  assert.match(cockpitCss, /\.ck-host \.sv-msg \.md-code \{ font-family: var\(--ck-font\); font-size: var\(--ck-size\); line-height: var\(--ck-code-line\); \}/);
  assert.match(cockpitCss, /--ck-code-line: 1\.5;/);
});

test("each choice only moves the variables, and a pixel font lands on whole pixels", () => {
  assert.match(cockpitCss, /body\.experience-raycast\.ck-even\[data-structure="cockpit"\] #structure-root\.ck \{ --ck-track: 0; --ck-line: round\(calc\(var\(--ck-size\) \* 1\.5\), 1px\); \}/);
  assert.match(cockpitCss, /body\.experience-raycast\.ck-strong\[data-structure="cockpit"\] #structure-root\.ck \{ --ck-ink: var\(--txt\); --ck-stroke: \.2px; \}/);
  assert.match(cockpitCss, /body\.experience-raycast\[data-ck-pixel="departure"\]\[data-structure="cockpit"\] #structure-root\.ck \{ --ck-font: "Departure Mono", var\(--mono\); --ck-size: 11px; --ck-small: 11px; --ck-track: 0; --ck-line: 17px; --ck-code-line: 17px; --ck-stroke: 0; \}/);
  assert.match(cockpitCss, /body\.experience-raycast\[data-ck-pixel="cozette"\]\[data-structure="cockpit"\] #structure-root\.ck \{ --ck-font: "Cozette Vector", var\(--mono\); --ck-size: 13px; --ck-small: 13px; --ck-track: 0; --ck-line: 20px; --ck-code-line: 20px; --ck-stroke: 0; \}/);
});

test("both pixel fonts ship with the app, are served, and carry their licence", () => {
  const faces = read("assets/experience.css");
  const server = readFileSync(join(HERE, "server.mjs"), "latin1");
  const licence = read("assets/fonts/LICENSE.md");
  for (const [family, file] of [["Departure Mono", "departuremono-regular.woff2"], ["Cozette Vector", "cozettevector.woff2"]]) {
    assert.ok(existsSync(join(HERE, "assets/fonts", file)), `${file} is missing`);
    assert.match(faces, new RegExp(`font-family: "${family}";[^}]*url\\("/assets/fonts/${file.replace(".", "\\.")}"\\)`));
    assert.ok(server.includes(`"/assets/fonts/${file}": ["assets/fonts/${file}", "font/woff2"]`), `${file} is not served`);
  }
  assert.match(licence, /### Departure Mono[\s\S]*SIL Open Font License/);
  assert.match(licence, /### Cozette[\s\S]*MIT License/);
});
