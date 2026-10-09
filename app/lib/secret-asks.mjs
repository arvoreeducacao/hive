import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SECRET_TTL_MS = 24 * 60 * 60 * 1000;
export const SECRET_WAIT_MAX_MS = 30 * 60 * 1000;
export const SECRET_LABEL_MAX = 80;
export const SECRET_WHY_MAX = 400;
export const SECRET_VALUE_MAX = 16384;
const SEAT_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

const oneLine = (text, max) => String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

export function createSecretAsks({ dir, now = () => Date.now(), token = () => randomBytes(12).toString("hex") }) {
  const asks = new Map();

  function ensureDir() {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }

  function open({ seat, label, why = "" }) {
    if (!SEAT_NAME.test(String(seat || ""))) return { error: "a secret is asked by a seat of this hive" };
    const said = oneLine(label, SECRET_LABEL_MAX);
    if (!said) return { error: "say what secret you need, in a few words" };
    const id = token();
    asks.set(id, { id, seat, label: said, why: oneLine(why, SECRET_WHY_MAX), state: "pending", at: now(), path: "" });
    return { ask: view(asks.get(id)) };
  }

  function answer({ id, value }) {
    const ask = asks.get(String(id || ""));
    if (!ask) return { error: "this request is gone" };
    if (ask.state !== "pending") return { error: `this request is already ${ask.state}` };
    const secret = String(value ?? "");
    if (!secret) return { error: "an empty secret saves nothing" };
    if (secret.length > SECRET_VALUE_MAX) return { error: "this secret is too long" };
    ensureDir();
    const path = join(dir, `${ask.seat}-${ask.id}`);
    writeFileSync(path, secret, { mode: 0o600, flag: "wx" });
    chmodSync(path, 0o600);
    ask.state = "saved";
    ask.path = path;
    ask.doneAt = now();
    return { ask: view(ask) };
  }

  function decline({ id }) {
    const ask = asks.get(String(id || ""));
    if (!ask) return { error: "this request is gone" };
    if (ask.state !== "pending") return { error: `this request is already ${ask.state}` };
    ask.state = "declined";
    ask.doneAt = now();
    return { ask: view(ask) };
  }

  function cancel({ id, seat }) {
    const ask = asks.get(String(id || ""));
    if (!ask || ask.seat !== seat) return { error: "this request is gone" };
    if (ask.state === "pending") {
      ask.state = "cancelled";
      ask.doneAt = now();
    }
    return { ask: view(ask) };
  }

  function status({ id, seat }) {
    const ask = asks.get(String(id || ""));
    if (!ask || (seat && ask.seat !== seat)) return { error: "this request is gone" };
    return { ask: { ...view(ask), path: ask.path } };
  }

  const pending = () => [...asks.values()].filter((one) => one.state === "pending").map(view);

  function sweep() {
    const limit = now() - SECRET_TTL_MS;
    for (const [id, ask] of asks) if ((ask.doneAt || ask.at) < limit) asks.delete(id);
    if (!existsSync(dir)) return 0;
    let gone = 0;
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      try {
        if (statSync(file).mtimeMs < limit) { rmSync(file, { force: true }); gone += 1; }
      } catch {}
    }
    return gone;
  }

  return { open, answer, decline, cancel, status, pending, sweep };
}

function view(ask) {
  return { id: ask.id, seat: ask.seat, label: ask.label, why: ask.why, state: ask.state, at: ask.at };
}
