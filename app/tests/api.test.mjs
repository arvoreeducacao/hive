import { test } from "node:test";
import assert from "node:assert/strict";
import { api, apiGet, apiPost } from "../assets/api.mjs";

const serve = (r) => {
  globalThis.fetch = async () => r;
};

test("a get hands back the parsed body", async () => {
  serve({ ok: true, text: async () => '{"pages":[1,2]}' });
  assert.deepEqual(await apiGet("/api/artifacts"), { pages: [1, 2] });
});

test("an empty answer reads as an empty object, not as a parse error", async () => {
  serve({ ok: true, text: async () => "" });
  assert.deepEqual(await apiGet("/api/none"), {});
});

test("a post speaks json with the body on the wire", async () => {
  let sent = null;
  globalThis.fetch = async (path, opts) => { sent = { path, opts }; return { ok: true, text: async () => '{"done":true}' }; };
  const out = await apiPost("/api/say", { text: "oi" });
  assert.equal(sent.path, "/api/say");
  assert.equal(sent.opts.method, "POST");
  assert.equal(sent.opts.headers["content-type"], "application/json");
  assert.equal(sent.opts.body, '{"text":"oi"}');
  assert.deepEqual(out, { done: true });
});

test("a get carries no body headers", async () => {
  let sent = null;
  globalThis.fetch = async (path, opts) => { sent = opts; return { ok: true, text: async () => "" }; };
  await apiGet("/api/hive");
  assert.equal(sent.headers, undefined);
  assert.equal(sent.body, undefined);
});

test("a non-ok answer throws with the verb, the path and the status", async () => {
  serve({ ok: false, status: 429 });
  await assert.rejects(apiGet("/api/limits"), (err) => {
    assert.match(err.message, /GET \/api\/limits answered 429/);
    return true;
  });
});

test("the bare form takes a signal through", async () => {
  let sent = null;
  globalThis.fetch = async (path, opts) => { sent = opts; return { ok: true, text: async () => "{}" }; };
  const ctl = new AbortController();
  await api("/api/x", { signal: ctl.signal });
  assert.equal(sent.signal, ctl.signal);
});
