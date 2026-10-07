import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");

test("the seat is probed before the socket file is removed", () => {
  const probe = driver.indexOf("await seatAnswers()");
  const wipe = driver.indexOf("await rm(sockFile, { force: true });");
  assert.ok(probe > 0, "driver.mjs never probes the seat");
  assert.ok(wipe > probe, "the driver wipes the socket before checking whether a live driver holds it");
});

test("a driver that finds the seat taken leaves it alone", () => {
  const guard = driver.slice(driver.indexOf("if (existsSync(sockFile)"), driver.indexOf("await rm(sockFile, { force: true });"));
  assert.match(guard, /process\.exit\(ANOTHER_DRIVER_OWNS_THE_SEAT\)/);
  assert.doesNotMatch(guard, /rm\(sockFile/);
});

async function probeOf(sockFile) {
  const source = driver.slice(driver.indexOf("function seatAnswers()"), driver.indexOf("if (existsSync(sockFile)"));
  const { connect } = await import("node:net");
  return new Function("connect", "sockFile", `${source}; return seatAnswers;`)(connect, sockFile)();
}

test("a seat with a live driver reads as taken", async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-seat-"));
  const sockFile = join(home, "seat.sock");
  const held = createServer(() => {});
  await new Promise((up) => held.listen(sockFile, up));
  try {
    assert.equal(await probeOf(sockFile), true);
  } finally {
    await new Promise((down) => held.close(down));
    await rm(home, { recursive: true, force: true });
  }
});

test("a socket file nobody listens on reads as free", async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-seat-"));
  const sockFile = join(home, "stale.sock");
  const held = createServer(() => {});
  await new Promise((up) => held.listen(sockFile, up));
  await new Promise((down) => held.close(down));
  await writeFile(sockFile, "").catch(() => {});
  try {
    assert.equal(await probeOf(sockFile), false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
