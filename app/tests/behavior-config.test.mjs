import { test } from "node:test";
import assert from "node:assert/strict";
import { BEHAVIOR_KEYS, behaviorHas, cleanBehavior, cleanBehaviorPatch, cleanConfirm, devicesForAgents } from "../lib/behavior-config.mjs";
import { cleanPatch } from "../lib/config.mjs";

test("a config that never names these settings reads as the hive of today", () => {
  const problems = [];
  assert.deepEqual(cleanBehavior({}, "config", problems), {
    effortStyle: "word",
    confirm: {},
    slashSkills: true,
    devices: true,
    deviceAgents: true,
    background: "balanced",
    providerCheck: "auto",
    textWriter: ""
  });
  assert.deepEqual(problems, []);
  assert.deepEqual(cleanBehavior(undefined, "config", problems).effortStyle, "word");
});

test("a value the hive does not know falls back to the default and says where", () => {
  const problems = [];
  const said = cleanBehavior({ effortStyle: "stars", background: "turbo", providerCheck: "2m", textWriter: "openrouter", slashSkills: "yes" }, "~/.hive/config.jsonc", problems);
  assert.equal(said.effortStyle, "word");
  assert.equal(said.background, "balanced");
  assert.equal(said.providerCheck, "auto");
  assert.equal(said.textWriter, "");
  assert.equal(said.slashSkills, true);
  assert.equal(problems.length, 5);
  assert.ok(problems.every((one) => one.startsWith("~/.hive/config.jsonc: ")));
});

test("confirm keeps only the four actions, and only true or false", () => {
  const problems = [];
  assert.deepEqual(cleanConfirm({ unpin: true, archive: false, closeChat: "no", wipe: true }, "config", problems), { unpin: true, archive: false });
  assert.equal(problems.length, 2);
  assert.deepEqual(cleanConfirm([true], "config", []), {});
});

test("a patch carries only the settings it names, cleaned, through the config patch", () => {
  assert.deepEqual(cleanBehaviorPatch({ background: "economy", other: 1 }, []), { background: "economy" });
  const { clean, problems } = cleanPatch({ confirm: { closeChat: false }, textWriter: "codex", devices: false });
  assert.deepEqual(problems, []);
  assert.deepEqual(clean, { confirm: { closeChat: false }, textWriter: "codex", devices: false });
  assert.deepEqual(cleanPatch({ effortStyle: "dots" }).problems.length, 1);
});

test("has says which of them the file really holds", () => {
  const has = behaviorHas({ effortStyle: "bars" });
  assert.equal(has.effortStyle, true);
  assert.equal(has.confirm, false);
  assert.deepEqual(Object.keys(has), BEHAVIOR_KEYS);
});

test("agents reach the devices only while both switches are on", () => {
  assert.equal(devicesForAgents({}), true);
  assert.equal(devicesForAgents({ devices: false }), false);
  assert.equal(devicesForAgents({ deviceAgents: false }), false);
});

test("the default each card resets to is the default the config file reads", async () => {
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
  const said = (id) => html.match(new RegExp(`id="${id}"[^>]*data-default="([^"]*)"`))?.[1];
  const defaults = cleanBehavior({}, "config", []);
  assert.equal(said("f-effort-style"), defaults.effortStyle);
  assert.equal(said("f-background"), defaults.background);
  assert.equal(said("f-provider-check"), defaults.providerCheck);
  assert.equal(said("f-text-writer"), defaults.textWriter);
  assert.equal(said("t-slash-skills"), String(defaults.slashSkills));
  assert.equal(said("t-devices"), String(defaults.devices));
  assert.equal(said("t-device-agents"), String(defaults.deviceAgents));
  const { CONFIRM_DEFAULTS } = await import("../assets/behavior-defaults.mjs");
  assert.equal(said("t-confirm-unpin"), String(CONFIRM_DEFAULTS.unpin));
  assert.equal(said("t-confirm-archive"), String(CONFIRM_DEFAULTS.archive));
  assert.equal(said("t-confirm-close-chat"), String(CONFIRM_DEFAULTS.closeChat));
  assert.equal(said("t-confirm-close-terminal"), String(CONFIRM_DEFAULTS.closeTerminal));
});
