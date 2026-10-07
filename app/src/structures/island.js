import { labelOf, ofBlock } from "../app/blocks.js";
import { keyLabel } from "../app/brand-face.js";
import { IS_MAC, st } from "../app/core.js";
import { sendToSeat } from "../app/seat-layout.js";

const CLOSE_AFTER = 260;

const SAID_FOR = 2600;

let parts = null;

let shown = false;

let pinned = false;

let pick = -1;

let hot = null;

let picks = [];

let heldFocus = null;

let closing = 0;

let saidTimer = 0;

let painted = { bar: "", panel: "", head: "" };

const plain = (text) => String(text || "")
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/^\s*(?:[-•*]|\d+[.)]|#{1,6}|>)\s+/gm, "")
  .replace(/\*\*|__|`/g, "")
  .replace(/\s+/g, " ")
  .trim();

const read = new Map();

function paragraphs(text) {
  const said = String(text || "");
  if (read.has(said)) return read.get(said);
  if (read.size > 64) read.clear();
  const out = said.split(/\n\s*\n/).map(plain).filter(Boolean);
  read.set(said, out);
  return out;
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const seatName = (seat) => String(seat?.title || seat?.name || seat?.key || "");

function lastWords(seat) {
  if (seat.now) return clip(plain(seat.now), 220);
  const said = paragraphs(seat.finish?.text);
  if (said.length) return clip(said[said.length - 1], 220);
  return clip(plain(seat.summary || seat.done || seat.description || seat.mission || ""), 220);
}

function questionOf(seat) {
  const asked = (seat.asks || []).flatMap((one) => one.questions || [])[0];
  const said = paragraphs(seat.finish?.text);
  if (asked?.question) {
    return {
      question: clip(plain(asked.question), 360),
      context: said.length ? clip(said[said.length - 1], 280) : "",
      options: (asked.options || []).map((one) => plain(one?.label ?? one)).filter(Boolean).slice(0, 4)
    };
  }
  return {
    question: said.length ? clip(said[said.length - 1], 360) : clip(plain(seat.now || seat.summary || seat.description || ""), 360),
    context: said.length > 1 ? clip(said[said.length - 2], 280) : "",
    options: []
  };
}

function model(seats, { focused = null, prs = [] } = {}) {
  const byPlace = [...seats].sort((a, b) => a.block - b.block || a.at - b.at);
  const calling = seats.filter((one) => one.state === "needs");
  const hotSeat = calling.find((one) => one.key !== focused) || null;
  const live = prs.filter((one) => one.state === "open" || one.state === "draft");
  const blocks = new Set(byPlace.map((one) => one.block));
  return {
    dots: byPlace.map((one, i) => ({
      key: one.key, state: one.state, title: seatName(one), cur: one.key === focused,
      gap: i > 0 && one.block !== byPlace[i - 1].block
    })),
    calls: calling.length,
    who: calling[0] ? seatName(calling[0]) : "",
    working: seats.filter((one) => one.state === "working").length,
    failing: live.filter((one) => one.ci === "failed").length,
    prs: live.length,
    seats: seats.length,
    blocks: blocks.size,
    hot: hotSeat ? { key: hotSeat.key, name: seatName(hotSeat), block: hotSeat.block, at: hotSeat.at, here: hotSeat.here, when: Date.parse(hotSeat.finish?.at || "") || 0, ...questionOf(hotSeat) } : null,
    cells: byPlace.filter((one) => one.key !== hotSeat?.key).map((one) => ({
      key: one.key, name: seatName(one), state: one.state, block: one.block, at: one.at,
      here: one.key === focused, near: one.here, line: lastWords(one), prs: (one.prs || []).length
    }))
  };
}

function ago(at, phrase) {
  if (!at) return "";
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return phrase("just now");
  if (mins < 60) return phrase("{n} min ago", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return phrase("{n} h ago", { n: hours });
  return phrase("{n} days ago", { n: Math.round(hours / 24) });
}

const modOf = (event) => (IS_MAC ? event.metaKey : event.ctrlKey);

const islandKey = () => keyLabel(IS_MAC ? { meta: true, code: "KeyJ" } : { ctrl: true, code: "KeyJ" });

const enterKey = () => (IS_MAC ? "⌘↵" : "Ctrl+↵");

function seatKey(cell) {
  if (!cell.near) return st.keys?.block ? keyLabel(st.keys.block, cell.block + 1) : "";
  return st.keys?.seat ? keyLabel(st.keys.seat, cell.at + 1) : "";
}

function dotsHtml(m, ctx) {
  return m.dots.map((one) => `${one.gap ? '<span class="il-gap"></span>' : ""}<button type="button" class="rc-dot ${ctx.esc(one.state)}${one.cur ? " cur" : ""}" data-seat="${ctx.esc(one.key)}" title="${ctx.esc(`${one.title} · ${ctx.label(one.state)}`)}" aria-label="${ctx.esc(`${one.title} · ${ctx.label(one.state)}`)}"></button>`).join("");
}

function barHtml(m, ctx) {
  const { phrase, esc } = ctx;
  const ask = m.calls
    ? `<span class="il-ask">${esc(m.calls === 1 ? phrase("1 needs you") : phrase("{n} need you", { n: m.calls }))}<span class="who">${esc(m.who)}</span></span>`
    : `<span class="il-ask calm">${esc(m.working ? phrase("{n} working", { n: m.working }) : phrase("nobody needs you"))}</span>`;
  const prs = m.failing
    ? `<span class="il-sep"></span><span class="il-prs"><span class="bad"></span>${esc(phrase("{n} PRs", { n: m.failing }))}</span>`
    : "";
  return `<span class="il-fleet">${dotsHtml(m, ctx)}</span><span class="il-sep"></span>${ask}${prs}<span class="rc-key">${esc(islandKey())}</span>`;
}

function cellHtml(cell, at, ctx) {
  const { phrase, esc } = ctx;
  const sub = cell.here ? phrase("{state} · you are here", { state: ctx.label(cell.state) }) : cell.near ? ctx.label(cell.state) : `${ctx.label(cell.state)} · ${phrase("block {n}", { n: cell.block + 1 })}`;
  const key = seatKey(cell);
  return `<button type="button" class="il-cell${cell.here ? " here" : ""}${at === pick ? " picked" : ""}" data-seat="${esc(cell.key)}" data-at="${at}">
    <span class="h"><span class="rc-dot ${esc(cell.state)}"></span><span class="n">${esc(cell.name)}</span>${key ? `<span class="rc-key">${esc(key)}</span>` : ""}</span>
    <span class="st">${esc(sub)}${cell.prs ? ` · ${esc(cell.prs === 1 ? phrase("1 PR") : phrase("{n} PRs", { n: cell.prs }))}` : ""}</span>
    <span class="ph">${esc(cell.line || "—")}</span>
  </button>`;
}

function prCellHtml(m, at, ctx) {
  const { phrase, esc } = ctx;
  return `<button type="button" class="il-cell prs${at === pick ? " picked" : ""}" data-prs="1" data-at="${at}">
    <span class="row">${ctx.svgIcon("i-pr")}${esc(m.failing ? phrase("PRs failing") : phrase("pull requests"))}<span class="rc-key">${esc(ctx.keyHint("prs"))}</span></span>
    <span class="big">${m.failing || m.prs}</span>
    <span class="row">${esc(phrase("open over the conversation"))}</span>
  </button>`;
}

function blocksHtml(ctx) {
  const { esc } = ctx;
  const rows = st.blocks.filter((b) => b.ws === st.space).map((b) => {
    const at = st.blocks.indexOf(b);
    const name = labelOf(b, ofBlock(b)).txt || ctx.phrase("block {n}", { n: at + 1 });
    return `<button type="button" class="il-block${at === st.block ? " on" : ""}" data-block="${at}">${st.keys?.block ? `<span class="rc-key">${esc(keyLabel(st.keys.block, at + 1))}</span>` : ""}${esc(name)}</button>`;
  });
  return rows.length > 1 ? rows.join("") : "";
}

function panelHtml(m, ctx) {
  const { phrase, esc } = ctx;
  const head = `<div class="il-ihead"><span class="il-fleet">${dotsHtml(m, ctx)}</span>
    <span class="count">${esc(`${phrase("{n} seats", { n: m.seats })} · ${phrase("{n} blocks", { n: m.blocks })}`)}</span>
    <span class="il-keys">${esc(phrase("picks"))}<span class="rc-key">←</span><span class="rc-key">→</span>&nbsp;${esc(phrase("opens"))}<span class="rc-key">↵</span>&nbsp;${esc(phrase("closes"))}<span class="rc-key">esc</span></span></div>`;
  const h = m.hot;
  const hotKey = h ? seatKey({ near: h.here, block: h.block, at: h.at }) : "";
  const needs = h ? `<div class="il-needs">
      <div class="top"><span class="rc-dot needs"></span><button type="button" class="name" data-seat="${esc(h.key)}">${esc(h.name)}</button><span class="il-badge">${esc(ctx.label("needs"))}</span>
        <span class="when">${esc([phrase("block {n}", { n: h.block + 1 }), ago(h.when, phrase)].filter(Boolean).join(" · "))}${hotKey ? `<span class="rc-key">${esc(hotKey)}</span>` : ""}</span></div>
      <div class="q">${esc(h.question)}</div>
      ${h.context && h.context !== h.question ? `<div class="ctx">${esc(h.context)}</div>` : ""}
      ${h.options.length ? `<div class="il-sugg">${h.options.map((one) => `<button type="button" class="il-pill" data-say="${esc(one)}">${esc(one)}</button>`).join("")}</div>` : ""}
      <div class="il-reply-slot"></div>
      <div class="il-hint">${esc(phrase("the answer goes to {name}; you stay where you are", { name: h.name }))}${h.options.length ? `<span class="dotsep">·</span><span class="rc-key">tab</span>${esc(phrase("suggestion"))}` : ""}<span class="dotsep">·</span><span class="rc-key">${esc(enterKey())}</span>${esc(phrase("answers and opens the seat"))}</div>
    </div>` : "";
  const cells = m.cells.map((cell, at) => cellHtml(cell, at, ctx));
  if (m.prs) cells.push(prCellHtml(m, cells.length, ctx));
  const blocks = blocksHtml(ctx);
  return `${head}${needs}<div class="il-grid">${cells.join("")}</div>${blocks ? `<div class="il-ifoot">${blocks}</div>` : ""}`;
}

function headHtml(seat, ctx) {
  const { phrase, esc } = ctx;
  if (!seat) return `<div class="il-empty"><b>${esc(phrase("nothing open here"))}</b><span>${esc(phrase("{key} opens a chat", { key: ctx.keyHint("new") }))}</span></div>`;
  const mates = ofBlock(st.blocks[seat.block]);
  const key = seat.here && st.keys?.seat ? keyLabel(st.keys.seat, seat.at + 1) : "";
  const meta = [`<span class="rc-dot ${esc(seat.state)}"></span><span class="w">${esc([ctx.label(seat.state), seat.verb, seat.measure].filter(Boolean).join(" · "))}</span>`];
  if (seat.model) meta.push(`<span>${esc(seat.model)}</span>`);
  if ((seat.live || []).length) meta.push(`<span>${esc(phrase("{n} in the background", { n: seat.live.length }))}</span>`);
  const pip = '<span class="pipe"></span>';
  return `<span class="eyebrow">${esc(phrase("block {n} · seat {m} of {k}", { n: seat.block + 1, m: seat.at + 1, k: mates.length }))}${key ? `<span class="rc-key">${esc(key)}</span>` : ""}</span>
    <div class="il-title">${esc(seatName(seat))}</div>
    <div class="il-meta">${meta.join(pip)}<span class="sp"></span><button type="button" class="il-tool" data-act="browser" title="${esc(`${phrase("browser")} · ${ctx.keyHint("browser")}`)}">${ctx.svgIcon("i-browser")}<span>${esc(phrase("browser"))}</span><span class="rc-key">${esc(ctx.keyHint("browser"))}</span></button></div>`;
}

function build(ctx) {
  const root = ctx.root;
  root.classList.add("il-root");
  root.innerHTML = `<div class="il-halo" aria-hidden="true"></div>
    <div class="il-veil" aria-hidden="true"></div>
    <section class="il-island" role="region">
      <div class="il-bar"></div>
      <div class="il-panel" hidden></div>
    </section>
    <div class="il-col"><header class="il-head"></header><div class="il-seat"></div></div>`;
  const reply = document.createElement("form");
  reply.className = "il-reply";
  reply.setAttribute("autocomplete", "off");
  reply.innerHTML = '<input class="il-in" type="text" spellcheck="true"><button type="submit" class="il-send"><span></span><span class="rc-key">↵</span></button>';
  const said = document.createElement("div");
  said.className = "il-said";
  said.setAttribute("role", "status");
  said.hidden = true;
  return {
    root,
    island: root.querySelector(".il-island"),
    bar: root.querySelector(".il-bar"),
    panel: root.querySelector(".il-panel"),
    veil: root.querySelector(".il-veil"),
    head: root.querySelector(".il-head"),
    seat: root.querySelector(".il-seat"),
    reply,
    input: reply.querySelector(".il-in"),
    sendSay: reply.querySelector(".il-send > span"),
    said
  };
}

function say(text, bad = false) {
  if (!parts) return;
  clearTimeout(saidTimer);
  parts.said.textContent = text;
  parts.said.classList.toggle("bad", bad);
  parts.said.hidden = !text;
  if (text) saidTimer = setTimeout(() => { if (parts) parts.said.hidden = true; }, SAID_FOR);
}

function setShown(ctx, on, { pin = false } = {}) {
  clearTimeout(closing);
  if (on && !shown) heldFocus = document.activeElement;
  shown = on;
  pinned = on && (pin || pinned);
  if (!on) pick = -1;
  if (!parts) return;
  parts.root.classList.toggle("il-open", on);
  parts.panel.hidden = !on;
  parts.island.classList.toggle("open", on);
  if (on) paintPanel(ctx, true);
  if (!on && parts.island.contains(document.activeElement)) {
    const back = heldFocus;
    heldFocus = null;
    if (back && back !== document.body && back.isConnected) back.focus({ preventScroll: true });
    else document.activeElement.blur();
  }
}

function paintPanel(ctx, force = false) {
  if (!parts || !shown) return;
  const m = model(ctx.seats(), { focused: ctx.focused(), prs: st.prs || [] });
  picks = [...m.cells.map((cell) => ({ seat: cell.key })), ...(m.prs ? [{ prs: true }] : [])];
  if (pick < 0) pick = Math.max(0, m.cells.findIndex((cell) => cell.here));
  if (pick >= picks.length) pick = Math.max(0, picks.length - 1);
  hot = m.hot;
  const html = panelHtml(m, ctx);
  if (!force && html === painted.panel) return;
  painted.panel = html;
  const typing = document.activeElement === parts.input;
  parts.panel.innerHTML = html;
  const slot = parts.panel.querySelector(".il-reply-slot");
  if (slot) {
    parts.input.placeholder = ctx.phrase("answer {name}", { name: m.hot.name });
    parts.sendSay.textContent = ctx.phrase("Reply");
    slot.replaceWith(parts.reply);
    parts.reply.after(parts.said);
    if (typing) parts.input.focus({ preventScroll: true });
  } else {
    parts.panel.append(parts.said);
  }
}

function paintBar(ctx, m) {
  const html = barHtml(m, ctx);
  if (html !== painted.bar) {
    painted.bar = html;
    parts.bar.innerHTML = html;
    parts.island.setAttribute("aria-label", ctx.phrase("the fleet"));
  }
  parts.root.classList.toggle("il-calling", m.calls > 0);
}

function paintHead(ctx, focusedSeat) {
  const html = headHtml(focusedSeat, ctx);
  if (html !== painted.head) { painted.head = html; parts.head.innerHTML = html; }
}

function send(ctx, { andOpen = false } = {}) {
  const text = parts.input.value.trim();
  const target = hot && ctx.seats().find((one) => one.key === hot.key);
  if (!target) return;
  if (!text) {
    if (andOpen) { setShown(ctx, false); ctx.focusSeat(target.key); }
    return;
  }
  if (!sendToSeat(target, text)) {
    say(ctx.phrase("{name} is not answering right now — the message is still here", { name: seatName(target) }), true);
    return;
  }
  parts.input.value = "";
  say(ctx.phrase("sent to {name}", { name: seatName(target) }));
  if (andOpen) { setShown(ctx, false); ctx.focusSeat(target.key); }
}

function openPicked(ctx) {
  const one = picks[pick];
  if (!one) return;
  setShown(ctx, false);
  if (one.prs) openPrs();
  else ctx.focusSeat(one.seat);
}

function openPrs() {
  document.getElementById("btn-prs")?.click();
}

function stepPick(ctx, d) {
  if (!picks.length) return;
  pick = (pick + d + picks.length) % picks.length;
  paintPanel(ctx, true);
  parts.panel.querySelector(".il-cell.picked")?.scrollIntoView?.({ block: "nearest" });
}

function columns() {
  const grid = parts?.panel.querySelector(".il-grid");
  if (!grid || typeof getComputedStyle !== "function") return 3;
  const n = String(getComputedStyle(grid).gridTemplateColumns || "").split(" ").filter(Boolean).length;
  return n || 3;
}

function wire(ctx) {
  const { island, panel, bar, head, reply, input } = parts;
  ctx.listen(island, "mouseenter", () => { clearTimeout(closing); if (!shown) setShown(ctx, true); });
  ctx.listen(island, "mouseleave", () => {
    if (pinned || input.value.trim() || document.activeElement === input) return;
    clearTimeout(closing);
    closing = setTimeout(() => setShown(ctx, false), CLOSE_AFTER);
  });
  ctx.listen(parts.veil, "click", () => setShown(ctx, false));
  const goSeat = (event) => {
    const pill = event.target.closest?.("[data-say]");
    if (pill) {
      input.value = pill.dataset.say;
      input.focus();
      return;
    }
    if (event.target.closest?.("[data-prs]")) { setShown(ctx, false); return openPrs(); }
    const block = event.target.closest?.("[data-block]");
    if (block) {
      const b = st.blocks[Number(block.dataset.block)];
      setShown(ctx, false);
      if (b?.keys[0]) ctx.focusSeat(b.keys[0]);
      return;
    }
    const seat = event.target.closest?.("[data-seat]");
    if (!seat) return;
    setShown(ctx, false);
    ctx.focusSeat(seat.dataset.seat);
  };
  ctx.listen(panel, "click", goSeat);
  ctx.listen(bar, "click", (event) => {
    if (event.target.closest?.("[data-seat]")) return goSeat(event);
    setShown(ctx, !shown, { pin: true });
  });
  ctx.listen(reply, "submit", (event) => { event.preventDefault(); send(ctx); });
  ctx.listen(head, "click", (event) => {
    const act = event.target.closest?.("[data-act]")?.dataset.act;
    if (act !== "browser") return;
    const key = ctx.focused();
    ctx.tile(key)?.querySelector(".t-web")?.click();
  });
}

const island = {
  id: "island",
  ready: true,
  model,
  enter(ctx) {
    shown = false;
    pinned = false;
    pick = -1;
    hot = null;
    picks = [];
    painted = { bar: "", panel: "", head: "" };
    parts = build(ctx);
    wire(ctx);
  },
  leave(ctx) {
    clearTimeout(closing);
    clearTimeout(saidTimer);
    ctx.root.classList.remove("il-root", "il-open", "il-calling", "il-plane");
    parts = null;
    shown = false;
    pinned = false;
    hot = null;
    heldFocus = null;
  },
  paint(ctx) {
    if (!parts) return;
    const seats = ctx.seats();
    const focused = ctx.focused();
    const m = model(seats, { focused, prs: st.prs || [] });
    paintBar(ctx, m);
    paintHead(ctx, seats.find((one) => one.key === focused) || null);
    parts.root.classList.toggle("il-plane", ctx.onPlane());
    if (shown) paintPanel(ctx);
    if (focused) ctx.place(focused, parts.seat);
  },
  keydown(event, ctx) {
    if (!parts) return false;
    if (modOf(event) && !event.altKey && !event.shiftKey && event.code === "KeyJ") {
      if (shown && pinned) setShown(ctx, false);
      else {
        setShown(ctx, true, { pin: true });
        if (hot) parts.input.focus({ preventScroll: true });
      }
      return true;
    }
    if (!shown) return false;
    if (event.key === "Escape") { setShown(ctx, false); return true; }
    const inReply = event.target === parts.input;
    if (inReply) {
      if (event.key === "Enter" && modOf(event)) { send(ctx, { andOpen: true }); return true; }
      if (event.key === "Tab" && !event.shiftKey && hot?.options.length) {
        const at = hot.options.indexOf(parts.input.value);
        parts.input.value = hot.options[(at + 1) % hot.options.length];
        return true;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
        if (parts.input.value.trim()) send(ctx);
        else openPicked(ctx);
        return true;
      }
      if (parts.input.value) return false;
    } else if (ctx.inField()) return false;
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const n = columns();
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: n, ArrowUp: -n };
    if (event.key in moves) { stepPick(ctx, moves[event.key]); return true; }
    if (event.key === "Enter" && !inReply) { openPicked(ctx); return true; }
    return false;
  }
};

export { island };
