import { blocksOf, labelOf, ofBlock } from "../app/blocks.js";
import { keyLabel, whichChord } from "../app/brand-face.js";
import { FOCUS_MOVES, st } from "../app/core.js";
import { goToBlockAt, gridRows } from "../app/focus-navigation.js";
import { disarmLeader, keyCaps } from "../app/leader-key.js";
import { prButtonViewModel } from "../app/seat-menu.js";
import { inAStrip } from "../app/seat-layout.js";
import { structPool } from "../app/structured-seats.js";
import { run } from "../app/themes.js";

const COLUMNS = 6;

const NUMBERS_LINGER = 3000;

const CLOCK_BEAT = 15000;

const WHICH = [
  ["seat", "go to the seat"],
  ["calls", "who needs you", true],
  ["zoom", "zoom in / back"],
  ["numbers", "the seat numbers"],
  ["browser", "browser beside"],
  ["prs", "PRs"],
  ["focusLeft focusRight", "focus beside"],
  ["focusUp focusDown", "focus above / below"],
  ["prevBlock nextBlock", "another block"],
  ["new", "new seat"],
  ["kill", "close the seat"],
  ["palette", "palette"]
];

const OWN_CHORDS = { zoom: "KeyZ", numbers: "KeyQ" };

let numbersTimer = 0;

let clockTimer = 0;

let numbersOn = false;

const dom = { grid: null, which: null, line: null, panes: new Map() };

function gridRowsOf(n) {
  const laid = gridRows(n);
  if (laid) return laid;
  const rows = [];
  for (let i = 0; i < n; i += 3) rows.push(Array.from({ length: Math.min(3, n - i) }, (_, k) => i + k));
  return rows;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function columnsOf(rows) {
  return rows.reduce((cols, row) => (row.length ? (cols * row.length) / gcd(cols, row.length) : cols), COLUMNS);
}

function paneCells(n) {
  const rows = gridRowsOf(n);
  const columns = columnsOf(rows);
  return Array.from({ length: n }, (_, i) => {
    const mine = rows.map((row, r) => [row, r]).filter(([row]) => row.includes(i));
    const [row, r] = mine[0];
    const span = columns / row.length;
    return { row: r + 1, rows: mine.length, col: row.indexOf(i) * span + 1, cols: span };
  });
}

function compact(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const stamp = (iso) => {
  const at = Date.parse(iso || "");
  return Number.isFinite(at) ? at : 0;
};

function sinceOf(seat, live, now) {
  const from = seat.state === "working"
    ? live?.activitySince || stamp(seat.liveSince)
    : stamp(seat.finish?.at) || stamp(seat.history?.at(-1)?.at) || stamp(seat.when);
  return from ? compact(now - from) : "";
}

function whereOf(seat) {
  const trees = Array.isArray(seat.trees) ? seat.trees : [];
  const prs = Array.isArray(seat.prs) ? seat.prs.length : 0;
  const head = trees[0];
  if (!head) return seat.where === "local" || !seat.where ? "" : seat.where;
  const tail = prs ? (prs === 1 ? "1 PR" : `${prs} PRs`) : head.branch || (head.main ? "main" : "");
  const more = trees.length > 1 ? ` +${trees.length - 1}` : "";
  return [head.repo + more, tail].filter(Boolean).join(" · ");
}

function toolOf(seat, live, phrase) {
  const tool = /^running (.+)$/.exec(live?.activity || "");
  if (tool) return { icon: "i-term", text: tool[1] };
  if (seat.state === "working" && live?.activity && live.activity !== "working") return { icon: "", text: phrase(live.activity === "writing" ? "writing the answer" : live.activity) };
  const prs = (Array.isArray(seat.prs) ? seat.prs : []).map((p) => (p?.number ? `#${p.number}` : "")).filter(Boolean);
  if (prs.length) return { icon: "i-pr", text: prs.join(" ") };
  return null;
}

function contextOf(live) {
  const p = live?.context?.p;
  return Number.isFinite(p) ? Math.round(Math.min(100, Math.max(0, p))) : null;
}

function barModel(ctx, seat, now) {
  const live = structPool.get(seat.key);
  const need = seat.state === "needs";
  const since = sinceOf(seat, live, now);
  const segs = [];
  if (need) segs.push({ text: `▲ ${ctx.label("needs")}` });
  else segs.push({ dot: seat.state, text: ctx.label(seat.state) });
  const tool = need ? null : toolOf(seat, live, ctx.phrase);
  if (tool) segs.push(tool);
  if (seat.state === "answered") segs.push({ text: ctx.phrase("unread") });
  if (since) {
    const text = need ? ctx.phrase("{t} ago", { t: since }) : seat.state === "stalled" ? ctx.phrase("no output for {t}", { t: since }) : since;
    segs.push({ text });
  }
  const pct = contextOf(live);
  if (pct !== null) segs.push({ ctx: pct });
  if (need) segs.push({ text: ctx.phrase("{key} answers", { key: ctx.keyHint("calls") }) });
  return { tone: need ? "need" : seat.state, segs, model: seat.model || "" };
}

function panesOf(ctx) {
  const here = ctx.seats().filter((one) => one.here).sort((a, b) => a.at - b.at);
  if (!st.open) return here;
  return here.filter((one) => one.key === st.open);
}

function lineModel(ctx, now) {
  const mine = blocksOf(st.space);
  const current = st.blocks[st.block];
  const windows = mine.map((b, i) => ({
    n: i + 1,
    name: labelOf(b, ofBlock(b)).txt || ctx.phrase("empty"),
    on: b === current,
    zoom: b === current && !!st.open
  }));
  const seats = ctx.seats();
  const calling = seats.filter((one) => one.state === "needs");
  const first = calling[0];
  const need = !first ? null : {
    key: first.key,
    text: calling.length > 1
      ? `▲ ${calling.length} ${ctx.phrase("need you")} · ${ctx.keyHint("calls")}`
      : `▲ ${first.here ? `${first.at + 1} ` : ""}${first.title || first.name} · ${ctx.keyHint("calls")}`
  };
  const behind = st.open
    ? seats.filter((one) => one.here && one.key !== st.open).sort((a, b) => a.at - b.at).map((one) => ({ n: one.at + 1, state: one.state }))
    : [];
  const prs = st.prs?.length ? prButtonViewModel() : null;
  const date = new Date(now);
  const lang = document.documentElement.lang || undefined;
  const clock = `${date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} ${date.toLocaleDateString(lang, { weekday: "short" }).replace(/\.$/, "")} ${date.toLocaleDateString(lang, { day: "2-digit", month: "2-digit" })}`;
  return {
    armed: keyLabel(st.leader || null),
    windows,
    need,
    behind,
    prs: prs ? { tone: prs.tone, text: `${prs.lead} ${prs.word}` } : null,
    message: numbersOn ? ctx.phrase("press the seat number") : "",
    clock
  };
}

function cockpitModel(ctx, now = Date.now()) {
  const panes = panesOf(ctx);
  const focused = ctx.focused();
  const cells = paneCells(panes.length);
  return {
    zoom: !!st.open,
    strip: !st.open && inAStrip(),
    columns: Math.max(1, ...cells.map((c) => c.col + c.cols - 1)),
    numbers: numbersOn,
    panes: panes.map((seat, i) => ({
      key: seat.key,
      n: seat.at + 1,
      title: seat.title || seat.name || "",
      where: st.open ? [whereOf(seat), ctx.phrase("zoomed")].filter(Boolean).join(" · ") : whereOf(seat),
      on: seat.key === focused,
      need: seat.state === "needs",
      cell: cells[i],
      bar: barModel(ctx, seat, now)
    })),
    line: lineModel(ctx, now),
    empty: panes.length ? "" : ctx.phrase("nothing in this block — {key} opens a new seat", { key: ctx.keyHint("new") })
  };
}

function chordCaps(action) {
  if (OWN_CHORDS[action]) return keyCaps(action === "zoom" ? "z" : "q");
  if (action === "seat") return keyCaps(`1-${Math.max(2, st.LIMIT || 6)}`);
  return action.split(" ").map((one) => (st.chords?.[one] ? keyCaps(keyLabel(st.chords[one])) : "")).join("");
}

function whichHtml(ctx) {
  const lead = keyCaps(keyLabel(st.leader || null));
  const items = WHICH.map(([action, said, hot]) => {
    const caps = chordCaps(action);
    return caps ? `<span class="ck-wi${hot ? " hot" : ""}">${caps}<span>${ctx.esc(ctx.phrase(said))}</span></span>` : "";
  }).join("");
  return `<div class="ck-wh">${lead}<span>${ctx.esc(ctx.phrase("armed · one key"))}</span><span class="ck-gr"></span>${keyCaps("esc")}<span>${ctx.esc(ctx.phrase("gives up"))}</span></div><div class="ck-wg">${items}</div>`;
}

function segHtml(ctx, seg) {
  if (seg.ctx !== undefined) return `<span class="ck-sg">ctx <i class="ck-bar"><i style="width:${seg.ctx}%"></i></i> ${seg.ctx}%</span>`;
  const dot = seg.dot ? `<span class="rc-dot ${ctx.esc(seg.dot)}"></span>` : "";
  const icon = seg.icon ? ctx.svgIcon(seg.icon) : "";
  return `<span class="ck-sg">${dot}${icon}${ctx.esc(seg.text)}</span>`;
}

function barHtml(ctx, bar) {
  return `${bar.segs.map((seg) => segHtml(ctx, seg)).join("")}<span class="ck-sg ck-r">${ctx.esc(bar.model)}</span>`;
}

function headHtml(ctx, pane) {
  return `<span class="ck-pn">${pane.n}</span><span class="ck-pt">${ctx.esc(pane.title)}</span><span class="ck-rule"></span><span class="ck-pm">${ctx.esc(pane.where)}</span>`;
}

function bigHtml(ctx, pane) {
  const key = pane.need ? `<span class="ck-keys">${keyCaps(ctx.keyHint("calls"))}</span>` : "";
  return `<span class="ck-num">${pane.n}</span><span class="ck-nm">${ctx.esc(pane.title)}</span>${key}`;
}

function lineHtml(ctx, line) {
  const windows = line.windows.map((w) => `<button type="button" class="ck-win${w.on ? " cur" : ""}" data-block="${w.n - 1}">${w.n}:${ctx.esc(w.name)}${w.on ? `<span class="ck-fl">*${w.zoom ? "Z" : ""}</span>` : ""}</button>`).join("");
  const message = line.message ? `<span class="ck-msg">${ctx.esc(line.message)}</span>` : "";
  const behind = line.behind.length
    ? `<span class="ck-seg ck-hid">${ctx.esc(ctx.phrase("behind the zoom"))} ${line.behind.map((b) => `<b>${b.n}<span class="rc-dot ${ctx.esc(b.state)}"></span></b>`).join("")}</span>`
    : "";
  const need = line.need ? `<button type="button" class="ck-need" data-seat="${ctx.esc(line.need.key)}">${ctx.esc(line.need.text)}</button>` : "";
  const prs = line.prs ? `<button type="button" class="ck-seg ck-prs ${ctx.esc(line.prs.tone)}"><span class="ck-pd">●</span>${ctx.esc(line.prs.text)}</button>` : "";
  return `<span class="ck-ses"><span class="ck-calm">hive</span><span class="ck-armed">${ctx.esc(line.armed)}</span></span>${windows}${message}${behind}<span class="ck-sp"></span>${need}${prs}<span class="ck-clock">${ctx.esc(line.clock)}</span>`;
}

const setHtml = (el, html) => {
  if (el.dataset.h === html) return;
  el.innerHTML = html;
  el.dataset.h = html;
};

function paneEl(key) {
  let pane = dom.panes.get(key);
  if (pane) return pane;
  const box = document.createElement("section");
  box.className = "ck-pane";
  box.dataset.key = key;
  box.innerHTML = `<header class="ck-ph"></header><div class="ck-host"></div><div class="ck-sl"></div><div class="ck-big" aria-hidden="true"></div>`;
  pane = { box, head: box.children[0], host: box.children[1], bar: box.children[2], big: box.children[3] };
  dom.panes.set(key, pane);
  return pane;
}

function paintCockpit(ctx) {
  const view = cockpitModel(ctx);
  dom.grid.classList.toggle("zoom", view.zoom);
  dom.grid.classList.toggle("numbers", view.numbers);
  dom.grid.classList.toggle("strip", view.strip);
  dom.grid.dataset.empty = view.empty;
  const rows = Math.max(1, ...view.panes.map((p) => p.cell.row + p.cell.rows - 1));
  dom.grid.style.gridTemplateRows = view.strip ? "" : `repeat(${rows}, minmax(0, 1fr))`;
  dom.grid.style.gridTemplateColumns = view.strip ? "" : `repeat(${view.columns}, minmax(0, 1fr))`;
  const keep = new Set(view.panes.map((p) => p.key));
  for (const [key, pane] of dom.panes) {
    if (keep.has(key)) continue;
    pane.box.remove();
    dom.panes.delete(key);
  }
  view.panes.forEach((p, i) => {
    const pane = paneEl(p.key);
    if (dom.grid.children[i] !== pane.box) dom.grid.insertBefore(pane.box, dom.grid.children[i] || null);
    const area = view.strip ? "" : `${p.cell.row} / ${p.cell.col} / span ${p.cell.rows} / span ${p.cell.cols}`;
    if (pane.box.style.gridArea !== area) pane.box.style.gridArea = area;
    pane.box.classList.toggle("on", p.on);
    pane.box.classList.toggle("need", p.need);
    pane.bar.className = `ck-sl ${p.bar.tone}`;
    setHtml(pane.head, headHtml(ctx, p));
    setHtml(pane.bar, barHtml(ctx, p.bar));
    setHtml(pane.big, bigHtml(ctx, p));
    ctx.place(p.key, pane.host);
  });
  setHtml(dom.which, whichHtml(ctx));
  setHtml(dom.line, lineHtml(ctx, view.line));
}

function hideNumbers(ctx) {
  clearTimeout(numbersTimer);
  if (!numbersOn) return;
  numbersOn = false;
  ctx.render();
}

function showNumbers(ctx) {
  numbersOn = true;
  clearTimeout(numbersTimer);
  numbersTimer = setTimeout(() => hideNumbers(ctx), NUMBERS_LINGER);
  ctx.render();
}

function stepPane(ctx, dx, dy) {
  const panes = panesOf(ctx);
  if (st.open || !panes.length) return;
  const rows = gridRowsOf(panes.length);
  const at = panes.findIndex((one) => one.key === ctx.focused());
  const r = rows.findIndex((row) => row.includes(at));
  if (r < 0) return;
  const y = r + dy;
  const x = rows[r].indexOf(at) + dx;
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[y].length) return;
  const target = panes[rows[y][x]];
  if (target && target.key !== ctx.focused()) ctx.focusSeat(target.key);
}

const bare = (event) => !event.altKey && !event.ctrlKey && !event.metaKey;

function leaderKey(event, ctx) {
  if (["Alt", "Shift", "Control", "Meta"].includes(event.key)) return false;
  const chord = whichChord(event);
  const own = !chord && bare(event) && !event.shiftKey;
  if (own && event.code === OWN_CHORDS.zoom) {
    disarmLeader();
    run("fullscreen");
    return true;
  }
  if (bare(event) && !event.shiftKey && event.code === OWN_CHORDS.numbers) {
    disarmLeader();
    showNumbers(ctx);
    return true;
  }
  if (chord && FOCUS_MOVES[chord.action]) {
    disarmLeader();
    stepPane(ctx, ...FOCUS_MOVES[chord.action]);
    return true;
  }
  return false;
}

function numbersKey(event, ctx) {
  if (["Alt", "Shift", "Control", "Meta"].includes(event.key)) return false;
  const digit = /^Digit([1-9])$/.exec(event.code);
  const pane = digit ? panesOf(ctx).find((one) => one.at + 1 === Number(digit[1])) : null;
  hideNumbers(ctx);
  if (pane) {
    ctx.focusSeat(pane.key);
    return true;
  }
  return event.key === "Escape" || !!digit;
}

function onClick(event, ctx) {
  const block = event.target.closest(".ck-win");
  if (block) return goToBlockAt(Number(block.dataset.block));
  const need = event.target.closest(".ck-need");
  if (need) return ctx.focusSeat(need.dataset.seat);
  if (event.target.closest(".ck-prs")) return run("prs");
  const pane = event.target.closest(".ck-pane");
  if (!pane || event.target.closest(".ck-host")) return;
  if (pane.dataset.key !== ctx.focused()) ctx.focusSeat(pane.dataset.key);
}

function onDoubleClick(event) {
  if (event.target.closest(".ck-ph")) run("fullscreen");
}

const cockpit = {
  id: "cockpit",
  ready: true,
  enter(ctx) {
    numbersOn = false;
    dom.panes.clear();
    ctx.root.classList.add("ck");
    ctx.root.innerHTML = `<div class="ck-grid"></div><div class="ck-which" role="note"></div><div class="ck-line" role="status"></div>`;
    [dom.grid, dom.which, dom.line] = ctx.root.children;
    ctx.listen(ctx.root, "click", (event) => onClick(event, ctx));
    ctx.listen(ctx.root, "dblclick", onDoubleClick);
    clockTimer = setInterval(() => { if (dom.line) setHtml(dom.line, lineHtml(ctx, lineModel(ctx, Date.now()))); }, CLOCK_BEAT);
  },
  leave(ctx) {
    clearInterval(clockTimer);
    clearTimeout(numbersTimer);
    numbersOn = false;
    dom.panes.clear();
    dom.grid = dom.which = dom.line = null;
    ctx.root.classList.remove("ck");
  },
  paint(ctx) {
    if (dom.grid) paintCockpit(ctx);
  },
  keydown(event, ctx) {
    if (st.pending) return leaderKey(event, ctx);
    if (numbersOn) return numbersKey(event, ctx);
    return false;
  },
  model: cockpitModel,
  cells: paneCells
};

export { cockpit };
