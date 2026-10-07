import { anchorNotes, lineOf, openNotes, plainOf, sideOf } from "/assets/review-notes.mjs";
import { render } from "./arrange.js";
import { blockWithRoom, itemOf, openBlock, saveBlockAt, saveBlocks } from "./blocks.js";
import { closeBrowser, closeCockpit, closeDevice, wireLinks } from "./chat-and-panes.js";
import { $, IS_MAC, LABEL, apiGet, emojiOf, esc, every, experienceNext, messageHtml, phrase, previewOf, raycastOn, solidMounts, st, svgIcon } from "./core.js";
import { openPrInASeat } from "./page-in-a-seat.js";
import { sendToSeat } from "./seat-layout.js";
import { goTo, openTile, pull, releaseKeyboard, takeKeyboard } from "./focus-navigation.js";
import { pool } from "./leader-key.js";
import { closeMore } from "./new-chat.js";
import { ago, ask, closePortaria, portariaOnScreen } from "./pod.js";
import { CI_LABEL, LINE_CAP, MINUTE_CAP, REVIEW_LABEL, pullThreads } from "./prs.js";
import { capsOf, copyWithWord, dressHost, followRaycast, footModel, keysHtml, leavePanel, openActions, panelOf, registerPanel, runAction, undressHost } from "./panel-window.js";
import { CHANNEL_GLYPH, MERGE_ARMED_LONG, branchTrouble, MERGE_BUSY, MERGE_LANDING_WAIT, SPINNER, chatOfPr, freshOf, markThreadSeen, mergeTrouble, merging, paintPrButton, paintPrPop, prIsGone, prOfChat, prPopOpen, prsOfChat, prsWorthShowing, threadOfChat, threadsOfChat } from "./seat-menu.js";
import { run } from "./themes.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

st.threadChat = null;

st.openThread = null;

let threadPanel = null;

st.picking = null;

const threadDrafts = new Map();

const HANDY = ["eyes", "white_check_mark", "pray", "tada", "+1", "fire", "rocket", "heart", "sweat_smile", "thinking_face", "muscle", "bug", "warning", "bulb", "pushpin", "wave"];

const threadVisible = () => !!st.threadChat && !$("thread").hidden;

function moveThreadPanel(target) {
  threadPanel ||= $("thread");
  if (threadPanel.parentElement === target) return;
  target.appendChild(threadPanel);
}

function openThreadOf(name, key) {
  const list = threadsOfChat(name);
  if (!list.length) return;
  const wanted = list.find((t) => t.key === key) || list[0];
  if (st.cockChat) closeCockpit();
  if (st.webChat) closeBrowser();
  if (st.deviceChat) closeDevice();
  if (st.reviewChat) exitReview();
  if (prsOnScreen()) closePrs();
  releaseKeyboard();
  st.threadChat = name;
  st.openThread = wanted.key;
  $("thread").hidden = false;
  every("threads", 8000, () => pullThreads(true));
  openTile(name, false);
  paintThread();
  pullThreads(true);
}

function closeThreadPanel() {
  if (!st.threadChat) return;
  const showing = threadOfChat(st.threadChat);
  if (showing) markThreadSeen(showing);
  st.threadChat = null;
  st.picking = null;
  $("thread").hidden = true;
  moveThreadPanel(document.body);
  every("threads", 45000, () => pullThreads(false));
  render();
}

const DAY_NAME = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

const CLOCK = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function faceOf(m) {
  if (m.avatar) return `<img class="av" src="${esc(m.avatar)}" alt="" loading="lazy">`;
  return `<span class="initial">${esc((m.who || "?").trim().slice(0, 1).toUpperCase())}</span>`;
}

function filesHtml(m) {
  if (!m.files?.length) return "";
  return `<div class="th-files">${m.files.map((f) => f.image
    ? `<img src="/api/threads/file?id=${encodeURIComponent(f.id)}" alt="${esc(f.name)}" data-whole="/api/threads/file?id=${encodeURIComponent(f.id)}&whole=1" loading="lazy">`
    : `<span class="doc">${esc(f.name)}</span>`).join("")}</div>`;
}

function reactionsHtml(t, m) {
  const mine = m.reactions || [];
  if (!mine.length) return "";
  const chips = mine.map((r) => `<button data-ts="${esc(m.ts)}" data-name="${esc(r.name)}" data-on="${r.mine ? "off" : "on"}" class="${r.mine ? "mine" : ""}">
      <em>${emojiOf(r.name) || `:${esc(r.name)}:`}</em>${r.count}</button>`).join("");
  return `<div class="rx">${chips}<button class="add" data-add="${esc(m.ts)}">+</button></div>`;
}

function toolsHtml(t, m) {
  return `<div class="tools">
    <button data-add="${esc(m.ts)}">${phrase("react")}</button>
    <span class="sep"></span>
    <button class="pass" data-pass="${esc(m.ts)}">${phrase("send to the chat")}</button>
    <span class="sep"></span>
    <a class="go" data-out="1" href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">${phrase("Slack")}</a>
  </div>`;
}

function pickerHtml(ts) {
  return `<div class="picker" data-for="${esc(ts)}">${HANDY.map((name) =>
    `<button data-ts="${esc(ts)}" data-name="${esc(name)}" data-on="on">${emojiOf(name)}</button>`).join("")}</div>`;
}

function messageRow(t, m, before, fresh) {
  const sameHand = before && before.who === m.who && !before.files?.length
    && Number(m.ts) - Number(before.ts) < 300 && !fresh;
  const body = `${messageHtml(m, t.names)}${filesHtml(m)}${reactionsHtml(t, m)}`;
  const head = sameHand ? "" : `<div class="who"><b>${esc(m.who)}</b>${m.isApp ? `<span class="app">${phrase("app")}</span>` : ""}${m.role ? `<span class="role">${esc(m.role)}</span>` : ""}<time>${CLOCK(m.at)}</time></div>`;
  return `<div class="msg" data-ts="${esc(m.ts)}">
    ${sameHand ? `<span class="gut">${CLOCK(m.at)}</span>` : faceOf(m)}
    <div>${head}<div class="body">${body}</div></div>
    ${toolsHtml(t, m)}
    ${st.picking === m.ts ? pickerHtml(m.ts) : ""}
  </div>`;
}

function paintThread() {
  const t = st.threadChat ? threadOfChat(st.threadChat) : null;
  if (!t) return;
  st.openThread = t.key;
  $("th-chan").innerHTML = CHANNEL_GLYPH(t);
  const fresh = freshOf(t);
  $("th-meta").innerHTML = [
    t.opener ? `<span class="asked">${esc(t.opener)} asked · ${CLOCK(t.said?.[0]?.at || new Date().toISOString())}</span>` : "",
    `<span>${(t.said || []).length} message${(t.said || []).length === 1 ? "" : "s"}</span>`,
    fresh.length ? `<span style="color:var(--accent)">${phrase("{length} new", { length: fresh.length })}</span>` : "",
    t.can?.mark ? `<button id="th-read">${phrase("mark as read in Slack")}</button>` : "",
    `<a href="${esc(t.link)}" target="_blank" rel="noopener noreferrer">${phrase("open in Slack")}</a>`,
    t.stale ? `<span>${phrase("showing what was read before — {n}", { n: esc(t.stale) })}</span>` : ""
  ].filter(Boolean).join("<span>·</span>");

  const wall = $("th-msgs");
  const wasAtEnd = wall.scrollHeight - wall.scrollTop - wall.clientHeight < 60;
  const shape = [t.key, t.error || "", fresh[0]?.ts || "", st.picking || "",
    (t.said || []).map((m) => `${m.ts}${m.edited ? "e" : ""}${(m.reactions || []).map((r) => `${r.name}${r.count}${r.mine ? "m" : ""}`).join("")}`).join("|")].join("~");
  if (wall.dataset.shape === shape) {
    const footSame = $("th-foot").dataset.for === `${t.key}:${t.can?.post ? "post" : "read"}`;
    if (footSame) return;
  }
  wall.dataset.shape = shape;
  if (t.error) {
    wall.innerHTML = `<p class="th-empty">${phrase("Slack did not hand this thread over:")} <code>${esc(t.error)}</code></p>`;
  } else {
    const said = t.said || [];
    const firstFresh = fresh[0]?.ts || "";
    let day = "";
    wall.innerHTML = said.map((m, i) => {
      const stamp = DAY_NAME(m.at);
      const dayLine = stamp === day ? "" : `<div class="th-day"><span>${esc(stamp)}</span></div>`;
      day = stamp;
      const newLine = m.ts === firstFresh ? `<div class="th-new"><span>${phrase("new since you looked")}</span></div>` : "";
      return dayLine + newLine + messageRow(t, m, dayLine || newLine ? null : said[i - 1], m.ts === firstFresh);
    }).join("");
  }
  wireLinks(st.threadChat, wall);

  const foot = $("th-foot");
  const footFor = `${t.key}:${t.can?.post ? "post" : "read"}`;
  if (foot.dataset.for === footFor) {
    paintThreadActions(t, wall);
    if (wasAtEnd) pinToEnd(wall);
    return;
  }
  foot.dataset.for = footFor;
  if (t.can?.post) {
    foot.innerHTML = `<div class="to">${phrase("reply in the thread as")} <b>${phrase("you")}</b></div>
      <div class="th-box">
        <textarea id="th-say" rows="1" spellcheck="false" placeholder="${phrase("reply here — it lands in the thread")}"></textarea>
        <div class="bar"><span class="hint">${phrase("enter sends · shift+enter breaks the line")}</span><button class="send" id="th-send">${phrase("reply")}</button></div>
      </div>`;
    const box = $("th-say");
    box.value = threadDrafts.get(t.key) || "";
    box.addEventListener("input", () => {
      threadDrafts.set(t.key, box.value);
      box.style.height = "auto";
      box.style.height = `${Math.max(34, Math.min(140, box.scrollHeight))}px`;
    });
    box.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Escape") { ev.preventDefault(); return box.blur(); }
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); sendToThread(); }
    });
    $("th-send").addEventListener("click", sendToThread);
  } else {
    foot.innerHTML = `<p class="locked">${phrase("To reply from here the Slack token needs")} <code>${phrase("chat:write")}</code>${t.can?.why ? ` — ${esc(t.can.why)}` : ""}. The thread still reads fine.</p>`;
  }

  paintThreadActions(t, wall);
  if (wasAtEnd) pinToEnd(wall);
}

function pinToEnd(wall) {
  wall.scrollTop = wall.scrollHeight;
  wall.querySelectorAll(".th-files img").forEach((img) => img.addEventListener("load", () => {
    if (wall.scrollHeight - wall.scrollTop - wall.clientHeight < 400) wall.scrollTop = wall.scrollHeight;
  }, { once: true }));
}

function paintThreadActions(t, wall) {
  wall.querySelectorAll(".rx button[data-name], .picker button[data-name]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    react(t.key, b.dataset.ts, b.dataset.name, b.dataset.on !== "off");
  }));
  wall.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (!t.can?.react) return;
    st.picking = st.picking === b.dataset.add ? null : b.dataset.add;
    paintThread();
  }));
  wall.querySelectorAll("[data-pass]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    passToChat(t, b.dataset.pass);
  }));
  wall.querySelectorAll(".th-files img").forEach((img) => img.addEventListener("click", (ev) => {
    ev.stopPropagation();
    window.open(img.dataset.whole, "_blank", "noopener,noreferrer");
  }));
  $("th-read")?.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const d = await tellHive("/api/threads/read", { key: t.key, ts: t.newest });
    if (!d.ok) return;
    pullThreads(true);
  });
}

async function tellHive(where, said) {
  try {
    const r = await fetch(where, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(said) });
    return await r.json();
  } catch (wrong) { return { error: String(wrong.message || wrong) }; }
}

async function sendToThread() {
  const t = st.threadChat ? threadOfChat(st.threadChat) : null;
  const box = $("th-say");
  if (!t || !box) return;
  const text = box.value.trim();
  if (!text) return;
  const button = $("th-send");
  button.disabled = true;
  const d = await tellHive("/api/threads/reply", { key: t.key, text });
  button.disabled = false;
  if (!d.ok) return;
  threadDrafts.delete(t.key);
  box.value = "";
  box.style.height = "auto";
  markThreadSeen(t);
  pullThreads(true);
}

async function react(key, ts, name, on) {
  st.picking = null;
  await tellHive("/api/threads/react", { key, ts, name, on });
  pullThreads(true);
}

function passToChat(t, ts) {
  const m = (t.said || []).find((x) => x.ts === ts);
  if (!m) return;
  const e = pool.get(t.session);
  if (!e || e.ws?.readyState !== 1) return;
  const line = `${m.who} in #${String(t.channel || "").replace(/^#/, "")}: ${previewOf(m, t.names)}`;
  e.ws.send(line);
  takeKeyboard(t.session);
}

st.reviewingSince = 0;

let linesThisSession = 0;

st.prTab = "about";

st.openCheck = "";

const talks = new Map();

const commits = new Map();

const logs = new Map();

st.draft = "";

st.scrollTop = 0;

let lastPainted = null;

const diffs = new Map();

function readSeen() {
  try { return JSON.parse(localStorage.getItem("hive.seen") || "{}"); }
  catch { return {}; }
}

const seen = readSeen();

const saveSeen = () => localStorage.setItem("hive.seen", JSON.stringify(seen));

const seenOf = (key) => seen[key] || [];

const wasSeen = (key, path) => seenOf(key).includes(path);

const prsOnScreen = () => !$("prs").hidden;

const prVisible = () => prsOnScreen() || !!st.reviewChat;

let prMidPanel = null, prDetailPanel = null;

function movePrPanel(target) {
  prMidPanel ||= $("pr-mid");
  prDetailPanel ||= $("pr-detail");
  if (raycastOn() && target === $("prs")) {
    dressPrs();
    target = $("prs").querySelector(".pr-side");
  }
  if (!prMidPanel || prMidPanel.parentElement === target) return;
  target.appendChild(prMidPanel);
  target.appendChild(prDetailPanel);
}

function reviewInChat(name, key) {
  const p = (key && st.prs.find((x) => x.key === key)) || prOfChat(name);
  if (!p) return;
  if (experienceNext()) return openPrInASeat(p);
  if (st.cockChat) closeCockpit();
  if (st.webChat) closeBrowser();
  if (st.deviceChat) closeDevice();
  if (st.threadChat) closeThreadPanel();
  if (prsOnScreen()) closePrs();
  releaseKeyboard();
  if (st.openPr !== p.key) { st.openPr = p.key; st.openFile = null; }
  st.reviewChat = name;
  if (!st.reviewingSince) st.reviewingSince = Date.now();
  st.prBeat = PR_BEAT_OPEN;
  every("prs", PR_BEAT_OPEN, pullPrs);
  openTile(name, false);
  if (st.open !== name) {
    st.reviewChat = null;
    movePrPanel($("prs"));
    return openPrs();
  }
  paintPrs();
  pullPrs();
}

function exitReview() {
  if (!st.reviewChat) return;
  st.reviewChat = null;
  movePrPanel($("prs"));
  if (!prsOnScreen()) forgetPrPanels();
  st.prBeat = PR_BEAT_AWAY;
  every("prs", PR_BEAT_AWAY, pullPrs);
  render();
}

const filesOfPr = () => diffs.get(st.openPr) || null;

const notes = new Map();

const notesOf = (key) => notes.get(key) || [];

const attribution = new Map();

const seatLinesOf = (key, path) => new Set(attribution.get(key)?.files?.[path] || []);

async function pullAttribution(key, force = false) {
  if (!force && attribution.has(key)) return;
  attribution.set(key, null);
  try {
    const r = await fetch(`/api/prs/attribution?key=${encodeURIComponent(key)}`);
    const d = await r.json();
    attribution.set(key, d.ok && d.seat ? d : null);
  } catch { attribution.set(key, null); }
  if (prVisible() && st.openPr === key) paintPrs();
}

function attributionSay(key, f) {
  const said = attribution.get(key);
  if (!said?.seat || !f || f.binary || !f.added) return "";
  const n = seatLinesOf(key, f.path).size;
  return phrase("{n} of {m} added lines by {seat}", { n, m: f.added, seat: itemOf(said.seat)?.title || said.seat });
}

st.noteEdit = null;

st.noteSeat = "";

st.noteSent = "";

async function pullNotes(key, force = false) {
  if (!force && notes.has(key)) return;
  if (!notes.has(key)) notes.set(key, []);
  try {
    const r = await fetch(`/api/prs/notes?key=${encodeURIComponent(key)}`);
    const d = await r.json();
    notes.set(key, d.notes || []);
  } catch {}
  if (prVisible() && st.openPr === key) paintPrs();
}

function noteTargets(p) {
  const first = [st.reviewChat, p?.session].filter(Boolean);
  const live = (st.data?.sessions || []).filter((s) => s.kind !== "shell" && s.name);
  const rank = (s) => { const i = first.indexOf(s.name); return i < 0 ? first.length : i; };
  return live
    .map((s) => ({ name: s.name, title: s.title || s.name }))
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
}

function noteRowHtml(one) {
  const flags = [];
  if (one.lost) flags.push(phrase("the line this note was on is gone"));
  else if (one.moved) flags.push(phrase("moved to line {n}", { n: one.line }));
  else if (one.changed) flags.push(phrase("the line changed since"));
  if (one.sentAt && !one.resolved) flags.push(phrase("sent"));
  return `<div class="note ${one.resolved ? "resolved" : ""} ${one.lost ? "lost" : ""}" data-note="${esc(one.id)}">
      <span class="ntext">${esc(one.text)}</span>
      ${flags.map((flag) => `<span class="nflag">${flag}</span>`).join("")}
      <span class="nacts">
        <button class="nbtn" data-resolve="${esc(one.id)}">${one.resolved ? phrase("reopen") : phrase("resolve")}</button>
        <button class="nbtn" data-drop="${esc(one.id)}">${phrase("drop")}</button>
      </span>
    </div>`;
}

function noteEditorHtml() {
  return `<div class="note-edit">
      <textarea id="note-in" rows="2" spellcheck="false" placeholder="${phrase("what should change on this line")}"></textarea>
      <div class="nacts">
        <button class="btn" id="note-save">${phrase("keep the note")} <kbd>${IS_MAC ? "⌘" : "ctrl"}+⏎</kbd></button>
        <button class="btn" id="note-cancel">${phrase("cancel")} <kbd>esc</kbd></button>
      </div>
    </div>`;
}

const editingHere = (path, side, line) => !!st.noteEdit && st.noteEdit.path === path && st.noteEdit.side === side && st.noteEdit.line === line;

function notesBarHtml(p) {
  const all = notesOf(p.key);
  if (!all.length) return "";
  const open = openNotes(all);
  const resolved = all.length - open.length;
  const count = [
    open.length === 1 ? phrase("1 open note") : phrase("{n} open notes", { n: open.length }),
    resolved ? (resolved === 1 ? phrase("1 resolved") : phrase("{n} resolved", { n: resolved })) : ""
  ].filter(Boolean).join(" · ");
  const targets = noteTargets(p);
  const chosen = targets.find((t) => t.name === st.noteSeat) || targets[0];
  const who = targets.length > 1
    ? `<select id="note-seat" aria-label="${phrase("which chat gets the notes")}">${targets.map((t) => `<option value="${esc(t.name)}" ${t.name === chosen.name ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select>`
    : (chosen ? `<b>${esc(chosen.title)}</b>` : "");
  const act = !open.length ? ""
    : targets.length
      ? `<span class="nto">${phrase("send to")} ${who}</span><button class="btn" id="note-send">${phrase("send the notes")}</button>`
      : `<span class="notice">${phrase("no chat is up to take them")}</span><button class="btn" id="note-copy">${phrase("copy the batch")}</button>`;
  const said = st.noteSent === p.key ? `<span class="notice armed">${phrase("sent — the chat is on it")}</span>`
    : st.noteSent === `clip:${p.key}` ? `<span class="notice armed">${phrase("the batch is on your clipboard")}</span>` : "";
  return `<div class="pr-notes"><span class="ncount">${count}</span>${act}${said}</div>`;
}

async function saveNote(p, f) {
  const text = $("note-in")?.value.trim();
  const edit = st.noteEdit;
  if (!text || !edit) return;
  const d = await tellHive("/api/prs/notes", { key: p.key, path: f.path, side: edit.side, line: edit.line, code: edit.code, text });
  if (!d.ok) return;
  notes.set(p.key, d.notes || []);
  st.noteEdit = null;
  st.noteSent = "";
  paintPrs();
}

async function markNote(p, id, resolved) {
  const d = await tellHive("/api/prs/notes/edit", { key: p.key, id, resolved });
  if (d.ok) notes.set(p.key, d.notes || []);
  paintPrs();
}

async function dropNote(p, id) {
  const d = await tellHive("/api/prs/notes/remove", { key: p.key, id });
  if (d.ok) notes.set(p.key, d.notes || []);
  paintPrs();
}

async function sendNotes(p, toClipboard = false) {
  const d = await tellHive("/api/prs/notes/batch", { key: p.key, url: p.url || "" });
  if (!d.ok) return;
  notes.set(p.key, d.notes || []);
  const name = $("note-seat")?.value || st.noteSeat || noteTargets(p)[0]?.name;
  const target = (st.data?.sessions || []).find((s) => s.name === name);
  const went = !toClipboard && target ? sendToSeat(target, d.text) : false;
  if (!went) { try { await navigator.clipboard.writeText(d.text); } catch {} }
  st.noteSent = went ? p.key : `clip:${p.key}`;
  paintPrs();
}

function wireNotes(p, f) {
  const host = $("pr-diff");
  if (!host) return;
  host.querySelectorAll(".note-add").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    st.noteEdit = { path: f.path, side: b.dataset.side, line: Number(b.dataset.line), code: b.dataset.code || "" };
    paintPrs();
  }));
  host.querySelectorAll("[data-resolve]").forEach((b) => b.addEventListener("click", () => {
    const one = notesOf(p.key).find((x) => x.id === b.dataset.resolve);
    if (one) markNote(p, one.id, !one.resolved);
  }));
  host.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", () => dropNote(p, b.dataset.drop)));
  const box = $("note-in");
  if (!box) return;
  box.value = st.noteEdit?.draft || "";
  box.focus();
  box.addEventListener("input", () => { if (st.noteEdit) st.noteEdit.draft = box.value; });
  box.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); return saveNote(p, f); }
    if (ev.key === "Escape") { ev.preventDefault(); st.noteEdit = null; paintPrs(); }
  });
  $("note-save").addEventListener("click", () => saveNote(p, f));
  $("note-cancel").addEventListener("click", () => { st.noteEdit = null; paintPrs(); });
  box.scrollIntoView({ block: "nearest" });
}

function wireNotesBar(p) {
  $("note-seat")?.addEventListener("change", (ev) => { st.noteSeat = ev.target.value; });
  $("note-send")?.addEventListener("click", () => sendNotes(p));
  $("note-copy")?.addEventListener("click", () => sendNotes(p, true));
}

const prMoved = new Map();

function forgetWhatMoved(fresh) {
  for (const p of fresh) {
    const before = prMoved.get(p.key);
    if (before && before !== p.updatedAt) {
      talks.delete(p.key);
      commits.delete(p.key);
      diffs.delete(p.key);
      mergeTrouble.delete(p.key);
    }
    if (p.updatedAt) prMoved.set(p.key, p.updatedAt);
  }
}

const PR_BEAT_OPEN = 25000;

const PR_BEAT_RUNNING = 15000;

const PR_BEAT_AWAY = 60000;

st.prBeat = PR_BEAT_AWAY;

function keepPrBeat() {
  if (!prVisible()) return;
  const hot = st.prs.some((p) => p.ci === "running" && (p.state === "open" || p.state === "draft"));
  const beat = hot ? PR_BEAT_RUNNING : PR_BEAT_OPEN;
  if (beat === st.prBeat) return;
  st.prBeat = beat;
  every("prs", beat, pullPrs);
}

async function pullPrs() {
  try {
    const d = await apiGet("/api/prs");
    forgetWhatMoved(d.prs || []);
    st.prs = d.prs || [];
    st.prsRead = true;
    st.prsReadAt = Date.now();
    st.prsTrouble = "";
  } catch (wrong) {
    st.prsRead = true;
    st.prsTrouble = String(wrong?.message || wrong || phrase("could not reach the server"));
    if (raycastOn() && prsOnScreen()) paintPrs();
    return;
  }
  if (!st.openPr || !st.prs.some((p) => p.key === st.openPr)) st.openPr = st.prs[0]?.key || null;
  paintPrButton();
  if (prPopOpen()) paintPrPop();
  keepPrBeat();
  if (prVisible()) paintPrs();
}

function paintPrs() {
  if (raycastOn() && prsOnScreen()) movePrPanel($("prs"));
  paintPrList();
  paintPrMid();
  paintFile();
  if (raycastOn()) paintPrChrome();
}

function paintPrList() {
  prListSolid.show(raycastOn() ? prListWindowModel() : prListViewModel());
}

let prListSolid = null;

function prSeatModel(p) {
  if (!p.session) return { say: phrase("· no chat"), cls: "", go: "" };
  const seat = itemOf(p.session)?.title || p.session;
  if (!chatOfPr(p)) return { say: `· ${seat}`, cls: "go", go: "" };
  return { say: `· ${seat}`, cls: "go", go: p.session, hint: phrase("open the review inside this chat") };
}

function prRowModel(p) {
  const chips = [];
  if (p.error) chips.push({ key: "error", ci: "failed", say: p.error.slice(0, 22) });
  else {
    if (p.state !== "open") chips.push({ key: "state", state: p.state, say: p.state });
    chips.push({ key: "ci", ci: p.ci || "none", say: CI_LABEL[p.ci] || "no ci" });
    if (p.review) chips.push({ key: "review", rev: p.review, say: REVIEW_LABEL[p.review] || p.review });
  }
  if (p.stale) chips.push({ key: "stale", hint: p.stale, say: phrase("not refreshed") });
  const where = `${p.repo.split("/").pop()}#${p.number}`;
  return {
    key: p.key, here: p.key === st.openPr,
    title: p.title || p.error || p.key,
    where,
    ...(raycastOn() ? { number: `#${p.number}`, section: prSection(p), status: prStatus(p), hint: [where, p.title, p.stale].filter(Boolean).join(" · ") } : {}),
    chips, seat: prSeatModel(p)
  };
}

const PR_SECTIONS = [["asks", "Needs you"], ["mine", "Yours"], ["team", "The team's"]];

const PR_FILTERS = [["all", "All"], ["asks", "Needs you"], ["mine", "Yours"], ["team", "The team's"], ["failing", "CI failing"]];

const prOpen = (p) => p.state === "open" || p.state === "draft";

const waitsOnMyReview = (p) => !p.error && !p.mine && p.state === "open" && p.review !== "approved" && p.review !== "changes_requested";

const asksForYou = (p) => p.ci === "failed" || p.mergeable === "conflicting" || p.review === "changes_requested" || waitsOnMyReview(p);

function prSection(p) {
  if (!p.error && prOpen(p) && asksForYou(p)) return "asks";
  return p.mine || p.error ? "mine" : "team";
}

function prStatus(p) {
  if (p.error) return { say: phrase("unreadable"), tone: "warn", icon: "i-warn" };
  if (p.state === "merged") return { say: phrase("merged"), icon: "i-check" };
  if (p.state === "closed") return { say: phrase("closed"), badge: true };
  if (p.ci === "failed") return { say: phrase("CI failed"), dot: "needs" };
  if (p.mergeable === "conflicting") return { say: phrase("conflict"), tone: "warn", icon: "i-warn" };
  if (p.review === "changes_requested") return { say: phrase("changes requested"), icon: "i-pen" };
  if (p.state === "draft") return { say: phrase("draft"), badge: true };
  if (waitsOnMyReview(p)) return { say: phrase("your review"), icon: "i-user" };
  if (p.ci === "running") return { say: phrase("CI running"), dot: "working" };
  if (p.review === "approved") return { say: phrase("approved"), icon: "i-check" };
  if (p.ci === "passed") return { say: phrase("CI ok"), icon: "i-check" };
  return { say: phrase("no ci") };
}

function prMatches(p, query) {
  const q = query.trim().toLowerCase();
  if (!q || prLinkOf(q)) return true;
  return `${p.title || ""} ${p.repo} #${p.number} ${p.author || ""} ${p.branch || ""}`.toLowerCase().includes(q);
}

function prKept(p) {
  const filter = st.prFilter || "all";
  if (filter === "failing" && p.ci !== "failed") return false;
  if (filter !== "all" && filter !== "failing" && prSection(p) !== filter) return false;
  return prMatches(p, st.prQuery || "");
}

function prsShown() {
  const kept = prsWorthShowing().filter(prKept);
  return PR_SECTIONS.flatMap(([key]) => kept.filter((p) => prSection(p) === key));
}

function prListWindowModel() {
  if (!st.prs.length) {
    return {
      raycast: true, rows: [], sections: [], none: "",
      loading: st.prsRead ? "" : phrase("reading the pull requests from GitHub…"),
      blank: phrase("No PR in the list. A session that opens a PR lands here on its own — or paste the url above.")
    };
  }
  const rows = prsShown().map(prRowModel);
  return {
    raycast: true, rows, loading: "", blank: "",
    none: rows.length ? "" : phrase("No PR matches “{query}”.", { query: (st.prQuery || "").trim() || phrase(PR_FILTERS.find(([key]) => key === st.prFilter)?.[1] || "All") }),
    sections: PR_SECTIONS.map(([key, say]) => ({ key, say: phrase(say), rows: rows.filter((row) => row.section === key) }))
      .filter((section) => section.rows.length)
      .map((section) => ({ ...section, count: section.rows.length }))
  };
}

function pickPr(key) {
  if (st.openPr !== key) { st.openPr = key; st.openFile = null; st.openCheck = ""; if (raycastOn()) st.prTab = "about"; }
  paintPrs();
  $("prs").querySelector(`[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" });
}

function prListViewModel() {
  if (!st.prs.length) {
    return { rows: [], blank: phrase("No PR in the list. A session that opens a PR lands here on its own — or paste the url above.") };
  }
  return { rows: st.prs.map(prRowModel), blank: "" };
}

solidMounts.push((hive) => {
  prListSolid = hive.mountPrList($("pr-items"), {
    actions: {
      pick: (key) => {
        if (raycastOn()) {
          pickPr(key);
          $("pr-url").focus();
          return;
        }
        const p = experienceNext() && st.prs.find((x) => x.key === key);
        if (p) return openPrInASeat(p);
        st.openPr = key; st.openFile = null; st.openCheck = ""; paintPrs();
      },
      review: (session, key) => reviewInChat(session, key)
    }
  });
});

function markMd(text) {
  return esc(text)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/^#{1,6}\s+(.+)$/gm, '<b class="md-h">$1</b>')
    .replace(/^&gt;\s?(.*)$/gm, '<span class="md-q">$1</span>');
}

function paintPrMid() {
  prMidSolid.show(raycastOn() ? prMidWindowModel() : prMidViewModel());
  const p = st.prs.find((x) => x.key === st.openPr);
  if (!p || p.error) return;
  wireLinks(st.reviewChat || p.session, $("pr-mid"));
  if (!filesOfPr()) pullDiff(p.key);
}

let prMidSolid = null;

function prFileModel(p, f) {
  const isSeen = wasSeen(p.key, f.path);
  return {
    key: f.path, path: f.path, here: f.path === st.openFile, seen: isSeen, noise: !!f.noise,
    hint: `${f.path}${f.noise ? phrase(" — noise, does not ask to be read") : ""}`,
    mark: svgIcon(isSeen ? "i-check" : "g-idle"),
    weight: f.binary
      ? (f.picture ? phrase("image") : "bin")
      : raycastOn() ? `<span class="add">+${f.added}</span> <span class="del">-${f.removed}</span>`
        : `<span style="color:var(--green)">+${f.added}</span> <span style="color:${removedHue()}">-${f.removed}</span>`
  };
}

function prQueueModel(p) {
  const files = filesOfPr();
  const alreadySeen = files ? files.filter((f) => wasSeen(p.key, f.path)).length : 0;
  return {
    caption: `files ${files ? `· ${alreadySeen} of ${files.length} seen` : ""}`,
    reading: phrase("reading the diff…"),
    files: files ? files.map((f) => prFileModel(p, f)) : null
  };
}

function prGaugeModel() {
  const minutes = st.reviewingSince ? Math.floor((Date.now() - st.reviewingSince) / 60000) : 0;
  return {
    full: linesThisSession >= LINE_CAP || minutes >= MINUTE_CAP,
    slice: Math.min(100, Math.round((linesThisSession / LINE_CAP) * 100)),
    lines: linesThisSession, of: `of ~${LINE_CAP} lines`,
    minutes, sitting: phrase("min in this sitting"),
    message: linesThisSession >= LINE_CAP
      ? "Past 400 lines in this sitting. From here on you are reading, not seeing — a pause is worth more than pushing through."
      : minutes >= MINUTE_CAP
        ? "More than an hour reviewing straight. From here attention drops no matter who you are."
        : ""
  };
}

function prMidViewModel() {
  const p = st.prs.find((x) => x.key === st.openPr);
  if (!p) {
    return { head: null, blank: `${phrase("Nothing in the queue.")}<br>${phrase("A session that opens a PR lands here on its own.")}` };
  }
  if (p.error) {
    return {
      blank: "", trouble: p.error,
      head: {
        title: `${p.repo.split("/").pop()}#${p.number}`,
        link: null, chip: p.state === "?" ? "unreadable" : p.state,
        notes: p.session ? [{ key: "seat", say: itemOf(p.session)?.title || p.session }] : [],
        conflict: "", branches: "", ciDetail: ""
      }
    };
  }
  const files = filesOfPr();
  const alreadySeen = files ? files.filter((f) => wasSeen(p.key, f.path)).length : 0;
  return {
    blank: "", trouble: "",
    head: {
      title: p.title || p.key,
      link: { href: p.url || "#", say: `${p.repo.split("/").pop()}#${p.number}` },
      chip: "",
      notes: [
        ...(p.author ? [{ key: "author", say: `by ${p.author}` }] : []),
        ...(p.files ? [{ key: "weight", html: `<span style="color:var(--green)">+${p.added}</span> <span style="color:${removedHue()}">-${p.removed}</span>` }] : [])
      ],
      conflict: p.mergeable === "conflicting" ? phrase("conflict") : "",
      branches: `${p.branch || ""} → ${p.base || ""}`,
      ciDetail: p.ciDetail || ""
    },
    body: {
      open: !!p.body, summary: phrase("what the author said"),
      html: p.body ? markMd(p.body) : `<span style='color:var(--txt-3)'>${phrase("PR with no description")}</span>`
    },
    queue: {
      caption: `files ${files ? `· ${alreadySeen} of ${files.length} seen` : ""}`,
      reading: phrase("reading the diff…"),
      files: files ? files.map((f) => prFileModel(p, f)) : null
    },
    gauge: prGaugeModel()
  };
}

const cutMiddle = (text, keep = 30) => {
  const s = String(text || "");
  if (s.length <= keep) return s;
  const head = Math.ceil((keep - 1) / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - (keep - 1 - head))}`;
};

function prEmptyModel() {
  if (st.prsTrouble && !st.prs.length) {
    return {
      icon: "i-warn", warn: true, head: phrase("GitHub did not answer"),
      say: st.prsReadAt ? phrase("The list is the last one read, {when} ago.", { when: ago(new Date(st.prsReadAt).toISOString()) }) : phrase("Nothing was read yet."),
      detail: st.prsTrouble, copySay: phrase("copy"), tips: []
    };
  }
  if (st.prs.length || !st.prsRead) return null;
  return {
    icon: "i-pr", head: phrase("No open PRs"),
    say: phrase("A session that opens a PR lands here on its own. To follow a PR from outside, paste its url."),
    paste: { placeholder: "github.com/owner/repo/pull/…", keys: capsOf({ meta: true, code: "KeyV" }) },
    tips: [
      { key: "prs", keys: capsOf(st.keys.prs), say: phrase("opens and closes this panel") },
      { key: "esc", keys: ["esc"], say: phrase("back to the wall") }
    ]
  };
}

function prMidWindowModel() {
  const p = st.prs.find((x) => x.key === st.openPr);
  if (!p) {
    return { raycast: true, head: null, empty: prEmptyModel(), blank: `${phrase("Nothing in the queue.")}<br>${phrase("A session that opens a PR lands here on its own.")}` };
  }
  const where = `${p.repo.split("/").pop()}#${p.number}`;
  if (p.error) {
    return {
      raycast: true, blank: "", trouble: p.error, empty: null, inChat: !!st.reviewChat,
      head: {
        title: where, where,
        link: null, chip: p.state === "?" ? "unreadable" : p.state,
        notes: p.session ? [{ key: "seat", say: itemOf(p.session)?.title || p.session }] : [],
        conflict: "", branches: "", branch: "", branchSay: "", ciDetail: "", when: "", copySay: ""
      }
    };
  }
  return {
    raycast: true, blank: "", trouble: "", empty: null, inChat: !!st.reviewChat,
    head: {
      title: p.title || p.key, where,
      link: { href: p.url || "#", say: where },
      chip: "",
      notes: [
        ...(p.author ? [{ key: "author", say: p.author }] : []),
        ...(p.files ? [{ key: "weight", html: `<span class="add">+${p.added}</span> <span class="del">-${p.removed}</span>` }] : [])
      ],
      conflict: p.mergeable === "conflicting" ? phrase("conflict") : "",
      branches: `${p.branch || ""} → ${p.base || ""}`,
      branch: p.branch || "",
      branchSay: `${cutMiddle(p.branch, 28)} → ${p.base || ""}`,
      copySay: phrase("copy the branch"),
      ciDetail: p.ciDetail || "",
      when: p.stale ? p.stale : p.updatedAt ? phrase("{when} ago", { when: ago(p.updatedAt) }) : ""
    },
    gauge: prGaugeModel()
  };
}

solidMounts.push((hive) => {
  prHive = hive;
  prMidSolid = hive.mountPrMid($("pr-mid"), {
    actions: {
      openFile: (path) => { st.openFile = path; paintPrs(); },
      copy: (button, text) => copyWithWord(button, text),
      paste: (link) => registerPr(link)
    }
  });
});

let prHive = null;

function prKvHtml(p) {
  const seat = p.session ? itemOf(p.session) : null;
  const live = seat && st.data.sessions?.find((one) => one.name === p.session);
  const state = live?.state || "";
  const seatSay = seat
    ? `<span class="rc-dot ${esc(state || "idle")}" aria-hidden="true"></span><span>${esc(seat.title || p.session)}</span><span class="mono">${esc(state ? phrase(LABEL[state] || state) : phrase("closed"))}</span>`
    : `<span class="mono">${esc(phrase("no chat"))}</span>`;
  const m = mergeState(p);
  const mergeSay = merging.has(p.key) ? phrase(MERGE_BUSY[merging.get(p.key)].says) : m ? m.label : phrase(p.state);
  const trouble = mergeTrouble.get(p.key);
  return `<dl class="pw-kv pr-kv">
      <dt>${esc(phrase("Seat"))}</dt><dd>${seatSay}</dd>
      <dt>${esc(phrase("Review status"))}</dt><dd>${esc(p.review ? phrase(REVIEW_LABEL[p.review] || p.review) : phrase("no review"))}${p.mine ? `<span class="mono">${esc(phrase("your PR: GitHub will not let you approve your own"))}</span>` : ""}</dd>
      <dt>${esc(phrase("Merge"))}</dt><dd><span>${esc(mergeSay)}</span>${m && !m.locked && !merging.has(p.key) ? keysHtml(MERGE_KEY) : ""}${trouble ? `<span class="pw-st warn">${svgIcon("i-warn")}${esc(trouble)}</span>` : ""}</dd>
    </dl>`;
}

function paintFile() {
  const p = st.prs.find((x) => x.key === st.openPr);
  if (!p && raycastOn()) { $("pr-detail").innerHTML = st.reviewChat ? `<div class="pr-blank">${phrase("Pick a PR.")}</div>` : ""; return; }
  if (!p) { $("pr-detail").innerHTML = `<div class="pr-blank">${phrase("Pick a PR.")}</div>`; return; }
  if (p.error) return paintPrTrouble(p);
  if (!prTabs().some((t) => t.id === st.prTab)) st.prTab = "diff";

  const body = st.prTab === "about" ? aboutHtml(p)
    : st.prTab === "checks" ? checksHtml(p)
    : st.prTab === "talk" ? talkHtml(p)
    : st.prTab === "commits" ? commitsHtml(p)
    : diffHtml(p);

  if (raycastOn()) {
    const after = st.reviewChat ? reviewHtml(p) : st.prTab === "talk" ? reviewHtml(p, { short: true }) : prKvHtml(p);
    $("pr-detail").innerHTML = tabsHtml(p) + body + after;
  } else {
    $("pr-detail").innerHTML = tabsHtml(p) + body + reviewHtml(p);
  }
  wirePrTabs(p);
  if (!raycastOn() || st.reviewChat || st.prTab === "talk") wireReview(p);
  if (st.prTab === "diff") wireDiff(p);
  if (st.prTab === "checks") wireChecks(p);
  if (st.prTab === "talk") wireTalk(p);
  if (st.prTab === "about") wireLinks(st.reviewChat || p.session, $("pr-detail"));
  askForTab(p);
}

function paintPrTrouble(p) {
  $("pr-detail").innerHTML = `<div class="pr-blank pr-trouble">
      <b>${esc(p.repo)}#${p.number}</b>
      <p>${esc(p.error)}</p>
      <p class="hint">${phrase("Nothing can be read or done here — no diff, no checks, no review. A pull request that was deleted, or a url that never was one, drops off the list on the next round.")}</p>
      <div class="row">
        <a class="btn" data-out="1" href="${esc(`https://github.com/${p.repo}/pull/${p.number}`)}" target="_blank" rel="noreferrer">${phrase("try it on GitHub")}</a>
        <button class="btn" data-action="forget">${phrase("take off the list")}</button>
      </div>
    </div>`;
  $("pr-detail").querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", () => reviewPr(p, b.dataset.action)));
}

/* the classic look already shows the description above the file queue, so only the
   raycast window gets it as a tab of its own */
const ABOUT_TAB = { id: "about", label: "description" };

const PR_TABS = [
  { id: "diff", label: "diff" },
  { id: "checks", label: "checks" },
  { id: "talk", label: "conversation" },
  { id: "commits", label: "commits" }
];

const prTabs = () => (raycastOn() ? [ABOUT_TAB, ...PR_TABS] : PR_TABS);

const CI_DOT = { failed: "var(--accent)", running: "var(--yellow)", passed: "var(--green)" };

const removedHue = () => (raycastOn() ? "var(--red)" : "var(--accent)");

const failedHue = () => (raycastOn() ? "var(--signal)" : "var(--accent)");

const ciDot = (ci) => (ci === "failed" ? failedHue() : CI_DOT[ci]);

function tabCount(p, id) {
  if (id === "about") return 0;
  if (id === "diff") return filesOfPr()?.length || 0;
  if (id === "checks") return (p.checks || []).length;
  if (id === "talk") return talks.get(p.key)?.length || 0;
  return commits.get(p.key)?.length || 0;
}

const CI_RC_DOT = { failed: "needs", running: "working", passed: "done" };

function tabsHtml(p) {
  if (raycastOn()) {
    const broken = (p.checks || []).filter((c) => c.state === "failed").length;
    const tabs = prTabs().map((t) => {
      const dot = t.id === "checks" && CI_RC_DOT[p.ci] ? `<span class="rc-dot ${CI_RC_DOT[p.ci]}" aria-hidden="true"></span>` : "";
      const n = tabCount(p, t.id);
      const count = t.id === "checks" && broken ? `<span class="n">${esc(phrase("{n} failed", { n: broken }))}</span>` : n ? `<span class="n">${n}</span>` : "";
      return `<button class="pw-tab" role="tab" aria-selected="${t.id === st.prTab}" data-tab="${t.id}">${phrase(t.label)}${dot}${count}</button>`;
    }).join("");
    return `<div class="pw-tabs pr-tabs" role="tablist">${tabs}</div>`;
  }
  const tabs = PR_TABS.map((t) => {
    const dot = t.id === "checks" && CI_DOT[p.ci] ? `<span class="dot" style="background:${ciDot(p.ci)}"></span>` : "";
    const n = tabCount(p, t.id);
    const count = !dot && n ? `<span class="n">${n}</span>` : "";
    return `<button class="tb ${t.id === st.prTab ? "on" : ""}" data-tab="${t.id}">${phrase(t.label)}${dot}${count}</button>`;
  }).join("");
  const when = p.stale ? p.stale : p.updatedAt ? `moved ${ago(p.updatedAt)} ago` : "";
  return `<div class="pr-tabs">${tabs}<span class="when">${esc(when)}</span></div>`;
}

function wirePrTabs(p) {
  $("pr-detail").querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    st.prTab = b.dataset.tab;
    paintPrs();
  }));
}

function reviewHtml(p, { short = false } = {}) {
  return `<div class="pr-review">
      ${notesBarHtml(p)}
      <textarea id="pr-text" spellcheck="false" placeholder="${phrase("what you have to say about this PR")}"></textarea>
      <div class="pr-actions">
        <button class="btn" data-action="comment">${phrase("comment")}</button>
        <button class="btn" data-action="changes">${phrase("request changes")}</button>
        ${p.mine ? "" : `<button class="btn" data-action="approve">${phrase("approve")}</button>`}
        ${short ? "" : `${mergeButton(p)}
        ${p.branchLeft ? `<button class="btn" data-action="branch">${phrase("delete branch")}</button>` : ""}
        <a class="btn" href="${esc(p.url || "#")}" target="_blank" rel="noreferrer">${phrase("open on GitHub")}</a>
        <button class="btn" data-action="forget">${phrase("take off the list")}</button>`}
        <span class="notice">${p.mine ? phrase("your PR: GitHub will not let you approve your own") : ""}</span>
      </div>
    </div>`;
}

function wireReview(p) {
  $("pr-text").value = st.draft;
  $("pr-text").addEventListener("input", (ev) => { st.draft = ev.target.value; });
  $("pr-detail").querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.action === "merge") return mergePr(p, b);
    if (b.dataset.action === "force") return mergePr(p, b, true);
    if (b.dataset.action === "branch") return deleteBranch(p, b);
    reviewPr(p, b.dataset.action);
  }));
  wireNotesBar(p);
}

const SHOT_SIDES = { new: ["after"], renamed: ["after"], deleted: ["before"] };

function shotSrc(p, f, side) {
  return `/api/prs/picture?${new URLSearchParams({ key: p.key, path: f.path, side, at: p.updatedAt || "" })}`;
}

function shotsHtml(p, f) {
  if (!f.picture) return "";
  const sides = SHOT_SIDES[f.mode] || ["before", "after"];
  return `<div class="shots">${sides.map((side) => `<figure class="shot ${side === "before" ? "was" : "now"}">
      <b>${side === "before" ? phrase("was") : phrase("now")}</b>
      <img src="${esc(shotSrc(p, f, side))}" alt="${esc(f.path)}" loading="lazy">
      <figcaption hidden>${phrase("nothing on this side")}</figcaption>
    </figure>`).join("")}</div>`;
}

function diffHtml(p) {
  const files = filesOfPr();
  if (!files) return `<div class="pr-blank">${phrase("reading the diff of {n}#{number}…", { n: esc(p.repo.split("/").pop()), number: p.number })}</div>`;
  if (!files.length) return `<div class="pr-blank">${phrase("This PR has no diff to show.")}</div>`;

  if (!st.openFile || !files.some((f) => f.path === st.openFile)) {
    st.openFile = (files.find((f) => !f.noise && !wasSeen(p.key, f.path)) || files[0]).path;
  }
  const f = files.find((x) => x.path === st.openFile);
  const isSeen = wasSeen(p.key, f.path);
  if (raycastOn()) return diffWindowHtml(p, f, isSeen);

  return `<div class="tab-body with-head">
    <div class="file-top">
      <div class="file-head">
        <span class="path" title="${esc(f.path)}">${esc(f.path)}</span>
        <span class="weight">${MODE[f.mode] || ""} ${f.binary ? (f.picture ? phrase("image") : "binary") : `<span style="color:var(--green)">+${f.added}</span> <span style="color:${removedHue()}">-${f.removed}</span>`}${f.noise ? " · noise" : ""}${attributionSay(p.key, f) ? ` · <span class="by-seat">${attributionSay(p.key, f)}</span>` : ""}</span>
        <button class="btn" id="pr-seen">${isSeen ? "unmark" : "seen, next"} <kbd>v</kbd></button>
      </div>
    </div>
    <pre class="diff ${whole(f) ? "plain" : ""}" id="pr-diff">${shotsHtml(p, f)}${f.binary ? (f.picture ? "" : `<div class="raw">${phrase("binary file")}</div>`) : paintDiff(f)}</pre>
  </div>`;
}

function diffWindowHtml(p, f, isSeen) {
  const queue = prQueueModel(p);
  return `<div class="tab-body pr-split">
    <div class="pr-files" aria-label="${esc(phrase("files"))}">
      <p class="pw-cap">${esc(queue.caption)}</p>
      ${queue.files.map((one) => `<button type="button" class="file ${one.here ? "here" : ""} ${one.seen ? "seen" : ""} ${one.noise ? "noisy" : ""}" data-path="${esc(one.path)}" title="${esc(one.hint)}"><span class="mk">${one.mark}</span><span class="name">${esc(one.path)}</span><span class="weight">${one.weight}</span></button>`).join("")}
    </div>
    <div class="tab-body with-head">
    <div class="file-top">
      <div class="file-head">
        <span class="path" title="${esc(f.path)}">${esc(f.path)}</span>
        <span class="weight">${MODE[f.mode] || ""} ${f.binary ? (f.picture ? phrase("image") : "binary") : `<span class="add">+${f.added}</span> <span class="del">-${f.removed}</span>`}${f.noise ? " · noise" : ""}${attributionSay(p.key, f) ? ` · <span class="by-seat">${attributionSay(p.key, f)}</span>` : ""}</span>
        <button class="btn" id="pr-seen">${isSeen ? "unmark" : "seen, next"} <kbd>v</kbd></button>
      </div>
    </div>
    <pre class="diff ${whole(f) ? "plain" : ""}" id="pr-diff">${shotsHtml(p, f)}${f.binary ? (f.picture ? "" : `<div class="raw">${phrase("binary file")}</div>`) : paintDiff(f)}</pre>
    </div>
  </div>`;
}

function wireDiff(p) {
  const f = (filesOfPr() || []).find((x) => x.path === st.openFile);
  if (!f) return;
  if (lastPainted === f.path) $("pr-diff").scrollTop = st.scrollTop;
  lastPainted = f.path;
  $("pr-diff").addEventListener("scroll", () => { st.scrollTop = $("pr-diff").scrollTop; });
  $("pr-seen").addEventListener("click", () => toggleSeen(p, f));
  const list = raycastOn() ? $("pr-detail").querySelector(".pr-files") : null;
  if (list) {
    list.querySelector(".file.here")?.scrollIntoView({ block: "nearest" });
    list.addEventListener("click", (ev) => {
      const row = ev.target.closest("[data-path]");
      if (row) { st.openFile = row.dataset.path; paintPrs(); }
    });
  }
  $("pr-diff").querySelectorAll(".shot img").forEach((img) => {
    img.addEventListener("error", () => {
      img.hidden = true;
      img.parentElement.querySelector("figcaption").hidden = false;
    });
    img.addEventListener("click", () => window.open(img.src, "_blank", "noopener,noreferrer"));
  });
  wireNotes(p, f);
}

const CHECK_MARK = { passed: svgIcon("i-check"), failed: svgIcon("i-x"), running: svgIcon("g-working"), skipped: "–" };

const CHECK_RC_MARK = { passed: svgIcon("i-check"), failed: '<span class="rc-dot needs" aria-hidden="true"></span>', running: '<span class="rc-dot working" aria-hidden="true"></span>', skipped: "–" };

function tookSays(ms) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function chosenCheck(p) {
  const checks = p.checks || [];
  if (!checks.length) return null;
  const here = checks.find((c) => c.name === st.openCheck);
  return here || checks.find((c) => c.state === "failed") || checks.find((c) => c.state === "running") || checks[0];
}

function checksHtml(p) {
  const checks = p.checks || [];
  if (!checks.length) {
    return `<div class="tab-body"><div class="pr-blank">${phrase("No check on this PR.")}<br>${phrase("Nothing in the repository runs on a pull request.")}</div></div>`;
  }
  const broken = checks.filter((c) => c.state === "failed").length;
  const running = checks.filter((c) => c.state === "running").length;
  const said = broken ? phrase("{n} checks · {broken} failed", { n: checks.length, broken: broken })
    : running ? phrase("{n} checks · {running} still running", { n: checks.length, running: running })
    : phrase("{n} checks · all green", { n: checks.length });
  const runs = [...new Set(checks.map((c) => c.run).filter(Boolean))];
  const chosen = chosenCheck(p);

  const rows = checks.map((c) => `
    <div class="pr-ck ${c.name === chosen?.name ? "here" : ""}" data-state="${esc(c.state)}" data-check="${esc(c.name)}" title="${esc(c.name)}">
      <span class="mk">${(raycastOn() ? CHECK_RC_MARK : CHECK_MARK)[c.state] || "·"}</span>
      <span class="name">${esc(c.name)}</span>
      <span class="flow">${esc(c.workflow || (c.run ? "" : "external status"))}</span>
      <span class="took">${c.state === "running" ? "running" : tookSays(c.took)}</span>
    </div>`).join("");

  return `<div class="tab-body checks">
    <div class="pr-ckbar">
      <p class="said">${esc(said)}</p>
      ${broken && runs.length ? `<button class="btn" data-rerun="failed"${raycastOn() ? "" : ' style="border-color:var(--accent-d);color:var(--accent)"'}>${phrase("rerun the failed ones")}</button>` : ""}
      ${runs.length ? `<button class="btn" data-rerun="all">${phrase("rerun everything")}</button>` : ""}
    </div>
    <div class="pr-cklist">${rows}</div>
    ${logHtml(p, chosen)}
  </div>`;
}

function logHtml(p, check) {
  if (!check) return `<div class="pr-joblog"></div>`;
  const head = `<div class="file-head">${raycastOn() ? `<span class="path" data-state="${esc(check.state)}">` : `<span class="path" style="${check.state === "failed" ? `color:${failedHue()}` : ""}">`}${esc(check.name)}</span>
    <span class="weight">${esc(check.workflow ? `workflow ${check.workflow}` : "external status")} · ${check.state === "running" ? "running" : tookSays(check.took)}</span>
    ${check.url ? `<a class="btn" href="${esc(check.url)}" target="_blank" rel="noreferrer">${phrase("open on GitHub")}</a>` : ""}</div>`;

  if (!check.job) {
    return head + `<div class="pr-joblog"><p class="none">${phrase("This one is not a GitHub Actions job — it reports a status and keeps no log here.")}</p></div>`;
  }
  const log = logs.get(logKey(p.key, check.job));
  if (log === undefined || log === null) return head + `<div class="pr-joblog"><p class="none">${phrase("reading the log…")}</p></div>`;
  if (log.empty) return head + `<div class="pr-joblog"><p class="none">${esc(log.empty)}</p></div>`;
  if (!log.lines.length) return head + `<div class="pr-joblog"><p class="none">${phrase("This job finished without a failing step.")}</p></div>`;

  let step = "";
  const out = [];
  if (log.cut) out.push(`<div class="cut">${phrase("⋯ {cut} lines before this one were cut — open on GitHub for the whole log", { cut: log.cut })}</div>`);
  for (const l of log.lines) {
    if (l.step && l.step !== step) { step = l.step; out.push(`<div class="step">${esc(step)}</div>`); }
    out.push(`<div class="ln ${l.kind === "bad" ? "bad" : ""}">${l.kind === "group" ? `<svg class="lg" aria-hidden="true"><use href="#i-chev"/></svg>` : ""}${esc(l.text)}</div>`);
  }
  return head + `<div class="pr-joblog" id="pr-log">${out.join("")}</div>`;
}

function wireChecks(p) {
  $("pr-detail").querySelectorAll("[data-check]").forEach((el) => el.addEventListener("click", () => {
    st.openCheck = el.dataset.check;
    paintPrs();
  }));
  $("pr-detail").querySelectorAll("[data-rerun]").forEach((b) => b.addEventListener("click", () => {
    rerunChecks(p, b.dataset.rerun === "failed", b);
  }));
}

const VERDICT_CLASS = { approved: "verdict-approved", "asked for changes": "verdict-changes" };

function aboutHtml(p) {
  const said = p.body ? markMd(p.body) : `<span class="none">${phrase("PR with no description")}</span>`;
  return `<div class="tab-body"><div class="pr-about" id="pr-about" tabindex="-1">${said}</div></div>`;
}

function talkHtml(p) {
  const talk = talks.get(p.key);
  if (!talk) return `<div class="tab-body"><div class="pr-blank">${phrase("reading the conversation…")}</div></div>`;

  const said = talk.length ? `${talk.length} ${talk.length === 1 ? "message" : "messages"}` : "";
  const opened = `<div class="pr-msg">
      <div class="who"><b>${esc(p.author || "the author")}</b><span>${phrase("opened the PR")}</span></div>
      <div class="said">${p.body ? markMd(p.body) : `<span style='color:var(--txt-3)'>${phrase("PR with no description")}</span>`}</div>
    </div>`;

  const rest = talk.map((t) => {
    const badge = t.kind === "review" ? `<span class="verdict">${esc(t.verdict || phrase("reviewed"))}</span>`
      : t.kind === "inline" ? `<span>${phrase("commented on the diff")}</span>`
      : `<span>${phrase("commented")}</span>`;
    const at = t.kind === "inline" && t.path
      ? `<div class="at" data-goto-file="${esc(t.path)}">${esc(t.path)}${t.line ? `:${t.line}` : ""}</div>${t.hunk ? `<div class="hunk">${esc(t.hunk)}</div>` : ""}`
      : "";
    return `<div class="pr-msg ${VERDICT_CLASS[t.verdict] || ""}">
      <div class="who"><b>${esc(t.who)}</b>${badge}<span class="when">${esc(t.when ? phrase("{when} ago", { when: ago(t.when) }) : "")}</span></div>
      ${at}
      ${t.body ? `<div class="said">${markMd(t.body)}</div>` : ""}
    </div>`;
  }).join("");

  return `<div class="tab-body with-head">
    <div class="pr-ckbar"><p class="said">${esc(said || "nothing said yet")}</p></div>
    <div class="pr-talk">${opened}${rest}</div>
  </div>`;
}

function wireTalk(p) {
  wireLinks(st.reviewChat || p?.session, $("pr-detail"));
  $("pr-detail").querySelectorAll("[data-goto-file]").forEach((el) => el.addEventListener("click", () => {
    st.openFile = el.dataset.gotoFile;
    st.prTab = "diff";
    paintPrs();
  }));
}

function commitsHtml(p) {
  const list = commits.get(p.key);
  if (!list) return `<div class="tab-body"><div class="pr-blank">${phrase("reading the commits…")}</div></div>`;
  if (!list.length) return `<div class="tab-body"><div class="pr-blank">${phrase("No commit on this PR.")}</div></div>`;
  const rows = list.map((c) => `
    <div class="pr-cm">
      <span class="subject">${esc(c.title)}</span>
      <a class="sha" href="${esc(`https://github.com/${p.repo}/commit/${c.sha}`)}" target="_blank" rel="noreferrer">${esc(c.sha)}</a>
      <span class="by">${esc(c.who)}${c.when ? ` · ${ago(c.when)} ago` : ""}</span>
    </div>`).join("");
  return `<div class="tab-body with-head">
    <div class="pr-ckbar"><p class="said">${phrase("{length} {n} · newest first", { length: list.length, n: list.length === 1 ? "commit" : "commits" })}</p></div>
    <div class="pr-cmlist">${rows}</div>
  </div>`;
}

function askForTab(p) {
  if (p.error) return;
  if (st.prTab === "diff" && !filesOfPr()) return pullDiff(p.key);
  if (st.prTab === "talk" && !talks.has(p.key)) return pullTalk(p.key);
  if (st.prTab === "commits" && !commits.has(p.key)) return pullCommits(p.key);
  if (st.prTab !== "checks") return;
  const check = chosenCheck(p);
  if (check?.job) pullLog(p.key, check);
}

const logKey = (key, job) => `${key} ${job}`;

async function pullLog(key, check) {
  const id = logKey(key, check.job);
  if (logs.has(id)) return;
  logs.set(id, null);
  const ask = `key=${encodeURIComponent(key)}&job=${check.job}&failed=${check.state === "failed" ? 1 : 0}`;
  try {
    const d = await (await fetch(`/api/prs/joblog?${ask}`)).json();
    logs.set(id, d.error ? { cut: 0, lines: [], empty: d.error } : d);
  } catch { logs.set(id, { cut: 0, lines: [], empty: "could not read the log" }); }
  if (prVisible() && st.openPr === key) paintPrs();
}

async function pullTalk(key) {
  if (talks.has(key)) return;
  talks.set(key, null);
  try {
    const d = await (await fetch(`/api/prs/talk?key=${encodeURIComponent(key)}`)).json();
    talks.set(key, d.talk || []);
  } catch { talks.set(key, []); }
  if (prVisible() && st.openPr === key) paintPrs();
}

async function pullCommits(key) {
  if (commits.has(key)) return;
  commits.set(key, null);
  try {
    const d = await (await fetch(`/api/prs/commits?key=${encodeURIComponent(key)}`)).json();
    commits.set(key, d.commits || []);
  } catch { commits.set(key, []); }
  if (prVisible() && st.openPr === key) paintPrs();
}

async function rerunChecks(p, failedOnly, button) {
  const runs = [...new Set((p.checks || [])
    .filter((c) => c.run && (!failedOnly || c.state === "failed"))
    .map((c) => c.run))];
  if (!runs.length) return;
  if (button) button.disabled = true;
  const answers = await Promise.all(runs.map((run) => fetch("/api/prs/rerun", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: p.key, run, failedOnly })
  }).then((r) => r.json()).catch((e) => ({ error: String(e.message || e) }))));
  if (button) button.disabled = false;
  const refused = answers.find((a) => !a.ok);
  if (refused) return;
  for (const c of p.checks || []) logs.delete(logKey(p.key, c.job));
  pullPrs();
}

const MODE = { new: "new ·", deleted: "deleted ·", renamed: "renamed ·", changed: "" };

function mergeState(p) {
  if (p.state !== "open" && p.state !== "draft") return null;
  if (p.mergeable === "conflicting") return { label: phrase("resolve the conflict first"), locked: true };
  if (p.state === "draft") return { label: phrase("leave draft first"), locked: true };
  if (p.autoMerge) return { label: phrase(MERGE_ARMED_LONG), armed: true, force: p.ci !== "failed" };
  if (p.ci === "running") return { label: phrase("merge when CI passes"), whenGreen: true, force: true };
  if (p.ci === "failed" || p.review === "changes_requested") return { label: phrase("merge with CI red"), confirm: true };
  return { label: phrase("merge"), ready: true };
}

function forceButton(m) {
  return m.force ? `<button class="btn" data-action="force">${esc(phrase("force merge"))}</button>` : "";
}

function mergeButton(p) {
  const m = mergeState(p);
  if (!m) return "";
  if (merging.has(p.key)) {
    return `<button class="btn busy" disabled aria-busy="true">${SPINNER}${esc(phrase(MERGE_BUSY[merging.get(p.key)].says))}</button>`;
  }
  if (m.locked) return `<span class="notice">${esc(m.label)}</span>`;
  if (m.armed) return `<span class="notice armed">${esc(m.label)}</span>` + forceButton(m);
  const color = m.ready && !raycastOn() ? ' style="border-color:#24462F;color:var(--green)"' : "";
  return `<button class="btn" data-action="merge"${color}>${esc(m.label)}</button>` + forceButton(m);
}

function paintMerging() {
  paintPrButton();
  if (prPopOpen()) paintPrPop();
  if (prVisible()) paintPrs();
  render();
}

async function waitForLanding(key) {
  const until = Date.now() + MERGE_LANDING_WAIT;
  while (Date.now() < until) {
    await pullPrs();
    const still = st.prs.find((x) => x.key === key);
    if (!still || prIsGone(still)) return;
    await new Promise((done) => setTimeout(done, 2000));
  }
}

function mergeAsk(p, m, force) {
  const where = `${p.repo.split("/").pop()}#${p.number}`;
  const base = `<code>${esc(p.base || "main")}</code>`;
  const failed = (p.checks || []).find((c) => c.state === "failed");
  if (force) {
    return {
      title: phrase("Merge {where} before CI finishes?", { where }),
      say: phrase("CI has not finished. The merge goes into {base} now, over whatever the checks end up saying.", { base })
    };
  }
  if (m.confirm && p.ci === "failed") {
    return {
      title: phrase("Merge {where} with CI red?", { where }),
      say: failed
        ? phrase("{check} failed. The merge goes into {base} over the check.", { check: `<code>${esc(failed.name)}</code>`, base })
        : phrase("CI is red. The merge goes into {base} over it.", { base })
    };
  }
  if (m.confirm) {
    return {
      title: phrase("Merge {where} with changes requested?", { where }),
      say: phrase("A reviewer asked for changes. The merge goes into {base} over that review.", { base })
    };
  }
  if (m.whenGreen) {
    return {
      title: phrase("Merge {where} when CI passes?", { where }),
      say: phrase("The merge is armed now and lands in {base} the moment the checks go green.", { base })
    };
  }
  return { title: phrase("Merge {where} into {base}?", { where, base: p.base || "main" }), say: phrase("It lands for everyone the moment you confirm.") };
}

async function mergePr(p, button, force) {
  const m = mergeState(p);
  if (!m || m.locked || (m.armed && !force) || merging.has(p.key)) return;
  if (raycastOn()) {
    const asked = mergeAsk(p, m, force);
    if (!(await ask(asked.title, asked.say, phrase("Merge #{number}", { number: p.number }), { at: button?.getBoundingClientRect?.() || null }))) return;
  } else if ((force || m.confirm) && !(await ask(
    phrase("Merge #{number} anyway?", { number: p.number }),
    force
      ? phrase("CI has not finished. The merge goes in now, over whatever the checks end up saying.")
      : phrase("CI is red. The merge goes in over it."),
    phrase("merge anyway"),
    { at: button.getBoundingClientRect() }
  ))) return;
  const now = !!force || !m.whenGreen;
  mergeTrouble.delete(p.key);
  merging.set(p.key, now ? "now" : "auto");
  paintMerging();
  try {
    const r = await fetch("/api/prs/merge", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: p.key, whenGreen: !now, force: !!force })
    });
    const d = await r.json();
    if (!d.ok) {
      mergeTrouble.set(p.key, d.error || phrase("the merge did not go through"));
      return;
    }
    diffs.delete(p.key);
    if (!d.scheduled) await waitForLanding(p.key);
  } catch (e) {
    mergeTrouble.set(p.key, String(e.message || e));
  } finally {
    merging.delete(p.key);
    await pullPrs();
    paintMerging();
  }
}

const deletingBranch = new Set();

async function deleteBranch(p, button) {
  if (!p.branchLeft || deletingBranch.has(p.key)) return;
  if (!(await ask(
    phrase("Delete the branch of #{number}?", { number: p.number }),
    phrase("{branch} goes away on GitHub. The PR keeps its commits, and GitHub can restore the branch from the PR page.", { branch: `<code>${esc(p.branch)}</code>` }),
    phrase("delete branch"),
    { at: button?.getBoundingClientRect?.() || null }
  ))) return;
  deletingBranch.add(p.key);
  branchTrouble.delete(p.key);
  if (button) button.disabled = true;
  try {
    const r = await fetch("/api/prs/branch", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: p.key })
    });
    const d = await r.json();
    if (!d.ok) branchTrouble.set(p.key, d.error || phrase("the branch was not deleted"));
  } catch (e) {
    branchTrouble.set(p.key, String(e.message || e));
  } finally {
    deletingBranch.delete(p.key);
    if (button) button.disabled = false;
    await pullPrs();
    paintMerging();
  }
}

function toggleSeen(p, f) {
  const list = seen[p.key] || (seen[p.key] = []);
  const i = list.indexOf(f.path);
  const weight = f.added + f.removed;
  if (i >= 0) {
    list.splice(i, 1);
    linesThisSession = Math.max(0, linesThisSession - weight);
  } else {
    list.push(f.path);
    if (!f.noise) linesThisSession += weight;
    const files = filesOfPr() || [];
    const next = files.find((x) => !x.noise && !wasSeen(p.key, x.path)) || files.find((x) => !wasSeen(p.key, x.path));
    if (next) st.openFile = next.path;
  }
  saveSeen();
  paintPrs();
}

const whole = (f) => f.mode === "new" || f.mode === "deleted";

function paintDiff(f) {
  const clean = whole(f);
  const out = [];
  const rows = f.lines || [];
  const pinned = anchorNotes(notesOf(st.openPr).filter((one) => one.path === f.path), rows);
  const bySeat = seatLinesOf(st.openPr, f.path);
  const seatSay = attribution.get(st.openPr)?.seat ? phrase("written by {seat}", { seat: esc(itemOf(attribution.get(st.openPr).seat)?.title || attribution.get(st.openPr).seat) }) : "";
  for (const one of pinned.lost) out.push(noteRowHtml(one));

  rows.forEach((l, i) => {
    if (l.t === "gap") {
      if (!clean) out.push(`<div class="gap">${l.n > 0 ? (l.n > 1 ? phrase("⋯ {n} lines unchanged", { n: l.n }) : phrase("⋯ {n} line unchanged", { n: l.n })) : "⋯"}</div>`);
      return;
    }
    if (l.t === "note") { out.push(`<div class="gap">${phrase("no newline at end of file")}</div>`); return; }

    const cls = clean ? "same" : l.t;
    const left = clean ? "" : (l.a ?? "");
    const right = clean ? (l.d ?? l.a ?? "") : (l.d ?? "");
    const side = sideOf(l);
    const line = lineOf(l);
    const add = line ? `<button class="note-add" data-side="${side}" data-line="${line}" data-code="${esc(plainOf(l.h))}" aria-label="${phrase("leave a note on this line")}" title="${phrase("leave a note on this line")}">+</button>` : "";
    const mine = l.t === "added" && bySeat.has(l.d);
    out.push(`<i class="n ${cls}">${left}</i><i class="n ${cls} ${mine ? "mine" : ""}" ${mine ? `title="${seatSay}"` : ""}>${right}</i><span class="c ${cls}">${l.h || "&nbsp;"}${add}</span>`);
    if (editingHere(f.path, side, line)) out.push(noteEditorHtml());
    for (const one of pinned.byRow.get(i) || []) out.push(noteRowHtml(one));
  });

  if (f.truncated) out.push(`<div class="gap">${phrase("⋯ {truncated} more lines in this file: open it on GitHub", { truncated: f.truncated })}</div>`);
  return out.join("") || `<div class="raw">${phrase("no line changed")}</div>`;
}

async function pullDiff(key) {
  if (diffs.has(key)) return;
  diffs.set(key, null);
  pullNotes(key);
  pullAttribution(key);
  try {
    const r = await fetch(`/api/prs/diff?key=${encodeURIComponent(key)}`);
    const d = await r.json();
    diffs.set(key, d.files || []);
  } catch { diffs.set(key, []); }
  if (prVisible() && st.openPr === key) paintPrs();
}

async function hidePr(p) {
  await fetch("/api/prs/forget", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: p.key }) });
  st.prs = st.prs.filter((x) => x.key !== p.key);
  if (st.openPr === p.key) st.openPr = st.prs[0]?.key || null;
  if (st.reviewChat && !prsOfChat(st.reviewChat).length) exitReview();
  paintPrs();
  render();
}

async function reviewPr(p, action) {
  if (action === "forget") return hidePr(p);
  const text = $("pr-text").value.trim();
  const r = await fetch("/api/prs/review", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: p.key, action, text })
  });
  const d = await r.json();
  if (!d.ok) return;
  st.draft = "";
  $("pr-text").value = "";
  pullPrs();
}

function stepFile(step) {
  if (st.prTab === "about") return $("pr-about")?.scrollBy({ top: step * 64 });
  if (st.prTab === "checks") return stepCheck(step);
  const files = filesOfPr();
  if (!files?.length) return;
  const i = files.findIndex((f) => f.path === st.openFile);
  const target = files[Math.min(files.length - 1, Math.max(0, i + step))];
  if (target && target.path !== st.openFile) { st.openFile = target.path; paintPrs(); }
}

function stepCheck(step) {
  const p = st.prs.find((x) => x.key === st.openPr);
  const checks = p?.checks || [];
  if (!checks.length) return;
  const here = chosenCheck(p);
  const i = checks.findIndex((c) => c.name === here?.name);
  const target = checks[Math.min(checks.length - 1, Math.max(0, i + step))];
  if (target && target.name !== here?.name) { st.openCheck = target.name; paintPrs(); }
}

function pickPrTab(i) {
  const tab = prTabs()[i];
  if (!tab || tab.id === st.prTab) return;
  st.prTab = tab.id;
  paintPrs();
}

function stepPr(step) {
  if (raycastOn()) {
    const shown = prsOnScreen() ? prsShown() : st.prs;
    if (!shown.length) return;
    const i = shown.findIndex((p) => p.key === st.openPr);
    const next = i < 0 ? shown[0] : shown[(i + step + shown.length) % shown.length];
    if (next.key !== st.openPr) pickPr(next.key);
    return;
  }
  if (st.prs.length < 2) return;
  const i = st.prs.findIndex((p) => p.key === st.openPr);
  st.openPr = st.prs[(i + step + st.prs.length) % st.prs.length].key;
  st.openFile = null;
  st.openCheck = "";
  paintPrs();
}

function markCurrent() {
  const p = st.prs.find((x) => x.key === st.openPr);
  const f = (filesOfPr() || []).find((x) => x.path === st.openFile);
  if (p && f) toggleSeen(p, f);
}

function unmarkLast() {
  const p = st.prs.find((x) => x.key === st.openPr);
  const files = filesOfPr() || [];
  const path = p && [...seenOf(p.key)].reverse().find((x) => files.some((f) => f.path === x));
  if (!path) return;
  st.openFile = path;
  toggleSeen(p, files.find((f) => f.path === path));
}

function openPrs() {
  releaseKeyboard();
  if (worktreesOnScreen()) closeWorktrees();
  if (portariaOnScreen()) closePortaria();
  exitReview();
  $("prs").hidden = false;
  if (!st.reviewingSince) st.reviewingSince = Date.now();
  paintPrs();
  if (raycastOn()) $("pr-url").focus();
  pullPrs();
  st.prBeat = PR_BEAT_OPEN;
  every("prs", PR_BEAT_OPEN, pullPrs);
}

function forgetPrPanels() {
  prListSolid?.dispose();
  if (st.reviewChat) return;
  prMidSolid?.dispose();
  $("pr-detail").replaceChildren();
}

function closePrs() {
  if (raycastOn()) leavePanel($("prs"));
  $("prs").hidden = true;
  forgetPrPanels();
  st.prBeat = PR_BEAT_AWAY;
  every("prs", PR_BEAT_AWAY, pullPrs);
}

$("th-shut").addEventListener("click", (ev) => { ev.stopPropagation(); closeThreadPanel(); });

$("btn-accounts").addEventListener("click", () => run("accounts"));

$("btn-term").addEventListener("click", () => openShell("local"));

$("btn-term-pod").addEventListener("click", () => openShell("cloud"));

async function openShell(where) {
  closeMore();
  releaseKeyboard();
  try {
    const r = await fetch("/api/shell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ where })
    });
    const d = await r.json();
    if (d.error) return;
    const target = blockWithRoom() || openBlock();
    st.block = st.blocks.indexOf(target);
    saveBlockAt(st.block);
    saveBlocks();
    await pull();
    goTo(d.name);
    takeKeyboard(d.name);
  } catch {}
}

$("pr-refresh").addEventListener("click", () => { diffs.delete(st.openPr); pullPrs(); });

$("pr-url").addEventListener("keydown", async (e) => {
  if (raycastOn()) return;
  e.stopPropagation();
  if (e.key !== "Enter") return;
  const link = $("pr-url").value.trim();
  if (!link) return;
  const r = await fetch("/api/prs/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link }) });
  const d = await r.json();
  if (!d.ok) return;
  $("pr-url").value = "";
  st.openPr = d.key;
  pullPrs();
});

const PR_LINK = /github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+|^[\w.-]+\/[\w.-]+#\d+$/i;

const prLinkOf = (text) => (PR_LINK.test(String(text || "").trim()) ? String(text).trim() : "");

const MERGE_KEY = { meta: true, shift: true, code: "Enter" };

async function registerPr(link) {
  if (!prLinkOf(link)) return;
  const r = await fetch("/api/prs/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link.trim() }) });
  const d = await r.json().catch(() => ({}));
  if (!d.ok) return;
  st.prQuery = "";
  $("pr-url").value = "";
  st.openPr = d.key;
  await pullPrs();
  $("pr-url").focus();
}

function refreshPrs() {
  diffs.delete(st.openPr);
  talks.delete(st.openPr);
  commits.delete(st.openPr);
  pullPrs();
}

function openPrOnGithub(p) {
  if (p?.url) window.open(p.url, "_blank", "noreferrer");
}

function prPanelActions() {
  const p = st.prs.find((x) => x.key === st.openPr);
  const typed = prLinkOf(st.prQuery);
  const refresh = { key: "refresh", say: phrase("Refresh"), icon: "i-reload", combo: { alt: true, shift: true, code: "KeyR" }, go: refreshPrs, group: phrase("List") };
  if (typed) return [{ key: "add", say: phrase("Add PR"), icon: "i-plus", primary: true, go: () => registerPr(typed) }, refresh];
  if (!p) return st.prs.length ? [refresh] : [{ key: "add", say: phrase("Add PR"), icon: "i-plus", primary: true, go: () => registerPr(document.querySelector("#prs [data-pw-paste]")?.value || "") }, { ...refresh, foot: true }];
  const m = mergeState(p);
  const failedRuns = (p.checks || []).some((c) => c.state === "failed" && c.run);
  const anyRuns = (p.checks || []).some((c) => c.run);
  const chat = !p.error && chatOfPr(p) ? p.session : "";
  return [
    chat
      ? { key: "review", say: phrase("Review in the chat"), icon: "i-agent", primary: true, go: () => reviewInChat(chat, p.key) }
      : { key: "github", say: phrase("Open on GitHub"), icon: "i-globe", primary: true, go: () => openPrOnGithub(p) },
    failedRuns ? { key: "rerun", say: phrase("Rerun the failed ones"), icon: "i-reload", combo: { alt: true, shift: true, code: "KeyF" }, foot: true, go: () => rerunChecks(p, true, null) } : null,
    m && !m.locked && !merging.has(p.key) ? { key: "merge", say: m.ready ? phrase("Merge") : m.label, icon: "i-pr", combo: MERGE_KEY, go: () => mergePr(p, null, false) } : null,
    m?.force && !merging.has(p.key) ? { key: "force", say: phrase("Force merge"), icon: "i-bolt", go: () => mergePr(p, null, true) } : null,
    chat ? { key: "github", say: phrase("Open on GitHub"), icon: "i-globe", combo: { meta: true, shift: true, code: "KeyG" }, go: () => openPrOnGithub(p) } : null,
    p.branchLeft ? { key: "deleteBranch", say: phrase("Delete the branch"), icon: "i-close", go: () => deleteBranch(p, null) } : null,
    p.branch ? { key: "branch", say: phrase("Copy the branch"), icon: "i-copy", combo: { meta: true, shift: true, code: "KeyC" }, go: () => copyWithWord(null, p.branch) } : null,
    { key: "talk", say: phrase("Comment, approve or ask for changes"), icon: "i-quote", group: phrase("Review status"), go: () => { st.prTab = "talk"; paintPrs(); $("pr-text")?.focus(); } },
    anyRuns ? { key: "rerunAll", say: phrase("Rerun every check"), icon: "i-reload", group: phrase("Review status"), go: () => rerunChecks(p, false, null) } : null,
    { ...refresh, foot: !failedRuns },
    { key: "forget", say: phrase("Take off the list"), icon: "i-close", group: phrase("List"), go: () => hidePr(p) }
  ];
}

registerPanel("prs", {
  el: () => $("prs"),
  search: () => $("pr-url"),
  list: () => $("pr-items"),
  actions: prPanelActions,
  step: stepPr,
  subject: () => {
    const p = st.prs.find((x) => x.key === st.openPr);
    return p ? `${p.repo.split("/").pop()}#${p.number}` : phrase("PRs");
  },
  detail: () => $("pr-detail").focus()
});

let prFootSolid = null;

function dressPrs() {
  const host = $("prs");
  if (!host || host.querySelector(".pr-side")) return;
  prMidPanel ||= $("pr-mid");
  prDetailPanel ||= $("pr-detail");
  const homed = prMidPanel?.parentElement === host;
  if (homed) { prMidPanel.remove(); prDetailPanel.remove(); }
  const say = (text) => esc(phrase(text));
  const keys = (...caps) => `<span class="pw-keys">${caps.map((cap) => `<kbd class="rc-key">${esc(cap)}</kbd>`).join("")}</span>`;
  dressHost(host, `
    <header class="pw-head" data-no-t>
      <span class="pw-ico">${svgIcon("i-pr")}</span>
      <h2 class="pw-title">${say("PRs")}</h2>
      <span class="pw-count" id="pr-count"></span>
      <span class="pw-vsep"></span>
      <label class="pw-search">${svgIcon("i-mag")}<input data-pw-keep="pr-url" placeholder="${say("Search by title, repo or author — or paste a PR url")}" aria-label="${say("Search by title, repo or author — or paste a PR url")}"></label>
      <label class="pw-drop"><select id="pr-filter" aria-label="${say("which PRs")}"></select></label>
      <span class="pw-vsep"></span>
      <span class="pw-hint">${keys("↑", "↓")}PR</span>
      <span class="pw-hint">${keys(IS_MAC ? "⌥" : "Alt", "↵")}${say("detail")}</span>
      <button type="button" class="pw-esc" id="pr-close" aria-label="${say("close")}" title="${say("close")}">esc</button>
    </header>
    <div class="pw-body">
      <div data-pw-keep="pr-items" class="pw-list" role="listbox" aria-label="${say("Hive pull requests")}"></div>
      <div class="pr-side"></div>
    </div>
    <footer class="pw-foot" id="pr-foot" data-no-t></footer>`, {
    on: (dressed) => {
      dressed.querySelector("#pr-close").addEventListener("click", () => closePrs());
      dressed.querySelector("#pr-filter").addEventListener("change", (e) => {
        st.prFilter = e.target.value;
        const first = prsShown()[0];
        if (first && !prsShown().some((one) => one.key === st.openPr)) { st.openPr = first.key; st.openFile = null; st.openCheck = ""; }
        paintPrs();
        $("pr-url").focus();
      });
    }
  });
  if (homed) dressed().append(prMidPanel, prDetailPanel);
  prDetailPanel?.setAttribute("tabindex", "-1");
  if (prHive && !prFootSolid) {
    prFootSolid = prHive.mountFoot($("pr-foot"), {
      actions: { act: (key) => runAction(panelOf("prs"), key), more: () => openActions(panelOf("prs")) }
    });
  }
}

const dressed = () => $("prs").querySelector(".pr-side");

function undressPrs() {
  const host = $("prs");
  if (!host.querySelector(".pr-side")) return;
  const homed = prMidPanel?.parentElement === dressed();
  prFootSolid?.dispose();
  prFootSolid = null;
  undressHost(host);
  if (homed) host.append(prMidPanel, prDetailPanel);
  prDetailPanel?.removeAttribute("tabindex");
}

function paintPrChrome() {
  if (!prsOnScreen() || !$("pr-count")) return;
  const p = st.prs.find((x) => x.key === st.openPr);
  const open = st.prs.filter(prOpen).length;
  $("pr-count").textContent = open === 1 ? phrase("1 open") : phrase("{n} open", { n: open });
  $("prs").dataset.blank = st.prs.length ? "no" : "yes";
  $("pr-filter").innerHTML = PR_FILTERS.map(([key, say]) => {
    const n = key === "all" ? st.prs.length : key === "failing" ? st.prs.filter((one) => one.ci === "failed").length : st.prs.filter((one) => prSection(one) === key).length;
    return `<option value="${key}" ${key === (st.prFilter || "all") ? "selected" : ""}>${esc(phrase(say))} · ${n}</option>`;
  }).join("");
  const gauge = prGaugeModel();
  prFootSolid?.show(footModel(panelOf("prs"), {
    icon: "i-pr", title: phrase("PRs"),
    trail: [p ? `${p.repo.split("/").pop()}#${p.number}` : st.prs.length ? "" : phrase("nothing on the list")],
    gauge: p && !p.error ? { read: phrase("read"), slice: gauge.slice, full: gauge.full, message: gauge.message, say: `${gauge.lines}/${LINE_CAP} ${phrase("lines")} · ${gauge.minutes} min` } : null
  }));
}

$("pr-url").addEventListener("input", (e) => {
  if (!raycastOn()) return;
  st.prQuery = e.target.value;
  const first = prsShown()[0];
  if (first && !prsShown().some((one) => one.key === st.openPr)) { st.openPr = first.key; st.openFile = null; st.openCheck = ""; }
  paintPrs();
});

followRaycast((on) => {
  if (!on) {
    undressPrs();
    delete $("prs").dataset.blank;
  }
  if (prListSolid && prsOnScreen()) paintPrs();
});

export { deleteBranch, MERGE_KEY, PR_FILTERS, PR_SECTIONS, mergeAsk, paintPrChrome, pickPr, prEmptyModel, prKvHtml, prLinkOf, prListWindowModel, prMidWindowModel, prPanelActions, prQueueModel, prSection, prStatus, prsShown, refreshPrs, registerPr, CHECK_MARK, CI_DOT, CLOCK, DAY_NAME, HANDY, MODE, PR_BEAT_AWAY, PR_BEAT_OPEN, PR_BEAT_RUNNING, PR_TABS, SHOT_SIDES, VERDICT_CLASS, askForTab, checksHtml, chosenCheck, closePrs, closeThreadPanel, commits, commitsHtml, diffHtml, diffs, exitReview, faceOf, filesHtml, filesOfPr, forceButton, forgetPrPanels, forgetWhatMoved, hidePr, keepPrBeat, lastPainted, linesThisSession, logHtml, logKey, logs, markCurrent, markMd, mergeButton, mergePr, mergeState, messageRow, movePrPanel, moveThreadPanel, openPrs, openShell, openThreadOf, paintDiff, paintFile, paintMerging, paintPrList, paintPrMid, paintPrTrouble, paintPrs, paintThread, paintThreadActions, passToChat, pickPrTab, pickerHtml, pinToEnd, prDetailPanel, prFileModel, prGaugeModel, prListSolid, prListViewModel, prMidPanel, prMidSolid, prMidViewModel, prMoved, prRowModel, prSeatModel, prVisible, prsOnScreen, pullCommits, pullDiff, pullLog, pullPrs, pullTalk, react, reactionsHtml, readSeen, rerunChecks, reviewHtml, reviewInChat, reviewPr, saveSeen, seen, seenOf, sendToThread, shotSrc, shotsHtml, stepCheck, stepFile, stepPr, tabCount, tabsHtml, talkHtml, talks, tellHive, threadDrafts, threadPanel, threadVisible, toggleSeen, tookSays, toolsHtml, unmarkLast, waitForLanding, wasSeen, whole, wireChecks, wireDiff, wirePrTabs, wireReview, wireTalk, notes, notesOf, pullNotes, noteTargets, notesBarHtml, noteRowHtml, sendNotes, attribution, attributionSay, pullAttribution };
