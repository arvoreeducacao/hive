import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();
const { svEvent, mcpAuthenticate: cardSignIn, loadMcpBody } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { svConvFlushAll } = await app("conversation-model");
const signIn = await app("mcp-sign-in");

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5));
    svConvFlushAll();
  }
};

const until = async (ready, limit = 15000) => {
  const end = Date.now() + limit;
  while (!ready() && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 50));
    svConvFlushAll();
  }
};

let next = 0;

function chat(agent = "claude") {
  const e = getStructured({ name: `mcp-signin-${++next}`, where: "local", agent });
  document.body.appendChild(e.host);
  const asked = [];
  let mcp = [];
  e.ws = {
    readyState: 1,
    send(raw) {
      const cmd = JSON.parse(raw);
      asked.push(cmd);
      const reply = cmd.op === "mcp" ? { ok: true, data: mcp } : cmd.op === "mcpReconnect" ? { ok: true, data: [{ name: cmd.server, status: "connected" }] } : { ok: false };
      const done = e.pending.get(cmd.cid);
      e.pending.delete(cmd.cid);
      done?.(reply);
    }
  };
  return { e, asked, status: (list) => { mcp = list; } };
}

const notices = (e) => [...e.host.querySelectorAll(".sv-mcp-signin")];

const init = (servers, extra = {}) => ({ type: "system", subtype: "init", session_id: "s1", agent: "claude", mcp_servers: servers, ...extra });

test("a server that needs a sign-in at init shows one notice with its name and a Sign in button", async () => {
  const { e } = chat();
  svEvent(e, init([{ name: "linear", status: "needs-auth" }, { name: "hive", status: "connected" }]));
  await settle();
  const shown = notices(e);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].querySelector(".nm").textContent, "MCP server linear needs a sign-in");
  assert.equal(shown[0].querySelector(".ds").textContent, "The linear MCP server needs a sign-in before the agent can use it.");
  assert.equal(shown[0].querySelector("button.auth").textContent, "Sign in");
  assert.equal(shown[0].getAttribute("aria-label"), "MCP server linear needs a sign-in");
});

test("the same server is announced once per session, and again in a new session", async () => {
  const { e } = chat();
  svEvent(e, init([{ name: "linear", status: "needs-auth" }]));
  svEvent(e, init([{ name: "linear", status: "needs-auth" }]));
  await settle();
  assert.equal(notices(e).length, 1);
  svEvent(e, init([{ name: "linear", status: "needs-auth" }], { session_id: "s2" }));
  await settle();
  assert.equal(notices(e).length, 2);
});

test("claude.ai connectors are signed in on claude.ai, so they never get a notice", async () => {
  const { e, asked } = chat();
  svEvent(e, init([{ name: "claude.ai Gmail", status: "needs-auth" }, { name: "claude.ai Drive", status: "pending" }]));
  await settle();
  assert.equal(notices(e).length, 0);
  assert.equal(asked.filter((one) => one.op === "mcp").length, 0, "a pending claude.ai connector is not worth asking about");
});

test("a replayed init paints nothing", async () => {
  const { e } = chat();
  svEvent(e, init([{ name: "linear", status: "needs-auth" }], { replayed: true }));
  await settle();
  assert.equal(notices(e).length, 0);
});

test("a server still connecting at init is asked about later, and announced if it ends up needing a sign-in", async () => {
  signIn.MCP_LOOKS_AFTER.splice(0, signIn.MCP_LOOKS_AFTER.length, 5, 5, 5);
  const { e, asked, status } = chat();
  status([{ name: "notion", status: "needs-auth" }, { name: "claude.ai Gmail", status: "needs-auth" }]);
  svEvent(e, init([{ name: "notion", status: "pending" }]));
  assert.equal(notices(e).length, 0);
  await settle();
  assert.equal(asked.filter((one) => one.op === "mcp").length, 1);
  assert.deepEqual(notices(e).map((one) => one.dataset.server), ["notion"]);
});

test("a Codex chat lists no servers at init, so it asks the driver once per session", async () => {
  signIn.MCP_LOOKS_AFTER.splice(0, signIn.MCP_LOOKS_AFTER.length, 5, 5, 5);
  const { e, asked, status } = chat("codex");
  status([{ name: "figma", status: "needs-auth" }]);
  svEvent(e, { type: "system", subtype: "init", session_id: "t1", agent: "codex" });
  svEvent(e, { type: "system", subtype: "init", session_id: "t1", agent: "codex" });
  await settle();
  assert.equal(asked.filter((one) => one.op === "mcp").length, 1);
  assert.deepEqual(notices(e).map((one) => one.dataset.server), ["figma"]);
});

test("the /mcp card and the notice sign in through the same flow", () => {
  assert.ok(cardSignIn === signIn.mcpAuthenticate);
});

test("Sign in runs the sign-in, shows the paste box, then turns into the line the /mcp card prints", { timeout: 45000 }, async () => {
  const { e, asked } = chat();
  const calls = [];
  const polls = [{ state: "running", url: "https://login.example/authorize" }, { state: "done" }];
  const before = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).startsWith("/api/mcp/login")) return { ok: false, json: async () => ({}) };
    calls.push({ url: String(url), method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
    const said = options.method === "POST" ? { state: "running" } : polls.shift() || { state: "done" };
    return { ok: true, json: async () => said };
  };
  try {
    svEvent(e, init([{ name: "linear", status: "needs-auth" }]));
    await settle();
    const notice = notices(e)[0];
    const button = notice.querySelector("button.auth");
    button.click();
    await settle();
    assert.deepEqual(calls[0], { url: "/api/mcp/login", method: "POST", body: { name: e.name, server: "linear", where: "local" } });
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, "waiting for the browser…");
    await until(() => notice.querySelector(".auth-paste input"));
    assert.ok(notice.querySelector(".auth-paste input"), "the paste box shows once the login page is known");
    assert.equal(notice.querySelector(".auth-link").getAttribute("href"), "https://login.example/authorize");
    const input = notice.querySelector(".auth-paste input");
    input.value = "http://localhost:4711/callback?code=abc";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    assert.deepEqual(calls.find((one) => one.body?.redirect), { url: "/api/mcp/login", method: "POST", body: { name: e.name, server: "linear", redirect: "http://localhost:4711/callback?code=abc" } });
    await until(() => notices(e).length === 0 && e.host.querySelector(".sv-meta"));
    assert.equal(notices(e).length, 0, "the notice is gone once the server is signed in");
    assert.ok(asked.some((one) => one.op === "mcpReconnect" && one.server === "linear"));
    const lines = [...e.host.querySelectorAll(".sv-meta")].map((one) => one.textContent);
    assert.ok(lines.includes("linear authenticated — its tools answer in this seat now"), lines.join(" | "));
  } finally {
    globalThis.fetch = before;
  }
});

test("a sign-in that does not start puts the button back and says why", async () => {
  const { e } = chat();
  const before = globalThis.fetch;
  globalThis.fetch = async (url) => ({ ok: true, json: async () => (String(url).startsWith("/api/mcp/login") ? { error: "missing seat or server" } : {}) });
  try {
    svEvent(e, init([{ name: "linear", status: "needs-auth" }]));
    await settle();
    const notice = notices(e)[0];
    const button = notice.querySelector("button.auth");
    button.focus();
    button.click();
    await until(() => !button.disabled && notice.querySelector(".er").textContent);
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, "Sign in");
    assert.equal(notice.querySelector(".er").textContent, "missing seat or server");
    assert.ok(document.activeElement === button);
  } finally {
    globalThis.fetch = before;
  }
});

test("the /mcp card offers the same sign-in on a server that needs one", async () => {
  const { e, status } = chat();
  status([{ name: "linear", status: "needs-auth" }]);
  const card = document.createElement("div");
  card.className = "sv-cmd";
  const body = document.createElement("div");
  card.appendChild(body);
  e.host.appendChild(card);
  await loadMcpBody(e, body, () => {});
  const row = body.querySelector(".mcp-row");
  assert.ok(row.querySelector("button.auth"));
  const calls = [];
  const before = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (!String(url).startsWith("/api/mcp/login")) return { ok: false, json: async () => ({}) };
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, json: async () => ({ error: "no" }) };
  };
  try {
    row.querySelector("button.auth").click();
    await settle();
    assert.deepEqual(calls[0], { url: "/api/mcp/login", body: { name: e.name, server: "linear", where: "local" } });
    assert.equal(row.querySelector(".er").textContent, "no");
    assert.equal(row.querySelector("button.auth").textContent, "authenticate");
  } finally {
    globalThis.fetch = before;
  }
});
