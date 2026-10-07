import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedSigners, brokerHome, hiveRoot, hubDir, isSeatNamedPipe, seatSockPath, sideOf, stateDir, workspaceRoot } from "../engine/paths.mjs";

test("the workspace root is /workspace here and whatever the host says elsewhere", () => {
  assert.equal(workspaceRoot({}), "/workspace");
  assert.equal(workspaceRoot({ HIVE_WORKSPACE: "/srv/hive" }), "/srv/hive");
  assert.equal(hiveRoot({ HIVE_WORKSPACE: "/srv/hive" }), "/srv/hive/hive");
});

test("a seat knows it is on a server by the root it was given, not by one written down", () => {
  assert.equal(sideOf("/srv/hive/hive", { HIVE_WORKSPACE: "/srv/hive" }), "cloud");
  assert.equal(sideOf("/workspace/hive", {}), "cloud");
  assert.equal(sideOf("/home/someone/.hive", {}), "local");
});

test("state still falls back to the home directory when no workspace is mounted", () => {
  assert.equal(stateDir({ HIVE_STATE_DIR: "/tmp/one" }), "/tmp/one");
  assert.equal(stateDir({ HIVE_HOME: "/tmp/two" }), "/tmp/two");
  assert.match(stateDir({ HIVE_WORKSPACE: "/nowhere-at-all" }), /\.hive$/);
});

test("what hangs off the root is worked out, not declared", () => {
  const mounted = { HIVE_STATE_DIR: "/srv/hive/hive" };
  assert.equal(brokerHome(mounted), "/srv/hive/hive/server");
  assert.equal(allowedSigners(mounted), "/srv/hive/hive/allowed_signers");
  assert.equal(hubDir({ HIVE_WORKSPACE: "/srv/hive" }), "/srv/hive/repos");
});

test("a host that spells a path out loud still wins", () => {
  assert.equal(brokerHome({ HIVE_BROKER_HOME: "/tmp/broker" }), "/tmp/broker");
  assert.equal(allowedSigners({ HIVE_ALLOWED_SIGNERS: "/tmp/signers" }), "/tmp/signers");
  assert.equal(hubDir({ HIVE_HUB: "/home/me/code" }), "/home/me/code");
  assert.equal(hubDir({ HIVE_MCP_HUB: "/older/name" }), "/older/name", "the older name has to keep working while pods carry it");
  assert.equal(hubDir({ HIVE_HUB: "/canonical", HIVE_MCP_HUB: "/older" }), "/canonical");
});

test("a seat's socket is a plain file everywhere but win32, which has no unix-socket file", () => {
  assert.equal(seatSockPath("/home/me/.hive", "meu-assento", "darwin"), "/home/me/.hive/sock/meu-assento.sock");
  assert.equal(isSeatNamedPipe(seatSockPath("/home/me/.hive", "meu-assento", "darwin")), false);
});

test("on win32 a seat's socket is a named pipe, which listen() can actually open", () => {
  const pipe = seatSockPath("C:\\Users\\alguem\\.hive", "meu-assento", "win32");
  assert.ok(isSeatNamedPipe(pipe), pipe);
  const outro = seatSockPath("C:\\Users\\alguem\\.hive", "outro-assento", "win32");
  assert.notEqual(pipe, outro, "two seats must not land on the same pipe");
});
