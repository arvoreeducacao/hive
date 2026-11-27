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

const WALL = cut("async function wallOfThisHost() {", "async function localStatus(name) {", "the wall of the cloud hosts");

function hive({ hosts, walls, server: hasServer = false, mine = hosts[0] }) {
  let reaching = mine;
  const seatHosts = new Map();
  const onHost = async (host, work) => {
    const before = reaching;
    reaching = host;
    try { return await work(); } finally { reaching = before; }
  };
  const onCloudSeats = async (how, leaf) => {
    const wall = walls[reaching];
    if (!wall) return { ok: false, error: `no server answers on ${reaching}` };
    if (leaf.startsWith("/wall")) return { ok: true, body: { seats: wall } };
    return { ok: true, body: { seats: Object.keys(wall).map((name) => ({ name })) } };
  };
  const made = new Function(
    "onCloudSeats", "cloudHosts", "onHost", "seatHosts", "currentHost", "urlServerAsked", "LINES",
    `${WALL}return { cloudWall, cloudSeatNames };`
  )(onCloudSeats, () => hosts, onHost, seatHosts, () => mine, () => hasServer, 120);
  return { ...made, seatHosts };
}

test("the chats of every host land on one wall, each carrying the host it runs on", async () => {
  const it = hive({ hosts: ["", "ada@devbox"], server: true, walls: { "": { poc: { screen: "a" } }, "ada@devbox": { fix: { screen: "b" } } } });
  const wall = await it.cloudWall();
  assert.deepEqual(Object.entries(wall.windows).map(([name, one]) => [name, one.host, one.screen]), [["poc", "", "a"], ["fix", "ada@devbox", "b"]]);
  assert.deepEqual(wall.ups, { "": true, "ada@devbox": true });
  assert.equal(it.seatHosts.get("fix"), "ada@devbox", "the next ask about that chat would not know which host to reach");
});

test("a host that is away costs its own chats only", async () => {
  const it = hive({ hosts: ["ada@devbox", "ada@gpu"], walls: { "ada@gpu": { train: {} } } });
  const wall = await it.cloudWall();
  assert.deepEqual(Object.keys(wall.windows), ["train"]);
  assert.deepEqual(wall.ups, { "ada@devbox": false, "ada@gpu": true });
  assert.equal(wall.up, true, "with only ssh hosts, one of them up is a cloud that works");
});

test("with a server that has an address, the wall says whether that server is up, not the hosts", async () => {
  const it = hive({ hosts: ["", "ada@devbox"], server: true, walls: { "ada@devbox": { fix: {} } } });
  const wall = await it.cloudWall();
  assert.equal(wall.up, false, "a sleeping pod passed for awake because an ssh host answered");
  assert.deepEqual(Object.keys(wall.windows), ["fix"]);
});

test("a name that two hosts both hold shows once, on the host listed first", async () => {
  const it = hive({ hosts: ["ada@devbox", "ada@gpu"], walls: { "ada@devbox": { same: { screen: "one" } }, "ada@gpu": { same: { screen: "two" } } } });
  const wall = await it.cloudWall();
  assert.equal(wall.windows.same.screen, "one");
  assert.equal(it.seatHosts.get("same"), "ada@devbox");
});

test("a new chat steps aside from the names of every host, so no two hosts hold the same one", async () => {
  const it = hive({ hosts: ["ada@devbox", "ada@gpu"], mine: "ada@gpu", walls: { "ada@devbox": { fix: {} }, "ada@gpu": { train: {} } } });
  const names = await it.cloudSeatNames();
  assert.equal(names.ok, true);
  assert.deepEqual(names.out.split("\n").sort(), ["fix", "train"]);
});

test("the names are unknown only when the host the chat is going to does not answer", async () => {
  const away = hive({ hosts: ["ada@devbox", "ada@gpu"], mine: "ada@gpu", walls: { "ada@devbox": { fix: {} } } });
  const blind = await away.cloudSeatNames();
  assert.equal(blind.ok, false);
  assert.match(blind.error, /ada@gpu/);
  const other = hive({ hosts: ["ada@devbox", "ada@gpu"], mine: "ada@devbox", walls: { "ada@devbox": { fix: {} } } });
  assert.deepEqual(await other.cloudSeatNames(), { ok: true, out: "fix", error: "" });
});

test("a chat going to a host that is not on the wall yet still asks that host for its names", async () => {
  const it = hive({ hosts: ["ada@devbox"], mine: "ada@new", walls: { "ada@devbox": { fix: {} }, "ada@new": { first: {} } } });
  const names = await it.cloudSeatNames();
  assert.deepEqual(names.out.split("\n").sort(), ["first", "fix"]);
});
