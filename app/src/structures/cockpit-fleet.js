import { blocksOf, labelOf, ofBlock, spaceName, spaceOf } from "../app/blocks.js";
import { keyLabel } from "../app/brand-face.js";
import { st } from "../app/core.js";
import { retitlingNamed } from "../app/chat-name.js";
import { liveTitle } from "../app/leader-key.js";
import { offScreenWhy } from "../app/mirror.js";
import { structPool } from "../app/structured-seats.js";

const FLEET_KEY = "hive.cockpitFleet";

function readFleet() {
  try { return localStorage.getItem(FLEET_KEY) !== "off"; }
  catch { return true; }
}

let fleetOn = readFleet();

const fleetShown = () => fleetOn;

function toggleFleet() {
  fleetOn = !fleetOn;
  try { localStorage.setItem(FLEET_KEY, fleetOn ? "on" : "off"); } catch {}
  return fleetOn;
}

function prsOf(seat) {
  return (Array.isArray(seat.prs) ? seat.prs : []).map((p) => (p?.number ? `#${p.number}` : "")).filter(Boolean).join(" ");
}

function doingOf(ctx, seat) {
  const live = structPool.get(seat.key);
  const tool = /^running (.+)$/.exec(live?.activity || "");
  if (tool) return tool[1];
  if (live?.activity === "writing") return ctx.phrase("writing the answer");
  return "";
}

function subOf(ctx, seat, since) {
  const now = String(seat.now || "").trim();
  const prs = prsOf(seat);
  if (seat.state === "needs") return { tone: "ask", text: now || ctx.phrase("needs you") };
  if (seat.state === "working") return { tone: "run", text: doingOf(ctx, seat) || now || liveTitle(seat) || ctx.label("working") };
  if (seat.state === "stalled") return { tone: "run", text: since ? ctx.phrase("no output for {t}", { t: since }) : ctx.label("stalled") };
  if (seat.state === "answered") return { tone: "", text: [ctx.phrase("unread"), prs].filter(Boolean).join(" · ") };
  return { tone: "", text: prs || now || ctx.label(seat.state || "idle") };
}

const titleOf = (ctx, seat) => (seat.anon ? ctx.phrase("anonymous") : seat.title || seat.name || "");

function seatRow(ctx, seat, since, focused) {
  const state = seat.state || "idle";
  if (seat.here) return { key: seat.key, title: titleOf(ctx, seat), state, here: true, on: seat.key === focused, tail: String(seat.at + 1), sub: null };
  const when = since(seat);
  return { key: seat.key, title: titleOf(ctx, seat), state, here: false, on: false, tail: when, sub: subOf(ctx, { ...seat, state }, when) };
}

function looseRow(ctx, s) {
  const state = s.state || "idle";
  return { key: s.name, title: titleOf(ctx, s), state, here: false, on: false, tail: "", sub: { tone: state === "working" ? "run" : "", text: offScreenWhy(s.name) } };
}

function blockKeyOf(n) {
  return n && n <= 9 && st.keys?.block ? keyLabel(st.keys.block, n) : "";
}

function fleetModel(ctx, since) {
  const seats = ctx.seats();
  const focused = ctx.focused();
  const mine = blocksOf(st.space);
  const others = st.blocks.filter((b) => !mine.includes(b));
  const groups = [...mine, ...others].map((b) => {
    const i = st.blocks.indexOf(b);
    const at = mine.indexOf(b);
    const label = labelOf(b, ofBlock(b)).txt || ctx.phrase("empty");
    const rows = seats.filter((one) => one.block === i).sort((x, y) => x.at - y.at).map((one) => seatRow(ctx, one, since, focused));
    return {
      block: i,
      n: at >= 0 ? at + 1 : 0,
      label: at >= 0 ? label : `${spaceName(spaceOf(b.ws))} · ${label}`,
      here: i === st.block,
      key: at >= 0 ? blockKeyOf(at + 1) : "",
      rows
    };
  }).filter((g) => g.rows.length);
  const inBlocks = new Set(st.blocks.flatMap((b) => b.keys));
  const loose = (st.data?.sessions || []).filter((s) => s?.name && !inBlocks.has(s.name)).map((s) => looseRow(ctx, s));
  if (loose.length) groups.push({ block: -1, n: 0, label: ctx.phrase("off screen"), here: false, key: "", rows: loose });
  const all = groups.flatMap((g) => g.rows);
  const count = (state) => all.filter((one) => one.state === state).length;
  return { groups, total: all.length, needs: count("needs"), working: count("working") + count("stalled"), answered: count("answered") };
}

function rowHtml(ctx, row) {
  const cls = ["ck-fr", row.here ? "here" : "", row.on ? "on" : "", row.state === "needs" ? "need" : ""].filter(Boolean).join(" ");
  const sub = row.sub?.text ? `<span class="ck-fs${row.sub.tone ? ` ${row.sub.tone}` : ""}">${ctx.esc(row.sub.text)}</span>` : "";
  return `<button type="button" class="${cls}" data-seat="${ctx.esc(row.key)}" title="${ctx.esc(row.title)}"><span class="rc-dot ${ctx.esc(row.state)}"></span><span class="ck-fn${retitlingNamed(row.key) ? " title-regenerating" : ""}"${retitlingNamed(row.key) ? ' aria-busy="true"' : ""}>${ctx.esc(row.title)}</span><span class="ck-ft">${ctx.esc(row.tail)}</span>${sub}</button>`;
}

function groupHtml(ctx, group) {
  const tag = group.here ? `<span class="ck-ftag">${ctx.esc(ctx.phrase("on screen"))}</span>` : "";
  const name = `${group.n ? `${group.n} ` : ""}${group.label}`;
  const head = group.block >= 0
    ? `<button type="button" class="ck-fgh${group.here ? " here" : ""}" data-block="${group.block}"><span class="ck-fgn">${ctx.esc(name)}</span>${tag}<span class="ck-fgr"></span>${group.key ? `<span class="ck-fk">${ctx.esc(group.key)}</span>` : ""}</button>`
    : `<div class="ck-fgh"><span class="ck-fgn">${ctx.esc(name)}</span><span class="ck-fgr"></span><span class="ck-fgc">${group.rows.length}</span></div>`;
  return `${head}${group.rows.map((row) => rowHtml(ctx, row)).join("")}`;
}

function fleetHtml(ctx, model, hideKeys) {
  const count = (state, n) => (n ? `<span><span class="rc-dot ${state}"></span>${n}</span>` : "");
  const head = `<div class="ck-fh"><b>${ctx.esc(ctx.phrase("fleet"))}</b><span class="ck-fc">${count("needs", model.needs)}${count("working", model.working)}${count("answered", model.answered)}<span>${ctx.esc(ctx.phrase(model.total === 1 ? "{n} chat" : "{n} chats", { n: model.total }))}</span></span></div>`;
  const list = `<div class="ck-fl">${model.groups.map((g) => groupHtml(ctx, g)).join("")}</div>`;
  const foot = hideKeys ? `<div class="ck-ff">${hideKeys}<span>${ctx.esc(ctx.phrase("hides the fleet"))}</span></div>` : "";
  return `${head}${list}${foot}`;
}

export { FLEET_KEY, fleetHtml, fleetModel, fleetShown, toggleFleet };
