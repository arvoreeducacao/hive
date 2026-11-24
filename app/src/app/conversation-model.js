import { render } from "./arrange.js";
import { paintMentions, wireLinks } from "./chat-and-panes.js";
import { giveImageChipItsPicture, paintSaidChips, wireChips } from "./context-chips.js";
import { liveStart, liveStep, phrase, raycastOn, renderMarkdownBlocks, solidMounts, st } from "./core.js";
import { enrichMarkdown } from "./markdown-rich.js";
import { focusSeat, goTo } from "./focus-navigation.js";
import { openShotFrom, wireMdShots } from "./picture-preview.js";
import { keepPrintOnPage } from "./keep-print.js";
import { openMemoryAt } from "./memories.js";
import { memoryTurnDrop, memoryTurnScope, memoryTurnUndo } from "./memory-turn.js";
import { editLanded, editOf } from "./edit-diff.js";
import { saveEdit } from "./edit-message.js";
import { resultText, shotOfInput, shotsOfSaid, shotsOfTool, withoutImageNotes } from "./session-images.js";
import { fillSaid, markedSaid } from "/assets/said-lists.mjs";
import { renderMarkdown } from "/assets/markdown.mjs";
import { paintSaidCommand, splitLeadingQuotes, structPool, svQuoteCard, workSummary } from "./structured-seats.js";
import { marksStatusAct, marksStatusLines } from "./seat-marks.js";
import { fillWithPastes, hasPasted } from "./pasted-text.js";
import { AGENT_TOOL, ASYNC_LAUNCH, DIFF_HUNK, IMAGE_NOTE_ONLY, SUB_LOG_MAX, SUB_STALE, diffLines, openArtifact, paintSubs, svArtLanded, svSubAsync, svSubPin, svSubUnpin, tookLabel } from "./subagents-dock.js";
import { SKILL_TOOL, artifactLink, oneLine, toolArg, toolFace, toolTitle, trimBody } from "./tool-face.js";
import { commandResult, deriveTimelineRows, legacyRows, workedFor } from "./timeline-rows.js";
import { jumpToQuote, needleOf, quotedBlock, quoteLines } from "./quote-jump.js";
import { chatsOpenedIn, hiveCallOf } from "./orchestration-summary.js";
import { faviconOf, isBrowserTool, pageOfInput, prettyJson, toolArgs, webResults } from "./tool-inspector.js";
import { screenReaderHeard } from "./screen-reader.js";
import { markFileDrags } from "./file-drag.js";
import { prToolSummary } from "./pr-tool-summary.js";

let convSolid = null;
const TOOK_SHOWN_FROM_MS = 10;

function svConvSeed() {
  return { blocks: [], subs: [], seq: 0, shownFrom: null, thinking: null, retrying: null, steers: new Set() };
}

const svConvHasBar = (blocks) => blocks[0]?.kind === "node" && String(blocks[0].key).endsWith(":earlier");

function svConvTurnStarts(blocks) {
  const starts = [];
  blocks.forEach((one, at) => { if (one.kind === "bubble") starts.push(at); });
  return starts;
}

function svConvCutKey(blocks, keep, budget = Infinity) {
  const starts = svConvTurnStarts(blocks);
  if (!starts.length) return null;
  const sizeOf = (turn) => (starts[turn + 1] ?? blocks.length) - starts[turn];
  let first = starts.length - 1;
  let held = sizeOf(first);
  while (first > 0 && starts.length - first < keep && held + sizeOf(first - 1) <= budget) {
    first--;
    held += sizeOf(first);
  }
  return first > 0 ? blocks[starts[first]].key : null;
}

function svConvShownAt(conv) {
  if (!conv.shownFrom) return 0;
  const at = conv.blocks.findIndex((one) => one.key === conv.shownFrom);
  return at < 0 ? 0 : at;
}

function svConvShown(conv) {
  const at = svConvShownAt(conv);
  if (!at) return conv.blocks;
  return svConvHasBar(conv.blocks) ? [conv.blocks[0], ...conv.blocks.slice(at)] : conv.blocks.slice(at);
}

function svConvTurnsBehind(conv) {
  const at = svConvShownAt(conv);
  return svConvTurnStarts(conv.blocks).filter((start) => start < at).length;
}

function svConvKey(e) {
  return `${e.tag}:${++e.conv.seq}`;
}

function svConvSay(one) {
  const said = { ...one };
  if (one.parts) said.parts = one.parts.slice();
  if (one.thumbs) said.thumbs = one.thumbs.map((t) => ({ ...t }));
  if (one.shots) said.shots = one.shots.map((t) => ({ ...t }));
  if (one.diff) said.diff = one.diff.map((t) => ({ ...t }));
  if (one.edit) said.edit = { file: one.edit.file, path: one.edit.path, added: one.edit.added, removed: one.edit.removed };
  if (one.items) said.items = one.items.map(svConvSay);
  return said;
}

function svConvSaySub(one) {
  return { ...one, dataset: { ...one.dataset }, steps: one.steps.map((step) => ({ ...step })) };
}

const svConvDue = new Set();

const ANCHOR_OFFSET = 24;
const ANCHOR_FRESH = 15000;
const FOLLOW_SLACK = 40;
const OUT_CAP = 200000;

let timelineHook = null;

function svConvTimeline(hook) {
  timelineHook = hook || null;
}

const svConvTimelineOn = (e) => !!e?.convView;

function svConvUi(e) {
  return (e.tl ||= { unfolded: new Set(), expanded: new Set(), users: new Set() });
}

function svConvLook(e) {
  if (!svConvTimelineOn(e)) return null;
  const tl = svConvUi(e);
  const extra = timelineHook?.look?.(e) || {};
  return {
    say: phrase, busy: !!e.turnOpen, waiting: (e.asked?.size || 0) > 0, since: extra.since || svConvTurnSince(e), thinking: e.conv.thinking?.text || "", tools: st.toolCalls || "all",
    steers: e.conv.steers, unfolded: tl.unfolded, expanded: tl.expanded, users: tl.users,
    turnFiles: extra.turnFiles || null, status: [...svConvBackground(e), ...(extra.status || marksStatusLines(e.name))]
  };
}

function svConvTurnSince(e) {
  const seat = (st.data?.sessions || []).find((one) => one.name === e.name && (!e.where || one.where === e.where));
  return Date.parse(seat?.turnSince || "") || 0;
}

function svConvBackground(e) {
  const running = e.subs?.size || 0;
  if (!running || e.turnOpen) return [];
  return [{ id: "bg", icon: "bot", label: running === 1 ? phrase("1 background agent running") : phrase("{n} background agents running", { n: running }) }];
}

function svConvLegacy(row) {
  if (row.kind !== "work") return row;
  return { ...row, ...svConvTally(row.items), items: row.items };
}

function svConvPaint(e) {
  e.convFrame = 0;
  svConvDue.delete(e);
  if (!e.convView) return;
  const look = svConvLook(e);
  const blocks = svConvShown(e.conv).map(svConvSay);
  const rows = look ? deriveTimelineRows(blocks, look) : legacyRows(blocks, true).map(svConvLegacy);
  e.convRows = rows;
  e.convView.show({ key: e.name, rows });
  if (e.holdOnce) {
    e.holdOnce = false;
    const s = e.scroll;
    if (s.scrollHeight - s.scrollTop - s.clientHeight > FOLLOW_SLACK) { e.atBottom = false; e.anchor = null; }
  } else svConvStick(e);
  svConvEndPill(e, look);
  if (look) timelineHook?.painted?.(e);
  screenReaderHeard(e);
}

function svConvRowEls(e) {
  const els = new Map();
  const kids = e.scroll?.children || [];
  (e.convRows || []).forEach((row, at) => { if (kids[at]) els.set(row.key, kids[at]); });
  return els;
}

function svConvElements(e) {
  svConvFlush(e);
  return svConvRowEls(e);
}

function svConvAnchor(e, block) {
  if (!block || block.peer || !e.atBottom) return;
  if (Date.now() - Number(block.at || 0) > ANCHOR_FRESH) return;
  e.anchor = { key: block.key };
}

function svConvAnchorLetsGo(e) {
  if (e.conv.thinking?.text) return true;
  const at = e.conv.blocks.findIndex((one) => one.key === e.anchor.key);
  if (at < 0) return true;
  return e.conv.blocks.slice(at + 1).some((one) => one.kind === "tool" || one.kind === "think" || one.kind === "memsave");
}

function svConvSpace(e, px) {
  if ((e.anchorSpace || 0) === px) return;
  e.anchorSpace = px;
  e.scroll.style.setProperty("--tl-anchor-space", `${px}px`);
}

function svConvHold(e) {
  const el = svConvRowEls(e).get(e.anchor.key);
  if (!el?.getBoundingClientRect) {
    e.anchor = null;
    return svConvStick(e);
  }
  const s = e.scroll;
  const top = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop;
  const want = Math.max(0, Math.round(top - ANCHOR_OFFSET));
  const end = s.scrollHeight - (e.anchorSpace || 0);
  svConvSpace(e, Math.max(0, Math.ceil(want + s.clientHeight - end)));
  e.anchorTop = want;
  if (e.anchor.placed && !e.anchorSpace) return;
  e.anchor.placed = true;
  s.scrollTop = want;
}

function svConvStick(e) {
  if (!e.scroll) return;
  if (e.anchor && !e.atBottom) e.anchor = null;
  if (e.anchor && (!svConvTimelineOn(e) || svConvAnchorLetsGo(e))) {
    e.anchor = null;
    e.atBottom = true;
  }
  if (e.anchor) return svConvHold(e);
  if (e.anchorSpace && (e.atBottom || !e.turnOpen)) svConvSpace(e, 0);
  if (e.atBottom) e.scroll.scrollTop = e.scroll.scrollHeight;
}

function svConvLetGo(e) {
  if (!svConvTimelineOn(e) || !(e.scroll?.scrollTop > 0)) return;
  e.anchor = null;
  e.atBottom = false;
}

function svConvScrolled(e) {
  const s = e.scroll;
  const distance = s.scrollHeight - s.scrollTop - s.clientHeight;
  if (e.dragging && s.scrollTop < (e.lastScrollY || 0) - 1) svConvLetGo(e);
  if (e.anchor) {
    if (!e.anchorSpace && distance <= FOLLOW_SLACK && s.scrollTop > (e.anchorTop ?? Infinity) + 1) {
      e.anchor = null;
      e.atBottom = true;
    }
  } else if (distance <= FOLLOW_SLACK) e.atBottom = true;
  svConvRemember(e);
}

function svConvRemember(e) {
  if (e.rememberFrame) return;
  e.rememberFrame = requestAnimationFrame(() => {
    e.rememberFrame = 0;
    const view = e.scroll.getBoundingClientRect();
    if (!view.height) return;
    const rows = e.convRows || [];
    const kids = e.scroll.children;
    for (let at = 0; at < rows.length; at++) {
      const box = kids[at]?.getBoundingClientRect();
      if (!box || box.bottom <= view.top) continue;
      e.tlPos = { key: rows[at].key, offset: view.top - box.top };
      return;
    }
  });
}

function svConvRestore(e) {
  if (!e.scroll?.isConnected) return;
  if (e.anchor || e.atBottom || !e.tlPos) return svConvStick(e);
  const el = svConvRowEls(e).get(e.tlPos.key);
  if (!el?.getBoundingClientRect) return;
  const s = e.scroll;
  s.scrollTop = el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop + e.tlPos.offset;
  e.lastScrollY = s.scrollTop;
}

function svConvToggle(e, set, key) {
  const held = svConvUi(e)[set];
  if (!held || !key) return;
  if (held.has(key)) held.delete(key);
  else held.add(key);
  e.holdOnce = true;
  svConvShowNow(e);
}

const escHtml = (text) => String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function svConvEndPill(e, look) {
  const jump = e.host?.querySelector?.(".sv-jump");
  if (!jump) return;
  let html = "";
  if (look) {
    const queued = e.queuedEls?.length || 0;
    const subs = e.subs?.size || 0;
    const summary = [queued ? phrase("{n} queued", { n: queued }) : "", subs ? (subs === 1 ? phrase("Subagent running") : phrase("{n} subagents running", { n: subs })) : ""].filter(Boolean).join(" · ");
    html = `<svg class="tl-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>${escHtml(phrase("Scroll to end"))}</span>${summary ? `<span class="tl-jsum"><span aria-hidden="true">· </span>${escHtml(summary)}</span>` : ""}`;
  }
  if ((jump.dataset.tl || "") === html) return;
  if (html) {
    jump.dataset.tl = html;
    jump.innerHTML = html;
  } else {
    delete jump.dataset.tl;
    jump.textContent = phrase("↓ latest");
  }
}

document.addEventListener("hive:marks", () => {
  for (const e of structPool.values()) if (e.convView) svConvShow(e);
});

function svConvShow(e) {
  if (!e.convView || e.convFrame) return;
  svConvDue.add(e);
  e.convFrame = requestAnimationFrame(() => svConvPaint(e));
}

function svConvShowNow(e) {
  if (e.convFrame) cancelAnimationFrame(e.convFrame);
  svConvPaint(e);
}

function svConvFlush(e) {
  if (e.convFrame) svConvShowNow(e);
}

function svConvFlushAll() {
  for (const e of [...svConvDue]) svConvFlush(e);
}

function svConvShowSubs(e) {
  if (!e.subsView) return;
  e.subsView.show({ key: e.name, subs: e.conv.subs.map(svConvSaySub) });
}

const SV_CONV_QUIET = ["think", "work", "tool", "retry"];

const svConvSayKind = (one) => (one.kind === "bubble" ? "bubble" : "said");

function svConvAppend(e, el) {
  return svConvPush(e, { key: svConvKey(e), kind: "node", el });
}

function svConvAppendAfter(e, anchor, el) {
  const at = anchor ? e.conv.blocks.indexOf(anchor) : -1;
  if (at < 0) return svConvAppend(e, el);
  const block = { key: svConvKey(e), kind: "node", el };
  e.conv.blocks.splice(at + 1, 0, block);
  svConvShow(e);
  return block;
}

function svConvPrepend(e, block) {
  e.conv.blocks.unshift(block);
  svConvShow(e);
  return block;
}

function svConvPush(e, block) {
  if (block.kind === "bubble") for (let at = e.conv.blocks.length - 1; at >= 0; at--) if (e.conv.blocks[at].kind === "memturn") e.conv.blocks.splice(at, 1);
  e.conv.blocks.push(block);
  if (block.kind === "bubble" || (block.kind === "said" && !block.streaming)) svConvStamp(e, block);
  svConvShow(e);
  return block;
}

const svConvAsCard = (one) => ({ dataset: { kind: one.face }, querySelector: () => ({ textContent: one.arg }) });

function svConvTally(items) {
  const cards = items.filter((one) => one.kind === "tool");
  const failed = cards.filter((one) => one.stat === "bad").length;
  const spent = cards.reduce((sum, one) => sum + Number(one.ms || 0), 0);
  return {
    name: workSummary(cards.map(svConvAsCard)),
    bad: !!failed,
    badly: failed ? phrase("{n} failed", { n: failed }) : "",
    ms: spent ? tookLabel(spent) : ""
  };
}

function svConvNear(e, block, back) {
  const list = e.conv.blocks;
  let at = list.indexOf(block) + (back ? -1 : 1);
  while (at >= 0 && at < list.length) {
    const one = list[at];
    if (one.kind === "said" || one.kind === "bubble") return one;
    if (!SV_CONV_QUIET.includes(one.kind)) return null;
    at += back ? -1 : 1;
  }
  return null;
}

function svConvNow(e) {
  if (e.heardAt && Date.now() - e.heardAt > 1000) return Date.now();
  return e.at || Date.now();
}

function svConvStamp(e, block) {
  const at = String(svConvNow(e));
  const prev = svConvNear(e, block, true);
  const goes = !!prev && svConvSayKind(prev) === svConvSayKind(block) && prev.stamped;
  block.stamped = true;
  block.at = at;
  block.said = goes ? prev.said || prev.at : at;
  if (goes) prev.stamped = false;
}

function svConvStopped(e) {
  const ask = e.conv.blocks.findLast((one) => one.kind === "bubble" && one.at);
  const took = ask ? workedFor((e.at || Date.now()) - Number(ask.at)) : "";
  const text = took ? phrase("You stopped after {d}", { d: took }) : phrase("You stopped this response");
  return svConvPush(e, { key: svConvKey(e), kind: "meta", cls: "sv-meta sv-stopped", text });
}

function svConvLine(e, cls, text) {
  if (!/(^|\s)sv-user(\s|$)/.test(cls)) return svConvPush(e, { key: svConvKey(e), kind: "meta", cls, text });
  const bubble = svConvPush(e, { key: svConvKey(e), kind: "bubble", body: svConvBubbleBody(text, e), text: String(text ?? ""), thumbs: [], dataset: {}, peer: /(^|\s)peer(\s|$)/.test(cls), stamped: false, at: "", said: "", editing: null });
  svConvAnchor(e, bubble);
  return bubble;
}

function fillMarked(el, words) {
  const box = el.ownerDocument.createElement("div");
  box.className = "sv-said-md md";
  box.innerHTML = renderMarkdown(words);
  el.textContent = "";
  el.append(box);
  return el;
}

const fillWords = (el, words) => (markedSaid(words) ? fillMarked(el, words) : fillSaid(el, words, paintSaidCommand));

const quoteLetters = (text) => String(text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const SV_CONV_UNCOPIED = "button, svg, .md-codehead, .md-tablebar, .sv-stamp, .tx-cf, .mshots, .uatts";

function svConvCopyText(block) {
  const hold = document.createElement("template");
  hold.innerHTML = block.kind === "bubble" ? block.body || "" : (block.parts || []).join("");
  for (const kept of hold.content.querySelectorAll("[data-md-copy]")) kept.replaceWith(kept.dataset.mdCopy);
  for (const hidden of hold.content.querySelectorAll(SV_CONV_UNCOPIED)) hidden.remove();
  return hold.content.textContent;
}

function svConvRunAround(blocks, block) {
  const at = blocks.indexOf(block);
  const run = [block];
  for (const step of [-1, 1]) {
    for (let i = at + step; i >= 0 && i < blocks.length; i += step) {
      const one = blocks[i];
      if (SV_CONV_QUIET.includes(one.kind)) continue;
      if ((one.kind !== "said" && one.kind !== "bubble") || svConvSayKind(one) !== svConvSayKind(block)) break;
      if (step < 0) run.unshift(one);
      else run.push(one);
    }
  }
  return run;
}

function svConvQuotesPart(e, said) {
  const blocks = e?.conv?.blocks || [];
  const source = quotedBlock(blocks, blocks.length, needleOf(quoteLines(said)));
  if (!source) return false;
  const quoted = quoteLetters(said);
  return !!quoted && quoted !== quoteLetters(svConvRunAround(blocks, source).map(svConvCopyText).join(" "));
}

function svConvQuoteCards(e, text, split) {
  const cards = document.createElement("div");
  cards.className = "sv-said-quotes";
  cards.dataset.mdCopy = text.slice(0, text.length - split.rest.length).replace(/\n$/, "");
  for (const quoted of split.quotes) cards.appendChild(svQuoteCard(quoted, svConvQuotesPart(e, quoted)));
  return cards;
}

function svConvBubbleBody(text, e) {
  const hold = document.createElement("div");
  const split = splitLeadingQuotes(text);
  const said = (el, words) => (hasPasted(words) ? fillWithPastes(el, words, (part, piece) => paintSaidChips(fillWords(part, piece))) : paintSaidChips(fillWords(el, words)));
  if (!split) {
    said(hold, text);
  } else {
    hold.appendChild(svConvQuoteCards(e, String(text), split));
    if (split.rest) {
      const body = document.createElement("div");
      body.className = "sv-said-body";
      said(body, split.rest);
      hold.appendChild(body);
    }
  }
  return hold.innerHTML;
}

const svConvBubbleAt = (e, uuid) => (uuid ? e.conv.blocks.findIndex((one) => one.kind === "bubble" && one.dataset?.uuid === uuid) : -1);

function svConvBubbleOf(e, uuid) {
  return e.conv.blocks[svConvBubbleAt(e, uuid)] || null;
}

function svConvBeforeCompact(e, uuid) {
  const at = svConvBubbleAt(e, uuid);
  return at >= 0 && e.conv.blocks.slice(at + 1).some((one) => one.kind === "meta" && /(^|\s)sv-compacted(\s|$)/.test(one.cls || ""));
}

function svConvEdit(e, uuid, words) {
  const block = svConvBubbleOf(e, uuid);
  if (!block) return null;
  for (const one of e.conv.blocks) if (one.editing && one !== block) one.editing = null;
  block.editing = { text: block.text || "", busy: false, error: "", ...words };
  svConvShow(e);
  return block;
}

function svConvEditing(e, block, change = null) {
  if (!block) return;
  block.editing = change && block.editing ? { ...block.editing, ...change } : null;
  svConvShow(e);
}

function svConvRewind(e, uuid) {
  const at = svConvBubbleAt(e, uuid);
  if (at < 0) return false;
  e.conv.thinking = null;
  e.conv.retrying = null;
  e.conv.blocks.splice(at);
  svConvShow(e);
  return true;
}

function svConvSaidAs(e, was, uuid) {
  const block = svConvBubbleOf(e, was);
  if (!block) return;
  block.dataset.uuid = uuid;
  svConvShow(e);
}

function svConvMentions(block) {
  const hold = document.createElement("div");
  hold.innerHTML = block.body;
  paintMentions(hold);
  block.body = hold.innerHTML;
  return block;
}

function svConvThumb(e, block, path) {
  const short = path.split("/").pop();
  const src = `/api/image?path=${encodeURIComponent(path)}&where=${e.where}&name=${encodeURIComponent(e.name)}`;
  const inline = giveImageChipItsPicture(block.body, block.thumbs.length + 1, { src, name: short, path });
  if (inline) block.body = inline;
  block.thumbs.push({
    key: `${block.key}:${block.thumbs.length}`,
    inline: !!inline,
    path,
    mark: `#${block.thumbs.length + 1}`,
    src,
    alt: short,
    name: short,
    title: phrase("{short} — click to see it big", { short })
  });
  svConvShow(e);
}

const KEEP_WORDS = () => ({
  keep: phrase("keep on the page"),
  keepTitle: phrase("keep this print on the mission's page, with a caption"),
  caption: phrase("what this print shows, in one line"),
  after: phrase("after #"),
  afterTitle: phrase("which print this one follows: empty continues the last one, 0 starts a flow of its own"),
  keeping: phrase("keeping…"),
  kept: `${phrase("on the page")} ✓`
});

function svConvSaid(e, text) {
  const block = svConvPush(e, { key: svConvKey(e), kind: "said", parts: renderMarkdownBlocks(text), streaming: false, stamped: false, at: "", said: "", shots: [], words: KEEP_WORDS() });
  svConvShots(e, block, shotsOfSaid(text));
  return block;
}

function svConvSettle(e, text) {
  const block = e.draft?.block;
  if (!block || e.draft.raw.trim() !== String(text).trim() || !e.conv.blocks.includes(block)) return null;
  block.streaming = false;
  block.parts = renderMarkdownBlocks(text);
  svConvStamp(e, block);
  svConvShots(e, block, shotsOfSaid(text));
  svConvShow(e);
  return block;
}

function svConvThink(e, body, dur) {
  e.conv.thinking = null;
  return svConvPush(e, { key: svConvKey(e), kind: "think", thinking: phrase("thinking"), thought: phrase("thought"), dur, body });
}

function svConvThinking(e, text, fresh = false) {
  if (fresh || !e.conv.thinking) e.conv.thinking = { text: "" };
  e.conv.thinking.text += String(text || "");
  svConvShow(e);
}

function svConvRetryLabel(block) {
  const n = block.attempt;
  if (block.state === "recovered") return n === 1 ? phrase("Recovered after 1 retry") : phrase("Recovered after {n} retries", { n });
  if (block.state === "failed") return n === 1 ? phrase("Gave up after 1 retry") : phrase("Gave up after {n} retries", { n });
  const d = tookLabel(block.delay);
  return block.max ? phrase("Retrying ({n}/{max}) in {d}", { n, max: block.max, d }) : phrase("Retrying ({n}) in {d}", { n, d });
}

function svConvRetry(e, ev) {
  let block = e.conv.retrying;
  if (!block) block = e.conv.retrying = svConvPush(e, { key: svConvKey(e), kind: "retry", state: "retrying", attempt: 0, max: 0, delay: 0, why: "", label: "" });
  block.attempt = Number(ev.attempt) || block.attempt + 1;
  block.max = Number(ev.max_retries) || 0;
  block.delay = Math.max(0, Number(ev.retry_delay_ms) || 0);
  block.why = ev.error_status ? String(ev.error_status) : ev.error && ev.error !== "unknown" ? String(ev.error) : "";
  block.label = svConvRetryLabel(block);
  svConvShow(e);
  return block;
}

function svConvRecovered(e, failed = false) {
  const block = e.conv.retrying;
  if (!block) return;
  e.conv.retrying = null;
  block.state = failed ? "failed" : "recovered";
  block.label = svConvRetryLabel(block);
  svConvShow(e);
}

function svConvTurnEnded(e, failed = false) {
  e.conv.thinking = null;
  svConvRecovered(e, failed);
  svConvShow(e);
}

function svConvTurnStart(e) {
  const blocks = e.conv.blocks;
  const at = blocks.findLastIndex((one) => one.kind === "bubble" && !one.peer);
  if (at < 0 || blocks[at].turnStart || blocks.slice(at + 1).some((one) => one.kind === "said" || one.kind === "tool")) return;
  blocks[at].turnStart = true;
  svConvShow(e);
}

function svConvSteer(e, cid) {
  if (!cid) return;
  e.conv.steers.add(cid);
  svConvShow(e);
}

function svConvDispatched(e, cid) {
  if (!cid) return;
  const list = e.conv.blocks;
  const at = list.findLastIndex((one) => one.kind === "bubble" && one.dataset?.cid === cid);
  if (at < 0 || at === list.length - 1) return;
  const [bubble] = list.splice(at, 1);
  list.push(bubble);
  bubble.stamped = false;
  svConvStamp(e, bubble);
  svConvAnchor(e, bubble);
  svConvShow(e);
}

function svConvNote(e, label, body) {
  return svConvPush(e, { key: svConvKey(e), kind: "think", label, body });
}

function svConvPeer(e, from, consumed, seat = from) {
  return svConvPush(e, {
    key: svConvKey(e), kind: "peer", from: `${phrase("from")} `, name: from, seat,
    says: phrase(consumed ? "answering what this chat asked" : "another chat wrote to this one")
  });
}

const titleOf = (word) => (word ? word[0].toUpperCase() + word.slice(1) : "");

function switchSays(from, to, nameOf) {
  const model = nameOf(from.model) !== nameOf(to.model);
  const effort = (from.effort || "") !== (to.effort || "");
  if (!model && !effort) return null;
  const level = (one) => (one ? titleOf(one) : model ? "" : phrase("Default"));
  const side = (one) => [model ? nameOf(one.model) : "", effort ? level(one.effort) : ""].filter(Boolean).join(" ");
  return { from: side(from), to: side(to) };
}

function svConvSwitch(e, before, after, nameOf) {
  const last = e.conv.blocks.at(-1);
  const held = last?.kind === "switch" ? last : null;
  const from = held ? held.before : before;
  const said = switchSays(from, after, nameOf);
  if (!said) {
    if (held) {
      e.conv.blocks.pop();
      svConvShow(e);
    }
    return null;
  }
  if (held) {
    Object.assign(held, { after, ...said });
    svConvShow(e);
    return held;
  }
  return svConvPush(e, { key: svConvKey(e), kind: "switch", before: from, after, ...said });
}

function svConvStream(e, chunk) {
  if (!e.draft) {
    e.draft = {
      block: svConvPush(e, { key: svConvKey(e), kind: "said", parts: [], streaming: true, stamped: false, at: "", said: "", shots: [], words: KEEP_WORDS() }),
      held: liveStart(), pending: "", raw: "", frame: 0
    };
  }
  e.draft.raw += chunk;
  e.draft.pending += chunk;
  if (!e.draft.frame) e.draft.frame = requestAnimationFrame(() => svConvDraftPaint(e));
}

function svConvDraftPaint(e) {
  const draft = e.draft;
  if (!draft) return;
  draft.frame = 0;
  if (!draft.pending) return;
  draft.held = liveStep(draft.held, draft.pending);
  draft.pending = "";
  draft.block.parts = draft.held.blocks;
  svConvShowNow(e);
}

function svConvCards(e) {
  return e.conv.blocks.filter((one) => one.kind === "tool");
}

function svConvDraftDrop(e) {
  const at = e.conv.blocks.indexOf(e.draft.block);
  if (at >= 0) e.conv.blocks.splice(at, 1);
  svConvShow(e);
}

function svConvFavicon(e, block) {
  if (!isBrowserTool(block.name)) return "";
  const page = pageOfInput(block.input);
  if (page) e.browserPage = page;
  return faviconOf(page || e.browserPage || "");
}

function svConvTool(e, block, live) {
  const face = toolFace(block.name);
  const card = {
    key: svConvKey(e), kind: "tool", running: true, keep: false,
    face: face.kind, tool: String(block.name || ""), glyph: face.glyph,
    name: face.label, server: face.server, arg: toolArg(block.name, block.input).slice(0, 300),
    title: toolTitle(block.name, block.input), t0: live ? String(Date.now()) : "", ms: "",
    cmd: /^bash$/i.test(String(block.name || "")) ? String(block.input?.command || "") : "", out: null, exit: null, cut: false,
    use: String(block.id || ""), whole: true, loading: false, loadError: "",
    at: String(svConvNow(e)), done: "",
    shot: shotOfInput(block.input) || "", link: null, took: "", stat: "", failed: "", body: "", diff: null, shots: [],
    edit: editOf(block.name, block.input),
    args: toolArgs(face.kind, block.input, face.server, face.label), json: "", web: null,
    hive: hiveCallOf(face.server, face.label, block.input),
    favicon: svConvFavicon(e, block)
  };
  card.diff = card.edit?.lines || null;
  const pr = prToolSummary(block.name, block.input, { state: "running" }, phrase);
  if (pr) Object.assign(card, { glyph: "i-pr", name: pr.label, arg: pr.repository, prInput: block.input });
  e.skillCard = SKILL_TOOL.test(String(block.name || "")) ? card : null;
  e.tools.set(block.id, card);
  svConvPush(e, card);
  if (live && AGENT_TOOL.test(String(block.name || ""))) svSubPin(e, block);
  return card;
}

function svConvDiff(text) {
  const lines = diffLines(text);
  if (!lines) return null;
  return lines.map((line, at) => ({
    key: at,
    cls: /^(\+\+\+|---)/.test(line) || DIFF_HUNK.test(line) ? "ctx" : line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx",
    text: line
  }));
}

function svConvToolLink(card, text) {
  if (String(card.tool || "").toLowerCase() !== "artifact") return null;
  const url = artifactLink(text);
  return url ? { url, label: phrase("open ↗") } : null;
}

function svConvToolLanded(e, block, live) {
  const card = e.tools.get(block.tool_use_id);
  if (!card) return;
  if (card.kind !== "tool") return svArtLanded(e, card, block, live);
  card.running = false;
  card.done = String(svConvNow(e));
  card.stat = block.is_error ? "bad" : "ok";
  card.failed = block.is_error ? phrase("failed") : "";
  if (card.hive?.kind === "spawn" && !block.is_error) card.hive.made = chatsOpenedIn(resultText(block.content), card.hive.made);
  if (card.t0) {
    const spent = Date.now() - Number(card.t0);
    card.ms = String(spent);
    card.took = spent >= TOOK_SHOWN_FROM_MS ? tookLabel(spent) : "";
  }
  const text = resultText(block.content);
  const shown = trimBody(text);
  card.body = shown;
  const pr = prToolSummary(card.tool, card.prInput, { state: block.is_error ? "failed" : "done", output: text }, phrase);
  if (pr) Object.assign(card, { name: pr.label, arg: pr.repository || card.arg });
  if (card.cmd) {
    const ran = commandResult(text, !!block.is_error);
    card.cut = ran.out.length > OUT_CAP;
    card.out = card.cut ? ran.out.slice(-OUT_CAP) : ran.out;
    card.exit = ran.exit;
    card.whole = !/^\s*<persisted-output>/.test(ran.out);
  }
  if (e.subs?.has(block.tool_use_id)) {
    if (!block.is_error && ASYNC_LAUNCH.test(text.trim())) svSubAsync(e, block.tool_use_id);
    else svSubUnpin(e, block.tool_use_id);
  }
  card.edit = editLanded(card.edit, { failed: !!block.is_error, text });
  card.diff = svConvDiff(shown) || card.edit?.lines || null;
  card.link = svConvToolLink(card, text);
  card.web = /^websearch$/i.test(card.tool) && !block.is_error ? webResults(text) : null;
  card.json = card.web || card.cmd ? "" : prettyJson(text);
  if (!block.is_error) {
    const shots = shotsOfTool(card.shot || "", shown, block.content);
    card.body = withoutImageNotes(shown, shots, block.content);
    svConvShots(e, card, shots);
  }
  svConvShow(e);
}

async function svConvWholeOutput(e, key) {
  const card = e.conv.blocks.find((one) => one.key === key);
  if (!card?.use || card.whole || card.loading) return;
  card.loading = true;
  card.loadError = "";
  svConvShow(e);
  let said = null;
  try {
    said = await (await fetch(`/api/seat/tool-output?name=${encodeURIComponent(e.name)}&where=${e.where}&id=${encodeURIComponent(card.use)}`)).json();
  } catch (wrong) {
    said = { error: String(wrong?.message || wrong) };
  }
  card.loading = false;
  if (said?.ok && typeof said.output === "string") {
    card.out = said.output;
    card.cut = !!said.cut;
    card.whole = true;
  } else card.loadError = said?.error || phrase("the server did not answer for this seat");
  svConvShow(e);
}

function svConvShotOf(e, shown) {
  for (const block of e.conv.blocks) {
    const found = (block.shots || []).find((one) => one.key === shown.key);
    if (found) return found;
  }
  return null;
}

function svConvShots(e, card, paths) {
  card.shots = [];
  if (!paths.length) return;
  if (card.kind === "tool") card.keep = true;
  for (const path of paths) {
    const short = path.split("/").pop();
    card.shots.push({
      key: `${card.key}:${path}`,
      path,
      src: `/api/image?path=${encodeURIComponent(path)}&where=${e.where}&name=${encodeURIComponent(e.name)}`,
      alt: short,
      title: phrase("{short} — click to see it big", { short })
    });
  }
  svConvShow(e);
}

function svConvRunOff(e, card) {
  if (!card) return;
  if (!card.kind) return void card.classList.remove("running");
  card.running = false;
  svConvShow(e);
}

function svConvUnsay(e, cid) {
  const at = e.conv.blocks.findIndex((one) => one.kind === "bubble" && one.dataset?.cid === cid);
  if (at < 0) return;
  e.conv.blocks.splice(at, 1);
  svConvShow(e);
}

function svConvSubPin(e, block) {
  const t0 = e.at || Date.now();
  if (Date.now() - t0 > SUB_STALE) return null;
  const inp = block.input && typeof block.input === "object" ? block.input : {};
  const item = {
    key: `${e.tag}:sub:${block.id}`, dataset: { t0: String(t0), bg: "", task: "" },
    name: String(inp.subagent_type || "subagent"),
    arg: oneLine(inp.description || inp.prompt || "").slice(0, 300),
    background: phrase("background"),
    hint: phrase("open it to see the whole run — it drops back into the chat when it lands"),
    body: trimBody(String(inp.prompt || "").trim()), ms: "", steps: [], step: 0
  };
  e.subs.set(block.id, item);
  e.conv.subs.push(item);
  paintSubs(e);
  return item;
}

function svConvSubStep(e, id, kind, glyph, text, key) {
  const item = e.subs?.get(id);
  if (!item) return null;
  const step = {
    key: `${item.key}:${++item.step}`, face: kind, glyph, of: key ? String(key) : "",
    text: oneLine(text).slice(0, 300) || "…", now: true, open: false, bad: false, landed: false, hint: ""
  };
  item.steps.push(step);
  while (item.steps.length > SUB_LOG_MAX) item.steps.shift();
  for (const past of item.steps) past.now = past === step;
  svConvShowSubs(e);
  return step;
}

function svConvSubOpen(e, step, title) {
  step.open = true;
  step.hint = title;
  svConvShowSubs(e);
  return step;
}

function svConvSubLanded(e, id, toolUseId, bad) {
  const item = e.subs?.get(id);
  if (!item || !toolUseId) return;
  for (const step of item.steps) {
    if (step.of !== String(toolUseId)) continue;
    step.open = false;
    step.bad = !!bad;
    step.landed = true;
  }
  svConvShowSubs(e);
}

function svConvSubUnpin(e, id) {
  const item = e.subs?.get(id);
  if (!item) return;
  e.subs.delete(id);
  const at = e.conv.subs.indexOf(item);
  if (at >= 0) e.conv.subs.splice(at, 1);
  paintSubs(e);
}

const subAge = (ms) => (ms < 120000 ? tookLabel(ms) : `${Math.round(ms / 60000)}m`);

function svConvSubs(e) {
  if (raycastOn()) return svConvSubsAged(e);
  const dock = e.host?.querySelector(".sv-subs");
  if (dock) {
    dock.classList.toggle("on", !!e.subs?.size);
    const count = dock.querySelector(".scount");
    if (count) count.textContent = String(e.subs?.size || 0);
  }
  for (const item of e.conv.subs) {
    const spent = Date.now() - Number(item.dataset.t0 || 0);
    item.ms = spent > 1500 ? tookLabel(spent) : "";
  }
  svConvShowSubs(e);
}

function svConvSubsAged(e) {
  const dock = e.host?.querySelector(".sv-subs");
  let oldest = 0;
  for (const item of e.conv.subs) {
    const spent = Date.now() - Number(item.dataset.t0 || 0);
    oldest = Math.max(oldest, spent);
    item.ms = spent > 1500 ? subAge(spent) : "";
  }
  if (dock) {
    dock.classList.toggle("on", !!e.subs?.size);
    const count = dock.querySelector(".scount");
    if (count) count.textContent = oldest >= 60000 ? `${e.subs?.size || 0} · ${phrase("{n} min", { n: Math.round(oldest / 60000) })}` : String(e.subs?.size || 0);
  }
  svConvShowSubs(e);
}

function svConvActions(e) {
  return {
    wire: (root) => {
      wireMdShots(e, root);
      wireLinks(e.name, root);
      wireChips(root);
      enrichMarkdown(root, { seat: e });
      markFileDrags(e, root);
    },
    shot: (path, from) => openShotFrom(from, path, e.where, e.name),
    shotSeen: (img) => {
      const card = img.closest(".sv-tool");
      const body = card?.querySelector(".tbody");
      if (body && IMAGE_NOTE_ONLY.test(body.textContent)) body.textContent = "";
      if (card) card.open = true;
    },
    shotGone: (img) => {
      const strip = img.closest(".mshots, .tshots") || img.parentElement;
      const item = img.closest(".mshot") || img;
      item.remove();
      if (strip && !strip.querySelector("img")) strip.remove();
    },
    openKept: (shot) => {
      const link = /^hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})(?:\?tab=([a-z]+))?/i.exec(String(shot.kept || ""));
      if (link) window.hiveOpenPage?.({ slug: link[1], tab: link[2] || "prints", version: 0, at: "", from: e.name });
    },
    keepAsk: (shown) => {
      const shot = svConvShotOf(e, shown);
      if (!shot) return;
      shot.keeping = shot.keeping === "ask" ? "" : "ask";
      svConvShow(e);
    },
    keepPrint: async (shown, caption, after = "last") => {
      const shot = svConvShotOf(e, shown);
      if (!shot) return { error: "that picture is no longer in the chat" };
      shot.keeping = "busy";
      shot.keepError = "";
      svConvShow(e);
      const kept = await keepPrintOnPage(e, shot, caption, { after }).catch((err) => ({ error: String(err.message || err) }));
      shot.keeping = kept.error ? "ask" : "";
      shot.keepError = kept.error || "";
      if (!kept.error) shot.kept = kept.link || "";
      svConvShow(e);
      return kept;
    },
    art: (row) => openArtifact(e, row),
    memory: (id) => openMemoryAt(id),
    memoryScope: (shown, item, scope) => memoryTurnScope(e, shown, item, scope),
    memoryDrop: (shown, item) => memoryTurnDrop(e, shown, item),
    memoryUndo: (shown, item) => memoryTurnUndo(e, shown, item),
    editCancel: (shown) => svConvEditing(e, e.conv.blocks.find((one) => one.key === shown.key)),
    editSave: (shown, text, revert) => saveEdit(e, e.conv.blocks.find((one) => one.key === shown.key), text, revert),
    seat: (name) => { if (focusSeat(name)) render(); },
    openSeat: (name) => goTo(name),
    toggle: (set, key) => svConvToggle(e, set, key),
    files: (hit) => timelineHook?.files?.(e, hit),
    output: (block) => svConvWholeOutput(e, block.key),
    status: (act) => timelineHook?.status?.(e, act) ?? marksStatusAct(e.name, act),
    quote: (card) => jumpToQuote(e, card)
  };
}

function svConvMount(e) {
  if (e.convView || e.lastSeq) return;
  e.conv = svConvSeed();
  e.convView = convSolid.mountConversation(e.scroll, svConvActions(e));
  e.subsView = convSolid.mountSubs(e.host.querySelector(".sv-subs .sublist"));
  e.scroll.addEventListener("beforematch", (ev) => {
    const fold = ev.target.closest?.("[data-fold]")?.dataset.fold;
    if (!fold || svConvUi(e).unfolded.has(fold)) return;
    svConvUi(e).unfolded.add(fold);
    svConvShowNow(e);
  });
}

solidMounts.push((hive) => { convSolid = hive; });

export { switchSays, convSolid, FOLLOW_SLACK, SV_CONV_QUIET, svConvActions, svConvAnchor, svConvAppend, svConvAppendAfter, svConvAsCard, svConvBeforeCompact, svConvBubbleOf, svConvCards, svConvCutKey, svConvDiff, svConvDispatched, svConvDraftDrop, svConvDraftPaint, svConvEdit, svConvEditing, svConvElements, svConvEndPill, svConvFlush, svConvFlushAll, svConvHasBar, svConvKey, svConvLetGo, svConvLine, svConvMentions, svConvMount, svConvNear, svConvNote, svConvPeer, svConvPrepend, svConvPush, svConvRecovered, svConvRestore, svConvRetry, svConvRewind, svConvRowEls, svConvRunOff, svConvSaid, svConvSaidAs, svConvSay, svConvSayKind, svConvSaySub, svConvScrolled, svConvSeed, svConvSettle, svConvShots, svConvShow, svConvShown, svConvShownAt, svConvShowNow, svConvShowSubs, svConvStamp, svConvSteer, svConvStick, svConvStopped, svConvStream, svConvSubLanded, svConvSubOpen, svConvSubPin, svConvSubs, svConvSubStep, svConvSubUnpin, svConvSwitch, svConvTally, svConvThink, svConvThinking, svConvThumb, svConvTimeline, svConvTimelineOn, svConvToggle, svConvTool, svConvToolLanded, svConvToolLink, svConvTurnEnded, svConvTurnsBehind, svConvTurnStart, svConvTurnStarts, svConvUi, svConvUnsay, workedFor };
