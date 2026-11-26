import { watchProviderTransfer } from "./provider-transfer.js";
import { render } from "./arrange.js";
import { activeItems } from "./blocks.js";
import { whichAction } from "./brand-face.js";
import { NATIVE_COMMANDS, openSeatPicker, paintMentions, refreshCatalog, runNativeCommand, structuredCtrlC, svEvent, svShellBlock, svUserThumb, weaveHandles } from "./chat-and-panes.js";
import { paintEditPencil } from "./edit-message.js";
import { paintForkButton } from "./chat-fork.js";
import { paintReplyButton, takesMessage } from "./chat-reply.js";
import { FOLLOW_SLACK, svConvCutKey, svConvElements, svConvHasBar, svConvLetGo, svConvMount, svConvPrepend, svConvRestore, svConvScrolled, svConvSeed, svConvShow, svConvShowNow, svConvFlush, svConvShowSubs, svConvShown, svConvShownAt, svConvStick, svConvTimelineOn, svConvTurnStarts, svConvTurnsBehind } from "./conversation-model.js";
import { inkChips } from "./context-chips.js";
import { COMPOSER_MIN, IS_MAC, SV_ASK, SV_ASK_SLIM, batch, commandCounts, commandSpot, commandsIn, isImageName, isNativeCommand, phrase, st, withCommand, withoutCommand, composerShaped } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { receiving, tiles } from "./leader-key.js";
import { draftExtrasKept, draftFromElsewhere, draftKept, keepDraft, keepDraftNow } from "./kept-drafts.js";
import { askSettles } from "./composer-ask.js";
import { editBox, editingKeys } from "./composer-editing.js";
import { composerKeys } from "./composer-keys.js";
import { clearTooLong, followTooLong, refuseTooLong } from "./composer-length.js";
import { paintPromptLinkButton } from "./prompt-links.js";
import { canSteer, composerCommands, composerLive, composerPickTaken, composerSendTaken, dispatchMode, followUp, paintComposer, requestStop, sendIntent, stopGuarding } from "./composer-modes.js";
import { PLAN_PROMPT } from "./composer-plan.js";
import { paintQueue } from "./composer-queue.js";
import { openQuoteNote } from "./quote-note.js";
import { clipMarkup, wireClip } from "./composer-bar.js";
import { blockedSend, fileMarkInk, takeAttachments, wireAttachments } from "./composer-attachments.js";
import { composerClipboardAdapter, pasteFragment, wireChipClipboard } from "./chip-clipboard.js";
import { notePick, outboundPrPicks, prPickSpans, searchPullRequests } from "./pr-mentions.js";
import { pasteRoute, pastedTextFile } from "./paste-as-file.js";
import { IMAGE_MARK_RE, imageTray, inlineImageList, outboundImageMarks } from "./pinned-images.js";
import { foldPastes, insertMark, isLongPaste, outboundPastes, pasteAt, pasteMark, pastePeek, pasteSpots, pasteStore } from "./pasted-text.js";
import { seatHandle, shellLineOf, shellModeOf, splitPeerHandle } from "./pure-helpers.js";
import { commandTray } from "./said-command.js";
import { listMarks } from "/assets/said-lists.mjs";
import { paintActivity, paintStamp, refreshContext, refreshDriverState, splitLeadingQuotes, structPool, svDequeue, svLine, svQueueRefused, svRunTail, svWasDequeuedEarly } from "./structured-seats.js";
import { wireTalkButton } from "./stt.js";
import { suggestMarkup, suggestMenu } from "./suggest-menu.js";
import { sayToTeamSeat } from "./team.js";
import { HiveSocket, RETRY_AFTER, boxText, dropTerminal } from "./terminal-history.js";

function quoteTray(tray, onChange) {
  const held = [];
  const paint = () => {
    tray.classList.toggle("on", !!tray.querySelector(".att, .sv-paste-peek:not([hidden])"));
    onChange();
  };
  return {
    count: () => held.length,
    all: () => held.map((one) => (one.comment ? { said: one.said, comment: one.comment } : one.said)),
    pinned: () => held.map((one) => (one.comment ? { said: one.said, kind: one.kind, comment: one.comment } : { said: one.said, kind: one.kind })),
    add(said, kind, comment = "") {
      const one = { said, kind: kind || "", comment: String(comment || "").trim() };
      held.push(one);
      const chip = document.createElement("div");
      chip.className = "att quote";
      chip.innerHTML = `<span class="qi"><svg aria-hidden="true"><use href="#i-quote"/></svg></span><span class="qt"></span><button type="button" class="ax" title="${phrase("drop this quote")}">×</button>`;
      chip.querySelector(".qt").textContent = said;
      if (one.comment) {
        const note = document.createElement("span");
        note.className = "qc";
        note.textContent = one.comment;
        chip.querySelector(".qt").after(note);
      }
      chip.title = [kind, said, one.comment].filter(Boolean).join("\n\n");
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

const quoteBlock = (one) => (typeof one === "string" ? asQuote(one) : `${asQuote(one.said)}${one.comment?.trim() ? `\n\n${one.comment.trim()}` : ""}`);

const withQuotes = (quotes, text) => (quotes.length ? `${quotes.map(quoteBlock).join("\n\n")}${text ? `\n\n${text}` : ""}` : text);

const withoutQuotes = (quotes, said) => {
  const front = withQuotes(quotes, "");
  if (!front || !said.startsWith(front)) return said;
  return said.slice(front.length).replace(/^\n\n/, "");
};

function paintComposerReady(host, ready) {
  host.querySelector(".sv-composer").classList.toggle("ready", ready);
}

function svAttachImage(e, path) {
  e.tray.add(path);
  paintComposerReady(e.host, true);
}

function svTypePath(e, path) {
  const box = e.host.querySelector("textarea");
  const at = box.selectionStart ?? box.value.length;
  const space = at > 0 && !/\s$/.test(box.value.slice(0, at)) ? " " : "";
  box.setRangeText(`${space}${path} `, at, box.selectionEnd ?? at, "end");
  box.focus();
  box.dispatchEvent(new Event("input"));
}

function badgeSays(session, label) {
  receiving.set(session.name, label);
  const badge = tiles.get(session.name)?.querySelector(".badge");
  if (badge) badge.textContent = label;
  return () => {
    if (receiving.get(session.name) !== label) return;
    receiving.delete(session.name);
    const now = tiles.get(session.name)?.querySelector(".badge");
    if (now) now.textContent = st.typing === session.name ? phrase("typing here") : phrase("live terminal");
  };
}

function seatReceiving(session, files) {
  const label = files.length > 1 ? `receiving ${files.length} files…` : `receiving ${(files[0]?.name || "the file").split("/").pop()}…`;
  return badgeSays(session, label);
}

const REFUSAL_STAYS_MS = 8000;

function seatRefused(session, said) {
  setTimeout(badgeSays(session, said), REFUSAL_STAYS_MS);
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
    tray.classList.toggle("on", !!tray.querySelector(".att, .sv-paste-peek:not([hidden])"));
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
    else if (e.files) e.files.addReady({ path });
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

const seatOfBox = (button) => [...structPool.values()].find((e) => e.host?.contains(button)) || null;

function markRan(button) {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = phrase("sent");
  button.classList.add("said");
  setTimeout(() => {
    if (!button.isConnected) return;
    button.textContent = button.dataset.label;
    button.classList.remove("said");
  }, 1600);
}

const shellBoxLine = (button) => {
  const pre = button.closest(".md-codebox")?.querySelector(".md-code");
  return pre ? boxText(pre).trim() : "";
};

function runShellBox(button) {
  if (button.classList.contains("said")) return;
  const line = shellLineOf(shellBoxLine(button));
  const e = seatOfBox(button);
  if (!line || !e) return;
  if (e.mirror) return void svLine(e, "sv-meta warn", phrase("a command runs only on the machine that owns the chat"));
  rememberSent(e, `${line.quiet ? "!!" : "!"}${line.command}`);
  runShellInChat(e, line);
  markRan(button);
}

function shellBoxToChat(button) {
  const said = shellBoxLine(button);
  const e = seatOfBox(button);
  const box = e?.host.querySelector(".sv-composer textarea");
  if (!shellLineOf(said) || !box || e.mirror) return;
  box.focus();
  box.select();
  if (!document.execCommand?.("insertText", false, said)) box.setRangeText(said, 0, box.value.length, "end");
  box.dispatchEvent(new Event("input"));
}

document.addEventListener("click", (ev) => {
  const button = ev.target.closest?.(".md-run, .md-tochat");
  if (!button) return;
  ev.preventDefault();
  if (button.classList.contains("md-run")) runShellBox(button);
  else shellBoxToChat(button);
}, true);

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

const UP_KEYS = new Set(["PageUp", "Home", "ArrowUp"]);

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
  const el = svConvElements(e).get(key);
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

const SV_WHOLE_TURNS = 1000000;

async function svLoadWhole(e) {
  while (e.earlier?.loading) await new Promise((done) => setTimeout(done, 50));
  const held = e.earlier;
  if (!held?.more || !e.firstSeq) return true;
  held.loading = true;
  held.btn.disabled = true;
  let got = null;
  try {
    got = await fetch(`/api/seat/earlier?name=${encodeURIComponent(e.name)}&where=${e.where}&before=${e.firstSeq}&turns=${SV_WHOLE_TURNS}`).then((r) => r.json());
  } catch {}
  held.loading = false;
  held.btn.disabled = false;
  if (!got || !Array.isArray(got.events)) return false;
  const older = svEarlierBlocks(e, got.events, ++held.pages);
  svConvFlush(e);
  const first = svConvShown(e.conv)[svConvHasBar(e.conv.blocks) ? 1 : 0];
  svSpliceEarlier(e.conv.blocks, older);
  e.firstSeq = svEarlierSeq(got.events) || e.firstSeq;
  held.more = false;
  if (!e.conv.shownFrom && first) e.conv.shownFrom = first.key;
  held.say.textContent = svEarlierSay(e);
  svConvShow(e);
  return true;
}

function svRevealBlock(e, key) {
  const blocks = e.conv.blocks;
  const at = blocks.findIndex((one) => one.key === key);
  if (at < 0 || at >= svConvShownAt(e.conv)) return false;
  const floor = svConvHasBar(blocks) ? 1 : 0;
  const start = svConvTurnStarts(blocks).filter((one) => one <= at).at(-1) ?? floor;
  svConvFlush(e);
  e.atBottom = false;
  e.conv.shownFrom = start > floor ? blocks[start].key : null;
  if (!e.conv.shownFrom && e.earlier && !e.earlier.more) {
    blocks.shift();
    e.earlier = null;
  } else if (e.earlier) {
    e.earlier.say.textContent = svEarlierSay(e);
  }
  svConvShowNow(e);
  return true;
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

function recallable(text) {
  const said = String(text || "").trim();
  if (said.startsWith(PLAN_PROMPT)) return "";
  const rest = splitLeadingQuotes(said)?.rest ?? said;
  return rest.replace(/\[Image #\d+\] ?/g, "").trim();
}

function caretOnEdge(box, dir) {
  if (box.selectionStart !== box.selectionEnd) return false;
  return dir < 0 ? !box.value.slice(0, box.selectionStart).includes("\n") : !box.value.slice(box.selectionEnd).includes("\n");
}

function rememberSent(e, text, seq) {
  const clean = recallable(text);
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
    <div class="sv-queue"></div>
    ${suggestMarkup()}
    <div class="sv-drawer"></div>
    <form class="sv-composer">
      <div class="sv-activity"><span class="pulse"></span><span class="verb"></span><span class="clock"></span></div>
      <div class="sv-attach"></div>
      <div class="sv-well"><div class="sv-ink" aria-hidden="true"></div><textarea rows="1" placeholder="${phrase(SV_ASK)}"></textarea></div>
      <div class="sv-foot">
        ${clipMarkup()}
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
    </form>
    <div class="cp-place"></div>`;
  const scroll = host.querySelector(".sv-scroll");
  e = { name: s.name, where: s.where, mirror: s.mirror || null, host, scroll, ws: null, since: 0, lastSeq: 0, window: "turns",
        tag: Math.random().toString(36).slice(2, 7), said: new Set(),
        draft: null, tools: new Map(), asked: new Map(), subs: new Map(), pending: new Map(), cmdSeq: 0, atBottom: true, run: null,
        turnOpen: false, activity: "", activitySince: 0, pendingTools: new Map(), queuedEls: [],
        sent: [], sentSeqs: new Set(), histIdx: null,
        catalog: null, catalogError: "", catalogPull: null, catalogTries: 0, catalogWait: null,
        model: "", effort: "", account: undefined, menu: null, quotes: null, talkOff: null };
  e.talkOff = wireTalkButton(host.querySelector(".sv-talk"), () => host.querySelector(".sv-composer textarea"));
  wireClip(host);
  const jump = host.querySelector(".sv-jump");
  const paintJump = () => { jump.hidden = e.atBottom; };
  scroll.addEventListener("scroll", () => {
    const y = scroll.scrollTop;
    const bottom = y + scroll.clientHeight >= scroll.scrollHeight - 48;
    const wasBottom = e.atBottom;
    if (e.settling) e.settling = false;
    else if (svConvTimelineOn(e)) svConvScrolled(e);
    else if (y < (e.lastScrollY || 0)) e.atBottom = bottom;
    else if (bottom) e.atBottom = true;
    e.lastScrollY = y;
    paintJump();
    if (e.atBottom && !wasBottom) svTrimTurns(e);
    if (y < SV_EARLIER_NEAR && e.earlier && !e.earlier.loading) svLoadEarlier(e);
  });
  jump.addEventListener("click", () => {
    e.atBottom = true;
    svConvStick(e);
    paintJump();
    svTrimTurns(e);
  });
  scroll.addEventListener("wheel", (ev) => { if (ev.deltaY < 0 && !ev.ctrlKey) svConvLetGo(e); }, { passive: true });
  scroll.addEventListener("touchmove", () => {
    if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > FOLLOW_SLACK) svConvLetGo(e);
  }, { passive: true });
  scroll.addEventListener("pointerdown", (ev) => {
    if (ev.target !== scroll) return;
    e.dragging = true;
    window.addEventListener("pointerup", () => { e.dragging = false; }, { once: true });
  });
  scroll.addEventListener("keydown", (ev) => {
    if (UP_KEYS.has(ev.key) && !ev.altKey && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) svConvLetGo(e);
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
  new ResizeObserver(() => svConvStick(e)).observe(host);
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
    const pasted = pasteSpots(said).filter((one) => e.pastes?.get(one.n) !== undefined).map((one) => ({ ...one, cls: `ink-chip ink-paste${e.peek?.open() === one.n ? " open" : ""}` }));
    drawInk(composer, ink, textarea, [...(shellMode ? [{ start: 0, end: shellMode === "quiet" ? 2 : 1, cls: "ink-shell" }] : []), ...(spot ? [{ ...spot, cls: "ink-cmd" }] : []), ...pasted, ...listInkMarks(said)]);
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
  wireAttachments(e, { host, textarea, target: () => ({ name: e.name, where: e.where }), busy: () => "" });
  const clipboard = composerClipboardAdapter(e, { where: () => e.where, seat: () => e.name });
  wireChipClipboard(textarea, clipboard);
  e.pastes = pasteStore(() => e.name);
  e.peek = pastePeek(host.querySelector(".sv-composer"), textarea, e.pastes, () => paintInk());
  /* a paste too long to read in the box becomes one mark in it; the words go out whole on enter. */
  const foldIntoBox = (text) => foldPastes(text, (words) => pasteMark(e.pastes.add(words), words));
  const pasteWords = (words, plain, redirected) => {
    const route = pasteRoute(words, { plain, folds: isLongPaste, asFile: !e.mirror });
    if (route === "native" && !redirected) return false;
    if (route === "file") {
      takeAttachments(e, [pastedTextFile(words, `${textarea.value} ${e.files.names().join(" ")}`)]);
      return true;
    }
    if (route === "plain" || route === "native") {
      editBox(textarea, textarea.selectionStart ?? textarea.value.length, textarea.selectionEnd ?? textarea.value.length, words);
      return true;
    }
    insertMark(textarea, pasteMark(e.pastes.add(words), words));
    textarea.dispatchEvent(new Event("input"));
    return true;
  };
  textarea.addEventListener("paste", (pev) => {
    const data = pev.clipboardData;
    const plain = e.plainPaste;
    e.plainPaste = false;
    if (!data || [...(data.items || [])].some((one) => one.kind === "file" || one.type.startsWith("image/"))) return;
    if (!plain && pasteFragment(textarea, pev, clipboard)) return;
    if (pasteWords(data.getData("text/plain"), plain, false)) pev.preventDefault();
  });
  textarea.addEventListener("click", () => {
    if (textarea.selectionStart !== textarea.selectionEnd) return;
    const spot = pasteAt(textarea.value, textarea.selectionStart ?? 0);
    if (spot) e.peek.show(spot.n);
  });
  const paintReady = () => {
    paintComposerReady(host, !!textarea.value.trim() || !!e.tray.count() || !!e.files.count() || !!e.quotes?.count() || !!e.command?.count());
    paintComposer(e);
  };
  const boxNow = () => ({ text: textarea.value, images: [...e.tray.marks], quotes: e.quotes.pinned(), files: e.files.marks() });
  const heldDraft = () => e.ask?.saved || e.editing?.saved || null;
  const keepBox = (now = false) => {
    if (e.restoring) return;
    const kept = heldDraft() || boxNow();
    (now ? keepDraftNow : keepDraft)(e.name, kept.text, { images: kept.images, quotes: kept.quotes, files: kept.files || [] });
  };
  e.quotes = quoteTray(host.querySelector(".sv-attach"), () => { paintReady(); keepBox(); });
  e.command = commandTray(() => { paintReady(); paintInk(); });
  const enqueue = (shownText, sending, pinned, cid, uuid) => {
    const tray = e.host.querySelector(".sv-queue");
    const item = document.createElement("div");
    item.className = "sv-qitem";
    item.dataset.text = shownText;
    item.dataset.images = JSON.stringify(sending);
    item.dataset.quotes = JSON.stringify(pinned);
    item.dataset.cid = cid || "";
    item.dataset.uuid = uuid || "";
    tray.append(item);
    (e.queuedEls ||= []).push(item);
    paintQueue(e);
    paintActivity(e);
    return item;
  };
  const userBubble = (text, cid, images, uuid = "") => {
    const bubble = svLine(e, "sv-user", splitPeerHandle(text || "").body || "(image)");
    paintMentions(bubble);
    if (cid) bubble.dataset.cid = cid;
    if (uuid) bubble.dataset.uuid = uuid;
    for (const path of images) svUserThumb(e, bubble, path);
    return bubble;
  };
  /* a seat whose program cannot take a message mid-turn refuses the steer, and the message stays in line. */
  const steerIn = (shownText, sending, pinned, cid, uuid) => {
    svCmd(e, { type: "saynow", target: cid }).then((s) => {
      if (s?.ok || s?.gone) {
        svWasDequeuedEarly(e, cid);
        userBubble(shownText, cid, sending, uuid);
        return void paintActivity(e);
      }
      if (!s?.silent) e.steerRefused = true;
      enqueue(shownText, sending, pinned, cid, uuid);
    });
  };
  const clearBox = () => {
    textarea.value = "";
    textarea.style.height = "";
    e.tray.clear();
    e.files.clear();
    e.pastes.clear();
    e.peek.close(false);
    e.quotes.clear();
    e.command.clear();
    clearTooLong(host);
    paintComposerReady(e.host, false);
    paintInk();
    autosize();
    keepBox(true);
  };
  /* fromDraft says the words came from this seat's textarea. the universal composer sends
     with it false, so what the person is writing down here — and what they attached — survives. */
  const deliver = (text, sending, fromDraft, steer = false) => {
    if (e.providerTransfer && e.providerTransfer.phase !== "waiting") {
      svLine(e, "sv-meta", e.providerTransfer.fresh ? phrase("the chat is starting fresh; your draft is kept here until it finishes") : phrase("the provider is changing; your draft is kept here until it finishes"));
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
      if (fromDraft) clearBox();
      return;
    }
    /* a mirrored seat has no socket into it: what is typed here travels as a file to the other
       machine, and the panel that owns the seat is the one that types it in. the bubble is painted
       on the spot because the answer comes back on the next read of the file, seconds later. */
    if (e.mirror) {
      if (fromDraft) { e.tray.clear(); e.files.clear(); e.pastes.clear(); e.peek.close(false); e.quotes.clear(); e.command.clear(); paintComposerReady(host, false); }
      const said = sending.length ? inlineImageList(text, sending) : text;
      if (!said) return;
      rememberSent(e, said);
      svLine(e, "sv-user", said);
      sayToTeamSeat(e.mirror.dev, e.mirror.seat, said, textarea);
      if (fromDraft) { textarea.value = ""; textarea.style.height = ""; paintInk(); keepBox(true); }
      return;
    }
    const native = text.match(NATIVE_COMMANDS);
    if (native && !(native[1] === "config" && native[2])) {
      rememberSent(e, text);
      runNativeCommand(e, native[1], native[2]);
      /* the command the app answers itself is spent too: leaving it pinned would keep its mark
         painted over an empty box, and the next enter would ask for it again. */
      if (fromDraft) clearBox();
      return;
    }
    if (fromDraft) {
      e.sending = true;
      paintComposer(e);
    }
    const steers = steer ? { steer: true } : {};
    svCmd(e, sending.length ? { type: "say", text, images: sending, ...steers } : { type: "say", text, ...steers }).then((r) => {
      if (fromDraft) e.sending = false;
      /* the driver refusing, the socket being down, the driver not answering at all: every one of
         these used to end here without a word, and the person read it as a box that stopped
         working. the words stay in the box and the reason goes into the conversation. */
      if (!r?.ok) {
        paintComposer(e);
        return void svLine(e, "sv-meta warn", r?.error || phrase("the message did not reach this chat — it is still in the box"));
      }
      if (fromDraft) e.atBottom = true;
      const shownText = typeof r.shown === "string" ? r.shown : text;
      const wentIn = svWasDequeuedEarly(e, r.cid);
      const waits = !wentIn && (r.queued ?? (e.turnOpen && !r.dismissed));
      if (waits && steer && r.cid) steerIn(shownText, sending, pinned, r.cid, r.uuid);
      else if (waits) enqueue(shownText, sending, pinned, r.cid, r.uuid);
      else userBubble(shownText, r.cid, sending, r.uuid);
      if (fromDraft) clearBox();
      paintComposer(e);
    });
  };
  const dropFromTray = (item) => {
    const i = (e.queuedEls || []).indexOf(item);
    if (i >= 0) e.queuedEls.splice(i, 1);
    item.remove();
    paintQueue(e);
  };
  const sendNow = (item) => {
    svCmd(e, { type: "saynow", target: item.dataset.cid }).then((r) => {
      if (!r?.ok) return void svQueueRefused(e, r);
      dropFromTray(item);
      if (item.dataset.gone) return void paintActivity(e);
      userBubble(item.dataset.text, item.dataset.cid, JSON.parse(item.dataset.images || "[]"), item.dataset.uuid);
      paintActivity(e);
    });
  };
  const putBack = (item, mode = "append") => {
    const imgs = JSON.parse(item.dataset.images || "[]");
    const quoted = JSON.parse(item.dataset.quotes || "[]");
    const kept = new Set();
    IMAGE_MARK_RE.lastIndex = 0;
    const back = withoutQuotes(quoted, item.dataset.text || "").replace(IMAGE_MARK_RE, (mark, n) => {
      const path = imgs[Number(n) - 1];
      if (!path) return mark;
      kept.add(Number(n) - 1);
      const fresh = e.tray.mint();
      e.tray.restore(path, fresh);
      return `[Image #${fresh}]`;
    });
    const folded = foldIntoBox(back);
    if (mode === "replace") textarea.value = folded;
    else if (folded) textarea.value = textarea.value.trim() ? `${textarea.value}\n${folded}` : folded;
    for (const path of imgs.filter((_, i) => !kept.has(i))) {
      const fresh = e.tray.mint();
      e.tray.restore(path, fresh);
      textarea.value = `${textarea.value}${textarea.value && !/\s$/.test(textarea.value) ? " " : ""}[Image #${fresh}] `;
    }
    for (const one of quoted) e.quotes.add(one.said, one.kind, one.comment);
    paintInk();
  };
  const takeBack = (item) => {
    svCmd(e, { type: "unsay", target: item.dataset.cid }).then((r) => {
      if (!r?.ok) {
        if (r?.gone) svDequeue(e, item);
        return void svQueueRefused(e, r);
      }
      dropFromTray(item);
      putBack(item);
      keepBox();
      paintReady();
      paintInk();
      paintActivity(e);
      autosize();
      textarea.focus();
    });
  };
  const remove = (item) => {
    svCmd(e, { type: "unsay", target: item.dataset.cid }).then((r) => {
      if (!r?.ok) {
        if (r?.gone) svDequeue(e, item);
        return void svQueueRefused(e, r);
      }
      dropFromTray(item);
      paintActivity(e);
    });
  };
  /* drivers from before resay answer "unknown command": the message is said again and loses its place. */
  const resay = (item, out) => {
    const rewrite = () => {
      item.dataset.text = out.text;
      item.dataset.images = JSON.stringify(out.images);
      item.dataset.quotes = JSON.stringify(out.quotes);
      delete item.dataset.sig;
    };
    return svCmd(e, { type: "resay", target: item.dataset.cid, text: out.text, images: out.images }).then((r) => {
      if (r?.ok) { rewrite(); return r; }
      if (r?.gone || !/unknown command/.test(r?.error || "")) return r;
      return svCmd(e, { type: "unsay", target: item.dataset.cid }).then((gone) => {
        if (!gone?.ok) return gone;
        dropFromTray(item);
        return svCmd(e, { type: "say", text: out.text, images: out.images }).then((again) => {
          if (!again?.ok) return again;
          if (again.queued) enqueue(out.text, out.images, out.quotes, again.cid, again.uuid);
          else userBubble(out.text, again.cid, out.images, again.uuid);
          return again;
        });
      });
    });
  };
  const outgoing = () => {
    const out = outboundImageMarks(outboundPrPicks(e.files.outbound(textarea.value.trim()), e.prPicks, chatHandleTaken), e.tray.marks);
    const woven = weaveHandles(out.text, st.data.sessions, e.name);
    if (woven.error) return { error: woven.error, text: "", images: [], quotes: [] };
    woven.text = outboundPastes(woven.text, e.pastes.held);
    /* the mark can sit anywhere in the box, but a session only reads a command in front of the
       words: what goes out is the same sentence with that one word lifted to the head. */
    const called = e.command.name();
    return { text: withCommand(called, withQuotes(e.quotes.all(), withoutCommand(called, woven.text))), images: out.images, quotes: e.quotes.pinned() };
  };
  const say = (alternate = false) => {
    if (e.sending || stopGuarding(e)) return;
    if (blockedSend(e)) return;
    if (composerSendTaken(e, { alternate })) return;
    const out = outgoing();
    /* a handle the box cannot resolve used to swallow the whole message: enter pressed, nothing
       sent, nothing said. the box keeps the words and the reason goes into the conversation. */
    if (out.error) return void svLine(e, "sv-meta warn", out.error);
    if (refuseTooLong(host, out.text)) return;
    const steer = composerLive(e) && !e.planAsk && dispatchMode({ running: e.turnOpen, alternate, steerable: canSteer(e), preferred: followUp() }) === "steer";
    deliver(out.text, out.images, true, steer);
  };
  host.querySelector(".sv-composer").addEventListener("submit", (ev) => { ev.preventDefault(); say(); });
  host.querySelector(".sv-send").addEventListener("click", (ev) => {
    if (!(IS_MAC ? ev.metaKey : ev.ctrlKey)) return;
    ev.preventDefault();
    say(true);
  });
  host.querySelector(".sv-pill-model").addEventListener("click", () => openSeatPicker(e, "model"));
  host.querySelector(".sv-pill-effort").addEventListener("click", () => openSeatPicker(e, "effort"));
  host.querySelector(".sv-pill-account").addEventListener("click", () => openSeatPicker(e, "account"));
  host.querySelector(".sv-ctx").addEventListener("click", () => runNativeCommand(e, "context"));
  e.type = (text, images = []) => deliver(String(text).trim(), Array.isArray(images) ? images : [], false);
  const restoreBox = (snap) => {
    e.restoring = true;
    textarea.value = String(snap?.text || "");
    e.tray.clear();
    e.files.restore(snap?.files);
    e.quotes.clear();
    e.command.clear();
    for (const [n, path] of snap?.images || []) e.tray.restore(path, n);
    for (const one of snap?.quotes || []) e.quotes.add(one.said, one.kind, one.comment);
    e.restoring = false;
    e.histIdx = null;
    clearTooLong(host);
    syncCommand();
    autosize();
    paintReady();
    paintInk();
    keepBox();
  };
  const mergeBox = (entry) => {
    const fresh = new Map();
    for (const [n, path] of entry.images || []) {
      const at = e.tray.mint();
      e.tray.restore(path, at);
      fresh.set(Number(n), at);
    }
    const freshFiles = e.files.merge(entry.files);
    const said = String(entry.text || "").replace(IMAGE_MARK_RE, (mark, n) => (fresh.has(Number(n)) ? `[Image #${fresh.get(Number(n))}]` : mark))
      .replace(/\[File #(\d+)\]/g, (mark, n) => (freshFiles.has(Number(n)) ? `[File #${freshFiles.get(Number(n))}]` : mark)).trim();
    if (said) textarea.value = textarea.value.trim() ? `${textarea.value.replace(/\s+$/, "")}\n\n${said}` : said;
    for (const one of entry.quotes || []) e.quotes.add(one.said, one.kind, one.comment);
    syncCommand();
    autosize();
    paintReady();
    paintInk();
    keepBox();
  };
  e.box = {
    textarea,
    say,
    enqueue,
    sendNow,
    remove,
    resay,
    putBack: (item) => { putBack(item, "replace"); syncCommand(); autosize(); paintReady(); paintInk(); },
    outgoing,
    paste: (words, plain = false) => pasteWords(words, plain, true),
    snapshot: boxNow,
    restore: restoreBox,
    merge: mergeBox,
    warn: (said, cls = "sv-meta warn") => svLine(e, cls, said),
    answer: (id, answers) => {
      const card = e.asked.get(id) || null;
      return svCmd(e, { type: "answer", id, answers }).then((r) => {
        if (r?.ok) e.asked.delete(id);
        return { ...r, card };
      });
    }
  };
  /* the stamp lights on the tail of the run the mouse is over, wherever inside the run it is —
     hovering the first of three paragraphs is still hovering that answer. */
  let lit = null;
  const light = (tail) => {
    if (lit === tail) return;
    lit?.classList.remove("lit");
    lit = tail || null;
    if (!lit) return;
    paintStamp(lit);
    paintEditPencil(e, lit);
    paintForkButton(e, lit);
    paintReplyButton(e, lit);
    paintPromptLinkButton(e, lit);
    lit.classList.add("lit");
  };
  scroll.addEventListener("mouseover", (ev) => {
    const block = ev.target.closest?.(".sv-msg, .sv-user");
    light(block && scroll.contains(block) ? svRunTail(block) : null);
  });
  scroll.addEventListener("mouseleave", () => light(null));
  /* the folded paste in the chat closes on esc too, once its head has been clicked. */
  scroll.addEventListener("keydown", (kev) => {
    const card = kev.key === "Escape" && kev.target.closest?.("details.sv-paste[open]");
    if (!card) return;
    kev.preventDefault();
    kev.stopPropagation();
    card.open = false;
    card.querySelector("summary")?.focus();
  });
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
    if (!found || !takesMessage(e)) return dropQuotePop();
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
    const quoted = { said: picked.said, kind: blockKind(picked.block), box: picked.box };
    document.getSelection()?.removeAllRanges();
    dropQuotePop();
    if (!composerLive(e)) {
      e.quotes.add(quoted.said, quoted.kind);
      return void textarea.focus();
    }
    openQuoteNote(e, quoted, (comment, send) => {
      e.quotes.add(quoted.said, quoted.kind, comment);
      if (send) say();
      else textarea.focus();
    });
  });
  host.querySelector(".sv-stop").addEventListener("click", () => requestStop(e, () => interruptStructured(e)));
  if (composerShaped()) seatComposer(e);
  const autosize = () => {
    textarea.style.height = "";
    const room = svRoom(host, textarea);
    textarea.style.minHeight = room < COMPOSER_MIN ? `${Math.max(SV_FLOOR, room)}px` : "";
    const grown = Math.min(260, textarea.scrollHeight, room);
    textarea.style.height = grown > (composerShaped() ? SV_LINE : COMPOSER_MIN) ? `${grown}px` : "";
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
    commands: () => ({ ...offeredCommands(e), none: phrase("the command list arrives with the session's first turn") }),
    files: {
      searching: () => phrase("searching the session's directory…"),
      none: () => phrase("nothing with that name in the session's directory"),
      find: (q) => fetch(`/api/files?name=${encodeURIComponent(e.name)}&where=${e.where}&q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => null)
    },
    grow: autosize,
    prs: {
      find: (q) => searchPullRequests({ name: e.mirror ? "" : e.name, where: e.where }, q),
      picked: (pr) => {
        notePick(pr);
        (e.prPicks ||= new Set()).add(Number(pr.number));
      }
    },
    /* the command stays where it was called and takes the mark from whatever held it before —
       and that one goes on being words, in its place, because nothing the person wrote vanishes. */
    onPick: (kind, item) => {
      if (kind === "slash" && composerPickTaken(e, item)) return;
      if (kind === "slash") e.command.set(item);
      else syncCommand();
      paintInk();
    }
  });

  const recall = (text) => {
    text = foldIntoBox(text);
    textarea.value = text;
    textarea.setSelectionRange(text.length, text.length);
    keepBox();
    autosize();
    paintReady();
    paintInk();
  };
  const historyOpen = (dir) => {
    if (e.tray.count() || e.files.count() || e.quotes.count() || e.ask) return false;
    const recalled = e.histIdx != null && textarea.value === e.sent[e.histIdx];
    if (dir < 0 && textarea.value && !recalled) return false;
    if (dir > 0 && !recalled) return false;
    return caretOnEdge(textarea, dir);
  };
  textarea.addEventListener("keydown", (kev) => {
    e.lastKeyAt = Date.now();
    if (kev.key === "v" && (IS_MAC ? kev.metaKey : kev.ctrlKey) && kev.shiftKey && !kev.altKey) e.plainPaste = true;
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
    if (kev.key === "Backspace" && !kev.metaKey && !kev.ctrlKey && !kev.altKey && !kev.shiftKey && textarea.selectionStart === textarea.selectionEnd) {
      const at = textarea.selectionStart ?? 0;
      const spot = pasteSpots(textarea.value).find((one) => at > one.start && at <= one.end);
      if (spot) {
        kev.preventDefault();
        textarea.setSelectionRange(spot.start, spot.end);
        return;
      }
    }
    if (kev.key === "Escape" && e.peek.open() !== null) { kev.preventDefault(); e.peek.close(); return; }
    if (menu.key(kev)) return;
    if (editingKeys(kev, textarea)) return;
    if (composerKeys(e, kev)) {
      kev.preventDefault();
      menu.close();
      return;
    }
    if (kev.key === "Enter" && kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && e.queuedEls?.length) {
      kev.preventDefault();
      menu.close();
      sendNow(e.queuedEls[e.queuedEls.length - 1]);
      return;
    }
    if (kev.key === "ArrowUp" && !kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && !textarea.value && e.queuedEls?.length && !composerLive(e)) {
      kev.preventDefault();
      takeBack(e.queuedEls[e.queuedEls.length - 1]);
      return;
    }
    if (kev.key === "ArrowUp" && !kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && historyOpen(-1)) {
      const step = stepHistory(e.sent, e.histIdx, -1);
      if (!step) return;
      kev.preventDefault();
      e.histIdx = step.idx;
      recall(step.text);
      return;
    }
    if (kev.key === "ArrowDown" && !kev.altKey && !kev.ctrlKey && !kev.metaKey && !kev.shiftKey && e.histIdx != null && historyOpen(1)) {
      kev.preventDefault();
      const step = stepHistory(e.sent, e.histIdx, 1);
      e.histIdx = step.idx;
      recall(step.text);
      return;
    }
    const intent = sendIntent(kev, { text: textarea.value, running: !!e.turnOpen });
    if (intent) { kev.preventDefault(); menu.close(); say(intent === "alternate"); }
    if (kev.key === "Escape") {
      kev.preventDefault();
      if (st.typing === e.name) releaseKeyboard();
      else textarea.blur();
    }
  });
  textarea.addEventListener("input", () => {
    if (e.histIdx != null && textarea.value !== e.sent[e.histIdx]) e.histIdx = null;
    if (e.stashOpen) e.stashOpen = false;
    keepBox();
    e.tray.sync();
    e.files.sync();
    autosize();
    menu.compute();
    syncCommand();
    paintReady();
    paintInk();
    followTooLong(host, () => outgoing().text);
  });
  textarea.addEventListener("scroll", () => { ink.scrollTop = textarea.scrollTop; });
  textarea.addEventListener("blur", () => {
    keepBox(true);
    askSettles(e);
    setTimeout(menu.close, 150);
  });
  host.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const at = activeItems().findIndex((it) => it.kind === "session" && it.name === e.name);
    if (at >= 0 && at !== st.focus) { st.focus = at; render(); }
  });
  svConvMount(e);
  const left = draftKept(s.name);
  if (left) fill(left);
  const extras = draftExtrasKept(s.name);
  if (extras.images.length || extras.quotes.length || extras.files.length) {
    e.restoring = true;
    e.files.restore(extras.files);
    for (const [n, path] of extras.images) e.tray.restore(path, n);
    for (const one of extras.quotes) e.quotes.add(one.said, one.kind, one.comment);
    e.restoring = false;
    paintReady();
  }
  structPool.set(s.name, e);
  paintComposer(e);
  return e;
}

function mountStructured(s, well) {
  dropTerminal(s.name);
  const e = getStructured(s);
  well.classList.add("structured");
  if (e.host.parentElement !== well) {
    well.appendChild(e.host);
    svReserve(e);
    requestAnimationFrame(() => svConvRestore(e));
  }
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
    if (el.classList.contains("sv-scroll") || el.classList.contains("sv-drawer") || !el.offsetHeight) continue;
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
  svConvStick(e);
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
  const clip = form.querySelector(".sv-clip");
  const pick = form.querySelector(".sv-pick");
  const ctx = form.querySelector(".sv-ctx");
  if (!on) {
    form.prepend(activity, attach, well);
    if (clip) foot.append(clip);
    if (pick) foot.append(pick);
    if (ctx) foot.append(ctx);
    foot.append(btns);
    form.querySelector(":scope > .sv-box").remove();
    for (const extra of foot.querySelectorAll(":scope > :is(.sv-when, .sv-keys, .sv-halt)")) extra.remove();
    activity.classList.remove("tool", "asks");
    return;
  }
  const box = document.createElement("div");
  box.className = "sv-box";
  const bar = document.createElement("div");
  bar.className = "sv-bar";
  const fill = document.createElement("span");
  fill.className = "sv-bar-fill";
  bar.append(...[clip, fill, pick, ctx, btns].filter(Boolean));
  box.append(attach, well, bar);
  form.prepend(box);
  foot.prepend(activity);
  if (!halt) return;
  const hold = document.createElement("div");
  hold.innerHTML = `<span class="sv-when"></span><span class="sv-keys"><kbd class="rc-key">↵</kbd>${phrase("send")}<kbd class="rc-key">⇧↵</kbd>${phrase("line")}<kbd class="rc-key">${IS_MAC ? "⌘↵" : "Ctrl+↵"}</kbd>${phrase("stop and send")}</span><button type="button" class="sv-halt" title="${phrase("interrupt the turn (ctrl+c)")}">${phrase("interrupt")}<kbd class="rc-key">${IS_MAC ? "⌃C" : "Ctrl+C"}</kbd></button>`;
  activity.after(...hold.children);
  foot.querySelector(".sv-halt").addEventListener("click", halt);
}

function seatComposer(e) {
  const on = composerShaped();
  shapeComposer(e.host, on, () => interruptStructured(e));
  const textarea = e.host.querySelector(".sv-composer textarea");
  if (composerLive(e)) paintComposer(e);
  else if (on && textarea && textarea.placeholder === phrase(SV_ASK)) textarea.placeholder = phrase(SV_ASK_SLIM);
}

document.addEventListener("hive:experience", (event) => {
  const { experience, was } = event.detail || {};
  if (experience !== "raycast" && was !== "raycast") return;
  for (const e of structPool.values()) {
    seatComposer(e);
    paintActivity(e);
  }
});

const chatHandleTaken = (handle) => {
  const asked = String(handle).toLowerCase();
  return (st.data?.sessions || []).some((one) => seatHandle(one) === asked || one.name.toLowerCase() === asked);
};

const listInkMarks = (said) => [...listMarks(said).map((mark) => ({ ...mark, cls: mark.kind === "ul" ? "ink-bullet" : "ink-num" })), ...inkChips(said), ...fileMarkInk(said), ...prPickSpans(said, chatHandleTaken)];

function drawInk(composer, ink, textarea, found) {
  const said = textarea.value;
  const marks = [...found]
    .sort((a, b) => a.start - b.start)
    .filter((mark, at, all) => !at || mark.start >= all[at - 1].end);
  ink.textContent = "";
  if (!marks.length) {
    composer.classList.remove("inked");
    return;
  }
  let last = 0;
  for (const mark of marks) {
    const token = document.createElement("span");
    token.className = mark.cls;
    token.textContent = said.slice(mark.start, mark.end);
    ink.append(document.createTextNode(said.slice(last, mark.start)), token);
    last = mark.end;
  }
  ink.append(document.createTextNode(said.slice(last)));
  if (said.endsWith("\n")) ink.append(document.createTextNode("\u200b"));
  composer.classList.add("inked");
  ink.scrollTop = textarea.scrollTop;
}

function offeredCommands(e) {
  const hidden = st.slashSkills === false ? e.skills : null;
  const list = hidden?.size ? (e.slash || []).filter((name) => !hidden.has(name)) : e.slash || [];
  const info = e.slashInfo || {};
  if (!list.length) return { list, info };
  const extra = {};
  if (!list.includes("fresh")) extra.fresh = { description: phrase("start over in a new session that carries an extract of this one"), argumentHint: "", family: "seat" };
  for (const [name, row] of composerCommands(e)) extra[name] = { ...row, family: "seat" };
  return { list: [...list.filter((name) => !(name in extra)), ...Object.keys(extra)], info: { ...info, ...extra } };
}

export { SV_AIR, drawInk, listInkMarks, SV_EARLIER_NEAR, SV_FLOOR, SV_KEEP_BLOCKS, SV_KEEP_TURNS, SV_SPARE, SV_TURNS, asQuote, attachFilesToSeat, blockKind, connectStructured, getStructured, interruptStructured, healStructuredScroll, keepStructuredUp, loadingChips, mountStructured, quoteTray, rememberSent, runShellBox, seatReceiving, seatRefused, shellBoxToChat, shapeComposer, soakDrafts, stepHistory, svAttachImage, svCmd, svEarlier, svEarlierBar, svEarlierBlocks, svEarlierSay, svEarlierSeq, svEarlierWords, svFlightScale, svGutter, svLoadEarlier, svLoadWhole, svLoadingChips, svNarrow, svRevealBlock, svReserve, svReset, svRoom, svSpliceEarlier, svTrimTurns, svTypePath, svUnfoldTurns, withQuotes, withoutQuotes };
