import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { liveServerRoot, peerEntry, peerModuleIn, shippedServerRoot } from "../engine/peer-module.mjs";

function machine({ shell = "abc123", tag = "", print = "", release = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "hive-peer-module-"));
  const shipped = join(root, "app");
  mkdirSync(shipped, { recursive: true });
  writeFileSync(join(shipped, "build.json"), JSON.stringify({ shell }));
  mkdirSync(join(root, "server", "peer"), { recursive: true });
  writeFileSync(join(root, "server", "peer", "peer-mcp.mjs"), "");
  writeFileSync(join(root, "server", "peer", "peer-mcp-live.mjs"), "");
  const home = join(root, "home");
  mkdirSync(join(home, "js"), { recursive: true });
  if (tag) writeFileSync(join(home, "js", "current.json"), JSON.stringify({ tag, print }));
  if (release) mkdirSync(join(home, "js", release, "server", "peer"), { recursive: true });
  if (release) writeFileSync(join(home, "js", release, "server", "peer", "peer-mcp.mjs"), "");
  return { root, shipped, home };
}

test("the release the app is running is where the peer module is read from", () => {
  const it = machine({ tag: "hive-2026.01.02-abcdef", print: "abc123", release: "hive-2026_01_02-abcdef" });
  const root = liveServerRoot({ shipped: it.shipped, home: it.home });
  assert.equal(root, join(it.home, "js", "hive-2026_01_02-abcdef", "server"));
  assert.equal(peerModuleIn(root), join(root, "peer", "peer-mcp.mjs"));
});

test("a release the update swept away is not named, so the seat falls back to the bundle", () => {
  const it = machine({ tag: "hive-2026.01.02-abcdef", print: "abc123" });
  assert.equal(liveServerRoot({ shipped: it.shipped, home: it.home }), "", "a directory that is gone must never be handed out");
});

test("a release built for another shell is left alone", () => {
  const it = machine({ tag: "hive-2026.01.02-abcdef", print: "other", release: "hive-2026_01_02-abcdef" });
  assert.equal(liveServerRoot({ shipped: it.shipped, home: it.home }), "");
});

test("a machine that never took an update reads nothing and says so", () => {
  const it = machine();
  assert.equal(liveServerRoot({ shipped: it.shipped, home: it.home }), "");
  assert.equal(liveServerRoot({}), "");
});

test("a seat is pointed at the entry the bundle carries, never at the release it is running from", () => {
  const it = machine();
  const here = join(it.home, "js", "hive-2026_01_02-abcdef", "server", "engine");
  const entry = peerEntry({ env: { HIVE_APP_SHIPPED: it.shipped }, here });
  assert.equal(entry, join(shippedServerRoot(it.shipped), "peer", "peer-mcp-live.mjs"));
  assert.ok(!entry.startsWith(join(it.home, "js")), "an update sweeps that directory while the seat is still alive");
});

test("a bundle that predates the stable entry still hands out a path the update cannot sweep", () => {
  const it = machine();
  rmSync(join(it.root, "server", "peer", "peer-mcp-live.mjs"));
  const here = join(it.home, "js", "hive-2026_01_02-abcdef", "server", "engine");
  const entry = peerEntry({ env: { HIVE_APP_SHIPPED: it.shipped }, here });
  assert.equal(entry, join(shippedServerRoot(it.shipped), "peer", "peer-mcp.mjs"));
});

test("a box with no bundle keeps reaching the module beside it", () => {
  const it = machine();
  const here = join(it.root, "server", "engine");
  assert.equal(peerEntry({ env: {}, here }), join(it.root, "server", "peer", "peer-mcp.mjs"));
});
