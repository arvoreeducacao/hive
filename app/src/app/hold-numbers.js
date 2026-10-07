import { arrangeKeys, arrangeOn } from "./arrange.js";
import { welcomeKeys } from "./avatars.js";
import { activeItems, blocksOf } from "./blocks.js";
import { codeOf, hasMod, isLeader, keyLabel, modsMatch, silenced, whichAction } from "./brand-face.js";
import { closeBrowser, closeCockpit, closeDevice, closeEveryPicker, structuredCtrlC } from "./chat-and-panes.js";
import { attachFilesToSeat, loadingChips, seatReceiving } from "./chat-stretches.js";
import { ROOM_KEYS } from "./composer-head.js";
import { $, DIGIT_ACTIONS, FOCUS_MOVES, IS_MAC, MOVE_DIRS, experienceNext, isImageName, phrase, raycastOn, solidMounts, st } from "./core.js";
import { closeDay, dayOnScreen } from "./day.js";
import { attachFilesToDraft, draftFrom, draftInFocus } from "./draft-seat.js";
import { faceSheetOpen, toggleFaceSheet } from "./face-door.js";
import { closeTile, pull, releaseKeyboard } from "./focus-navigation.js";
import { closeHistory, closePreview, closeReviveHow, reviveAs } from "./history.js";
import { archivedOnScreen, closeArchived } from "./archived.js";
import { armLeader, captureKey, literalOf, paintKeys, pool, resolveLeader, tiles } from "./leader-key.js";
import { closeLimPop, limPopOpen } from "./limit-chip.js";
import { closeMirrorChat, paintBlocks } from "./mirror.js";
import { closeMore } from "./new-chat.js";
import { closeProviders, providersOnScreen } from "./providers.js";
import { closeExtensions, extensionsOnScreen } from "./extensions.js";
import { palKeys, palOn } from "./palette.js";
import { panelKeys } from "./panel-window.js";
import { closeShot, openShot, shotOnScreen, stepShotZoom, toggleShotZoom } from "./picture-preview.js";
import { closeConfirm, closePortaria, closeWorkspace, portariaOnScreen, wsOnScreen } from "./pod.js";
import { roomTakesKey } from "./pure-helpers.js";
import { answerWithDigit, growComposer, stepQuestionCard } from "./seat-layout.js";
import { closeFinish, closePrPop, closeSeatMenu, finishOn, prPopOpen, seatMenuOn } from "./seat-menu.js";
import { aloneOn, setAlone } from "./canvas-alone.js";
import { closeShelf, shelfBack, shelfOnScreen, shelfWideOn, toggleShelfWide } from "./shelf.js";
import { structPool } from "./structured-seats.js";
import { TALK_TAP_MS, startTalking, stopTalking, talking } from "./stt.js";
import { answerNudge } from "./team.js";
import { backToLive, copySelection, focusedTerminal, lookingBack, refit, terminalSelection } from "./terminal-history.js";
import { backToThemeBrowse, closeHelp, closeThemes, run, showThemeView, themesOn } from "./themes.js";
import { closePrs, closeThreadPanel, exitReview, markCurrent, pickPrTab, prsOnScreen, stepFile, stepPr, threadVisible, unmarkLast } from "./thread.js";
import { tasksOn } from "./tasks.js";
import { tourKeys } from "./tour.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeRoutines, routinesOnScreen } from "./routines.js";
import { closeMeetings, meetingsOnScreen } from "./meetings.js";
import { closeMemories, inMemoryEditor, memoriesOnScreen, memoryEscape, stepMemory } from "./memories.js";
import { welcomeOn } from "./welcome.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

const HOLD_WAIT = 1000;

const HOLD_WORD = { seat: "chat", block: "block", space: "workspace" };

const MOD_KEYS = ["Meta", "Alt", "Control", "Shift"];

const holdAllowed = () => !st.pending && !st.capturing && !st.typing && !welcomeOn() && st.tourAt < 0;

function heldLevel(e) {
  for (const a of DIGIT_ACTIONS) {
    const b = st.keys[a];
    if (!b || b.code !== "Digit" || !hasMod(b) || silenced(a)) continue;
    if (modsMatch(b, e)) return a;
  }
  return null;
}

const holdSpan = (a) => (a === "seat" ? activeItems().length : a === "block" ? blocksOf(st.space).length : st.spaces.length);

function paintSeatNumbers() {
  if (st.holding !== "seat") {
    for (const el of tiles.values()) el.querySelector(".t-num")?.remove();
    return;
  }
  activeItems().forEach((it, i) => {
    const well = tiles.get(it.key)?.querySelector(".well");
    if (!well) return;
    let n = well.querySelector(".t-num");
    if (!n) {
      n = document.createElement("div");
      n.className = "t-num";
      n.setAttribute("aria-hidden", "true");
      well.appendChild(n);
    }
    n.textContent = String(i + 1);
    n.hidden = i >= 9;
  });
}

function paintHold() {
  document.body.classList.toggle("hold-seat", st.holding === "seat");
  paintSeatNumbers();
  paintBlocks();
  if (st.pending) return;
  holdSolid.show(holdViewModel());
}

let holdSolid = null;

function holdViewModel() {
  if (!st.holding) return { key: "mode", holding: false, txt: "" };
  return { key: "mode", holding: true, txt: `${keyLabel(st.keys[st.holding], null, holdSpan(st.holding))} · ${phrase(HOLD_WORD[st.holding])}` };
}

solidMounts.push((hive) => {
  holdSolid = hive.mountHold($("mode"));
});

function trackHold(e) {
  if (!holdAllowed()) return dropHold();
  /* any real key means the person committed to a shortcut, so the marker gets out of the way
     instead of appearing a second later behind whatever the shortcut opened. */
  if (!MOD_KEYS.includes(e.key)) return dropHold();
  /* a level with a single target has no choice in it: showing "1…1" over the canvas reads
     like a defect, so the marker stays out of the way until there are two of something. */
  const level = heldLevel(e);
  if (!level || holdSpan(level) < 2) return dropHold();
  st.holdArmed = level;
  if (st.holding) {
    if (st.holding === level) return;
    st.holding = level;
    return paintHold();
  }
  if (st.holdTimer) return;
  st.holdTimer = setTimeout(() => {
    st.holdTimer = null;
    st.holding = st.holdArmed;
    paintHold();
  }, HOLD_WAIT);
}

function dropHold() {
  clearTimeout(st.holdTimer);
  st.holdTimer = null;
  st.holdArmed = null;
  if (!st.holding) return;
  st.holding = null;
  paintHold();
}

document.addEventListener("keyup", trackHold, true);

let talkHeldSince = 0;

const talkKeyLetGo = (e, bound) => e.code === bound.code
  || (bound.ctrl && !e.ctrlKey) || (bound.shift && !e.shiftKey)
  || (bound.alt && !e.altKey) || (bound.meta && !e.metaKey);

document.addEventListener("keyup", (e) => {
  if (!talking()) return;
  const bound = st.keys.talk;
  if (!bound || !talkKeyLetGo(e, bound)) return;
  if (Date.now() - talkHeldSince < TALK_TAP_MS) return;
  stopTalking();
}, true);

window.addEventListener("blur", () => { if (talking()) stopTalking({ cancel: true }); });

document.addEventListener("visibilitychange", () => { if (document.hidden && talking()) stopTalking({ cancel: true }); });

window.addEventListener("blur", dropHold);

document.addEventListener("visibilitychange", () => { if (document.hidden) dropHold(); });

document.addEventListener("keydown", (e) => {
  trackHold(e);
  if (st.capturing) return captureKey(e);
  if (welcomeOn()) return welcomeKeys(e);
  if (st.tourAt >= 0) return tourKeys(e);
  if (st.pending) return resolveLeader(e);
  if (palOn()) return palKeys(e);
  if (arrangeOn() && arrangeKeys(e)) return;
  if (whichAction(e)?.action === "talk") {
    e.preventDefault();
    if (e.repeat) return;
    if (talking()) return void stopTalking();
    talkHeldSince = Date.now();
    startTalking();
    return;
  }
  if (talking() && e.key === "Escape") { e.preventDefault(); return void stopTalking({ cancel: true }); }
  if (!$("nudge").hidden && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return answerNudge(false); }
  if (finishOn() && e.key === "Escape" && !st.typing) { e.preventDefault(); e.stopPropagation(); return closeFinish(); }
  if (seatMenuOn() && e.key === "Escape" && !st.typing) { e.preventDefault(); e.stopPropagation(); return closeSeatMenu(); }
  if (prPopOpen() && e.key === "Escape" && !st.typing) { e.preventDefault(); e.stopPropagation(); return closePrPop(); }
  if (limPopOpen() && e.key === "Escape" && !st.typing) { e.preventDefault(); e.stopPropagation(); return closeLimPop(); }
  if (faceSheetOpen() && e.key === "Escape" && !st.typing) { e.preventDefault(); e.stopPropagation(); return toggleFaceSheet(false); }
  if (window.hiveDoctorPanelOn?.() && e.key === "Escape" && !st.typing) { e.preventDefault(); e.stopPropagation(); return window.hiveDoctorPanel(false); }

  const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) && !st.typing;

  if (e.key === "c" && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && !inField && !st.typing) {
    const it = st.open ? { kind: "session", name: st.open } : activeItems()[st.focus];
    const se = it?.kind === "session" ? structPool.get(it.name) : null;
    if (se && !String(window.getSelection() || "")) {
      e.preventDefault();
      return structuredCtrlC(se);
    }
  }

  const directCopy = IS_MAC
    ? (e.metaKey && !e.altKey && !e.ctrlKey)
    : (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey);
  if (directCopy && e.code === "KeyC" && !inField && focusedTerminal()?.term.hasSelection()) {
    e.preventDefault();
    e.stopPropagation();
    return copySelection();
  }

  if ($("more").classList.contains("on") && e.key === "Escape") {
    e.preventDefault();
    return closeMore();
  }
  if (themesOn() && !$("confirm").classList.contains("on")) {
    if (whichAction(e)?.action === "themes") { e.preventDefault(); return closeThemes(); }
    if (e.key === "Escape") {
      e.preventDefault();
      if (!$("thm-edit").hidden) backToThemeBrowse();
      else if (!$("thm-paste").hidden) showThemeView("browse");
      else closeThemes();
    }
    return;
  }
  if ($("help").classList.contains("on")) {
    if (raycastOn() && panelKeys(e, "help")) return;
    if (whichAction(e)?.action === "help") { e.preventDefault(); return closeHelp(); }
    if (e.key === "Escape") {
      e.preventDefault();
      const find = document.activeElement;
      if (find?.dataset?.w === "keys-find" && st.keysFilter) {
        st.keysFilter = "";
        paintKeys();
        return;
      }
      closeHelp();
    }
    return;
  }
  if ($("revive-how").classList.contains("on")) {
    if (e.key === "Escape") { e.preventDefault(); closeReviveHow(); }
    if (e.key === "Enter") { e.preventDefault(); reviveAs(true); }
    return;
  }
  if ($("hist-preview").classList.contains("on")) {
    if (e.key === "Escape") { e.preventDefault(); closePreview(); }
    if (e.key === "Enter") { e.preventDefault(); $("hp-revive").click(); }
    return;
  }
  if ($("history").classList.contains("on")) {
    if (e.key === "Escape") { e.preventDefault(); closeHistory(); }
    return;
  }
  if (archivedOnScreen()) {
    if (e.key === "Escape") { e.preventDefault(); closeArchived(); }
    return;
  }
  if ($("confirm").classList.contains("on")) {
    if (e.key === "Escape") { e.preventDefault(); closeConfirm(false); }
    if (e.key === "Enter") { e.preventDefault(); closeConfirm(true); }
    return;
  }
  if (raycastOn() && tasksOn() && panelKeys(e, "tasks")) return;
  if (shotOnScreen()) {
    if (e.key === "Escape") { e.preventDefault(); return closeShot(); }
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); return toggleShotZoom(); }
    if ((e.key === "+" || e.key === "=" || e.key === "-") && stepShotZoom(e.key === "-" ? -1 : 1)) { e.preventDefault(); return; }
    return;
  }

  if (isLeader(e)) {
    e.preventDefault();
    e.stopPropagation();
    return armLeader();
  }

  if (portariaOnScreen()) {
    if (e.key === "Escape") { e.preventDefault(); return closePortaria(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (wsOnScreen()) {
    if (e.key === "Escape") { e.preventDefault(); return closeWorkspace(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (usageOnScreen()) {
    if (raycastOn() && panelKeys(e, "usage")) return;
    const m = whichAction(e);
    if (e.key === "Escape" || m?.action === "usage") { e.preventDefault(); return closeUsage(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (meetingsOnScreen()) {
    const m = whichAction(e);
    if (e.key === "Escape" || m?.action === "meetings") { e.preventDefault(); return closeMeetings(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (routinesOnScreen()) {
    if (raycastOn() && panelKeys(e, "routines")) return;
    const m = whichAction(e);
    if (e.key === "Escape" || m?.action === "routines") { e.preventDefault(); return closeRoutines(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (providersOnScreen() && !$("confirm").classList.contains("on")) {
    const m = whichAction(e);
    if (e.key === "Escape" || m?.action === "accounts") { e.preventDefault(); return closeProviders(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (extensionsOnScreen()) {
    const m = whichAction(e);
    if (e.key === "Escape" || m?.action === "extensions") { e.preventDefault(); return closeExtensions(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (worktreesOnScreen()) {
    if (raycastOn() && panelKeys(e, "worktrees")) return;
    const m = whichAction(e);
    if (e.key === "Escape" || m?.action === "worktrees") { e.preventDefault(); return closeWorktrees(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (memoriesOnScreen()) {
    const m = whichAction(e);
    if (e.key === "Escape" && memoryEscape()) { e.preventDefault(); return; }
    if (e.key === "Escape" || m?.action === "memories") { e.preventDefault(); return closeMemories(); }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !(e.altKey || e.ctrlKey || e.metaKey) && !inMemoryEditor(e.target)) { e.preventDefault(); return stepMemory(e.key === "ArrowDown" ? 1 : -1); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (shelfOnScreen()) {
    if (raycastOn() && panelKeys(e, "shelf")) return;
    const m = whichAction(e);
    if (e.key === "Escape") {
      e.preventDefault();
      if (shelfWideOn()) return toggleShelfWide();
      return st.shelfOpen ? shelfBack() : closeShelf();
    }
    if (m?.action === "fullscreen" && st.shelfOpen) { e.preventDefault(); e.stopPropagation(); return toggleShelfWide(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (dayOnScreen()) {
    if (raycastOn() && panelKeys(e, "day")) return;
    if (e.key === "Escape") { e.preventDefault(); return closeDay(); }
    if (!(e.altKey || e.ctrlKey || e.metaKey)) return;
  }

  if (e.key === "Escape" && document.querySelector(".sv-menu")) {
    e.preventDefault();
    return closeEveryPicker(true);
  }

  if (e.key === "Escape" && experienceNext() && st.open && !inField && !st.typing && !aloneOn() && !prsOnScreen() && !lookingBack()) {
    e.preventDefault();
    return closeTile();
  }

  if (st.cockChat && !inField) {
    if (e.key === "Escape") { e.preventDefault(); return closeCockpit(); }
  }

  if (aloneOn() && !inField && !st.cockChat && !st.webChat && !st.deviceChat && !st.reviewChat) {
    if (e.key === "Escape") { e.preventDefault(); return setAlone(false); }
  }

  if (st.webChat && !inField) {
    if (e.key === "Escape") { e.preventDefault(); return closeBrowser(); }
  }

  if (st.deviceChat && !inField) {
    if (e.key === "Escape") { e.preventDefault(); return closeDevice(); }
  }

  if (st.reviewChat && !prsOnScreen()) {
    const m = whichAction(e);
    if (e.key === "Escape") {
      e.preventDefault();
      if (document.activeElement === $("pr-text")) return document.activeElement.blur();
      return exitReview();
    }
    if (m?.action === "prs") { e.preventDefault(); return exitReview(); }
    if (!inField && !(e.altKey || e.ctrlKey || e.metaKey)) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return stepFile(e.key === "ArrowDown" ? 1 : -1); }
      if (e.code === "KeyV") { e.preventDefault(); return e.shiftKey ? unmarkLast() : markCurrent(); }
      if (/^Digit[1-5]$/.test(e.code)) { e.preventDefault(); return pickPrTab(Number(e.code.slice(5)) - 1); }
      return;
    }
  }

  if (prsOnScreen()) {
    if (raycastOn() && panelKeys(e, "prs")) return;
    const m = whichAction(e);
    if (e.key === "Escape") {
      e.preventDefault();
      if (raycastOn()) {
        if ($("pr-detail").contains(document.activeElement)) return $("pr-url").focus();
        return closePrs();
      }
      if (document.activeElement === $("pr-text") || document.activeElement === $("pr-url")) return document.activeElement.blur();
      return closePrs();
    }
    if (m?.action === "prs") { e.preventDefault(); return closePrs(); }
    if (!inField && !(e.altKey || e.ctrlKey || e.metaKey)) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return stepFile(e.key === "ArrowDown" ? 1 : -1); }
      if (e.code === "KeyV") { e.preventDefault(); return e.shiftKey ? unmarkLast() : markCurrent(); }
      if (e.code === "BracketLeft") { e.preventDefault(); return stepPr(-1); }
      if (e.code === "BracketRight") { e.preventDefault(); return stepPr(1); }
      if (/^Digit[1-5]$/.test(e.code)) { e.preventDefault(); return pickPrTab(Number(e.code.slice(5)) - 1); }
      return;
    }
  }

  if (threadVisible() && !st.typing) {
    const m = whichAction(e);
    if (m?.action === "threads") { e.preventDefault(); return closeThreadPanel(); }
    if (e.key === "Escape" && !inField) { e.preventDefault(); return closeThreadPanel(); }
  }

  const back = lookingBack();
  if (back && e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    return backToLive(back);
  }

  const m = whichAction(e);

  if (st.typing) {
    if (m?.action === "release") { e.preventDefault(); e.stopPropagation(); releaseKeyboard(); }
    if (m?.action === "copy" && terminalSelection()) { e.preventDefault(); e.stopPropagation(); copySelection(); }
    if (m && (FOCUS_MOVES[m.action] || MOVE_DIRS[m.action]) && (st.keys[m.action].alt || st.keys[m.action].ctrl || st.keys[m.action].meta)) {
      e.preventDefault();
      e.stopPropagation();
      run(m.action);
    }
    if (m && ROOM_KEYS.includes(m.action) && roomTakesKey(m.action, !!literalOf(st.keys[m.action])) && hasMod(st.keys[m.action])) {
      e.preventDefault();
      e.stopPropagation();
      run(m.action);
    }
    if (m?.action === "fullscreen" && hasMod(st.keys[m.action]) && !literalOf(st.keys[m.action])) {
      e.preventDefault();
      e.stopPropagation();
      run(m.action);
    }
    return;
  }

  if (!m && !inField && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
      && /^Digit[1-9]$/.test(e.code) && answerWithDigit(Number(e.code.slice(5)))) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  if (!m && !inField && !e.altKey && !e.ctrlKey && !e.metaKey && e.shiftKey
      && codeOf(e) === "Enter" && stepQuestionCard()) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  if (m) {
    const b = st.keys[m.action];
    if (inField && !(b.alt || b.ctrl || b.meta)) return;
    if (m.action === "copy" && !terminalSelection()) return;
    e.preventDefault();
    e.stopPropagation();
    return run(m.action, m.digit);
  }

  if (e.key === "Escape" && !inField && st.mirrorOpen) { e.preventDefault(); return closeMirrorChat(); }
  if (e.key === "Escape" && !inField && st.open) { e.preventDefault(); closeTile(); }
}, true);

const SHOT_EDGE = 1600;
const BASE64_CHUNK = 0x8000;
const SHRINKABLE = /^data:image\/(png|jpeg|webp);base64,/i;

function bytesOfDataUrl(dataUrl) {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

function dataUrlOf(bytes, media) {
  let binary = "";
  for (let at = 0; at < bytes.length; at += BASE64_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(at, at + BASE64_CHUNK));
  }
  return `data:${media};base64,${btoa(binary)}`;
}

async function shrinkShot(dataUrl) {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return dataUrl;
  if (!SHRINKABLE.test(dataUrl)) return dataUrl;
  try {
    const bitmap = await createImageBitmap(new Blob([bytesOfDataUrl(dataUrl)]));
    const edge = Math.max(bitmap.width, bitmap.height);
    if (edge <= SHOT_EDGE) { bitmap.close(); return dataUrl; }
    const scale = SHOT_EDGE / edge;
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const small = await canvas.convertToBlob({ type: "image/png" });
    return dataUrlOf(new Uint8Array(await small.arrayBuffer()), "image/png");
  } catch { return dataUrl; }
}

function readFile(file) {
  return new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.onerror = () => r(null);
    fr.readAsDataURL(file);
  }).then((data) => (typeof data === "string" ? shrinkShot(data) : data));
}

async function attachToMission(files) {
  const undo = loadingChips($("cmp-attach"), files);
  const res = await fetch("/api/attach", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ files })
  });
  const d = await res.json();
  undo();
  if (!d.ok) return;
  const t = $("cmp-in");
  for (const path of d.paths) {
    if (isImageName(path)) { st.cmpTray.add(path); continue; }
    const at = t.selectionStart ?? t.value.length;
    const sep = at > 0 && !/\s$/.test(t.value.slice(0, at)) ? "\n" : "";
    t.setRangeText(`${sep}${path}\n`, at, t.selectionEnd ?? at, "end");
  }
  growComposer();
  t.focus();
}

async function sendFiles(target, files, marked) {
  const done = marked ? () => {} : seatReceiving(target, files);
  const res = await fetch("/api/screenshot", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: target.name, where: target.where, images: files })
  });
  const d = await res.json();
  done();
  if (d.ok) {
    const e = pool.get(target.name);
    if (e) for (const path of d.paths) if (isImageName(path)) tuiAttachImage(e, path);
  }
  pull();
}

function tuiTrayPaint(e) {
  const on = !!e.tuiTray?.querySelector(".att");
  e.tuiTray?.classList.toggle("on", on);
  e.host.style.bottom = on ? "60px" : "";
  requestAnimationFrame(() => refit(e));
}

function tuiAttachImage(e, path) {
  if (!e.tuiTray) {
    e.tuiTray = document.createElement("div");
    e.tuiTray.className = "tui-attach";
    e.host.appendChild(e.tuiTray);
  }
  const chip = document.createElement("div");
  chip.className = "att";
  const short = path.split("/").pop();
  chip.innerHTML = `<img alt=""><button type="button" class="ax" title="${phrase("put the strip away — the image stays in the chat")}">×</button>`;
  const img = chip.querySelector("img");
  img.src = `/api/image?path=${encodeURIComponent(path)}&where=${e.where}&name=${encodeURIComponent(e.name)}`;
  img.alt = short;
  img.title = phrase("{short} — click to see it big", { short: short });
  img.addEventListener("click", () => openShot(path, e.where, e.name));
  chip.querySelector(".ax").addEventListener("click", () => { chip.remove(); tuiTrayPaint(e); });
  e.tuiTray.appendChild(chip);
  while (e.tuiTray.children.length > 8) e.tuiTray.firstChild.remove();
  tuiTrayPaint(e);
}

document.addEventListener("paste", async (e) => {
  const files = [...(e.clipboardData?.items || [])]
    .filter((i) => i.type.startsWith("image/"))
    .map((i) => i.getAsFile())
    .filter(Boolean);
  if (!files.length) return;

  if (st.missionMode) {
    e.preventDefault();
    const shots = (await Promise.all(files.map(readFile))).filter(Boolean);
    return attachToMission(shots.map((data) => ({ data })));
  }

  const under = (e.target instanceof Element ? e.target : document.activeElement)?.closest?.(".tile");
  const draft = under ? draftFrom(under) : draftInFocus();
  if (draft) {
    e.preventDefault();
    const shots = await Promise.all(files.map(readFile));
    const loaded = files.map((f, i) => ({ name: f.name, data: shots[i] })).filter((f) => f.data);
    if (loaded.length) await attachFilesToDraft(draft, loaded);
    return;
  }
  const byDom = under && st.data.sessions.find((s) => s.name === under.dataset.name);
  const target = byDom || (st.open ? st.data.sessions.find((s) => s.name === st.open) : activeItems()[st.focus]);
  if (!target || target.kind === "job") return;
  e.preventDefault();
  const shots = (await Promise.all(files.map(readFile))).filter(Boolean);
  const entry = target.structured && structPool.get(target.name);
  if (entry) return attachFilesToSeat(entry, shots);
  return sendFiles(target, shots);
});

export { HOLD_WAIT, HOLD_WORD, MOD_KEYS, SHOT_EDGE, attachToMission, dropHold, heldLevel, holdAllowed, holdSolid, holdSpan, holdViewModel, paintHold, paintSeatNumbers, readFile, sendFiles, shrinkShot, trackHold, tuiAttachImage, tuiTrayPaint };
