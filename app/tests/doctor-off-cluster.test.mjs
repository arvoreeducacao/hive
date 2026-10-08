import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCloudSessions, checkGh, checkHubContext, checkHubContract, checkMcpEnv, checkSigners } from "../doctor/doctor-readings.mjs";

const offCluster = { onACluster: false, dev: "ana" };
const onCluster = { onACluster: true, dev: "ana", pod: "ws-ana" };

test("a server reached at its address is not asked for what only a hosted deployment keeps", () => {
  assert.equal(checkSigners("", offCluster).state, "skip");
  assert.equal(checkCloudSessions("{}", offCluster).state, "skip");
  assert.equal(checkHubContext("", offCluster).state, "skip");
  assert.equal(checkHubContract("", offCluster).state, "skip");
  assert.equal(checkMcpEnv("gateway-down", offCluster).state, "skip");
});

test("a pod on a cluster is still held to its allowed_signers and its MCP gateway", () => {
  assert.equal(checkSigners("", onCluster).state, "fail");
  assert.equal(checkMcpEnv("gateway-down", onCluster).state, "fail");
});

test("a server you host yourself is told to log gh in through docker, not through a power switch it does not have", () => {
  const fix = checkGh("not logged in", offCluster).fix;
  assert.equal(fix.command, "docker compose exec -it hive gh auth login");
  assert.doesNotMatch(fix.command, /power switch/);
});
