import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleIsStale, rebuildWhenStale } from "../lib/fresh-bundle.mjs";

function checkout({ bundleAt, sourceAt } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hive-bundle-"));
  mkdirSync(join(dir, "src/app"), { recursive: true });
  writeFileSync(join(dir, "src/app/boot.js"), "");
  writeFileSync(join(dir, "build.mjs"), "");
  const past = new Date("2026-09-01T00:00:00Z");
  utimesSync(join(dir, "build.mjs"), past, past);
  if (sourceAt) utimesSync(join(dir, "src/app/boot.js"), sourceAt, sourceAt);
  if (bundleAt) {
    mkdirSync(join(dir, "assets/dist"), { recursive: true });
    writeFileSync(join(dir, "assets/dist/hive.mjs"), "");
    utimesSync(join(dir, "assets/dist/hive.mjs"), bundleAt, bundleAt);
  }
  return dir;
}

test("a pull that touches the source leaves the page code stale", () => {
  assert.equal(bundleIsStale(checkout({ bundleAt: new Date("2026-09-20T00:00:00Z"), sourceAt: new Date("2026-09-30T00:00:00Z") })), true);
});

test("page code built after the source is fresh", () => {
  assert.equal(bundleIsStale(checkout({ bundleAt: new Date("2026-09-30T00:00:00Z"), sourceAt: new Date("2026-09-20T00:00:00Z") })), false);
});

test("a checkout that never built the page code is stale", () => {
  assert.equal(bundleIsStale(checkout()), true);
});

test("an app without its source is never rebuilt", () => {
  assert.equal(bundleIsStale(mkdtempSync(join(tmpdir(), "hive-packed-"))), false);
});

test("a stale bundle is rebuilt and a failed build only leaves a line in the log", async () => {
  const logged = [];
  assert.equal(await rebuildWhenStale("x", { stale: () => true, build: async () => {} }), true);
  assert.equal(await rebuildWhenStale("x", { stale: () => false, build: async () => { throw new Error("never"); } }), false);
  assert.equal(await rebuildWhenStale("x", { stale: () => true, build: async () => { throw new Error("esbuild is missing"); }, log: (line) => logged.push(line) }), false);
  assert.match(logged[0], /esbuild is missing/);
});
