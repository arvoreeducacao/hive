import { paintMentions, paintPills, svEvent, svUserThumb } from "./chat-and-panes.js";
import { svCmd } from "./chat-stretches.js";
import { svConvAppend, svConvLine } from "./conversation-model.js";
import { commandOf, every, isNativeCommand, phrase, raycastOn } from "./core.js";
import { ago } from "./pod.js";
import { splitPeerHandle } from "./pure-helpers.js";
import { paintSubs } from "./subagents-dock.js";
import { blockText, toClipboard } from "./terminal-history.js";
import { forgetMemory } from "./memory-signal.js";

const structPool = new Map();

function forgetStruct(name) {
  forgetMemory(name);
  const e = structPool.get(name);
  if (!e) return false;
  try { e.talkOff?.(); } catch {}
  return structPool.delete(name);
}

function svActivity(e, verb) {
  const changed = (verb || "") !== e.activity;
  e.activity = verb || "";
  if (!verb) e.activitySince = 0;
  else if (changed || !e.activitySince) e.activitySince = Date.now();
  paintActivity(e);
}

function paintActivity(e) {
  const strip = e.host.querySelector(".sv-activity");
  if (!strip) return;
  const composer = e.host.querySelector(".sv-composer");
  composer.classList.toggle("running", !!e.turnOpen);
  const gauge = e.host.querySelector(".sv-ctx");
  if (e.context) {
    const { t, m, p } = e.context;
    gauge.classList.add("on");
    gauge.classList.toggle("warm", p >= 70 && p < 90);
    gauge.classList.toggle("hot", p >= 90);
    gauge.querySelector(".bar i").style.width = `${Math.min(100, Math.max(2, p))}%`;
    const pct = `${Math.round(p)}%`;
    gauge.querySelector(".pct .full").textContent = `${(t / 1000).toFixed(t >= 99500 ? 0 : 1)}k / ${Math.round(m / 1000)}k · ${pct}`;
    gauge.querySelector(".pct .short").textContent = pct;
  }
  if (raycastOn()) return paintRaycastActivity(e, strip);
  if (!e.activity) { strip.classList.remove("on"); return; }
  strip.classList.add("on");
  strip.querySelector(".verb").textContent = e.activity;
  const secs = e.activitySince ? Math.floor((Date.now() - e.activitySince) / 1000) : 0;
  strip.querySelector(".clock").textContent = secs > 2 ? `· ${secs}s` : "";
}

const ASKS = ["waiting for your answer", "waiting for you to read the plan"];

function paintRaycastActivity(e, strip) {
  if (!e.activity) { strip.classList.remove("on", "asks", "tool"); return; }
  strip.classList.add("on");
  strip.classList.toggle("asks", ASKS.some((one) => phrase(one) === e.activity));
  const tool = /^running (.+)$/.exec(e.activity);
  strip.classList.toggle("tool", !!tool);
  strip.querySelector(".verb").textContent = tool ? tool[1] : e.activity === "writing" ? phrase("writing the answer") : phrase(e.activity);
  const secs = e.activitySince ? Math.floor((Date.now() - e.activitySince) / 1000) : 0;
  strip.querySelector(".clock").textContent = secs > 2 ? `· ${secs}s` : "";
}

function refreshContext(e) {
  svCmd(e, { type: "control", op: "context" }).then((r) => {
    if (!r?.ok || !r.data) return;
    e.contextUsage = r.data;
    e.context = { t: r.data.totalTokens ?? 0, m: r.data.maxTokens ?? 0, p: r.data.percentage ?? 0 };
    paintActivity(e);
  });
}

async function refreshDriverState(e) {
  const state = await svCmd(e, { type: "state" });
  if (!state?.ok || typeof state.working !== "boolean") return state;
  /* the init event says who the seat is, and it is emitted once, at birth: a pane that
     joins a long conversation never sees it and falls back to reading the seat as claude
     on the model called "Default". The driver knows, so the pane asks on every connect. */
  const wasUnknown = !e.agent || !e.model;
  if (state.agent && !e.agent) e.agent = state.agent;
  if (state.model && !e.model) e.model = state.model;
  if (typeof state.effort === "string" && !e.effort) e.effort = state.effort;
  if (wasUnknown && (e.agent || e.model)) paintPills(e);
  if (Number.isFinite(state.seq) && state.seq < (e.lastSeq || 0)) return state;
  if (state.working) {
    if (!e.turnOpen) svEvent(e, { type: "driver", subtype: "turn_started" });
  } else if (e.turnOpen || e.activity) {
    svEvent(e, { type: "result" });
  }
  return state;
}

every("activity", 1000, () => {
  for (const e of structPool.values()) {
    if (!e.host.isConnected) continue;
    if (e.activity) paintActivity(e);
    if (e.subs?.size) paintSubs(e);
  }
});

function svQueueRefused(e, r) {
  if (!r || r.silent) return;
  svLine(e, "sv-meta warn", r.error || phrase("the driver refused it"));
}

const DEQUEUED_MEMORY = 40;

function svDequeuedEarly(e, cid) {
  if (!cid) return;
  const seen = (e.dequeued ||= new Set());
  seen.add(cid);
  while (seen.size > DEQUEUED_MEMORY) seen.delete(seen.values().next().value);
}

function svWasDequeuedEarly(e, cid) {
  return !!cid && !!e.dequeued?.delete(cid);
}

function svDequeue(e, held) {
  const item = held || (e.queuedEls || []).shift();
  if (held) {
    const i = (e.queuedEls || []).indexOf(held);
    if (i >= 0) e.queuedEls.splice(i, 1);
  }
  if (item?.dataset.system) item.remove();
  else if (item) {
    item.dataset.gone = "1";
    const bubble = svLine(e, "sv-user", splitPeerHandle(item.dataset.text || item.textContent).body);
    paintMentions(bubble);
    for (const path of JSON.parse(item.dataset.images || "[]")) svUserThumb(e, bubble, path);
    item.remove();
  }
  const tray = e.host.querySelector(".sv-queue");
  if (tray) tray.classList.toggle("on", !!(e.queuedEls || []).length);
}

const WORK_KINDS = ["read", "write", "run", "web", "agent"];

function workVerb(kind, n) {
  if (kind === "read") return n === 1 ? phrase("read {n} file", { n }) : phrase("read {n} files", { n });
  if (kind === "write") return n === 1 ? phrase("changed {n} file", { n }) : phrase("changed {n} files", { n });
  if (kind === "run") return n === 1 ? phrase("ran {n} command", { n }) : phrase("ran {n} commands", { n });
  if (kind === "web") return n === 1 ? phrase("searched the web {n} time", { n }) : phrase("searched the web {n} times", { n });
  if (kind === "agent") return n === 1 ? phrase("ran {n} agent", { n }) : phrase("ran {n} agents", { n });
  return n === 1 ? phrase("used {n} tool", { n }) : phrase("used {n} tools", { n });
}

function workSummary(cards) {
  const tally = new Map();
  const changed = new Set();
  const bump = (key) => tally.set(key, (tally.get(key) || 0) + 1);
  for (const card of cards) {
    const kind = card.dataset.kind || "misc";
    if (!WORK_KINDS.includes(kind)) { bump("other"); continue; }
    if (kind === "write") {
      const target = (card.querySelector(".targ")?.textContent || "").trim();
      if (target) { changed.add(target); continue; }
    }
    bump(kind);
  }
  if (changed.size) tally.set("write", (tally.get("write") || 0) + changed.size);
  const said = [];
  for (const kind of WORK_KINDS) if (tally.get(kind)) said.push(workVerb(kind, tally.get(kind)));
  if (tally.get("other")) said.push(workVerb("other", tally.get("other")));
  if (!said.length) return phrase("the work");
  if (said.length === 1) return said[0];
  return `${said.slice(0, -1).join(", ")} ${phrase("and")} ${said[said.length - 1]}`;
}

const SAY_QUIET = ".sv-think, .sv-work, .sv-tool";

const sayKind = (block) => (block.classList.contains("sv-user") ? "sv-user" : "sv-msg");

function svSaidNear(block, back) {
  let near = back ? block.previousElementSibling : block.nextElementSibling;
  while (near && !near.matches(".sv-msg, .sv-user")) {
    if (!near.matches(SAY_QUIET)) return null;
    near = back ? near.previousElementSibling : near.nextElementSibling;
  }
  return near;
}

function svRunTail(block) {
  const kind = sayKind(block);
  let tail = block;
  for (let next = svSaidNear(tail, false); next?.classList.contains(kind); next = svSaidNear(tail, false)) tail = next;
  return tail.classList.contains("stamped") ? tail : null;
}

function svRunText(block) {
  const kind = sayKind(block);
  const said = [];
  for (let one = block; one?.classList.contains(kind); one = svSaidNear(one, true)) said.unshift(blockText(one));
  return said.join("\n\n");
}

function paintStamp(block) {
  let stamp = block.querySelector(":scope > .sv-stamp");
  if (!stamp) stamp = growStamp(block);
  const at = Number(block.dataset.said || block.dataset.at || 0);
  if (at) stamp.querySelector(".st-when").textContent = phrase("{when} ago", { when: ago(new Date(at).toISOString()) });
}

function growStamp(block) {
  const stamp = document.createElement("div");
  stamp.className = "sv-stamp";
  stamp.innerHTML = `<span class="st-when"></span><button type="button" class="st-copy" title="${phrase("copy this block")}"><svg class="mark" aria-hidden="true"><use href="#i-copy"/></svg><svg class="tick" aria-hidden="true"><use href="#i-check"/></svg></button>`;
  stamp.querySelector(".st-copy").addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const button = ev.currentTarget;
    if (!await toClipboard(svRunText(block))) return;
    clearTimeout(button.dataset.back && Number(button.dataset.back));
    button.classList.add("said");
    button.dataset.back = String(setTimeout(() => {
      if (button.isConnected) button.classList.remove("said");
    }, 1600));
  });
  block.appendChild(stamp);
  return stamp;
}

function svAppend(e, el) {
  return svConvAppend(e, el);
}

const MENU_MARK = { slash: "/", file: "@", peer: "#", person: "~" };

const SLASH_FAMILY_ORDER = ["seat", "repo", "packaged"];

const SLASH_FAMILY_NAME = { seat: "acts on this seat", repo: "from this repository", packaged: "from plugins and skills" };

const slashFamily = (name) => (isNativeCommand(name) ? "seat" : String(name).includes(":") ? "packaged" : "repo");

function paintSaidCommand(el) {
  const said = el.textContent;
  const name = commandOf(said);
  if (!name) return el;
  const token = document.createElement("span");
  token.className = "said-cmd";
  token.textContent = `/${name}`;
  el.textContent = "";
  el.append(token, document.createTextNode(said.slice(name.length + 1)));
  return el;
}

const SAID_IMAGE_MARK = /\[Image #(\d+)\]/g;

function paintSaidImageMarks(el) {
  for (const node of [...el.childNodes]) {
    if (node.nodeType !== 3) {
      if (node.nodeType === 1) paintSaidImageMarks(node);
      continue;
    }
    const said = node.nodeValue;
    SAID_IMAGE_MARK.lastIndex = 0;
    if (!SAID_IMAGE_MARK.test(said)) continue;
    const pieces = [];
    let last = 0;
    SAID_IMAGE_MARK.lastIndex = 0;
    for (let m; (m = SAID_IMAGE_MARK.exec(said)); ) {
      if (m.index > last) pieces.push(document.createTextNode(said.slice(last, m.index)));
      const token = document.createElement("span");
      token.className = "said-img";
      token.textContent = m[0];
      pieces.push(token);
      last = m.index + m[0].length;
    }
    if (last < said.length) pieces.push(document.createTextNode(said.slice(last)));
    node.replaceWith(...pieces);
  }
  return el;
}

function splitLeadingQuotes(text) {
  const lines = String(text ?? "").split("\n");
  if (!lines[0]?.startsWith("> ")) return null;
  const quotes = [];
  let i = 0;
  while (i < lines.length && lines[i].startsWith("> ")) {
    const block = [];
    while (i < lines.length && lines[i].startsWith("> ")) { block.push(lines[i].slice(2)); i++; }
    quotes.push(block.join("\n"));
    if (lines[i] === "" && lines[i + 1]?.startsWith("> ")) i++;
  }
  if (lines[i] === "") i++;
  return { quotes, rest: lines.slice(i).join("\n") };
}

function svQuoteCard(said) {
  const card = document.createElement("blockquote");
  card.className = "sv-said-quote";
  card.innerHTML = `<span class="qi"><svg aria-hidden="true"><use href="#i-quote"/></svg></span><span class="qt"></span>`;
  card.querySelector(".qt").textContent = said;
  return card;
}

function svLine(e, cls, text) {
  return svConvLine(e, cls, text);
}

export { MENU_MARK, SAY_QUIET, SLASH_FAMILY_NAME, SLASH_FAMILY_ORDER, WORK_KINDS, growStamp, paintActivity, paintSaidCommand, paintSaidImageMarks, paintStamp, refreshContext, refreshDriverState, sayKind, slashFamily, splitLeadingQuotes, forgetStruct, structPool, svActivity, svAppend, svDequeue, svDequeuedEarly, svLine, svQueueRefused, svQuoteCard, svRunTail, svRunText, svSaidNear, svWasDequeuedEarly, workSummary, workVerb };
