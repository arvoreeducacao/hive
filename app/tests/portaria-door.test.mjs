import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const a = server.indexOf("let openPairing = null;");
const b = server.indexOf("function invalidatePod() {");
assert.ok(a >= 0 && b > a, "could not cut the door out of server.mjs");
const DOOR = server.slice(a, b);

const NOW = Date.now();
const DAY = 86400000;

function door({ devices, peers, invites, used, phones = [], calls = [], up = true, codeUntil = NOW + 300000, cloud = true, bridgeError = "" }) {
  const client = {
    get: async (path) => {
      calls.push(["GET", path, null]);
      if (path === "/api/devices") return { ok: true, body: { devices } };
      if (path === "/api/peers") return { ok: true, body: { peers, me: { url: "https://pod-joao", fingerprint: "SHA256:me" } } };
      if (path === "/api/invites") return { ok: true, body: { invites, used } };
      return { ok: false, error: "no such route" };
    },
    post: async (path, payload) => {
      calls.push(["POST", path, payload]);
      if (path === "/api/invites") return { ok: true, body: { link: "hive://join?at=https%3A%2F%2Fpod-joao&key=k&token=t", expiresAt: NOW + 7 * DAY } };
      if (path === "/api/devices/revoke") return { ok: true, body: { revoked: true } };
      if (path === "/api/invites/cancel") return { ok: true, body: { cancelled: true } };
      if (path === "/api/peers/forget") return { ok: true, body: { forgotten: true } };
      if (path === "/api/join") return payload?.link ? { ok: true, body: { joined: true, peer: { name: "vitor" } } } : { ok: false, error: "that is not a link I can read" };
      return { ok: false, error: "the server said no" };
    }
  };
  const bridge = {
    openCode: async () => { calls.push(["BRIDGE", "openCode", null]); return bridgeError ? { error: bridgeError } : { code: "KRQ7F2MJ", expiresAt: codeUntil }; },
    devices: async () => { calls.push(["BRIDGE", "devices", null]); return bridgeError ? { error: bridgeError, devices: [] } : { devices: phones }; },
    revoke: async (fingerprint) => { calls.push(["BRIDGE", "revoke", fingerprint]); return { revoked: true }; },
    state: () => ({ enrolled: true, host: "https://pod-joao/sync", running: true, following: ["a-seat"], why: "" }),
    tick: async () => ({ running: true })
  };
  const written = [];
  const made = new Function("serverFor", "phoneBridge", "writeConfig", "servers",
    DOOR + "return { portariaState, portariaDo, portariaDoor };")(
      async (where) => (up && (where !== "cloud" || cloud) ? { client, where } : null),
      bridge,
      async (patch) => { written.push(patch); return {}; },
      { identity: { fingerprint: "SHA256:mac" } });
  return { ...made, calls, written };
}

const phone = (extra = {}) => ({ fingerprint: "SHA256:phone", name: "iPhone de João", kind: "phone", pairedAt: NOW - 22 * DAY, lastSeen: NOW, online: true, revokedAt: 0, ...extra });
const mac = { fingerprint: "SHA256:mac", name: "este mac", kind: "mac", pairedAt: NOW, lastSeen: NOW, revoked: false };
const base = (extra = {}) => ({ devices: [mac], phones: [phone()], peers: [], invites: [], used: [], ...extra });

test("the door reads devices, phones, people and invites in one breath", async () => {
  const it = door(base());
  const said = await it.portariaState();
  assert.deepEqual(said.devices.map((one) => one.kind), ["mac", "phone"]);
  assert.equal(said.me.url, "https://pod-joao");
  assert.deepEqual(it.calls.filter(([verb]) => verb === "GET").map(([, path]) => path).sort(), ["/api/devices", "/api/invites", "/api/peers"]);
  assert.ok(it.calls.some(([verb, what]) => verb === "BRIDGE" && what === "devices"), "the phones come from the sync door, not from the server roster");
});

test("a phone row says whether it is reading right now, and never claims to be this machine", async () => {
  const said = await door(base()).portariaState();
  const row = said.devices.find((one) => one.kind === "phone");
  assert.equal(row.online, true);
  assert.equal(row.here, false);
  assert.equal(row.fromFile, false);
  assert.equal(row.name, "iPhone de João");
});

test("a device that was taken out never comes back on the list", async () => {
  const it = door(base({ devices: [{ ...mac, revoked: true }] }));
  const said = await it.portariaState();
  assert.deepEqual(said.devices.map((one) => one.kind), ["phone"]);
});

test("when the phones cannot be listed the screen says why, and the rest still paints", async () => {
  const said = await door(base({ bridgeError: "no server to pair the phone with" })).portariaState();
  assert.deepEqual(said.devices.map((one) => one.kind), ["mac"]);
  assert.equal(said.phone.error, "no server to pair the phone with");
});

test("pairing asks the sync door for the code, turns the phone switch on, and the code stays on the screen until it is closed", async () => {
  const it = door(base());
  const opened = await it.portariaDo("pair", {});
  assert.equal(opened.code, "KRQ7F2MJ");
  assert.equal((await it.portariaState()).pairing.code, "KRQ7F2MJ");
  assert.deepEqual(it.written, [{ phone: true }], "pairing a phone has to turn on the switch that lets the chats travel");
  assert.equal(it.calls.some(([, path]) => path === "/api/pair/open"), false, "the phone code must not come from the server roster any more");
  await it.portariaDo("unpair", {});
  assert.equal((await it.portariaState()).pairing, null);
});

test("a code that has run out of time is not shown as if it were still good", async () => {
  const it = door(base({ codeUntil: NOW - 1000 }));
  const opened = await it.portariaDo("pair", {});
  assert.equal(opened.code, "KRQ7F2MJ");
  assert.equal((await it.portariaState()).pairing, null, "an expired code is still on the screen");
});

test("when the sync door cannot mint a code the reason comes back instead of a code", async () => {
  const said = await door(base({ bridgeError: "could not enroll this machine" })).portariaDo("pair", {});
  assert.match(said.error, /could not enroll/);
});

test("revoking a phone goes through the sync door; revoking a machine goes to the server", async () => {
  const it = door(base());
  await it.portariaDo("revoke", { fingerprint: "SHA256:phone" });
  assert.ok(it.calls.some(([verb, what, who]) => verb === "BRIDGE" && what === "revoke" && who === "SHA256:phone"));
  assert.equal(it.calls.some(([, path]) => path === "/api/devices/revoke"), false, "a phone was sent to the server roster, which does not know it");
  await it.portariaDo("revoke", { fingerprint: "SHA256:other-mac" });
  assert.deepEqual(it.calls.find(([, path]) => path === "/api/devices/revoke")[2], { fingerprint: "SHA256:other-mac" });
});

test("each button carries its own payload to the server, and nothing else", async () => {
  const it = door(base());
  await it.portariaDo("forget", { fingerprint: "SHA256:vitor" });
  await it.portariaDo("cancel", { link: "hive://join?at=https%3A%2F%2Fpod-joao&key=k&token=t" });
  const posts = it.calls.filter(([verb]) => verb === "POST");
  assert.deepEqual(posts.find(([, path]) => path === "/api/peers/forget")[2], { fingerprint: "SHA256:vitor" });
  assert.deepEqual(posts.find(([, path]) => path === "/api/invites/cancel")[2], { link: "hive://join?at=https%3A%2F%2Fpod-joao&key=k&token=t" });
});

test("the invite hands back the link the server minted", async () => {
  const said = await door(base()).portariaDo("invite", {});
  assert.equal(said.link, "hive://join?at=https%3A%2F%2Fpod-joao&key=k&token=t");
});

test("a button nobody wrote is refused instead of guessed", async () => {
  const said = await door(base()).portariaDo("nonsense", {});
  assert.match(said.error, /no such thing/);
  assert.match((await door(base()).portariaDo("build", {})).error, /no such thing/, "the phone build button is gone with the phone app");
});

test("with no server anywhere the screen says so instead of painting an empty room", async () => {
  const it = door(base({ up: false }));
  assert.match((await it.portariaState()).error, /no server answered/);
  assert.match((await it.portariaDo("pair", {})).error, /no server answered/);
});

test("there is one door only, and it is the one that faces outward", async () => {
  const it = door(base());
  const said = await it.portariaState();
  assert.equal(said.door, "cloud", "the screen is managing a door that is not the server's");
  assert.equal((await it.portariaDoor()).where, "cloud");
});

test("with no server there is no door left on this machine", async () => {
  const it = door(base({ up: false }));
  assert.equal((await it.portariaDoor()).where, "", "the machine at home offered itself as a door again");
  assert.equal((await it.portariaDoor()).server, null);
});

test("a peer never shows up among the devices, and never goes missing either", async () => {
  const withPeer = base({
    devices: [mac, { fingerprint: "SHA256:sozinho", name: "peer", kind: "peer", pairedAt: 0, lastSeen: 0, revoked: false }],
    peers: []
  });
  const said = await door(withPeer).portariaState();
  assert.deepEqual(said.devices.map((one) => one.kind), ["mac", "phone"], "a peer was counted as a device of mine");
  assert.equal(said.peers.length, 1, "the peer vanished instead of moving to the people half");
  assert.equal(said.peers[0].fromFile, true, "a key the peers list does not know came from the signers file");
});

test("a peer the two lists both know is shown once, as someone who came in", async () => {
  const both = base({
    devices: [mac, { fingerprint: "SHA256:vitor", name: "vitor", kind: "peer", pairedAt: NOW - 3600000, lastSeen: NOW, revoked: false }],
    peers: [{ fingerprint: "SHA256:vitor", name: "vitor", knownAt: NOW - 3600000 }]
  });
  const said = await door(both).portariaState();
  assert.equal(said.peers.length, 1);
  assert.equal(said.peers[0].fromFile, false);
});

test("a link someone sent me goes in, and the door never claims it is my own machine", async () => {
  const it = door(base());
  const said = await it.portariaDo("join", { link: "hive://join?at=https%3A%2F%2Fpod-vitor&key=k&token=t" });
  assert.equal(said.joined, true);
  assert.equal(said.peer.name, "vitor");
  const sent = it.calls.find(([verb, path]) => verb === "POST" && path === "/api/join");
  assert.deepEqual(sent[2], { link: "hive://join?at=https%3A%2F%2Fpod-vitor&key=k&token=t" }, "joining someone else must not carry the mine flag");
});

test("going in with nothing pasted is refused before it reaches the server", async () => {
  const it = door(base());
  const said = await it.portariaDo("join", { link: "   " });
  assert.match(said.error, /no link/);
  assert.equal(it.calls.some(([, path]) => path === "/api/join"), false, "an empty link still knocked on the server");
});

test("only the machine you are on says it is the machine you are on", async () => {
  const other = { fingerprint: "SHA256:other-mac", name: "joao", kind: "mac", pairedAt: NOW - DAY, lastSeen: NOW - 3600000, revoked: false };
  const said = await door(base({ devices: [mac, other] })).portariaState();
  assert.equal(said.devices.find((one) => one.fingerprint === "SHA256:mac").here, true);
  assert.equal(said.devices.find((one) => one.fingerprint === "SHA256:other-mac").here, false, "both machines claimed to be this one");
});

test("a key only the trust file knows does not pose as a machine that came in", async () => {
  const fromFile = { fingerprint: "SHA256:only-in-the-file", name: "joao", kind: "mac", pairedAt: 0, lastSeen: 0, revoked: false };
  const said = await door(base({ devices: [mac, fromFile] })).portariaState();
  const row = said.devices.find((one) => one.fingerprint === "SHA256:only-in-the-file");
  assert.equal(row.fromFile, true, "a key that never came in was showing up as just another machine");
  assert.equal(row.here, false);
  assert.equal(said.devices.find((one) => one.fingerprint === "SHA256:mac").fromFile, false, "the machine that really paired must not be mistaken for a key from the file");
});
