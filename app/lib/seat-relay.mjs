export const SEAT_KINDS = new Set(["seat-open", "seat-command", "seat-close", "seat-born"]);
export const EVENTS_PER_ENVELOPE = 40;

export function createRelay({ desk, sendTo, allow = () => true, mine = () => true, openSeat = null, handBirth = () => {} } = {}) {
  const held = new Map();
  const keyOf = (who, seat) => `${who}\n${seat}`;

  function close(who, seat) {
    const key = keyOf(who, seat);
    const listen = held.get(key);
    if (!listen) return { ok: true, closed: false };
    held.delete(key);
    try { listen.stop?.(); } catch {}
    return { ok: true, closed: true };
  }

  async function open(who, { seat, from = 0, window = "all" }) {
    if (!seat) return { ok: false, error: "nobody said which seat" };
    if (!allow(who, seat, "read")) {
      const error = "that seat is not yours to read";
      sendTo(who, "seat-gone", { seat, error });
      return { ok: false, error };
    }
    close(who, seat);

    held.set(keyOf(who, seat), desk.stream.follow(seat, (envelope) => {
      if (envelope?.kind !== "event" || envelope.body?.session !== seat) return;
      sendTo(who, "seat-events", { seat, events: [envelope.body.event] });
    }));

    const reach = window === "tail" ? "tail" : "all";
    const said = await desk.client.get(`/api/sessions/${encodeURIComponent(seat)}/events?from=${Number(from) || 0}&window=${reach}`);
    if (!said.ok) {
      close(who, seat);
      sendTo(who, "seat-gone", { seat, error: said.error });
      return { ok: false, error: said.error };
    }

    const events = said.body?.events || [];
    const seq = said.body?.seq || 0;
    for (let at = 0; at < events.length; at += EVENTS_PER_ENVELOPE) {
      sendTo(who, "seat-events", { seat, seq, events: events.slice(at, at + EVENTS_PER_ENVELOPE) });
    }
    if (!events.length) sendTo(who, "seat-events", { seat, seq, events: [] });
    return { ok: true };
  }

  async function command(who, { seat, cmd }) {
    if (!seat || !cmd?.type) return { ok: false, error: "a command needs a seat and a type" };
    if (!allow(who, seat, "write")) {
      const error = "that keyboard is not lent to you";
      sendTo(who, "seat-reply", { seat, cid: cmd.cid ?? null, reply: { ok: false, error } });
      return { ok: false, error };
    }
    const said = await desk.client.post(`/api/sessions/${encodeURIComponent(seat)}/command`, cmd);
    const reply = said.ok ? (said.body ?? { ok: true }) : { ok: false, error: said.error };
    sendTo(who, "seat-reply", { seat, cid: cmd.cid ?? null, reply });
    return { ok: said.ok };
  }

  async function born(who, { id, mission }) {
    if (!id) return { ok: false, error: "a new chat ask needs an id" };
    if (!openSeat) {
      handBirth(id, { error: "this machine cannot open a chat" });
      return { ok: false, error: "this machine cannot open a chat" };
    }
    if (!mine(who)) {
      handBirth(id, { error: "only your own devices open a chat here" });
      return { ok: false, error: "only your own devices open a chat here" };
    }
    try {
      const made = await openSeat(mission || {});
      handBirth(id, made.error ? { error: made.error } : { born: made.id || "", name: made.name || "" });
      return { ok: !made.error };
    } catch (wrong) {
      handBirth(id, { error: String(wrong?.message || wrong) });
      return { ok: false, error: String(wrong?.message || wrong) };
    }
  }

  return {
    get watching() { return [...held.keys()]; },

    async take(who, kind, body) {
      if (kind === "seat-open") return open(who, body || {});
      if (kind === "seat-command") return command(who, body || {});
      if (kind === "seat-born") return born(who, body || {});
      if (kind === "seat-close") return close(who, String(body?.seat || ""));
      return { ok: false, error: "that note is not about a seat" };
    },

    forget(who) {
      for (const key of [...held.keys()]) if (key.startsWith(`${who}\n`)) close(who, key.slice(who.length + 1));
    },

    stop() {
      for (const key of [...held.keys()]) {
        const at = key.indexOf("\n");
        close(key.slice(0, at), key.slice(at + 1));
      }
    }
  };
}
