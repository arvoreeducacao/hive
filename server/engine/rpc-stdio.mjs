export const RPC_DEFAULT_TIMEOUT_MS = 25000;

export function createRpcClient({ child, onNotification = () => {}, onRequest = async () => null, onExit = () => {}, onStderr = () => {} }) {
  const waiting = new Map();
  let nextId = 0;
  let out = "";
  let err = "";
  let closed = false;
  let lastStderr = "";

  const write = (obj) => {
    if (closed) return false;
    try {
      child.stdin.write(JSON.stringify(obj) + "\n");
      return true;
    } catch {
      return false;
    }
  };

  function request(method, params, { timeoutMs = RPC_DEFAULT_TIMEOUT_MS } = {}) {
    return new Promise((resolve, reject) => {
      if (closed) return reject(new Error(`${method}: the app-server is gone`));
      const id = ++nextId;
      const timer = timeoutMs > 0 ? setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`${method}: no answer from the app-server in ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs) : null;
      timer?.unref?.();
      waiting.set(id, { resolve, reject, timer, method });
      if (!write({ jsonrpc: "2.0", id, method, params: params || {} })) {
        waiting.delete(id);
        if (timer) clearTimeout(timer);
        reject(new Error(`${method}: could not write to the app-server`));
      }
    });
  }

  function notify(method, params) {
    write({ jsonrpc: "2.0", method, params: params || {} });
  }

  function settle(msg) {
    const seat = waiting.get(msg.id);
    if (!seat) return;
    waiting.delete(msg.id);
    if (seat.timer) clearTimeout(seat.timer);
    if (msg.error) seat.reject(new Error([msg.error.message || `${seat.method} refused by the app-server`, typeof msg.error.data === "string" ? msg.error.data : ""].filter(Boolean).join(": ")));
    else seat.resolve(msg.result);
  }

  function serve(msg) {
    Promise.resolve()
      .then(() => onRequest(msg.method, msg.params || {}))
      .then(
        (result) => write({ jsonrpc: "2.0", id: msg.id, result: result ?? {} }),
        (e) => write({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: String(e?.message || e) } })
      );
  }

  function take(line) {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.method && msg.id !== undefined && msg.id !== null) return serve(msg);
    if (msg.method) return onNotification(msg.method, msg.params || {}, msg);
    if (msg.id !== undefined) return settle(msg);
  }

  child.stdout.on("data", (data) => {
    out += data;
    let nl;
    while ((nl = out.indexOf("\n")) >= 0) {
      const line = out.slice(0, nl).trim();
      out = out.slice(nl + 1);
      if (line) take(line);
    }
  });
  child.stderr?.on("data", (data) => {
    err += data;
    let nl;
    while ((nl = err.indexOf("\n")) >= 0) {
      const line = err.slice(0, nl);
      err = err.slice(nl + 1);
      if (line.trim()) {
        lastStderr = line.trim().slice(0, 400);
        onStderr(line);
      }
    }
  });

  function drop(reason) {
    for (const seat of waiting.values()) {
      if (seat.timer) clearTimeout(seat.timer);
      seat.reject(new Error(`${seat.method}: ${reason}`));
    }
    waiting.clear();
  }

  child.on("error", (e) => {
    closed = true;
    drop(String(e?.message || e));
    onExit(null, null, String(e?.message || e));
  });
  child.on("close", (code, signal) => {
    if (closed) return;
    closed = true;
    const said = lastStderr || `the app-server exited with code ${code ?? signal}`;
    drop(said);
    onExit(code, signal, said);
  });

  function close(graceMs = 2000) {
    if (closed) return;
    try { child.stdin.end(); } catch {}
    try { child.kill("SIGTERM"); } catch {}
    const hard = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, graceMs);
    hard.unref?.();
  }

  return {
    request,
    notify,
    close,
    get alive() { return !closed; },
    get pending() { return waiting.size; },
    get pid() { return child.pid; },
  };
}
