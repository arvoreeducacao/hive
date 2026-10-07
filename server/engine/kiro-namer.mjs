import { spawn } from "node:child_process";
import { createRpcClient } from "./rpc-stdio.mjs";
import { BINARY, NAMER_MODEL, acpArgs, initializeParams, newSessionParams, promptParams } from "./kiro-acp.mjs";

const prompt = process.argv.slice(2).join(" ").trim();
if (!prompt) {
  console.error("usage: node kiro-namer.mjs <prompt>");
  process.exit(2);
}

const NAMER_TIMEOUT_MS = 40000;
let said = "";

const child = spawn(BINARY, acpArgs({ model: NAMER_MODEL, effort: "low" }), { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"] });
const rpc = createRpcClient({
  child,
  onNotification(method, params) {
    const update = params?.update;
    if (method === "session/update" && update?.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") said += update.content.text || "";
  },
  onRequest(method, params) {
    if (method !== "session/request_permission") throw new Error(`the namer does not answer ${method}`);
    const rejected = (params?.options || []).find((o) => o.kind === "reject_once") || (params?.options || [])[0];
    return { outcome: rejected ? { outcome: "selected", optionId: rejected.optionId } : { outcome: "cancelled" } };
  },
  onExit() {},
  onStderr() {},
});

const guard = setTimeout(() => { rpc.close(); process.exit(1); }, NAMER_TIMEOUT_MS);
guard.unref?.();

try {
  await rpc.request("initialize", initializeParams());
  const opened = await rpc.request("session/new", newSessionParams({ cwd: process.cwd(), mcpServers: [] }));
  const sessionId = opened?.sessionId || "";
  if (!sessionId) throw new Error("kiro opened no session");
  await rpc.request("session/prompt", promptParams(sessionId, prompt, []), { timeoutMs: NAMER_TIMEOUT_MS });
  const line = said.split("\n").map((l) => l.trim()).filter(Boolean).pop() || "";
  if (line) console.log(line);
  clearTimeout(guard);
  rpc.close();
  process.exit(line ? 0 : 1);
} catch (e) {
  console.error(String(e?.message || e));
  clearTimeout(guard);
  rpc.close();
  process.exit(1);
}
