import { test } from "node:test";
import assert from "node:assert/strict";
import { socketPathFor, isNamedPipe, readsAsStale, SUN_PATH_CEILING } from "../lib/doorstep.mjs";

test("a short home keeps the socket next to the state", () => {
  assert.equal(socketPathFor({ home: "/Users/alguem/.hive", platform: "darwin" }), "/Users/alguem/.hive/hive.sock");
});

test("a home too long for the system falls back instead of being truncated in silence", () => {
  const longo = "/private/tmp/" + "x".repeat(140);
  const escolhido = socketPathFor({ home: longo, platform: "darwin", short: "/var/tmp" });
  assert.ok(!escolhido.startsWith(longo), "it kept a path the operating system would cut");
  assert.ok(Buffer.byteLength(escolhido) <= SUN_PATH_CEILING);
  assert.match(escolhido, /^\/var\/tmp\/hive-[0-9a-f]{12}\.sock$/);
});

test("two hubs with long homes do not land on the same socket", () => {
  const um = socketPathFor({ home: "/private/tmp/" + "a".repeat(140), short: "/var/tmp", platform: "darwin" });
  const dois = socketPathFor({ home: "/private/tmp/" + "b".repeat(140), short: "/var/tmp", platform: "darwin" });
  assert.notEqual(um, dois);
});

test("windows gets a named pipe, which has no path ceiling", () => {
  const pipe = socketPathFor({ home: "C:\\Users\\alguem\\.hive", platform: "win32", hub: "C:\\hub" });
  assert.ok(isNamedPipe(pipe), pipe);
  assert.equal(isNamedPipe("/Users/alguem/.hive/hive.sock"), false);
});

test("only a dead owner reads as stale", () => {
  for (const code of ["ECONNREFUSED", "ENOENT", "ENOTSOCK", "ECONNRESET"]) {
    assert.ok(readsAsStale({ code }), `${code} should read as a dead owner`);
  }
  for (const code of ["EACCES", "ETIMEDOUT", undefined]) {
    assert.equal(readsAsStale({ code }), false, `${code} must never be swept — it is not proof the owner died`);
  }
});
