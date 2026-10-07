import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("there is no command line to install: the app and the server are the whole hive", () => {
  assert.ok(!existsSync(join(REPO, "cli")), "cli/ is back — whoever runs a hive should need nothing but the app and the server");
});

test("what the cli used to do lives where the app and the server can reach it", () => {
  for (const path of [
    "app/doctor/doctor.mjs",
    "app/doctor/doctor-core.mjs",
    "app/doctor/doctor-readings.mjs",
    "app/doctor/doctor-runner.mjs",
    "app/lib/pair.mjs",
    "server/seats.mjs",
    "server/engine/seat-command.mjs",
    "infra/scripts/release-notes.mjs"
  ]) {
    assert.ok(readFileSync(join(REPO, path), "utf8").length, `${path} is empty`);
  }
});
