/* a seat left alone for an hour comes back to a cold prompt cache: the next
   message writes the whole conversation into the cache again, at the price of a
   cache write. Compacting a little before the cache expires reads the
   conversation one last time while it is still cheap, and the person comes back
   to a small one. Claude Code does this only in its own terminal — a seat runs it
   headless, so the driver does it here.

   A conversation is compacted at most once per stretch of quiet, and only when
   real work happened since the last compaction of any kind: the compaction is
   not a turn of its own, so it never arms another one. */

export const IDLE_COMPACT_MIN_TOKENS = 200000;
export const IDLE_COMPACT_FRACTION = 0.9;
export const CACHE_TTL_MS = { "1h": 60 * 60 * 1000, "5m": 5 * 60 * 1000 };
export const COLD_MARGIN_MS = 60 * 1000;
export const BUSY_RETRY_MS = 60 * 1000;

function numberOr(raw, fallback) {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function idleCompactSettings(env = process.env) {
  return {
    on: env.HIVE_IDLE_COMPACT !== "0",
    minTokens: numberOr(env.HIVE_IDLE_COMPACT_MIN_TOKENS, IDLE_COMPACT_MIN_TOKENS),
    afterMs: numberOr(env.HIVE_IDLE_COMPACT_AFTER_MS, 0),
  };
}

export function cacheTtlOf(usage) {
  const made = usage?.cache_creation;
  if (made?.ephemeral_1h_input_tokens > 0) return "1h";
  if (made?.ephemeral_5m_input_tokens > 0) return "5m";
  return "";
}

export function contextTokensOf(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
}

/* the mark is what the driver keeps in the session file between naps:
   session, turn_at (when the last real turn ended), tokens (the context the
   last request carried), ttl, worked (the model answered something since the
   last compaction) and tried_for (the turn_at an idle compaction already ran for). */
export function noteForIdleCompact(mark, message, { now = Date.now(), idle = false } = {}) {
  if (message?.type === "assistant" && !message.parent_tool_use_id && message.message?.model !== "<synthetic>") {
    const usage = message.message?.usage;
    const tokens = contextTokensOf(usage);
    return { ...mark, worked: true, ...(tokens ? { tokens } : {}), ttl: cacheTtlOf(usage) || mark.ttl || "" };
  }
  if (message?.type === "system" && message.subtype === "compact_boundary") {
    return { ...mark, worked: false, tokens: message.compact_metadata?.post_tokens || 0 };
  }
  if (message?.type === "result" && !idle) {
    return { ...mark, session: message.session_id || mark.session || "", turn_at: now };
  }
  return mark;
}

/* the compaction says it was asked for, and its result is not an answer: left
   as they come, the chat would read "you asked" and the rail would take an
   empty result as what the seat left for the person. */
export function idleTagged(message) {
  if (message?.type === "result") return { ...message, idle_compact: true };
  if (message?.type !== "system" || message.subtype !== "compact_boundary") return message;
  return { ...message, compact_metadata: { ...message.compact_metadata, trigger: "idle" } };
}

export function idleCompactVerdict({
  now,
  settings,
  mark = {},
  sessionId = "",
  leaving = false,
  busy = false,
  queued = 0,
  questions = 0,
  tasks = 0,
}) {
  if (!settings?.on) return { fire: false, why: "off" };
  if (leaving) return { fire: false, why: "leaving" };
  if (!sessionId || mark.session !== sessionId || !mark.turn_at) return { fire: false, why: "no turn to compact after" };
  if (mark.ttl !== "1h") return { fire: false, why: "the cache here is not the one-hour kind" };
  if (mark.tried_for === mark.turn_at) return { fire: false, why: "already compacted in this quiet" };
  if (!mark.worked) return { fire: false, why: "nothing new since the last compaction" };
  if ((mark.tokens || 0) < settings.minTokens) return { fire: false, why: "the conversation is small" };
  const ttlMs = CACHE_TTL_MS[mark.ttl];
  const at = mark.turn_at + (settings.afterMs || ttlMs * IDLE_COMPACT_FRACTION);
  const cold = mark.turn_at + ttlMs - COLD_MARGIN_MS;
  if (now < at) return { fire: false, why: "still recent", inMs: at - now };
  if (now >= cold) return { fire: false, why: "the cache has already gone cold" };
  if (busy || queued > 0 || questions > 0 || tasks > 0) {
    const left = cold - now;
    return left > BUSY_RETRY_MS ? { fire: false, why: "busy", inMs: BUSY_RETRY_MS } : { fire: false, why: "busy" };
  }
  return { fire: true, why: "quiet", tokens: mark.tokens };
}
