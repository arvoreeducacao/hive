import { anchorToPill, closeSeatPicker, dimYardsUnderScrims, prettyModelId } from "./chat-and-panes.js";
import { svCmd } from "./chat-stretches.js";
import { esc, experienceNext, phrase, svgIcon } from "./core.js";
import { paintActivity, svLine, svQueueRefused } from "./structured-seats.js";

const CONTEXT_WIDTH = 400;

const HOT_AT = 90;

const SKILLS_SHOWN = 6;

const CELL = 16;

const CELL_GAP = 4;

const PITCH = CELL + CELL_GAP;

const ROW_MS = 380;

const VANISH_DONE_MS = 2200;

const FADE_MS = 700;

const OLD_DRIVER = /unknown (command )?control|unknown op/i;

function tokens(n) {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 99500) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function share(n, max) {
  return `${((n / Math.max(1, max)) * 100).toFixed(1)}%`;
}

function usedCategories(u) {
  return (u.categories || []).filter((c) => c.tokens > 0 && (!c.kind || c.kind === "used"));
}

function messageTokens(u) {
  const used = usedCategories(u);
  if (!used.some((c) => c.kind)) return used.reduce((sum, c) => sum + c.tokens, 0);
  return used.filter((c) => /^messages$/i.test(c.name)).reduce((sum, c) => sum + c.tokens, 0);
}

function detailOf(u, name) {
  if (/^memory files$/i.test(name)) {
    return (u.memoryFiles || []).map((f) => [String(f.path || "").split("/").slice(-2).join("/"), f.tokens]);
  }
  if (/^mcp tools$/i.test(name)) {
    const servers = new Map();
    for (const tool of u.mcpTools || []) {
      if (tool.isLoaded === false) continue;
      const held = servers.get(tool.serverName) || { tokens: 0, count: 0 };
      held.tokens += tool.tokens;
      held.count += 1;
      servers.set(tool.serverName, held);
    }
    return [...servers].sort((a, b) => b[1].tokens - a[1].tokens).map(([server, held]) => [phrase("{server} · {n} tools", { server, n: held.count }), held.tokens]);
  }
  if (/^skills$/i.test(name)) {
    const all = [...(u.skills?.skillFrontmatter || [])].sort((a, b) => b.tokens - a.tokens);
    const shown = all.slice(0, SKILLS_SHOWN).map((s) => [s.name, s.tokens]);
    const rest = all.slice(SKILLS_SHOWN);
    if (rest.length) shown.push([phrase("+ {n} more", { n: rest.length }), rest.reduce((sum, s) => sum + s.tokens, 0)]);
    return shown;
  }
  if (/^custom agents$/i.test(name)) return (u.agents || []).map((a) => [a.agentType, a.tokens]);
  return [];
}

function contextGroups(u) {
  const used = usedCategories(u);
  const typed = used.some((c) => c.kind);
  const conversation = typed ? used.filter((c) => /^messages$/i.test(c.name)) : used;
  const setup = typed ? used.filter((c) => !/^messages$/i.test(c.name)) : [];
  const reserved = (u.categories || []).filter((c) => c.kind === "buffer" && c.tokens > 0);
  const deferred = (u.categories || []).filter((c) => c.kind === "deferred" && c.tokens > 0);
  const free = Math.max(0, (u.maxTokens || 0) - (u.totalTokens || 0) - reserved.reduce((sum, c) => sum + c.tokens, 0));
  return { conversation, setup, reserved, deferred, free };
}

function contextBar(u, groups) {
  const slots = 60;
  const max = Math.max(1, u.maxTokens || 0);
  const sum = (list) => list.reduce((total, c) => total + c.tokens, 0);
  const keys = [];
  const fill = (key, n) => { for (let i = 0; i < Math.round((n / max) * slots); i++) keys.push(key); };
  fill("k-conv", sum(groups.conversation));
  fill("k-setup", sum(groups.setup));
  fill("k-res", sum(groups.reserved));
  while (keys.length < slots) keys.push("k-free");
  keys.length = slots;
  return keys.map((key) => `<i class="${key}"></i>`).join("");
}

function contextRow({ key, name, n, pct, cls = "" }) {
  return `<div class="r ${cls}"><i class="key ${key}"></i><span class="nm">${esc(name)}</span><span class="n">${n}</span><span class="p">${pct}</span></div>`;
}

function paintContextBody(box, u, unfolded) {
  const max = u.maxTokens || 0;
  const groups = contextGroups(u);
  const sum = (list) => list.reduce((total, c) => total + c.tokens, 0);
  let rows = "";
  const head = (label, total) => `<div class="g"><span>${esc(label)}</span><span>${total == null ? "" : tokens(total)}</span></div>`;
  rows += head(phrase("Conversation"), sum(groups.conversation));
  for (const c of groups.conversation) rows += contextRow({ key: "k-conv", name: c.name, n: tokens(c.tokens), pct: share(c.tokens, max) });
  if (groups.setup.length) {
    rows += head(phrase("Setup"), sum(groups.setup));
    for (const c of groups.setup) {
      const detail = detailOf(u, c.name);
      const open = detail.length && unfolded.has(c.name);
      rows += `<div class="r${detail.length ? " more" : ""}${open ? " unfold" : ""}" data-fold="${detail.length ? esc(c.name) : ""}"><i class="key k-setup"></i><span class="nm">${esc(c.name)}</span><span class="n">${tokens(c.tokens)}</span><span class="p">${share(c.tokens, max)}</span></div>`;
      if (open) for (const [name, n] of detail) rows += contextRow({ key: "", name, n: tokens(n), pct: "", cls: "sub" });
    }
  }
  if (groups.reserved.length) {
    rows += head(phrase("Reserved"));
    for (const c of groups.reserved) rows += contextRow({ key: "k-res", name: c.name, n: tokens(c.tokens), pct: share(c.tokens, max) });
  }
  rows += head(phrase("Free"));
  rows += contextRow({ key: "k-free", name: phrase("Free space"), n: tokens(groups.free), pct: share(groups.free, max) });
  if (groups.deferred.length) {
    rows += head(phrase("Outside the window"));
    for (const c of groups.deferred) rows += contextRow({ key: "", name: c.name, n: tokens(c.tokens), pct: "—", cls: "out" });
  }
  const pct = u.percentage ?? ((u.totalTokens || 0) / Math.max(1, max)) * 100;
  const model = prettyModelId(u.model).name || u.model || "";
  box.classList.toggle("hot", pct >= HOT_AT);
  box.innerHTML = `<div class="ch"><span class="vl">${esc(phrase("Context"))}</span><span class="md">${esc([model, phrase("{n} window", { n: tokens(max) })].filter(Boolean).join(" · "))}</span></div>`
    + `<div class="big"><b>${Math.round(pct)}%</b><span>${esc(phrase("{used} of {max} used", { used: tokens(u.totalTokens || 0), max: tokens(max) }))}</span></div>`
    + `<div class="cbar" aria-hidden="true">${contextBar(u, groups)}</div>`
    + `<div class="rows">${rows}</div>`
    + `<div class="ft"><button type="button" class="go">${esc(phrase("Compact conversation"))}<span class="kk">/compact</span></button></div>`;
}

function openContextWindow(e) {
  if (e.menu?.kind === "context") return void closeSeatPicker(e);
  closeSeatPicker(e);
  const composer = e.host.querySelector(".sv-composer");
  const gauge = e.host.querySelector(".sv-ctx");
  if (!composer || !gauge) return;
  const el = document.createElement("div");
  el.className = "sv-menu anchored sv-ctxw";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", phrase("Context"));
  const box = document.createElement("div");
  box.className = "cw";
  box.innerHTML = `<span class="say">${esc(phrase("reading the context…"))}</span>`;
  el.appendChild(box);
  composer.appendChild(el);
  gauge.classList.add("open");
  const scrim = document.createElement("div");
  scrim.className = "sv-scrim";
  (e.host.closest(".tile") || e.host).appendChild(scrim);
  dimYardsUnderScrims();
  const unfolded = new Set();
  let usage = e.contextUsage || null;
  const place = () => {
    const seat = e.host.getBoundingClientRect();
    const bar = composer.getBoundingClientRect();
    if (seat.height && bar.height) anchorToPill(el, gauge, seat, bar, CONTEXT_WIDTH);
  };
  const paint = () => {
    if (e.menu?.el !== el || !usage) return;
    const scrolled = box.querySelector(".rows")?.scrollTop || 0;
    paintContextBody(box, usage, unfolded);
    const rows = box.querySelector(".rows");
    if (rows) rows.scrollTop = scrolled;
    box.querySelector(".go").addEventListener("click", () => askToCompact(e, usage));
    place();
  };
  box.addEventListener("click", (ev) => {
    const row = ev.target.closest(".r.more");
    if (!row) return;
    const name = row.dataset.fold;
    if (unfolded.has(name)) unfolded.delete(name);
    else unfolded.add(name);
    paint();
  });
  el.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    closeSeatPicker(e, true);
    e.host.querySelector(".sv-composer textarea")?.focus();
  });
  e.menu = { kind: "context", el, repaint: paint };
  place();
  paint();
  box.querySelector(".go")?.focus();
  svCmd(e, { type: "control", op: "context" }).then((r) => {
    if (e.menu?.el !== el) return;
    if (!r?.ok || !r.data) {
      if (usage) return;
      const msg = r?.error || phrase("failed");
      box.innerHTML = `<span class="say warn"></span>`;
      box.querySelector(".say").textContent = OLD_DRIVER.test(msg) ? phrase("this seat's driver is older than the native commands — close the seat and reopen it with the same name; resume keeps the conversation") : msg;
      return void place();
    }
    usage = r.data;
    e.contextUsage = r.data;
    e.context = { t: r.data.totalTokens ?? 0, m: r.data.maxTokens ?? 0, p: r.data.percentage ?? 0 };
    paintActivity(e);
    paint();
    box.querySelector(".go")?.focus();
  });
}

async function askToCompact(e, usage) {
  closeSeatPicker(e);
  const r = await svCmd(e, { type: "control", op: "compact", focus: "" });
  if (!r?.ok) {
    const msg = r?.error || phrase("failed");
    return void svLine(e, "sv-meta warn", OLD_DRIVER.test(msg) ? phrase("this seat's driver is older than the native commands — close the seat and reopen it with the same name; resume keeps the conversation") : msg);
  }
  if (r.data?.queued) return void queueCompact(e, r.data.cid || r.cid, usage ? messageTokens(usage) : 0);
  startCompactShow(e);
}

function queueCompact(e, cid, frees) {
  const tray = e.host.querySelector(".sv-queue");
  if (!tray) return;
  const item = document.createElement("div");
  item.className = "sv-qitem sys";
  item.dataset.cid = cid;
  item.dataset.system = "compact";
  const line = frees ? `<em>/compact</em> · ${esc(phrase("frees about {n}", { n: tokens(frees) }))}` : "<em>/compact</em>";
  item.innerHTML = `<span class="qbadge">${phrase("queued")}</span><span class="qico">${svgIcon("i-term")}</span><span class="qtxt"><b>${esc(phrase("Compact conversation"))}</b><span>${line}</span></span><button type="button" class="qnow" title="${phrase("compact now, without waiting for the turn")}"><svg aria-hidden="true"><use href="#i-qnow"/></svg></button><button type="button" class="qdrop" title="${phrase("do not compact")}"><svg aria-hidden="true"><use href="#i-qback"/></svg></button>`;
  const drop = () => {
    const at = (e.queuedEls || []).indexOf(item);
    if (at >= 0) e.queuedEls.splice(at, 1);
    item.remove();
    tray.classList.toggle("on", !!(e.queuedEls || []).length);
    paintActivity(e);
  };
  item.querySelector(".qnow").addEventListener("click", () => {
    svCmd(e, { type: "saynow", target: cid }).then((answer) => {
      if (!answer?.ok) return void svQueueRefused(e, answer);
      drop();
    });
  });
  item.querySelector(".qdrop").addEventListener("click", () => {
    svCmd(e, { type: "unsay", target: cid }).then((answer) => {
      if (!answer?.ok) return void svQueueRefused(e, answer);
      drop();
    });
  });
  tray.prepend(item);
  tray.classList.add("on");
  (e.queuedEls ||= []).push(item);
  paintActivity(e);
}

function boardShares(e) {
  const u = e.contextUsage;
  const max = u?.maxTokens || e.context?.m || 0;
  const total = u?.totalTokens ?? e.context?.t ?? 0;
  if (!max) return null;
  const messages = u ? messageTokens(u) : total;
  return { max, total, setup: Math.max(0, total - messages) / max, messages: messages / max };
}

function layBoard(show) {
  const { e, layer } = show;
  const tile = e.host.closest(".tile") || e.host;
  const scroll = e.host.querySelector(".sv-scroll");
  if (!scroll) return false;
  const tr = tile.getBoundingClientRect();
  const sr = scroll.getBoundingClientRect();
  const sx = tile.offsetWidth ? tr.width / tile.offsetWidth : 1;
  const sy = tile.offsetHeight ? tr.height / tile.offsetHeight : 1;
  const top = Math.max(sr.top, tr.top + 2 * sy);
  const right = Math.min(sr.right, tr.right - 2 * sx);
  const bottom = Math.min(sr.bottom, tr.bottom - 2 * sy);
  const w = (right - sr.left) / sx;
  const h = (bottom - top) / sy;
  if (w <= 0 || h <= 0) return false;
  layer.style.left = `${(sr.left - tr.left) / sx}px`;
  layer.style.top = `${(top - tr.top) / sy}px`;
  layer.style.width = `${w}px`;
  layer.style.height = `${h}px`;
  const cols = Math.max(1, Math.floor((w - 24 + CELL_GAP) / PITCH));
  const rows = Math.max(1, Math.floor((h - 72 + CELL_GAP) / PITCH));
  const ox = Math.round((w - (cols * PITCH - CELL_GAP)) / 2);
  const oy = h - 12 - (rows * PITCH - CELL_GAP);
  const cells = cols * rows;
  const setup = Math.round(cells * show.shares.setup);
  const used = Math.min(cells, setup + Math.round(cells * show.shares.messages));
  const step = ROW_MS / cols;
  layer.style.setProperty("--cell", `${CELL}px`);
  layer.style.setProperty("--pitch", `${PITCH}px`);
  layer.style.setProperty("--ox", `${ox + CELL / 2 - PITCH / 2}px`);
  layer.style.setProperty("--oy", `${oy + CELL / 2 - PITCH / 2}px`);
  layer.style.setProperty("--step", `${step.toFixed(3)}ms`);
  const board = layer.querySelector(".board");
  board.textContent = "";
  for (let i = 0; i < used; i++) {
    const b = document.createElement("i");
    b.className = `b ${i < setup ? "s" : "m"}`;
    b.dataset.i = i;
    b.style.cssText = `left:${ox + (i % cols) * PITCH}px; top:${oy + (rows - 1 - Math.floor(i / cols)) * PITCH}px; --i:${i}; --j:${used - 1 - i};`;
    board.appendChild(b);
  }
  show.cells = cells;
  show.used = used;
  show.setup = setup;
  show.fillMs = used * step + 340;
  show.vanishMs = Math.max(0, used - setup) * step + 300;
  return true;
}

function startCompactShow(e) {
  if (!experienceNext() || e.compactShow) return;
  const shares = boardShares(e);
  if (!shares) return;
  const tile = e.host.closest(".tile") || e.host;
  const layer = document.createElement("div");
  layer.className = "ctx-fill";
  layer.setAttribute("role", "status");
  layer.innerHTML = `<div class="grid"></div><div class="board"></div><div class="lbl"><span class="now"><i class="dot"></i></span><span class="done"></span></div>`;
  layer.querySelector(".now").append(phrase("Compacting"), Object.assign(document.createElement("b"), { textContent: tokens(shares.total) }));
  const show = { e, layer, shares, timers: [], phaseTimers: [], phase: "fade", phaseAt: 0, filled: false, ending: null };
  e.compactShow = show;
  tile.appendChild(layer);
  if (!layBoard(show)) return void dropCompactShow(e);
  show.watch = new ResizeObserver(() => {
    if (show.relayFrame) return;
    show.relayFrame = requestAnimationFrame(() => {
      show.relayFrame = 0;
      relayCompactShow(show);
    });
  });
  show.watch.observe(tile);
  show.timers.push(setTimeout(() => layer.classList.add("on"), 30));
  show.timers.push(setTimeout(() => {
    layer.classList.add("full");
    enterPhase(show, "fill");
  }, FADE_MS));
}

function enterPhase(show, phase) {
  show.phase = phase;
  show.phaseAt = performance.now();
  show.layer.style.setProperty("--into", "0ms");
  schedulePhase(show);
}

function schedulePhase(show) {
  for (const t of show.phaseTimers) clearTimeout(t);
  show.phaseTimers = [];
  const into = performance.now() - show.phaseAt;
  if (show.phase === "fill") {
    show.phaseTimers.push(setTimeout(() => {
      show.filled = true;
      if (show.ending) vanishCompactShow(show);
    }, Math.max(0, show.fillMs - into)));
  }
  if (show.phase === "vanish") {
    show.phaseTimers.push(setTimeout(() => paintFreed(show), Math.max(0, show.vanishMs - into)));
    show.phaseTimers.push(setTimeout(() => dropCompactShow(show.e), Math.max(0, show.vanishMs + VANISH_DONE_MS - into)));
  }
}

function phaseLength(show) {
  return show.phase === "fill" ? show.fillMs : show.vanishMs;
}

function relayCompactShow(show) {
  if (show.e.compactShow !== show) return;
  const { layer } = show;
  const moving = show.phase === "fill" || show.phase === "vanish";
  const now = performance.now();
  const progress = moving ? Math.min(1, (now - show.phaseAt) / Math.max(1, phaseLength(show))) : 0;
  layer.classList.add("still");
  if (!layBoard(show)) return void layer.classList.remove("still");
  if (show.ending && show.phase === "vanish") markKeptCells(show);
  if (moving) {
    const into = progress * phaseLength(show);
    show.phaseAt = now - into;
    layer.style.setProperty("--into", `${Math.round(into)}ms`);
    schedulePhase(show);
  }
  void layer.offsetWidth;
  layer.classList.remove("still");
}

function markKeptCells(show) {
  const keep = Math.max(show.setup + 1, Math.min(show.used, Math.round(show.cells * (show.ending.post / show.shares.max))));
  for (const b of show.layer.querySelectorAll(".board .b")) {
    b.classList.toggle("drop", Number(b.dataset.i) >= keep);
  }
}

function vanishCompactShow(show) {
  markKeptCells(show);
  show.layer.classList.add("gone");
  enterPhase(show, "vanish");
}

function paintFreed(show) {
  const { layer, ending, shares } = show;
  const done = layer.querySelector(".done");
  done.textContent = "";
  const now = Math.round((ending.post / shares.max) * 100);
  done.append(phrase("Freed {n} · now", { n: tokens(Math.max(0, ending.pre - ending.post)) }), Object.assign(document.createElement("b"), { textContent: `${now}%` }));
  layer.classList.add("freed");
}

function endCompactShow(e, meta = {}) {
  const show = e.compactShow;
  if (!show) return;
  const pre = Number.isFinite(meta.pre_tokens) ? meta.pre_tokens : show.shares.total;
  const post = Number.isFinite(meta.post_tokens) ? meta.post_tokens : Math.round(show.shares.setup * show.shares.max);
  show.ending = { pre, post };
  if (show.filled) vanishCompactShow(show);
}

function dropCompactShow(e) {
  const show = e.compactShow;
  if (!show) return;
  e.compactShow = null;
  for (const t of [...show.timers, ...show.phaseTimers]) clearTimeout(t);
  cancelAnimationFrame(show.relayFrame);
  show.watch?.disconnect();
  show.layer.classList.remove("on");
  setTimeout(() => show.layer.remove(), FADE_MS);
}

export { askToCompact, dropCompactShow, endCompactShow, openContextWindow, startCompactShow };
