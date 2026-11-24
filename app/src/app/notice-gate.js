const WORKING_EXIT_GRACE_MS = 2000;

const NOTICE_TITLES = {
  completion: "Thread completed",
  input: "Input needed",
  approval: "Approval needed",
  secret: "Secret needed",
  limited: "Usage limit reached",
  failed: "Thread failed"
};

const ASKS_FOR_YOU = new Set(["input", "approval", "secret"]);

const rawOf = (seat) => seat.raw ?? seat.state;

function attentionOf(seat, { secret = null, limitedUntil = 0 } = {}) {
  const raw = rawOf(seat);
  if (secret) return { status: "secret", key: `secret:${secret.id ?? ""}` };
  if (raw === "needs") {
    const asks = Array.isArray(seat.asks) ? seat.asks : [];
    const status = asks.length ? "input" : "approval";
    return { status, key: `${status}:${asks.map((ask) => ask.id).join(",")}` };
  }
  if (raw === "working") return null;
  if (limitedUntil) return { status: "limited", key: `limited:${limitedUntil}` };
  if (seat.finish?.error) return { status: "failed", key: `failed:${seat.finish.at || seat.finish.seq || ""}` };
  return null;
}

function observationOf(seat, extra) {
  const raw = rawOf(seat);
  const attention = attentionOf(seat, extra);
  const busy = raw === "working";
  return {
    busy,
    attention: attention?.key || null,
    status: attention?.status || null,
    settled: !busy && !attention && raw !== "needs",
    finishedAt: seat.finish?.at || ""
  };
}

const snoozedNow = (mark, now) => !!mark?.snoozeUntil && mark.snoozeUntil > now;

const mutedBy = (mark, now) => snoozedNow(mark, now) || !!mark?.settledAt;

function waitsForYou(look, mark, now, unread) {
  if (mutedBy(mark, now)) return false;
  return ASKS_FOR_YOU.has(look.status) || !!unread || !!mark?.unread || !!mark?.wokeAt;
}

const titleOf = (kind, status) => NOTICE_TITLES[kind === "completion" ? "completion" : status] || NOTICE_TITLES.input;

function createNoticeGate(notify, { seen = new Map(), grace = WORKING_EXIT_GRACE_MS } = {}) {
  const ran = new Set();
  const handled = new Map();
  const pending = new Map();
  const close = (key, look) => {
    pending.delete(key);
    ran.delete(key);
    handled.set(key, look.finishedAt || handled.get(key) || "");
  };
  return {
    observe(key, look, { muted = false, now = Date.now() } = {}) {
      const prior = seen.get(key);
      seen.set(key, look);
      if (!look.settled) pending.delete(key);
      if (!prior || muted) close(key, look);
      if (look.busy && !muted) ran.add(key);
      if (!prior || muted) return;
      if (look.attention && look.attention !== prior.attention) {
        close(key, look);
        return notify(key, "attention", look);
      }
      if (!look.settled) return;
      if (!ran.has(key) && (!look.finishedAt || look.finishedAt === handled.get(key))) return;
      if (!pending.has(key)) return void pending.set(key, now);
      if (now - pending.get(key) < grace) return;
      close(key, look);
      notify(key, "completion", look);
    },
    retain(keys) {
      for (const map of [seen, handled, pending]) for (const key of [...map.keys()]) if (!keys.has(key)) map.delete(key);
      for (const key of [...ran]) if (!keys.has(key)) ran.delete(key);
    },
    waiting: (key) => pending.has(key)
  };
}

export { ASKS_FOR_YOU, NOTICE_TITLES, WORKING_EXIT_GRACE_MS, attentionOf, createNoticeGate, mutedBy, observationOf, snoozedNow, titleOf, waitsForYou };
