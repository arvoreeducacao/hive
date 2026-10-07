export const MAILBOX_CEILING = 200;
export const PANEL_CEILING = 64 << 10;
export const STALE_PRESENCE_MS = 90000;

export function createHub({ now = () => Date.now(), mailboxCeiling = MAILBOX_CEILING, panelCeiling = PANEL_CEILING } = {}) {
  const sockets = new Map();
  const mailboxes = new Map();
  const panels = new Map();
  let sent = 0;
  let dropped = 0;

  const livesOf = (fingerprint) => sockets.get(fingerprint) || null;

  function push(fingerprint, envelope) {
    const held = livesOf(fingerprint);
    if (!held || !held.size) return false;
    let reached = false;
    for (const one of held) {
      try { one.send(envelope); reached = true; } catch {}
    }
    return reached;
  }

  function hold(fingerprint, envelope) {
    const box = mailboxes.get(fingerprint) || [];
    box.push(envelope);
    while (box.length > mailboxCeiling) { box.shift(); dropped += 1; }
    mailboxes.set(fingerprint, box);
  }

  return {
    get online() { return [...sockets.keys()].filter((one) => sockets.get(one).size); },
    get delivered() { return sent; },
    get missed() { return dropped; },
    waiting: (fingerprint) => (mailboxes.get(fingerprint) || []).length,

    join(fingerprint, send) {
      const one = { send, at: now() };
      const held = sockets.get(fingerprint) || new Set();
      held.add(one);
      sockets.set(fingerprint, held);
      const box = mailboxes.get(fingerprint) || [];
      mailboxes.delete(fingerprint);
      for (const envelope of box) { try { send(envelope); sent += 1; } catch {} }
      return { fingerprint, seat: one, backlog: box.length };
    },

    leave(handle) {
      const held = sockets.get(handle?.fingerprint);
      if (!held) return false;
      const gone = held.delete(handle.seat);
      if (!held.size) sockets.delete(handle.fingerprint);
      return gone;
    },

    deliver(to, envelope) {
      if (!to) return { ok: false, error: "an envelope needs a recipient" };
      if (push(to, envelope)) { sent += 1; return { ok: true, live: true }; }
      hold(to, envelope);
      return { ok: true, live: false };
    },

    broadcast(envelope, { except = "" } = {}) {
      let reached = 0;
      for (const fingerprint of sockets.keys()) {
        if (fingerprint === except) continue;
        if (push(fingerprint, envelope)) { reached += 1; sent += 1; }
      }
      return reached;
    },

    publish(fingerprint, panel) {
      const text = JSON.stringify(panel ?? null);
      if (text.length > panelCeiling) return { ok: false, error: `that panel is ${text.length} bytes, past the ${panelCeiling} the broker holds` };
      panels.set(fingerprint, { panel, at: now() });
      return { ok: true };
    },

    board() {
      const at = now();
      const rows = [];
      for (const [fingerprint, held] of panels) {
        rows.push({
          fingerprint,
          panel: held.panel,
          at: held.at,
          online: !!livesOf(fingerprint)?.size,
          stale: at - held.at > STALE_PRESENCE_MS
        });
      }
      return rows.sort((a, b) => b.at - a.at);
    },

    forget(fingerprint) {
      const held = sockets.get(fingerprint);
      if (held) for (const one of held) { try { one.send({ kind: "revoked" }); } catch {} }
      sockets.delete(fingerprint);
      mailboxes.delete(fingerprint);
      panels.delete(fingerprint);
    }
  };
}

export function envelopeOf({ kind, from, to = "", body = null, at }) {
  return { v: 1, kind: String(kind || ""), from: String(from || ""), to: String(to || ""), body, at: Number(at) || 0 };
}
