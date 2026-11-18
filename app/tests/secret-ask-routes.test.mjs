import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSecretAsks } from "../lib/secret-asks.mjs";
import { registerSecretAskRoutes } from "../routes/secret-asks.mjs";

function door({ keep, placeOf } = {}) {
  const routes = new Map();
  let body = {};
  let n = 0;
  const secrets = createSecretAsks({ dir: join(mkdtempSync(join(tmpdir(), "secret-routes-")), "secrets"), keep, token: () => `id${++n}` });
  registerSecretAskRoutes((method, path, handler) => routes.set(`${method} ${path}`, handler), { bodyOf: async () => body, secrets, placeOf });
  const call = async (route, asked = {}, query = "") => {
    body = asked;
    let answer = null;
    await routes.get(route)({}, {}, new URL(`http://hive${route.split(" ")[1]}${query}`), (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  return { call, secrets };
}

test("the door opens a hub credential request with what the card shows: the key, whether it replaces, and the vault", async () => {
  const asked = [];
  const { call } = door({ keep: async () => ({ ok: true, kept: "file", reloaded: true }), placeOf: async (key) => { asked.push(key); return { replaces: true, vault: true }; } });
  const opened = await call("POST /api/secrets/ask", { seat: "a", label: "tracker", url: "https://tracker.example/tokens", envKey: " TRACKER_TOKEN " });
  assert.equal(opened.status, 200);
  assert.deepEqual(asked, ["TRACKER_TOKEN"]);
  assert.deepEqual(opened.value.ask, { id: "id1", seat: "a", label: "tracker", why: "", state: "pending", at: opened.value.ask.at, url: "https://tracker.example/tokens", envKey: "TRACKER_TOKEN", replaces: true, vault: true });
  const listed = await call("GET /api/secrets/pending");
  assert.deepEqual(listed.value.asks.map((one) => [one.envKey, one.url]), [["TRACKER_TOKEN", "https://tracker.example/tokens"]]);
});

test("the door waits for the hub to keep the value, passes the person's vault choice, and the seat reads the key and no path", async () => {
  const kept = [];
  const { call } = door({ keep: async (asked) => { kept.push(asked); return { ok: true, kept: asked.vault ? "vault" : "file", reloaded: true }; }, placeOf: async () => ({ replaces: false, vault: true }) });
  await call("POST /api/secrets/ask", { seat: "a", label: "tracker", envKey: "TRACKER_TOKEN" });
  const answered = await call("POST /api/secrets/answer", { id: "id1", value: "tok_1", vault: false });
  assert.equal(answered.status, 200);
  assert.equal(answered.value.ask.state, "saved");
  assert.deepEqual(kept, [{ key: "TRACKER_TOKEN", value: "tok_1", vault: false }]);
  const seen = await call("GET /api/secrets/ask", {}, "?id=id1&seat=a");
  assert.deepEqual([seen.value.ask.envKey, seen.value.ask.kept, seen.value.ask.reloaded, seen.value.ask.path], ["TRACKER_TOKEN", "file", true, ""]);
  assert.doesNotMatch(JSON.stringify([answered, seen]), /tok_1/);
});

test("the door answers 409 when the hub refuses the value, and 400 to a request it cannot open", async () => {
  const { call } = door({ keep: async () => ({ ok: false, error: "1Password did not answer" }) });
  await call("POST /api/secrets/ask", { seat: "a", label: "tracker", envKey: "TRACKER_TOKEN" });
  const refused = await call("POST /api/secrets/answer", { id: "id1", value: "tok_1" });
  assert.deepEqual(refused, { value: { error: "1Password did not answer" }, status: 409 });
  assert.equal((await call("POST /api/secrets/ask", { seat: "a", label: "x", url: "ftp://files.example" })).status, 400);
  assert.equal((await call("POST /api/secrets/ask", { seat: "a", label: "x", where: "cloud" })).status, 409);
});

test("a request with no key still ends in a private file", async () => {
  const { call } = door();
  await call("POST /api/secrets/ask", { seat: "a", label: "x" });
  const answered = await call("POST /api/secrets/answer", { id: "id1", value: "v" });
  assert.equal(answered.value.ask.state, "saved");
  const seen = await call("GET /api/secrets/ask", {}, "?id=id1&seat=a");
  assert.match(seen.value.ask.path, /a-id1$/);
});
