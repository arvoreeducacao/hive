import { blocksOf, labelOf, ofBlock, spaceName } from "../app/blocks.js";
import { IS_MAC, st } from "../app/core.js";
import { markSeatRead } from "../app/leader-key.js";
import { archiveSeatNow } from "../app/mirror.js";
import { openPal } from "../app/palette.js";
import { goToTeam } from "../app/team.js";

const GROUPS = [
  { id: "needs", name: "Asking for you", states: ["needs"] },
  { id: "back", name: "Answered", states: ["answered", "done"] },
  { id: "busy", name: "Working", states: ["working", "stalled", "spawning"] },
  { id: "rest", name: "Ready and still", states: [] }
];

const RANK = Object.fromEntries(GROUPS.map((one, at) => [one.id, at]));

const VIEWS = [
  { id: "needs", name: "Asking for you", icon: "i-hand" },
  { id: "back", name: "Answered", icon: "i-answered" },
  { id: "busy", name: "Working", icon: "i-bolt" },
  { id: "all", name: "All", icon: "i-list" }
];

const WAITING = new Set(["needs", "back"]);

const LAST_CAP = 240;

const groupOf = (state) => GROUPS.find((one) => one.states.includes(state))?.id || "rest";

function plain(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|~~)(.+?)\1/g, "$2")
    .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

const paragraphs = (md) => String(md || "").split(/\n\s*\n/).map(plain).filter(Boolean);

const clip = (text) => (text.length > LAST_CAP ? `${text.slice(0, LAST_CAP - 1).trimEnd()}…` : text);

function lastWords(seat) {
  const asked = (seat.asks || []).flatMap((one) => one.questions || []).map((q) => plain(q.question || q.text)).find(Boolean) || "";
  const said = paragraphs(seat.finish?.text);
  const group = groupOf(seat.state);
  const order = group === "needs"
    ? [asked, said.at(-1), plain(seat.now), plain(seat.summary)]
    : group === "busy"
      ? [plain(seat.now), plain(seat.summary), said[0], plain(seat.description)]
      : [said[0], plain(seat.now), plain(seat.summary), plain(seat.description)];
  return clip(order.find(Boolean) || "");
}

function stampOf(seat) {
  const at = Date.parse(groupOf(seat.state) === "busy" ? seat.liveSince || seat.finish?.at || "" : seat.finish?.at || seat.liveSince || "");
  return Number.isFinite(at) ? at : 0;
}

function shortAgo(at, now, phrase) {
  if (!at) return "";
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return phrase("now");
  if (min < 60) return phrase("{n}m", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return phrase("{n}h", { n: h });
  if (h < 48) return phrase("yesterday");
  return phrase("{n}d", { n: Math.floor(h / 24) });
}

const treeOf = (seat) => (Array.isArray(seat.trees) ? seat.trees.find((one) => one?.repo) : null) || null;

function prsOf(name, prs) {
  return (prs || []).filter((p) => p.session === name).map((p) => ({
    url: p.url || "",
    tag: `${String(p.repo || "").split("/").pop()}#${p.number}`,
    failing: p.ci === "failed"
  }));
}

function rowOf(seat, { now, prs, phrase, pinned }) {
  const group = pinned || groupOf(seat.state);
  const tree = treeOf(seat);
  const live = groupOf(seat.state) === "busy" && seat.verb ? `${seat.verb} ${seat.measure || ""}`.trim() : "";
  return {
    key: seat.key,
    name: seat.name,
    title: seat.title || seat.name || seat.key,
    state: seat.state,
    group,
    last: lastWords(seat),
    when: shortAgo(stampOf(seat), now, phrase),
    repo: tree?.repo || "",
    branch: tree?.branch || "",
    live,
    prs: prsOf(seat.name, prs),
    block: seat.block,
    model: seat.model || "",
    where: seat.where || "",
    session: seat.kind === "session"
  };
}

function queueOf(rows, view, blocks) {
  if (view === "all") return rows;
  if (view === "prs") return rows.filter((one) => one.prs.length);
  if (view.startsWith("block:")) return rows.filter((one) => blocks[one.block]?.id === view.slice(6));
  return rows.filter((one) => one.group === view);
}

function grouped(rows) {
  return GROUPS.map((one) => ({ ...one, rows: rows.filter((row) => row.group === one.id) })).filter((one) => one.rows.length);
}

function teamRowsOf(team, me, now, phrase) {
  return (team?.devs || []).filter((d) => d.dev !== me).flatMap((d) => (d.seats || []).map((s) => ({
    key: `team:${d.key}:${s.name}`,
    machine: d.key,
    dev: d.dev,
    title: s.title || s.name,
    state: s.state,
    group: groupOf(s.state),
    last: clip(plain(s.now) || plain(s.summary) || plain(s.description)),
    when: shortAgo(Date.parse(s.liveSince || "") || 0, now, phrase),
    model: s.model || "",
    where: s.where || "",
    up: d.up !== false
  })));
}

function nextUp(rows, key) {
  const at = rows.findIndex((one) => one.key === key);
  const after = [...rows.slice(at + 1), ...rows.slice(0, Math.max(0, at))];
  return after.find((one) => WAITING.has(one.group) && one.key !== key) || null;
}

function step(rows, key, d) {
  if (!rows.length) return null;
  const at = rows.findIndex((one) => one.key === key);
  if (at < 0) return rows[d > 0 ? 0 : rows.length - 1];
  return rows[Math.max(0, Math.min(rows.length - 1, at + d))];
}

const mine = { view: "all", pin: null, teamPick: "", shown: [], reading: null, next: null, nodes: null, painted: new Map(), lastSel: "" };

function viewModel(ctx) {
  const { phrase } = ctx;
  const now = Date.now();
  const focused = ctx.focused();
  if (mine.pin && mine.pin.key !== focused) mine.pin = null;
  const rows = ctx.seats().map((seat) => {
    const live = groupOf(seat.state);
    const hold = mine.pin?.key === seat.key && WAITING.has(mine.pin.group) && live === "rest" ? mine.pin.group : "";
    return rowOf(seat, { now, prs: st.prs, phrase, pinned: hold });
  }).sort((a, b) => RANK[a.group] - RANK[b.group]);
  const team = teamRowsOf(st.team, st.team?.me, now, phrase);
  const teamView = mine.view === "team" || mine.view.startsWith("dev:");
  const blocks = st.blocks || [];
  if (!teamView && mine.view.startsWith("block:") && !blocks.some((b) => b.id === mine.view.slice(6))) mine.view = "all";
  const queue = teamView
    ? team.filter((one) => mine.view === "team" || one.dev === mine.view.slice(4))
    : queueOf(rows, mine.view, blocks);
  const count = (group) => rows.filter((one) => one.group === group).length;
  const failing = rows.reduce((n, one) => n + one.prs.filter((p) => p.failing).length, 0);
  const devs = [...new Set(team.map((one) => one.dev))].map((dev) => ({ dev, n: team.filter((one) => one.dev === dev).length }));
  const here = (st.spaces || []).find((w) => w.id === st.space);
  const ownBlocks = blocksOf(st.space).map((b) => ({ id: b.id, n: blocks.indexOf(b), label: labelOf(b, ofBlock(b)).txt, count: b.keys.length }));
  const pick = teamView ? team.find((one) => one.key === mine.teamPick) || null : null;
  const reading = pick ? null : rows.find((one) => one.key === focused) || null;
  const selected = pick ? pick.key : reading?.key || "";
  return {
    rows, queue, team, devs, failing, pick, reading, selected, teamView,
    groups: teamView ? [{ id: "team", name: "From the team", rows: queue }] : grouped(queue),
    counts: { needs: count("needs"), back: count("back"), busy: count("busy"), all: rows.length, team: team.length, prs: rows.filter((one) => one.prs.length).length },
    workspace: here ? spaceName(here) : "",
    blocks: ownBlocks,
    next: reading ? nextUp(queue.length ? queue : rows, reading.key) : null,
    view: mine.view
  };
}

function viewTitle(v, phrase) {
  const known = VIEWS.find((one) => one.id === v.view);
  if (known) return phrase(known.name);
  if (v.view === "team") return phrase("From the team");
  if (v.view === "prs") return "PRs";
  if (v.view.startsWith("dev:")) return v.view.slice(4);
  const b = v.blocks.find((one) => `block:${one.id}` === v.view);
  return b ? b.label || phrase("block {n}", { n: v.blocks.indexOf(b) + 1 }) : phrase("All");
}

function navHtml(v, ctx) {
  const { esc, phrase, svgIcon } = ctx;
  const line = (view, icon, name, n, extra = "") => `<button type="button" class="ix-nrow${v.view === view ? " on" : ""}${extra}" data-view="${esc(view)}">${icon}<span class="ix-nname">${esc(name)}</span>${n}</button>`;
  const num = (n, cls = "") => `<span class="n${cls}">${esc(String(n))}</span>`;
  const top = VIEWS.map((one) => {
    const n = v.counts[one.id];
    const hot = one.id === "needs" && n > 0 ? " hot" : "";
    return line(one.id, svgIcon(one.icon), phrase(one.name), num(n, one.id === "needs" && n === 0 ? " zero" : ""), hot);
  }).join("");
  const prs = v.failing ? num(phrase("{n} failing", { n: v.failing }), " warn") : num(v.counts.prs);
  const blocks = v.blocks.length > 1
    ? `<div class="ix-eb">${esc(phrase("Blocks"))}</div>${v.blocks.map((b, at) => line(`block:${b.id}`, `<span class="rc-key">${at + 1}</span>`, b.label || phrase("block {n}", { n: at + 1 }), num(b.count))).join("")}`
    : "";
  const team = v.devs.length
    ? `<div class="ix-eb">${esc(phrase("Team"))}</div>${v.devs.map((d) => line(`dev:${d.dev}`, `<span class="ix-av">${esc(d.dev.slice(0, 1).toUpperCase())}</span>`, d.dev, num(d.n))).join("")}`
    : "";
  return `${top}<div class="ix-eb">${esc(phrase("Views"))}</div>${line("team", svgIcon("i-user"), phrase("From the team"), num(v.counts.team))}${line("prs", svgIcon("i-pr"), "PRs", prs)}${blocks}${team}`;
}

function rowHtml(row, v, ctx) {
  const { esc, label, svgIcon } = ctx;
  const cls = ["ix-row"];
  if (row.key === v.selected) cls.push("sel");
  if (WAITING.has(row.group)) cls.push("unread");
  if (row.group === "rest") cls.push("dim");
  const meta = [];
  if (row.repo) meta.push(`${svgIcon("i-folder")}<span class="repo">${esc(row.repo)}</span>${row.branch ? `<span class="sl">/</span><span class="br">${esc(row.branch)}</span>` : ""}`);
  if (row.dev) meta.push(`${svgIcon("i-user")}<span>${esc(row.dev)}</span>`);
  if (row.live) meta.push(`<span class="live">${esc(row.live)}</span>`);
  const prs = (row.prs || []).map((p) => `<span class="pr${p.failing ? " fail" : ""}">${svgIcon("i-pr")}${esc(p.tag)}</span>`).join("");
  return `<button type="button" class="${cls.join(" ")}" data-key="${esc(row.key)}"><span class="rc-dot ${esc(row.state)}"></span><span class="ix-rbody">
    <span class="ix-rtop"><span class="ix-name">${esc(row.title)}</span><span class="ix-state${row.group === "needs" ? " hot" : ""}">${esc(label(row.state))}</span><span class="ix-time">${esc(row.when)}</span></span>
    ${row.last ? `<span class="ix-last">${esc(row.last)}</span>` : ""}
    ${meta.length || prs ? `<span class="ix-meta">${meta.join('<span class="sl">·</span>')}${prs}</span>` : ""}</span></button>`;
}

function listHtml(v, ctx) {
  const { esc, phrase, svgIcon } = ctx;
  if (!v.groups.length) {
    const calm = v.view === "needs" ? phrase("Nobody is asking for you now") : phrase("Nothing here");
    return `<div class="ix-empty">${svgIcon("i-check")}<span>${esc(calm)}</span></div>`;
  }
  return v.groups.map((g) => `<div class="ix-group${g.id === "needs" ? " hot" : ""}"><span>${esc(phrase(g.name))}</span><span class="n">${g.rows.length}</span></div>${g.rows.map((row) => rowHtml(row, v, ctx)).join("")}`).join("");
}

function headHtml(v, ctx) {
  const { esc, phrase, svgIcon, keyHint } = ctx;
  const r = v.reading;
  if (!r) return "";
  const crumb = r.repo ? `${svgIcon("i-folder")}<span>${esc(r.repo)}</span>${r.branch ? `<span class="sl">/</span><span>${esc(r.branch)}</span>` : ""}` : "";
  const key = (k) => (k ? `<span class="rc-key">${esc(k)}</span>` : "");
  const acts = [];
  const tile = ctx.tile(r.key);
  const web = tile?.querySelector(".t-web");
  if (web && !web.hidden) acts.push(`<button type="button" class="ix-act" data-act="web">${svgIcon("i-globe")}<span>${esc(phrase("Browser"))}</span>${key(keyHint("browser"))}</button>`);
  for (const p of r.prs) acts.push(`<a class="ix-act${p.failing ? " warn" : ""}" href="${esc(p.url)}" target="_blank" rel="noreferrer">${svgIcon("i-pr")}<span>${esc(p.tag)}</span></a>`);
  if (r.session) acts.push(`<span class="ix-sep"></span><button type="button" class="ix-act" data-act="archive" title="${esc(phrase("archive the focused chat — it stops, and comes back the same"))}">${svgIcon("i-check")}<span>${esc(phrase("Archive"))}</span>${key("e")}</button>`);
  return `<div class="ix-crumb">${crumb}</div><div class="ix-acts">${acts.join("")}</div>`;
}

function titleHtml(v, ctx) {
  const { esc, label, phrase, svgIcon } = ctx;
  const r = v.reading;
  if (!r) return "";
  const said = [label(r.state), r.when].filter(Boolean).join(" · ");
  const block = v.blocks.find((b) => b.n === r.block);
  const sub = [
    r.model ? `<span>${svgIcon("i-claude")}${esc(r.model)}</span>` : "",
    r.where ? `<span>${svgIcon(r.where === "cloud" ? "i-cloud" : "i-local")}${esc(phrase(r.where))}</span>` : "",
    block ? `<span>${svgIcon("i-grid")}${esc(phrase("block {n}", { n: v.blocks.indexOf(block) + 1 }))}</span>` : ""
  ].filter(Boolean).join("");
  return `<div class="ix-title"><span class="rc-dot ${esc(r.state)}"></span><h1>${esc(r.title)}</h1><span class="ix-st ${esc(r.group)}">${esc(said)}</span></div>${sub ? `<div class="ix-sub">${sub}</div>` : ""}`;
}

function nextHtml(v, ctx) {
  const { esc, label, phrase } = ctx;
  if (!v.reading) return "";
  const n = v.next;
  if (!n) return `<span class="ix-nextsay">${esc(phrase("Nobody else is waiting on you"))}</span>`;
  return `<span class="ix-nextsay">${esc(phrase("Next in the queue"))}</span><span class="rc-dot ${esc(n.state)}"></span><b>${esc(n.title)}</b><span class="ix-nextst">${esc(label(n.state))}</span>
    <button type="button" class="ix-go" data-act="next"><span>${esc(phrase("Reply and go to the next"))}</span><span class="rc-key">${IS_MAC ? "⌘↵" : "Ctrl+↵"}</span></button>`;
}

function pickHtml(v, ctx) {
  const { esc, label, phrase, svgIcon } = ctx;
  const p = v.pick;
  if (!p) {
    if (v.reading) return "";
    return `<div class="ix-blank">${svgIcon("i-list")}<span>${esc(phrase("Pick a seat in the queue — j and k walk it"))}</span></div>`;
  }
  return `<div class="ix-col ix-team"><div class="ix-title"><span class="rc-dot ${esc(p.state)}"></span><h1>${esc(p.title)}</h1><span class="ix-st ${esc(p.group)}">${esc([label(p.state), p.when].filter(Boolean).join(" · "))}</span></div>
    <div class="ix-sub"><span>${svgIcon("i-user")}${esc(p.dev)}</span>${p.model ? `<span>${svgIcon("i-claude")}${esc(p.model)}</span>` : ""}</div>
    <p class="ix-prose">${esc(p.last || phrase("no card written yet"))}</p>
    <button type="button" class="ix-go" data-act="team" data-machine="${esc(p.machine)}"><span>${esc(phrase("Open {dev}'s hive", { dev: p.dev }))}</span></button></div>`;
}

function paintInto(el, html) {
  if (mine.painted.get(el) === html) return false;
  el.innerHTML = html;
  mine.painted.set(el, html);
  return true;
}

function build(ctx) {
  const { esc, phrase, svgIcon, keyHint } = ctx;
  const pal = keyHint("palette");
  ctx.root.innerHTML = `<div class="ix">
    <nav class="ix-nav" aria-label="${esc(phrase("Views"))}">
      <div class="ix-ws"><span class="ix-logo">${svgIcon("i-grid")}</span><span class="ix-wsname"></span></div>
      <button type="button" class="ix-search" data-act="search">${svgIcon("i-mag")}<span>${esc(phrase("Search"))}</span>${pal ? `<span class="rc-key">${esc(pal)}</span>` : ""}</button>
      <div class="ix-views"></div>
      <div class="ix-navfoot"></div>
    </nav>
    <section class="ix-list">
      <header class="ix-lhead"><h2></h2><span class="cnt"></span><span class="ix-sort">${svgIcon("i-swap")}<span>${esc(phrase("who needs you"))}</span></span></header>
      <div class="ix-scroll"></div>
      <footer class="ix-lfoot"><span><span class="rc-key">j</span><span class="rc-key">k</span>${esc(phrase("navigate"))}</span><span><span class="rc-key">e</span>${esc(phrase("archive"))}</span><span><span class="rc-key">↵</span>${esc(phrase("reply"))}</span></footer>
    </section>
    <section class="ix-read">
      <header class="ix-rhead"></header>
      <div class="ix-page"><div class="ix-col ix-seat"><div class="ix-head"></div><div class="ix-host"></div><div class="ix-next"></div></div><div class="ix-pick"></div></div>
    </section>
  </div>`;
  const q = (sel) => ctx.root.querySelector(sel);
  mine.nodes = {
    wsname: q(".ix-wsname"), views: q(".ix-views"), navfoot: q(".ix-navfoot"), h2: q(".ix-lhead h2"), cnt: q(".ix-lhead .cnt"),
    scroll: q(".ix-scroll"), rhead: q(".ix-rhead"), head: q(".ix-head"), host: q(".ix-host"), next: q(".ix-next"), pick: q(".ix-pick"), seat: q(".ix-seat")
  };
}

function composerOf(ctx, key) {
  return key ? ctx.tile(key)?.querySelector(".sv-composer textarea") || null : null;
}

function choose(ctx, key) {
  if (!key) return;
  if (key.startsWith("team:")) {
    mine.teamPick = key;
    ctx.render();
    return;
  }
  const row = mine.shown.find((one) => one.key === key) || null;
  mine.pin = row ? { key, group: row.group } : null;
  markSeatRead(key);
  if (ctx.focused() === key) ctx.render();
  else ctx.focusSeat(key);
}

function move(ctx, d) {
  const now = mine.reading?.key || mine.teamPick || ctx.focused();
  const to = step(mine.shown, now, d);
  if (to) choose(ctx, to.key);
}

function replyAndNext(ctx) {
  const key = mine.reading?.key;
  const box = composerOf(ctx, key);
  if (!box || !box.value.trim()) return false;
  const next = mine.next;
  const form = box.closest("form");
  if (form?.requestSubmit) form.requestSubmit();
  else form?.dispatchEvent(new Event("submit", { cancelable: true }));
  if (next) {
    box.blur();
    choose(ctx, next.key);
  }
  return true;
}

function archive(ctx) {
  const r = mine.reading;
  if (!r?.session) return;
  const s = (st.data?.sessions || []).find((one) => one.name === r.name);
  if (!s) return;
  const at = mine.shown.findIndex((one) => one.key === r.key);
  const then = at < 0 ? null : mine.shown[at + 1] || mine.shown[at - 1];
  if (then) choose(ctx, then.key);
  archiveSeatNow(s);
}

function clicked(event, ctx) {
  const hit = event.target.closest("[data-view], [data-key], [data-act]");
  if (!hit || !ctx.root.contains(hit)) return;
  if (hit.dataset.view) {
    mine.view = hit.dataset.view;
    if (!(mine.view === "team" || mine.view.startsWith("dev:"))) mine.teamPick = "";
    ctx.render();
    return;
  }
  if (hit.dataset.key) return choose(ctx, hit.dataset.key);
  const act = hit.dataset.act;
  if (act === "search") return openPal();
  if (act === "archive") return archive(ctx);
  if (act === "next") return replyAndNext(ctx) || composerOf(ctx, mine.reading?.key)?.focus();
  if (act === "team") return goToTeam(hit.dataset.machine);
  if (act === "web") ctx.tile(mine.reading?.key)?.querySelector(".t-web")?.click();
}

const inbox = {
  id: "inbox",
  ready: true,
  groupOf,
  lastWords,
  nextUp,
  enter(ctx) {
    mine.pin = null;
    mine.teamPick = "";
    mine.shown = [];
    mine.reading = null;
    mine.next = null;
    mine.lastSel = "";
    mine.painted = new Map();
    build(ctx);
    ctx.listen(ctx.root, "click", (event) => clicked(event, ctx));
  },
  leave(ctx) {
    mine.nodes = null;
    mine.painted = new Map();
    mine.shown = [];
    mine.reading = null;
    mine.next = null;
    ctx.root.replaceChildren();
  },
  paint(ctx) {
    if (!mine.nodes) build(ctx);
    const n = mine.nodes;
    const v = viewModel(ctx);
    ctx.root.classList.toggle("ix-off", ctx.onPlane());
    mine.shown = v.queue;
    mine.reading = v.reading;
    mine.next = v.next;
    const { esc, phrase } = ctx;
    n.wsname.textContent = v.workspace;
    paintInto(n.views, navHtml(v, ctx));
    paintInto(n.navfoot, `<span>${esc(phrase(v.counts.needs === 1 ? "{n} is asking for you" : "{n} asking for you", { n: v.counts.needs }))}</span><span>${esc(phrase("{n} seats", { n: v.counts.all }))}</span>`);
    n.h2.textContent = viewTitle(v, phrase);
    n.cnt.textContent = String(v.queue.length);
    paintInto(n.scroll, listHtml(v, ctx));
    paintInto(n.rhead, headHtml(v, ctx));
    paintInto(n.head, titleHtml(v, ctx));
    paintInto(n.next, nextHtml(v, ctx));
    paintInto(n.pick, pickHtml(v, ctx));
    n.seat.hidden = !v.reading;
    if (v.reading) ctx.place(v.reading.key, n.host);
    if (v.selected !== mine.lastSel) {
      mine.lastSel = v.selected;
      n.scroll.querySelector(".ix-row.sel")?.scrollIntoView?.({ block: "nearest" });
    }
  },
  keydown(event, ctx) {
    if (!mine.nodes || ctx.onPlane()) return false;
    const mod = IS_MAC ? event.metaKey : event.ctrlKey;
    if (event.key === "Enter" && mod && !event.shiftKey && !event.altKey) {
      const box = composerOf(ctx, mine.reading?.key);
      return !!box && document.activeElement === box && replyAndNext(ctx);
    }
    if (ctx.inField() || event.metaKey || event.ctrlKey || event.altKey) return false;
    const at = document.activeElement;
    if (at && at !== document.body && !ctx.root.contains(at)) return false;
    if (event.key === "j" || event.key === "ArrowDown") { move(ctx, 1); return true; }
    if (event.key === "k" || event.key === "ArrowUp") { move(ctx, -1); return true; }
    if (event.key === "Enter" && !event.shiftKey) {
      const box = composerOf(ctx, mine.reading?.key);
      if (!box) return false;
      markSeatRead(mine.reading.key);
      box.focus();
      return true;
    }
    if (event.key === "e" && !event.shiftKey && mine.reading?.session) { archive(ctx); return true; }
    return false;
  }
};

export { inbox };
