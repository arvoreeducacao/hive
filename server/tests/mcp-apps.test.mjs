import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appCspOf, appDocumentOf, appResourceUri, callResultOf, captureMcpApp, claudeToolName, documentTitleOf, findAppTool, mcpAppOps, mightCarryApp } from "../engine/mcp-apps.mjs";

const APP_HTML = "<!doctype html><p>loans</p>";

function fakeSession({ statuses, html = APP_HTML, meta = { ui: { prefersBorder: true } } } = {}) {
  const calls = [];
  const reads = [];
  return {
    calls,
    reads,
    mcpServerStatus: async () => statuses,
    readMcpResource: async (server, uri) => {
      reads.push({ server, uri });
      return { contents: [{ uri, mimeType: "text/html;profile=mcp-app", text: html, _meta: meta }] };
    },
    request: async (asked) => {
      calls.push(asked);
      return { subtype: "success", response: { content: [{ type: "text", text: "saved" }] } };
    }
  };
}

const metabase = (tools) => ({ name: "metabase", status: "connected", tools });
const loans = { name: "sales_by_region", title: "Vendas por região", annotations: { readOnly: true }, _meta: { ui: { resourceUri: "ui://sales/app.html" } } };
const save = { name: "save_card", annotations: {}, _meta: { ui: { visibility: ["app"] } } };
const hidden = { name: "drop_table", annotations: {}, _meta: { ui: { visibility: ["model"] } } };

test("a tool call can carry an app only when it is an MCP tool of a server other than the hive's own", () => {
  assert.equal(mightCarryApp("mcp__metabase__sales_by_region"), true);
  assert.equal(mightCarryApp("mcp__hive__html_render"), false);
  assert.equal(mightCarryApp("Bash"), false);
  assert.equal(claudeToolName("my server", "do.it"), "mcp__my_server__do_it");
});

test("the app's tool is found only when one connected server owns the name and no other server's prefix overlaps it", () => {
  assert.equal(findAppTool([metabase([loans])], "mcp__metabase__sales_by_region").tool.name, "sales_by_region");
  assert.equal(findAppTool([{ ...metabase([loans]), status: "pending" }], "mcp__metabase__sales_by_region"), null);
  assert.equal(findAppTool([metabase([loans]), { name: "metabase__x", status: "connected", tools: [] }], "mcp__metabase__sales_by_region"), null, "a server whose name starts the same could have sent it");
  assert.equal(findAppTool([metabase([loans, { ...loans }])], "mcp__metabase__sales_by_region"), null, "two tools under one name are ambiguous");
});

test("only a ui:// resource is an app, under the current key or the deprecated flat one", () => {
  assert.equal(appResourceUri({ ui: { resourceUri: "ui://a/b.html" } }), "ui://a/b.html");
  assert.equal(appResourceUri({ "ui/resourceUri": "ui://a/c.html" }), "ui://a/c.html");
  assert.equal(appResourceUri({ ui: { resourceUri: "https://evil.example/app.html" } }), "");
  assert.equal(appResourceUri(undefined), "");
});

test("the app's declared domains are kept only when they are secure origins, so a domain cannot widen the policy", () => {
  assert.deepEqual(appCspOf({ connectDomains: ["https://api.example.com", "http://plain.example.com", "https://*.cdn.example.com", "https://x.com; script-src *", "*"], resourceDomains: ["wss://live.example.com"] }), { connectDomains: ["https://api.example.com", "https://*.cdn.example.com"], resourceDomains: ["wss://live.example.com"] });
  assert.equal(appCspOf({ connectDomains: ["javascript:alert(1)"] }), undefined);
  assert.equal(appCspOf("nope"), undefined);
});

test("the app document is the HTML content of the resource, within its size, from text or base64", () => {
  assert.equal(appDocumentOf([{ mimeType: "text/html;profile=mcp-app", text: "<p>a</p>" }]).html, "<p>a</p>");
  assert.equal(appDocumentOf([{ mimeType: "text/html", blob: Buffer.from("<p>b</p>").toString("base64") }]).html, "<p>b</p>");
  assert.equal(appDocumentOf([{ mimeType: "application/json", text: "{}" }]), null);
  assert.equal(appDocumentOf([{ mimeType: "text/html", text: "x".repeat((5 << 20) + 1) }]), null);
});

test("without a tool title, the app is named by its own document, and only then by the tool", () => {
  assert.equal(documentTitleOf("<html><head><title>  Vendas\n por região </title></head>"), "Vendas por região");
  assert.equal(documentTitleOf("<p>no title</p>"), "");
});

test("the result handed to the app keeps the structured content the model never sees", () => {
  const block = { type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "rows" }] };
  assert.deepEqual(callResultOf({ tool_use_result: { content: [{ type: "text", text: "rows" }], structuredContent: { rows: [1] } } }, block), { content: [{ type: "text", text: "rows" }], structuredContent: { rows: [1] } });
  assert.deepEqual(callResultOf({}, { ...block, is_error: true }), { content: [{ type: "text", text: "rows" }], isError: true });
  assert.deepEqual(callResultOf({}, { ...block, content: "plain" }), { content: [{ type: "text", text: "plain" }] });
});

test("an app tool call is captured into the chat's own folder, and the event names only the app", async () => {
  const base = await mkdtemp(join(tmpdir(), "hive-mcp-app-"));
  try {
    const session = fakeSession({ statuses: [metabase([loans, save])] });
    const event = await captureMcpApp({ session, base, seat: "loans-chat", toolUse: { id: "toolu_1", name: "mcp__metabase__sales_by_region", input: { month: "2026-10" } }, result: { content: [], structuredContent: { rows: [] } } });
    assert.equal(event.subtype, "mcp_app");
    assert.equal(event.tool_use_id, "toolu_1");
    assert.deepEqual(Object.keys(event.app).sort(), ["id", "prefersBorder", "server", "title", "tool"]);
    assert.deepEqual(session.reads, [{ server: "metabase", uri: "ui://sales/app.html" }]);
    const kept = await readdir(join(base, "mcp-apps", "loans-chat"));
    assert.deepEqual(kept.sort(), [`${event.app.id}.html`, `${event.app.id}.json`]);
    assert.equal(await readFile(join(base, "mcp-apps", "loans-chat", `${event.app.id}.html`), "utf8"), APP_HTML);
    const meta = JSON.parse(await readFile(join(base, "mcp-apps", "loans-chat", `${event.app.id}.json`), "utf8"));
    assert.equal(meta.server, "metabase");
    assert.deepEqual(meta.input, { month: "2026-10" });
    assert.deepEqual(meta.result.structuredContent, { rows: [] });
    assert.equal(await captureMcpApp({ session, base, seat: "loans-chat", toolUse: { id: "t2", name: "mcp__metabase__save_card", input: {} }, result: {} }), null, "a tool without a ui resource has no app");
    assert.equal(await captureMcpApp({ session, base, seat: "loans-chat", toolUse: { id: "toolu_3", name: "mcp__hive__html_render", input: {} }, result: {} }), null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("a server that never answers the resource read leaves a plain tool row after the wait", async () => {
  const session = { mcpServerStatus: async () => [metabase([loans])], readMcpResource: () => new Promise(() => {}) };
  await assert.rejects(captureMcpApp({ session, base: tmpdir(), seat: "x", toolUse: { id: "t", name: "mcp__metabase__sales_by_region" }, result: {}, ms: 30 }), /took too long/);
});

async function withApp(statuses, run) {
  const base = await mkdtemp(join(tmpdir(), "hive-mcp-app-ops-"));
  try {
    const session = fakeSession({ statuses });
    const event = await captureMcpApp({ session, base, seat: "loans-chat", toolUse: { id: "toolu_1", name: "mcp__metabase__sales_by_region", input: {} }, result: {} });
    await run({ session, base, app: event.app.id });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

test("the app reaches only tools of its own server that let the app call them, and says which ones change things", async () => {
  await withApp([metabase([loans, save, hidden]), { name: "github", status: "connected", tools: [{ name: "delete_repo" }] }], async ({ session, base, app }) => {
    const ops = mcpAppOps({ session: () => session, base, seat: "loans-chat" });
    assert.deepEqual(await ops.mcpAppTool({ app, tool: "sales_by_region" }), { server: "metabase", tool: "sales_by_region", title: "Vendas por região", readOnly: true, callable: true });
    assert.deepEqual(await ops.mcpAppTool({ app, tool: "save_card" }), { server: "metabase", tool: "save_card", title: "save_card", readOnly: false, callable: true });
    await assert.rejects(ops.mcpAppTool({ app, tool: "delete_repo" }), /metabase has no tool called delete_repo/, "another server's tool is out of reach");
    await assert.rejects(ops.mcpAppCall({ app, tool: "drop_table", arguments: {} }), /does not let its app call/);
    const saved = await ops.mcpAppCall({ app, tool: "save_card", arguments: { month: "2026-10" } });
    assert.deepEqual(saved, { content: [{ type: "text", text: "saved" }] });
    assert.deepEqual(session.calls, [{ subtype: "mcp_call", tool: "mcp__metabase__save_card", arguments: { month: "2026-10" }, result_not_for_model: true }]);
    await ops.mcpAppRead({ app, uri: "ui://sales/other.html" });
    assert.deepEqual(session.reads.at(-1), { server: "metabase", uri: "ui://sales/other.html" });
    await assert.rejects(ops.mcpAppCall({ app: "../../etc", tool: "save_card" }), /not an app of this chat/);
    await assert.rejects(ops.mcpAppCall({ app: "6f1d3c2a-9b8e-4c7d-a6f5-000000000000", tool: "save_card" }), /no longer on disk/);
  });
});

test("an app cannot run a tool that reaches the agent under the same name as another one", async () => {
  await withApp([metabase([loans, save, { name: "save.card" }])], async ({ session, base, app }) => {
    const ops = mcpAppOps({ session: () => session, base, seat: "loans-chat" });
    await assert.rejects(ops.mcpAppCall({ app, tool: "save_card", arguments: {} }), /same name/);
    assert.equal(session.calls.length, 0);
  });
});

test("an app of a chat that is not running says to wake the chat, and waits for a server that is still connecting", async () => {
  await withApp([metabase([loans, save])], async ({ base, app }) => {
    const asleep = mcpAppOps({ session: () => null, base, seat: "loans-chat" });
    await assert.rejects(asleep.mcpAppTool({ app, tool: "save_card" }), /not running/);
    let asked = 0;
    const waking = { ...fakeSession({ statuses: [] }), mcpServerStatus: async () => [{ ...metabase([loans, save]), status: ++asked < 3 ? "pending" : "connected" }] };
    const ops = mcpAppOps({ session: () => waking, base, seat: "loans-chat", waitMs: 5000 });
    assert.equal((await ops.mcpAppTool({ app, tool: "save_card" })).callable, true);
    assert.equal(asked, 3);
  });
});

test("the claude driver captures an app after it records the tool result, and lets the app reach the seat only through the three app operations", async () => {
  const driver = await readFile(new URL("../engine/driver.mjs", import.meta.url), "utf8");
  const recorded = driver.indexOf("emit(idleCompactTurn ? idleTagged(message) : message);");
  assert.ok(recorded > 0 && driver.indexOf("noteMcpApps(message);", recorded) > recorded, "the app event comes after the tool result it belongs to");
  for (const op of ["mcpAppTool", "mcpAppCall", "mcpAppRead"]) assert.match(driver, new RegExp(`${op}: \\(\\) => appOps\\(\\)\\.${op}\\(cmd\\)`));
  assert.match(driver, /const appOps = \(\) => mcpAppOps\(\{ session: \(\) => session, base, seat: name \}\)/, "the operations read the app this seat kept, by its own name, and are built only when an app asks");
});
