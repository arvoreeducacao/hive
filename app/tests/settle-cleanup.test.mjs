import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInTree, seatSettled, settleCommandsFor, whenSeatSettles } from "../lib/settle-cleanup.mjs";
import { forgetErasedCache, readErased, rememberErased } from "../lib/erased.mjs";

const trees = [
  { path: "/w/main", repo: "oms-web", main: true },
  { path: "/w/oms-web-lote", repo: "oms-web", main: false },
  { path: "/w/api-x", repo: "api-acme", main: false }
];

test("the settle command runs only in the chat's own worktrees whose repository has one, and never in the cloud", () => {
  const commands = { "oms-web": "rm -rf .next" };
  assert.deepEqual(settleCommandsFor({ where: "local", trees }, commands), [{ dir: "/w/oms-web-lote", repo: "oms-web", command: "rm -rf .next" }]);
  assert.deepEqual(settleCommandsFor({ where: "cloud", trees }, commands), []);
  assert.deepEqual(settleCommandsFor({ where: "local", trees }, {}), []);
});

test("settling runs every step a piece registered, then the commands, and keeps what they printed", async () => {
  const home = mkdtempSync(join(tmpdir(), "hive-settle-"));
  const seen = [];
  const stop = whenSeatSettles(async (seat) => { seen.push(seat.name); });
  const ran = [];
  const said = await seatSettled({ name: "lote", where: "local", trees }, {
    commands: { "oms-web": "rm -rf .next" },
    home,
    run: async (job) => { ran.push(job.dir); return { ok: false, code: 3, out: "nope\n" }; },
    now: () => new Date("2026-11-23T12:00:00Z")
  });
  stop();
  assert.deepEqual(seen, ["lote"]);
  assert.deepEqual(ran, ["/w/oms-web-lote"]);
  assert.ok(said.includes("failed with code 3"));
  const log = readFileSync(join(home, "settle-cleanup", "lote.log"), "utf8");
  assert.match(log, /2026-11-23T12:00:00.000Z/);
  assert.match(log, /\$ rm -rf \.next/);
  assert.match(log, /nope/);
  rmSync(home, { recursive: true, force: true });
});

test("a command runs in its folder and says how it ended", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hive-settle-run-"));
  const ok = await runInTree({ dir, command: "pwd" });
  assert.equal(ok.ok, true);
  assert.match(ok.out, /hive-settle-run-/);
  const bad = await runInTree({ dir, command: "exit 7" });
  assert.deepEqual([bad.ok, bad.code], [false, 7]);
  rmSync(dir, { recursive: true, force: true });
});

test("a conversation deleted for good is remembered, so a copy that comes back never shows again", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-erased-"));
  rememberErased(home, ["11111111-2222-4333-8444-555555555555", "../etc", ""]);
  forgetErasedCache();
  assert.deepEqual([...readErased(home)], ["11111111-2222-4333-8444-555555555555"]);
  rmSync(home, { recursive: true, force: true });
  forgetErasedCache();
});
