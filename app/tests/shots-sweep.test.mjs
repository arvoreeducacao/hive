import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SHOTS_DAYS, measureShots, shotsDaysOf, staleShots, sweepShots } from "../lib/shots-sweep.mjs";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-09-21T12:00:00Z");

const aged = (dir, name, days) => {
  const path = join(dir, name);
  writeFileSync(path, "x".repeat(10));
  const at = new Date(now - days * DAY);
  utimesSync(path, at, at);
  return path;
};

test("a shot older than seven days is stale, a younger one is kept", () => {
  const files = [{ name: "old.png", at: now - 8 * DAY }, { name: "new.png", at: now - 6 * DAY }];
  assert.deepEqual(staleShots(files, { now }), ["old.png"]);
});

test("zero days switches the sweep off", () => {
  assert.deepEqual(staleShots([{ name: "old.png", at: 0 }], { now, days: 0 }), []);
});

test("the days come from HIVE_SHOTS_DAYS, and a bad value falls back to seven", () => {
  assert.equal(shotsDaysOf({}), SHOTS_DAYS);
  assert.equal(shotsDaysOf({ HIVE_SHOTS_DAYS: "3" }), 3);
  assert.equal(shotsDaysOf({ HIVE_SHOTS_DAYS: "0" }), 0);
  assert.equal(shotsDaysOf({ HIVE_SHOTS_DAYS: "never" }), SHOTS_DAYS);
});

test("the sweep walks every chat folder, removes only the stale files and says how much it freed", async () => {
  const root = mkdtempSync(join(tmpdir(), "shots-"));
  mkdirSync(join(root, "a"));
  mkdirSync(join(root, "b"));
  const old = aged(join(root, "a"), "old.png", 9);
  const fresh = aged(join(root, "a"), "fresh.png", 1);
  const older = aged(join(root, "b"), "older.png", 30);
  const said = await sweepShots([root], { now });
  assert.deepEqual(said.gone.sort(), [old, older].sort());
  assert.equal(said.freed, 20);
  assert.ok(existsSync(fresh));
  assert.ok(!existsSync(old));
});

test("measuring counts the chats that still hold something, the files and the bytes", async () => {
  const root = mkdtempSync(join(tmpdir(), "shots-"));
  mkdirSync(join(root, "a"));
  mkdirSync(join(root, "empty"));
  aged(join(root, "a"), "one.png", 1);
  aged(join(root, "a"), "two.png", 1);
  assert.deepEqual(await measureShots(root), { chats: 1, files: 2, bytes: 20 });
});
