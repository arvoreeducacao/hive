import { render } from "./arrange.js";
import { paintMentions, wireLinks } from "./chat-and-panes.js";
import { giveImageChipItsPicture, paintSaidChips, wireChips } from "./context-chips.js";
import { liveStart, liveStep, phrase, raycastOn, renderMarkdownBlocks, solidMounts } from "./core.js";
import { focusSeat } from "./focus-navigation.js";
import { openShot, wireMdShots } from "./picture-preview.js";
import { keepPrintOnPage } from "./keep-print.js";
import { openMemoryAt } from "./memories.js";
import { svMemorySaveLanded } from "./memory-signal.js";
import { saveEdit } from "./edit-message.js";
import { resultText, shotOfInput, shotsOfSaid, shotsOfTool, withoutImageNotes } from "./session-images.js";
import { fillSaid } from "/assets/said-lists.mjs";
import { paintSaidCommand, splitLeadingQuotes, svQuoteCard, workSummary } from "./structured-seats.js";
import { AGENT_TOOL, ASYNC_LAUNCH, DIFF_HUNK, IMAGE_NOTE_ONLY, SUB_LOG_MAX, SUB_STALE, diffLines, openArtifact, paintSubs, svArtLanded, svSubAsync, svSubPin, svSubUnpin, tookLabel } from "./subagents-dock.js";
import { SKILL_TOOL, artifactLink, oneLine, toolArg, toolFace, toolTitle, trimBody } from "./tool-face.js";

let convSolid = null;

function svConvSeed() {
  return { blocks: [], subs: [], seq: 0, run: null, shownFrom: null };
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
  if (one.items) said.items = one.items.map(svConvSay);
  return said;
}

function svConvSaySub(one) {
  return { ...one, dataset: { ...one.dataset }, steps: one.steps.map((step) => ({ ...step })) };
}

const svConvDue = new Set();

function svConvPaint(e) {
  e.convFrame = 0;
  svConvDue.delete(e);
  if (!e.convView) return;
  e.convView.show({ key: e.name, blocks: svConvShown(e.conv).map(svConvSay) });
  if (e.atBottom) e.scroll.scrollTop = e.scroll.scrollHeight;
}

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

const SV_CONV_WORK = ["tool", "think"];

const SV_CONV_QUIET = ["think", "work", "tool"];

const svConvSayKind = (one) => (one.kind === "bubble" ? "bubble" : "said");

function svConvAppend(e, el) {
  return svConvPush(e, { key: svConvKey(e), kind: "node", el });
}

function svConvPrepend(e, block) {
  e.conv.blocks.unshift(block);
  svConvShow(e);
  return block;
}

function svConvPush(e, block) {
  if (SV_CONV_WORK.includes(block.kind)) {
    (e.conv.run ||= { pending: [], folded: [], wrap: null }).pending.push(block);
    e.conv.blocks.push(block);
    svConvDrain(e, false);
  } else {
    svConvFold(e);
    e.conv.blocks.push(block);
  }
  if (block.kind === "bubble" || (block.kind === "said" && !block.streaming)) svConvStamp(e, block);
  svConvShow(e);
  return block;
}

function svConvWrap(e, head) {
  const wrap = { key: svConvKey(e), kind: "work", name: phrase("the work"), badly: "", ms: "", bad: false, items: [] };
  const at = e.conv.blocks.indexOf(head);
  e.conv.blocks.splice(at < 0 ? e.conv.blocks.length : at, 0, wrap);
  return wrap;
}

function svConvDrain(e, toTheEnd) {
  const run = e.conv.run;
  if (!run) return;
  while (run.pending.length > (toTheEnd ? 0 : 1)) {
    const head = run.pending[0];
    if (!toTheEnd && head.running) return;
    run.pending.shift();
    if (head.keep) { svConvSeal(e, run); continue; }
    if (!run.wrap) run.wrap = svConvWrap(e, head);
    const at = e.conv.blocks.indexOf(head);
    if (at >= 0) e.conv.blocks.splice(at, 1);
    run.wrap.items.push(head);
    run.folded.push(head);
    svConvTally(run);
  }
}

function svConvSeal(e, run) {
  const wrap = run.wrap;
  const held = run.folded;
  run.wrap = null;
  run.folded = [];
  if (!wrap || held.filter((one) => one.kind === "tool").length >= 2) return;
  const at = e.conv.blocks.indexOf(wrap);
  e.conv.blocks.splice(at < 0 ? e.conv.blocks.length : at, 1, ...held);
  wrap.items = [];
}

function svConvFold(e) {
  if (!e.conv.run) return;
  svConvDrain(e, true);
  svConvSeal(e, e.conv.run);
  e.conv.run = null;
}

const SV_TURN_HIDES = ["said", "think", "tool", "work", "memory", "memsave"];

function svTurnTook(ms) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 10000) {
    const tenths = Math.round(ms / 100) / 10;
    return tenths >= 10 ? "10s" : `${tenths.toFixed(1)}s`;
  }
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, seconds && `${seconds}s`].filter(Boolean).join(" ");
}

function svConvTurnDone(e, ev) {
  if (!e.conv || ev.is_error || (ev.subtype && ev.subtype !== "success")) return null;
  svConvFold(e);
  const blocks = e.conv.blocks;
  let start = blocks.length - 1;
  while (start >= 0 && blocks[start].kind !== "bubble") start--;
  if (start < 0) return null;
  const turn = blocks.slice(start + 1);
  if (turn.some((one) => one.kind === "turn")) return null;
  let answer = turn.length - 1;
  while (answer >= 0 && turn[answer].kind !== "said") answer--;
  const hides = turn.slice(0, Math.max(answer, 0)).filter((one) => SV_TURN_HIDES.includes(one.kind));
  if (!hides.some((one) => one.kind !== "said")) return null;
  const ms = Number(ev.duration_ms) || Math.max(0, Date.parse(ev.ts || "") - Number(blocks[start].at || 0)) || 0;
  const fold = { key: svConvKey(e), kind: "turn", open: false, hides: hides.map((one) => one.key), label: ms ? phrase("Worked for {time}", { time: svTurnTook(ms) }) : phrase("Worked") };
  for (const one of hides) one.folded = true;
  blocks.splice(start + 1, 0, fold);
  svConvShow(e);
  return fold;
}

function svConvTurnToggle(e, key) {
  const fold = e.conv?.blocks.find((one) => one.kind === "turn" && one.key === key);
  if (!fold) return;
  fold.open = !fold.open;
  const hides = new Set(fold.hides);
  for (const one of e.conv.blocks) if (hides.has(one.key)) one.folded = !fold.open;
  svConvShow(e);
}

const svConvAsCard = (one) => ({ dataset: { kind: one.face }, querySelector: () => ({ textContent: one.arg }) });

function svConvTally(run) {
  const cards = run.folded.filter((one) => one.kind === "tool");
  const failed = cards.filter((one) => one.stat === "bad").length;
  const spent = cards.reduce((sum, one) => sum + Number(one.ms || 0), 0);
  run.wrap.name = workSummary(cards.map(svConvAsCard));
  run.wrap.bad = !!failed;
  run.wrap.badly = failed ? phrase("{n} failed", { n: failed }) : "";
  run.wrap.ms = spent ? tookLabel(spent) : "";
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

function svConvStamp(e, block) {
  const at = String(e.at || Date.now());
  const prev = svConvNear(e, block, true);
  const goes = !!prev && svConvSayKind(prev) === svConvSayKind(block) && prev.stamped;
  block.stamped = true;
  block.at = at;
  block.said = goes ? prev.said || prev.at : at;
  if (goes) prev.stamped = false;
}

const SV_SAID_CLIP_LINES = 8;
const SV_SAID_CLIP_CHARS = 600;

const svSaidClips = (text) => {
  const said = String(text || "");
  return said.trim().length > 0 && (said.length > SV_SAID_CLIP_CHARS || said.split("\n").length > SV_SAID_CLIP_LINES);
};

const svSaidClip = (text) => svSaidClips(text) ? { more: phrase("Show full message"), less: phrase("Show less") } : null;

function svConvLine(e, cls, text) {
  if (!/(^|\s)sv-user(\s|$)/.test(cls)) return svConvPush(e, { key: svConvKey(e), kind: "meta", cls, text });
  const hold = document.createElement("div");
  const split = splitLeadingQuotes(text);
  if (!split) {
    paintSaidChips(fillSaid(hold, text, paintSaidCommand));
  } else {
    for (const said of split.quotes) hold.appendChild(svQuoteCard(said));
    if (split.rest) {
      const body = document.createElement("div");
      body.className = "sv-said-body";
      paintSaidChips(fillSaid(body, split.rest, paintSaidCommand));
      hold.appendChild(body);
    }
  }
  return svConvPush(e, { key: svConvKey(e), kind: "bubble", body: hold.innerHTML, text, clip: svSaidClip(text), thumbs: [], dataset: {}, peer: /(^|\s)peer(\s|$)/.test(cls), stamped: false, at: "", said: "", editing: null });
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
  e.conv.run = null;
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

function svConvThink(e, body, dur) {
  return svConvPush(e, { key: svConvKey(e), kind: "think", thinking: phrase("thinking"), thought: phrase("thought"), dur, body });
}

function svConvNote(e, label, body) {
  return svConvPush(e, { key: svConvKey(e), kind: "think", label, body });
}

function svConvPeer(e, from, consumed) {
  return svConvPush(e, {
    key: svConvKey(e), kind: "peer", from: `${phrase("from")} `, name: from,
    says: phrase(consumed ? "answering what this chat asked" : "another chat wrote to this one")
  });
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
  const cards = [];
  for (const one of e.conv.blocks) {
    if (one.kind === "tool") cards.push(one);
    if (one.kind === "work") for (const held of one.items) if (held.kind === "tool") cards.push(held);
  }
  return cards;
}

function svConvDraftDrop(e) {
  const at = e.conv.blocks.indexOf(e.draft.block);
  if (at >= 0) e.conv.blocks.splice(at, 1);
  svConvShow(e);
}

function svConvTool(e, block, live) {
  const face = toolFace(block.name);
  const card = {
    key: svConvKey(e), kind: "tool", running: true, keep: false,
    face: face.kind, tool: String(block.name || ""), glyph: face.glyph,
    name: face.label, server: face.server, arg: toolArg(block.name, block.input).slice(0, 300),
    title: toolTitle(block.name, block.input), t0: live ? String(Date.now()) : "", ms: "",
    shot: shotOfInput(block.input) || "", link: null, took: "", stat: "", failed: "", body: "", diff: null, shots: []
  };
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
  if (card.kind === "memsave") return svMemorySaveLanded(e, card, block);
  if (card.kind !== "tool") return svArtLanded(e, card, block, live);
  card.running = false;
  card.stat = block.is_error ? "bad" : "ok";
  card.failed = block.is_error ? phrase("failed") : "";
  if (card.t0) {
    const spent = Date.now() - Number(card.t0);
    card.ms = String(spent);
    card.took = tookLabel(spent);
  }
  const text = resultText(block.content);
  const shown = trimBody(text);
  card.body = shown;
  if (e.subs?.has(block.tool_use_id)) {
    if (!block.is_error && ASYNC_LAUNCH.test(text.trim())) svSubAsync(e, block.tool_use_id);
    else svSubUnpin(e, block.tool_use_id);
  }
  card.diff = svConvDiff(shown);
  card.link = svConvToolLink(card, text);
  if (!block.is_error) {
    const shots = shotsOfTool(card.shot || "", shown, block.content);
    card.body = withoutImageNotes(shown, shots, block.content);
    svConvShots(e, card, shots);
  }
  svConvShow(e);
}

function svConvShotOf(e, shown) {
  for (const block of e.conv.blocks) {
    const held = block.kind === "said" ? block.shots : block.kind === "work" ? block.items.flatMap((one) => one.shots || []) : block.shots;
    const found = (held || []).find((one) => one.key === shown.key);
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
    },
    shot: (path) => openShot(path, e.where, e.name),
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
    editCancel: (shown) => svConvEditing(e, e.conv.blocks.find((one) => one.key === shown.key)),
    editSave: (shown, text) => saveEdit(e, e.conv.blocks.find((one) => one.key === shown.key), text),
    art: (row) => openArtifact(e, row),
    memory: (id) => openMemoryAt(id),
    seat: (name) => { if (focusSeat(name)) render(); },
    turn: (key) => svConvTurnToggle(e, key)
  };
}

function svConvMount(e) {
  if (e.convView || e.lastSeq) return;
  e.conv = svConvSeed();
  e.convView = convSolid.mountConversation(e.scroll, svConvActions(e));
  e.subsView = convSolid.mountSubs(e.host.querySelector(".sv-subs .sublist"));
}

solidMounts.push((hive) => { convSolid = hive; });

export { SV_CONV_QUIET, SV_CONV_WORK, convSolid, svConvActions, svConvAppend, svConvAsCard, svConvBeforeCompact, svConvBubbleOf, svConvCards, svConvCutKey, svConvDiff, svConvDraftDrop, svConvDraftPaint, svConvDrain, svConvEdit, svConvEditing, svConvFold, svConvHasBar, svConvKey, svConvLine, svConvMentions, svConvMount, svConvNear, svConvNote, svConvPeer, svConvPrepend, svConvPush, svConvRewind, svConvRunOff, svConvSaid, svConvSaidAs, svConvSay, svConvSayKind, svConvSaySub, svConvSeal, svConvSeed, svConvShots, svConvShow, svConvShowNow, svConvFlush, svConvFlushAll, svConvShowSubs, svConvShown, svConvShownAt, svConvStamp, svConvStream, svConvSubLanded, svConvSubOpen, svConvSubPin, svConvSubStep, svConvSubUnpin, svConvSubs, svConvTally, svConvThink, svConvThumb, svConvTool, svConvToolLanded, svConvToolLink, svConvTurnDone, svConvTurnStarts, svConvTurnToggle, svConvTurnsBehind, svConvUnsay, svConvWrap, svSaidClips, svTurnTook };
