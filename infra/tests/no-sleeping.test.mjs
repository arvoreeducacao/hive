import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(REPO, path), "utf8");

const boot = read("infra/docker/workspace-boot.sh");

const GONE = ["sentinel", "boot-mark", "shutdown-mark", "do-not-sleep", "activity.json"];

test("nothing in the boot watches for idleness any more", () => {
  for (const word of GONE) {
    assert.ok(!boot.includes(word), `the boot still carries ${word}`);
  }
});

test("the boot starts a server, not a watchman", () => {
  assert.doesNotMatch(boot, /sentinel/, "the boot still opens the watchman session");
  assert.match(read("server/server.mjs"), /broker\.seats\.restore\(\)/, "the server stopped bringing the seats back, and a nightly roll needs that");
  assert.match(read("server/server.mjs"), /keepTheSeatsWrittenDown\(broker\)/, "nothing writes the seats down when the box is asked to stop");
  assert.match(boot, /boot" >> \/workspace\/hive\/boot\.log/, "nothing writes the boot line the black box reads");
});

test("the doctor reads a boot, not a death", () => {
  const readings = read("app/doctor/doctor-readings.mjs");
  assert.match(readings, /export function checkLastBoot/);
  assert.doesNotMatch(readings, /violent-death|clean-shutdown|readablePeak/, "the doctor still reports on marks nothing writes");
  assert.doesNotMatch(readings, /the sleep schedule was not the cause/);
});

test("the app cannot put a pod to sleep", () => {
  const server = read("app/server.mjs");
  const action = server.slice(server.indexOf("async function podAction"), server.indexOf("const BODY_CEILING"));
  assert.ok(action.length > 0, "podAction moved and this test lost its subject");
  assert.doesNotMatch(action, /"sleep"/, "the app still offers to scale the server down to nothing");
  assert.match(action, /powerSwitch\("up"\)/, "the app lost the way to bring a server that is down back up");
});
