import { st } from "../state.js";

const GROUP_OF = { needs: "needs", working: "working", stalled: "working", opening: "working" };

const GROUP_ORDER = ["needs", "working", "done"];

const WEBVIEW = typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent);

let ui = null;

const fold = (text) => String(text || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const groupOf = (state) => GROUP_OF[state] || "done";

const cap = (text, esc) => `<span class="rc-key">${esc(text)}</span>`;

function seatLine(seat) {
  if (seat.verb) return [seat.verb, seat.measure].filter(Boolean).join(" · ");
  const ask = (seat.asks || [])[0];
  const asked = typeof ask === "string" ? ask : ask?.question || ask?.text || "";
  return String(seat.now || asked || seat.summary || seat.done || "").split("\n")[0].trim();
}

function seatRow(seat, ctx) {
  return {
    id: seat.key,
    kind: "seat",
    key: seat.key,
    state: seat.state,
    block: seat.block,
    name: seat.naming ? ctx.phrase("new chat") : seat.title || seat.name,
    line: seatLine(seat),
    acc: seat.state === "working" && seat.when ? seat.when : ctx.label(seat.state),
    quiet: seat.state === "idle"
  };
}

function fire(action) {
  const bound = st.keys?.[action];
  if (!bound?.code) return false;
  const init = { code: bound.code, key: "", altKey: !!bound.alt, ctrlKey: !!bound.ctrl, metaKey: !!bound.meta, shiftKey: !!bound.shift, bubbles: true, cancelable: true };
  document.body.dispatchEvent(new KeyboardEvent("keydown", init));
  return true;
}

const press = (sel) => document.querySelector(sel)?.click();

function prsSaid() {
  const btn = typeof document !== "undefined" ? document.getElementById("btn-prs") : null;
  if (!btn || btn.hidden) return "";
  return [...btn.querySelectorAll("*")].filter((el) => !el.children.length).map((el) => el.textContent.trim()).filter(Boolean).join(" ") || btn.textContent.trim();
}

function commandRows(ctx) {
  return [
    { id: "cmd:new", kind: "command", icon: "i-plus", name: ctx.phrase("new chat"), line: "", keys: ctx.keyHint("new"), go: () => fire("new") },
    { id: "cmd:prs", kind: "command", icon: "i-pr", name: ctx.phrase("pull requests"), line: prsSaid(), keys: ctx.keyHint("prs"), go: () => press("#pp-all") },
    { id: "cmd:day", kind: "command", icon: "i-cal", name: ctx.phrase("your day"), line: "", keys: ctx.keyHint("day"), go: () => fire("day") },
    { id: "cmd:shelf", kind: "command", icon: "i-book", name: ctx.phrase("shelf"), line: "", keys: ctx.keyHint("shelf"), go: () => fire("shelf") },
    { id: "cmd:usage", kind: "command", icon: "i-chart", name: ctx.phrase("usage"), line: "", keys: ctx.keyHint("usage"), go: () => fire("usage") },
    { id: "cmd:classic", kind: "command", icon: "i-grid", name: ctx.phrase("Structure: {name}", { name: ctx.phrase("Classic") }), line: "", keys: "", go: () => press('#f-structure [data-structure="classic"]') }
  ];
}

function launcherModel(seatRows, commands, query, sel) {
  const q = fold(query).trim();
  const hit = (row) => !q || fold(`${row.name} ${row.line || ""} ${row.acc || ""}`).includes(q);
  const seats = seatRows.filter(hit);
  const groups = GROUP_ORDER.map((id) => ({ id, rows: seats.filter((row) => groupOf(row.state) === id) })).filter((group) => group.rows.length);
  const found = commands.filter(hit);
  if (found.length) groups.push({ id: "commands", rows: found });
  const flat = groups.flatMap((group) => group.rows);
  const picked = flat.find((row) => row.id === sel) || flat[0] || null;
  return { groups, flat, sel: picked?.id || null, picked };
}

function stepFrom(flat, sel, by) {
  if (!flat.length) return null;
  const at = flat.findIndex((row) => row.id === sel);
  const next = at < 0 ? 0 : Math.max(0, Math.min(flat.length - 1, at + by));
  return flat[next].id;
}

function groupTitle(id, ctx) {
  if (id === "needs") return ctx.phrase("Needs you");
  if (id === "working") return ctx.phrase("Working");
  if (id === "done") return ctx.phrase("Ready");
  return ctx.phrase("Commands");
}

function rowHtml(row, on, ctx) {
  const { esc } = ctx;
  const icon = row.kind === "seat"
    ? `<span class="lx-ic"><i class="rc-dot ${esc(row.state)}"></i></span>`
    : `<span class="lx-ic lx-circle">${ctx.svgIcon(row.icon)}</span>`;
  const accent = row.state === "stalled" ? " warn" : "";
  const acc = row.kind === "seat"
    ? `<span class="acc${accent}">${esc(row.acc || "")}${on ? cap("↵", esc) : ""}</span>`
    : `<span class="acc">${row.keys ? cap(row.keys, esc) : ""}</span>`;
  return `<button type="button" class="lx-row${on ? " sel" : ""}${row.quiet ? " quiet" : ""}" role="option" aria-selected="${on}" data-id="${esc(row.id)}">${icon}<span class="t">${esc(row.name)}</span><span class="s">${esc(row.line || "")}</span>${acc}</button>`;
}

function listHtml(model, ctx) {
  if (!model.flat.length) return `<p class="lx-none">${ctx.esc(ctx.phrase("nothing matches"))}</p>`;
  return model.groups.map((group) => {
    const n = group.id === "commands" ? "" : `<span class="n">${group.rows.length}</span>`;
    const head = `<div class="lx-sec ${ctx.esc(group.id)}">${ctx.esc(groupTitle(group.id, ctx))}${n}</div>`;
    return head + group.rows.map((row) => rowHtml(row, row.id === model.sel, ctx)).join("");
  }).join("");
}

function frameHtml(ctx) {
  const { esc } = ctx;
  return `<div class="lx-atmo" aria-hidden="true"></div>
  <section class="lx-win">
    <header class="lx-cmd">
      <input class="lx-q" type="text" spellcheck="false" autocomplete="off" />
      <button type="button" class="lx-ask">${ctx.svgIcon("i-mag")}<span data-say="ask"></span>${cap("Tab", esc)}</button>
    </header>
    <header class="lx-crumbs">
      <button type="button" class="lx-back">${cap("esc", esc)}<span data-say="launcher"></span></button>
      <span class="lx-sl">/</span>
      <span class="lx-crumb"><i class="rc-dot"></i><b></b></span>
      <span class="lx-grow"></span>
      <div class="lx-seg" role="tablist"></div>
    </header>
    <div class="lx-body">
      <div class="lx-list" role="listbox"></div>
      <div class="lx-detail"><div class="lx-host"></div><div class="lx-aside" hidden></div></div>
    </div>
    <footer class="lx-bar">
      <span class="lx-who"></span>
      <button type="button" class="lx-call" hidden></button>
      <span class="lx-grow"></span>
      <button type="button" class="lx-act lx-go"><span data-say="go"></span>${cap("↵", esc)}</button>
      <span class="lx-vbar"></span>
      <button type="button" class="lx-act lx-acts"><span data-say="acts"></span><span class="rc-key" data-say="acts-key"></span></button>
    </footer>
  </section>
  <div class="lx-hints"></div>`;
}

function paintHtml(el, html) {
  if (!el || el.dataset.h === html) return false;
  el.innerHTML = html;
  el.dataset.h = html;
  return true;
}

function paintLabels(ctx) {
  const { phrase } = ctx;
  const said = {
    ask: phrase("Search everything"),
    launcher: phrase("Launcher"),
    go: phrase("Open full screen"),
    acts: phrase("Actions"),
    "acts-key": ctx.keyHint("palette")
  };
  for (const el of ui.says) {
    const text = said[el.dataset.say] ?? "";
    if (el.textContent !== text) el.textContent = text;
  }
  const hint = phrase("Open a seat, run a command, search everything…");
  if (ui.q.placeholder !== hint) ui.q.placeholder = hint;
  const name = phrase("Launcher");
  if (ui.win.getAttribute("aria-label") !== name) ui.win.setAttribute("aria-label", name);
}

function paintList(ctx, model) {
  if (!paintHtml(ui.list, listHtml(model, ctx))) return;
  ui.list.querySelector(".lx-row.sel")?.scrollIntoView?.({ block: "nearest" });
}

function paintAside(ctx, row) {
  const on = !!row && row.kind === "command";
  ui.aside.hidden = !on;
  ui.host.hidden = on;
  if (!on) return;
  const { esc } = ctx;
  paintHtml(ui.aside, `<span class="lx-circle big">${ctx.svgIcon(row.icon)}</span><b>${esc(row.name)}</b>${row.line ? `<span>${esc(row.line)}</span>` : ""}<span class="lx-press">${esc(ctx.phrase("press {key} to run it", { key: "↵" }))}</span>`);
}

function callerOf(seats, open) {
  return seats.find((seat) => seat.state === "needs" && seat.key !== open) || null;
}

function paintBar(ctx, model, open, seats) {
  const { esc } = ctx;
  const seat = open ? seats.find((one) => one.key === open) : model.picked?.kind === "seat" ? seats.find((one) => one.key === model.picked.key) : null;
  const block = seat ? st.blocks?.[seat.block] : null;
  const where = seat ? [ctx.phrase("block {n}", { n: seat.block + 1 }), block?.label || ""].filter(Boolean).join(" · ") : "";
  paintHtml(ui.who, `<span class="lx-logo">${ctx.svgIcon("i-agent")}</span><b>Hive</b><span class="mono">${esc(where)}</span>`);
  const caller = open ? callerOf(seats, open) : null;
  ui.call.hidden = !caller;
  ui.call.dataset.key = caller?.key || "";
  if (caller) paintHtml(ui.call, `<i class="rc-dot needs"></i><span>${esc(ctx.phrase("{name} needs you", { name: caller.title || caller.name }))}</span>${cap(ctx.keyHint("calls"), esc)}`);
  ui.go.hidden = !!open || model.picked?.kind !== "seat";
  ui.vbar.hidden = ui.go.hidden;
}

function paintHints(ctx, full) {
  const { esc, phrase } = ctx;
  const say = (keys, text) => `<span>${keys.map((one) => cap(one, esc)).join("")}${esc(text)}</span>`;
  const html = full
    ? [say(["esc"], phrase("back to the launcher")), say([ctx.keyHint("calls")], phrase("jumps to who needs you")), say([ctx.keyHint("palette")], phrase("actions"))].join("")
    : [say(["↑", "↓"], phrase("switch seat")), say(["↵"], phrase("open")), say([ctx.keyHint("palette")], phrase("actions")), say(["Tab"], phrase("Search everything"))].join("");
  paintHtml(ui.hints, html);
}

const changeRows = (tile) => (tile ? [...tile.querySelectorAll(".cd-list .cd-row:not(.cd-more)")] : []);

function paintCrumbs(ctx, seats, open) {
  const { esc } = ctx;
  const seat = seats.find((one) => one.key === open);
  const dot = ui.crumbs.querySelector(".rc-dot");
  dot.className = `rc-dot ${seat?.state || ""}`;
  ui.crumbs.querySelector(".lx-crumb b").textContent = seat ? seat.title || seat.name : open;
  const pane = st.diffChat === open ? "diff" : st.webChat === open ? "web" : "chat";
  const files = changeRows(ctx.tile(open)).length;
  const tab = (id, label, extra = "") => `<button type="button" role="tab" data-pane="${id}" aria-selected="${pane === id}" class="${pane === id ? "on" : ""}">${esc(label)}${extra}</button>`;
  const tabs = [tab("chat", ctx.phrase("Conversation"))];
  if (WEBVIEW) tabs.push(tab("web", ctx.phrase("Browser")));
  if (files) tabs.push(tab("diff", ctx.phrase("Changes"), `<span class="n">${files}</span>`));
  paintHtml(ui.seg, tabs.length > 1 ? tabs.join("") : "");
}

function selected() {
  return ui?.model?.flat.find((row) => row.id === ui.sel) || null;
}

function select(ctx, id) {
  if (!ui || !id) return;
  ui.sel = id;
  const row = ui.model?.flat.find((one) => one.id === id);
  ui.holding = true;
  try {
    if (row?.kind === "seat") ctx.focusSeat(row.key);
    if (row?.kind !== "seat" || ctx.focused() !== row.key) ctx.render();
  } finally { ui.holding = false; }
  ui.seen = ctx.focused();
}

function step(ctx, by) {
  select(ctx, stepFrom(ui.model?.flat || [], ui.sel, by));
}

function search(ctx) {
  if (!ui) return;
  ui.query = ui.q.value;
  const model = launcherModel(ctx.seats().map((seat) => seatRow(seat, ctx)), commandRows(ctx), ui.query, ui.sel);
  ui.model = model;
  if (model.sel !== ui.sel) return select(ctx, model.sel);
  paintList(ctx, model);
}

function hasPage(key, ctx) {
  const page = ctx.tile(key)?.querySelector(".t-page");
  return !!page && !page.hidden;
}

function openPicked(ctx) {
  const row = selected();
  if (!row) return;
  if (row.kind !== "seat") return row.go();
  ctx.openSeat(row.key);
  if (WEBVIEW && st.open === row.key && st.webChat !== row.key && hasPage(row.key, ctx)) fire("browser");
}

function openActions(ctx) {
  const name = st.open || (selected()?.kind === "seat" ? selected().key : null);
  const seat = name ? (st.data?.sessions || []).find((one) => one.name === name) : null;
  const tile = seat ? ctx.tile(seat.name) : null;
  if (!tile) return false;
  const box = ui.acts.getBoundingClientRect();
  tile.dispatchEvent(new MouseEvent("contextmenu", { clientX: box.right, clientY: box.top, bubbles: true, cancelable: true }));
  const menu = document.getElementById("seatmenu");
  if (menu) {
    const own = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(6, box.right - own.width)}px`;
    menu.style.top = `${Math.max(6, box.top - own.height - 8)}px`;
  }
  return true;
}

function askEverywhere(ctx) {
  press("#btn-pal");
  const field = document.getElementById("pal-q");
  if (!field) return;
  field.value = ui.query;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
}

function pickPane(ctx, pane) {
  const open = st.open;
  if (!open) return;
  const tile = ctx.tile(open);
  if (pane === "chat") {
    if (st.webChat === open) fire("browser");
    if (st.diffChat === open) tile?.querySelector(".cd-window .cd-head .cd-icon:last-of-type")?.click();
    return;
  }
  if (pane === "web" && st.webChat !== open) return fire("browser");
  if (pane === "diff" && st.diffChat !== open) changeRows(tile)[0]?.click();
}

function wire(ctx) {
  ctx.listen(ui.q, "input", () => search(ctx));
  ctx.listen(ui.list, "click", (event) => {
    const row = event.target.closest(".lx-row");
    if (!row) return;
    if (row.dataset.id === ui.sel) return openPicked(ctx);
    select(ctx, row.dataset.id);
  });
  ctx.listen(ui.go, "click", () => openPicked(ctx));
  ctx.listen(ui.acts, "click", (event) => { event.stopPropagation(); openActions(ctx); });
  ctx.listen(ui.ask, "click", () => askEverywhere(ctx));
  ctx.listen(ui.back, "click", () => ctx.closeSeat());
  ctx.listen(ui.call, "click", () => { if (ui.call.dataset.key) ctx.openSeat(ui.call.dataset.key); });
  ctx.listen(ui.seg, "click", (event) => {
    const tab = event.target.closest("[data-pane]");
    if (tab) pickPane(ctx, tab.dataset.pane);
  });
}

function enterLauncher(ctx) {
  ctx.root.classList.add("lx");
  ctx.root.innerHTML = frameHtml(ctx);
  const find = (sel) => ctx.root.querySelector(sel);
  ui = {
    win: find(".lx-win"), q: find(".lx-q"), ask: find(".lx-ask"), list: find(".lx-list"), host: find(".lx-host"), aside: find(".lx-aside"),
    crumbs: find(".lx-crumbs"), back: find(".lx-back"), seg: find(".lx-seg"),
    who: find(".lx-who"), call: find(".lx-call"), go: find(".lx-go"), vbar: find(".lx-vbar"), acts: find(".lx-acts"), hints: find(".lx-hints"),
    says: [...ctx.root.querySelectorAll("[data-say]")],
    query: "", sel: null, seen: ctx.focused(), model: null, mode: "", fresh: true, holding: false
  };
  wire(ctx);
}

function leaveLauncher(ctx) {
  ui = null;
  ctx.root.classList.remove("lx");
  delete ctx.root.dataset.mode;
}

function settleMode(ctx, mode) {
  if (ui.mode === mode) return;
  ui.mode = mode;
  ctx.root.dataset.mode = mode;
  if (mode === "list" && (!document.activeElement || document.activeElement === document.body)) ui.q.focus({ preventScroll: true });
  if (mode === "full" && document.activeElement === ui.q) ui.q.blur();
}

function paintLauncher(ctx) {
  if (!ui) return;
  const open = st.open || null;
  const seats = ctx.seats();
  const focused = ctx.focused();
  if (!ui.holding && focused !== ui.seen) {
    ui.seen = focused;
    if (!ui.fresh && focused && seats.some((seat) => seat.key === focused)) ui.sel = focused;
  }
  const model = launcherModel(seats.map((seat) => seatRow(seat, ctx)), commandRows(ctx), ui.query, ui.sel);
  ui.sel = model.sel;
  ui.model = model;
  if (ui.fresh && !open && model.picked?.kind === "seat" && model.picked.key !== focused) {
    const key = model.picked.key;
    setTimeout(() => { if (ui && ui.sel === key && !st.open) select(ctx, key); }, 0);
  }
  ui.fresh = false;
  settleMode(ctx, open ? "full" : "list");
  ctx.root.classList.toggle("lx-away", ctx.onPlane());
  paintLabels(ctx);
  paintList(ctx, model);
  const shown = open || (model.picked?.kind === "seat" ? model.picked.key : null);
  if (shown) ctx.place(shown, ui.host);
  paintAside(ctx, open ? null : model.picked);
  paintBar(ctx, model, open, seats);
  paintHints(ctx, !!open);
  if (open) paintCrumbs(ctx, seats, open);
}

function isActionsKey(event) {
  const bound = st.keys?.palette;
  if (!bound?.code) return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === "KeyK";
  return event.code === bound.code && event.metaKey === !!bound.meta && event.ctrlKey === !!bound.ctrl && event.altKey === !!bound.alt && event.shiftKey === !!bound.shift;
}

function launcherKey(event, ctx) {
  if (!ui || ctx.onPlane()) return false;
  const pal = document.getElementById("pal");
  if (pal && !pal.hidden) return false;
  if (document.getElementById("seatmenu")?.classList.contains("on")) return false;
  if (isActionsKey(event)) return openActions(ctx);
  if (st.open) return false;
  const inQuery = document.activeElement === ui.q;
  if (!inQuery && ctx.inField()) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    step(ctx, event.key === "ArrowDown" ? 1 : -1);
    return true;
  }
  if (event.key === "Enter") {
    openPicked(ctx);
    return true;
  }
  if (event.key === "Tab" && inQuery && !event.shiftKey) {
    askEverywhere(ctx);
    return true;
  }
  if (event.key === "Escape" && inQuery && ui.q.value) {
    ui.q.value = "";
    search(ctx);
    return true;
  }
  if (!inQuery && event.key.length === 1 && event.key !== " ") {
    ui.q.focus({ preventScroll: true });
    ui.q.value += event.key;
    search(ctx);
    return true;
  }
  return false;
}

const launcher = {
  id: "launcher",
  ready: true,
  enter: enterLauncher,
  leave: leaveLauncher,
  paint: paintLauncher,
  keydown: launcherKey
};

export { launcherModel, seatLine, stepFrom };

export { launcher };
