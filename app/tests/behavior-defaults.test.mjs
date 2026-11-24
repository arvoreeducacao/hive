import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIRM_DEFAULTS, PACED_BEATS, confirmFor, effortBars, pacedMs, providerBeatMs } from "../assets/behavior-defaults.mjs";

test("with nothing chosen, only closing a chat or a terminal asks, as today", () => {
  assert.deepEqual(CONFIRM_DEFAULTS, { unpin: false, archive: false, closeChat: true, closeTerminal: true });
  assert.equal(confirmFor({}, "closeChat"), true);
  assert.equal(confirmFor(undefined, "archive"), false);
  assert.equal(confirmFor({ closeTerminal: false }, "closeTerminal"), false);
  assert.equal(confirmFor({ archive: true }, "archive"), true);
  assert.equal(confirmFor({}, "anything else"), true, "an action nobody listed keeps asking");
});

test("balanced keeps every beat at today's pace", () => {
  for (const name of PACED_BEATS) assert.equal(pacedMs("balanced", name, 8000), 8000);
  assert.equal(pacedMs("economy", "hive", 2500), 2500, "the beats that are not background work never change");
});

test("economy checks a third as often and waits for the charger; performance twice as often, with a floor", () => {
  assert.equal(pacedMs("economy", "prs", 60000), 180000);
  assert.equal(pacedMs("economy", "prs", 60000, { onBattery: true }), 0);
  assert.equal(pacedMs("performance", "prs", 60000), 30000);
  assert.equal(pacedMs("performance", "changes", 6000), 4000);
  assert.equal(pacedMs("performance", "changes", 6000, { onBattery: true }), 4000);
});

test("the agents' check follows the mode until a pace is chosen, and off stops it", () => {
  assert.equal(providerBeatMs("auto", "balanced"), 30000);
  assert.equal(providerBeatMs("auto", "economy"), 120000);
  assert.equal(providerBeatMs("auto", "performance"), 15000);
  assert.equal(providerBeatMs("5m", "performance"), 300000);
  assert.equal(providerBeatMs("off", "balanced"), 0);
});

test("the bars count the model's levels and light up to the one in use", () => {
  const levels = [{ value: "low" }, { value: "medium" }, { value: "high" }, { value: "xhigh" }, { value: "max" }];
  assert.deepEqual(effortBars(levels, "high"), { total: 5, lit: 3 });
  assert.deepEqual(effortBars(["low", "high"], "high"), { total: 2, lit: 2 });
  assert.deepEqual(effortBars(levels, "unknown"), { total: 5, lit: 0 });
  assert.deepEqual(effortBars(null, "high"), { total: 0, lit: 0 });
});
