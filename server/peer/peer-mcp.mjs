import { createInterface } from "node:readline";
import { ceilingOf, peerCalls, toolsFor } from "./peer-tools.mjs";

const calls = peerCalls(process.env);

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(request) {
  const { id, method, params } = request;
  if (method === "initialize") {
    return {
      protocolVersion: params?.protocolVersion === "2025-06-18" ? "2025-06-18" : "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "hive", version: "1.0.0" },
    };
  }
  if (method === "ping") return {};
  if (method === "tools/list") return { tools: toolsFor(ceilingOf(process.env)) };
  if (method === "tools/call") {
    const call = calls[params?.name];
    if (!call) throw new Error(`unknown tool ${params?.name}`);
    return await call(params.arguments || {});
  }
  throw new Error(`unknown method ${method}`);
}

const lines = createInterface({ input: process.stdin });
for await (const line of lines) {
  const raw = line.trim();
  if (!raw) continue;
  let request;
  try { request = JSON.parse(raw); } catch { continue; }
  if (request.id === undefined || request.id === null) continue;
  try {
    send({ jsonrpc: "2.0", id: request.id, result: await handle(request) });
  } catch (error) {
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: String(error?.message || error) } });
  }
}
