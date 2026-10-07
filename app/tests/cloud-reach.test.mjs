import { test } from "node:test";
import assert from "node:assert/strict";

import { CLUSTER, NOWHERE, OVER_HTTP, createReach, reachAsked } from "../lib/cloud-reach.mjs";

const clusterThatWorks = (kept = []) => ({
  putFile: async (path, body) => { kept.push(["put", path, Buffer.from(body).toString()]); return { ok: true, path }; },
  getFile: async (path) => { kept.push(["get", path]); return { ok: true, path, body: Buffer.from("from the cluster") }; }
});

const serverThatAnswers = (seen = []) => ({
  client: {
    post: async (path, payload) => { seen.push(["post", path, payload]); return { ok: true, body: { path: payload.path } }; },
    get: async (path) => { seen.push(["get", path]); return { ok: true, body: { data: Buffer.from("from the server").toString("base64") } }; },
    terminalUrl: ({ seat, cols, rows }) => `wss://server/terminal?seat=${seat}&cols=${cols}&rows=${rows}&signature=x`
  }
});

test("a server that answers is the way in, and the cluster is what is left when none does", async () => {
  const overHttp = createReach({ cluster: clusterThatWorks(), serverFor: async () => serverThatAnswers() });
  assert.equal(await overHttp.how(), OVER_HTTP);

  const noServer = createReach({ cluster: clusterThatWorks(), serverFor: async () => null });
  assert.equal(await noServer.how(), CLUSTER);

  const neither = createReach({ cluster: null, serverFor: async () => null });
  assert.equal(await neither.how(), NOWHERE);
});

test("a server that throws on the way is the same as no server", async () => {
  const reach = createReach({ cluster: clusterThatWorks(), serverFor: async () => { throw new Error("the door is shut"); } });
  assert.equal(await reach.how(), CLUSTER);
});

test("being told which way to go settles it, even when the other one would answer", async () => {
  const toCluster = createReach({ cluster: clusterThatWorks(), serverFor: async () => serverThatAnswers(), asked: CLUSTER });
  assert.equal(await toCluster.how(), CLUSTER);

  const toHttp = createReach({ cluster: clusterThatWorks(), serverFor: async () => null, asked: OVER_HTTP });
  assert.equal(await toHttp.how(), NOWHERE, "told to go over http and given no server, it does not quietly use the cluster");
});

test("what the person asked for is read from the environment, and nonsense is not an answer", () => {
  assert.equal(reachAsked({ HIVE_REACH: "http" }), OVER_HTTP);
  assert.equal(reachAsked({ HIVE_REACH: "CLUSTER" }), CLUSTER);
  assert.equal(reachAsked({ HIVE_REACH: "sideways" }), "");
  assert.equal(reachAsked({}, { HIVE_REACH: "cluster" }), CLUSTER);
  assert.equal(reachAsked({}, {}), "");
});

test("a file goes over http as base64, and comes back as bytes", async () => {
  const seen = [];
  const reach = createReach({ cluster: null, serverFor: async () => serverThatAnswers(seen) });

  const put = await reach.putFile("/workspace/hive/assets/a.png", Buffer.from("a picture"));
  assert.equal(put.ok, true);
  assert.deepEqual(seen[0], ["post", "/api/file", { path: "/workspace/hive/assets/a.png", data: Buffer.from("a picture").toString("base64") }]);

  const got = await reach.getFile("/workspace/hive/assets/a.png");
  assert.equal(got.body.toString(), "from the server");
  assert.match(seen[1][1], /^\/api\/file\?path=%2Fworkspace/, "the path was not escaped into the query");
});

test("the same two calls reach the cluster untouched when that is the way", async () => {
  const kept = [];
  const reach = createReach({ cluster: clusterThatWorks(kept), serverFor: async () => null });
  await reach.putFile("/workspace/hive/assets/a.png", Buffer.from("a picture"));
  assert.deepEqual(kept[0], ["put", "/workspace/hive/assets/a.png", "a picture"]);
  assert.equal((await reach.getFile("/workspace/x")).body.toString(), "from the cluster");
});

test("with nowhere to reach, both say so instead of pretending", async () => {
  const reach = createReach({ cluster: null, serverFor: async () => null });
  assert.match((await reach.putFile("/x", Buffer.from("a"))).error, /no server to put that on/);
  assert.match((await reach.getFile("/x")).error, /no server to read that from/);
  assert.match((await reach.terminal({ seat: "a", cols: 80, rows: 24 })).error, /no server to open a terminal on/);
});

test("a terminal is a signed address or nothing — the cluster never carries one", async () => {
  const overHttp = createReach({ cluster: null, serverFor: async () => serverThatAnswers() });
  const opened = await overHttp.terminal({ seat: "a-seat", cols: 90, rows: 30 });
  assert.equal(opened.how, OVER_HTTP);
  assert.match(opened.url, /^wss:\/\/server\/terminal\?seat=a-seat&cols=90&rows=30&signature=/);

  const onCluster = createReach({ cluster: clusterThatWorks(), serverFor: async () => null });
  assert.match((await onCluster.terminal({ seat: "a-seat", cols: 90, rows: 30 })).error, /no server to open a terminal on/);
});
