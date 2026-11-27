import { setFocusMode } from "./seat-layout.js";
import { closeSpace, hideUntilItEnds, hideUntilItWorks, menuKeys, menuMove, menuShow, menuStop, prOfChat, renameSpace, seatMenuRows, spaceCloseNote, threadsOfChat } from "./seat-menu.js";
import { blockNumber, blocksOf, labelOf, ofBlock, openSpace, seatsOf, spaceName, spaceOf } from "./blocks.js";
import { codeOf, keyLabel, modsMatch, saveConfig, whichAction } from "./brand-face.js";
import { setAnswered, setSound } from "./chimes-and-notices.js";
import { $, ACTIONS, ACTION_SAID, DIGIT_ACTIONS, IS_MAC, LABEL, LANGUAGES, esc, phrase, raycastOn, solidMounts, st, stateColor, svgIcon } from "./core.js";
import { openChatFind } from "./chat-find.js";
import { baseName, fileKey, openInEditor } from "./files-editor.js";
import { goTo, goToBlock, goToSpace, releaseKeyboard } from "./focus-navigation.js";
import { shortDir } from "./history.js";
import { keyCaps, keyHint, keyParts } from "./leader-key.js";
import { archiveSeatNow, focusedSeat, reviveArchived } from "./mirror.js";
import { openArchived } from "./archived.js";
import { closeMore } from "./new-chat.js";
import { ago, openWorkspace } from "./pod.js";
import { PET_OFF, PET_ON, PET_SWITCH, setLanguage, setPet } from "./preferences.js";
import { CI_LABEL } from "./prs.js";
import { foldText, markWords, noteOpen, openedOften, rankRows, rankThreads, readOpens, recentThreads, searchWords } from "./palette-search.js";
import { paintMachines, paintPhone, paintShare, palAt, setPref } from "./pure-helpers.js";
import { askNewChat, openDraft } from "./draft-seat.js";
import { focusAfterPalette } from "./composer-focus.js";
import { hudCopied } from "./hud.js";
import { pullTeam } from "./team.js";
import { toClipboard } from "./terminal-history.js";
import { openHelp, openThemes, restoreDefaultTheme, run, setTheme, showPrefPane, themeChoices, THEME_RESCUE_KEY } from "./themes.js";
import { homeless } from "./tool-face.js";
import { openPrs, openShell } from "./thread.js";
import { openWorktrees } from "./worktrees.js";
import { pullExtensions } from "./extensions.js";
import { structPool } from "./structured-seats.js";
import { lucide } from "./lucide.js";
import { hitMatcher } from "/assets/code-search.mjs";
import { promptLinkOpenRow, promptLinkPaletteRows } from "./prompt-links.js";
import { promptSuggestionRows } from "./composer-next-prompt.js";

st.palMode = "";

st.palFiles = { q: "", rows: [], loading: false, total: 0, at: 0, error: "" };

st.palHits = { q: "", rows: [], loading: false, ms: 0, error: "", problem: "" };

const PAL_SEARCH_KEY = "hive.codeSearch";

const PAL_SEARCH_OPTIONS = [["matchCase", "caseSensitive", "KeyC"], ["wholeWord", "wholeWord", "KeyW"], ["regex", "regex", "KeyR"]];

function readPalSearch() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PAL_SEARCH_KEY) || "{}") || {}; } catch {}
  return { matchCase: saved.matchCase === true, wholeWord: saved.wholeWord === true, regex: saved.regex === true };
}

st.palSearch = readPalSearch();

st.palPrev = { key: "", at: 0, lines: [], loading: false, error: "" };

let palTimer = null;

let palPrevTimer = null;

let palSeq = 0;

let palPrevSeq = 0;

const PAL_PLACEHOLDER = {
  "": "Search commands, chats, and settings…",
  theme: "Search themes…",
  file: "part of a path — cron-lock, service.ts, src/shared…",
  code: "a piece of code — runExclusively(, LOCK_PREFIX…",
  linear: "part of the title or the key — PED-661…"
};

st.palLinear = { rows: [], loading: false, error: "", at: 0, me: "" };

st.palMessages = { q: "", rows: [], loading: false, error: "" };

let palMessageTimer = null;

let palMessageSeq = 0;

const RECENT_CHATS = 12;

const CHATS_FOUND = 20;

const MESSAGE_ROWS = 6;

const WIDE_MODES = new Set(["file", "code", "linear"]);

const palSides = () => ["local", ...(st.data.pod?.up ? ["cloud"] : [])];

function setPalMode(mode) {
  st.palMode = mode || "";
  st.palSel = 0;
  st.palSelId = "";
  st.palPrev = { key: "", at: 0, lines: [], loading: false, error: "" };
  $("pal").classList.toggle("wide", WIDE_MODES.has(st.palMode));
  $("pal-scope").textContent = st.palMode === "file" ? phrase("open file") : st.palMode === "code" ? phrase("search code") : st.palMode === "linear" ? phrase("Linear issue") : st.palMode === "theme" ? phrase("change theme") : phrase("everything");
  if (raycastOn()) $("pal-scope").innerHTML = `<span>${esc($("pal-scope").textContent)}</span>`;
  $("pal-scope").classList.toggle("lit", !!st.palMode);
  $("pal-q").placeholder = phrase(PAL_PLACEHOLDER[st.palMode] || PAL_PLACEHOLDER[""]);
  $("pal-list").dataset.h = "";
  paintPalOptions();
  palPaint();
  if (WIDE_MODES.has(st.palMode)) palAsk(true);
  $("pal-q").focus();
}

const palOptionSaid = (key) => (key === "matchCase" ? phrase("Match case") : key === "wholeWord" ? phrase("Match whole word") : phrase("Use regular expression"));

function palOptionsHost() {
  let host = $("pal-opts");
  if (host) return host;
  $("pal-scope").insertAdjacentHTML("beforebegin", '<span class="pal-opts" id="pal-opts" role="group" hidden></span>');
  host = $("pal-opts");
  host.addEventListener("mousedown", (e) => e.preventDefault());
  host.addEventListener("click", (e) => {
    const hit = e.target.closest("[data-opt]");
    if (hit) togglePalOption(hit.dataset.opt);
  });
  return host;
}

function paintPalOptions() {
  const host = palOptionsHost();
  host.hidden = st.palMode !== "code";
  host.setAttribute("aria-label", phrase("Search options"));
  const html = PAL_SEARCH_OPTIONS.map(([key, icon, code]) => {
    const said = palOptionSaid(key);
    const keys = `${IS_MAC ? "⌥" : "Alt+"}${code.slice(3)}`;
    return `<button type="button" class="pal-opt" data-opt="${key}" aria-pressed="${st.palSearch[key]}" aria-label="${esc(said)}" title="${esc(`${said} (${keys})`)}">${lucide(icon)}</button>`;
  }).join("");
  if (host.dataset.h !== html) { host.innerHTML = html; host.dataset.h = html; }
}

function togglePalOption(key) {
  if (!(key in st.palSearch)) return;
  st.palSearch = { ...st.palSearch, [key]: !st.palSearch[key] };
  try { localStorage.setItem(PAL_SEARCH_KEY, JSON.stringify(st.palSearch)); } catch {}
  paintPalOptions();
  if (st.palMode === "code") palAsk(true);
  palPaint();
}

function palOptionKey(e) {
  if (st.palMode !== "code" || !e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return "";
  return PAL_SEARCH_OPTIONS.find((one) => one[2] === codeOf(e))?.[0] || "";
}

const palSearchQuery = () => `&case=${st.palSearch.matchCase ? 1 : 0}&word=${st.palSearch.wholeWord ? 1 : 0}&regex=${st.palSearch.regex ? 1 : 0}`;

function palAsk(now) {
  clearTimeout(palTimer);
  const q = $("pal-q").value.trim();
  if (st.palMode === "file") {
    st.palFiles.loading = true;
    palTimer = setTimeout(() => palList(q), now ? 0 : 110);
  } else if (st.palMode === "code") {
    st.palHits.loading = q.length >= 2;
    st.palHits.rows = q.length >= 2 ? st.palHits.rows : [];
    palTimer = setTimeout(() => palGrep(q), now ? 0 : 280);
  } else if (st.palMode === "linear") {
    if (now || !st.palLinear.at) palLinearList();
  } else if (!st.palMode) {
    clearTimeout(palMessageTimer);
    const asked = q.startsWith(">") ? "" : q.toLowerCase();
    if (searchWords(asked).some((word) => word.length >= 2)) {
      if (st.palMessages.q !== asked) st.palMessages = { ...st.palMessages, loading: true };
      palMessageTimer = setTimeout(() => palMessageList(asked), now ? 0 : 250);
    } else st.palMessages = { q: "", rows: [], loading: false, error: "" };
  }
}

async function palMessageList(q) {
  const mine = ++palMessageSeq;
  const names = (st.data?.sessions || []).filter((s) => s.where !== "cloud" && s.name).map((s) => s.name);
  if (!names.length) { st.palMessages = { q, rows: [], loading: false, error: "" }; return palOn() && !st.palMode && palPaint(); }
  const res = await fetch(`/api/chat/messages/search?q=${encodeURIComponent(q)}&names=${encodeURIComponent(names.join(","))}`).catch(() => null);
  const got = res ? await res.json().catch(() => null) : null;
  if (mine !== palMessageSeq) return;
  st.palMessages = { q, rows: got?.matches || [], loading: false, error: !got ? phrase("could not reach the server") : got.error || "" };
  if (palOn() && !st.palMode) palPaint();
}

async function palLinearList(force = false) {
  if (st.palLinear.at && !force && Date.now() - st.palLinear.at < 60000) return;
  st.palLinear = { ...st.palLinear, loading: true, error: "" };
  if (palOn() && st.palMode === "linear") palPaint();
  const res = await fetch(`/api/ext/linear/mine${force ? "?force=1" : ""}`).catch(() => null);
  const got = res ? await res.json().catch(() => null) : null;
  st.palLinear = {
    rows: got?.issues || [], me: got?.me || "", loading: false, at: Date.now(),
    error: !res ? phrase("could not reach the server") : got?.error || ""
  };
  if (palOn() && st.palMode === "linear") palPaint();
}

const LINEAR_PRIORITY = ["", "urgent", "high", "medium", "low"];

function palLinearRows(q) {
  const hit = (i) => !q || `${i.identifier} ${i.title} ${i.project} ${i.state}`.toLowerCase().includes(q.toLowerCase());
  const rows = st.palLinear.rows.filter(hit).map((i) => ({
    id: `li:${i.identifier}`,
    icon: "i-list",
    name: `${i.identifier} · ${i.title}`,
    ctx: [i.state, i.project, LINEAR_PRIORITY[i.priority] ? phrase(LINEAR_PRIORITY[i.priority]) : "", i.branch].filter(Boolean).join(" · "),
    tag: i.images?.length ? phrase("images") : "",
    go: () => openDraft(`${i.identifier} `)
  }));
  const head = st.palLinear.me ? `linear · ${phrase("assigned to {me}", { me: st.palLinear.me })}${st.palLinear.loading ? ` · ${phrase("looking…")}` : ""}` : "linear";
  if (rows.length) return [{ sec: head }, ...rows];
  return [{ sec: head }, {
    id: "li:none", icon: "i-list", quiet: true,
    name: st.palLinear.loading ? phrase("looking…") : st.palLinear.error ? st.palLinear.error : q ? phrase("nothing assigned to you answers to “{q}”", { q }) : phrase("nothing open is assigned to you"),
    ctx: st.palLinear.error ? phrase("the chat still starts from an issue if you type its key first — PED-661 and the mission") : phrase("pick one and the chat opens with the issue: title, description, images and the branch Linear suggests"),
    go: () => {}
  }];
}

async function palList(q) {
  const mine = ++palSeq;
  const found = [];
  let total = 0;
  await Promise.all(palSides().map(async (where) => {
    const res = await fetch(`/api/index?where=${where}&q=${encodeURIComponent(q)}&limit=24`).catch(() => null);
    const got = res && res.ok ? await res.json().catch(() => null) : null;
    if (!got || mine !== palSeq) return;
    total += got.total || 0;
    found.push(...(got.files || []));
    st.palFiles = { q, rows: [...found], loading: false, total, at: got.at, error: "" };
    if (palOn() && st.palMode === "file") palPaint();
  }));
  if (mine !== palSeq) return;
  st.palFiles = { ...st.palFiles, q, loading: false };
  if (palOn() && st.palMode === "file") palPaint();
}

async function palGrep(q) {
  const mine = ++palSeq;
  if (q.length < 2) { st.palHits = { q, rows: [], loading: false, ms: 0, error: "", problem: "" }; return palOn() && palPaint(); }
  const started = Date.now();
  const found = [];
  let problem = "";
  const options = palSearchQuery();
  await Promise.all(palSides().map(async (where) => {
    const res = await fetch(`/api/code?where=${where}&q=${encodeURIComponent(q)}${options}`).catch(() => null);
    const got = res && res.ok ? await res.json().catch(() => null) : null;
    if (!got || mine !== palSeq) return;
    found.push(...(got.hits || []));
    problem = problem || String(got.problem || "");
    st.palHits = { q, rows: [...found], loading: false, ms: Date.now() - started, error: "", problem: found.length ? "" : problem };
    if (palOn() && st.palMode === "code") palPaint();
  }));
  if (mine !== palSeq) return;
  st.palHits = { ...st.palHits, q, loading: false, ms: Date.now() - started };
  if (palOn() && st.palMode === "code") palPaint();
}

function palFileRows(q) {
  const rows = st.palFiles.rows.map((f) => ({
    id: `pf:${fileKey(f)}`,
    icon: "i-file",
    name: baseName(f.path),
    ctx: `${f.name}${f.branch ? ` · ${f.branch}` : ""} · ${f.path}`,
    tag: f.where === "cloud" ? "pod" : "",
    note: f.copies > 1 ? `+${f.copies - 1}` : "",
    file: f,
    go: (opts) => openInEditor(f, opts)
  }));
  if (rows.length) return [{ sec: `${phrase("files")} · ${phrase("{n} indexed", { n: st.palFiles.total.toLocaleString() })}${st.palFiles.loading ? ` · ${phrase("looking")}` : ""}` }, ...rows];
  return [{ sec: phrase("files") }, {
    id: "pf:none", icon: "i-file", quiet: true,
    name: st.palFiles.loading ? phrase("looking…") : q ? phrase("nothing in the index answers to “{q}”", { q: q }) : phrase("type part of a path"),
    ctx: st.palFiles.total ? phrase("{n} files indexed", { n: st.palFiles.total.toLocaleString() }) : phrase("the index is being built — a moment"),
    go: () => {}
  }];
}

function palCodeRows(q) {
  const matcher = hitMatcher(q, st.palSearch);
  const rows = st.palHits.rows.map((h, i) => ({
    id: `pc:${h.where}|${h.repo}|${h.path}|${h.line}|${i}`,
    icon: "i-mag",
    name: h.text.trim(),
    mono: true,
    mark: q,
    markRe: matcher,
    ctx: `${h.name} · ${h.path}:${h.line}`,
    tag: h.where === "cloud" ? "pod" : "",
    file: { ...h, name: h.name },
    go: (opts) => openInEditor({ ...h, line: h.line }, opts)
  }));
  const head = st.palHits.loading
    ? phrase("searching…")
    : q.length < 2 ? phrase("type at least two characters")
      : `${st.palHits.rows.length}${st.palHits.rows.length >= 200 ? "+" : ""} hits · ${st.palHits.ms} ms`;
  if (rows.length) return [{ sec: `${phrase("code")} · ${head}` }, ...rows];
  if (st.palHits.problem && !st.palHits.loading && q.length >= 2) {
    return [{ sec: `${phrase("code")} · ${phrase("invalid regular expression")}` }, {
      id: "pc:problem", icon: "i-mag", quiet: true, name: st.palHits.problem,
      ctx: phrase("fix the pattern, or turn off the regular expression"), go: () => {}
    }];
  }
  return [{ sec: phrase("code") }, {
    id: "pc:none", icon: "i-mag", quiet: true,
    name: st.palHits.loading ? phrase("searching…") : q.length < 2 ? phrase("type at least two characters") : phrase("no line in the repos says “{q}”", { q: q }),
    ctx: phrase("git grep, in every repo the index knows — the .gitignore of each one is honoured"),
    go: () => {}
  }];
}

function linearOn() {
  return (st.extensions || []).some((one) => one.name === "linear" && one.on);
}

function palPreviewAsk() {
  if (!WIDE_MODES.has(st.palMode)) return raycastOn() ? paintPalPreview() : undefined;
  const row = st.palRows.filter((r) => !r.sec)[st.palSel];
  const file = row?.file;
  const key = file ? `${fileKey(file)}|${file.line || 0}` : "";
  if (key === st.palPrev.key) return;
  clearTimeout(palPrevTimer);
  const mine = ++palPrevSeq;
  st.palPrev = { key, at: Number(file?.line) || 0, from: 1, lines: [], loading: !!file, error: "" };
  paintPalPreview();
  if (!file) return;
  palPrevTimer = setTimeout(async () => {
    const at = `/api/file?preview=1&where=${file.where}&repo=${encodeURIComponent(file.repo)}&path=${encodeURIComponent(file.path)}&at=${file.line || 0}`;
    const res = await fetch(at).catch(() => null);
    const got = res ? await res.json().catch(() => null) : null;
    if (mine !== palPrevSeq) return;
    st.palPrev = got && !got.error
      ? { key, at: Number(file.line) || 0, from: got.from || 1, lines: got.preview || [], loading: false, error: "" }
      : { key, at: 0, from: 1, lines: [], loading: false, error: got?.error || phrase("could not read it") };
    paintPalPreview();
  }, 120);
}

function paintPalPreview() {
  palPreviewSolid.show(palPreviewViewModel());
  $("pal-prev")?.querySelector(".pv-line.on")?.scrollIntoView({ block: "center" });
}

let palPreviewSolid = null;

function palPreviewViewModel() {
  if (!WIDE_MODES.has(st.palMode) && raycastOn()) return palDetailModel();
  if (!WIDE_MODES.has(st.palMode)) return { mode: "off", note: "", lines: [] };
  if (st.palPrev.loading) return { mode: "note", note: phrase("reading…"), lines: [] };
  if (st.palPrev.error) return { mode: "note", note: st.palPrev.error, lines: [] };
  if (!st.palPrev.lines.length) return { mode: "note", note: phrase("the preview shows up here"), lines: [] };
  const from = st.palPrev.from || 1;
  return {
    mode: "lines", note: "",
    lines: st.palPrev.lines.map((line, i) => ({ key: from + i, n: from + i, on: from + i === st.palPrev.at, html: line || "&nbsp;" }))
  };
}

solidMounts.push((hive) => {
  palPreviewSolid = hive.mountPalPreview($("pal-prev"));
});

st.alerts = { count: 0, state: "ok", hidden: false, items: [], automatic: [], checked: "", checking: false };

st.palRows = [];

st.palSel = 0;

st.palSelId = "";

const palOn = () => !$("pal").hidden;

function palMark(text, q) {
  const raw = String(text || "");
  if (!q) return esc(raw);
  const at = raw.toLowerCase().indexOf(q);
  if (at < 0) return esc(raw);
  return esc(raw.slice(0, at)) + `<em>${esc(raw.slice(at, at + q.length))}</em>` + esc(raw.slice(at + q.length));
}

function palMarkMatches(text, matcher) {
  const raw = String(text || "");
  let out = "", at = 0;
  matcher.lastIndex = 0;
  for (let found = matcher.exec(raw); found; found = matcher.exec(raw)) {
    if (!found[0]) { matcher.lastIndex += 1; continue; }
    out += esc(raw.slice(at, found.index)) + `<mark>${esc(found[0])}</mark>`;
    at = found.index + found[0].length;
  }
  return out + esc(raw.slice(at));
}


function palMarkAll(text, needle) {
  const raw = String(text || "");
  const q = String(needle || "").toLowerCase();
  if (!q) return esc(raw);
  let out = "", at = 0;
  for (;;) {
    const found = raw.toLowerCase().indexOf(q, at);
    if (found < 0) break;
    out += esc(raw.slice(at, found)) + `<mark>${esc(raw.slice(found, found + q.length))}</mark>`;
    at = found + q.length;
  }
  return out + esc(raw.slice(at));
}

const chatTree = (s) => (Array.isArray(s.trees) ? s.trees.find((one) => one?.repo) || s.trees.find((one) => one?.branch) : null) || null;

const chatActivity = (s) => {
  const stamps = [s.finish?.at, s.turnSince, s.liveSince].map((at) => Date.parse(at || "")).filter(Number.isFinite);
  return stamps.length ? Math.max(...stamps) : 0;
};

function chatPrs(s) {
  const found = (st.prs || []).filter((p) => p.session === s.name).map((p) => ({ number: Number(p.number) || 0, title: p.title || "", url: p.url || "" }));
  for (const url of s.prs || []) {
    const hit = String(url).match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
    if (hit && !found.some((p) => p.number === Number(hit[1]))) found.push({ number: Number(hit[1]), title: "", url: String(url) });
  }
  return found;
}

function chatSubject(s, opens) {
  const tree = chatTree(s);
  return {
    key: s.name,
    seat: s,
    title: s.naming ? phrase("new chat") : s.title || s.name,
    branch: tree?.branch || "",
    project: tree?.repo || String(s.cwd || "").split("/").filter(Boolean).pop() || "",
    where: s.where === "cloud" ? phrase("remote") : "",
    prs: chatPrs(s),
    activityAt: chatActivity(s),
    opens: opens[s.name] || null
  };
}

function sinceSay(at, now) {
  if (!at) return "";
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return phrase("now");
  if (min < 60) return phrase("{n} min ago", { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return phrase("{n} h ago", { n: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? phrase("yesterday") : phrase("{n} d ago", { n: days });
}

function chatRow(subject, { current, now, query, rc }) {
  const s = subject.seat;
  const bi = st.blocks.findIndex((b) => b.keys.includes(s.name));
  const seat = bi === st.block ? st.blocks[bi].keys.indexOf(s.name) : -1;
  const isCurrent = s.name === current;
  const ctx = [subject.project, subject.where, subject.branch, subject.prs.map((p) => `#${p.number}`).join(" ")].filter(Boolean).join(" · ");
  const row = {
    id: `seat:${s.name}`,
    icon: rc ? agentIcon(s) : s.where === "cloud" ? "i-cloud" : "i-local",
    dot: rc ? "" : stateColor(s.state),
    name: subject.title,
    search: s.name,
    ctx,
    when: openedOften(subject, now) ? phrase("you open it often") : sinceSay(subject.activityAt, now),
    key: seat >= 0 && seat < st.LIMIT && st.keys.seat ? keyLabel(st.keys.seat, seat + 1) : "",
    current: isCurrent,
    two: true,
    go: () => {
      if (!st.data.sessions.some((x) => x.name === s.name)) return;
      noteOpen(globalThis.localStorage, s.name, Date.now(), query);
      goTo(s.name);
    }
  };
  if (rc) Object.assign(row, { state: s.state, seat: s, badge: bi >= 0 ? `b${blockNumber(bi)}` : "", verb: "Go to the seat" });
  return row;
}

function findSeed(text, words) {
  const folded = foldText(text);
  const order = [...words].sort((a, b) => b.length - a.length);
  for (const word of order) {
    const at = folded.indexOf(word);
    if (at >= 0) return String(text).slice(at, at + word.length);
  }
  return order[0] || "";
}

function openAtMessage(match, words, query) {
  noteOpen(globalThis.localStorage, match.name, Date.now(), query);
  goTo(match.name);
  const seed = { query: findSeed(match.text || match.snippet || "", words), near: match.text || match.snippet || "", role: match.role || "" };
  let tries = 0;
  const land = () => {
    if (openChatFind(match.name, seed) || ++tries > 40) return;
    requestAnimationFrame(land);
  };
  requestAnimationFrame(land);
}

function messageRows(words, shown, subjects, now, query) {
  if (st.palMessages.q !== query) return [];
  const byName = new Map(subjects.map((one) => [one.key, one]));
  return st.palMessages.rows
    .filter((match) => byName.has(match.name) && !shown.has(match.name))
    .slice(0, MESSAGE_ROWS)
    .map((match) => ({
      id: `msg:${match.name}`,
      icon: "i-quote",
      name: byName.get(match.name).title,
      ctx: match.snippet,
      ctxWords: words,
      two: true,
      when: sinceSay(Date.parse(match.at || "") || 0, now),
      verb: "Open at the message",
      go: () => openAtMessage(match, words, query)
    }));
}

function rootActionRows() {
  const current = focusedSeat();
  return [
    { id: "root:new", action: "new", icon: "i-bolt", name: phrase("new chat"), ctx: phrase("an empty seat: pick the provider and the model, the first message opens it"), key: keyHint("new"), go: () => askNewChat() },
    { id: "mode:file", action: "openFile", icon: "i-file", name: phrase("open file…"), ctx: phrase("search by path in every repo — {what}", { what: st.palFiles.total ? phrase("{n} files indexed", { n: st.palFiles.total.toLocaleString() }) : phrase("this machine and the server") }), key: keyHint("openFile"), stay: true, go: () => setPalMode("file") },
    { id: "mode:code", action: "searchCode", icon: "i-mag", name: phrase("search code…"), ctx: phrase("a real grep in the repos, on both sides"), key: keyHint("searchCode"), stay: true, go: () => setPalMode("code") },
    ...(current ? [{ id: "root:find", action: "find", icon: "i-mag", name: phrase("find in the current chat"), ctx: current.title || current.name, key: keyHint("find"), go: () => run("find") }] : []),
    { id: "root:theme", icon: "i-image", name: phrase("change theme…"), ctx: phrase("the colours of the app and the terminals"), search: "theme tema cores colors appearance aparência", stay: true, go: () => setPalMode("theme") },
    { id: "root:prs", icon: "i-pr", name: phrase("open pull requests"), ctx: phrase("ci, diff, review and merge"), go: () => openPrs() },
    { id: "root:usage", action: "usage", icon: "i-chart", name: phrase("usage and concurrency"), ctx: phrase("how many chats you really hold at once"), key: keyHint("usage"), go: () => run("usage") },
    { id: "root:settings", action: "help", icon: "i-keys", name: phrase("shortcuts and settings"), ctx: phrase("rebind anything, the fonts, the leader key"), key: keyHint("help"), go: () => run("help") },
    ...(linearOn() ? [{ id: "mode:linear", icon: "i-list", name: phrase("open a chat from a Linear issue…"), ctx: phrase("the issues assigned to you — pick one and the chat starts with it: title, description, images and the branch Linear suggests"), stay: true, go: () => setPalMode("linear") }] : [])
  ];
}

const KEYMAP_LEFT_OUT = new Set(["palette", ...DIGIT_ACTIONS]);

function keymapRows(covered) {
  return ACTIONS
    .filter(([action]) => !covered.has(action) && !KEYMAP_LEFT_OUT.has(action))
    .map(([action, said]) => ({ id: `key:${action}`, action, icon: "i-keys", name: phrase(said || ACTION_SAID[action] || action, { limit: st.LIMIT }), search: action, key: keyHint(action), go: () => run(action) }));
}

function allActionRows() {
  const root = rootActionRows();
  const listed = palActions().map((a, i) => ({ id: `action:${i}`, ...a }));
  const seen = new Set(root.map((r) => r.action).filter(Boolean));
  const rest = listed.filter((r) => !r.action || !seen.has(r.action));
  for (const r of rest) if (r.action) seen.add(r.action);
  return [...root, ...rest, ...keymapRows(seen)];
}

function settingSection(id) {
  const tab = $("pref-nav")?.querySelector(`button[data-pane="${CSS.escape(id)}"]`);
  return tab && !tab.hidden ? tab.textContent.replace(/\s+/g, " ").trim() : "";
}

function openSection(pane) {
  openHelp(pane);
  showPrefPane(pane);
}

function openSetting(pane, el) {
  openSection(pane);
  requestAnimationFrame(() => {
    const control = (el?.htmlFor && document.getElementById(el.htmlFor)) || el?.parentElement?.querySelector("input, select, textarea, button") || null;
    (control || el)?.scrollIntoView?.({ block: "center" });
    control?.focus?.();
  });
}

const SETTING_TITLES = "label, h2, h3, h4, [data-setting-title]";

function settingRows() {
  const body = $("pref-body");
  if (!body) return [];
  const rows = [];
  for (const pane of body.querySelectorAll(".pref-pane[data-pane]")) {
    const id = pane.dataset.pane;
    const section = settingSection(id);
    if (!section) continue;
    const where = phrase("Settings · {section}", { section });
    rows.push({ id: `set:${id}`, icon: "i-keys", name: where, search: id, verb: "Open", go: () => openSection(id) });
    const seen = new Set([section.toLowerCase()]);
    for (const el of pane.querySelectorAll(SETTING_TITLES)) {
      const said = String(el.dataset?.settingTitle || el.textContent || "").replace(/\s+/g, " ").trim();
      if (!said || said.length > 90 || seen.has(said.toLowerCase())) continue;
      seen.add(said.toLowerCase());
      rows.push({ id: `set:${id}:${rows.length}`, icon: "i-keys", name: `${said.charAt(0).toLocaleUpperCase()}${said.slice(1)}`, ctx: where, verb: "Open", go: () => openSetting(id, el) });
    }
  }
  return rows;
}

function themeRows(q) {
  const words = searchWords(q);
  const rows = themeChoices().map((one) => ({
    id: `theme:${one.name}`,
    icon: "i-image",
    name: one.say,
    search: `${one.name} theme tema`,
    ctx: one.custom ? phrase("yours") : "",
    tag: one.worn ? phrase("current") : "",
    swatches: one.swatches,
    facts: [
      { key: "bg", k: phrase("the wall"), mono: one.swatches[0] },
      { key: "panel", k: phrase("cards"), mono: one.swatches[1] },
      { key: "accent", k: phrase("accent colour"), mono: one.swatches[2] }
    ],
    verb: "Wear",
    go: () => setTheme(one.name)
  }));
  const rescue = { id: "theme:rescue", icon: "i-reload", name: phrase("back to the default theme"), search: "theme tema padrão default reset socorro rescue css", key: keyLabel(THEME_RESCUE_KEY), swatches: rows[0]?.swatches || [], go: () => restoreDefaultTheme() };
  const found = [...rankRows(rows, words), ...rankRows([rescue], words)];
  if (found.length) return [{ sec: phrase("change theme") }, ...found];
  return [{ sec: phrase("change theme") }, { id: "theme:none", icon: "i-image", quiet: true, name: phrase("No results"), go: () => {} }];
}

function palModel(q) {
  if (st.palMode === "file") return palFileRows(q);
  if (st.palMode === "code") return palCodeRows(q);
  if (st.palMode === "linear") return palLinearRows(q);
  if (st.palMode === "theme") return themeRows(q);
  const rows = [];
  const rc = raycastOn();
  const onlyActions = q.startsWith(">");
  const query = onlyActions ? q.slice(1).trim() : q;
  const words = searchWords(query);
  const ranked = (list) => rankRows(list, words);
  const section = (sec, list, note = "") => { if (list.length) rows.push(rc ? { sec, note } : { sec }, ...list); };
  const linked = promptLinkOpenRow();
  if (linked) {
    section(phrase("actions"), [linked]);
    return rows;
  }

  const env = (st.alerts.items || []).filter((i) => i.fix).flatMap((i) => {
    const does = i.fix.kind === "copy" ? phrase("copy") : i.fix.kind === "investigate" ? phrase("investigate") : phrase("run");
    const dot = i.state === "fail" ? "var(--red)" : "var(--yellow)";
    return [
      { id: `env:${i.id}`, icon: "i-bolt", name: `${does}: ${fixLabelSaid(i.fix.label)}`, ctx: i.headline || i.detail || i.title, dot, facts: fixFacts(i.fix),
        go: () => { if (!window.hiveDoctorFix) return; window.hiveDoctorFix(i.id); } },
      { id: `env-chat:${i.id}`, icon: "i-ask", name: phrase("solve in a chat: {what}", { what: i.headline || i.title }), ctx: i.detail || i.title, dot,
        go: () => { if (!window.hiveDoctorChat) return; window.hiveDoctorChat(i.id); } }
    ];
  });
  if (rc) for (const r of env) { delete r.dot; if (r.icon === "i-bolt") r.icon = "i-warn"; }
  if (!onlyActions) section(rc ? (st.alerts.count === 1 ? phrase("environment · 1 warning") : phrase("environment · {n} warnings", { n: st.alerts.count })) : `environment · ${st.alerts.count} ${st.alerts.count === 1 ? "warning" : "warnings"}`, ranked(env));

  if (onlyActions) {
    section(phrase("actions"), ranked(allActionRows()));
    return rows;
  }

  const now = Date.now();
  const opens = readOpens(globalThis.localStorage);
  const subjects = st.data.sessions.filter((s) => !s.of).map((s) => chatSubject(s, opens));
  const current = focusedSeat()?.name || "";
  const shape = { current, now, query, rc };

  if (!words.length) {
    section(phrase("actions"), rootActionRows());
    section(phrase("recent chats"), recentThreads(subjects, current, RECENT_CHATS).map((one) => chatRow(one, shape)));
    return rows;
  }

  const chats = rankThreads(subjects, query, now).slice(0, CHATS_FOUND);
  section(phrase("chats"), chats.map((one) => chatRow(one, shape)), rc && chats.some((one) => one.seat.state === "needs") ? phrase("{n} · needs you first", { n: chats.length }) : rc ? String(chats.length) : "");
  const said = messageRows(words, new Set(chats.map((one) => one.key)), subjects, now, query);
  const looking = st.palMessages.loading || st.palMessages.q !== query;
  section(phrase("in messages"), said, rc && looking && words.some((word) => word.length >= 2) ? phrase("searching…") : "");

  section(phrase("actions"), ranked(allActionRows()));
  section(phrase("settings"), ranked(settingRows()));

  const list = st.blocks.map((b, i) => ({
    id: `block:${i}`,
    icon: "i-grid",
    name: phrase("block {n}", { n: blockNumber(i) }),
    ctx: `${labelOf(b, ofBlock(b)).txt || phrase("unnamed")}${st.spaces.length > 1 ? ` · ${spaceName(spaceOf(b.ws))}` : ""}`,
    go: () => goToBlock(i)
  }));
  if (rc) for (const r of list) r.verb = "Go to the block";
  section(phrase("blocks"), ranked(list));

  /* one workspace has nothing to switch to, so the switching rows only exist from the second on */
  const floors = st.spaces.length > 1
    ? st.spaces.map((w) => ({
      id: `space:${w.id}`,
      icon: "i-grid",
      name: spaceName(w),
      ctx: phrase("{n} blocks · {m} chats", { n: blocksOf(w.id).length, m: seatsOf(w.id) }),
      go: () => goToSpace(w.id)
    }))
    : [];
  /* renaming and closing lived only behind the right button, where nobody found them */
  floors.push({
    id: "space:rename",
    icon: "i-grid",
    name: phrase("rename this workspace"),
    ctx: spaceName(spaceOf(st.space)),
    go: () => renameSpace(st.space)
  });
  floors.push({
    id: "space:new",
    icon: "i-grid",
    name: phrase("new workspace"),
    ctx: phrase("the next chat opens in it"),
    go: () => goToSpace(openSpace("").id)
  });
  if (st.spaces.length > 1) {
    floors.push({
      id: "space:close",
      icon: "i-grid",
      name: phrase("close the workspace you are on"),
      ctx: spaceCloseNote(st.space),
      go: () => closeSpace(st.space, null)
    });
  }
  section(phrase("workspaces"), ranked(floors));

  const reviews = st.prs.map((p) => ({
    id: `pr:${p.key}`,
    icon: "i-pr",
    name: p.title || p.key,
    ctx: `${p.repo}#${p.number}${p.ci ? ` · ${CI_LABEL[p.ci] || p.ci}` : ""}`,
    go: () => { st.openPr = p.key; openPrs(); }
  }));
  section(phrase("pull requests"), ranked(reviews).slice(0, 12));

  const parked = (st.data.archived || []).map((a) => ({
    id: `arch:${a.where}:${a.name}`,
    icon: "i-clock",
    name: a.title || a.name,
    search: a.name,
    ctx: `${phrase("archived {when}", { when: ago(new Date(a.archivedAt).toISOString()) })}${a.model ? ` · ${a.model}` : ""}${a.cwd ? ` · ${shortDir(a.cwd)}` : ""}`,
    key: phrase("revive"),
    go: () => reviveArchived(a.name, a.where)
  }));
  if (rc) for (const r of parked) { r.note = r.key; r.key = ""; r.verb = "Revive"; }
  section(phrase("archived"), ranked(parked));

  /* the cheat code: typed whole, never listed, never hinted. a secret that autocompletes
     is a menu item wearing sunglasses. */
  if (st.pet && (q === "brinde" || q === "vida mansa")) {
    rows.push({ sec: "?" }, {
      id: "toast:vida-mansa",
      icon: "i-heart",
      name: phrase("a toast to the easy life"),
      go: () => st.pet.toast()
    });
  }
  return rows;
}

async function copyExternalMcp(ceiling) {
  let command = "";
  try { command = (await (await fetch(`/api/mcp/external?ceiling=${ceiling}`)).json()).command || ""; } catch {}
  let ok = false;
  try { await navigator.clipboard.writeText(command); ok = !!command; } catch {}
  hudCopied(command, ok);
}

function palActions() {
  return [
    { action: "new", icon: "i-bolt", name: phrase("new chat"), ctx: phrase("an empty seat: pick the provider and the model, the first message opens it"), key: keyHint("new"), go: () => askNewChat() },
    { action: "term", icon: "i-term", name: phrase("new terminal"), ctx: phrase("a plain shell in a seat, on your machine"), key: keyHint("term"), go: () => openShell("local") },
    { icon: "i-term", name: phrase("new terminal on the server"), ctx: phrase("a plain remote shell"), go: () => openShell("cloud") },
    ...(Array.isArray(st.data?.hosts) ? st.data.hosts : []).map((one) => ({ icon: "i-term", name: phrase("new terminal on {host}", { host: one.label }), ctx: phrase("a plain shell on that host, in the folder its chats open in"), search: `terminal shell ssh host remote remoto ${one.id}`, go: () => openShell("cloud", one.id) })),
    { icon: "i-grid", name: phrase("workspace"), ctx: phrase("the repos, skills and MCPs the hive.json declares"), go: () => openWorkspace() },
    { icon: "i-plug", name: phrase("connect an agent from outside"), ctx: phrase("copies the command that gives a Claude Code outside the hive these tools — it can read the chats"), search: "mcp external agent agente externo conectar", go: () => copyExternalMcp("read") },
    { icon: "i-plug", name: phrase("connect an agent from outside that can talk"), ctx: phrase("the same, but it can also message and ask the chats"), search: "mcp external agent agente externo conectar operate", go: () => copyExternalMcp("operate") },
    { action: "dim", icon: "i-grid", name: st.dimOn ? phrase("stop dimming the other seats") : phrase("dim the other seats while you type"),
      ctx: phrase("while the keyboard is inside a seat"), key: keyHint("dim"), go: () => setPref("dim", !st.dimOn) },
    { action: "focusMode", icon: "i-grid", name: st.focusMode ? phrase("leave focus mode") : phrase("focus mode"),
      ctx: phrase("the chat in focus in the middle of the screen, the others of the block beside it"),
      search: "focus mode modo foco focado zen center centro roleta carousel", key: keyHint("focusMode"), go: () => setFocusMode(!st.focusMode) },
    {
      action: "doctor",
      icon: "i-bolt",
      name: phrase("check the environment again"),
      ctx: st.alerts.checked ? phrase("re-runs the doctor — last checked {when}", { when: st.alerts.checked }) : phrase("re-runs the doctor and reports what moved"),
      key: keyHint("doctor"),
      go: () => {
        if (window.hiveDoctorCheck) window.hiveDoctorCheck();
      }
    },
    { action: "accounts", icon: "i-user", name: phrase("providers and accounts"), ctx: phrase("the agents this hive can seat, and their logins"), search: "providers accounts logins codex kimi kiro cursor gemini antigravity opencode claude contas provedores", key: keyHint("accounts"), go: () => run("accounts") },
    { action: "extensions", icon: "i-plug", name: phrase("extensions"), ctx: phrase("what this hive runs on top of the hive"), search: "extensions extensões plugins hooks", key: keyHint("extensions"), go: () => run("extensions") },
    { action: "usage", icon: "i-chart", name: phrase("usage and concurrency"), ctx: phrase("how many chats you really hold at once"), key: keyHint("usage"), go: () => run("usage") },
    { action: "memories", icon: "i-book", name: phrase("memories"), ctx: phrase("your memories and the team's"), search: "memory memories memória memórias time team escopo scope proposta", key: keyHint("memories"), go: () => run("memories") },
    { action: "meetings", icon: "i-mic", name: phrase("meetings"), ctx: phrase("record a conversation, read the notes, see what the team recorded"), search: "meetings meeting reunião reuniões call gravar transcrição resumo notes record", key: keyHint("meetings"), go: () => run("meetings") },
    { action: "shelf", icon: "i-book", name: phrase("the shelf"), ctx: phrase("every page this team published"), search: "shelf estante pages páginas rfc", key: keyHint("shelf"), go: () => run("shelf") },
    { action: "day", icon: "i-list", name: phrase("your day"), ctx: phrase("what you asked for, and what came back"), search: "day errands", key: keyHint("day"), go: () => run("day") },
    { action: "worktrees", icon: "i-tree", name: phrase("the worktrees on this machine"), ctx: phrase("what every repo is holding, how old and how many gigabytes"), search: "worktree worktrees disk disco espaço", key: keyHint("worktrees"), go: () => openWorktrees() },
    { action: "prs", icon: "i-pr", name: phrase("the PR panel"), ctx: phrase("ci, diff, review and merge"), key: keyHint("prs"), go: () => run("prs") },
    { action: "archive", icon: "i-clock", name: phrase("archive this chat"), ctx: phrase("it stops and frees the slot — comes back with the same name, model and conversation"), search: "archive arquivar guardar park", key: keyHint("archive"), go: () => archiveSeatNow(focusedSeat()) },
    { icon: "i-minus", name: phrase("hide this chat until it finishes"), ctx: phrase("it leaves the screen now, keeps working, and comes back when the turn ends or it needs you"), search: "hide snooze esconder sumir terminar finish", go: () => hideUntilItEnds(focusedSeat()) },
    { icon: "i-minus", name: phrase("hide this chat until it works again"), ctx: phrase("it leaves the rail and the grid, keeps running, and comes back on its own when it starts working"), search: "hide snooze esconder sumir soneca", go: () => hideUntilItWorks(focusedSeat()) },
    { icon: "i-clock", name: phrase("archived chats"), ctx: phrase("every archived chat, to search and bring back"), search: "archived archieved arquivados arquivadas parked reviver", go: () => openArchived() },
    { action: "history", icon: "i-clock", name: phrase("revive from history"), ctx: phrase("reopens an archived chat with its whole context"), key: keyHint("history"), go: () => run("history") },
    { action: "kill", icon: "i-close", name: phrase("kill this chat"), ctx: phrase("the window closes and whatever runs in it stops — the transcript stays in history"), search: "kill close matar fechar encerrar assento", key: keyHint("kill"), go: () => run("kill") },
    { action: "threads", icon: "i-hash", name: phrase("the Slack thread of the focused seat"), ctx: phrase("where the mission came from"), key: keyHint("threads"), go: () => run("threads") },
    { action: "sound", icon: "i-sound", name: st.sound ? phrase("no chime when it needs you") : phrase("chime when it needs you"), ctx: phrase("the chime the moment a seat stops and needs you"), key: keyHint("sound"), go: () => setSound(!st.sound) },
    { action: "answered", icon: "i-answered", name: st.answeredAlert ? phrase("no notice when it answers") : phrase("notify when it answers"), ctx: phrase("a desktop notice and its own chime when a seat finishes answering"), key: keyHint("answered"), go: () => setAnswered(!st.answeredAlert) },
    { action: "alerts", icon: "i-grid", name: st.alerts.hidden ? phrase("show the environment line") : phrase("hide the environment line"), ctx: phrase("the one line under the top bar"), key: keyHint("alerts"), go: () => window.hiveAlertsToggle?.() },
    { action: "rename", icon: "i-pen", name: phrase("rename the focused chat"), ctx: phrase("your name sticks — the AI stops renaming it"), key: keyHint("rename"), go: () => run("rename") },
    { action: "retitle", icon: "i-reload", name: phrase("regenerate the title of the focused chat"), ctx: phrase("the AI reads the conversation again and names it"), search: "retitle title regenerate regenerar título nome", key: keyHint("retitle"), go: () => run("retitle") },
    { action: "reconnect", icon: "i-term", name: phrase("reconnect the focused seat"), ctx: phrase("drops the socket and opens it again"), key: keyHint("reconnect"), go: () => run("reconnect") },
    { action: "help", icon: "i-keys", name: phrase("shortcuts and settings"), ctx: phrase("rebind anything, the fonts, the leader key"), key: keyHint("help"), go: () => run("help") },
    { action: "themes", icon: "i-keys", name: phrase("themes"), ctx: phrase("the colours of the app and the terminals — pick one, make yours, share as json"), key: keyHint("themes"), go: () => openThemes() },
    { icon: "i-reload", name: phrase("back to the default theme"), ctx: phrase("one theme, without the theme's css"), search: "theme tema padrão default reset socorro rescue css", key: keyLabel(THEME_RESCUE_KEY), go: () => restoreDefaultTheme() },
    ...promptLinkPaletteRows(),
    ...promptSuggestionRows(),
    ...LANGUAGES.map((one) => ({
      icon: "i-globe",
      name: one.name,
      on: one.id === st.language,
      ctx: phrase("the language of the app — menus, notices and empty screens"),
      search: "language idioma linguagem english inglês português portugues portuguese",
      go: () => setLanguage(one.id)
    })),
    ...PET_SWITCH.map((one) => ({
      icon: "i-heart",
      name: phrase(one.name),
      on: one.on === (st.petChoice !== PET_OFF),
      ctx: phrase("the little you that lives in the bottom corner of the hive"),
      search: "pet bicho animal blob tamagotchi mini você voce on off ligado desligado",
      go: () => setPet(one.on ? PET_ON : PET_OFF)
    }))
  ];
}

const typedWords = (q) => searchWords(q.startsWith(">") ? q.slice(1) : q);

function rowNameHtml(r, q) {
  if (r.markRe) return palMarkMatches(r.name, r.markRe);
  if (r.mark) return palMarkAll(r.name, r.mark);
  if (WIDE_MODES.has(st.palMode)) return palMark(r.name, q);
  return markWords(r.name, typedWords(q), esc);
}

const rowCtxHtml = (r) => (r.ctxWords ? markWords(r.ctx, r.ctxWords, esc) : esc(r.ctx));

const currentHtml = (r) => (r.current ? `<span class="pal-current">${esc(phrase("current"))}</span>` : "");

const whenHtml = (r) => (r.when ? `<span class="pal-when">${esc(r.when)}</span>` : "");

const swatchHtml = (r) => (r.swatches ? `<span class="pal-swatches" aria-hidden="true">${r.swatches.map((colour) => `<i style="background:${esc(colour)}"></i>`).join("")}</span>` : "");

function palPaint() {
  const q = $("pal-q").value.trim().toLowerCase();
  st.palRows = palModel(q);
  const runnable = st.palRows.filter((r) => !r.sec);
  st.palSel = palAt(runnable, st.palSelId, st.palSel);
  st.palSelId = runnable[st.palSel]?.id || "";
  let i = -1;
  const rc = raycastOn();
  const html = runnable.length
    ? st.palRows.map((r) => {
        if (r.sec && rc) return `<div class="pal-sec" role="presentation"><span>${esc(r.sec)}</span>${r.note ? `<span class="mono">${esc(r.note)}</span>` : ""}</div>`;
        if (r.sec) return `<div class="pal-sec" role="presentation">${esc(r.sec)}</div>`;
        i += 1;
        if (rc) return palRowHtml(r, i, q);
        const end = r.key ? `<kbd>${esc(r.key)}</kbd>` : r.tag ? `<span class="tag">${esc(r.tag)}</span>` : r.note ? `<span class="note">${esc(r.note)}</span>` : r.on ? `<span class="pal-on">${svgIcon("i-check")}</span>` : "";
        const tail = r.when || r.swatches ? `<span class="pal-tail">${whenHtml(r)}${swatchHtml(r)}${end}</span>` : end || "<span></span>";
        return `<div class="pal-row${i === st.palSel ? " sel" : ""}${r.quiet ? " quiet" : ""}" role="option" id="pal-row-${i}" aria-selected="${i === st.palSel}" data-i="${i}">
          ${svgIcon(r.icon)}
          <span><span class="rn${r.mono ? " mono" : ""}">${r.dot ? `<i class="pal-dot" style="background:${r.dot}"></i>` : ""}${rowNameHtml(r, q)}</span>${r.ctx || r.current ? `<span class="rc">${currentHtml(r)}${rowCtxHtml(r)}</span>` : ""}</span>
          ${tail}</div>`;
      }).join("")
    : WIDE_MODES.has(st.palMode) ? `<div class="pal-none">${phrase("nothing here answers to “{n}”.", { n: esc(q) })}<br>${phrase("the sessions, the blocks, the PRs and every command are searchable — esc closes.")}</div>`
      : `<div class="pal-none">${esc(phrase("No results"))}</div>`;
  const listEl = $("pal-list");
  if (listEl.dataset.h !== html) { listEl.innerHTML = html; listEl.dataset.h = html; }
  if (runnable.length) $("pal-q").setAttribute("aria-activedescendant", `pal-row-${st.palSel}`);
  else $("pal-q").removeAttribute("aria-activedescendant");
  const dot = $("pal-envdot");
  dot.className = "envdot" + (st.alerts.count ? ` ${st.alerts.state}` : "");
  $("pal-env").textContent = st.palMode === "file" ? phrase("{n} files indexed · .gitignore honoured", { n: st.palFiles.total.toLocaleString() })
    : st.palMode === "code" ? phrase("git grep in every repo of the hub, both sides")
      : envLine();
  if (rc) palPaintFoot();
  else $("pal-hints").innerHTML = WIDE_MODES.has(st.palMode)
    ? `<span>${phrase("↑↓ move")}</span><span>${phrase("⏎ open")}</span><span>${phrase("⇧⏎ beside")}</span><span>⇥ ${st.palMode === "file" ? phrase("search code") : phrase("open file")}</span><span>${phrase("esc back")}</span>`
    : `<span>${phrase("↑↓ move")}</span><span>${phrase("⏎ run")}</span><span>${phrase("esc close")}</span>`;
  palPreviewAsk();
}

const AGENT_ICONS = new Set(["claude", "codex", "kimi", "kiro", "cursor", "gemini", "antigravity", "opencode"]);

const agentIcon = (s) => (AGENT_ICONS.has(s?.agent) ? `i-${s.agent}` : s?.kind === "shell" ? "i-term" : "i-agent");

const stateSay = (s) => `${phrase(LABEL[s.state] || "idle")}${s.when ? ` · ${s.when}` : ""}`;

function palSeatRow(s, row) {
  const bi = st.blocks.findIndex((b) => b.keys.includes(s.name));
  return {
    icon: agentIcon(s),
    dot: "",
    state: s.state,
    seat: s,
    search: `${s.name} ${s.where}${bi >= 0 ? ` ${phrase("block {n}", { n: blockNumber(bi) })}` : ""} ${s.summary || ""}`,
    ctx: stateSay(s),
    badge: bi >= 0 ? `b${blockNumber(bi)}` : "",
    key: row.key,
    verb: "Go to the seat"
  };
}

function palRowHtml(r, i, q) {
  const sel = i === st.palSel;
  const name = rowNameHtml(r, q);
  const tail = r.key ? keyCaps(r.key)
    : r.tag ? `<span class="tag">${esc(r.tag)}</span>`
      : r.note ? `<span class="note">${esc(r.note)}</span>`
        : r.on ? `<span class="pal-on">${svgIcon("i-check")}</span>` : "";
  const title = `<span class="rn${r.mono ? " mono" : ""}">${name}</span>`;
  const words = r.two
    ? `<span class="pal-two"><span class="pal-top">${title}${whenHtml(r)}</span><span class="pal-sub">${currentHtml(r)}${r.ctx ? `<span class="rc">${rowCtxHtml(r)}</span>` : ""}</span></span>`
    : `${title}${r.ctx ? `<span class="rc">${rowCtxHtml(r)}</span>` : ""}`;
  return `<div class="pal-row${sel ? " sel" : ""}${r.quiet ? " quiet" : ""}${r.two ? " two" : ""}" role="option" id="pal-row-${i}" aria-selected="${sel}" data-i="${i}">
    <span class="pal-ic">${svgIcon(r.icon)}</span>${r.state ? `<i class="rc-dot ${esc(r.state)}" aria-hidden="true"></i>` : ""}
    ${words}
    <span class="acc">${r.two ? "" : whenHtml(r)}${swatchHtml(r)}${r.badge ? `<span class="rc-badge mono">${esc(r.badge)}</span>` : ""}${tail}</span></div>`;
}

const palVerb = (r) => phrase(r?.verb || (WIDE_MODES.has(st.palMode) || r?.file ? "Open" : "Run"));

const PAL_STEPS = { KeyN: 1, KeyP: -1 };

const PAL_ACTS_SPARE = IS_MAC ? { meta: true, code: "KeyK" } : { ctrl: true, code: "KeyK" };

const palStepOf = (e) => (modsMatch({ ctrl: true }, e) && PAL_STEPS[codeOf(e)]) || 0;

const stepsTake = (b) => !!b && !!PAL_STEPS[b.code] && !!b.ctrl && !b.alt && !b.shift && !b.meta;

const palActsKey = () => (stepsTake(st.keys.palette) ? PAL_ACTS_SPARE : st.keys.palette);

const isPalActsKey = (e) => (stepsTake(st.keys.palette)
  ? codeOf(e) === PAL_ACTS_SPARE.code && modsMatch(PAL_ACTS_SPARE, e)
  : whichAction(e)?.action === "palette");

function palPaintFoot() {
  const row = st.palRows.filter((r) => !r.sec)[st.palSel];
  $("pal-hints").innerHTML = `${row && !row.quiet ? `<button type="button" class="pal-fact" data-pal="go">${esc(palVerb(row))}${keyCaps("↵")}</button><span class="pal-vbar"></span>` : ""}<button type="button" class="pal-fact dim" data-pal="acts"${row && !row.quiet ? "" : " disabled"}>${esc(phrase("Actions"))}${keyCaps(keyLabel(palActsKey()))}</button>`;
}

function palActRows(r) {
  if (r.seat) return seatMenuRows(r.seat);
  if (r.file) {
    return [
      { icon: "i-file", label: phrase("Open"), keys: "↵", go: () => r.go({}) },
      { icon: "i-grid", label: phrase("open beside"), keys: "⇧↵", go: () => r.go({ beside: true }) },
      { icon: "i-copy", label: phrase("copy the path"), go: () => toClipboard(r.file.path) },
      { sep: true },
      { icon: "i-mag", label: st.palMode === "file" ? phrase("search code") : phrase("open file"), keys: "⇥", stay: true, go: () => setPalMode(st.palMode === "file" ? "code" : "file") }
    ];
  }
  return [{ icon: r.icon, label: palVerb(r), keys: "↵", go: () => r.go({}) }];
}

function palActsHost() {
  const sheet = $("pal").querySelector(".pal-sheet");
  let host = $("pal-acts");
  if (!host) {
    sheet.insertAdjacentHTML("beforeend", `<div class="menu on pal-acts" id="pal-acts" data-no-t role="menu" aria-label="${esc(phrase("what to do with the row you picked"))}" hidden></div>`);
    host = $("pal-acts");
  }
  return host;
}

function openPalActs() {
  const row = st.palRows.filter((r) => !r.sec)[st.palSel];
  if (!row || row.quiet) return;
  palActsHost().hidden = false;
  menuShow("pal-acts", row.name, palActRows(row), {
    at: row.badge || "",
    pick: (picked) => {
      closePalActs();
      if (!picked.stay) closePal();
      picked.go?.();
    },
    close: () => { closePalActs(); $("pal-q").focus(); }
  });
}

function closePalActs() {
  if (!palActsOn()) return;
  $("pal-acts").hidden = true;
  menuStop("pal-acts");
}

const palActsOn = () => !!$("pal-acts") && !$("pal-acts").hidden;

function palDetailModel() {
  const row = st.palRows.filter((r) => !r.sec)[st.palSel];
  if (!row || row.quiet) return { mode: "note", note: phrase("the details of what you pick show up here"), lines: [] };
  return row.seat ? seatDetailModel(row.seat) : rowDetailModel(row);
}

function seatDetailModel(s) {
  const bi = st.blocks.findIndex((b) => b.keys.includes(s.name));
  const seat = bi >= 0 ? st.blocks[bi].keys.indexOf(s.name) : -1;
  const tree = (s.trees || []).find((t) => t.branch) || null;
  const pr = prOfChat(s.name);
  const prUrl = pr?.url || (s.prs || [])[0] || "";
  const prName = pr ? `${String(pr.repo).split("/").pop()}#${pr.number}` : (prUrl.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/) || []).slice(1).join("#");
  const thread = threadsOfChat(s.name)[0];
  const copySay = (k) => `${phrase("copy")} ${k}`;
  const facts = [{ key: "state", k: phrase("State"), state: s.state, text: stateSay(s) }];
  if (s.model || s.agent) facts.push({ key: "model", k: phrase("Model"), badge: s.model || "", mono: [s.agent, s.kind === "terminal" ? phrase("terminal") : phrase("native chat")].filter(Boolean).join(" · ") });
  if (tree) facts.push({ key: "branch", k: phrase("Branch"), mono: middleCut(tree.branch, 34), full: tree.branch, copy: tree.branch, copySay: copySay(phrase("Branch")) });
  if (prName) facts.push({ key: "pr", k: "PR", mono: prName, full: prUrl, copy: prUrl, copySay: copySay("PR") });
  if (pr?.ci && pr.ci !== "none") facts.push({ key: "ci", k: "CI", state: pr.ci === "failed" ? "needs" : pr.ci === "running" ? "working" : "done", text: phrase(CI_LABEL[pr.ci] || pr.ci) });
  if (thread) facts.push({ key: "slack", k: "Slack", icon: thread.private ? "i-lock" : "i-hash", text: String(thread.channel || "slack").replace(/^#/, "") });
  return {
    mode: "seat", note: "", lines: [],
    icon: agentIcon(s),
    state: s.state,
    name: s.naming ? phrase("new chat") : s.title || s.name,
    where: [s.where, bi >= 0 ? phrase("block {n}", { n: blockNumber(bi) }) : "", seat >= 0 ? phrase("seat {n}", { n: seat + 1 }) : ""].filter(Boolean).join(" · "),
    say: String(s.now || s.summary || s.description || "").slice(0, 360),
    keys: [],
    facts
  };
}

function middleCut(text, most) {
  const said = String(text || "");
  if (said.length <= most) return said;
  const head = Math.ceil((most - 1) / 2);
  return `${said.slice(0, head)}…${said.slice(said.length - (most - 1 - head))}`;
}

function rowDetailModel(r) {
  return { mode: "row", note: "", lines: [], icon: r.icon, state: "", name: r.name, where: r.badge || "", say: r.ctx || "", facts: r.facts || [], keys: keyParts(r.key) };
}

const IN_GIT_BASH = ", in Git Bash";

const AVD_LABEL = /^create the (.+) AVD$/;

function fixLabelSaid(label) {
  const said = String(label || "");
  if (said.endsWith(IN_GIT_BASH)) return phrase("{what}, in Git Bash", { what: phrase(said.slice(0, -IN_GIT_BASH.length)) });
  const avd = AVD_LABEL.exec(said);
  return avd ? phrase("create the {avd} AVD", { avd: avd[1] }) : phrase(said);
}

function fixFacts(fix) {
  const command = String(fix?.command || "");
  if (!command) return [];
  const shown = homeless(String(fix.podScript || command)).replace(/\s+/g, " ").trim();
  const where = fix.podScript ? [{ key: "where", k: phrase("Where"), text: phrase("on the server") }] : [];
  return [...where, { key: "command", k: phrase("Command"), mono: middleCut(shown, 28), full: command, copy: command, copySay: `${phrase("copy")} ${phrase("Command")}` }];
}

function envLine() {
  const head = st.alerts.count
    ? `${st.alerts.count === 1 ? phrase("environment · 1 warning") : phrase("environment · {n} warnings", { n: st.alerts.count })}${st.alerts.hidden ? ` · ${phrase("strip hidden")}` : ""}`
    : phrase("environment ok");
  if (st.alerts.checking) return `${head} · ${phrase("checking…")}`;
  return st.alerts.checked ? `${head} · ${phrase("checked {when}", { when: st.alerts.checked })}` : head;
}

function palMove(step) {
  const runnable = st.palRows.filter((r) => !r.sec);
  const n = runnable.length;
  if (!n) return;
  st.palSel = (st.palSel + step + n) % n;
  st.palSelId = runnable[st.palSel]?.id || "";
  palPaint();
  $("pal-list").querySelector(".pal-row.sel")?.scrollIntoView({ block: "nearest" });
}

function palRun(at, opts) {
  const r = st.palRows.filter((x) => !x.sec)[at ?? st.palSel];
  if (!r || r.quiet) return;
  if (!r.stay) closePal();
  r.go(opts || {});
}

function openPal(mode) {
  if (palOn()) return setPalMode(mode || st.palMode);
  releaseKeyboard();
  closeMore();
  st.palSel = 0;
  st.palSelId = "";
  $("pal-list").dataset.h = "";
  $("pal-q").value = "";
  $("pal").hidden = false;
  setPalMode(mode || "");
  if (!st.extensionsAsked) pullExtensions().then(() => { if (palOn()) palPaint(); });
}

function closePal() {
  if (!palOn()) return;
  closePalActs();
  $("pal").hidden = true;
  st.palMode = "";
  $("pal").classList.remove("wide");
  document.body.focus();
  queueMicrotask(focusAfterPalette);
}

function palKeys(e) {
  const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : palStepOf(e);
  if (palActsOn()) {
    if (step) { e.preventDefault(); e.stopPropagation(); menuMove("pal-acts", step); return; }
    if (menuKeys("pal-acts", e)) return;
    if (isPalActsKey(e) || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePalActs(); return $("pal-q").focus(); }
    return;
  }
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return st.palMode ? setPalMode("") : closePal(); }
  const option = palOptionKey(e);
  if (option) { e.preventDefault(); e.stopPropagation(); return togglePalOption(option); }
  if (e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    if (st.palMode === "file" || st.palMode === "code") return setPalMode(st.palMode === "file" ? "code" : "file");
    return $("pal-q").focus();
  }
  if (step) { e.preventDefault(); e.stopPropagation(); return palMove(step); }
  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); return palRun(undefined, { beside: e.shiftKey }); }
  const m = whichAction(e);
  if (m?.action === "openFile") { e.preventDefault(); e.stopPropagation(); return setPalMode("file"); }
  if (m?.action === "searchCode") { e.preventDefault(); e.stopPropagation(); return setPalMode("code"); }
  if (raycastOn() && isPalActsKey(e)) { e.preventDefault(); e.stopPropagation(); return openPalActs(); }
  if (m?.action === "palette") { e.preventDefault(); e.stopPropagation(); return closePal(); }
}

$("pal-q").addEventListener("input", () => { st.palSel = 0; st.palSelId = ""; palAsk(); palPaint(); });

$("pal-list").addEventListener("click", (e) => {
  const row = e.target.closest(".pal-row");
  if (row) palRun(Number(row.dataset.i), { beside: e.shiftKey });
});

$("pal-list").addEventListener("mousemove", (e) => {
  const row = e.target.closest(".pal-row");
  if (!row || Number(row.dataset.i) === st.palSel) return;
  st.palSel = Number(row.dataset.i);
  st.palSelId = st.palRows.filter((r) => !r.sec)[st.palSel]?.id || "";
  for (const el of $("pal-list").querySelectorAll(".pal-row")) {
    const on = el === row;
    el.classList.toggle("sel", on);
    el.setAttribute("aria-selected", String(on));
  }
  $("pal-q").setAttribute("aria-activedescendant", `pal-row-${st.palSel}`);
  if (!raycastOn()) return;
  palPaintFoot();
  palPreviewAsk();
});

$("pal").addEventListener("mousedown", (e) => {
  if (e.target.classList.contains("pal-scrim")) return closePal();
  if (palActsOn() && !e.target.closest("#pal-acts, [data-pal=\"acts\"]")) closePalActs();
});

$("pal-hints").addEventListener("click", (e) => {
  const hit = raycastOn() && e.target.closest("[data-pal]");
  if (!hit) return;
  if (hit.dataset.pal === "go") return palRun();
  palActsOn() ? closePalActs() : openPalActs();
});

$("pal-scope").addEventListener("click", () => {
  if (raycastOn()) setPalMode(st.palMode === "" ? "file" : st.palMode === "file" ? "code" : "");
});

$("pal-prev").addEventListener("click", async (e) => {
  const hit = raycastOn() && e.target.closest("[data-copy]");
  if (!hit) return;
  if (await toClipboard(hit.dataset.copy)) hit.classList.add("copied");
  setTimeout(() => hit.classList.remove("copied"), 1200);
});

$("btn-pal").addEventListener("click", (e) => { e.stopPropagation(); palOn() ? closePal() : openPal(); });

$("btn-dim").addEventListener("click", () => setPref("dim", !st.dimOn));

$("btn-share").addEventListener("click", () => {
  const on = !st.team.sharing;
  st.team.sharing = on;
  paintShare();
  saveConfig({ share: on }).catch(() => {});
  setTimeout(() => pullTeam(true), 1500);
});

$("btn-phone").addEventListener("click", () => {
  const on = !st.team.phone;
  st.team.phone = on;
  paintPhone();
  saveConfig({ phone: on }).catch(() => {});
});

$("in-machine").addEventListener("change", () => {
  const named = $("in-machine").value.trim().slice(0, 32);
  st.team.machine = named;
  saveConfig({ machine: named }).catch(() => {});
  setTimeout(() => pullTeam(true), 1500);
});

$("btn-machines").addEventListener("click", () => {
  const on = !st.team.machines;
  st.team.machines = on;
  paintMachines();
  saveConfig({ machines: on }).catch(() => {});
});

export { PAL_PLACEHOLDER, agentIcon, closePal, closePalActs, middleCut, openPalActs, palDetailModel, palRowHtml, rowDetailModel, seatDetailModel, stateSay, envLine, openPal, paintPalPreview, palActions, palAsk, palCodeRows, palFileRows, palGrep, palKeys, palList, palMark, palMarkAll, palModel, palMove, palOn, palPaint, palPrevSeq, palPrevTimer, palPreviewAsk, palPreviewSolid, palPreviewViewModel, palRun, palSeq, palSides, palTimer, setPalMode, palOptionKey, paintPalOptions, togglePalOption };
