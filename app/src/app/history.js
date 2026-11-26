import { $, phrase, st } from "./core.js";
import { pull, releaseKeyboard } from "./focus-navigation.js";
import { ago } from "./pod.js";
import { mountHistory } from "../panels/history.jsx";
import { markUp, rankSessions } from "/assets/archive-search.mjs";

const shortDir = (p) => (p ? String(p).split("/").filter(Boolean).slice(-2).join("/") : "");

const ROWS_AT_ONCE = 80;

st.histSessions = [];

st.histLoading = false;

st.histWatch = null;

st.histDeep = new Map();

st.histPage = 1;

st.histQuery = "";

st.histBringing = new Set();

let histSeq = 0;

let deepSeq = 0;

let deepTimer = null;

let historySolid = null;

const shown = { open: false, list: { count: "", hint: "", rows: [], scanning: false }, sync: { mode: "off" } };

let wordsSaid = { language: null, words: null };

function historyWords() {
  if (wordsSaid.language === st.language && wordsSaid.words) return wordsSaid.words;
  wordsSaid = { language: st.language, words: sayHistoryWords() };
  return wordsSaid.words;
}

function sayHistoryWords() {
  return {
    archive: {
      title: phrase("Past sessions"),
      search: phrase("search title, old title, chat name, prompt or folder…"),
      revive: phrase("revive"),
      reviveSay: phrase("reopens the chat with its whole context, in the same directory, as a new seat — it asks whether you want the native chat or the TUI · esc closes"),
      close: phrase("close")
    },
    preview: { foot: phrase("enter revives · esc closes"), revive: phrase("revive") },
    revive: {
      head: phrase("How should it come back?"),
      native: phrase("native chat"), nativeSay: phrase("the structured seat — markdown, cards, instant commands, questions as buttons"),
      tui: phrase("classic TUI"), tuiSay: phrase("the terminal exactly as this session last saw it"),
      foot: phrase("enter picks the native chat · esc cancels")
    }
  };
}

function historyScreensModel() {
  return {
    open: shown.open, query: st.histQuery, list: shown.list, sync: shown.sync,
    preview: previewModel(), revive: reviveModel(), words: historyWords()
  };
}

function paintHistoryScreens() {
  historySolid?.show(historyScreensModel());
}

const historyOnScreen = () => shown.open;

function closeHistory() {
  closePreview();
  shown.open = false;
  paintHistoryScreens();
}

function renderHistory() {
  shown.list = historyViewModel();
  paintHistoryScreens();
}

function scanningSay() {
  const watch = st.histWatch;
  if (!watch) return "";
  return watch.total
    ? phrase("looking for new chats · {done} of {total}", { done: watch.done.toLocaleString(), total: watch.total.toLocaleString() })
    : phrase("looking for new chats");
}

function countSay(shownRows, matched, asked) {
  const found = asked
    ? phrase("{n} of {total}", { n: matched, total: st.histSessions.length })
    : phrase("{n} sessions", { n: st.histSessions.length });
  const more = shownRows < matched ? phrase("showing the first {n}", { n: shownRows }) : "";
  return [found, more, scanningSay()].filter(Boolean).join(" · ");
}

function historyViewModel() {
  if (st.histLoading) return { count: phrase("reading…"), hint: phrase("reading the archives…"), rows: [], scanning: true };
  const asked = st.histQuery.trim();
  const ranked = rankSessions(st.histSessions, asked, { deep: st.histDeep });
  const page = ranked.slice(0, ROWS_AT_ONCE * st.histPage);
  const count = countSay(page.length, ranked.length, asked);
  if (!ranked.length) {
    return { count, hint: st.histSessions.length ? phrase("nothing matches") : phrase("nothing in the archives yet"), rows: [], scanning: !!st.histWatch };
  }
  return {
    count, hint: "", scanning: !!st.histWatch,
    rows: page.map(({ session: s, order, hit, formerly }) => ({
      key: `${s.where}/${s.id}`, at: order, where: s.where,
      whereSay: s.where === "cloud" ? "cloud" : "local",
      agent: agentOfRow(s),
      agentSay: agentOfRow(s) === "claude" ? "" : agentOfRow(s),
      prompt: s.prompt || "", title: markUp(s.title, asked),
      sub: markUp([s.seat && s.seat !== s.title ? s.seat : "", shortDir(s.cwd), s.prompt ? s.prompt.slice(0, 130) : ""].filter(Boolean).join(" · "), asked),
      formerly: formerly ? markUp(phrase("was called {title}", { title: formerly }), asked) : null,
      hit: hit ? markUp(hit, asked) : null,
      sync: s.sync === "ok" ? { tone: "ok", glyph: "g-working", hint: phrase("already in the sync repo") }
        : s.sync === "behind" ? { tone: "behind", glyph: "g-idle", hint: phrase("not in the sync repo yet — the next sync pushes it") }
        : null,
      when: ago(new Date(s.at).toISOString()),
      peekSay: phrase("preview"), peekHint: phrase("read the conversation before reviving it"),
      down: s.where === "cloud" && agentOfRow(s) === "claude",
      downBusy: st.histBringing.has(`${s.where}/${s.id}`),
      downSay: st.histBringing.has(`${s.where}/${s.id}`) ? phrase("copying it here…") : phrase("continue here"),
      downHint: phrase("copy the transcript off the server and continue it on this machine"),
      reviveSay: phrase("revive")
    }))
  };
}

const agentOfRow = (s) => (s?.agent && s.agent !== "claude" ? String(s.agent) : "claude");

function sayArchivesTrouble(said) {
  shown.list = { ...shown.list, hint: said, rows: [] };
  paintHistoryScreens();
}

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
    if (d.stale) setTimeout(() => { if (seq === histSeq && historyOnScreen()) pullHistory(true); }, quiet ? 1500 : 1000);
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

st.histSyncSetting = false;

st.histSyncTyped = null;

function syncAgo(ms) {
  return ms ? ago(new Date(ms).toISOString()) : "never";
}

function toggleSyncEdit(on) {
  st.histSyncEditing = on;
  renderSyncStrip();
}

function paintSyncStrip() {
  shown.sync = syncStripViewModel();
  if (shown.sync.mode !== "edit") st.histSyncTyped = null;
  paintHistoryScreens();
}

function renderSyncStrip(data) {
  if (data !== undefined) {
    const repoChanged = (data?.local?.repo || "") !== (st.histSync?.local?.repo || "");
    st.histSync = data;
    if (repoChanged) st.histSyncEditing = false;
  }
  paintSyncStrip();
}

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
  return {
    mode: "edit",
    hint: st.histSyncEditing
      ? phrase("point the sync at another private repo — the old one keeps what it already holds")
      : phrase("these transcripts live only where they were born — 31 days, then gone"),
    placeholder: phrase("https://github.com/you/claude-sessions.git"),
    typed: st.histSyncTyped ?? (st.histSyncEditing ? s.local.repo : s.suggestion || ""),
    goBusy: st.histSyncSetting,
    goSay: st.histSyncSetting ? phrase("setting it up — the first push takes a minute…") : phrase("sync to a private GitHub repo"),
    cancelSay: st.histSyncEditing ? phrase("cancel") : ""
  };
}

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
async function forceSync() {
  if (st.histSyncBusy) return;
  st.histSyncBusy = true;
  st.histSyncTrouble = "";
  paintSyncStrip();
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

async function configureSync() {
  const repo = syncStripViewModel().typed?.trim();
  if (!repo || st.histSyncSetting) return;
  st.histSyncSetting = true;
  paintSyncStrip();
  try {
    const r = await (await fetch("/api/session-sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo })
    })).json();
    if (!r.ok) throw new Error(r.error || "?");
  } catch {}
  st.histSyncSetting = false;
  pullSyncStatus();
}

function openHistory() {
  releaseKeyboard();
  shown.open = true;
  st.histQuery = "";
  st.histDeep = new Map();
  st.histPage = 1;
  deepSeq += 1;
  renderHistory();
  $("hist-search").focus();
  pullSyncStatus();
  pullHistory(false);
}

function holdBringing(key, held) {
  const next = new Set(st.histBringing);
  if (held) next.add(key);
  else next.delete(key);
  st.histBringing = next;
  renderHistory();
}

async function bringLocal(at) {
  const s = st.histSessions[at];
  const key = s && `${s.where}/${s.id}`;
  if (!s || st.histBringing.has(key)) return;
  holdBringing(key, true);
  try {
    const r = await (await fetch("/api/bring-local", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: s.id, cwd: s.cwd, title: s.title, structured: true, agent: agentOfRow(s) })
    })).json();
    if (!r.ok) throw new Error(r.error || "?");
    holdBringing(key, false);
    closeHistory();
    pull();
  } catch {
    holdBringing(key, false);
  }
}

st.previewTarget = null;

st.previewRead = { note: "", messages: [] };

function previewModel() {
  const s = st.previewTarget;
  if (!s) return { open: false, title: "", meta: "", note: "", messages: [] };
  return {
    open: true, title: s.title || s.id,
    meta: [shortDir(s.cwd), ago(new Date(s.at).toISOString())].filter(Boolean).join(" · "),
    note: st.previewRead.note, messages: st.previewRead.messages
  };
}

function previewOnScreen() { return !!st.previewTarget; }

function closePreview() {
  st.previewTarget = null;
  paintHistoryScreens();
}

function previewMessages(messages, s) {
  return messages.map((m, i) => ({
    key: String(i), role: m.role === "user" ? "user" : "assistant",
    who: m.role === "user" ? phrase("you") : agentOfRow(s), text: m.text
  }));
}

async function openPreview(i) {
  const s = st.histSessions[i];
  if (!s) return;
  st.previewTarget = s;
  st.previewRead = { note: phrase("reading the conversation…"), messages: [] };
  paintHistoryScreens();
  try {
    const r = await (await fetch(`/api/archive/preview?id=${encodeURIComponent(s.id)}&where=${encodeURIComponent(s.where)}&agent=${encodeURIComponent(agentOfRow(s))}`)).json();
    if (st.previewTarget !== s || !previewOnScreen()) return;
    if (!r.ok) throw new Error(r.error || "?");
    st.previewRead = r.messages.length
      ? { note: "", messages: previewMessages(r.messages, s) }
      : { note: phrase("nothing readable in this transcript"), messages: [] };
    paintHistoryScreens();
    const box = $("hp-msgs");
    box.scrollTop = box.scrollHeight;
  } catch (wrong) {
    if (st.previewTarget !== s || !previewOnScreen()) return;
    st.previewRead = { note: `${phrase("could not read the conversation")}${wrong?.message && wrong.message !== "?" ? ` — ${wrong.message}` : ""}`, messages: [] };
    paintHistoryScreens();
  }
}

st.reviveTarget = null;

function reviveModel() {
  const s = st.reviveTarget;
  return s ? { open: true, title: s.title || s.id } : { open: false, title: "" };
}

function askRevive(s) {
  if (!s) return;
  st.reviveTarget = s;
  paintHistoryScreens();
}

function reviveFromPreview() {
  const s = st.previewTarget;
  if (!s) return;
  closePreview();
  askRevive(s);
}

function closeReviveHow() {
  st.reviveTarget = null;
  paintHistoryScreens();
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
    shown.list = { ...shown.list, count: `${phrase("could not revive it")}${wrong?.message && wrong.message !== "?" ? ` — ${wrong.message}` : ""}` };
    paintHistoryScreens();
  }
}

function searchDeeper() {
  const asked = st.histQuery.trim();
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

function moreRows(list = $("hist-list")) {
  if (list.scrollTop + list.clientHeight < list.scrollHeight - 240) return;
  if (st.histPage * ROWS_AT_ONCE >= st.histSessions.length) return;
  st.histPage += 1;
  renderHistory();
}

function searchTyped(text = st.histQuery) {
  st.histQuery = text;
  st.histPage = 1;
  renderHistory();
  clearTimeout(deepTimer);
  deepTimer = setTimeout(searchDeeper, 180);
}

historySolid = mountHistory($("history-screens"), {
  actions: {
    close: () => closeHistory(),
    search: (text) => searchTyped(text),
    scrolled: (list) => moreRows(list),
    peek: (at) => openPreview(at),
    down: (at) => bringLocal(at),
    revive: (at) => askRevive(st.histSessions[at]),
    closePreview: () => closePreview(),
    reviveFromPreview: () => reviveFromPreview(),
    closeRevive: () => closeReviveHow(),
    reviveAs: (structured) => reviveAs(structured),
    syncTyped: (text) => { st.histSyncTyped = text; },
    syncGo: () => configureSync(),
    syncNow: () => forceSync(),
    syncEdit: (on) => toggleSyncEdit(on)
  }
});

paintHistoryScreens();

$("btn-history").addEventListener("click", () => (historyOnScreen() ? closeHistory() : openHistory()));

export { agentOfRow, bringLocal, closeHistory, closePreview, closeReviveHow, configureSync, forceSync, histSeq, historyOnScreen, historyScreensModel, historySolid, historyViewModel, openHistory, openPreview, previewOnScreen, pullHistory, pullSyncStatus, renderHistory, renderSyncStrip, reviveAs, reviveFromPreview, moreRows, sayArchivesTrouble, searchDeeper, searchTyped, shortDir, syncAgo, syncStripViewModel, toggleSyncEdit };
