import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, state, views } from "./dom.mjs";
import { FONT_DEFAULTS, cleanPatch } from "../lib/config.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const st = await state();
await views();
const { reloadConfig } = await app("brand-face");
const { $, overrides } = await app("core");

const SETTLED = {
  font: FONT_DEFAULTS, sound: true, answered: false, sounds: {}, volume: 70,
  layout: "grid", blockSize: 4, autocompact: "auto", language: "en",
  pet: "off", brandFace: "auto", gaze: "screen", look: "classic",
  theme: "", themes: {}, dim: false, calm: false, composer: false,
  share: true, knocks: true, phone: false, machines: false, machine: "",
  shelf: "", avatar: "pebble/attentive/blue", providers: {}, wear: "", keys: {}
};

function answering(wrote, extra = {}) {
  const { clean, problems } = cleanPatch(wrote);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    config: { ...SETTLED, ...clean }, defaults: { font: FONT_DEFAULTS },
    file: "~/.hive/config.jsonc", has: { avatar: true, keys: true }, fromLegacy: false,
    error: "", ignored: problems.join(" · "), ...extra
  }) });
}

test("a value the app no longer knows falls back on its own and is reported apart", () => {
  const { clean, problems } = cleanPatch({ look: "v2", keys: { new: "off" } });
  assert.equal(clean.look, "classic");
  assert.deepEqual(clean.keys, { new: "off" });
  assert.deepEqual(problems, ["patch: look should be classic, dimension"]);
});

test("a line the app cannot use costs that line, not the shortcuts in the same file", async () => {
  answering({ look: "v2", keys: { new: "off" } });
  await reloadConfig();
  assert.deepEqual(overrides(), { new: "off" });
  assert.equal(st.configRead, true);
});

test("the panel names the line that was ignored, so the fallback is not a silence", () => {
  assert.equal($("cfg-ignored").hidden, false);
  assert.match($("cfg-ignored").textContent, /look should be classic, dimension/);
});

test("a file that cannot be read at all leaves the shortcuts already in hand alone", async () => {
  answering({ keys: {} }, { error: "~/.hive/config.jsonc: CloseBraceExpected at offset 40" });
  await reloadConfig();
  assert.deepEqual(overrides(), { new: "off" });
});

test("the panel drops the note once the file has nothing left to ignore", async () => {
  answering({ keys: { new: "off" } });
  await reloadConfig();
  assert.equal($("cfg-ignored").hidden, true);
  assert.equal($("cfg-ignored").textContent, "");
});

test("the server answers a file it cannot read apart from a field it cannot use", () => {
  assert.match(server, /const unreadable = \[main\.error, legacy\.error\]\.filter\(Boolean\);\n\s*const problems = \[\];/);
  assert.match(server, /error: unreadable\.join\(" · "\), ignored: problems\.join\(" · "\)/);
});

test("a patch the app refuses is not dressed as a file it could not read", () => {
  assert.match(server, /if \(problems\.length\) return \{ \.\.\.\(await readConfig\(\)\), refused: problems\.join\(" · "\) \};/);
});
