import { seatAgent } from "./chat-and-panes.js";
import { svCmd } from "./chat-stretches.js";
import { esc, every, phrase } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { boxHasContent, composerMode, onComposerDriver, onComposerMode, onComposerSend, paintComposer } from "./composer-modes.js";
import { structPool, svLine } from "./structured-seats.js";
import { putAttr, putHidden, putText, putTitle } from "./dom-writes.js";

const COMPACTION_SUGGESTION_MIN_TOKENS = 200_000;

const CACHE_TTL_MS = { "1h": 60 * 60_000, "5m": 5 * 60_000 };

const RESUME_COMPACTION_FALLBACK_MS = 70 * 60_000;

const COMPACT_COMMAND = /^\/compact(?:\s|$)/i;

function compactTokens(n) {
  const value = Math.max(0, Number(n) || 0);
  if (value < 1000) return `${Math.round(value)}`;
  if (value < 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (value < 999_500) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

function cacheTtlOf(usage) {
  const made = usage?.cache_creation;
  if (made?.ephemeral_1h_input_tokens > 0) return CACHE_TTL_MS["1h"];
  if (made?.ephemeral_5m_input_tokens > 0) return CACHE_TTL_MS["5m"];
  return 0;
}

function compactOffer(e, now = Date.now()) {
  if (!e?.box || e.mirror || e.draft || seatAgent(e) !== "claude") return 0;
  const tokens = Number(e.context?.t) || 0;
  if (tokens < COMPACTION_SUGGESTION_MIN_TOKENS || !e.lastTurnAt) return 0;
  if (now - e.lastTurnAt < (e.cacheTtlMs || RESUME_COMPACTION_FALLBACK_MS)) return 0;
  if (e.turnOpen || e.sending || e.ask || e.planAsk || e.editing || e.queueHeld || e.freshArmed || e.providerTransfer) return 0;
  if (e.ws?.readyState !== 1) return 0;
  if (COMPACT_COMMAND.test(String(e.box.textarea?.value || "").trim())) return 0;
  return composerMode(e) === "idle" ? tokens : 0;
}

const compactsFirst = (e) => !!compactOffer(e) && !e.keepFullHistory;

function chipOf(e, form) {
  const btns = form.querySelector(".sv-btns");
  if (!btns) return null;
  let chip = btns.querySelector(":scope > .cp-compact");
  if (chip) return chip;
  chip = document.createElement("button");
  chip.type = "button";
  chip.className = "cp-compact";
  chip.innerHTML = `${composerIcon("minimize")}<span class="cp-compact-word"></span><span class="cp-compact-n"></span>`;
  chip.addEventListener("pointerdown", (ev) => ev.preventDefault());
  chip.addEventListener("click", () => {
    e.keepFullHistory = !e.keepFullHistory;
    paintComposer(e);
  });
  const send = btns.querySelector(".sv-send");
  if (send) send.before(chip);
  else btns.append(chip);
  return chip;
}

function paintCompact(e, form, mode) {
  const tokens = mode === "idle" ? compactOffer(e) : 0;
  const chip = tokens ? chipOf(e, form) : form.querySelector(".sv-btns > .cp-compact");
  if (!chip) return;
  putHidden(chip, !tokens);
  if (!tokens) return;
  const said = compactTokens(tokens);
  const compacts = !e.keepFullHistory;
  putAttr(chip, "aria-pressed", String(compacts));
  putAttr(chip, "aria-label", phrase("Compact {tokens} tokens of history before sending", { tokens: said }));
  putTitle(chip, `${compacts ? phrase("Next send compacts {tokens} tokens first.", { tokens: said }) : phrase("Next send keeps all {tokens} tokens.", { tokens: said })}\n${compacts ? phrase("Click to keep full history") : phrase("Click to compact first")}`);
  putText(chip.querySelector(".cp-compact-word"), compacts ? phrase("Compact") : phrase("Keep"));
  putText(chip.querySelector(".cp-compact-n"), said);
  if (!compacts) return;
  const send = form.querySelector(".sv-send");
  if (!send || e.sending) return;
  putAttr(send, "aria-label", phrase("Compact and send"));
  putTitle(send, phrase("Summarize {tokens} tokens of history, then send", { tokens: said }));
}

async function compactThenSend(e, alternate) {
  if (e.compactingFirst) return;
  e.compactingFirst = true;
  e.sending = true;
  paintComposer(e);
  const r = await svCmd(e, { type: "control", op: "compact", focus: "" });
  e.sending = false;
  if (!r?.ok) {
    e.compactingFirst = false;
    if (!r?.silent) svLine(e, "sv-meta warn", r?.error || phrase("compact failed"));
    return void paintComposer(e);
  }
  e.keepFullHistory = false;
  e.compactPass = true;
  try { e.box.say(alternate); }
  finally {
    e.compactPass = false;
    e.compactingFirst = false;
  }
}

onComposerSend({
  order: 50,
  take(e, asked) {
    if (e.compactPass || !compactOffer(e) || !boxHasContent(e)) return false;
    if (e.keepFullHistory) {
      e.keepFullHistory = false;
      return false;
    }
    compactThenSend(e, !!asked.alternate);
    return true;
  }
});

onComposerMode({ paint: paintCompact });

onComposerDriver({
  saw(e, ev) {
    if (ev.type === "assistant" && !ev.parent_tool_use_id) {
      const ttl = cacheTtlOf(ev.message?.usage);
      if (ttl) e.cacheTtlMs = ttl;
      return;
    }
    if (ev.type === "result" && !ev.idle_compact) e.lastTurnAt = (ev.ts && Date.parse(ev.ts)) || Date.now();
  }
});

every("compact-offer", 60_000, () => {
  for (const e of structPool.values()) if (e.host?.isConnected && e.box && !e.turnOpen) paintComposer(e);
});

export { COMPACTION_SUGGESTION_MIN_TOKENS, RESUME_COMPACTION_FALLBACK_MS, compactOffer, compactTokens, compactsFirst };
