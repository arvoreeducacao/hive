import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LEAF_SCOPES,
  NO_LEAF,
  answerOf,
  authorizeUrl,
  canWrite,
  challengeOf,
  codeForm,
  consentUrl,
  docUrl,
  endpointsOf,
  heldOf,
  leafBase,
  leafSession,
  mcpUrl,
  newVerifier,
  refreshForm,
  registration,
  saidOf,
  stale,
  toolText
} from "../lib/leaf-link.mjs";

const LEAF = "https://leaf.example";

const META = {
  issuer: "https://leaf.example",
  authorization_endpoint: "https://leaf.example/api/auth/oauth2/authorize",
  token_endpoint: "https://leaf.example/api/auth/oauth2/token",
  registration_endpoint: "https://leaf.example/api/auth/oauth2/register"
};

const REDIRECT = "http://127.0.0.1:8899/leaf";

test("the address comes from the config, and there is no company in the code", () => {
  assert.equal(leafBase({}), "");
  assert.match(NO_LEAF, /not pointed at a leaf/);
  assert.equal(leafBase({ HIVE_LEAF_URL: "https://leaf.example/" }), LEAF);
  assert.equal(leafBase({ LEAF_URL: "http://localhost:3000/" }), "http://localhost:3000");
  assert.equal(mcpUrl(leafBase({ LEAF_URL: LEAF })), "https://leaf.example/api/mcp");
});

test("the hive registers as a public client, which is the only kind the leaf accepts", () => {
  const body = registration(REDIRECT);
  assert.equal(body.token_endpoint_auth_method, "none");
  assert.equal("client_secret" in body, false);
  assert.deepEqual(body.redirect_uris, [REDIRECT]);
  assert.deepEqual(body.grant_types, ["authorization_code", "refresh_token"]);
  assert.equal(body.scope, LEAF_SCOPES);
});

test("a leaf that announces no oauth server is refused, instead of half-configured", () => {
  assert.match(endpointsOf({}).error, /does not announce/);
  assert.match(endpointsOf({ authorization_endpoint: META.authorization_endpoint }).error, /does not announce/);
  assert.equal(endpointsOf(META).token, META.token_endpoint);
});

test("the consent link carries pkce, the resource and a state nobody can guess", () => {
  const asked = consentUrl({
    endpoints: endpointsOf(META),
    clientId: "cli_1",
    redirect: REDIRECT,
    resource: mcpUrl(LEAF)
  });
  const url = new URL(asked.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challengeOf(asked.verifier));
  assert.equal(url.searchParams.get("resource"), "https://leaf.example/api/mcp");
  assert.equal(url.searchParams.get("scope"), LEAF_SCOPES);
  assert.equal(url.searchParams.get("state"), asked.state);
  assert.ok(asked.state.length >= 32);
  assert.notEqual(newVerifier(), newVerifier());
});

test("an empty field never reaches the consent link as an empty parameter", () => {
  const url = new URL(authorizeUrl(endpointsOf(META), {
    clientId: "cli_1",
    redirect: REDIRECT,
    challenge: "c",
    state: "s",
    resource: ""
  }));
  assert.equal(url.searchParams.has("resource"), false);
});

test("the two token calls send what the leaf asks for, and nothing else", () => {
  const code = codeForm({ clientId: "cli_1", redirect: REDIRECT, code: "abc", verifier: "v", resource: "r" });
  assert.equal(code.get("grant_type"), "authorization_code");
  assert.equal(code.get("code_verifier"), "v");
  assert.equal(code.has("client_secret"), false);

  const again = refreshForm({ clientId: "cli_1", refresh: "r1" });
  assert.equal(again.get("grant_type"), "refresh_token");
  assert.equal(again.get("refresh_token"), "r1");
  assert.equal(again.has("resource"), false);
});

test("a refresh that comes back without a new refresh token keeps the one we hold", () => {
  const first = heldOf({ access_token: "a1", refresh_token: "r1", expires_in: 900, scope: LEAF_SCOPES }, {}, 1000);
  assert.equal(first.refresh, "r1");
  assert.equal(first.expiresAt, 1000 + 900000);

  const later = heldOf({ access_token: "a2", expires_in: 900 }, first, 2000);
  assert.equal(later.refresh, "r1");
  assert.equal(later.scopes, LEAF_SCOPES);
});

test("the token is treated as gone a minute before it actually expires", () => {
  const held = heldOf({ access_token: "a1", expires_in: 900 }, {}, 0);
  assert.equal(stale(held, 0), false);
  assert.equal(stale(held, 839000), false);
  assert.equal(stale(held, 840000), true);
  assert.equal(stale(null, 0), true);
  assert.equal(stale({ access: "", expiresAt: Infinity }, 0), true);
});

test("a token without the write scope says so, instead of failing at the first publish", () => {
  assert.equal(canWrite({ scopes: "leaf:read leaf:write offline_access" }), true);
  assert.equal(canWrite({ scopes: "leaf:read" }), false);
  assert.equal(canWrite({}), false);
});

test("the answer is read whether the leaf streams it or sends json", () => {
  const streamed = `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n`;
  assert.deepEqual(saidOf(streamed, "text/event-stream"), [{ jsonrpc: "2.0", id: 1, result: { ok: true } }]);
  assert.deepEqual(saidOf(streamed, ""), [{ jsonrpc: "2.0", id: 1, result: { ok: true } }]);
  assert.deepEqual(saidOf(`{"jsonrpc":"2.0","id":2,"result":1}`, "application/json"), [{ jsonrpc: "2.0", id: 2, result: 1 }]);
  assert.deepEqual(saidOf("not json", "application/json"), []);
});

test("an rpc error becomes a sentence, and a missing answer is not silence", () => {
  assert.match(answerOf([{ id: 1, error: { message: "no" } }], 1).error, /no/);
  assert.match(answerOf([], 1).error, /answered nothing/);
  assert.deepEqual(answerOf([{ id: 1, result: { a: 1 } }], 1).result, { a: 1 });
});

test("a tool that refuses hands back the leaf's own reason", () => {
  const busy = toolText({ isError: true, content: [{ type: "text", text: `{"error":"document_busy","message":"The document is being edited right now. Try again in a few seconds."}` }] });
  assert.match(busy.error, /being edited right now/);
  assert.deepEqual(toolText({ content: [{ type: "text", text: `{"id":"d1"}` }] }).said, { id: "d1" });
  assert.equal(toolText({ content: [{ type: "text", text: "plain" }] }).said, "plain");
});

test("the page address is the one a person can open", () => {
  assert.equal(docUrl(LEAF, "abc"), "https://leaf.example/doc/abc");
});

function leafOnATable(script) {
  const seen = [];
  const fetch = async (url, asked) => {
    const body = JSON.parse(asked.body);
    seen.push({ url, headers: asked.headers, body });
    const answer = script(body, seen.length);
    return {
      ok: answer.status ? answer.status < 400 : true,
      status: answer.status || 200,
      headers: { get: (name) => (answer.headers || {})[String(name).toLowerCase()] || null },
      text: async () => answer.text ?? JSON.stringify({ jsonrpc: "2.0", id: body.id, result: answer.result })
    };
  };
  return { seen, fetch };
}

test("the session keeps the id the leaf gives it, and sends it back on every call", async () => {
  const table = leafOnATable((body) => {
    if (body.method === "initialize") {
      return { headers: { "mcp-session-id": "s-1" }, result: { serverInfo: { name: "leaf" } } };
    }
    return { result: { content: [{ type: "text", text: `{"id":"doc_1"}` }] } };
  });
  const session = leafSession({ base: LEAF, token: "t", fetch: table.fetch });

  const opened = await session.open();
  assert.equal(opened.server.name, "leaf");
  assert.equal(session.session, "s-1");

  const made = await session.call("create_document", { title: "x" });
  assert.deepEqual(made.said, { id: "doc_1" });

  const last = table.seen[table.seen.length - 1];
  assert.equal(last.headers["mcp-session-id"], "s-1");
  assert.equal(last.headers.authorization, "Bearer t");
  assert.match(last.headers.accept, /text\/event-stream/);
  assert.equal(last.body.params.name, "create_document");
});

test("a refused token is a sentence, not a stack trace", async () => {
  const table = leafOnATable(() => ({ status: 401, text: "" }));
  const session = leafSession({ base: LEAF, token: "old", fetch: table.fetch });
  assert.match((await session.open()).error, /refused the token/);
});

test("being rate limited says to wait, because the leaf allows 60 calls a minute", async () => {
  const table = leafOnATable(() => ({ status: 429, text: "" }));
  const session = leafSession({ base: LEAF, token: "t", fetch: table.fetch });
  assert.match((await session.open()).error, /wait a minute/);
});

test("the tool list comes back as names, which is what the caller checks", async () => {
  const table = leafOnATable((body) => {
    if (body.method === "initialize") return { result: { serverInfo: {} } };
    return { result: { tools: [{ name: "create_document" }, { name: "update_document" }] } };
  });
  const session = leafSession({ base: LEAF, token: "t", fetch: table.fetch });
  await session.open();
  assert.deepEqual((await session.tools()).tools, ["create_document", "update_document"]);
});
