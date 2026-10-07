import { execFile, spawn } from "node:child_process";
import { agents, normalizeClaudeModels } from "./engine/agents.mjs";

export async function providerCatalog(agent, cwd) {
  if (agent === "claude") {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const session = query({ prompt: (async function* () {})(), options: { cwd, permissionMode: "bypassPermissions" } });
    try { return normalizeClaudeModels(await session.supportedModels()); }
    finally { session.close(); }
  }
  const spec = agents[agent];
  if (!spec?.listCatalog) throw new Error("this provider cannot list its models");
  return spec.listCatalog({ run: (bin, args) => catalogRun(bin, args, cwd), rpc: (bin, args, use, env) => catalogRpc(bin, args, use, env, cwd) });
}

export function catalogRun(bin, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, maxBuffer: 8 * 1024 * 1024, timeout: 60000 }, (wrong, out, err) => {
      if (wrong) return reject(new Error(String(err || wrong.message || wrong).trim().split("\n").pop()));
      resolve(out);
    });
  });
}

export function catalogRpc(bin, args, use, env = null, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"], ...(env ? { env: { ...process.env, ...env } } : {}) });
    const waiting = new Map();
    let nextId = 0, out = "", err = "";
    const call = (method, params) => new Promise((ok, no) => {
      const id = ++nextId;
      waiting.set(id, { ok, no });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params || {} }) + "\n");
    });
    child.stdout.on("data", (d) => {
      out += d;
      let nl;
      while ((nl = out.indexOf("\n")) >= 0) {
        const line = out.slice(0, nl).trim();
        out = out.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const seat = waiting.get(msg.id);
        if (!seat) continue;
        waiting.delete(msg.id);
        if (msg.error) seat.no(new Error(msg.error.message || `${bin} refused the request`));
        else seat.ok(msg.result);
      }
    });
    child.stderr.on("data", (d) => { err = (err + d).slice(-1500); });
    const stop = () => { try { child.kill("SIGKILL"); } catch {} };
    child.on("error", (e) => { stop(); reject(new Error(String(e?.message || e))); });
    child.on("close", (code) => {
      const said = err.trim().split("\n").pop() || `${bin} exited with code ${code}`;
      for (const seat of waiting.values()) seat.no(new Error(said));
      waiting.clear();
    });
    const guard = setTimeout(stop, 25000);
    guard.unref?.();
    Promise.resolve().then(() => use(call)).then(
      (data) => { clearTimeout(guard); stop(); resolve(data); },
      (e) => { clearTimeout(guard); stop(); reject(e); }
    );
  });
}
