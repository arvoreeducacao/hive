import { $, esc, phrase, raycastOn, solidMounts, st } from "./core.js";
import { pull, releaseKeyboard } from "./focus-navigation.js";
import { keyHint } from "./leader-key.js";
import { palOn, palPaint } from "./palette.js";
import { ago } from "./pod.js";
import { markUp, rankSessions } from "/assets/archive-search.mjs";

const shortDir = (p) => (p ? String(p).split("/").filter(Boolean).slice(-2).join("/") : "");

const ROWS_AT_ONCE = 80;

st.histSessions = [];

st.histLoading = false;

st.histWatch = null;

st.histDeep = new Map();

st.histPage = 1;

let histSeq = 0;

let deepSeq = 0;

let deepTimer = null;

function closeHistory() {
  if (typeof closePreview === "function") closePreview();
  $("history").classList.remove("on");
}

function renderHistory() {
  const model = historyViewModel();
  $("hist-count").textContent = model.count;
  historySolid.show(model);
  for (const one of $("hist-list").querySelectorAll("[data-down]")) {
    one.disabled = false;
    one.textContent = model.rows.find((row) => row.at === Number(one.dataset.down))?.downSay ?? one.textContent;
  }
}

let historySolid = null;

function scanningSay() {
  const watch = st.histWatch;
  if (!watch) return "";
  return watch.total
    ? phrase("looking for new chats · {done} of {total}", { done: watch.done.toLocaleString(), total: watch.total.toLocaleString() })
    : phrase("looking for new chats");
}

function countSay(shown, matched, asked) {
  const found = asked
    ? phrase("{n} of {total}", { n: matched, total: st.histSessions.length })
    : phrase("{n} sessions", { n: st.histSessions.length });
  const more = shown < matched ? phrase("showing the first {n}", { n: shown }) : "";
  return [found, more, scanningSay()].filter(Boolean).join(" · ");
}

function historyViewModel() {
  if (st.histLoading) return { count: phrase("reading…"), hint: phrase("reading the archives…"), rows: [], scanning: true };
  const asked = $("hist-search").value.trim();
  const ranked = rankSessions(st.histSessions, asked, { deep: st.histDeep });
  const shown = ranked.slice(0, ROWS_AT_ONCE * st.histPage);
  const count = countSay(shown.length, ranked.length, asked);
  if (!ranked.length) {
    return { count, hint: st.histSessions.length ? phrase("nothing matches") : phrase("nothing in the archives yet"), rows: [], scanning: !!st.histWatch };
  }
  return {
    count, hint: "", scanning: !!st.histWatch,
    rows: shown.map(({ session: s, order, hit }) => ({
      key: `${s.where}/${s.id}`, at: order, where: s.where,
      whereSay: s.where === "cloud" ? "cloud" : "local",
      agent: agentOfRow(s),
      agentSay: agentOfRow(s) === "claude" ? "" : agentOfRow(s),
      prompt: s.prompt || "", title: markUp(s.title, asked),
      sub: markUp(`${shortDir(s.cwd)}${s.prompt ? ` · ${s.prompt.slice(0, 130)}` : ""}`, asked),
      hit: hit ? markUp(hit, asked) : null,
      sync: s.sync === "ok" ? { tone: "ok", glyph: "g-working", hint: phrase("already in the sync repo") }
        : s.sync === "behind" ? { tone: "behind", glyph: "g-idle", hint: phrase("not in the sync repo yet — the next sync pushes it") }
        : null,
      when: ago(new Date(s.at).toISOString()),
      peekSay: phrase("preview"), peekHint: phrase("read the conversation before reviving it"),
      down: s.where === "cloud" && agentOfRow(s) === "claude",
      downSay: phrase("continue here"), downHint: phrase("copy the transcript off the server and continue it on this machine"),
      reviveSay: phrase("revive")
    }))
  };
}

const agentOfRow = (s) => (s?.agent && s.agent !== "claude" ? String(s.agent) : "claude");

function sayArchivesTrouble(said) {
  historySolid.show({ count: $("hist-count").textContent, hint: said, rows: [] });
}

solidMounts.push((hive) => {
  historySolid = hive.mountHistory($("hist-list"));
});

function pullHistory(quiet, fresh) {
  const seq = ++histSeq;
  if (!quiet) {
    st.histLoading = !st.histSessions.length;
    renderHistory();
  }
  return fetch(fresh ? "/api/archive?fresh=1" : "/api/archive").then((r) => r.json()).then((d) => {
    if (seq !== histSeq) return;
    st.histLoading = false;
    const next = d.sessions || [];
    const watch = d.stale ? d.watch || { done: 0, total: 0 } : null;
    const changed = JSON.stringify(next) !== JSON.stringify(st.histSessions) || JSON.stringify(watch) !== JSON.stringify(st.histWatch);
    st.histSessions = next;
    st.histWatch = watch;
    if (!quiet || changed) renderHistory();
    if (d.stale) setTimeout(() => { if (seq === histSeq && $("history").classList.contains("on")) pullHistory(true); }, quiet ? 1500 : 1000);
  }).catch(() => {
    if (seq !== histSeq) return;
    st.histLoading = false;
    if (!quiet) sayArchivesTrouble(phrase("could not read the archives"));
  });
}

st.histSync = undefined;

st.histSyncEditing = false;

st.histSyncTrouble = "";

st.histSyncBusy = false;

function syncAgo(ms) {
  return ms ? ago(new Date(ms).toISOString()) : "never";
}

function toggleSyncEdit(on) {
  st.histSyncEditing = on;
  renderSyncStrip();
}

function renderSyncStrip(data) {
  if (data !== undefined) {
    const repoChanged = (data?.local?.repo || "") !== (st.histSync?.local?.repo || "");
    st.histSync = data;
    if (repoChanged) st.histSyncEditing = false;
  }
  const model = syncStripViewModel();
  syncStripSolid.show(model);
  const now = $("sync-now");
  if (now) { now.disabled = !!model.busy; now.textContent = model.nowSay; }
  const go = $("sync-go");
  if (go) { go.disabled = false; go.textContent = model.goSay; }
}

let syncStripSolid = null;

function syncStripViewModel() {
  if (!st.histSync || !st.histSync.engine || !st.histSync.local) return { mode: "off" };
  const s = st.histSync;
  if (s.local.repo && !st.histSyncEditing) {
    return {
      mode: "set",
      lead: phrase("every transcript here also lives in"),
      repo: s.local.repo.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, ""),
      local: phrase("this machine synced {when}", { when: syncAgo(s.local.lastSync) }),
      pod: s.cloud === "probing" ? phrase("server checking…")
        : s.cloud === null ? phrase("server asleep")
        : s.cloud.repo ? phrase("pod {when}", { when: syncAgo(s.cloud.lastSync) }) : phrase("server not set up yet"),
      trouble: st.histSyncTrouble || "",
      busy: st.histSyncBusy,
      nowSay: st.histSyncBusy ? phrase("syncing…") : phrase("sync now"),
      nowHint: phrase("push and pull every transcript now — this machine and the server"),
      changeSay: phrase("change")
    };
  }
  const typed = $("hist-sync").querySelector?.("#sync-repo")?.value?.trim() || "";
  return {
    mode: "edit",
    hint: st.histSyncEditing
      ? phrase("point the sync at another private repo — the old one keeps what it already holds")
      : phrase("these transcripts live only where they were born — 31 days, then gone"),
    placeholder: phrase("https://github.com/you/claude-sessions.git"),
    typed: typed || (st.histSyncEditing ? s.local.repo : s.suggestion || ""),
    goSay: phrase("sync to a private GitHub repo"),
    cancelSay: st.histSyncEditing ? phrase("cancel") : ""
  };
}

solidMounts.push((hive) => {
  syncStripSolid = hive.mountSyncStrip($("hist-sync"));
});

function pullSyncStatus() {
  let settled = false;
  fetch("/api/session-sync?fast=1").then((r) => r.json()).then((d) => { if (!settled) renderSyncStrip(d); }).catch(() => {});
  return fetch("/api/session-sync").then((r) => r.json()).then((d) => { settled = true; renderSyncStrip(d); })
    .catch(() => { settled = true; renderSyncStrip(null); });
}

/* the button used to swallow whatever came back and put its own label on again,
   so a sync that failed looked exactly like one that worked. And the list it
   asked for afterwards was the cached one — the same snapshot that sent the
   person to press the button, since expiring the archive's clock starts no scan
   on its own: only a read does. It asks for a real scan now, holds itself shut
   until that lands, and says so when the sync could not run. */
async function forceSync(btn) {
  if (st.histSyncBusy) return;
  st.histSyncBusy = true;
  st.histSyncTrouble = "";
  btn.disabled = true;
  btn.textContent = phrase("syncing…");
  try {
    const r = await (await fetch("/api/session-sync/run", { method: "POST" })).json();
    if (!r.ok) throw new Error(r.error || "?");
  } catch (wrong) {
    st.histSyncTrouble = phrase("the sync did not run — {why}", { why: String(wrong?.message || wrong).slice(0, 200) });
  }
  await pullSyncStatus();
  try {
    await pullHistory(true, true);
  } finally {
    st.histSyncBusy = false;
    renderSyncStrip();
  }
}

async function configureSync(btn) {
  const repo = $("sync-repo").value.trim();
  if (!repo) return;
  btn.disabled = true;
  btn.textContent = phrase("setting it up — the first push takes a minute…");
  try {
    const r = await (await fetch("/api/session-sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo })
    })).json();
    if (!r.ok) throw new Error(r.error || "?");
  } catch {}
  pullSyncStatus();
}

function openHistory() {
  releaseKeyboard();
  $("history").classList.add("on");
  $("hist-search").value = "";
  st.histDeep = new Map();
  st.histPage = 1;
  deepSeq += 1;
  $("hist-search").focus();
  pullSyncStatus();
  pullHistory(false);
}

async function bringLocal(btn) {
  const s = st.histSessions[Number(btn.dataset.down)];
  if (!s) return;
  btn.disabled = true;
  btn.textContent = phrase("copying it here…");
  try {
    const r = await (await fetch("/api/bring-local", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, cwd: s.cwd, title: s.title, structured: true, agent: agentOfRow(s) })
    })).json();
    if (!r.ok) throw new Error(r.error || "?");
    closeHistory();
    pull();
  } catch {
    btn.disabled = false;
    btn.textContent = phrase("continue here");
  }
}

$("hist-list").addEventListener("click", async (e) => {
  const down = e.target.closest("[data-down]");
  if (down) return bringLocal(down);
  const peek = e.target.closest("[data-peek]");
  if (peek) return openPreview(Number(peek.dataset.peek));
  const btn = e.target.closest(".hist-revive");
  if (!btn) return;
  const s = st.histSessions[Number(btn.dataset.i)];
  if (!s) return;
  st.reviveTarget = s;
  $("rh-title").textContent = s.title || s.id;
  $("revive-how").classList.add("on");
});

st.previewTarget = null;

function previewOnScreen() { return $("hist-preview").classList.contains("on"); }

function closePreview() {
  st.previewTarget = null;
  $("hist-preview").classList.remove("on");
}

async function openPreview(i) {
  const s = st.histSessions[i];
  if (!s) return;
  st.previewTarget = s;
  $("hp-title").textContent = s.title || s.id;
  $("hp-meta").textContent = [shortDir(s.cwd), ago(new Date(s.at).toISOString())].filter(Boolean).join(" · ");
  $("hp-msgs").innerHTML = `<p class="hint">${phrase("reading the conversation…")}</p>`;
  $("hist-preview").classList.add("on");
  try {
    const r = await (await fetch(`/api/archive/preview?id=${encodeURIComponent(s.id)}&where=${encodeURIComponent(s.where)}&agent=${encodeURIComponent(agentOfRow(s))}`)).json();
    if (st.previewTarget !== s || !previewOnScreen()) return;
    if (!r.ok) throw new Error(r.error || "?");
    $("hp-msgs").innerHTML = r.messages.length
      ? r.messages.map((m) => `<div class="hp-msg ${m.role === "user" ? "user" : "assistant"}"><b>${m.role === "user" ? esc(phrase("you")) : esc(agentOfRow(s))}</b><span>${esc(m.text)}</span></div>`).join("")
      : `<p class="hint">${phrase("nothing readable in this transcript")}</p>`;
    $("hp-msgs").scrollTop = $("hp-msgs").scrollHeight;
  } catch (wrong) {
    if (st.previewTarget !== s || !previewOnScreen()) return;
    $("hp-msgs").innerHTML = `<p class="hint">${phrase("could not read the conversation")}${wrong?.message && wrong.message !== "?" ? ` — ${esc(wrong.message)}` : ""}</p>`;
  }
}

$("hp-revive").addEventListener("click", () => {
  const s = st.previewTarget;
  if (!s) return;
  closePreview();
  st.reviveTarget = s;
  $("rh-title").textContent = s.title || s.id;
  $("revive-how").classList.add("on");
});

$("hist-preview").addEventListener("click", (e) => { if (e.target === $("hist-preview")) closePreview(); });

st.reviveTarget = null;

function closeReviveHow() {
  st.reviveTarget = null;
  $("revive-how").classList.remove("on");
}

async function reviveAs(structured) {
  const s = st.reviveTarget;
  if (!s) return;
  closeReviveHow();
  try {
    const r = await (await fetch("/api/revive", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, where: s.where, cwd: s.cwd, title: s.title, structured, agent: agentOfRow(s), model: s.model || "" })
    })).json();
    if (!r.ok) throw new Error(r.error || "?");
    closeHistory();
    pull();
  } catch (wrong) {
    $("hist-count").textContent = `${phrase("could not revive it")}${wrong?.message && wrong.message !== "?" ? ` — ${wrong.message}` : ""}`;
  }
}

$("rh-native").addEventListener("click", () => reviveAs(true));

$("rh-tui").addEventListener("click", () => reviveAs(false));

$("revive-how").addEventListener("click", (e) => { if (e.target === $("revive-how")) closeReviveHow(); });

$("hist-sync").addEventListener("click", (e) => {
  if (e.target.closest("#sync-change")) return toggleSyncEdit(true);
  if (e.target.closest("#sync-cancel")) return toggleSyncEdit(false);
  const now = e.target.closest("#sync-now");
  if (now && !now.disabled) return forceSync(now);
  const btn = e.target.closest("#sync-go");
  if (btn) configureSync(btn);
});

$("hist-sync").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "sync-repo") $("sync-go")?.click();
});

function searchDeeper() {
  const asked = $("hist-search").value.trim();
  const seq = ++deepSeq;
  if (asked.length < 3) {
    if (st.histDeep.size) { st.histDeep = new Map(); renderHistory(); }
    return;
  }
  fetch(`/api/archive/search?q=${encodeURIComponent(asked)}`).then((r) => r.json()).then((d) => {
    if (seq !== deepSeq) return;
    const deep = new Map();
    for (const one of d.found || []) deep.set(`local/${one.id}`, one.hit);
    st.histDeep = deep;
    renderHistory();
  }).catch(() => {});
}

function moreRows() {
  const list = $("hist-list");
  if (list.scrollTop + list.clientHeight < list.scrollHeight - 240) return;
  if (st.histPage * ROWS_AT_ONCE >= st.histSessions.length) return;
  st.histPage += 1;
  renderHistory();
}

function searchTyped() {
  st.histPage = 1;
  renderHistory();
  clearTimeout(deepTimer);
  deepTimer = setTimeout(searchDeeper, 180);
}

$("hist-search").addEventListener("input", searchTyped);

$("hist-list").addEventListener("scroll", moreRows);

$("btn-history").addEventListener("click", () => ($("history").classList.contains("on") ? closeHistory() : openHistory()));

document.addEventListener("hive-alerts", (e) => {
  const { count, state, hidden } = e.detail;
  st.alerts = {
    count, state, hidden,
    items: e.detail.items || [],
    automatic: e.detail.automatic || [],
    checked: e.detail.checked || "",
    checking: !!e.detail.checking
  };
  if (palOn()) palPaint();
  if (raycastOn()) return paintRaycastAlerts();
  const b = $("btn-alerts");
  b.style.display = count ? "" : "none";
  $("n-alerts").textContent = count;
  b.classList.toggle("fail", state === "fail");
  b.title = phrase("open the environment panel");
});

function paintRaycastAlerts() {
  const { count, state } = st.alerts;
  const b = $("btn-alerts");
  b.style.display = "";
  b.hidden = !count;
  $("n-alerts").textContent = count;
  const say = $("alerts-say");
  if (say) say.textContent = count === 1 ? phrase("alert") : phrase("alerts");
  b.classList.toggle("fail", state === "fail");
  b.title = `${phrase("open the environment panel")} · ${keyHint("alerts")}`;
}

$("btn-alerts").addEventListener("click", () => window.hiveDoctorOpen?.());

$("hist-ok").addEventListener("click", closeHistory);

$("history").addEventListener("click", (e) => { if (e.target === $("history")) closeHistory(); });

export { agentOfRow, bringLocal, closeHistory, closePreview, closeReviveHow, configureSync, forceSync, histSeq, historySolid, historyViewModel, openHistory, openPreview, previewOnScreen, pullHistory, pullSyncStatus, renderHistory, renderSyncStrip, reviveAs, moreRows, sayArchivesTrouble, searchDeeper, searchTyped, shortDir, syncAgo, syncStripSolid, syncStripViewModel, toggleSyncEdit };
