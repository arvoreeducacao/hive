import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { clusterIsWanted, serverIsWanted } from "../lib/env.mjs";
import { CLUSTER, NOWHERE, OVER_HTTP, createReach } from "../lib/cloud-reach.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const server = readFileSync(resolve(REPO, "app/server.mjs"), "utf8");

const cut = (from, to) => {
  const a = server.indexOf(from);
  const b = server.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of app/server.mjs`);
  return server.slice(a, b);
};

test("with nothing configured, the app wants neither a server nor a cluster", () => {
  assert.equal(serverIsWanted({}, {}), false);
  assert.equal(clusterIsWanted({}, {}), false);
  assert.equal(serverIsWanted({ HIVE_DEV: "ada", HIVE_HUB: "/somewhere" }, {}), false,
    "installing and naming yourself must not, on its own, ask for a server");
  assert.equal(clusterIsWanted({ HIVE_DEV: "ada", HIVE_HUB: "/somewhere" }, {}), false);
});

test("a seat on this machine is opened by tmux here, never through a cluster and never through a server", () => {
  const opening = cut("async function newChat(", "async function bindSeatSession(");
  assert.match(opening, /if \(where === "cloud"\) \{\n\s+const opened = await onCloudSeats\("POST"/, "a cloud seat stopped going through the door");
  assert.match(opening, /\} else \{\n\s+await seatInATmuxWindow\(/, "the local side stopped going straight to tmux on this machine");
  assert.doesNotMatch(opening, /kubectl/, "opening a seat reaches for the cluster again");

  const typing = cut("async function typeText(", "let canopyLive");
  assert.match(typing, /await sh\(TMUX, \["send-keys"/, "typing into a seat on this machine stopped going straight to tmux");
  assert.doesNotMatch(typing, /kubectl/, "typing into a seat reaches for the cluster again");
});

test("the terminal only looks for a server when the tile is a cloud one", () => {
  const handler = cut("wss.on(\"connection\", async (ws, req) => {", "const SERVER_CANDIDATES");
  const reaching = handler.indexOf("cloudReach.terminal");
  assert.ok(reaching > 0, "the terminal stopped reaching for a server at all");
  assert.match(handler.slice(0, reaching), /if \(where === "cloud" \|\| root\)/,
    "the terminal reaches for a server without first checking where the tile lives");
  assert.match(handler, /return pipeTmux\(ws, session, cols, rows, name\)/,
    "a local tile stopped falling through to tmux on this machine");
  assert.match(server, /pty\.spawn\(TMUX, \["attach", "-t", session\]/,
    "the local terminal stopped attaching to tmux on this machine");
  assert.doesNotMatch(handler, /kubectl/, "the terminal shells into a cluster again");
});

test("with no server and no cluster, reaching the cloud says so instead of half working", async () => {
  const alone = createReach({ cluster: null, serverFor: async () => null });
  assert.equal(await alone.how(), NOWHERE);
  assert.match((await alone.putFile("/x", Buffer.from("a"))).error, /no server/);
  assert.match((await alone.terminal({ seat: "a", cols: 80, rows: 24 })).error, /no server/);
});

test("a hive with a server reaches over http, and one with only a cluster still reaches", async () => {
  const client = { post: async () => ({ ok: true, body: {} }), get: async () => ({ ok: true, body: { data: "" } }), terminalUrl: () => "wss://x" };
  assert.equal(await createReach({ cluster: null, serverFor: async () => ({ client }) }).how(), OVER_HTTP);
  assert.equal(await createReach({ cluster: { putFile: async () => ({}), getFile: async () => ({}) }, serverFor: async () => null }).how(), CLUSTER);
});
