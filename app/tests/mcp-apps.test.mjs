import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { svToolCard, svToolResult } = await app("subagents-dock");
const { getStructured } = await app("chat-stretches");
const { svConvSeed } = await app("conversation-model");
const { svEvent } = await app("chat-and-panes");
const { createAppHost } = await app("mcp-apps");
const { appPolicy } = await app("page-dress");

const APP = "7c2f4e1a-5b3d-4e8f-9a6c-2d1b0e3f4a5b";
const META = { id: APP, server: "metabase", tool: "sales_by_region", title: "Vendas por região", resourceUri: "ui://sales/app.html", csp: { connectDomains: ["https://api.example.com"], resourceDomains: ["https://cdn.example.com"] }, prefersBorder: true, toolUseId: "toolu_app", input: { month: "2026-10" }, result: { content: [{ type: "text", text: "rows" }], structuredContent: { rows: [1] } } };
const fetched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  if (String(url).includes("part=meta")) return { ok: true, status: 200, json: async () => META };
  if (String(url).includes(APP)) return { ok: true, status: 200, text: async () => "<!doctype html><p>app</p>" };
  return { ok: false, status: 404, text: async () => "" };
};
after(() => { globalThis.fetch = realFetch; });

const settle = async () => { for (let hop = 0; hop < 4; hop++) await new Promise((done) => setTimeout(done, 10)); };

function seatOf(name, answers) {
  st.data = { sessions: [{ name, where: "local", state: "idle" }], spawning: [] };
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  e.sent = [];
  e.typed = [];
  e.type = (text) => e.typed.push(text);
  e.ws = {
    readyState: 1,
    send: (raw) => {
      const cmd = JSON.parse(raw);
      e.sent.push(cmd);
      const reply = answers(cmd);
      setTimeout(() => e.pending.get(cmd.cid)?.(reply), 0);
    }
  };
  document.body.appendChild(e.host);
  return e;
}

function hostFor(overrides = {}) {
  const posted = [];
  const host = createAppHost({
    hostContext: () => ({ theme: "dark", displayMode: "inline", availableDisplayModes: ["inline", "fullscreen"] }),
    toolCall: { arguments: { month: "2026-10" }, result: { content: [], structuredContent: { rows: [1] } } },
    post: (message) => posted.push(message),
    callTool: async () => ({ content: [] }),
    readResource: async () => ({ contents: [] }),
    openLink: async () => {},
    sendMessage: async () => {},
    requestDisplayMode: async (mode) => mode,
    onSize: () => {},
    onTeardown: () => {},
    ...overrides
  });
  return { host, posted };
}

test("the host answers initialize, then hands the app the tool's input and result once it says it is ready", async () => {
  const { host, posted } = hostFor();
  host.receive({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: { protocolVersion: "2026-01-26", appCapabilities: {} } });
  assert.equal(posted[0].id, 1);
  assert.equal(posted[0].result.protocolVersion, "2026-01-26");
  assert.equal(posted[0].result.hostInfo.name, "hive");
  assert.ok(posted[0].result.hostCapabilities.serverTools);
  assert.equal(posted.length, 1, "nothing of the call goes out before the app is ready");
  host.receive({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
  host.receive({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });
  assert.deepEqual(posted.slice(1).map((one) => one.method), ["ui/notifications/tool-input", "ui/notifications/tool-result"]);
  assert.deepEqual(posted[1].params, { arguments: { month: "2026-10" } });
  assert.deepEqual(posted[2].params.structuredContent, { rows: [1] });
});

test("the host refuses what the protocol does not allow and what it does not know", async () => {
  const { host, posted } = hostFor();
  host.receive({ jsonrpc: "2.0", id: 2, method: "ui/update-model-context", params: {} });
  host.receive({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "", arguments: {} } });
  host.receive({ jsonrpc: "2.0", id: 4, method: "ui/open-link", params: { url: "javascript:alert(1)" } });
  host.receive({ jsonrpc: "2.0", id: 5, method: "ui/message", params: { role: "assistant", content: [{ type: "text", text: "hi" }] } });
  host.receive({ jsonrpc: "2.0", id: 6, method: "ui/open-link", params: { url: "file:///etc/hosts" } });
  host.receive({ jsonrpc: "1.0", id: 7, method: "ping" });
  assert.deepEqual(posted.map((one) => [one.id, one.error?.code]), [[2, -32601], [3, -32602], [4, -32602], [5, -32602], [6, -32602]]);
});

test("a failed host action reaches the app as an error of the same request", async () => {
  const { host, posted } = hostFor({ callTool: async () => { throw new Error("Declined by the person."); } });
  host.receive({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "save_card", arguments: {} } });
  await settle();
  assert.deepEqual(posted, [{ jsonrpc: "2.0", id: 9, error: { code: -32000, message: "Declined by the person." } }]);
});

test("the app policy reaches only the domains the app declared, over secure addresses, and never frames", () => {
  const policy = appPolicy({ connectDomains: ["https://api.example.com", "http://plain.example.com", "https://x.com; script-src *"], resourceDomains: ["https://cdn.example.com"] });
  assert.match(policy, /connect-src https:\/\/api\.example\.com;/);
  assert.match(policy, /script-src 'unsafe-inline' 'unsafe-eval' data: blob: https:\/\/cdn\.example\.com;/);
  assert.doesNotMatch(policy, /plain\.example|x\.com|\*/);
  assert.match(policy, /frame-src 'none'/);
  assert.match(appPolicy(undefined), /connect-src 'none'/, "an app that declared nothing reaches no network");
});

async function appOnScreen(e) {
  svToolCard(e, { id: "toolu_app", name: "mcp__metabase__sales_by_region", input: { month: "2026-10" } }, true);
  svToolResult(e, { tool_use_id: "toolu_app", content: [{ type: "text", text: "rows" }] }, true);
  svEvent(e, { type: "driver", subtype: "mcp_app", tool_use_id: "toolu_app", app: { id: APP, server: "metabase", tool: "sales_by_region", title: "Vendas por região", prefersBorder: true } });
  await settle();
  const card = e.host.querySelector(".sv-mcp-app");
  return { card, frame: card?.querySelector("iframe.sv-mcp-app-frame") };
}

function fromApp(frame, data) {
  window.dispatchEvent(new window.MessageEvent("message", { data, source: frame.contentWindow }));
}

test("the app lands under its tool call, sandboxed away from the app and held to the domains it declared", async () => {
  const e = seatOf("apps-card", () => ({ ok: true, data: {} }));
  const { card, frame } = await appOnScreen(e);
  assert.ok(card, "the card is in the conversation");
  assert.equal(card.dataset.border, "1");
  assert.ok(fetched.some((url) => url.includes(`/api/render/app?name=apps-card&where=local&id=${APP}&part=meta`)));
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts allow-forms");
  assert.doesNotMatch(frame.getAttribute("sandbox"), /same-origin|popups|top-navigation/);
  assert.match(frame.getAttribute("csp"), /connect-src https:\/\/api\.example\.com/);
  assert.equal(frame.getAttribute("referrerpolicy"), "no-referrer");
  assert.ok(frame.srcdoc.indexOf("<p>app</p>") > frame.srcdoc.indexOf("MutationObserver"), "the shield runs before the app");
  assert.match(card.querySelector(".sv-mcp-app-server").textContent, /metabase/);
});

test("a tool that changes things waits for the person, and a refusal never reaches the chat", async () => {
  const e = seatOf("apps-ask", (cmd) => (cmd.op === "mcpAppTool" ? { ok: true, data: { server: "metabase", tool: cmd.tool, title: "Salvar como card", readOnly: cmd.tool !== "save_card", callable: true } } : { ok: true, data: { content: [{ type: "text", text: "saved" }] } }));
  const { card, frame } = await appOnScreen(e);
  frame.dispatchEvent(new window.Event("load"));
  const said = [];
  frame.contentWindow.postMessage = (message) => said.push(message);
  fromApp(frame, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "save_card", arguments: { month: "2026-10" } } });
  await settle();
  const ask = card.querySelector(".sv-mcp-app-ask");
  assert.equal(ask.hidden, false, "the person is asked first");
  assert.match(ask.querySelector(".sv-mcp-app-ask-title").textContent, /metabase.*Salvar como card/);
  assert.match(ask.querySelector(".sv-mcp-app-ask-detail").textContent, /2026-10/);
  assert.ok(!e.sent.some((cmd) => cmd.op === "mcpAppCall"), "nothing runs before the answer");
  ask.querySelector(".sv-mcp-app-ask-no").click();
  await settle();
  assert.equal(ask.hidden, true);
  assert.equal(said.at(-1).error.message, "Declined by the person.");
  assert.ok(!e.sent.some((cmd) => cmd.op === "mcpAppCall"));
  fromApp(frame, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "save_card", arguments: {} } });
  await settle();
  ask.querySelector(".sv-mcp-app-ask-yes").click();
  await settle();
  assert.deepEqual(said.at(-1), { jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: "saved" }] } });
  assert.deepEqual(e.sent.filter((cmd) => cmd.op === "mcpAppCall").map((cmd) => [cmd.app, cmd.tool]), [[APP, "save_card"]]);
  fromApp(frame, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "sales_by_region", arguments: { segment: "public" } } });
  await settle();
  assert.equal(ask.hidden, true, "a read-only tool runs without asking");
  assert.equal(said.at(-1).id, 3);
});

test("a message from the app goes to the chat only after the person says so, and another window cannot speak for the app", async () => {
  const e = seatOf("apps-message", () => ({ ok: true, data: {} }));
  const { card, frame } = await appOnScreen(e);
  frame.dispatchEvent(new window.Event("load"));
  const said = [];
  frame.contentWindow.postMessage = (message) => said.push(message);
  window.dispatchEvent(new window.MessageEvent("message", { data: { jsonrpc: "2.0", id: 1, method: "ui/message", params: { role: "user", content: [{ type: "text", text: "from a stranger" }] } }, source: window }));
  await settle();
  assert.equal(card.querySelector(".sv-mcp-app-ask").hidden, true);
  fromApp(frame, { jsonrpc: "2.0", id: 2, method: "ui/message", params: { role: "user", content: [{ type: "text", text: "salva o card de outubro" }] } });
  await settle();
  assert.deepEqual(e.typed, []);
  card.querySelector(".sv-mcp-app-ask-yes").click();
  await settle();
  assert.deepEqual(e.typed, ["salva o card de outubro"]);
  assert.equal(said.at(-1).id, 2);
});

test("the size the app reports holds between 80 and 2000 pixels", async () => {
  const e = seatOf("apps-size", () => ({ ok: true, data: {} }));
  const { frame } = await appOnScreen(e);
  frame.dispatchEvent(new window.Event("load"));
  fromApp(frame, { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 412 } });
  assert.equal(frame.style.height, "412px");
  fromApp(frame, { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 99999 } });
  assert.equal(frame.style.height, "2000px");
  fromApp(frame, { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 3 } });
  assert.equal(frame.style.height, "80px");
});
