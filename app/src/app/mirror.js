import { arrangeOn, canArrange, closeArrange, openArrange, paintArrange, render } from "./arrange.js";
import { activeItems, blockNumber, blockTitle, blocksOf, detached, isHidden, itemOf, labelOf, landOnBlock, ofBlock, seatsToTradeOn, soloSeat, spaceName, spaceOf } from "./blocks.js";
import { keyLabel } from "./brand-face.js";
import { svEvent } from "./chat-and-panes.js";
import { svReset } from "./chat-stretches.js";
import { svConvShow } from "./conversation-model.js";
import { $, GLYPH, LABEL, esc, every, phrase, raycastOn, saveUnfolded, solidMounts, st, stateColor, stopBeat, unfolded } from "./core.js";
import { closeTile, goTo, goToBlock, goToSpace, pull } from "./focus-navigation.js";
import { drafts } from "./draft-seat.js";
import { keyHint, liveOf, liveTitle, sawWorking } from "./leader-key.js";
import { ago } from "./pod.js";
import { openBlockMenu, openSeatMenu, openSpaceMenu, openTeamMenu } from "./seat-menu.js";
import { forgetStruct, structPool, svLine } from "./structured-seats.js";
import { avatar, goToTeam, leaveMirror, mirrorRow, paintKnocks, paintNudge, pullTeam } from "./team.js";
import { paintWorktreeRail } from "./worktrees.js";

const MIRROR_LIVE_TICK = 2000;

st.mirrorOpen = "";

let mirrorReading = false;

const machineTag = (key) => String(key || "").slice(7).replace(/[^A-Za-z0-9]/g, "").slice(0, 10);
const teamSeatKey = (dev, name, key = "") => {
  const tag = machineTag(key);
  return tag ? `team:${dev}.${tag}/${name}` : `team:${dev}/${name}`;
};

const mirrorChatKey = () => (st.mirrorDev && st.mirrorOpen ? teamSeatKey(st.mirrorDev, st.mirrorOpen, st.mirrorKey) : "");

const mirrorChat = () => structPool.get(mirrorChatKey()) || null;

function armMirrorLive() {
  every("mirror", MIRROR_LIVE_TICK, pullMirrorLive);
  pullMirrorLive();
}

function openMirrorChat(seat) {
  if (st.mirrorOpen === seat) return;
  closeMirrorChat(false);
  st.mirrorOpen = seat;
  render();
  armMirrorLive();
}

function closeMirrorChat(paint = true) {
  stopBeat("mirror");
  st.mirrorOpen = "";
  if (paint) render();
}

const teamChatPrefix = (dev) => `team:${dev}/`;

function forgetMirrorChats(keep) {
  for (const key of [...structPool.keys()]) {
    if (!key.startsWith("team:") || key.startsWith(teamChatPrefix(keep))) continue;
    forgetStruct(key);
  }
}

function sweepMirrorChats(row) {
  const mine = new Map((row?.seats || []).map((seat) => [seat.name, seat.keyboard?.with === st.team.me]));
  for (const key of [...structPool.keys()]) {
    if (!key.startsWith(teamChatPrefix(st.mirrorDev))) continue;
    const name = key.slice(teamChatPrefix(st.mirrorDev).length);
    if (name === st.mirrorOpen || mine.get(name)) continue;
    forgetStruct(key);
  }
}

function mirrorWait(e, say) {
  const at = e.mirrorWait ? e.conv.blocks.indexOf(e.mirrorWait) : -1;
  if (!say) {
    if (at >= 0) {
      e.conv.blocks.splice(at, 1);
      svConvShow(e);
    }
    e.mirrorWait = null;
    return;
  }
  if (at >= 0) {
    e.mirrorWait.text = say;
    svConvShow(e);
  } else e.mirrorWait = svLine(e, "sv-meta wait", say);
}

async function pullMirrorLive() {
  const e = mirrorChat();
  if (!e || document.hidden || mirrorReading) return;
  const card = (mirrorRow()?.seats || []).find((x) => x.name === st.mirrorOpen);
  if (card?.keyboard?.with !== st.team.me) {
    stopBeat("mirror");
    mirrorWait(e, "");
    return;
  }
  const cold = !e.lastSeq && !e.mirrorNote;
  if (cold) mirrorWait(e, phrase("reading this conversation off {dev}'s server…", { dev: st.mirrorDev }));
  mirrorReading = true;
  const r = await fetch(`/api/team/live?dev=${encodeURIComponent(st.mirrorDev)}&seat=${encodeURIComponent(st.mirrorOpen)}&at=${e.mirrorAt || 0}`)
    .then((x) => x.json()).catch(() => null)
    .finally(() => { mirrorReading = false; });
  if (!r || r.error || mirrorChat() !== e) {
    if (cold && mirrorChat() === e) mirrorWait(e, phrase("{dev}'s server did not answer — trying again", { dev: st.mirrorDev }));
    return;
  }
  mirrorWait(e, "");
  /* the file was rewritten with its window: the bytes we counted no longer name the same place */
  if (r.reset) { svReset(e); e.mirrorNote = false; }
  e.mirrorAt = Number(r.at) || 0;
  const events = r.events || [];
  for (const ev of events) svEvent(e, ev);
  if (events.length) e.mirrorNote = true;
  else if (!e.mirrorNote) {
    e.mirrorNote = true;
    svLine(e, "sv-meta", phrase("nothing to mirror yet — a seat running the classic terminal has a screen, and a screen never leaves the machine it is on"));
  }
}

function focusedSeat() {
  const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
  if (it?.kind !== "session") return null;
  return st.data.sessions.find((x) => x.name === it.name) || null;
}

const ARCH_SHOWN = 3;

const ARCH_OPEN_KEY = "hive.archOpen";

st.archOpen = false;

try { st.archOpen = localStorage.getItem(ARCH_OPEN_KEY) === "1"; } catch {}

const reviving = new Set();

const archKey = (a) => `${a.where}:${a.name}`;

st.archNote = "";

let archNoteTimer = null;

function sayOnRail(text) {
  st.archNote = text || "";
  clearTimeout(archNoteTimer);
  if (st.archNote) archNoteTimer = setTimeout(() => { st.archNote = ""; paintRail(); }, 9000);
  paintRail();
}

const HIDDEN_OPEN_KEY = "hive.hiddenOpen";

st.hiddenOpen = false;

try { st.hiddenOpen = localStorage.getItem(HIDDEN_OPEN_KEY) === "1"; } catch {}

function setHiddenOpen(on) {
  st.hiddenOpen = !!on;
  try { localStorage.setItem(HIDDEN_OPEN_KEY, st.hiddenOpen ? "1" : "0"); } catch {}
  paintRail();
}

function snoozedRailModel() {
  const all = st.data.sessions.filter((s) => isHidden(s.name));
  if (!all.length) return null;
  return {
    count: all.length, open: st.hiddenOpen, label: phrase("hidden until they work"),
    shown: (st.hiddenOpen ? all : []).map((s) => {
      const title = s.title || s.name;
      return {
        key: s.name, name: s.name, state: s.state, title,
        hint: `${title} — ${phrase("hidden, comes back when it works · click brings it now")}`,
        action: phrase("bring it back")
      };
    })
  };
}

function setArchOpen(on) {
  st.archOpen = !!on;
  try { localStorage.setItem(ARCH_OPEN_KEY, st.archOpen ? "1" : "0"); } catch {}
  paintRail();
}

async function reviveArchived(name, where) {
  const key = `${where}:${name}`;
  if (!name || reviving.has(key)) return;
  reviving.add(key);
  paintRail();
  try {
    const r = await (await fetch("/api/seat/unarchive", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, where })
    })).json();
    if (r.error) throw new Error(r.error);
    sayOnRail(r.renamed ? phrase("a seat already answered to “{old}” — it came back as {name}, same conversation", { old: r.renamed, name: r.name }) : "");
    await pull();
    if (r.name) goTo(r.name);
  } catch (wrong) {
    sayOnRail(phrase("could not bring it back") + (wrong?.message ? ` — ${wrong.message}` : ""));
  } finally {
    reviving.delete(key);
    paintRail();
  }
}

async function archiveSeatNow(s) {
  if (!s) return;
  unfolded.delete(s.name);
  saveUnfolded();
  try {
    const r = await (await fetch("/api/seat/archive", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: s.name, where: s.where })
    })).json();
    if (r.error) throw new Error(r.error);
  } catch (wrong) {
    return void sayOnRail(phrase("could not archive it") + (wrong?.message ? ` — ${wrong.message}` : ""));
  }
  if (st.open === s.name) closeTile();
  pull();
}

function paintRail() {
  railShown = railViewModel();
  railSolid.show(railShown);
  paintWorktreeRail();
  paintTeamRail();
  paintKnocks();
  paintNudge();
  st.pet?.setSessions(st.data.sessions);
}

let railSolid = null;

let railShown = null;

const RAIL_SHOWS_KEY = "hive.railShows";

const RAIL_SHOWS = { all: "All", local: "Local", cloud: "Cloud" };

st.railShows = "all";

try {
  const saved = localStorage.getItem(RAIL_SHOWS_KEY);
  if (Object.hasOwn(RAIL_SHOWS, saved)) st.railShows = saved;
} catch {}

st.railQuery = "";

st.railSearching = false;

st.railCursor = 0;

const workingFrom = new Map();

function spanOf(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function seatMeta(s, now) {
  if (s.state !== "working") workingFrom.delete(s.name);
  else if (!workingFrom.has(s.name)) workingFrom.set(s.name, now);
  if (s.state === "working") return { said: spanOf(now - workingFrom.get(s.name)), tone: "t" };
  if (s.state === "needs") return { said: phrase("needs you"), tone: "need" };
  if (s.state === "answered") return { said: phrase("answered"), tone: "t" };
  if (s.state === "done") return { said: phrase("finished"), tone: "t" };
  if (s.state === "stalled") {
    const quiet = sawWorking.get(s.name);
    return { said: quiet ? phrase("stalled {t}", { t: spanOf(now - quiet) }) : phrase("stalled"), tone: "t" };
  }
  return { said: s.state === "idle" ? "zzz" : "—", tone: "" };
}

const whole = (text) => ({ pre: text, hit: "", post: "" });

function hitOf(text, q) {
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  return at < 0 ? null : { pre: text.slice(0, at), hit: text.slice(at, at + q.length), post: text.slice(at + q.length) };
}

function raycastDraftItems() {
  return [...drafts.values()].map((d) => ({
    key: d.key, name: d.key, where: "local", state: "idle", title: phrase("new chat"), naming: false,
    hint: `${phrase("new chat")} — ${phrase("a chat with nothing in it yet")}`,
    said: phrase("new chat"), meta: "—", tone: "", away: false
  }));
}

function seatRailItem(s, now) {
  const away = detached.has(s.name);
  const meta = seatMeta(s, now);
  const said = phrase(LABEL[s.state]);
  const live = liveTitle(s);
  return {
    key: s.name, name: s.name, where: s.where, state: s.state, title: s.title || s.name, naming: !!s.naming,
    hint: `${s.title || s.name} — ${away ? phrase("in a window of its own — click brings it back") : said}${live ? ` · ${live}` : ""}`,
    said, meta: meta.said, tone: meta.tone, away
  };
}

function railGroups(rows, picked) {
  const lanes = st.blocks.map((b, i) => ({ b, i, mine: b.ws === st.space }));
  const groups = [];
  for (const { b, i, mine } of [...lanes.filter((one) => one.mine), ...lanes.filter((one) => !one.mine)]) {
    const here = mine && i === st.block;
    const items = b.keys.flatMap((key, at) => {
      const row = rows.find((one) => one.key === key);
      if (!row) return [];
      const seatKey = here && at < st.LIMIT && st.keys.seat ? keyLabel(st.keys.seat, at + 1) : "";
      return [{ ...row, sel: row.key === picked, open: phrase("open"), openKey: seatKey }];
    });
    if (!items.length) continue;
    const n = blockNumber(i);
    const block = phrase("block {n}", { n });
    groups.push({
      key: b.id || `b${i}`, i: mine ? i : -1, here, items,
      label: mine ? block : `${spaceName(spaceOf(b.ws))} · ${block}`,
      hereSaid: `· ${phrase("on screen")}`,
      keys: mine && n <= 9 && st.keys.block ? keyLabel(st.keys.block, n) : ""
    });
  }
  const loose = rows.filter((row) => !st.blocks.some((b) => b.keys.includes(row.key)));
  if (loose.length) {
    groups.push({
      key: "loose", i: -1, here: false, label: phrase("outside the blocks"), hereSaid: "", keys: "",
      items: loose.map((row) => ({ ...row, sel: row.key === picked, open: phrase("open"), openKey: "" }))
    });
  }
  return groups;
}

function railEmpty(q) {
  if (q) return { icon: "i-mag", said: phrase("nothing with “{q}”", { q: st.railQuery.trim() }), act: phrase("palette"), key: keyLabel(st.keys.palette) };
  const cloud = st.railShows === "cloud";
  return { icon: cloud ? "i-cloud" : "i-local", said: phrase(cloud ? "no sessions in the cloud" : "no sessions here"), act: "", key: keyLabel(st.keys.new) };
}

function parkedRailModel(q, now) {
  const all = st.data.archived || [];
  const hits = q ? all.filter((a) => `${a.title || ""}\n${a.name}`.toLowerCase().includes(q)) : all;
  if (!hits.length) return null;
  const open = st.archOpen || !!q;
  const shown = !open ? [] : q ? hits : hits.slice(0, ARCH_SHOWN);
  return {
    count: hits.length, open, label: phrase("archived"),
    shown: shown.map((a) => {
      const busy = reviving.has(archKey(a));
      const title = a.title || a.name;
      return {
        key: archKey(a), name: a.name, where: a.where, parts: hitOf(title, q) || whole(title), busy,
        when: spanOf(now - a.archivedAt),
        hint: `${title} — ${phrase("archived {when}", { when: ago(new Date(a.archivedAt).toISOString()) })}`,
        action: busy ? phrase("coming back…") : phrase("revive")
      };
    }),
    more: open && shown.length < hits.length ? phrase("+ {n} more · see all", { n: hits.length - shown.length }) : ""
  };
}

function raycastRailViewModel() {
  const now = Date.now();
  const q = st.railQuery.trim().toLowerCase();
  const all = [...raycastDraftItems(), ...st.data.sessions.filter((s) => q || !isHidden(s.name)).map((s) => seatRailItem(s, now))];
  const tally = (where) => all.filter((row) => where === "all" || row.where === where).length;
  const shown = all.filter((row) => st.railShows === "all" || row.where === st.railShows);
  const found = shown.flatMap((row) => {
    const parts = hitOf(row.title, q);
    if (!q) return [{ ...row, parts: whole(row.title) }];
    return parts || row.name.toLowerCase().includes(q) ? [{ ...row, parts: parts || whole(row.title) }] : [];
  });
  const picked = st.mirrorDev ? "" : st.open || activeItems()[st.focus]?.key || "";
  const groups = railGroups(found, picked);
  const order = groups.flatMap((g) => g.items);
  st.railCursor = Math.max(0, Math.min(st.railCursor, order.length - 1));
  if (q && order.length) order[st.railCursor].cursor = true;
  const parked = parkedRailModel(q, now);
  const snoozed = q ? null : snoozedRailModel();
  const loading = !st.seatsKnown && !all.length;
  return {
    raycast: true,
    shows: Object.entries(RAIL_SHOWS).map(([key, label]) => ({ key, label: phrase(label), count: tally(key), on: st.railShows === key })),
    showsSaid: phrase("which machine"),
    searching: st.railSearching || !!q, query: st.railQuery,
    searchSaid: phrase("search a seat"), searchHint: phrase("search a seat ({k})", { k: "/" }),
    found: q ? phrase("{n} of {m} seats", { n: found.length, m: shown.length }) : "", openSaid: phrase("open"),
    loading: loading ? `${phrase("block {n}", { n: 1 })} · ${phrase("loading…")}` : "",
    groups,
    empty: !loading && !found.length && !(q && (parked || teamFound(q))) ? railEmpty(q) : null,
    snoozed, parked, note: st.archNote || ""
  };
}

function teamFound(q) {
  const { mine, theirs, nameOf } = teamRoster();
  return teamHits([...mine, ...theirs], q, nameOf).length > 0;
}

function railKeys() {
  return (railShown?.groups || []).flatMap((g) => g.items.map((it) => it.key));
}

function showOnRail(where) {
  if (!Object.hasOwn(RAIL_SHOWS, where)) return;
  st.railShows = where;
  try { localStorage.setItem(RAIL_SHOWS_KEY, where); } catch {}
  paintRail();
}

function openRailSearch() {
  if ($("shell").classList.contains("rail-min")) $("rail-toggle").click();
  st.railSearching = true;
  paintRail();
  const input = $("rail-q");
  input?.focus();
  input?.select();
}

function closeRailSearch() {
  st.railSearching = false;
  st.railQuery = "";
  st.railCursor = 0;
  paintRail();
}

function searchRail(text) {
  st.railQuery = text;
  st.railCursor = 0;
  paintRail();
}

function stepRailCursor(by) {
  const n = railKeys().length;
  if (!n) return;
  st.railCursor = (st.railCursor + by + n) % n;
  paintRail();
}

function openRailCursor() {
  const key = railKeys()[st.railCursor];
  if (!key) return;
  closeRailSearch();
  leaveMirror();
  goTo(key);
}

const railRows = () => [...$("rail-list").querySelectorAll(".item, [data-arch-toggle], [data-hidden-toggle]")].filter((one) => one.offsetParent !== null);

function stepRailFocus(from, by) {
  const rows = railRows();
  const at = rows.indexOf(from);
  rows[at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + by))]?.focus();
}

const editing = (el) => !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);

const railCovered = () => !!document.querySelector("#pal:not([hidden]), #welcome:not([hidden]), #confirm.on") || !!st.capturing || !!st.pending || st.tourAt >= 0;

function placeRaycastRail() {
  const on = raycastOn();
  const wt = $("rail-wt");
  if (on) {
    $("knock-dock").after(wt);
    wt.setAttribute("data-no-t", "");
    if (!document.getElementById("rail-tip")) $("rail").insertAdjacentHTML("beforeend", '<div id="rail-tip" role="tooltip" data-no-t hidden></div>');
    return;
  }
  $("rail-list").prepend(wt);
  wt.removeAttribute("data-no-t");
  document.getElementById("rail-tip")?.remove();
  if (st.railQuery || st.railSearching) {
    st.railQuery = "";
    st.railSearching = false;
    st.railCursor = 0;
  }
}

if (raycastOn()) placeRaycastRail();

document.addEventListener("hive:experience", (event) => {
  const { experience, was } = event.detail || {};
  if (experience !== "raycast" && was !== "raycast") return;
  placeRaycastRail();
  if (railSolid && teamRailSolid) paintRail();
});

function draftRailItems(where) {
  if (where !== "local") return [];
  return [...drafts.values()].map((d) => {
    const bi = st.blocks.findIndex((b) => b.keys.includes(d.key));
    return {
      key: d.key, name: d.key, state: "idle", title: phrase("new chat"),
      hint: `${phrase("new chat")} — ${phrase("a chat with nothing in it yet")}`,
      colour: stateColor("idle"), glyph: GLYPH.idle, here: bi === st.block,
      live: 0, liveTitle: "", tag: bi >= 0 ? "b" + (bi + 1) : ""
    };
  });
}

function blockSeatOf(name) {
  const bi = st.blocks.findIndex((b) => b.keys.includes(name));
  return bi < 0 ? { bi, pane: 0 } : { bi, pane: st.blocks[bi].keys.indexOf(name) };
}

function byBlockThenPane(a, b) {
  const ra = blockSeatOf(a.name), rb = blockSeatOf(b.name);
  const ba = ra.bi < 0 ? Infinity : ra.bi, bb = rb.bi < 0 ? Infinity : rb.bi;
  return ba - bb || ra.pane - rb.pane;
}

function railViewModel() {
  if (raycastOn()) return raycastRailViewModel();
  const groups = [];
  for (const g of [
    { key: "cloud", label: `cloud · ${st.data.pod.name || phrase("server")}`, icon: "i-cloud" },
    { key: "local", label: phrase("local · your machine"), icon: "i-local" }
  ]) {
    const ofGroup = st.data.sessions.filter((s) => s.where === g.key && !isHidden(s.name));
    if (!ofGroup.length && g.key === "cloud" && !st.data.pod.up) continue;
    groups.push({
      key: g.key, label: g.label, icon: g.icon, count: ofGroup.length, emptyLabel: phrase("no sessions here"),
      items: [...draftRailItems(g.key), ...ofGroup.map((s) => {
        const bi = st.blocks.findIndex((b) => b.keys.includes(s.name));
        const away = detached.has(s.name);
        return {
          key: s.name, name: s.name, state: s.state, title: s.title || s.name, naming: !!s.naming,
          hint: `${s.title || s.name} — ${away ? phrase("in a window of its own — click brings it back") : phrase(LABEL[s.state])}`,
          colour: stateColor(s.state), glyph: GLYPH[s.state], here: bi === st.block,
          live: liveOf(s).length, liveTitle: liveTitle(s), tag: away ? "↗" : bi >= 0 ? "b" + (bi + 1) : ""
        };
      })].sort(byBlockThenPane)
    });
  }
  const parkedAll = st.data.archived || [];
  const shown = st.archOpen ? parkedAll.slice(0, ARCH_SHOWN) : [];
  const parked = parkedAll.length ? {
    count: parkedAll.length, open: st.archOpen, label: phrase("archived"),
    shown: shown.map((a) => {
      const when = ago(new Date(a.archivedAt).toISOString());
      const busy = reviving.has(archKey(a));
      return {
        key: archKey(a), name: a.name, where: a.where, title: a.title || a.name, when, busy,
        hint: `${a.title || a.name} — ${phrase("archived {when}", { when })}`,
        action: busy ? phrase("coming back…") : phrase("revive ↩")
      };
    }),
    more: st.archOpen && parkedAll.length > ARCH_SHOWN ? phrase("+ {n} more · see all", { n: parkedAll.length - ARCH_SHOWN }) : ""
  } : null;
  return { groups, snoozed: snoozedRailModel(), parked, note: st.archNote || "" };
}

solidMounts.push((hive) => {
  railSolid = hive.mountRail($("rail-sessions"));
  if (raycastOn() && !st.seatsKnown) railSolid.show(railViewModel());
});

$("rail-sessions").addEventListener("contextmenu", (ev) => {
  const item = ev.target.closest(".item");
  if (!item || !item.dataset.name) return;
  const it = st.data.sessions.find((x) => x.name === item.dataset.name);
  if (!it) return;
  ev.preventDefault();
  openSeatMenu(it, ev.clientX, ev.clientY);
});

$("rail-sessions").addEventListener("click", (e) => {
  if (raycastOn()) {
    const show = e.target.closest("[data-show]");
    if (show) return showOnRail(show.dataset.show);
    if (e.target.closest("[data-rail-search]")) return openRailSearch();
  }
  if (e.target.closest("[data-arch-toggle]")) return setArchOpen(!st.archOpen);
  if (e.target.closest("[data-hidden-toggle]")) return setHiddenOpen(!st.hiddenOpen);
  if (raycastOn()) {
    const block = e.target.closest(".group-title[data-i]");
    if (block) return goToBlock(Number(block.dataset.i));
  }
  const parked = e.target.closest(".item.parked[data-arch]");
  if (parked) return reviveArchived(parked.dataset.arch, parked.dataset.where);
  const item = e.target.closest(".item");
  if (!item || !item.dataset.name) return;
  if (raycastOn() && st.railQuery) closeRailSearch();
  leaveMirror();
  goTo(item.dataset.name);
});

$("rail-sessions").addEventListener("input", (e) => {
  if (raycastOn() && e.target.id === "rail-q") searchRail(e.target.value);
});

$("rail-sessions").addEventListener("focusout", (e) => {
  if (raycastOn() && e.target.id === "rail-q" && !st.railQuery.trim()) setTimeout(() => { if (document.activeElement?.id !== "rail-q" && st.railSearching) closeRailSearch(); });
});

const RAIL_KEYS = ["Escape", "ArrowDown", "ArrowUp", "Enter"];

$("rail-list").addEventListener("keydown", (e) => {
  if (!raycastOn() || e.altKey || e.ctrlKey || e.metaKey || !RAIL_KEYS.includes(e.key)) return;
  const typing = e.target.id === "rail-q";
  const row = typing ? null : e.target.closest(".item, [data-arch-toggle], [data-hidden-toggle]");
  if (!typing && !row) return;
  e.preventDefault();
  e.stopPropagation();
  const by = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (typing) {
    if (e.key === "Escape") {
      closeRailSearch();
      return void e.target.blur();
    }
    return by ? stepRailCursor(by) : openRailCursor();
  }
  if (by) return stepRailFocus(row, by);
  if (e.key === "Enter") return row.click();
  row.blur();
});

document.addEventListener("keydown", (e) => {
  if (!raycastOn() || e.key !== "/" || e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || st.typing) return;
  if (editing(document.activeElement) || railCovered() || soloSeat) return;
  e.preventDefault();
  openRailSearch();
});

const railFolded = () => $("rail").offsetWidth < 100;

function railTip(row) {
  const tip = document.getElementById("rail-tip");
  if (!tip) return;
  const name = row?.dataset.name ? row.querySelector(".name")?.textContent || "" : "";
  if (!name || !railFolded()) return void (tip.hidden = true);
  tip.textContent = name;
  const state = document.createElement("span");
  state.textContent = row.dataset.said || "";
  tip.appendChild(state);
  tip.hidden = false;
  const at = row.getBoundingClientRect();
  tip.style.left = `${at.right + 8}px`;
  tip.style.top = `${at.top + at.height / 2 - tip.offsetHeight / 2}px`;
}

$("rail-sessions").addEventListener("mouseover", (e) => { if (raycastOn()) railTip(e.target.closest(".item")); });

$("rail-sessions").addEventListener("focusin", (e) => { if (raycastOn()) railTip(e.target.closest(".item")); });

for (const away of ["mouseleave", "focusout"]) $("rail-sessions").addEventListener(away, () => { const tip = document.getElementById("rail-tip"); if (tip) tip.hidden = true; });

function paintTeamRail() {
  teamRailSolid.show(teamRailViewModel());
}

let teamRailSolid = null;

const CREW_FOLDED = 5;

function teamHits(devs, q, nameOf) {
  return devs.flatMap((d) => {
    const who = nameOf(d);
    const seats = (d.seats || []).flatMap((seat) => {
      const title = seat.title || seat.name;
      const parts = hitOf(title, q);
      return parts ? [{ key: `${d.key}/${seat.name}`, dev: d.key, face: d.dev, who: `${who} · `, parts, hint: `${who} — ${title}`, act: phrase("peek") }] : [];
    });
    const named = hitOf(who, q);
    return seats.length || !named ? seats : [{ key: d.key, dev: d.key, face: d.dev, who: "", parts: named, hint: who, act: phrase("peek") }];
  });
}

function teamRoster() {
  const machines = new Map();
  for (const d of st.team.devs) machines.set(d.dev, (machines.get(d.dev) || 0) + 1);
  const nameOf = (d) => {
    const alone = (machines.get(d.dev) || 1) < 2;
    return d.mine ? d.machine : alone ? d.dev : `${d.dev} · ${d.machine}`;
  };
  const mine = st.team.devs.filter((d) => d.mine && d.key !== st.team.here);
  const theirs = st.team.devs.filter((d) => !d.mine);
  return { mine, theirs, nameOf };
}

function raycastTeamRailViewModel() {
  const { mine, theirs, nameOf } = teamRoster();
  const rowOf = (d) => {
    const name = nameOf(d);
    const says = d.seats.length ? phrase("{n} seats", { n: d.seats.length }) : d.up ? phrase("nothing running") : phrase("server asleep");
    return {
      key: d.key, dev: d.dev, name, mine: !!d.mine, avatar: avatar(d.dev), hint: `${name} — ${says}`,
      here: d.key === st.mirrorKey, quiet: !d.seats.length,
      tally: String(d.seats.length || (d.up ? "—" : "zzz"))
    };
  };
  const groups = [];
  if (mine.length) {
    groups.push({
      key: "mine", label: phrase("your other machines"),
      count: mine.filter((d) => d.seats.length).length, devs: mine.map(rowOf)
    });
  }
  groups.push({
    key: "team", label: phrase("team"),
    count: theirs.filter((d) => d.seats.length).length, devs: theirs.map(rowOf)
  });
  const everyone = [...mine, ...theirs];
  const q = st.railQuery.trim().toLowerCase();
  const hits = q ? teamHits(everyone, q, nameOf).map(({ face, ...hit }) => ({ ...hit, avatar: avatar(face) })) : null;
  const trouble = st.teamTrouble ? {
    said: phrase("could not reach the cluster"),
    when: st.teamSeenAt ? phrase("last reached {when} ago", { when: ago(new Date(st.teamSeenAt).toISOString()) }) : "",
    again: phrase("try again")
  } : null;
  return {
    key: "team", raycast: true, groups, hits, trouble,
    shown: !!trouble || (q ? hits.length > 0 : everyone.length > 0),
    label: phrase("team"),
    tally: q ? String(hits.length) : trouble && !everyone.length ? "—" : phrase("{n} of {m}", { n: everyone.filter((d) => d.seats.length).length, m: everyone.length }),
    more: everyone.length > CREW_FOLDED ? `+${everyone.length - CREW_FOLDED}` : ""
  };
}

function teamRailViewModel() {
  if (raycastOn()) return raycastTeamRailViewModel();
  const machines = new Map();
  for (const d of st.team.devs) machines.set(d.dev, (machines.get(d.dev) || 0) + 1);
  const rowOf = (d) => {
    const alone = (machines.get(d.dev) || 1) < 2;
    const name = d.mine ? d.machine : alone ? d.dev : `${d.dev} · ${d.machine}`;
    const says = d.seats.length ? phrase("{n} seats", { n: d.seats.length }) : d.up ? phrase("nothing running") : phrase("server asleep");
    return {
      key: d.key, dev: d.dev, name, mine: !!d.mine, avatar: avatar(d.dev), hint: `${name} — ${says}`,
      here: d.key === st.mirrorKey, quiet: !d.seats.length,
      tally: String(d.seats.length || (d.up ? "—" : "zzz"))
    };
  };
  const mine = st.team.devs.filter((d) => d.mine && d.key !== st.team.here);
  const theirs = st.team.devs.filter((d) => !d.mine);
  const groups = [];
  if (mine.length) {
    groups.push({
      key: "mine", label: phrase("your other machines"),
      count: mine.filter((d) => d.seats.length).length, devs: mine.map(rowOf)
    });
  }
  groups.push({
    key: "team", label: phrase("team"),
    count: theirs.filter((d) => d.seats.length).length, devs: theirs.map(rowOf)
  });
  return { key: "team", groups };
}

solidMounts.push((hive) => {
  teamRailSolid = hive.mountTeamRail($("rail-team"), {
    actions: {
      go: (key) => goToTeam(key),
      again: () => pullTeam(true),
      menu: (dev, ev) => {
        if (!st.team.poke) return;
        ev.preventDefault();
        openTeamMenu(dev, ev.clientX, ev.clientY);
      }
    }
  });
});

function paintBlocks() {
  document.documentElement.style.setProperty("--tint", spaceOf(st.space).tint);
  blocksSolid.show(blocksViewModel());
  $("blocks").classList.toggle("lit", st.holding === "block");
  $("blocks").classList.toggle("wslit", st.holding === "space");
  if (arrangeOn()) {
    if (!canArrange()) closeArrange();
    else if (!st.arrangeDragging) paintArrange();
  }
}

let blocksSolid = null;

const blockKey = (n) => (st.keys.block ? keyLabel(st.keys.block, n) : String(n));

function raycastTab(b, i) {
  const items = ofBlock(b);
  const n = blockNumber(i);
  const hint = blockKey(n);
  return {
    key: `b${i}`, i, n, hint, name: labelOf(b, items).txt || "unnamed",
    calls: items.some((x) => x.state === "needs"), pressed: i === st.block ? "true" : "false",
    title: [blockTitle(b, items) || phrase("unnamed"), hint].join(" · ")
  };
}

function raycastBlocks(model) {
  return { ...model, rc: true, tabs: st.blocks.flatMap((b, i) => (b.ws === st.space ? [raycastTab(b, i)] : [])) };
}

function blocksViewModel() {
  if (raycastOn()) return raycastBlocks(defaultBlocks());
  return defaultBlocks();
}

function defaultBlocks() {
  const w = spaceOf(st.space);
  const shut = !!soloSeat || !!st.mirrorDev;
  return {
    key: "blocks",
    open: !shut && st.holding === "space"
      ? st.spaces.map((x, i) => ({ key: x.id, id: x.id, n: i + 1, tint: x.tint, name: spaceName(x), count: blocksOf(x.id).length, on: x.id === st.space }))
      : null,
    chip: shut || st.holding === "space" ? null : {
      tint: w.tint, name: spaceName(w), count: blocksOf(st.space).length,
      hint: keyHint("arrange"), expanded: arrangeOn() ? "true" : "false",
      title: phrase("{name} — every workspace is a floor, and this opens the pile of them", { name: spaceName(w) })
    },
    tabs: st.blocks.flatMap((b, i) => {
      if (b.ws !== st.space) return [];
      const items = ofBlock(b);
      const r = labelOf(b, items);
      const n = blockNumber(i);
      return [{
        key: `b${i}`, i, n, name: r.txt || "unnamed", tally: `${items.length}/${st.LIMIT}`,
        calls: items.some((x) => x.state === "needs"), pressed: i === st.block ? "true" : "false",
        title: `block ${n}: ${r.txt}`
      }];
    }),
    mirror: st.mirrorDev ? {
      dev: st.mirrorDev, avatar: avatar(st.mirrorDev), count: (mirrorRow()?.seats || []).length,
      title: phrase("{dev}'s hive — read-only", { dev: st.mirrorDev })
    } : null
  };
}

solidMounts.push((hive) => {
  blocksSolid = hive.mountBlocks($("blocks"));
});

const blockTab = (e) => e.target.closest("#blocks button[data-i]");

$("blocks").addEventListener("click", (e) => {
  if (e.target.closest(".mirror-btn")) return leaveMirror();
  if (e.target.closest("#btn-space")) return arrangeOn() ? closeArrange() : openArrange();
  const floor = e.target.closest(".ws-one");
  if (floor) return goToSpace(floor.dataset.w);
  const b = blockTab(e);
  if (b) goToBlock(Number(b.dataset.i));
});

$("blocks").addEventListener("contextmenu", (ev) => {
  const ws = ev.target.closest("#btn-space");
  if (ws) {
    ev.preventDefault();
    return openSpaceMenu(st.space, ev.clientX, ev.clientY);
  }
  const floor = ev.target.closest(".ws-one");
  if (floor) {
    ev.preventDefault();
    return openSpaceMenu(floor.dataset.w, ev.clientX, ev.clientY);
  }
  const b = blockTab(ev);
  if (!b) return;
  ev.preventDefault();
  openBlockMenu(Number(b.dataset.i), ev.clientX, ev.clientY);
});

$("blocks").addEventListener("dragover", (ev) => {
  const b = blockTab(ev);
  if (!b) return;
  const i = Number(b.dataset.i);
  if (!st.dragSeat || st.blocks[i]?.keys.includes(st.dragSeat)) return;
  ev.preventDefault();
  ev.dataTransfer.dropEffect = "move";
  b.classList.add("drop");
  openTrade(i, b);
});

$("blocks").addEventListener("dragleave", (ev) => {
  const b = blockTab(ev);
  if (!b) return;
  if (tradeBox && tradeBox.contains(ev.relatedTarget)) return;
  b.classList.remove("drop");
});

$("blocks").addEventListener("drop", (ev) => {
  const b = blockTab(ev);
  if (!b) return;
  const i = Number(b.dataset.i);
  if (!st.dragSeat || st.blocks[i]?.keys.includes(st.dragSeat)) return;
  ev.preventDefault();
  b.classList.remove("drop");
  st.dragTook = true;
  landOnBlock(st.dragSeat, i);
  closeTrade();
});

let tradeBox = null;

st.tradeOn = -1;

function closeTrade() {
  tradeBox?.remove();
  tradeBox = null;
  st.tradeOn = -1;
}

function openTrade(i, tab) {
  if (st.tradeOn === i) return;
  closeTrade();
  const keys = seatsToTradeOn(i, st.dragSeat);
  if (!keys.length) return;
  st.tradeOn = i;
  const box = document.createElement("div");
  box.id = "btrade";
  box.innerHTML =
    `<div class="cap">${esc(phrase("full — drop on the one that leaves"))}</div>` +
    keys.map((key) => {
      const it = itemOf(key);
      return `<button type="button" class="row" data-key="${esc(key)}">
        <span class="dot ${esc(it?.state || "idle")}"></span>
        <span>${esc(it?.title || it?.name || key)}</span></button>`;
    }).join("") +
    `<div class="foot">${esc(phrase("dropping on the tab, and not on a name, trades with the last."))}</div>`;
  document.body.appendChild(box);
  tradeBox = box;
  const at = tab.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(at.left, innerWidth - box.offsetWidth - 8))}px`;
  box.style.top = `${at.bottom + 6}px`;
  box.addEventListener("dragover", (ev) => {
    if (!st.dragSeat) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    const row = ev.target.closest(".row");
    for (const one of box.querySelectorAll(".row")) one.classList.toggle("over", one === row);
  });
  box.addEventListener("drop", (ev) => {
    if (!st.dragSeat) return;
    ev.preventDefault();
    ev.stopPropagation();
    st.dragTook = true;
    landOnBlock(st.dragSeat, i, ev.target.closest(".row")?.dataset.key);
    closeTrade();
  });
}

export { ARCH_OPEN_KEY, ARCH_SHOWN, HIDDEN_OPEN_KEY, MIRROR_LIVE_TICK, RAIL_SHOWS, RAIL_SHOWS_KEY, archKey, archNoteTimer, archiveSeatNow, armMirrorLive, blockKey, blockTab, blocksSolid, blocksViewModel, closeMirrorChat, closeRailSearch, closeTrade, focusedSeat, forgetMirrorChats, mirrorChat, mirrorChatKey, mirrorReading, mirrorWait, openMirrorChat, openRailCursor, openRailSearch, openTrade, paintBlocks, paintRail, paintTeamRail, pullMirrorLive, railKeys, railSolid, railViewModel, reviveArchived, reviving, sayOnRail, searchRail, setArchOpen, setHiddenOpen, showOnRail, spanOf, stepRailCursor, sweepMirrorChats, teamChatPrefix, teamRailSolid, teamRailViewModel, teamSeatKey, tradeBox };
