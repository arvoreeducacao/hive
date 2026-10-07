import { render } from "./arrange.js";
import { activeItems, blockWithRoom, ofBlock, openBlock, saveBlocks } from "./blocks.js";
import { saveConfig } from "./brand-face.js";
import { weaveHandles } from "./chat-and-panes.js";
import { $, BLOCK_SIZE_DEFAULT, BLOCK_SIZE_KEY, BLOCK_SIZE_RANGE, esc, phrase, raycastOn, solidMounts, st } from "./core.js";
import { closeTile, focusSeat, pull, releaseKeyboard } from "./focus-navigation.js";
import { openDraft, sendDraft } from "./draft-seat.js";
import { jobName, justCreated, pool, tiles } from "./leader-key.js";
import { agentOfKind, newChatPayload, syncKindModel } from "./new-chat.js";
import { pullAccounts } from "./providers.js";
import { inlineImagePaths, outboundImageMarks } from "./pinned-images.js";
import { paintChoices } from "./preferences.js";
import { calmly, peerChoices, personAwake, personChoices, personSays, pickSeat, seatHandle, seatLabel, seatSays, shellModeOf } from "./pure-helpers.js";
import { structPool } from "./structured-seats.js";
import { refit } from "./terminal-history.js";

const LAYOUT_KEY = "hive.layout";

const LAYOUTS = ["grid", "row", "strip"];

const LAYOUT_NAMES = { grid: "in a grid", row: "side by side, in one row", strip: "every chat in one strip, scrolling sideways" };

st.seatLayout = LAYOUTS[0];

const inARow = () => st.seatLayout === "row";

const inAStrip = () => st.seatLayout === "strip";

function bootLayout() {
  let saved = "";
  try { saved = localStorage.getItem(LAYOUT_KEY) || ""; } catch {}
  st.seatLayout = LAYOUTS.includes(saved) ? saved : LAYOUTS[0];
}

function setLayout(id, quiet) {
  st.seatLayout = LAYOUTS.includes(id) ? id : LAYOUTS[0];
  try { localStorage.setItem(LAYOUT_KEY, st.seatLayout); } catch {}
  paintChoices();
  render();
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
  if (quiet) return;
  saveConfig({ layout: st.seatLayout }).catch(() => {});
}

function adoptLayout(r) {
  const wanted = r.config.layout || LAYOUTS[0];
  if (wanted !== st.seatLayout) setLayout(wanted, true);
}

function setBlockSize(n, quiet) {
  n = Math.round(Number(n));
  st.LIMIT = n >= BLOCK_SIZE_RANGE[0] && n <= BLOCK_SIZE_RANGE[1] ? n : BLOCK_SIZE_DEFAULT;
  try { localStorage.setItem(BLOCK_SIZE_KEY, String(st.LIMIT)); } catch {}
  paintChoices();
  render();
  for (const e of pool.values()) if (e.host.isConnected) requestAnimationFrame(() => refit(e));
  if (quiet) return;
  saveConfig({ blockSize: st.LIMIT }).catch(() => {});
}

function adoptBlockSize(r) {
  const wanted = r.config.blockSize || BLOCK_SIZE_DEFAULT;
  if (wanted !== st.LIMIT) setBlockSize(wanted, true);
}

function knock(el) {
  if (calmly()) return;
  el.classList.remove("just-needs");
  void el.offsetWidth;
  el.classList.add("just-needs");
  clearTimeout(el._knock);
  el._knock = setTimeout(() => el.classList.remove("just-needs"), 1500);
}

function born(el) {
  if (calmly()) return;
  el.classList.add("born");
  setTimeout(() => el.classList.remove("born"), 260);
}

function flipStart() {
  if (calmly()) return null;
  const seen = new Map();
  for (const [key, el] of tiles) if (el.isConnected) seen.set(key, el.getBoundingClientRect());
  return seen;
}

function flipEnd(before) {
  const flights = [];
  if (!before || !before.size) return flights;
  for (const [key, el] of tiles) {
    const from = before.get(key);
    const wasHidden = !from || !from.width || !from.height;
    if (wasHidden || !el.isConnected || el.dataset.gone) continue;
    const to = el.getBoundingClientRect();
    if (!to.width || !to.height) continue;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    const moved = Math.abs(dx) >= 2 || Math.abs(dy) >= 2;
    const grew = Math.abs(sx - 1) >= 0.01 || Math.abs(sy - 1) >= 0.01;
    if (!moved && !grew) continue;
    const away = grew ? `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` : `translate(${dx}px, ${dy}px)`;
    const flight = el.animate([{ transformOrigin: "top left", transform: away }, { transformOrigin: "top left", transform: "none" }],
      { duration: 420, easing: "cubic-bezier(0.22,0.68,0.36,1)" });
    if (flight) flights.push(flight);
  }
  return flights;
}

const GONE_MS = 210;

function vanish(el) {
  if (calmly() || !el.isConnected || el.dataset.gone) return el.remove();
  const host = el.parentElement;
  const box = el.getBoundingClientRect();
  const around = host.getBoundingClientRect();
  el.dataset.gone = "1";
  el.dataset.wasStyle = el.getAttribute("style") || "";
  el.style.position = "absolute";
  el.style.left = `${box.left - around.left + host.scrollLeft}px`;
  el.style.top = `${box.top - around.top + host.scrollTop}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.pointerEvents = "none";
  el.classList.add("gone");
  setTimeout(() => {
    el.classList.remove("gone");
    if (el.dataset.wasStyle) el.setAttribute("style", el.dataset.wasStyle); else el.removeAttribute("style");
    delete el.dataset.gone;
    delete el.dataset.wasStyle;
    el.remove();
  }, GONE_MS);
}

const WHERE_ICON = { local: "#i-local", cloud: "#i-cloud" };

const shortBranch = (branch) => (String(branch || "").split("/").filter(Boolean).pop() || "").replace(/^-+/, "");

function composerTarget() {
  const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
  if (it?.kind !== "session") return null;
  return st.data.sessions.find((s) => s.name === it.name) || null;
}

st.missionMode = false;

st.missionPinned = false;

function missionHint() {
  const b = blockWithRoom();
  const i = b ? st.blocks.indexOf(b) : st.blocks.length;
  const items = b ? ofBlock(b) : [];
  const seat = b
    ? phrase("takes a seat in block {i} — {taken} of {limit} taken", { i: i + 1, taken: items.length, limit: st.LIMIT })
      + (items.length ? `: ${items.map((x) => x.title || x.name).join(", ")}` : "")
    : st.blocks.length
      ? phrase("all {n} blocks hold {limit} chats — this one opens block {i}", { n: st.blocks.length, limit: st.LIMIT, i: i + 1 })
      : phrase("this is the first chat — it opens block 1");
  const agent = agentOfKind($("n-kind")?.value || "");
  return `${seat} ${agent === "claude"
    ? phrase("· starts with the model already set, no permission prompts and Remote Control on — the same chat opens on claude.ai")
    : phrase("· starts with the model already set and no permission prompts, on {agent}", { agent })}`;
}

function missionWhere() {
  const b = blockWithRoom();
  const i = b ? st.blocks.indexOf(b) : st.blocks.length;
  return phrase("opens in block {i} · seat {n} free", { i: i + 1, n: (b ? ofBlock(b).length : 0) + 1 });
}

function paintMission() {
  const on = st.missionMode;
  const asDialog = on && st.missionPinned;
  document.body.classList.toggle("mission-open", asDialog);
  $("mission-scrim").hidden = !asDialog;
  $("mission-head").hidden = !asDialog;
  $("mission-go").hidden = !asDialog;
  $("composer").classList.toggle("mission", on);
  $("cmp-pill").hidden = !on;
  $("cmp-controls").hidden = !on;
  $("cmp-hint").hidden = !on;
  if (on) $("cmp-hint").textContent = missionHint();
  if (asDialog && raycastOn() && $("mission-where")) $("mission-where").textContent = missionWhere();
  paintComposerTo();
  for (const chip of $("composer").querySelectorAll(".slash")) chip.hidden = on;
  const t = $("cmp-in");
  t.placeholder = on
    ? phrase("what it solves, with a definition of done and the status protocol")
    : phrase("message the focused seat — /new opens one on the spot");
  growComposer();
}

function setMission(on) {
  if (st.missionMode === on) return paintMission();
  st.missionMode = on;
  if (!on) st.missionPinned = false;
  paintMission();
}

function openMission(seed) {
  releaseKeyboard();
  st.missionPinned = true;
  if (seed !== undefined) $("cmp-in").value = seed;
  setMission(true);
  pullAccounts();
  syncKindModel();
  const t = $("cmp-in");
  t.focus();
  t.setSelectionRange(t.value.length, t.value.length);
}

function closeMission() {
  setMission(false);
  const t = $("cmp-in");
  t.blur();
  document.body.focus();
}

function paintShellMode() {
  const mode = st.missionMode ? "" : shellModeOf($("cmp-in").value);
  $("composer").classList.toggle("shell", !!mode);
  $("composer").classList.toggle("quiet", mode === "quiet");
}

function growComposer() {
  paintShellMode();
  const t = $("cmp-in");
  t.style.height = "auto";
  t.style.height = `${Math.min(t.scrollHeight, 132)}px`;
}

function composerTo() {
  if (st.missionMode) return { text: phrase("→ new chat"), title: phrase("enter opens a new chat"), none: false };
  const seat = composerTarget();
  if (seat) {
    return {
      text: `→ ${seat.naming ? phrase("new chat") : seat.title || seat.name}`,
      title: phrase("enter sends it to {name}", { name: seat.name }),
      none: false
    };
  }
  if (activeItems()[st.focus]?.kind === "draft") {
    return { text: phrase("→ new chat"), title: phrase("write in the chat itself — the first message opens it"), none: true };
  }
  if (activeItems()[st.focus]?.kind === "job") {
    return { text: phrase("still booting…"), title: phrase("this chat is opening — it takes messages as soon as it answers"), none: true };
  }
  return { text: phrase("no seat in focus"), title: phrase("focus a seat — or write /new"), none: true };
}

function paintComposerTo() {
  const to = composerToViewModel();
  composerToSolid.show(to);
  $("cmp-in").setAttribute("aria-label", to.title);
}

let composerToSolid = null;

function composerToViewModel() {
  const to = composerTo();
  return { key: "cmpto", text: to.text, title: to.title, none: to.none };
}

solidMounts.push((hive) => {
  composerToSolid = hive.mountComposerTo($("cmp-to"));
});

function paintComposer() {
  const t = composerTarget();
  const booting = !t && ["job", "draft"].includes(activeItems()[st.focus]?.kind);
  paintComposerTo();
  const empty = !$("cmp-in").value.trim();
  if (st.barOn && !t && !booting && !st.missionMode && empty) setMission(true);
  else if ((t || booting) && st.missionMode && empty && !st.missionPinned) setMission(false);
  else if (st.missionMode) $("cmp-hint").textContent = missionHint();
  paintAim();
}

let aimedAt = null;

function paintAim() {
  const aiming = st.composing ? composerTarget()?.name : null;
  const target = aiming ? tiles.get(aiming) : null;
  if (aiming === aimedAt && (!target || target.classList.contains("aiming"))) return;
  aimedAt = aiming;
  for (const [key, el] of tiles) el.classList.toggle("aiming", key === aiming);
}

const onASleepingPod = (target) => target.where === "cloud" && !!st.data?.pod?.name && !st.data.pod.up;

async function driverUp(name, within) {
  const end = Date.now() + within;
  while (Date.now() < end) {
    const se = structPool.get(name);
    if (se?.ws?.readyState === 1) return se;
    await new Promise((again) => setTimeout(again, 1500));
  }
  return null;
}

function wakeAndSay(target, text, images = []) {
  fetch("/api/say", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: target.name, where: target.where, text })
  }).then((x) => x.json()).then(async (r) => {
    if (!r?.ok) return;
    await pull();
    if (r.delivered) return;
    const se = await driverUp(target.name, 90000);
    if (!se) return;
    se.type(text, images);
  }).catch(() => {});
  return true;
}

function sendToSeat(target, text, images = []) {
  const se = structPool.get(target.name);
  if (se) {
    if (se.ws?.readyState !== 1) {
      if (onASleepingPod(target)) return wakeAndSay(target, text, images);
      return false;
    }
    se.type(text, images);
    return true;
  }
  const e = pool.get(target.name);
  if (!e || e.ws?.readyState !== 1) {
    if (onASleepingPod(target)) return wakeAndSay(target, text);
    return false;
  }
  e.ws.send(text);
  setTimeout(() => { if (e.ws?.readyState === 1) e.ws.send("\r"); }, 40);
  return true;
}

async function openChatFromBar() {
  const name = $("n-name").value.trim();
  const marked = outboundImageMarks($("cmp-in").value, st.cmpTray.marks);
  const mission = marked.text.trim();
  if (!name && !mission && !marked.images.length) return $("cmp-in").focus();
  const payload = newChatPayload(name, mission, marked.images);
  try { localStorage.setItem("hive.seatKind", $("n-kind").value); } catch {}
  const r = await fetch("/api/spawn", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
  }).then((x) => x.json()).catch((e) => ({ error: e.message }));
  if (!r?.ok) return;
  $("cmp-in").value = "";
  st.cmpTray.clear();
  $("n-name").value = "";
  if ($("n-count")) $("n-count").value = "1";
  setMission(false);
  if (st.open) closeTile();
  const born = Array.isArray(r.ids) && r.ids.length ? r.ids : [r.id];
  born.forEach((id, at) => {
    const target = blockWithRoom() || openBlock();
    target.keys.push(`job:${id}`);
    justCreated.set(id, Date.now());
    const name = Array.isArray(r.names) ? r.names[at] : at === 0 ? r.name : "";
    if (name) jobName.set(id, name);
  });
  saveBlocks();
  focusSeat(`job:${r.id}`);
  render();
  await pull();
  focusSeat(`job:${r.id}`);
  render();
}

st.cmpMenu = null;

function cmpMenuClose() {
  st.cmpMenu = null;
  const box = $("cmp-suggest");
  box.hidden = true;
  box.innerHTML = "";
}

function cmpMenuPaint() {
  const box = $("cmp-suggest");
  if (!st.cmpMenu) return cmpMenuClose();
  box.hidden = false;
  if (!st.cmpMenu.items.length) {
    const empty = st.cmpMenu.kind === "person"
      ? phrase("nobody on the team by that name")
      : phrase(st.data.sessions.length > 1 ? "no other chat with that name" : "no other chat open to mention");
    box.innerHTML = `<div class="none">${esc(empty)}</div>`;
    return;
  }
  if (st.cmpMenu.kind === "person") {
    box.innerHTML = st.cmpMenu.items.map((row, i) => {
      const said = personSays(row);
      return `<div class="sgp${i === st.cmpMenu.sel ? " sel" : ""}${personAwake(row) ? "" : " quiet"}" data-i="${i}">`
        + `<span class="mark">!</span><span class="val"><b>${esc(row.dev)}</b>`
        + `<span class="meta">${esc(said.meta)} · <span class="st">${esc(phrase(said.state))}</span></span>`
        + `</span></div>`;
    }).join("");
    for (const row of box.querySelectorAll(".sgp")) {
      row.addEventListener("mousedown", (ev) => { ev.preventDefault(); cmpMenuPick(Number(row.dataset.i)); });
    }
    box.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
    return;
  }
  box.innerHTML = st.cmpMenu.items.map((seat, i) => {
    const said = seatSays(seat);
    return `<div class="sgp${i === st.cmpMenu.sel ? " sel" : ""}" data-i="${i}">`
      + `<span class="mark">#</span><span class="val"><b>${esc(seatLabel(seat))}</b>`
      + `<span class="meta">#${esc(seatHandle(seat))} · ${esc(said.spot)} · <span class="st">${esc(phrase(said.state))}</span></span>`
      + (said.now ? `<span class="said">${esc(said.now)}</span>` : "")
      + `</span></div>`;
  }).join("");
  for (const row of box.querySelectorAll(".sgp")) {
    row.addEventListener("mousedown", (ev) => { ev.preventDefault(); cmpMenuPick(Number(row.dataset.i)); });
  }
  box.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
}

function cmpMenuPick(i) {
  const chosen = st.cmpMenu?.items[i];
  if (!chosen) return;
  const input = $("cmp-in");
  const v = input.value;
  const inserted = st.cmpMenu.kind === "person" ? `~${chosen.dev} ` : `#${seatHandle(chosen)} `;
  input.value = v.slice(0, st.cmpMenu.start) + inserted + v.slice(st.cmpMenu.end);
  const caret = st.cmpMenu.start + inserted.length;
  cmpMenuClose();
  input.focus();
  input.setSelectionRange(caret, caret);
  growComposer();
}

function cmpMenuCompute() {
  const input = $("cmp-in");
  const caret = input.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const tilde = before.match(/(^|[\s([{'"])~([a-z0-9-]*)$/);
  if (tilde) {
    st.cmpMenu = { kind: "person", items: personChoices(st.team.devs, tilde[2], st.team.me), sel: 0, start: caret - tilde[2].length - 1, end: caret };
    return cmpMenuPaint();
  }
  const at = before.match(/(^|[\s([{'"])#([\w.-]*)$/);
  if (!at) return cmpMenuClose();
  const mine = composerTarget()?.name || "";
  const items = peerChoices(st.data.sessions, at[2], mine);
  st.cmpMenu = { kind: "peer", items, sel: 0, start: caret - at[2].length - 1, end: caret };
  cmpMenuPaint();
}

function cmpMenuKey(ev) {
  if (!st.cmpMenu || $("cmp-suggest").hidden) return false;
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    const n = st.cmpMenu.items.length;
    if (n) { st.cmpMenu.sel = (st.cmpMenu.sel + (ev.key === "ArrowDown" ? 1 : n - 1)) % n; cmpMenuPaint(); }
    return true;
  }
  if ((ev.key === "Enter" && !ev.shiftKey) || ev.key === "Tab") {
    if (!st.cmpMenu.items.length) return false;
    ev.preventDefault();
    cmpMenuPick(st.cmpMenu.sel);
    return true;
  }
  if (ev.key === "Escape") { ev.preventDefault(); cmpMenuClose(); return true; }
  return false;
}

/* the bar had five ways to swallow a message whole — an unfinished handle, a name that fits two
   chats, no chat aimed at, a socket that is down — and every one of them read the same on screen:
   enter pressed, nothing sent, nothing said. the hint line under the bar says which one it was. */
let refusalClock = 0;

function composerRefused(why) {
  clearTimeout(refusalClock);
  const hint = $("cmp-hint");
  hint.textContent = why;
  hint.hidden = false;
  refusalClock = setTimeout(() => {
    if (st.missionMode) return void (hint.textContent = missionHint());
    hint.hidden = true;
    hint.textContent = "";
  }, 6000);
}

function composerSend() {
  const marked = outboundImageMarks($("cmp-in").value, st.cmpTray.marks);
  const text = inlineImagePaths($("cmp-in").value, st.cmpTray.marks).trim();
  if (st.missionMode) return openChatFromBar();
  if (!text) return;
  if (/^\/new\b/i.test(text)) {
    const mission = text.replace(/^\/new\s*/i, "").trim();
    $("cmp-in").value = "";
    st.cmpTray.clear();
    const draft = openDraft(mission);
    if (mission) sendDraft(draft, mission);
    return;
  }
  let target = composerTarget();
  let said = text;
  let marks = marked.text.trim();
  const bare = text.match(/^@(\S+)$/);
  if (bare) return void composerRefused(phrase("that is only a chat's name — write the message after it"));
  const at = text.match(/^@(\S+)\s+([\s\S]+)$/);
  const atMarked = marks.match(/^@(\S+)\s+([\s\S]+)$/);
  if (at) {
    const found = pickSeat(st.data.sessions, at[1]);
    if (found.error) return void composerRefused(found.error);
    target = found.seat;
    said = at[2];
    marks = atMarked ? atMarked[2] : said;
  }
  if (!target) return void composerRefused(phrase("no chat is aimed at — pick one, or write @name in front of the message"));
  const body = target.structured ? marks : said;
  const woven = weaveHandles(body, st.data.sessions, target.name, !target.structured);
  if (woven.error) return void composerRefused(woven.error);
  if (!sendToSeat(target, woven.text, target.structured ? marked.images : [])) {
    return void composerRefused(phrase("{name} is not answering right now — the message is still here", { name: seatLabel(target) }));
  }
  $("cmp-in").value = "";
  st.cmpTray.clear();
  cmpMenuClose();
  growComposer();
}

$("composer").addEventListener("submit", (ev) => { ev.preventDefault(); composerSend(); });

$("mission-scrim").addEventListener("click", () => closeMission());

$("mission-esc").addEventListener("click", () => closeMission());

for (const chip of $("composer").querySelectorAll(".slash")) {
  chip.addEventListener("click", () => {
    const input = $("cmp-in");
    const ins = chip.dataset.ins;
    if (ins === "/new ") return openDraft(input.value.replace(/^\/new\s*/i, ""));
    if (ins === "#" || ins === "~") {
      const caret = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, caret);
      const pad = !before || /[\s([{'"]$/.test(before) ? "" : " ";
      input.value = `${before}${pad}${ins}${input.value.slice(caret)}`;
      const at = caret + pad.length + 1;
      input.focus();
      input.setSelectionRange(at, at);
      growComposer();
      return cmpMenuCompute();
    }
    if (!input.value.startsWith(ins)) input.value = ins + input.value.replace(/^\/new\s*|^@/, "");
    input.focus();
    input.setSelectionRange(ins.length, ins.length);
  });
}

$("cmp-in").addEventListener("focus", () => { if (st.typing) releaseKeyboard(); st.composing = true; paintAim(); });

$("cmp-in").addEventListener("blur", () => { st.composing = false; paintAim(); setTimeout(cmpMenuClose, 150); });

$("cmp-in").addEventListener("input", () => {
  const t = $("cmp-in");
  if (!st.missionMode && /^\/new\s/i.test(t.value)) openDraft(t.value.replace(/^\/new\s*/i, ""));
  else if (st.missionMode && t.value.startsWith("@")) setMission(false);
  paintShellMode();
  st.cmpTray.sync();
  growComposer();
  if (st.missionMode) cmpMenuClose();
  else cmpMenuCompute();
});

$("cmp-in").addEventListener("keydown", (ev) => {
  ev.stopPropagation();
  const t = ev.target;
  if (cmpMenuKey(ev)) return;
  if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); return composerSend(); }
  if (ev.key === "Backspace" && st.missionMode && t.selectionStart === 0 && t.selectionEnd === 0) {
    ev.preventDefault();
    return setMission(false);
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    if (st.missionMode) return closeMission();
    if (t.value) { t.value = ""; st.cmpTray.clear(); return growComposer(); }
    t.blur();
    document.body.focus();
  }
});

function openComposer() {
  releaseKeyboard();
  $("cmp-in").focus();
}

function openQuestionCard() {
  const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
  if (it?.kind !== "session") return null;
  const e = structPool.get(it.name);
  if (!e) return null;
  const cards = [...e.asked.values()].filter((c) => c.isConnected && !c.classList.contains("answered"));
  return cards[cards.length - 1] || null;
}

function answerWithDigit(n) {
  const card = openQuestionCard();
  if (!card) return false;
  const btn = card.querySelector(".qstep:not([hidden])")?.querySelectorAll(".qo")[n - 1];
  if (!btn) return false;
  if (raycastOn() && card.classList.contains("later")) card.querySelector(".qwake")?.click();
  btn.click();
  if (raycastOn()) btn.focus({ preventScroll: true });
  (card.querySelector(".qstep:not([hidden])") || card).scrollIntoView({ block: "nearest" });
  return true;
}

function stepQuestionCard() {
  const next = openQuestionCard()?.querySelector(".qnext");
  if (!next || next.disabled) return false;
  next.click();
  return true;
}

export { GONE_MS, LAYOUTS, LAYOUT_KEY, LAYOUT_NAMES, WHERE_ICON, adoptBlockSize, adoptLayout, aimedAt, answerWithDigit, bootLayout, born, closeMission, cmpMenuClose, cmpMenuCompute, cmpMenuKey, cmpMenuPaint, cmpMenuPick, composerSend, composerTarget, composerTo, composerToSolid, composerToViewModel, driverUp, flipEnd, flipStart, growComposer, inARow, inAStrip, knock, missionHint, missionWhere, onASleepingPod, openChatFromBar, openComposer, openMission, openQuestionCard, paintAim, paintComposer, paintComposerTo, paintMission, sendToSeat, setBlockSize, setLayout, setMission, shortBranch, stepQuestionCard, vanish, wakeAndSay };
