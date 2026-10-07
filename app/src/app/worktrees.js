import { $, esc, every, phrase, raycastOn, screenOpens, solidMounts, st, stopBeat } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { keyHint } from "./leader-key.js";
import { copyWithWord, followRaycast, footModel, leavePanel, openActions, panelOf, registerPanel, runAction } from "./panel-window.js";
import { ago, ask, bytes } from "./pod.js";
import { toClipboard } from "./terminal-history.js";
import { closePrs, exitReview, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";

const WT_BEAT = 15000;

const WT_MEASURING_BEAT = 4000;

st.wt = null;

st.wtHours = 1;

st.wtBusy = "";

st.wtPick = "";

st.wtQuery = "";

const worktreesOnScreen = () => !$("worktrees").hidden;

function paintWorktreeRail() {
  const host = $("rail-wt");
  const brief = st.data.worktrees;
  host.hidden = !brief || !brief.count;
  if (host.hidden) return;
  worktreeRailSolid.show(worktreeRailViewModel());
}

let worktreeRailSolid = null;

function worktreeRailViewModel() {
  const brief = st.data.worktrees;
  const size = brief.sized ? bytes(brief.bytes) : phrase("measuring…");
  if (raycastOn()) return raycastWorktreeRailViewModel(brief, size);
  return {
    key: "wt",
    idle: brief.idle ? "yes" : "no",
    title: brief.idle
      ? phrase("{n} worktrees on this machine, {idle} untouched — click to see them", { n: brief.count, idle: brief.idle })
      : phrase("{n} worktrees on this machine, every one of them alive", { n: brief.count }),
    name: phrase("worktrees"),
    count: brief.count,
    said: brief.idle ? phrase("{n} idle · {size}", { n: brief.idle, size }) : phrase("all alive · {size}", { size }),
    share: `${brief.bytes ? Math.min(100, Math.round((brief.idleBytes / brief.bytes) * 100)) : 0}%`
  };
}

function raycastWorktreeRailViewModel(brief, size) {
  return {
    key: "wt",
    raycast: true,
    title: brief.idle
      ? phrase("{n} worktrees on this machine, {idle} untouched — click to see them", { n: brief.count, idle: brief.idle })
      : phrase("{n} worktrees on this machine, every one of them alive", { n: brief.count }),
    name: phrase("worktrees"),
    count: brief.count,
    keys: keyHint("worktrees").split(" ").filter((one) => one !== "—"),
    said: [String(brief.count), brief.idle ? phrase("{n} idle", { n: brief.idle }) : phrase("all alive"), size],
    share: `${brief.bytes ? Math.min(100, Math.round((brief.idleBytes / brief.bytes) * 100)) : 0}%`
  };
}

solidMounts.push((hive) => {
  worktreeRailSolid = hive.mountWorktreeRail($("rail-wt"));
});

async function pullWorktrees(force) {
  try {
    const r = await fetch(`/api/worktrees?hours=${st.wtHours}${force ? "&force=1" : ""}`);
    st.wt = await r.json();
    if (!worktreesOnScreen()) return;
    paintWorktrees();
    if (st.wt.measuring) setTimeout(() => { if (worktreesOnScreen()) pullWorktrees(false); }, WT_MEASURING_BEAT);
  } catch {
    if (worktreesOnScreen()) sayWorktreeTrouble(phrase("could not reach the server"));
  }
}

function worktreeWhy(row) {
  if (row.keep === "seat") return phrase("{seat} is working in it", { seat: esc(row.seat) });
  if (row.keep === "loose") return row.loose === 1
    ? phrase("{n} file nobody committed", { n: row.loose })
    : phrase("{n} files nobody committed", { n: row.loose });
  if (row.keep === "ahead") return row.ahead === 1
    ? phrase("{n} commit nobody pushed", { n: row.ahead })
    : phrase("{n} commits nobody pushed", { n: row.ahead });
  if (row.keep === "locked") return phrase("locked on purpose");
  return "";
}

function worktreeGroups(rows) {
  const groups = [];
  for (const row of rows) {
    const found = groups.find((one) => one.repo === row.repo);
    if (found) found.rows.push(row);
    else groups.push({ repo: row.repo, rows: [row] });
  }
  for (const group of groups) {
    group.bytes = group.rows.reduce((n, row) => n + (row.bytes || 0), 0);
    group.rows.sort((a, b) => (b.bytes || 0) - (a.bytes || 0));
  }
  return groups.sort((a, b) => b.bytes - a.bytes || a.repo.localeCompare(b.repo));
}

function paintWorktrees() {
  if (raycastOn()) return worktreesSolid.show(worktreesWindowModel());
  worktreesSolid.show(worktreesViewModel());
}

let worktreesSolid = null;

function worktreeBadgeList(row) {
  const badges = [];
  if (row.seat) badges.push({ key: "seat", cls: "wt-badge live", say: phrase("{seat} is in it", { seat: row.seat }) });
  if (row.gone) badges.push({ key: "gone", cls: "wt-badge", say: phrase("folder already gone") });
  if (row.loose) badges.push({ key: "loose", cls: "wt-badge warn", say: row.loose === 1 ? phrase("{n} file nobody committed", { n: row.loose }) : phrase("{n} files nobody committed", { n: row.loose }) });
  if (row.ahead) badges.push({ key: "ahead", cls: "wt-badge warn", say: row.ahead === 1 ? phrase("{n} commit nobody pushed", { n: row.ahead }) : phrase("{n} commits nobody pushed", { n: row.ahead }) });
  if (row.locked) badges.push({ key: "locked", cls: "wt-badge", say: phrase("locked on purpose") });
  return badges;
}

function worktreeRowModel(row, biggest) {
  return {
    key: row.path, path: row.path, head: row.branch || row.head,
    idle: row.idle ? "yes" : "no", live: row.seat ? "yes" : "no",
    badges: worktreeBadgeList(row),
    copyHint: phrase("click to copy the path"),
    size: row.gone ? phrase("nothing on disk") : row.bytes === null ? phrase("measuring…") : bytes(row.bytes),
    share: row.bytes && biggest ? Math.max(2, Math.round((row.bytes / biggest) * 100)) : 0,
    when: row.gone
      ? phrase("only the admin folder is left")
      : row.touched ? phrase("touched {when} ago", { when: ago(new Date(row.touched).toISOString()) }) : phrase("never read"),
    busy: st.wtBusy === row.path,
    delSay: st.wtBusy === row.path ? phrase("going…") : phrase("delete")
  };
}

function worktreesViewModel() {
  const title = phrase("Worktrees on this machine");
  if (!st.wt) return { top: null, title, note: phrase("asking every repo which worktrees it is holding…") };
  const rows = st.wt.trees || [];
  const biggest = Math.max(1, ...rows.map((row) => row.bytes || 0));
  const repos = new Set(rows.map((row) => row.repo));
  const top = {
    title, hub: st.wt.hub,
    read: phrase("read at {clock}, again every {n}s", { clock: new Date(st.wt.at).toLocaleTimeString(), n: Math.round(WT_BEAT / 1000) }),
    idleAfter: phrase("idle after"),
    hours: [1, 3, 6, 24].map((n) => ({ key: n, value: String(n), on: n === st.wtHours, say: n === 1 ? phrase("1 hour") : phrase("{n} hours", { n }) })),
    refresh: st.wt.measuring ? phrase("measuring…") : phrase("refresh"),
    closeSay: phrase("close")
  };
  if (!rows.length) return { top, title, tiles: null, none: phrase("No worktree here — every repo is a single checkout.") };
  return {
    top, title,
    tiles: [
      { key: "trees", label: phrase("worktrees"), value: String(rows.length), small: repos.size === 1 ? phrase("in {n} repo", { n: repos.size }) : phrase("in {n} repos", { n: repos.size }) },
      { key: "idle", label: phrase("idle"), value: String(st.wt.idle), small: phrase("{n} of them can go now", { n: st.wt.sweep }) },
      { key: "disk", label: phrase("on disk"), value: st.wt.sized ? bytes(st.wt.bytes) : phrase("measuring…"), small: phrase("{size} in the idle ones", { size: st.wt.sized ? bytes(st.wt.idleBytes) : "…" }) }
    ],
    sweep: {
      off: !st.wt.sweep,
      say: st.wt.sweep
        ? phrase("sweep the {n} idle ones · frees {size}", { n: st.wt.sweep, size: st.wt.sized ? bytes(st.wt.idleBytes) : "…" })
        : phrase("nothing to sweep"),
      says: phrase("Only the folder goes — the branch and its commits stay where they are. A worktree with a seat in it, a file nobody committed, a commit nobody pushed or a lock is never swept.")
    },
    groups: worktreeGroups(rows).map((group) => ({
      key: group.repo, repo: group.repo,
      count: group.rows.length === 1 ? phrase("{n} worktree", { n: group.rows.length }) : phrase("{n} worktrees", { n: group.rows.length }),
      size: bytes(group.bytes),
      rows: group.rows.map((row) => worktreeRowModel(row, biggest))
    }))
  };
}

const cutPath = (path, keep = 52) => {
  const s = String(path || "");
  if (s.length <= keep) return s;
  const tail = s.slice(s.length - Math.ceil(keep * 0.55));
  return `${s.slice(0, keep - tail.length - 1)}…${tail}`;
};

function worktreeStatus(row) {
  if (row.seat) return { dot: "working", say: row.seat };
  if (row.gone) return { badge: true, say: phrase("gone") };
  if (row.loose || row.ahead || row.locked) return { badge: true, say: phrase("kept") };
  if (row.idle) return { dot: "idle", say: phrase("idle") };
  return { say: row.touched ? ago(new Date(row.touched).toISOString()) : "" };
}

const worktreeWindowRow = (row, biggest) => ({ ...worktreeRowModel(row, biggest), here: row.path === st.wtPick, status: worktreeStatus(row) });

function worktreeHeadModel(title) {
  const rows = st.wt?.trees || [];
  return {
    icon: "i-tree", title, closeId: "wt-close", closeSay: phrase("close"),
    count: st.wt ? `${rows.length} · ${st.wt.sized ? bytes(st.wt.bytes) : phrase("measuring…")}` : "",
    search: { placeholder: phrase("Search a branch, a repo or a path"), value: st.wtQuery },
    drop: { label: phrase("idle after"), options: [1, 3, 6, 24].map((n) => ({ key: String(n), on: n === st.wtHours, say: n === 1 ? phrase("idle after 1 hour") : phrase("idle after {n} hours", { n }) })) },
    hints: []
  };
}

function worktreeDetailModel(row, biggest) {
  if (!row) return null;
  const model = worktreeRowModel(row, biggest);
  return {
    key: row.path, head: model.head, path: row.path, pathCut: cutPath(row.path),
    strip: [row.repo, model.size, model.when],
    pathSay: phrase("Path"), copySay: phrase("copy the path"),
    sizeSay: phrase("On disk"), size: model.size, share: model.share,
    whenSay: phrase("Touched"), when: model.when,
    keptSay: phrase("Held by"), badges: model.badges, free: phrase("nothing — it can go")
  };
}

const wtMatches = (row) => {
  const q = st.wtQuery.trim().toLowerCase();
  return !q || `${row.branch || ""} ${row.head || ""} ${row.repo} ${row.path} ${row.seat || ""}`.toLowerCase().includes(q);
};

const wtShown = () => worktreeGroups((st.wt?.trees || []).filter(wtMatches)).flatMap((group) => group.rows);

const wtFoot = () => footModel(panelOf("worktrees"), { icon: "i-tree", title: phrase("Worktrees"), trail: [st.wtPick ? cutPath(st.wtPick, 40) : ""] });

function worktreesWindowModel() {
  const title = phrase("Worktrees on this machine");
  if (!st.wt) {
    return { raycast: true, top: null, title, head: worktreeHeadModel(title), groups: [], detail: null, blank: null, bar: wtFoot(), sweep: { says: "" }, loading: phrase("asking every repo which worktrees it is holding…"), note: phrase("asking every repo which worktrees it is holding…") };
  }
  const shown = wtShown();
  if (!shown.some((row) => row.path === st.wtPick)) st.wtPick = shown[0]?.path || "";
  const model = worktreesViewModel();
  const rows = st.wt.trees || [];
  const biggest = Math.max(1, ...rows.map((row) => row.bytes || 0));
  const chrome = {
    raycast: true, head: worktreeHeadModel(title), loading: "", bar: wtFoot(),
    detail: worktreeDetailModel(shown.find((row) => row.path === st.wtPick), biggest),
    blank: rows.length
      ? { icon: "i-tree", head: phrase("Nothing matches"), say: phrase("No branch, repo or path by that name.") }
      : { icon: "i-tree", head: phrase("No worktree here"), say: phrase("No worktree here — every repo is a single checkout.") }
  };
  if (!rows.length) return { ...model, ...chrome, groups: [], sweep: { says: "" } };
  return {
    ...model,
    ...chrome,
    groups: worktreeGroups(rows.filter(wtMatches)).map((group) => ({
      key: group.repo, repo: group.repo,
      count: group.rows.length === 1 ? phrase("{n} worktree", { n: group.rows.length }) : phrase("{n} worktrees", { n: group.rows.length }),
      size: bytes(group.bytes),
      rows: group.rows.map((row) => worktreeWindowRow(row, biggest))
    }))
  };
}

function sayWorktreeTrouble(said) {
  if (raycastOn()) {
    const title = phrase("Worktrees on this machine");
    return worktreesSolid.show({
      raycast: true, trouble: true, note: said, top: null, title, head: worktreeHeadModel(title), groups: [], detail: null, loading: "", sweep: { says: "" },
      blank: { icon: "i-warn", warn: true, head: phrase("The worktrees did not load"), say: phrase("The server did not answer while asking the repos."), detail: said, copySay: phrase("copy") },
      bar: wtFoot()
    });
  }
  worktreesSolid.show({ trouble: true, note: said, top: null, title: "" });
}

function pickWorktree(path) {
  st.wtPick = path;
  paintWorktrees();
  $("worktrees").querySelector(`[data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "nearest" });
}

function stepWorktree(step) {
  const shown = wtShown();
  if (!shown.length) return;
  const at = shown.findIndex((row) => row.path === st.wtPick);
  pickWorktree(shown[(at + step + shown.length) % shown.length].path);
}

function refreshWorktrees() {
  st.wt = st.wt ? { ...st.wt, measuring: true } : st.wt;
  paintWorktrees();
  return pullWorktrees(true);
}

function worktreeActions() {
  const row = (st.wt?.trees || []).find((one) => one.path === st.wtPick);
  const sweep = st.wt?.sweep ? { key: "sweep", say: phrase("Sweep the {n} idle ones", { n: st.wt.sweep }), icon: "i-close", foot: true, go: () => askWorktreeSweep(null) } : null;
  const refresh = { key: "refresh", say: phrase("Refresh"), icon: "i-reload", combo: { alt: true, shift: true, code: "KeyR" }, foot: true, go: refreshWorktrees };
  if (!row) return [sweep, refresh];
  return [
    { key: "copy", say: phrase("Copy the path"), icon: "i-copy", primary: true, go: () => copyWithWord(null, row.path) },
    sweep, refresh,
    { key: "delete", say: phrase("Delete this worktree"), icon: "i-close", group: phrase("Worktree"), off: st.wtBusy === row.path, go: () => askWorktreeGone(row, null) }
  ];
}

registerPanel("worktrees", {
  el: () => $("worktrees"),
  search: () => $("worktrees").querySelector("[data-pw-search]"),
  list: () => $("worktrees").querySelector(".pw-list"),
  actions: worktreeActions,
  step: stepWorktree,
  subject: () => (st.wt?.trees || []).find((one) => one.path === st.wtPick)?.branch || phrase("Worktrees")
});

solidMounts.push((hive) => {
  worktreesSolid = hive.mountWorktrees($("worktrees"), {
    actions: {
      close: () => closeWorktrees(),
      pick: (path) => { pickWorktree(path); $("worktrees").querySelector("[data-pw-search]")?.focus(); },
      search: (text) => { st.wtQuery = text; paintWorktrees(); },
      drop: (value) => { st.wtHours = Number(value) || 1; pullWorktrees(false); },
      copy: (button, text) => copyWithWord(button, text),
      act: (key) => runAction(panelOf("worktrees"), key),
      more: () => openActions(panelOf("worktrees"))
    }
  });
});

async function askWorktreeGone(row, at) {
  const why = worktreeWhy(row);
  const said = row.gone
    ? phrase("The folder is already gone — this only clears what git still keeps about it.")
    : why
      ? `${why}. ${phrase("The branch keeps every commit, but whatever is only in this folder goes with it.")}`
      : phrase("The branch stays where it is — only the folder goes.");
  const yes = await ask(
    phrase("Delete this worktree?"),
    `<code>${esc(row.path)}</code><br>${said}`,
    row.keep ? phrase("delete anyway") : phrase("delete"),
    { at }
  );
  if (!yes) return;
  st.wtBusy = row.path;
  paintWorktrees();
  try {
    await fetch("/api/worktrees/remove", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: row.path, force: !!row.keep })
    });
  } catch {}
  st.wtBusy = "";
  pullWorktrees(true);
}

async function askWorktreeSweep(at) {
  if (!st.wt?.sweep) return;
  const yes = await ask(
    phrase("Sweep the idle worktrees?"),
    phrase("{n} folders go and {size} comes back. Every branch stays, and anything still holding work is left where it is.", { n: st.wt.sweep, size: st.wt.sized ? bytes(st.wt.idleBytes) : "…" }),
    phrase("sweep them"),
    { at }
  );
  if (!yes) return;
  try {
    await fetch("/api/worktrees/sweep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hours: st.wtHours })
    });
  } catch {}
  pullWorktrees(true);
}

$("worktrees").addEventListener("click", (ev) => {
  if (raycastOn()) return;
  const del = ev.target.closest("[data-del]");
  if (del) {
    const row = (st.wt?.trees || []).find((one) => one.path === del.dataset.del);
    if (row) askWorktreeGone(row, del.getBoundingClientRect());
    return;
  }
  if (ev.target.closest("#wt-sweep")) return askWorktreeSweep(ev.target.getBoundingClientRect());
  if (ev.target.closest("#wt-close")) return closeWorktrees();
  if (ev.target.closest("#wt-refresh")) {
    st.wt = st.wt ? { ...st.wt, measuring: true } : st.wt;
    paintWorktrees();
    return pullWorktrees(true);
  }
  const path = ev.target.closest("[data-copy]");
  if (path) toClipboard(path.dataset.copy);
});

$("worktrees").addEventListener("change", (ev) => {
  if (raycastOn()) return;
  if (ev.target.id !== "wt-hours") return;
  st.wtHours = Number(ev.target.value) || 1;
  pullWorktrees(false);
});

$("rail-wt").addEventListener("click", () => (worktreesOnScreen() ? closeWorktrees() : openWorktrees()));

function openWorktrees() {
  screenOpens();
  releaseKeyboard();
  exitReview?.();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  $("worktrees").hidden = false;
  paintWorktrees();
  if (raycastOn()) $("worktrees").querySelector("[data-pw-search]")?.focus();
  pullWorktrees(false);
  every("worktrees", WT_BEAT, () => pullWorktrees(false));
}

function closeWorktrees() {
  if (raycastOn()) leavePanel($("worktrees"));
  $("worktrees").hidden = true;
  stopBeat("worktrees");
}

followRaycast((on) => {
  $("worktrees").classList.toggle("pw", on);
  if (worktreesSolid && worktreesOnScreen()) paintWorktrees();
});

export { cutPath, pickWorktree, refreshWorktrees, stepWorktree, worktreeActions, worktreeDetailModel, worktreeStatus, worktreesWindowModel, WT_BEAT, WT_MEASURING_BEAT, askWorktreeGone, askWorktreeSweep, closeWorktrees, openWorktrees, paintWorktreeRail, paintWorktrees, pullWorktrees, sayWorktreeTrouble, worktreeBadgeList, worktreeGroups, worktreeRailSolid, worktreeRailViewModel, worktreeRowModel, worktreeWhy, worktreesOnScreen, worktreesSolid, worktreesViewModel };
