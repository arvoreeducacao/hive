import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanFont, cleanPatch, FONT_DEFAULTS, CHAT_LINE_HEIGHT_RANGE, CHAT_SPACING_RANGE } from "../lib/config.mjs";
import { app, dom, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
const { $, fontFromPanel } = await app("core");
const { applyFonts } = await app("shared");
await app("themes");

const look = { sans: "Inter", mono: "Menlo", terminalSize: 13, chatLineHeight: 1.7, chatSpacing: 14 };

test("the chat keeps its old look when the config says nothing", () => {
  const problems = [];
  const font = cleanFont(undefined, "here", problems);
  assert.equal(font.chatLineHeight, FONT_DEFAULTS.chatLineHeight);
  assert.equal(font.chatSpacing, FONT_DEFAULTS.chatSpacing);
  assert.deepEqual(problems, []);
});

test("a line height and a spacing inside the range are kept", () => {
  const problems = [];
  const font = cleanFont({ chatLineHeight: 1.8, chatSpacing: 16 }, "here", problems);
  assert.equal(font.chatLineHeight, 1.8);
  assert.equal(font.chatSpacing, 16);
  assert.deepEqual(problems, []);
});

test("a spacing with decimals lands as whole pixels", () => {
  const problems = [];
  const font = cleanFont({ chatSpacing: 12.6 }, "here", problems);
  assert.equal(font.chatSpacing, 13);
  assert.deepEqual(problems, []);
});

test("values outside the range fall back to the default and say why", () => {
  const problems = [];
  const font = cleanFont({ chatLineHeight: 9, chatSpacing: -2 }, "here", problems);
  assert.equal(font.chatLineHeight, FONT_DEFAULTS.chatLineHeight);
  assert.equal(font.chatSpacing, FONT_DEFAULTS.chatSpacing);
  const [lineLow, lineHigh] = CHAT_LINE_HEIGHT_RANGE;
  const [gapLow, gapHigh] = CHAT_SPACING_RANGE;
  assert.deepEqual(problems, [
    `here: font.chatLineHeight should be a number between ${lineLow} and ${lineHigh}`,
    `here: font.chatSpacing should be a number between ${gapLow} and ${gapHigh}`
  ]);
});

test("a font patch carries the chat look with it", () => {
  const { clean, problems } = cleanPatch({ font: { chatLineHeight: 1.4, chatSpacing: 6 } });
  assert.equal(clean.font.chatLineHeight, 1.4);
  assert.equal(clean.font.chatSpacing, 6);
  assert.deepEqual(problems, []);
});

test("the page reads the chat look from the config variables", () => {
  assert.match(page, /\.sv-scroll \{[^}]*gap: var\(--chat-gap, 10px\)/);
  assert.match(page, /\.sv-msg \{[^}]*line-height: var\(--chat-line, 1\.55\)/);
  assert.match(page, /\.sv-user \{[^}]*line-height: var\(--chat-line, 1\.5\)/);
});

test("applying a font writes the chat look into those variables", () => {
  applyFonts(look);
  assert.equal(document.documentElement.style.getPropertyValue("--chat-line"), "1.7");
  assert.equal(document.documentElement.style.getPropertyValue("--chat-gap"), "14px");
});

test("the look panel offers both fields and reads them back into the font", () => {
  st.fontDefaults = { ...FONT_DEFAULTS, sans: "sans", mono: "mono" };
  $("f-sans").value = "";
  $("f-mono").value = "";
  $("f-term").value = "13";
  $("f-chat-line").value = "1.9";
  $("f-chat-gap").value = "7.4";
  const font = fontFromPanel();
  assert.equal(font.chatLineHeight, 1.9);
  assert.equal(font.chatSpacing, 7);
});

test("changing either field paints the new look right away", () => {
  const fetched = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  st.fontDefaults = { ...FONT_DEFAULTS, sans: "sans", mono: "mono" };
  st.fontPrefs = { ...look };
  try {
    for (const [id, value, name, want] of [["f-chat-line", "2.1", "--chat-line", "2.1"], ["f-chat-gap", "3", "--chat-gap", "3px"]]) {
      $(id).value = value;
      $(id).dispatchEvent(new dom.Event("change", { bubbles: true }));
      assert.equal(document.documentElement.style.getPropertyValue(name), want, `${id} did not reach the page`);
    }
  } finally {
    globalThis.fetch = fetched;
  }
});
