import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function cut(from, to, what) {
  const a = server.indexOf(from);
  const b = server.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${what} out of server.mjs`);
  return server.slice(a, b);
}

const DOOR = cut('let doorComplaint = "";', "/* the new-chat box asks", "the cloud door");
const SEAT = cut("async function seatThroughServer(ws, {", '\nprocess.on("exit"', "the seat wiring");

function hive({ found, remote = { where: "cloud", client: {} }, url = "https://hive-ada.hive.example" }) {
  const said = [];
  return new Function(
    "findCloudServer", "NO_ADDRESS", "readHiveEnvConfig", "existsSync", "readFileSync", "writeFileSync",
    "HIVE_ENV_CONFIG", "servers", "streamFor", "attachSeat", "desk", "console", "deploymentScript",
    `${DOOR}${SEAT}return { serverFor, seatThroughServer };`
  )(
    async () => found,
    "this hive has no server address — put one in HIVE_SERVER_URL",
    () => (url ? { HIVE_SERVER_URL: url } : {}),
    () => false,
    () => "",
    () => {},
    "/tmp/config",
    { remote: async () => remote },
    () => ({}),
    () => ({ command() {}, stop() {} }),
    null,
    { log: (line) => said.push(line) },
    (name) => `deploy/scripts/${name}`
  );
}

function refusal(hived, where = "cloud") {
  return new Promise((done) => {
    hived.seatThroughServer({ on() {} }, { where, name: "poc", from: 0, refuse: done });
  });
}

test("a seat that cannot be reached carries the reason the door gave, and the address it tried", async () => {
  const it = hive({ found: { url: "", key: "", error: "getaddrinfo ENOTFOUND hive-ada.hive.example" } });
  const said = await refusal(it);
  assert.match(said, /getaddrinfo ENOTFOUND hive-ada\.hive\.example/);
  assert.match(said, /https:\/\/hive-ada\.hive\.example/, "the refusal never says which address went unanswered");
  assert.doesNotMatch(said, /this hive has no server for that side yet/);
});

test("a door that answers but names no key is a reason too, not silence", async () => {
  const it = hive({ found: { url: "https://hive-ada.hive.example", key: "" }, remote: null });
  const said = await refusal(it);
  assert.match(said, /named no key I can sign for/);
});

test("with no address written down, the refusal says exactly what is missing", async () => {
  const it = hive({ found: { url: "", key: "", error: "no address" }, url: "" });
  const said = await refusal(it);
  assert.match(said, /HIVE_SERVER_URL/, "a hive that was never given an address is told to go looking for a name instead");
});

test("the local side keeps its own line — no door of ours is involved", async () => {
  const it = hive({ found: { url: "", key: "", error: "getaddrinfo ENOTFOUND" } });
  const said = await refusal(it, "local");
  assert.equal(said, "this hive has no server for that side yet");
});

test("a door that comes back stops complaining about the time it was down", async () => {
  const it = hive({ found: { url: "https://hive-ada.hive.example", key: "SHA256:k" } });
  assert.ok(await it.serverFor(), "the door answered, so there is a server");
  const seat = await new Promise((done) => {
    it.seatThroughServer({ on() {} }, { where: "cloud", name: "poc", from: 0, refuse: (why) => done(`refused: ${why}`) });
    setTimeout(() => done("attached"), 20);
  });
  assert.equal(seat, "attached");
});
