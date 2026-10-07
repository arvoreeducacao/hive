import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const a = server.indexOf("async function readHive(dev) {");
const b = server.indexOf("async function peerKeyOf(dev) {");
assert.ok(a >= 0 && b > a, "could not cut the visit out of server.mjs");
const VISIT = server.slice(a, b);

const EMPTY = { me: "", devs: [], at: 0 };

function visit({ dev = "joao", devs = [], calls = [] }) {
  const made = new Function("DEV", "emptyTeam", "teamCache", "readTeam",
    VISIT + "return { readHive };")(
      dev,
      () => EMPTY,
      { at: 0, data: devs.length ? { me: dev, devs, at: 1 } : null, running: false },
      async (force) => { calls.push(force); return { me: dev, devs, at: 2 }; }
    );
  return { ...made, calls };
}

test("visiting a hive that is up asks the server for a fresh board", async () => {
  const it = visit({ devs: [{ dev: "vitor", pod: "ws-vitor-0", up: true }] });
  const said = await it.readHive("vitor");

  assert.equal(said.at, 2, "the visit did not come back with a board");
  assert.deepEqual(it.calls, [true], "a hive that is up must be read fresh, not from the cache");
});

test("visiting a hive that is asleep or unknown settles for what is cached", async () => {
  const asleep = visit({ devs: [{ dev: "vitor", pod: "ws-vitor-0", up: false }] });
  await asleep.readHive("vitor");
  assert.deepEqual(asleep.calls, [false], "a sleeping hive does not deserve a round trip");

  const stranger = visit({ devs: [{ dev: "vitor", pod: "ws-vitor-0", up: true }] });
  await stranger.readHive("rafael");
  assert.deepEqual(stranger.calls, [false], "a name the board never mentioned does not deserve a round trip");
});

test("a machine that is nobody's hive has no team to visit", async () => {
  const it = visit({ dev: "", devs: [{ dev: "vitor", pod: "ws-vitor-0", up: true }] });
  assert.deepEqual(await it.readHive("vitor"), EMPTY);
  assert.deepEqual(it.calls, []);
});
