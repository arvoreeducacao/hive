import { watchProviderTransfer } from "./provider-transfer.js";
import { render } from "./arrange.js";
import { activeItems } from "./blocks.js";
import { whichAction } from "./brand-face.js";
import { NATIVE_COMMANDS, openSeatPicker, paintMentions, refreshCatalog, runNativeCommand, structuredCtrlC, svEvent, svShellBlock, svUserThumb, weaveHandles } from "./chat-and-panes.js";
import { svConvCutKey, svConvDrain, svConvMount, svConvPrepend, svConvSeed, svConvShow, svConvShowNow, svConvFlush, svConvShowSubs, svConvShown, svConvShownAt, svConvTurnStarts, svConvTurnsBehind } from "./conversation-model.js";
import { openContextWindow } from "./context-window.js";
import { COMPOSER_MIN, IS_MAC, SV_ASK, SV_ASK_SLIM, batch, commandCounts, commandSpot, commandsIn, experienceNext, isImageName, isNativeCommand, phrase, raycastOn, st, withCommand, withoutCommand } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { receiving, tiles } from "./leader-key.js";
import { draftFromElsewhere, draftKept, keepDraft, keepDraftNow } from "./kept-drafts.js";
import { IMAGE_MARK_RE, imageTray, inlineImageList, outboundImageMarks } from "./pinned-images.js";
import { shellLineOf, shellModeOf, splitPeerHandle } from "./pure-helpers.js";
import { commandTray } from "./said-command.js";
import { continueList, listMarks } from "/assets/said-lists.mjs";
import { paintActivity, paintSaidCommand, paintStamp, refreshContext, refreshDriverState, structPool, svDequeue, svLine, svQueueRefused, svRunTail, svWasDequeuedEarly } from "./structured-seats.js";
import { wireTalkButton } from "./stt.js";
import { suggestMarkup, suggestMenu } from "./suggest-menu.js";
import { sayToTeamSeat } from "./team.js";
import { HiveSocket, RETRY_AFTER, dropTerminal } from "./terminal-history.js";

function quoteTray(tray, onChange) {
  const held = [];
  const paint = () => {
    tray.classList.toggle("on", !!tray.querySelector(".att"));
    onChange();
  };
  return {
    count: () => held.length,
    all: () => held.map((one) => one.said),
    pinned: () => held.map((one) => ({ said: one.said, kind: one.kind })),
    add(said, kind) {
      const one = { said, kind: kind || "" };
      held.push(one);
      const chip = document.createElement("div");
      chip.className = "att quote";
      chip.innerHTML = `<span class="qi"><svg aria-hidden="true"><use href="#i-quote"/></svg></span><span class="qt"></span><button type="button" class="ax" title="${phrase("drop this quote")}">×</button>`;
      chip.querySelector(".qt").textContent = said;
      chip.title = kind ? `${kind}\n\n${said}` : said;
      chip.querySelector(".ax").addEventListener("click", () => {
        const at = held.indexOf(one);
        if (at >= 0) held.splice(at, 1);
        chip.remove();
        paint();
      });
      tray.appendChild(chip);
      paint();
    },
    clear() {
      held.length = 0;
      for (const chip of tray.querySelectorAll(".att.quote")) chip.remove();
      paint();
    }
  };
}

const asQuote = (said) => String(said).trim().split("\n").map((line) => `> ${line}`).join("\n");

const withQuotes = (quotes, text) => (quotes.length ? `${quotes.map(asQuote).join("\n\n")}${text ? `\n\n${text}` : ""}` : text);

const withoutQuotes = (quotes, said) => {
  const front = withQuotes(quotes, "");
  if (!front || !said.startsWith(front)) return said;
  return said.slice(front.length).replace(/^\n\n/, "");
};

function svAttachImage(e, path) {
  e.tray.add(path);
  e.host.querySelector(".sv-composer").classList.add("ready");
}

function svTypePath(e, path) {
  const box = e.host.querySelector("textarea");
  const at = box.selectionStart ?? box.value.length;
  const space = at > 0 && !/\s$/.test(box.value.slice(0, at)) ? " " : "";
  box.setRangeText(`${space}${path} `, at, box.selectionEnd ?? at, "end");
  box.focus();
  box.dispatchEvent(new Event("input"));
}

function seatReceiving(session, files) {
  const label = files.length > 1 ? `receiving ${files.length} files…` : `receiving ${(files[0]?.name || "the file").split("/").pop()}…`;
  receiving.set(session.name, label);
  const el = tiles.get(session.name);
  const badge = el?.querySelector(".badge");
  if (badge) badge.textContent = label;
  return () => {
    receiving.delete(session.name);
    const now = tiles.get(session.name)?.querySelector(".badge");
    if (now) now.textContent = st.typing === session.name ? phrase("typing here") : phrase("live terminal");
  };
}

function svLoadingChips(e, files) {
  return loadingChips(e.host.querySelector(".sv-attach"), files);
}

function loadingChips(tray, files) {
  if (!tray) return () => {};
  const chips = files.map((f) => {
    const chip = document.createElement("div");
    chip.className = "att loading";
    chip.innerHTML = `<span class="spin"><i></i></span><span class="an"></span>`;
    chip.querySelector(".an").textContent = f.name ? `${f.name} — loading…` : phrase("loading…");
    tray.appendChild(chip);
    return chip;
  });
  tray.classList.add("on");
  return () => {
    for (const chip of chips) chip.remove();
    tray.classList.toggle("on", !!tray.querySelector(".att"));
  };
}

async function attachFilesToSeat(e, files, marked) {
  const done = marked ? () => {} : svLoadingChips(e, files);
  const r = await fetch("/api/screenshot", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: e.name, where: e.where, images: files, attach: true })
  }).then((x) => x.json()).catch(() => null);
  done();
  /* the chips come off whether the upload landed or not, so a refusal here left the person looking
     at a box that quietly refused their picture. say it where the picture would have gone. */
  if (!r?.ok) return void svLine(e, "sv-meta warn", r?.error || phrase("the image did not reach this chat"));
  for (const path of r.paths) {
    if (isImageName(path)) svAttachImage(e, path);
    else svTypePath(e, path);
  }
}

function blockKind(el) {
  if (!el.classList.contains("sv-user")) return phrase("what it answered");
  return el.classList.contains("peer") ? phrase("what another chat wrote here") : phrase("what you asked");
}

function svCmd(e, cmd) {
  if (e.ws?.readyState !== 1) return Promise.resolve({ ok: false, error: phrase("not connected to the driver") });
  const cid = cmd.cid || `c${++e.cmdSeq}-${e.tag}`;
  if (cmd.type === "say") (e.said ||= new Set()).add(cid);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { e.pending.delete(cid); resolve({ ok: false, silent: true, error: phrase("the driver did not answer") }); }, 35000);
    e.pending.set(cid, (reply) => { clearTimeout(timer); resolve({ cid, ...reply }); });
    e.ws.send(JSON.stringify({ ...cmd, cid }));
  });
}

function runShellInChat(e, { command, quiet }) {
  const cid = `s${++e.cmdSeq}-${e.tag}`;
  svShellBlock(e, { cid, command, quiet, running: true });
  svCmd(e, { type: "shell", command, cid, quiet }).then((r) => {
    if (!r?.ok) svShellBlock(e, { cid, command, quiet, error: r?.error || phrase("the command did not reach this chat") });
  });
}

async function interruptStructured(e) {
  const reply = await svCmd(e, { type: "interrupt" });
  const state = await refreshDriverState(e);
  if (!reply?.ok && state?.working !== false) svQueueRefused(e, reply);
  return reply;
}

function svReset(e) {
  e.conv = svConvSeed();
  e.lastSeq = 0;
  e.firstSeq = 0;
  e.earlier = null;
  e.draft = null;
  e.tools = new Map();
  e.asked = new Map();
  e.subs = new Map();
  e.pendingTools = new Map();
  e.shells = new Map();
  e.run = null;
  e.atBottom = true;
  e.lastScrollY = 0;
  svConvShow(e);
  svConvShowSubs(e);
}

const SV_TURNS = 5;

const SV_EARLIER_NEAR = 40;

const SV_KEEP_TURNS = 8;

const SV_KEEP_BLOCKS = 60;

function svEarlierWords(shown, total) {
  return phrase("the last {n} of {total} turns", { n: shown, total });
}

function svEarlierSay(e) {
  const held = svConvTurnStarts(e.conv.blocks).length;
  const beyond = e.earlier?.more ? e.earlier.total - e.earlier.shown : 0;
  return svEarlierWords(held - svConvTurnsBehind(e.conv), beyond + held);
}

function svEarlierBar(e, ev) {
  if (e.earlier) {
    if (ev) Object.assign(e.earlier, { shown: ev.turns, total: ev.turnsTotal, more: true });
    e.earlier.say.textContent = svEarlierSay(e);
    return;
  }
  const bar = document.createElement("div");
  bar.className = "sv-earlier";
  const say = document.createElement("span");
  say.textContent = ev ? svEarlierWords(ev.turns, ev.turnsTotal) : "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = phrase("see what came before");
  btn.addEventListener("click", () => svLoadEarlier(e));
  bar.append(say, btn);
  e.earlier = { shown: ev?.turns || 0, total: ev?.turnsTotal || 0, more: !!ev, bar, say, btn, loading: false, pages: 0 };
  svConvPrepend(e, { key: `${e.tag}:earlier`, kind: "node", el: bar });
}

function svCutTop(e, key) {
  svConvFlush(e);
  const at = svConvShown(e.conv).findIndex((one) => one.key === key);
  const el = at < 0 ? null : e.scroll.children?.[at];
  if (!el?.getBoundingClientRect) return null;
  return el.getBoundingClientRect().top - e.scroll.getBoundingClientRect().top;
}

function svTrimTurns(e) {
  if (!e.convView) return false;
  const key = e.atBottom ? svConvCutKey(e.conv.blocks, SV_KEEP_TURNS, SV_KEEP_BLOCKS) : null;
  const top = key && key !== e.conv.shownFrom ? svCutTop(e, key) : null;
  const moved = top !== null && top <= 0;
  if (moved) e.conv.shownFrom = key;
  if (!e.earlier && !moved) return false;
  if (!e.earlier) svEarlierBar(e, null);
  e.earlier.say.textContent = svEarlierSay(e);
  if (moved) svConvShow(e);
  return moved;
}

function svUnfoldTurns(e) {
  const blocks = e.conv.blocks;
  const at = svConvShownAt(e.conv);
  const starts = svConvTurnStarts(blocks).filter((start) => start < at);
  const back = starts.length > SV_TURNS ? blocks[starts[starts.length - SV_TURNS]].key : null;
  svConvFlush(e);
  const y = e.scroll.scrollTop;
  const tall = e.scroll.scrollHeight;
  e.atBottom = false;
  e.conv.shownFrom = back;
  if (!back && !e.earlier.more) {
    blocks.shift();
    e.earlier = null;
  } else {
    e.earlier.say.textContent = svEarlierSay(e);
  }
  svConvShowNow(e);
  e.settling = true;
  e.scroll.scrollTop = y + (e.scroll.scrollHeight - tall);
}

function svEarlierSeq(events) {
  const seqs = events.map((ev) => Number(ev.seq)).filter((seq) => Number.isFinite(seq) && seq > 0);
  return seqs.length ? Math.min(...seqs) : 0;
}

function svSpliceEarlier(blocks, older) {
  const at = blocks[0]?.kind === "node" && String(blocks[0].key).endsWith(":earlier") ? 1 : 0;
  blocks.splice(at, 0, ...older);
  return blocks;
}

async function svLoadEarlier(e) {
  const held = e.earlier;
  if (!held || held.loading) return;
  if (e.conv.shownFrom) return svUnfoldTurns(e);
  if (!held.more || !e.firstSeq) return;
  held.loading = true;
  held.btn.disabled = true;
  held.btn.textContent = phrase("loading…");
  let got = null;
  try {
    got = await fetch(`/api/seat/earlier?name=${encodeURIComponent(e.name)}&where=${e.where}&before=${e.firstSeq}&turns=${SV_TURNS}`).then((r) => r.json());
  } catch {}
  held.loading = false;
  if (!got || !Array.isArray(got.events)) {
    held.btn.disabled = false;
    held.btn.textContent = phrase("see what came before");
    return;
  }
  const older = svEarlierBlocks(e, got.events, ++held.pages);
  svConvFlush(e);
  const y = e.scroll.scrollTop;
  const tall = e.scroll.scrollHeight;
  e.atBottom = false;
  svSpliceEarlier(e.conv.blocks, older);
  e.firstSeq = svEarlierSeq(got.events) || e.firstSeq;
  held.shown = Math.min(held.total, held.shown + SV_TURNS);
  if (got.earlier) {
    held.say.textContent = svEarlierSay(e);
    held.btn.disabled = false;
    held.btn.textContent = phrase("see what came before");
  } else {
    e.conv.blocks.shift();
    e.earlier = null;
  }
  svConvShowNow(e);
  e.settling = true;
  e.scroll.scrollTop = y + (e.scroll.scrollHeight - tall);
}

function svEarlierBlocks(e, events, page) {
  const kept = { conv: e.conv, lastSeq: e.lastSeq, atBottom: e.atBottom, draft: e.draft, run: e.run, sent: e.sent, firstSeq: e.firstSeq, convView: e.convView };
  e.conv = svConvSeed();
  e.convView = null;
  e.conv.seq = -page * 1000000;
  e.lastSeq = 0;
  e.atBottom = false;
  e.draft = null;
  e.run = null;
  e.sent = [];
  try {
    batch(() => {
      let at = 0;
      try {
        for (const ev of events) { at++; svEvent(e, { ...ev, replayed: true }); }
        svConvDrain(e, true);
      } catch (err) {
        console.warn(`an earlier page stopped at event ${at} of ${events.length} (${events[at - 1]?.type}/${events[at - 1]?.subtype || ""}): ${String(err?.stack || err).split("\n").slice(0, 5).join(" | ")}`);
      }
    });
  } finally {
    const older = e.conv.blocks;
    e.conv = kept.conv;
    e.lastSeq = kept.lastSeq;
    e.atBottom = kept.atBottom;
    e.draft = kept.draft;
    e.run = kept.run;
    e.sent = kept.sent;
    e.firstSeq = kept.firstSeq;
    e.convView = kept.convView;
    return older;
  }
}

function svEarlier(e, ev) {
  return svEarlierBar(e, ev);
}

function connectStructured(e) {
  const ws = new HiveSocket(`/events?name=${encodeURIComponent(e.name)}&where=${e.where}&from=${e.lastSeq}&window=${e.window || "turns"}&turns=${SV_TURNS}`);
  e.ws = ws;
  e.since = Date.now();
  ws.onmessage = (mev) => {
    let obj;
    try { obj = JSON.parse(mev.data); } catch { return; }
    if (obj.bridge_reply) {
      const waiter = e.pending.get(obj.cid);
      if (waiter) { e.pending.delete(obj.cid); waiter(obj.bridge_reply); }
      else if (obj.bridge_reply.error) svLine(e, "sv-meta warn", obj.bridge_reply.error);
      return;
    }
    svEvent(e, obj);
  };
  ws.onclose = () => { if (e.ws === ws) e.ws = null; };
  ws.onerror = () => {};
  ws.onopen = () => setTimeout(() => {
    if (e.ws !== ws) return;
    refreshDriverState(e);
    if (!e.context) refreshContext(e);
    if (!e.catalog) refreshCatalog(e);
    void watchProviderTransfer(e);
  }, 1500);
}

function rememberSent(e, text, seq) {
  const clean = String(text || "").trim();
  if (!clean) return;
  if (Number.isFinite(seq)) {
    if (e.sentSeqs.has(seq)) return;
    e.sentSeqs.add(seq);
  }
  if (e.sent.at(-1) !== clean) e.sent.push(clean);
  if (e.sent.length > 200) e.sent.shift();
}

function stepHistory(sent, idx, dir) {
  if (!sent.length) return null;
  if (dir < 0) {
    const next = idx == null ? sent.length - 1 : Math.max(0, idx - 1);
    return { idx: next, text: sent[next] };
  }
  if (idx == null) return { idx: null, text: "" };
  const next = idx + 1;
  return next >= sent.length ? { idx: null, text: "" } : { idx: next, text: sent[next] };
}

function getStructured(s) {
  let e = structPool.get(s.name);
  if (e) return e;
  const host = document.createElement("div");
  host.className = s.mirror ? "sv sv-mirror" : "sv";
  host.innerHTML = `
    <div class="sv-scroll"></div>
    <div class="sv-jump-anchor"><button type="button" class="sv-jump" hidden title="${phrase("back to the end of the chat — new messages pin again")}">${phrase("↓ latest")}</button></div>
    <div class="sv-subs" data-fold="auto"><button type="button" class="shead" title="${phrase("fold the background agents away")}"><i class="sdot"></i><span>${phrase("in background")}</span><span class="scount"></span><svg class="schev" aria-hidden="true"><use href="#i-chev"/></svg></button><div class="sublist"></div></div>
    <div class="sv-queue"></div>
    ${suggestMarkup()}
    <form class="sv-composer">
      <div class="sv-activity"><span class="pulse"></span><span class="verb"></span><span class="clock"></span></div>
      <div class="sv-attach"></div>
      <div class="sv-well"><div class="sv-ink" aria-hidden="true"></div><textarea rows="1" placeholder="${phrase(SV_ASK)}"></textarea></div>
      <div class="sv-foot">
        <span class="sv-pick">
          <button type="button" class="sv-pill sv-pill-model"></button>
          <button type="button" class="sv-pill sv-pill-effort"></button>
          <button type="button" class="sv-pill sv-pill-account"></button>
        </span>
        <button type="button" class="sv-ctx" title="${phrase("context window used — click for the breakdown and to compact")}"><i class="bar"><i></i></i><span class="pct"><span class="full"></span><span class="short"></span></span></button>
        <span class="sv-btns">
          <button type="button" class="sv-stop" title="${phrase("interrupt the turn (ctrl+c)")}"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4.6" y="4.6" width="6.8" height="6.8" rx="1.4" fill="currentColor"/></svg></button>
          <button type="button" class="sv-talk" hidden aria-pressed="false" aria-label="${phrase("talk instead of typing")}"><svg viewBox="0 0 16 16" aria-hidden="true"><use href="#i-mic"/></svg></button>
          <button type="submit" class="sv-send" title="${phrase("send (enter)")}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.6V3.8M4.4 7.2 8 3.6l3.6 3.6" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </span>
      </div>
    </form>`;
  const scroll = host.querySelector(".sv-scroll");
  e = { name: s.name, where: s.where, mirror: s.mirror || null, host, scroll, ws: null, since: 0, lastSeq: 0, window: "turns",
        tag: Math.random().toString(36).slice(2, 7), said: new Set(),
        draft: null, tools: new Map(), asked: new Map(), subs: new Map(), pending: new Map(), cmdSeq: 0, atBottom: true, run: null,
        turnOpen: false, activity: "", activitySince: 0, pendingTools: new Map(), queuedEls: [],
        sent: [], sentSeqs: new Set(), histIdx: null,
        catalog: null, catalogError: "", catalogPull: null, catalogTries: 0, catalogWait: null,
        model: "", effort: "", account: undefined, menu: null, quotes: null, talkOff: null };
  e.talkOff = wireTalkButton(host.querySelector(".sv-talk"), () => host.querySelector(".sv-composer textarea"));
  const jump = host.querySelector(".sv-jump");
  const paintJump = () => { jump.hidden = e.atBottom; };
  scroll.addEventListener("scroll", () => {
    const y = scroll.scrollTop;
    const bottom = y + scroll.clientHeight >= scroll.scrollHeight - 48;
    const wasBottom = e.atBottom;
    if (e.settling) e.settling = false;
    else if (y < (e.lastScrollY || 0)) e.atBottom = bottom;
    else if (bottom) e.atBottom = true;
    e.lastScrollY = y;
    paintJump();
    if (e.atBottom && !wasBottom) svTrimTurns(e);
    if (y < SV_EARLIER_NEAR && e.earlier && !e.earlier.loading) svLoadEarlier(e);
  });
  jump.addEventListener("click", () => {
    e.atBottom = true;
    scroll.scrollTop = scroll.scrollHeight;
    paintJump();
    svTrimTurns(e);
  });
  const subsHead = host.querySelector(".sv-subs .shead");
  subsHead.addEventListener("click", () => {
    if (experienceNext()) return;
    const dock = host.querySelector(".sv-subs");
    const list = dock.querySelector(".sublist");
    dock.dataset.fold = list.offsetHeight ? "shut" : "open";
    svReserve(e);
  });
  let roomFrame = 0;
  const room = new ResizeObserver(() => {
    if (roomFrame) return;
    roomFrame = requestAnimationFrame(() => { roomFrame = 0; svGutter(e); svNarrow(e); svReserve(e); });
  });
  room.observe(host);
  for (const el of host.children) if (el !== scroll) room.observe(el);
  room.observe(host.querySelector(".sv-activity"));
  const gutter = new ResizeObserver(() => svGutter(e));
  gutter.observe(scroll);
  /* the suggest popover's hidden toggle fires the resize above right away, but at that same
     synchronous tick the composer's own margin-top is still mid-transition — getComputedStyle
     reports the value it is animating FROM, not TO — so svReserve under-reserves by the swing
     (29px here) and the last line sits under the composer until something resizes again. Catching
     the transition's end, once the margin has actually settled, is what corrects it back. */
  host.querySelector(".sv-composer").addEventListener("transitionend", (ev) => {
    if (ev.target === ev.currentTarget) svReserve(e);
  });
  new ResizeObserver(() => {
    if (e.atBottom) scroll.scrollTop = scroll.scrollHeight;
  }).observe(host);
  const textarea = host.querySelector("textarea");
  const ink = host.querySelector(".sv-ink");
  /* the box paints nothing itself: when a command is in the text, the textarea goes transparent and
     this layer redraws the same string with that one word marked, wherever the person called it.
     no command, no layer, no risk. */
  const paintInk = () => {
    const composer = host.querySelector(".sv-composer");
    const said = textarea.value;
    const shellMode = shellModeOf(said);
    composer.classList.toggle("shell", !!shellMode);
    composer.classList.toggle("quiet", shellMode === "quiet");
    composer.dataset.shellMode = shellMode === "quiet" ? phrase("!! for shell mode · not kept in the chat") : shellMode ? phrase("! for shell mode") : "";
    const name = e.command?.name() || "";
    const spot = name ? commandSpot(said, name) : null;
    const marks = [...(shellMode ? [{ start: 0, end: shellMode === "quiet" ? 2 : 1, cls: "ink-shell" }] : []), ...(spot ? [{ ...spot, cls: "ink-cmd" }] : []), ...listMarks(said).map((mark) => ({ ...mark, cls: mark.kind === "ul" ? "ink-bullet" : "ink-num" }))]
      .sort((a, b) => a.start - b.start)
      .filter((mark, at, all) => !at || mark.start >= all[at - 1].end);
    if (!marks.length) {
      ink.textContent = "";
      composer.classList.remove("inked");
      return;
    }
    ink.textContent = "";
    let last = 0;
    for (const mark of marks) {
      const token = document.createElement("span");
      token.className = mark.cls;
      token.textContent = said.slice(mark.start, mark.end);
      ink.append(document.createTextNode(said.slice(last, mark.start)), token);
      last = mark.end;
    }
    ink.append(document.createTextNode(said.slice(last)));
    /* a textarea keeps room for the line after a trailing newline; a pre-wrap div does not. */
    if (said.endsWith("\n")) ink.append(document.createTextNode("\u200b"));
    composer.classList.add("inked");
    ink.scrollTop = textarea.scrollTop;
  };
  /* typing a command by hand pins it, and editing that word away — backspace, paste, undo — gives
     it up, without any of those paths having to know the command exists. */
  const syncCommand = () => {
    const known = (name) => (e.slash || []).includes(name) || isNativeCommand(name);
    const found = commandsIn(textarea.value).filter((one) => known(one.name) && commandCounts(one, textarea.value));
    const held = e.command.name();
    /* the pin only moves when the text it points at is gone: writing a second command leaves the
       first one running, and the words of the second are just words until they are picked. */
    if (held && found.some((one) => one.name === held)) return;
    e.command.set(found[0]?.name || "");
  };
  e.tray = imageTray(host.querySelector(".sv-attach"), textarea, () => ({ where: e.where, name: e.name }));
  const paintReady = () => host.querySelector(".sv-composer")
    .classList.toggle("ready", !!textarea.value.trim() || !!e.tray.count() || !!e.quotes?.count() || !!e.command?.count());
  e.quotes = quoteTray(host.querySelector(".sv-attach"), paintReady);
  e.command = commandTray(() => { paintReady(); paintInk(); });
  /* fromDraft says the words came from this seat's textarea. the universal composer sends
     with it false, so what the person is writing down here — and what they attached — survives. */
  const deliver = (text, sending, fromDraft, cutIn = false) => {
    if (e.providerTransfer && e.providerTransfer.phase !== "waiting") {
      svLine(e, "sv-meta", phrase("the provider is changing; your draft is kept here until it finishes"));
      return;
    }
    if (!text && !sending.length) return;
    e.histIdx = null;
    const pinned = fromDraft ? e.quotes.pinned() : [];
    const shellLine = shellLineOf(text);
    if (shellLine && e.mirror) return void svLine(e, "sv-meta warn", phrase("a command runs only on the machine that owns the chat"));
    if (shellLine) {
      rememberSent(e, text);
      runShellInChat(e, shellLine);
      if (fromDraft) { textarea.value = ""; e.tray.clear(); e.command.clear(); paintReady(); paintInk(); autosize(); keepDraftNow(e.name, ""); }
      return;
    }
    /* a mirrored seat has no socket into it: what is typed here travels as a file to the other
       machine, and the panel that owns the seat is the one that types it in. the bubble is painted
       on the spot because the answer comes back on the next read of the file, seconds later. */
    if (e.mirror) {
      if (fromDraft) { e.tray.clear(); e.quotes.clear(); e.command.clear(); host.querySelector(".sv-composer").classList.remove("ready"); }
      const said = sending.length ? inlineImageList(text, sending) : text;
      if (!said) return;
      rememberSent(e, said);
      svLine(e, "sv-user", said);
      sayToTeamSeat(e.mirror.dev, e.mirror.seat, said, textarea);
      if (fromDraft) { textarea.value = ""; textarea.style.height = ""; paintInk(); keepDraftNow(e.name, ""); }
      return;
    }
    const native = text.match(NATIVE_COMMANDS);
    if (native && !(native[1] === "config" && native[2])) {
      rememberSent(e, text);
      runNativeCommand(e, native[1], native[2]);
      /* the command the app answers itself is spent too: leaving it pinned would keep its mark
         painted over an empty box, and the next enter would ask for it again. */
      if (fromDraft) { textarea.value = ""; e.command.clear(); paintReady(); paintInk(); autosize(); keepDraftNow(e.name, ""); }
      return;
    }
    svCmd(e, sending.length ? { type: "say", text, images: sending } : { type: "say", text }).then((r) => {
      /* the driver refusing, the socket being down, the driver not answering at all: every one of
         these used to end here without a word, and the person read it as a box that stopped
         working. the words stay in the box and the reason goes into the conversation. */
      if (!r?.ok) return void svLine(e, "sv-meta warn", r?.error || phrase("the message did not reach this chat — it is still in the box"));
      if (fromDraft) {
        e.tray.clear();
        e.quotes.clear();
        e.command.clear();
        e.host.querySelector(".sv-composer").classList.remove("ready");
      }
      const shownText = typeof r.shown === "string" ? r.shown : text;
      const wentIn = svWasDequeuedEarly(e, r.cid);
      const waits = !wentIn && (r.queued ?? (e.turnOpen && !r.dismissed));
      if (waits && cutIn) {
        const bubble = svLine(e, "sv-user", splitPeerHandle(text).body || "(image)");
        paintMentions(bubble);
        if (r.cid) bubble.dataset.cid = r.cid;
        for (const path of sending) svUserThumb(e, bubble, path);
        interruptStructured(e);
      } else if (waits) {
        const tray = e.host.querySelector(".sv-queue");
        const item = document.createElement("div");
        item.className = "sv-qitem";
        item.dataset.text = shownText;
        item.dataset.images = JSON.stringify(sending);
        item.dataset.quotes = JSON.stringify(pinned);
        item.dataset.cid = r.cid || "";
        item.innerHTML = `<span class="qbadge">${phrase("queued")}</span><span class="qmarks"></span><span class="qtxt"></span><button type="button" class="qnow" title="${phrase("push it into the turn now — no waiting ({n})", { n: IS_MAC ? "⌥⏎" : "alt+enter" })}"><svg aria-hidden="true"><use href="#i-qnow"/></svg></button><button type="button" class="qdrop" title="${phrase("take it back into the box — it will not be sent (↑ in the empty box)")}"><svg aria-hidden="true"><use href="#i-qback"/></svg></button>`;
        const shown = withoutQuotes(pinned.map((one) => one.said), shownText);
        item.querySelector(".qmarks").innerHTML =
          (sending.length ? `<svg aria-hidden="true"><use href="#i-image"/></svg><b>${sending.length}</b>` : "")
          + (pinned.length ? `<svg aria-hidden="true"><use href="#i-quote"/></svg><b>${pinned.length}</b>` : "");
        item.querySelector(".qtxt").textContent = splitPeerHandle(shown).body;
        paintSaidCommand(item.querySelector(".qtxt"));
        item.querySelector(".qnow").addEventListener("click", () => sendNow(item));
        item.querySelector(".qdrop").addEventListener("click", () => takeBack(item));
        tray.prepend(item);
        tray.classList.add("on");
        (e.queuedEls ||= []).push(item);
        paintActivity(e);
      } else {
        const bubble = svLine(e, "sv-user", shownText || "(image)");
        for (const path of sending) svUserThumb(e, bubble, path);
      }
      if (fromDraft) { textarea.value = ""; textarea.style.height = ""; paintInk(); keepDraftNow(e.name, ""); }
    });
  };
  const dropFromTray = (item) => {
    const i = (e.queuedEls || []).indexOf(item);
    if (i >= 0) e.queuedEls.splice(i, 1);
    item.remove();
    const tray = e.host.querySelector(".sv-queue");
    if (tray) tray.classList.toggle("on", !!(e.queuedEls || []).length);
  };
  const sendNow = (item) => {
    svCmd(e, { type: "saynow", target: item.dataset.cid }).then((r) => {
      if (!r?.ok) return void svQueueRefused(e, r);
      dropFromTray(item);
      if (item.dataset.gone) return void paintActivity(e);
      const bubble = svLine(e, "sv-user", splitPeerHandle(item.dataset.text || "").body || "(image)");
      paintMentions(bubble);
      if (item.dataset.cid) bubble.dataset.cid = item.dataset.cid;
      for (const path of JSON.parse(item.dataset.images || "[]")) svUserThumb(e, bubble, path);
      paintActivity(e);
    });
  };
  const takeBack = (item) => {
    svCmd(e, { type: "unsay", target: item.dataset.cid }).then((r) => {
      if (!r?.ok) {
        if (r?.gone) svDequeue(e, item);
        return void svQueueRefused(e, r);
      }
      dropFromTray(item);
      const imgs = JSON.parse(item.dataset.images || "[]");
      const quoted = JSON.parse(item.dataset.quotes || "[]");
      const kept = new Set();
      IMAGE_MARK_RE.lastIndex = 0;
      const back = withoutQuotes(quoted.map((one) => one.said), item.dataset.text || "").replace(IMAGE_MARK_RE, (mark, n) => {
        const path = imgs[Number(n) - 1];
        if (!path) return mark;
        kept.add(Number(n) - 1);
        const fresh = e.tray.mint();
        e.tray.restore(path, fresh);
        return `[Image #${fresh}]`;
      });
      if (back) textarea.value = textarea.value.trim() ? `${textarea.value}\n${back}` : back;
      keepDraft(e.name, textarea.value);
      for (const path of imgs.filter((_, i) => !kept.has(i))) svAttachImage(e, path);
      for (const one of quoted) e.quotes.add(one.said, one.kind);
      paintReady();
      paintInk();
      paintActivity(e);
      autosize();
      textarea.focus();
    });
  };
  const say = (cutIn = false) => {
    const out = outboundImageMarks(textarea.value.trim(), e.tray.marks);
    const woven = weaveHandles(out.text, st.data.sessions, e.name);
    /* a handle the box cannot resolve used to swallow the whole message: enter pressed, nothing
       sent, nothing said. the box keeps the words and the reason goes into the conversation. */
    if (woven.error) return void svLine(e, "sv-meta warn", woven.error);
    /* the mark can sit anywhere in the box, but a session only reads a command in front of the
       words: what goes out is the same sentence with that one word lifted to the head. */
    const called = e.command.name();
    deliver(withCommand(called, withQuotes(e.quotes.all(), withoutCommand(called, woven.text))), out.images, true, cutIn);
  };
  host.querySelector(".sv-composer").addEventListener("submit", (ev) => { ev.preventDefault(); say(); });
  host.querySelector(".sv-pill-model").addEventListener("click", () => openSeatPicker(e, "model"));
  host.querySelector(".sv-pill-effort").addEventListener("click", () => openSeatPicker(e, "effort"));
  host.querySelector(".sv-pill-account").addEventListener("click", () => openSeatPicker(e, "account"));
  host.querySelector(".sv-ctx").addEventListener("click", () => experienceNext() ? openContextWindow(e) : runNativeCommand(e, "context"));
  e.type = (text, images = []) => deliver(String(text).trim(), Array.isArray(images) ? images : [], false);
  /* the stamp lights on the tail of the run the mouse is over, wherever inside the run it is —
     hovering the first of three paragraphs is still hovering that answer. */
  let lit = null;
  const light = (tail) => {
    if (lit === tail) return;
    lit?.classList.remove("lit");
    lit = tail || null;
    if (!lit) return;
    paintStamp(lit);
    lit.classList.add("lit");
  };
  scroll.addEventListener("mouseover", (ev) => {
    const block = ev.target.closest?.(".sv-msg, .sv-user");
    light(block && scroll.contains(block) ? svRunTail(block) : null);
  });
  scroll.addEventListener("mouseleave", () => light(null));
  const quotePop = document.createElement("button");
  quotePop.type = "button";
  quotePop.className = "sv-quote-pop";
  quotePop.innerHTML = `<svg aria-hidden="true"><use href="#i-quote"/></svg><span>${phrase("quote")}</span>`;
  host.appendChild(quotePop);
  let picked = null;
  const dropQuotePop = () => { quotePop.classList.remove("on"); picked = null; };
  /* only a stretch inside one answer — or one thing you said — can be quoted: a selection that
     spills across blocks has no single voice to attribute it to. */
  const readSelection = () => {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const said = sel.toString().trim();
    if (!said) return null;
    const range = sel.getRangeAt(0);
    const holder = range.commonAncestorContainer;
    const el = holder.nodeType === 1 ? holder : holder.parentElement;
    const block = el?.closest?.(".sv-msg, .sv-user");
    if (!block || !scroll.contains(block)) return null;
    return { said, block, box: range.getBoundingClientRect() };
  };
  const offerQuote = () => {
    const found = readSelection();
    if (!found) return dropQuotePop();
    picked = found;
    quotePop.classList.add("on");
    const frame = host.getBoundingClientRect();
    const top = found.box.bottom - frame.top + 6;
    const left = found.box.left - frame.left;
    quotePop.style.top = `${Math.max(2, Math.min(top, frame.height - quotePop.offsetHeight - 2))}px`;
    quotePop.style.left = `${Math.max(2, Math.min(left, frame.width - quotePop.offsetWidth - 2))}px`;
  };
  scroll.addEventListener("mousedown", dropQuotePop);
  scroll.addEventListener("mouseup", () => setTimeout(offerQuote, 0));
  scroll.addEventListener("scroll", dropQuotePop);
  quotePop.addEventListener("mousedown", (ev) => ev.preventDefault());
  quotePop.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (!picked) return;
    e.quotes.add(picked.said, blockKind(picked.block));
    document.getSelection()?.removeAllRanges();
    dropQuotePop();
    textarea.focus();
  });
  host.querySelector(".sv-stop").addEventListener("click", () => {
    interruptStructured(e);
  });
  if (raycastOn()) seatComposer(e);
  const autosize = () => {
    textarea.style.height = "";
    const room = svRoom(host, textarea);
    textarea.style.minHeight = room < COMPOSER_MIN ? `${Math.max(SV_FLOOR, room)}px` : "";
    const grown = Math.min(260, textarea.scrollHeight, room);
    textarea.style.height = grown > (raycastOn() ? SV_LINE : COMPOSER_MIN) ? `${grown}px` : "";
  };
  new ResizeObserver(() => { if (textarea.value) autosize(); }).observe(host);
  const fill = (text) => {
    textarea.value = text;
    autosize();
    paintReady();
    paintInk();
  };
  e.fill = fill;

  const menu = suggestMenu({
    textarea,
    suggest: host.querySelector(".sv-suggest"),
    mine: () => e.name,
    commands: () => ({ list: e.slash || [], info: e.slashInfo || {}, none: phrase("the command list arrives with the session's first turn") }),
    files: {
      searching: () => phrase("searching the session's directory…"),
      none: () => phrase("nothing with that name in the session's directory"),
      find: (q) => fetch(`/api/files?name=${encodeURIComponent(e.name)}&where=${e.where}&q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => null)
    },
    grow: autosize,
    /* the command stays where it was called and takes the mark from whatever held it before —
       and that one goes on being words, in its place, because nothing the person wrote vanishes. */
    onPick: (kind, item) => {
      if (kind === "slash") e.command.set(item);
      else syncCommand();
      paintInk();
    }
  });

  const recall = (text) => {
    textarea.value = text;
    textarea.setSelectionRange(text.length, text.length);
    keepDraft(e.name, text);
    autosize();
    paintReady();
    paintInk();
  };
  textarea.addEventListener("keydown", (kev) => {
    if (whichAction(kev)?.action === "release") return;
    kev.stopPropagation();
    if (kev.key === "c" && kev.ctrlKey && !kev.altKey && !kev.metaKey && !kev.shiftKey) {
      if (textarea.selectionStart !== textarea.selectionEnd) return;
      kev.preventDefault();
      structuredCtrlC(e);
      return;
    }
    /* the marked word is one thing: the first backspace inside it selects the whole command, the
       second gives it up. a command is not taken back letter by letter. */
    if (kev.key === "Backspace" && !kev.metaKey && !kev.ctrlKey && !kev.altKey && !kev.shiftKey) {
      const spot = commandSpot(textarea.value, e.command.name());
      const at = textarea.selectionStart ?? 0;
      if (spot && at > spot.start && at <= spot.end && at === textarea.selectionEnd) {
        kev.preventDefault();
        textarea.setSelectionRange(spot.start, spot.end);
        return;
      }
    }
    if (menu.key(kev)) return;
    if (kev.key === "Enter" && kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && e.queuedEls?.length) {
      kev.preventDefault();
      menu.close();
      sendNow(e.queuedEls[e.queuedEls.length - 1]);
      return;
    }
    if (kev.key === "ArrowUp" && !kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && !textarea.value && e.queuedEls?.length) {
      kev.preventDefault();
      takeBack(e.queuedEls[e.queuedEls.length - 1]);
      return;
    }
    if (kev.key === "ArrowUp" && !kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && !textarea.value) {
      const step = stepHistory(e.sent, e.histIdx, -1);
      if (!step) return;
      kev.preventDefault();
      e.histIdx = step.idx;
      recall(step.text);
      return;
    }
    if (kev.key === "ArrowDown" && !kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && e.histIdx != null) {
      kev.preventDefault();
      const step = stepHistory(e.sent, e.histIdx, 1);
      e.histIdx = step.idx;
      recall(step.text);
      return;
    }
    if (kev.key === "Enter" && kev.shiftKey && !kev.altKey && !kev.ctrlKey && !kev.metaKey) {
      const step = continueList(textarea.value, textarea.selectionStart ?? 0, textarea.selectionEnd ?? 0);
      if (step) {
        kev.preventDefault();
        textarea.setSelectionRange(step.from, step.to);
        if (!(step.text ? document.execCommand?.("insertText", false, step.text) : document.execCommand?.("delete"))) {
          textarea.setRangeText(step.text, step.from, step.to, "end");
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return;
      }
    }
    if (kev.key === "Enter" && !kev.shiftKey) { kev.preventDefault(); menu.close(); say(!kev.altKey && (IS_MAC ? kev.metaKey : kev.ctrlKey)); }
    if (kev.key === "Escape") {
      kev.preventDefault();
      if (st.typing === e.name) releaseKeyboard();
      else textarea.blur();
    }
  });
  textarea.addEventListener("input", () => {
    e.histIdx = null;
    keepDraft(e.name, textarea.value);
    e.tray.sync();
    autosize();
    menu.compute();
    syncCommand();
    paintReady();
    paintInk();
  });
  textarea.addEventListener("scroll", () => { ink.scrollTop = textarea.scrollTop; });
  textarea.addEventListener("blur", () => { keepDraftNow(e.name, textarea.value); setTimeout(menu.close, 150); });
  host.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const at = activeItems().findIndex((it) => it.kind === "session" && it.name === e.name);
    if (at >= 0 && at !== st.focus) { st.focus = at; render(); }
  });
  svConvMount(e);
  const left = draftKept(s.name);
  if (left) fill(left);
  structPool.set(s.name, e);
  return e;
}

function mountStructured(s, well) {
  dropTerminal(s.name);
  const e = getStructured(s);
  well.classList.add("structured");
  if (e.host.parentElement !== well) { well.appendChild(e.host); svReserve(e); }
  if (!e.ws && Date.now() - (e.since || 0) >= RETRY_AFTER) connectStructured(e);
}

function soakDrafts() {
  for (const e of structPool.values()) {
    const textarea = e.host.querySelector(".sv-composer textarea");
    if (!textarea) continue;
    const said = draftFromElsewhere(e.name, textarea.value, document.activeElement === textarea);
    if (said !== null) e.fill?.(said);
  }
}

function keepStructuredUp() {
  for (const e of structPool.values()) {
    if (!e.host.isConnected || e.mirror) continue;
    if (e.ws || Date.now() - (e.since || 0) < RETRY_AFTER) continue;
    connectStructured(e);
  }
}

function svGutter(e) {
  const bar = e.scroll.offsetWidth - e.scroll.clientWidth;
  if (e.bar === bar) return;
  e.bar = bar;
  e.host.style.setProperty("--sv-bar", `${bar}px`);
}

function svNarrow(e) {
  const narrow = e.host.clientWidth < 640;
  if (e.narrow === narrow) return;
  e.narrow = narrow;
  e.host.classList.toggle("sv-narrow", narrow);
}

const SV_AIR = 38;

const SV_SPARE = 64;

const SV_FLOOR = 24;

function svRoom(host, textarea, spare = SV_SPARE) {
  const composer = textarea.closest(".sv-composer");
  if (!composer || !host.clientHeight) return Infinity;
  let taken = spare + composer.offsetHeight - textarea.offsetHeight;
  for (const el of host.children) {
    if (el.classList.contains("sv-scroll") || !el.offsetHeight) continue;
    const style = getComputedStyle(el);
    if (style.position === "absolute") continue;
    taken += (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
    if (el !== composer) taken += el.offsetHeight;
  }
  return Math.max(0, host.clientHeight - taken);
}

function svFlightScale(host) {
  const seen = host.getBoundingClientRect().height;
  const laid = host.offsetHeight;
  return seen && laid ? seen / laid : 1;
}

function svReserve(e) {
  if (!e.host.isConnected) return;
  const scale = svFlightScale(e.host);
  const floor = e.host.getBoundingClientRect().bottom;
  let ceiling = floor;
  for (const el of [...e.host.children, ...e.host.querySelectorAll(".sv-composer .sv-activity")]) {
    if (el === e.scroll || !el.offsetHeight) continue;
    const style = getComputedStyle(el);
    if (style.position === "absolute" && !el.classList.contains("sv-activity")) continue;
    const top = el.getBoundingClientRect().top - (parseFloat(style.marginTop) || 0) * scale;
    if (top < ceiling) ceiling = top;
  }
  const air = parseFloat(getComputedStyle(e.host).getPropertyValue("--sv-air-room")) || SV_AIR;
  const room = Math.max(8, Math.round((floor - ceiling) / scale) + air);
  if (e.reserved === room) return;
  e.reserved = room;
  e.scroll.style.paddingBottom = `${room}px`;
  e.scroll.style.setProperty("--sv-fade", `${room}px`);
  e.scroll.style.setProperty("--sv-air", `${air}px`);
  if (e.atBottom) e.scroll.scrollTop = e.scroll.scrollHeight;
}

let healFrame = 0;

function healStructuredScroll() {
  if (healFrame) return;
  healFrame = requestAnimationFrame(() => {
    healFrame = 0;
    const due = [];
    for (const e of structPool.values()) {
      if (!e.host.isConnected || e.scroll.scrollTop) continue;
      const y = e.atBottom ? e.scroll.scrollHeight : Math.min(e.lastScrollY || 0, e.scroll.scrollHeight);
      if (y) due.push([e, y]);
    }
    for (const [e, y] of due) e.scroll.scrollTop = y;
  });
}

const SV_LINE = 20;

function shapeComposer(host, on, halt = null) {
  const form = host.querySelector(".sv-composer");
  if (!form || !!form.querySelector(":scope > .sv-box") === on) return;
  const activity = form.querySelector(".sv-activity");
  const attach = form.querySelector(".sv-attach");
  const well = form.querySelector(".sv-well");
  const btns = form.querySelector(".sv-btns");
  const foot = form.querySelector(".sv-foot");
  if (!on) {
    form.prepend(activity, attach, well);
    foot.append(btns);
    form.querySelector(":scope > .sv-box").remove();
    for (const extra of foot.querySelectorAll(":scope > :is(.sv-when, .sv-keys, .sv-halt)")) extra.remove();
    activity.classList.remove("tool", "asks");
    return;
  }
  const box = document.createElement("div");
  box.className = "sv-box";
  const line = document.createElement("div");
  line.className = "sv-line";
  line.append(well, btns);
  box.append(attach, line);
  form.prepend(box);
  foot.prepend(activity);
  if (!halt) return;
  const hold = document.createElement("div");
  hold.innerHTML = `<span class="sv-when"></span><span class="sv-keys"><kbd class="rc-key">↵</kbd>${phrase("send")}<kbd class="rc-key">⇧↵</kbd>${phrase("line")}<kbd class="rc-key">${IS_MAC ? "⌘↵" : "Ctrl+↵"}</kbd>${phrase("stop and send")}</span><button type="button" class="sv-halt" title="${phrase("interrupt the turn (ctrl+c)")}">${phrase("interrupt")}<kbd class="rc-key">${IS_MAC ? "⌃C" : "Ctrl+C"}</kbd></button>`;
  activity.after(...hold.children);
  foot.querySelector(".sv-halt").addEventListener("click", halt);
}

function seatComposer(e) {
  const on = raycastOn();
  shapeComposer(e.host, on, () => interruptStructured(e));
  const textarea = e.host.querySelector(".sv-composer textarea");
  if (on && textarea && textarea.placeholder === phrase(SV_ASK)) textarea.placeholder = phrase(SV_ASK_SLIM);
}

document.addEventListener("hive:experience", (event) => {
  const { experience, was } = event.detail || {};
  if (experience !== "raycast" && was !== "raycast") return;
  for (const e of structPool.values()) {
    seatComposer(e);
    paintActivity(e);
  }
});

export { SV_AIR, SV_EARLIER_NEAR, SV_FLOOR, SV_KEEP_BLOCKS, SV_KEEP_TURNS, SV_SPARE, SV_TURNS, asQuote, attachFilesToSeat, blockKind, connectStructured, getStructured, interruptStructured, healStructuredScroll, keepStructuredUp, loadingChips, mountStructured, quoteTray, rememberSent, seatReceiving, shapeComposer, soakDrafts, stepHistory, svAttachImage, svCmd, svEarlier, svEarlierBar, svEarlierBlocks, svEarlierSay, svEarlierSeq, svEarlierWords, svFlightScale, svGutter, svLoadEarlier, svLoadingChips, svNarrow, svReserve, svReset, svRoom, svSpliceEarlier, svTrimTurns, svTypePath, svUnfoldTurns, withQuotes, withoutQuotes };
