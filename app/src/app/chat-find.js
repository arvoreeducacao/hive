import { svLoadWhole, svRevealBlock } from "./chat-stretches.js";
import { svConvElements, svConvShown } from "./conversation-model.js";
import { phrase } from "./core.js";
import { structPool } from "./structured-seats.js";

const FIND_KINDS = ["bubble", "said"];

const FIND_BREAKS = new Set(["address", "article", "aside", "blockquote", "br", "dd", "details", "div", "dl", "dt", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"]);

const FIND_SKIP = "button, svg, .mshots, .uatts, .sv-stamp, .tx-cf, .tl-ufoot";

const FIND_HIT = "hive-find";

const FIND_ACTIVE = "hive-find-active";

const FIND_MAX = 200;

let current = null;

function foldCase(text) {
  const lowered = text.toLowerCase().replace(/ς/g, "σ");
  if (lowered.length === text.length) return lowered;
  let folded = "";
  for (const char of text) {
    const one = char.toLowerCase().replace(/ς/g, "σ");
    folded += one.length === char.length ? one : char;
  }
  return folded;
}

function findOffsets(text, query) {
  const offsets = [];
  if (!text || !query) return offsets;
  const hay = foldCase(text);
  const needle = foldCase(query);
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) offsets.push(at);
  return offsets;
}

function findRuns(root) {
  const runs = [];
  let run = { text: "", nodes: [] };
  const flush = () => {
    if (run.nodes.length) runs.push(run);
    run = { text: "", nodes: [] };
  };
  const visit = (node, inPre) => {
    if (node.nodeType === 3) {
      const value = node.nodeValue || "";
      const start = run.text.length;
      run.text += inPre ? value : value.replace(/\r?\n/g, " ");
      run.nodes.push({ node, start, end: run.text.length });
      return;
    }
    if (node.nodeType !== 1) return;
    if (node.matches(FIND_SKIP)) return flush();
    const tag = node.tagName.toLowerCase();
    const breaks = FIND_BREAKS.has(tag);
    if (breaks) flush();
    for (const child of node.childNodes) visit(child, inPre || tag === "pre");
    if (breaks) flush();
  };
  for (const child of root.childNodes) visit(child, false);
  flush();
  return runs;
}

function findRanges(el, query) {
  const ranges = [];
  for (const run of findRuns(el)) {
    let first = 0;
    for (const offset of findOffsets(run.text, query)) {
      while (first < run.nodes.length && run.nodes[first].end <= offset) first++;
      let last = first;
      while (last < run.nodes.length && run.nodes[last].end < offset + query.length) last++;
      const start = run.nodes[first];
      const end = run.nodes[last];
      if (!start || !end) continue;
      const range = el.ownerDocument.createRange();
      range.setStart(start.node, offset - start.start);
      range.setEnd(end.node, offset + query.length - end.start);
      ranges.push(range);
    }
  }
  return ranges;
}

const textsOf = new WeakMap();

function blockTexts(block) {
  const html = block.kind === "bubble" ? block.body || "" : (block.parts || []).join("");
  const held = textsOf.get(block);
  if (held?.html === html) return held.texts;
  const hold = document.createElement("template");
  hold.innerHTML = html;
  const texts = findRuns(hold.content).map((run) => run.text);
  textsOf.set(block, { html, texts });
  return texts;
}

function findMatches(blocks, query) {
  const hits = [];
  if (!query) return hits;
  for (const block of blocks) {
    if (!FIND_KINDS.includes(block.kind)) continue;
    let occurrence = 0;
    for (const text of blockTexts(block)) {
      for (let n = findOffsets(text, query).length; n > 0; n--) hits.push({ key: block.key, occurrence: occurrence++ });
    }
  }
  return hits;
}

function firstHitFrom(hits, blocks, start) {
  if (!start) return 0;
  const order = new Map(blocks.map((one, at) => [one.key, at]));
  const from = order.get(start.key);
  if (from === undefined) return 0;
  const at = hits.findIndex((hit) => {
    const pos = order.get(hit.key);
    return pos > from || (pos === from && hit.occurrence >= start.occurrence);
  });
  return at < 0 ? 0 : at;
}

const wordsIn = (text) => foldCase(String(text || "")).match(/[\p{L}\p{N}]+/gu) || [];

function nearestHit(hits, blocks, near) {
  if (!near?.text || !hits.length) return -1;
  const want = new Set(wordsIn(near.text));
  if (!want.size) return -1;
  const byKey = new Map(blocks.map((one) => [one.key, one]));
  let best = -1;
  let bestScore = 0;
  hits.forEach((hit, at) => {
    if (at > 0 && hits[at - 1].key === hit.key) return;
    const block = byKey.get(hit.key);
    if (!block || (near.kind && block.kind !== near.kind)) return;
    let shared = 0;
    for (const word of new Set(wordsIn(blockTexts(block).join(" ")))) if (want.has(word)) shared += 1;
    const score = shared / want.size;
    if (score > 0 && score >= bestScore) {
      best = at;
      bestScore = score;
    }
  });
  return best;
}

function stepFind(index, total, delta) {
  if (total <= 0) return 0;
  const held = Math.min(Math.max(0, Math.trunc(index) || 0), total - 1);
  return (((held + delta) % total) + total) % total;
}

function findCount(index, total) {
  return total <= 0 ? "0/0" : `${Math.min(index, total - 1) + 1}/${total}`;
}

function paintedBlocks(e) {
  const els = svConvElements(e);
  const painted = [];
  for (const block of svConvShown(e.conv)) {
    if (!FIND_KINDS.includes(block.kind)) continue;
    const el = els.get(block.key);
    if (el) painted.push({ block, el });
  }
  return painted;
}

function elementOf(e, key) {
  return paintedBlocks(e).find((one) => one.block.key === key)?.el || null;
}

function readingFrom(e, query) {
  const view = e.scroll.getBoundingClientRect();
  for (const { block, el } of paintedBlocks(e)) {
    const box = el.getBoundingClientRect();
    if (box.bottom <= view.top || box.top >= view.bottom) continue;
    const ranges = findRanges(el, query);
    const next = ranges.findIndex((range) => range.getBoundingClientRect().bottom > view.top);
    return { key: block.key, occurrence: next < 0 ? ranges.length : next };
  }
  return null;
}

const canHighlight = () => typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight !== "undefined";

function clearHits() {
  if (!canHighlight()) return;
  CSS.highlights.delete(FIND_HIT);
  CSS.highlights.delete(FIND_ACTIVE);
}

function paintHits(e) {
  const find = e.find;
  if (!canHighlight()) return;
  if (!find?.open || !find.query || current !== e) return clearHits();
  const hit = find.hits[find.index];
  const rest = [];
  const active = [];
  for (const { block, el } of paintedBlocks(e)) {
    let ranges = find.cache.get(el);
    if (!ranges) {
      ranges = findRanges(el, find.query);
      find.cache.set(el, ranges);
    }
    ranges.forEach((range, occurrence) => {
      (hit && hit.key === block.key && hit.occurrence === occurrence ? active : rest).push(range);
    });
  }
  CSS.highlights.set(FIND_HIT, new Highlight(...rest));
  CSS.highlights.set(FIND_ACTIVE, new Highlight(...active));
}

const nextFrame = () => new Promise((done) => requestAnimationFrame(() => done()));

const hidden = (el) => !el.getClientRects().length || !!el.closest("[hidden]");

function centre(e, target) {
  const box = target.getBoundingClientRect();
  const view = e.scroll.getBoundingClientRect();
  if (box.top >= view.top && box.bottom <= view.bottom) return;
  e.atBottom = false;
  e.scroll.scrollTop += box.top - view.top - (e.scroll.clientHeight - box.height) / 2;
}

function bringIn(e, hit, unfold) {
  const el = elementOf(e, hit.key);
  if (!el) return;
  if (unfold && hidden(el)) {
    el.dispatchEvent(new Event("beforematch", { bubbles: true }));
    e.find.cache.clear();
  }
  const ranges = findRanges(el, e.find.query);
  centre(e, ranges[Math.min(hit.occurrence, ranges.length - 1)] || el);
}

async function showHit(e) {
  const find = e.find;
  const hit = find?.hits[find.index];
  if (!hit) return paintHits(e);
  svRevealBlock(e, hit.key);
  bringIn(e, hit, false);
  await nextFrame();
  await nextFrame();
  if (e.find !== find || !find.open || find.hits[find.index] !== hit) return;
  bringIn(e, hit, true);
  paintHits(e);
}

function paintCount(e) {
  const find = e.find;
  const { count, prev, next, retry, bar } = find.nodes;
  const busy = find.status === "loading";
  let label = find.query ? findCount(find.index, find.hits.length) : "";
  if (busy) label = phrase("Searching…");
  if (find.status === "error") label = phrase("Search failed");
  count.textContent = label;
  count.classList.toggle("none", !!find.query && !find.status && !find.hits.length);
  retry.hidden = find.status !== "error";
  bar.setAttribute("aria-busy", String(busy));
  prev.disabled = next.disabled = busy || !find.hits.length;
}

async function search(e) {
  const find = e.find;
  if (!find?.open) return;
  const query = find.nodes.input.value.trim();
  find.query = query;
  find.cache.clear();
  if (!query) {
    find.hits = [];
    find.index = 0;
    paintCount(e);
    return paintHits(e);
  }
  if (e.earlier?.more) {
    find.status = "loading";
    paintCount(e);
  }
  const loaded = await svLoadWhole(e);
  if (e.find !== find || find.query !== query) return;
  if (!loaded) {
    find.status = "error";
    return paintCount(e);
  }
  find.status = null;
  const start = readingFrom(e, query);
  find.hits = findMatches(e.conv.blocks, query);
  find.index = firstHitFrom(find.hits, e.conv.blocks, start);
  if (find.near) {
    const aimed = nearestHit(find.hits, e.conv.blocks, find.near);
    if (aimed >= 0) find.index = aimed;
    find.near = null;
  }
  paintCount(e);
  showHit(e);
}

function refresh(e) {
  const find = e.find;
  if (!find?.open || !find.query || find.status) return;
  const was = find.hits[find.index];
  find.hits = findMatches(e.conv.blocks, find.query);
  const kept = was ? find.hits.findIndex((hit) => hit.key === was.key && hit.occurrence === was.occurrence) : -1;
  find.index = kept >= 0 ? kept : Math.min(find.index, Math.max(0, find.hits.length - 1));
  paintCount(e);
  paintHits(e);
}

function step(e, delta) {
  const find = e.find;
  if (!find?.hits.length || find.status) return;
  find.index = stepFind(find.index, find.hits.length, delta);
  paintCount(e);
  showHit(e);
}

const glyph = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function findBar(e) {
  const bar = document.createElement("div");
  bar.className = "sv-find";
  bar.setAttribute("role", "search");
  bar.setAttribute("aria-label", phrase("Find in thread"));
  bar.innerHTML = `<input type="search" maxlength="${FIND_MAX}" spellcheck="false" autocomplete="off">`
    + `<span class="sv-find-count" aria-live="polite"></span>`
    + `<button type="button" class="sv-find-retry" hidden>${phrase("Retry")}</button>`
    + `<button type="button" class="sv-find-prev">${glyph("m18 15-6-6-6 6")}</button>`
    + `<button type="button" class="sv-find-next">${glyph("m6 9 6 6 6-6")}</button>`
    + `<button type="button" class="sv-find-close">${glyph("M18 6 6 18M6 6l12 12")}</button>`;
  const nodes = {
    bar,
    input: bar.querySelector("input"),
    count: bar.querySelector(".sv-find-count"),
    retry: bar.querySelector(".sv-find-retry"),
    prev: bar.querySelector(".sv-find-prev"),
    next: bar.querySelector(".sv-find-next"),
    close: bar.querySelector(".sv-find-close")
  };
  nodes.input.placeholder = phrase("Find in thread");
  nodes.input.setAttribute("aria-label", phrase("Find in thread"));
  nodes.prev.setAttribute("aria-label", phrase("Previous match"));
  nodes.next.setAttribute("aria-label", phrase("Next match"));
  nodes.close.setAttribute("aria-label", phrase("Close find"));
  let typing = 0;
  nodes.input.addEventListener("input", () => {
    clearTimeout(typing);
    typing = setTimeout(() => search(e), 100);
  });
  nodes.input.addEventListener("keydown", (ev) => {
    if (ev.isComposing || ev.keyCode === 229) return;
    if (ev.key === "Enter") {
      ev.preventDefault();
      ev.stopPropagation();
      step(e, ev.shiftKey ? -1 : 1);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      closeChatFind(e);
    }
  });
  bar.addEventListener("contextmenu", (ev) => ev.stopPropagation());
  nodes.prev.addEventListener("click", () => step(e, -1));
  nodes.next.addEventListener("click", () => step(e, 1));
  nodes.close.addEventListener("click", () => closeChatFind(e));
  nodes.retry.addEventListener("click", () => search(e));
  return nodes;
}

function watch(e) {
  const find = e.find;
  let frame = 0;
  let recount = 0;
  const watcher = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const el = target?.closest?.(".sv-scroll > *");
      if (el) find.cache.delete(el);
    }
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; paintHits(e); });
    if (!recount) recount = setTimeout(() => { recount = 0; refresh(e); }, 300);
  });
  watcher.observe(e.scroll, { childList: true, subtree: true, characterData: true });
  return () => {
    watcher.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(recount);
  };
}

function openChatFind(name, seed = null) {
  const e = name ? structPool.get(name) : null;
  if (!e?.scroll) return false;
  if (current && current !== e) closeChatFind(current, { keepFocus: true });
  current = e;
  if (!e.find?.open) {
    const nodes = e.find?.nodes || findBar(e);
    e.find = { open: true, query: "", hits: [], index: 0, status: null, cache: new Map(), nodes, unwatch: null, near: null };
    e.host.append(nodes.bar);
    e.find.unwatch = watch(e);
    paintCount(e);
  }
  if (seed?.query) {
    e.find.nodes.input.value = String(seed.query).slice(0, FIND_MAX);
    e.find.near = seed.near ? { text: String(seed.near), kind: seed.role === "user" ? "bubble" : seed.role === "assistant" ? "said" : "" } : null;
  }
  e.find.nodes.input.focus();
  e.find.nodes.input.select();
  if (e.find.nodes.input.value.trim()) search(e);
  return true;
}

function closeChatFind(e, { keepFocus = false } = {}) {
  const find = e?.find;
  if (!find?.open) return;
  find.open = false;
  find.unwatch?.();
  find.nodes.bar.remove();
  find.nodes.input.value = "";
  if (current === e) {
    current = null;
    clearHits();
  }
  if (!keepFocus) e.host.querySelector(".sv-composer textarea")?.focus();
}

export { blockTexts, centre, closeChatFind, findCount, findMatches, findOffsets, findRanges, firstHitFrom, nearestHit, openChatFind, stepFind };
