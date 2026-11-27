import { startFresh, switchSeatProvider } from "./provider-transfer.js";
import { render } from "./arrange.js";
import { markCopied } from "./avatars.js";
import { forgetSeat } from "./blocks.js";
import { attachFilesToSeat, interruptStructured, rememberSent, svCmd, svEarlier, svReset, svTrimTurns, svTypePath } from "./chat-stretches.js";
import { svForked } from "./chat-fork.js";
import { closeAsk, composerDriverNote, composerSaw, noteAsk, paintQueue } from "./composer.js";
import { closePlanCard, svPlanCard } from "./composer-plan.js";
import { dressCatalog, paintFastMark, paintModelFoot, rememberSeatPick } from "./composer-models.js";
import { rememberedModel, rememberedOptions } from "./model-memory.js";
import { seatEventSeen } from "./seat-events.js";
import { paintSaidChips } from "./context-chips.js";
import { svConvBubbleOf, svConvDispatched, svConvDraftDrop, svConvMentions, svConvNote, svConvPeer, svConvSwitch, svConvRecovered, svConvResay, svConvRetry, svConvRewind, svConvRunOff, svConvSaid, svConvSaidAs, svConvSettle, svConvShow, svConvSteer, svConvSteerSaw, svConvStopped, svConvStream, svConvThink, svConvThinking, svConvThumb, svConvTurnEnded, svConvTurnStart, svConvUnsay } from "./conversation-model.js";
import { editFailed } from "./edit-message.js";
import { $, apiGet, chooseOption, esc, raycastOn, forgetUpload, liveMarkdown, lookFor, markUpload, NATIVE_COMMAND_NAMES, phrase, reachRef, readPage, renderMarkdown, sayPage, st, svgIcon } from "./core.js";
import { effortBars } from "/assets/behavior-defaults.mjs";
import { drafts } from "./draft-seat.js";
import { closeTile, openTile, pull, releaseKeyboard } from "./focus-navigation.js";
import { accountSaid, providerAccounts, providerName, providerReady, providerWhyNot, pullAccounts, readyAgents } from "./providers.js";
import { enrichMarkdown } from "./markdown-rich.js";
import { memoryTurnEnded, memoryTurnSaw } from "./memory-turn.js";
import { mcpAuthenticate, mcpSignInsAtInit } from "./mcp-sign-in.js";
import { commandCardView } from "../views.js";
import { wireMdShots, wireShelfLinks } from "./picture-preview.js";
import { dropFieldPane, paneShownFor, takeFieldPane } from "./plane.js";
import { pullThreads } from "./prs.js";
import { expandMentions, expandPeople, seatLabel, splitPeerHandle } from "./pure-helpers.js";
import { chatOfThread, closeFinish, finishOn, goToPr } from "./seat-menu.js";
import { paintPageChrome, pullShelf, shelfLinkTab, shelfOnScreen, shelfPickedProposal, shelfVersionsOf } from "./shelf.js";
import { paintActivity, refreshContext, refreshDriverState, structPool, svActivity, svAppend, svDequeue, svDequeuedEarly, svLine } from "./structured-seats.js";
import { ART_WEBVIEW, artClock, artifactIndexAt, shelfPageOf, svSubCall, svSubEcho, svSubLanded, svSubTask, svSubUnpin, svSubsOfAnEndedProcess, svToolCard, svToolResult, tookLabel } from "./subagents-dock.js";
import { keyFromPage, registerSurface, sidePanelWebHost } from "./side-panel.js";
import { dressWebPane, paintWebExtras, tabIconHtml, watchFrame, webChord } from "./web-pane-extras.js";
import { toClipboard } from "./terminal-history.js";
import { closePrs, closeThreadPanel, exitReview, openThreadOf, prsOnScreen, pullPrs } from "./thread.js";
import { closeQuestion, dropQuestion, questionCard } from "./question-card.js";
import { ARTIFACT_LINK, toolSays, trimBody } from "./tool-face.js";
import { svMcpApp } from "./mcp-apps.js";
import { putHidden, putText } from "./dom-writes.js";

const PR_LINK = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+(?:[/?#]\S*)?$/;

const THREAD_LINK = /^https:\/\/[\w.-]+\.slack\.com\/archives\/[A-Z0-9]+\/p\d{16}(?:[?#]\S*)?$/;

function prKeyOf(url) {
  const m = /github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(String(url || ""));
  return m ? `${m[1]}/${m[2]}#${m[3]}` : "";
}

function threadKeyOf(url) {
  const m = /slack\.com\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/.exec(String(url || ""));
  if (!m) return "";
  const parent = /[?&]thread_ts=(\d{10}\.\d{6})/.exec(String(url));
  return `${m[1]}:${parent ? parent[1] : `${m[2]}.${m[3]}`}`;
}

function homeOfLink(name, href) {
  if ((href.match(ARTIFACT_LINK) || [])[0] === href) return () => openArtifactUrl(name, href);
  if (PR_LINK.test(href)) return () => openPrLink(name, href);
  if (THREAD_LINK.test(href)) return () => openThreadLink(name, href);
  return null;
}

const applePlatform = () => /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

function leavesForTheBrowser(ev, apple = applePlatform()) {
  if (ev.button === 1) return true;
  return apple ? !!ev.metaKey : !!ev.ctrlKey;
}

const openOutside = (href) => { if (/^https?:/i.test(href || "")) window.open(href, "_blank", "noopener,noreferrer"); };

function wireLinks(name, root) {
  if (!root) return;
  wireShelfLinks(name, root);
  for (const a of root.querySelectorAll("a[href]")) {
    if (a.dataset.out || a.dataset.here) continue;
    const go = homeOfLink(name, a.getAttribute("href") || "");
    if (!go) continue;
    a.dataset.here = "1";
    a.classList.add("md-art");
    a.title = phrase("opens in the hive — {chord}+click opens it in your browser", { chord: applePlatform() ? "⌘" : "ctrl" });
    const took = (ev) => {
      if (ev.type === "auxclick" && ev.button !== 1) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (leavesForTheBrowser(ev)) return openOutside(a.getAttribute("href") || "");
      go();
    };
    a.addEventListener("click", took);
    a.addEventListener("auxclick", took);
  }
}

async function waitForRegistered(pull, find, tries = 3) {
  for (let i = 0; i < tries; i++) {
    await pull();
    const found = find();
    if (found) return found;
  }
  return null;
}

async function openPrLink(name, url) {
  const key = prKeyOf(url);
  const known = st.prs.find((p) => p.key === key);
  if (known) return goToPr(known);
  const took = await registerPr(name, url);
  if (took) return goToPr(took);
  window.open(url, "_blank");
}

async function registerPr(name, url) {
  try {
    const r = await (await fetch("/api/prs/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, session: name || "" })
    })).json();
    if (!r.key) return null;
    return await waitForRegistered(pullPrs, () => st.prs.find((p) => p.key === r.key));
  } catch { return null; }
}

async function openThreadLink(name, url) {
  const key = threadKeyOf(url);
  const known = st.threads.find((t) => t.key === key);
  if (known) return goToThread(known);
  const took = await registerThread(name, url);
  if (took) return goToThread(took);
  window.open(url, "_blank");
}

async function registerThread(name, url) {
  try {
    const r = await (await fetch("/api/threads/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, session: name || "" })
    })).json();
    if (!r.key) return null;
    return await waitForRegistered(() => pullThreads(true), () => st.threads.find((t) => t.key === r.key));
  } catch { return null; }
}

function goToThread(t) {
  if (!chatOfThread(t)) return window.open(t.link, "_blank");
  if (finishOn()) closeFinish();
  openThreadOf(t.session, t.key);
}

function openArtifactUrl(name, url) {
  openWebPage(name, url);
}

function openWebPage(name, url, into = null) {
  if (!ART_WEBVIEW) return window.open(url, "_blank");
  const web = webStateOf(name);
  const address = webAddress(url);
  const open = web.tabs.find((t) => t.kind !== "artifact" && t.url === address);
  const tab = open || (into && web.tabs.includes(into) ? into : null) || web.tabs.find((t) => t.kind !== "artifact" && !t.url) || addWebTab(name) || web.tabs[web.active];
  if (!tab) return window.open(url, "_blank");
  if (!open) {
    tab.kind = "web";
    tab.slug = "";
    tab.url = address;
    tab.title = "";
  }
  web.active = web.tabs.indexOf(tab);
  if (st.webChat === name && paneShownFor(name)) render();
  else openBrowser(name);
}

st.deviceChat = null;

st.fieldPane = "";

const deviceApplied = new Map();

let deviceClock = 0;

st.deviceLoading = false;

st.deviceGone = "";

st.deviceNoVideo = "";

st.deviceAgain = false;

st.deviceBooting = "";

st.deviceSaying = "";

st.deviceTape = null;

const DEVICE_BEAT = 120;

const DEVICE_RETRY = 3000;

const VIDEO_STEP = 33333;


const VIDEO_WAIT = 5000;

const canWatchVideo = () => typeof VideoDecoder === "function" && typeof EncodedVideoChunk === "function";

const nalTypeOf = (nal) => nal[3] & 0x1f;

const codecOfSps = (nal) => `avc1.${[nal[4], nal[5], nal[6]].map((b) => b.toString(16).padStart(2, "0")).join("")}`;

function joinBytes(parts) {
  const size = parts.reduce((n, one) => n + one.length, 0);
  const all = new Uint8Array(size);
  let at = 0;
  for (const one of parts) { all.set(one, at); at += one.length; }
  return all;
}

function h264Units(onUnit) {
  let tail = new Uint8Array(0);
  const eat = (chunk) => {
    const buf = joinBytes([tail, chunk]);
    const marks = [];
    for (let i = 0; i + 2 < buf.length; i++) {
      if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) { marks.push(i); i += 2; }
    }
    if (!marks.length) { tail = buf; return; }
    for (let k = 0; k + 1 < marks.length; k++) onUnit(buf.slice(marks[k], marks[k + 1]));
    tail = buf.slice(marks[marks.length - 1]);
  };
  return eat;
}

function h264Pictures(onPicture) {
  let held = [];
  let key = false;
  return (nal) => {
    const type = nalTypeOf(nal);
    if (type === 5) key = true;
    held.push(nal);
    if (type !== 1 && type !== 5) return;
    onPicture(joinBytes(held), key);
    held = [];
    key = false;
  };
}

const deviceFrameUrlOf = (seat, at = Date.now()) => `/api/device/frame?name=${encodeURIComponent(seat)}&t=${at}`;

const deviceSaid = (d) => [d.avd || d.serial || d.platform || "", d.width && d.height ? `${d.width}×${d.height}` : "", d.app || ""].filter(Boolean).join(" · ");

const deviceKeyOf = (d) => `${d.serial || d.avd || ""}:${d.at || 0}`;

function pointOnDevice(click, box, natural) {
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const drawnW = natural.width * scale;
  const drawnH = natural.height * scale;
  const left = (box.width - drawnW) / 2;
  const top = (box.height - drawnH) / 2;
  const x = (click.x - left) / scale;
  const y = (click.y - top) / scale;
  if (x < 0 || y < 0 || x > natural.width || y > natural.height) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

const deviceOfSeat = (name) => st.data.sessions.find((x) => x.name === name)?.device || null;

const deviceCall = (path, payload) => fetch(`/api/device/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});

const deviceAct = (name, path, payload) => deviceCall(path, { name, ...payload }).then(() => askDeviceFrame(name, true));

const PHONE_NAMES = { android: "Android", ios: "iPhone" };

async function phonesToBoot() {
  const said = await fetch("/api/device/list").then((r) => r.json()).catch(() => ({ error: phrase("no connection") }));
  if (said.error) return { error: said.error };
  const ways = [];
  if ((said.avds || []).length) ways.push("android");
  if ((said.sims || []).length) ways.push("ios");
  if (!ways.length) return { error: said.android || said.ios || phrase("nothing on this machine can boot a phone") };
  return { ways };
}

async function startDevice(name) {
  openDevice(name);
  if (st.deviceChat !== name || deviceOfSeat(name) || st.deviceBooting) return;
  sayOnDevice(name, phrase("looking for a phone to boot"));
  const found = await phonesToBoot();
  if (st.deviceChat !== name || deviceOfSeat(name) || st.deviceBooting) return;
  if (found.error) return sayOnDevice(name, found.error);
  if (found.ways.length === 1) return bootDevice(name, found.ways[0]);
  askWhichPhone(name, found.ways);
}

function askWhichPhone(name, ways) {
  const pane = document.querySelector(`.tile[data-name="${name}"] .art.device`);
  if (!pane) return;
  st.deviceSaying = name;
  pane.querySelector(".device-screen").hidden = true;
  const gone = pane.querySelector(".art-gone");
  gone.hidden = false;
  gone.textContent = "";
  const asked = document.createElement("span");
  asked.textContent = phrase("which phone?");
  gone.append(asked);
  const row = document.createElement("span");
  row.className = "device-pick";
  for (const way of ways) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = PHONE_NAMES[way] || way;
    button.addEventListener("click", (ev) => { ev.stopPropagation(); bootDevice(name, way); });
    row.append(button);
  }
  gone.append(row);
}

async function bootDevice(name, platform) {
  if (st.deviceBooting) return;
  st.deviceBooting = name;
  sayOnDevice(name, phrase("waking the phone up — the first time takes about half a minute"));
  const said = await fetch("/api/device/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, platform }) })
    .then((r) => r.json())
    .catch(() => ({ error: phrase("no connection") }));
  st.deviceBooting = "";
  if (said.error) return sayOnDevice(name, said.error);
  st.deviceSaying = "";
  st.deviceGone = "";
  await pull();
  askDeviceFrame(name, true);
}

function sayOnDevice(name, said) {
  const pane = document.querySelector(`.tile[data-name="${name}"] .art.device`);
  if (!pane) return;
  st.deviceSaying = name;
  pane.querySelector(".device-screen").hidden = true;
  const gone = pane.querySelector(".art-gone");
  gone.hidden = false;
  gone.textContent = said;
}

function openDevice(name) {
  if (st.deviceChat === name && paneShownFor(name)) return closeDevice();
  if (st.cockChat) closeCockpit();
  if (st.webChat) closeBrowser();
  if (st.reviewChat) exitReview();
  if (st.threadChat) closeThreadPanel();
  if (prsOnScreen()) closePrs();
  if (finishOn()) closeFinish();
  releaseKeyboard();
  st.deviceGone = "";
  st.deviceNoVideo = "";
  st.deviceChat = name;
  if (!takeFieldPane(name)) openTile(name, false);
  render();
}

function closeDevice() {
  if (!st.deviceChat) return;
  st.deviceChat = null;
  st.deviceSaying = "";
  stopDeviceFrames();
  dropFieldPane();
  render();
}

function stopFrameLoop() {
  clearTimeout(deviceClock);
  deviceClock = 0;
  st.deviceLoading = false;
  st.deviceAgain = false;
}

function stopDeviceFrames() {
  stopFrameLoop();
  stopDeviceVideo();
}

function stopDeviceVideo() {
  const tape = st.deviceTape;
  if (!tape) return;
  st.deviceTape = null;
  clearTimeout(tape.deadline);
  try { tape.reader?.cancel(); } catch {}
  try { tape.stop(); } catch {}
  try { if (tape.decoder && tape.decoder.state !== "closed") tape.decoder.close(); } catch {}
}

const deviceCanvasOf = (name) => document.querySelector(`.tile[data-name="${name}"] .art.device .device-live`);

function startDeviceVideo(name) {
  if (!canWatchVideo()) return false;
  if (st.deviceTape) return st.deviceTape.name === name;
  const d = deviceOfSeat(name);
  if (d && st.deviceNoVideo === deviceKeyOf(d)) return false;
  const canvas = deviceCanvasOf(name);
  if (!canvas) return false;
  const control = new AbortController();
  const tape = { name, stop: () => control.abort(), decoder: null, reader: null, painted: false };
  st.deviceTape = tape;
  tape.deadline = setTimeout(() => videoNeverCame(name, tape), VIDEO_WAIT);
  watchDevice(name, canvas, tape, control).catch(() => giveUpVideo(name, tape));
  return true;
}

function videoNeverCame(name, tape) {
  if (st.deviceTape !== tape || tape.painted) return;
  const d = deviceOfSeat(name);
  st.deviceNoVideo = d ? deviceKeyOf(d) : "";
  giveUpVideo(name, tape);
}

function giveUpVideo(name, tape) {
  if (st.deviceTape !== tape) return;
  stopDeviceVideo();
  const canvas = deviceCanvasOf(name);
  if (canvas) canvas.hidden = true;
  askDeviceFrame(name, true);
}

async function watchDevice(name, canvas, tape, control) {
  const said = await fetch(`/api/device/video?name=${encodeURIComponent(name)}`, { signal: control.signal });
  if (!said.ok || !said.body) return giveUpVideo(name, tape);
  const brush = canvas.getContext("2d");
  let stamp = 0;
  let codec = "";
  let keyed = false;
  const show = (frame) => {
    if (canvas.width !== frame.displayWidth) { canvas.width = frame.displayWidth; canvas.height = frame.displayHeight; }
    brush.drawImage(frame, 0, 0);
    frame.close();
    if (!tape.painted) { tape.painted = true; deviceVideoLanded(name); }
  };
  const build = (want) => {
    try { if (tape.decoder && tape.decoder.state !== "closed") tape.decoder.close(); } catch {}
    tape.decoder = new VideoDecoder({ output: show, error: () => giveUpVideo(name, tape) });
    tape.decoder.configure({ codec: want, optimizeForLatency: true });
    keyed = false;
  };
  const pictures = h264Pictures((bytes, key) => {
    if (!tape.decoder || tape.decoder.state !== "configured") return;
    if (!keyed && !key) return;
    keyed = true;
    stamp += VIDEO_STEP;
    try { tape.decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp: stamp, data: bytes })); } catch { giveUpVideo(name, tape); }
  });
  const eat = h264Units((nal) => {
    if (nalTypeOf(nal) === 7) {
      const want = codecOfSps(nal);
      if (want !== codec) { codec = want; build(want); }
    }
    pictures(nal);
  });
  tape.reader = said.body.getReader();
  while (st.deviceTape === tape) {
    const { value, done } = await tape.reader.read();
    if (done) break;
    if (!value) continue;
    eat(value);
  }
  giveUpVideo(name, tape);
}

function deviceVideoLanded(name) {
  stopFrameLoop();
  const pane = document.querySelector(`.tile[data-name="${name}"] .art.device`);
  if (!pane) return;
  pane.querySelector(".device-screen").hidden = true;
  pane.querySelector(".device-live").hidden = false;
  pane.querySelector(".art-gone").hidden = true;
}

const deviceScreenOf = (name) => document.querySelector(`.tile[data-name="${name}"] .art.device .device-screen`);

function askDeviceFrame(name, now = false) {
  clearTimeout(deviceClock);
  deviceClock = 0;
  if (st.deviceChat !== name || document.visibilityState !== "visible" || st.deviceTape?.painted) return;
  if (st.deviceLoading) {
    if (now) st.deviceAgain = true;
    return;
  }
  const d = deviceOfSeat(name);
  const img = deviceScreenOf(name);
  if (!d || !img) return;
  st.deviceLoading = true;
  img.src = deviceFrameUrlOf(name);
}

function deviceFrameLanded(name, ok) {
  st.deviceLoading = false;
  const pane = document.querySelector(`.tile[data-name="${name}"] .art.device`);
  if (!pane) return;
  const img = pane.querySelector(".device-screen");
  const gone = pane.querySelector(".art-gone");
  if (ok && st.deviceTape?.painted) return;
  if (ok) {
    st.deviceGone = "";
    img.hidden = false;
    gone.hidden = true;
    const soon = st.deviceAgain ? 0 : DEVICE_BEAT;
    st.deviceAgain = false;
    if (st.deviceChat === name) deviceClock = setTimeout(() => askDeviceFrame(name), soon);
    return;
  }
  const d = deviceOfSeat(name);
  st.deviceGone = d ? deviceKeyOf(d) : "";
  img.hidden = true;
  gone.hidden = false;
  gone.textContent = phrase("the emulator is gone");
  if (st.deviceChat === name) deviceClock = setTimeout(() => askDeviceFrame(name), DEVICE_RETRY);
}

function tapDevice(name, face, ev) {
  const box = face.getBoundingClientRect();
  const natural = { width: face.naturalWidth || face.width, height: face.naturalHeight || face.height };
  const at = pointOnDevice({ x: ev.clientX - box.left, y: ev.clientY - box.top }, { width: box.width, height: box.height }, natural);
  if (!at) return;
  deviceAct(name, "tap", { x: at.x, y: at.y });
}

function sendDevicePrint(name) {
  const live = deviceCanvasOf(name);
  const img = deviceScreenOf(name);
  const face = live && !live.hidden && live.width ? live : img;
  if (!face || face.hidden || !(face.naturalWidth || face.width)) return;
  const canvas = document.createElement("canvas");
  canvas.width = face.naturalWidth || face.width;
  canvas.height = face.naturalHeight || face.height;
  canvas.getContext("2d").drawImage(face, 0, 0);
  let crop = "";
  try { crop = canvas.toDataURL("image/png"); } catch {}
  if (!crop) return;
  const d = deviceOfSeat(name);
  fetch("/api/browser/print", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, url: d ? deviceSaid(d) : "", crop }) }).catch(() => {});
}

function devicePaneOf(el, s) {
  stopFrameLoop();
  const pane = document.createElement("section");
  pane.className = "art device";
  pane.innerHTML = `
    <div class="art-head">
      <svg class="art-face" aria-hidden="true"><use href="#i-phone"/></svg>
      <div class="art-id"><b>${phrase("device")}</b><span></span></div>
      <button class="art-btn shut device-shut" aria-label="${phrase("close the device")}"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
    </div>
    <form class="device-bar"><button type="button" class="device-print" title="${phrase("send a screenshot of this screen to the chat")}" aria-label="${phrase("send a screenshot of this screen to the chat")}"><svg aria-hidden="true"><use href="#i-camera"/></svg></button><button type="button" class="device-key" data-key="BACK">${phrase("BACK")}</button><button type="button" class="device-key" data-key="HOME">${phrase("HOME")}</button><input type="text" spellcheck="false" autocomplete="off" placeholder="${phrase("type here — Enter sends it to the device")}"></form>
    <div class="art-stage"><img class="device-screen" hidden alt="${phrase("the screen of the device this seat is driving")}"><canvas class="device-live" hidden aria-label="${phrase("the screen of the device this seat is driving")}"></canvas><div class="art-gone"></div></div>`;
  pane.addEventListener("click", (ev) => ev.stopPropagation());
  pane.querySelector(".device-shut").addEventListener("click", closeDevice);
  pane.querySelector(".device-print").addEventListener("click", (ev) => { ev.stopPropagation(); sendDevicePrint(s.name); });
  pane.querySelectorAll(".device-key").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); deviceAct(s.name, "key", { key: b.dataset.key }); }));
  pane.querySelector(".device-bar").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = ev.currentTarget.querySelector("input");
    const text = input.value;
    if (!text) return;
    input.value = "";
    deviceAct(s.name, "type", { text });
  });
  const img = pane.querySelector(".device-screen");
  img.addEventListener("load", () => deviceFrameLanded(s.name, true));
  img.addEventListener("error", () => deviceFrameLanded(s.name, false));
  img.addEventListener("click", (ev) => { ev.stopPropagation(); tapDevice(s.name, img, ev); });
  const live = pane.querySelector(".device-live");
  live.addEventListener("click", (ev) => { ev.stopPropagation(); tapDevice(s.name, live, ev); });
  el.appendChild(pane);
  return pane;
}

function paintWebChipOfChat(el, s) {
  const chip = el.querySelector(".t-page");
  if (!chip) return;
  if (!chip.dataset.wired) {
    chip.dataset.wired = "1";
    chip.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); openBrowser(el.dataset.name); });
  }
  const web = webOfSeat.get(s.name);
  const tab = tabOfSeatDriving(s.name) || web?.tabs[web.active];
  const open_ = web?.tabs.filter((t) => t.url).length || 0;
  putHidden(chip, !open_);
  if (!open_) return;
  let where = tab?.url || "";
  try {
    const seen = new URL(tab.url);
    where = seen.host || decodeURIComponent(seen.pathname).split("/").filter(Boolean).pop() || where;
  } catch {}
  const how = web.asleep ? phrase("asleep") : (open_ > 1 ? tabsSaid(open_) : "");
  putText(chip.querySelector("span"), how ? `${where} · ${how}` : where);
}

function paintDeviceChipOfChat(el, s) {
  const want = s.device?.want || 0;
  if (want && deviceApplied.get(s.name) !== want) {
    deviceApplied.set(s.name, want);
    if (st.deviceChat !== s.name) setTimeout(() => openDevice(s.name), 0);
  }
  const chip = el.querySelector(".t-device");
  if (!chip) return;
  if (!chip.dataset.wired) {
    chip.dataset.wired = "1";
    chip.addEventListener("click", (ev) => { ev.stopPropagation(); ev.preventDefault(); openDevice(el.dataset.name); });
  }
  const d = s.device;
  putHidden(chip, !d);
  if (!d) return;
  putText(chip.querySelector("span"), `${d.avd || d.serial || d.platform} · ${d.booted ? phrase("live") : phrase("off")}`);
  chip.classList.toggle("live", !!d.booted);
}

function paintDeviceOfChat(el, s) {
  const on = st.deviceChat === s.name && paneShownFor(s.name);
  el.classList.toggle("deviced", on);
  if (on) el.classList.add("arting");
  if (on && s.device?.width && s.device?.height) el.style.setProperty("--dev-ar", (s.device.width / s.device.height).toFixed(4));
  const had = el.querySelector(".art.device");
  if (!on) { if (had) { had.remove(); stopDeviceFrames(); } return; }
  const pane = had || devicePaneOf(el, s);
  const d = s.device;
  pane.querySelector(".art-id span").textContent = `${s.name}${d ? ` · ${deviceSaid(d)}` : ""}`;
  const gone = pane.querySelector(".art-gone");
  const img = pane.querySelector(".device-screen");
  if (!d) {
    stopDeviceFrames();
    img.hidden = true;
    gone.hidden = false;
    if (st.deviceSaying !== s.name) gone.textContent = phrase("no device on this seat — press the phone above, or ask the seat for device_open");
    return;
  }
  if (st.deviceGone && st.deviceGone !== deviceKeyOf(d)) st.deviceGone = "";
  if (!st.deviceGone && startDeviceVideo(s.name)) {
    gone.hidden = true;
    if (!st.deviceTape?.painted && !st.deviceLoading && !deviceClock) askDeviceFrame(s.name);
    return;
  }
  if (!img.hidden) gone.hidden = true;
  else if (!st.deviceLoading) {
    gone.hidden = false;
    gone.textContent = phrase(st.deviceGone ? "the emulator is gone" : "waiting for the first frame");
  }
  if (!st.deviceLoading && !deviceClock) askDeviceFrame(s.name);
}

st.cockChat = null;

let canopy = { url: "http://127.0.0.1:4664", up: false };

const cockpitUrlOf = (base, seat) => `${String(base || "").replace(/\/+$/, "")}/?session=${encodeURIComponent(seat)}`;

const FRAME_BEAT = 8000;

const frameUrlOf = (seat, tab, at) => `/api/canopy/frame?seat=${encodeURIComponent(seat)}${tab ? `&tab=${encodeURIComponent(tab)}` : ""}&t=${at === undefined ? Math.floor(Date.now() / FRAME_BEAT) : at}`;

const tabsSaid = (n) => (n === 1 ? phrase("1 tab") : phrase("{n} tabs", { n }));

async function refreshCanopy() {
  try {
    const r = await (await fetch("/api/canopy")).json();
    if (r && r.url) canopy = r;
  } catch {}
  return canopy;
}

refreshCanopy();

function openCockpit(name) {
  refreshCanopy();
  if (!ART_WEBVIEW) return window.open(cockpitUrlOf(canopy.url, name), "_blank");
  if (st.cockChat === name && st.open === name) return closeCockpit();
  if (st.webChat) closeBrowser();
  if (st.deviceChat) closeDevice();
  if (st.reviewChat) exitReview();
  if (st.threadChat) closeThreadPanel();
  if (prsOnScreen()) closePrs();
  if (finishOn()) closeFinish();
  releaseKeyboard();
  st.cockChat = name;
  openTile(name, false);
  render();
}

function closeCockpit() {
  if (!st.cockChat) return;
  st.cockChat = null;
  render();
}

function cockpitPaneOf(el, s) {
  const pane = document.createElement("section");
  pane.className = "art cockpit";
  pane.innerHTML = `
    <div class="art-head">
      <svg class="art-face" aria-hidden="true"><use href="#i-screen"/></svg>
      <div class="art-id"><b>${phrase("browser cockpit")}</b><span></span></div>
      <button class="art-btn first cock-out">${phrase("browser")}</button>
      <button class="art-btn shut cock-shut" aria-label="${phrase("close the cockpit")}"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
    </div>
    <div class="art-stage"></div>`;
  pane.addEventListener("click", (ev) => ev.stopPropagation());
  pane.querySelector(".cock-shut").addEventListener("click", closeCockpit);
  pane.querySelector(".cock-out").addEventListener("click", () => window.open(cockpitUrlOf(canopy.url, s.name), "_blank"));
  el.appendChild(pane);
  return pane;
}

function paintCanopyOfChat(el, s) {
  const tabs = s.canopy?.tabs || 0;
  const chip = el.querySelector(".t-canopy");
  const shot = el.querySelector(".t-shot");
  if (!chip || !shot) return;
  const img = shot.querySelector("img");
  if (!chip.dataset.wired) {
    chip.dataset.wired = "1";
    const go = (ev) => { ev.stopPropagation(); ev.preventDefault(); openCockpit(el.dataset.name); };
    chip.addEventListener("click", go);
    shot.addEventListener("click", go);
    img.addEventListener("error", () => { shot.dataset.broken = img.dataset.here; shot.hidden = true; });
    img.addEventListener("load", () => { shot.hidden = false; });
  }
  putHidden(chip, !tabs);
  if (!tabs) { putHidden(shot, true); return; }
  putText(chip.querySelector("span"), tabsSaid(tabs));
  chip.classList.toggle("live", s.canopy.live > 0);
  chip.classList.toggle("held", !(s.canopy.live > 0) && s.canopy.held > 0);
  putText(shot.querySelector("span"), s.canopy.title || s.canopy.url || "");
  const src = frameUrlOf(s.name, "");
  if (img.dataset.here !== src) { img.dataset.here = src; img.src = src; }
  if (shot.dataset.broken === src) putHidden(shot, true);
}

function paintCockpitOfChat(el, s) {
  const on = st.cockChat === s.name && st.open === s.name && ART_WEBVIEW;
  if (on) el.classList.add("arting");
  const had = el.querySelector(".art.cockpit");
  if (!on) { had?.remove(); return; }
  const pane = had || cockpitPaneOf(el, s);
  const tabs = s.canopy?.tabs || 0;
  pane.querySelector(".art-id span").textContent = `${s.name} \u00b7 ${canopy.up ? (tabs ? tabsSaid(tabs) : phrase("live")) : phrase("canopy is not running")}`;
  const stage = pane.querySelector(".art-stage");
  const src = cockpitUrlOf(canopy.url, s.name);
  let frame = stage.firstElementChild;
  if (!frame) {
    frame = document.createElement("webview");
    frame.setAttribute("partition", "persist:canopy-cockpit");
    frame.setAttribute("title", phrase("the browser tabs this seat is driving"));
    stage.appendChild(frame);
  }
  if (frame.dataset.here !== src) { frame.dataset.here = src; frame.src = src; }
}

st.webChat = null;

let webSeq = 0;

const browserApplied = new Map();

const browserShot = new Set();
const shotWidthOf = new Map();

const WEB_TAB_CAP = 5;

const webOfSeat = new Map();

const webStateOf = (name) => {
  let web = webOfSeat.get(name);
  if (!web) { web = { tabs: [], active: 0 }; webOfSeat.set(name, web); }
  return web;
};

const webTabNow = (name) => {
  const web = webOfSeat.get(name);
  return web ? web.tabs[web.active] : null;
};

const webAddress = (raw) => {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(t)) return `http://${t}`;
  return `https://${t}`;
};

const SHELF_TAB = /^shelf:\/\/([a-z0-9][a-z0-9-]{0,59})\/?(?:\?(.*))?$/i;

const SHELF_LINK = /^hive:\/\/shelf\/([a-z0-9][a-z0-9-]{0,59})\/?(?:\?(.*))?$/i;

const shelfTabAddress = (slug, tab, v, at) =>
  `shelf://${slug}/${tab || v ? "?" : ""}${tab ? `tab=${encodeURIComponent(tab)}` : ""}${v ? `${tab ? "&" : ""}v=${v}` : ""}${at ? `#${encodeURIComponent(at)}` : ""}`;

const shelfLinkOf = (slug, tab) => `hive://shelf/${slug}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;

function shelfTabOf(url) {
  const raw = String(url || "");
  const cut = raw.indexOf("#");
  const head = cut < 0 ? raw : raw.slice(0, cut);
  const found = SHELF_TAB.exec(head) || SHELF_LINK.exec(head);
  if (!found) return null;
  const asked = new URLSearchParams(found[2] || "");
  return {
    slug: found[1].toLowerCase(),
    tab: asked.get("tab") || "",
    version: Number(asked.get("v")) || 0,
    at: cut < 0 ? "" : raw.slice(cut + 1).replace(/[^\w-]/g, "")
  };
}

const webTabsIn = (own) => own.tabs.filter((t) => t.kind !== "artifact");

const drivenTab = new Map();

const shutByThePerson = new Map();

const wokeForAShot = new Map();

const tabOfSeatDriving = (name) => {
  const web = webOfSeat.get(name);
  if (!web) return null;
  return web.tabs.find((t) => t.id === drivenTab.get(name) && t.kind !== "artifact") || null;
};

const seatSeesItsOwnTab = (name) => {
  const web = webOfSeat.get(name);
  const own = tabOfSeatDriving(name);
  return !!own && web?.tabs[web.active]?.id === own.id;
};

const seatActsWhereThePersonLooks = (name) => {
  const web = webOfSeat.get(name);
  const seen = web?.tabs[web.active];
  if (!seen) return false;
  const own = tabOfSeatDriving(name);
  return !own || own.id === seen.id;
};

function tabTheSeatDrives(name) {
  const own = tabOfSeatDriving(name);
  if (own) return own;
  const tab = addWebTab(name, "web", { focus: false, forTheSeat: true });
  if (tab) drivenTab.set(name, tab.id);
  return tab;
}

function landSeatOn(name, raw) {
  const url = webAddress(raw);
  const shelved = shelfTabOf(url);
  if (shelved) return openArtifactTab(name, shelved, shelved.version, true);
  const tab = tabTheSeatDrives(name);
  if (!tab) return null;
  const web = webStateOf(name);
  tab.kind = "web";
  tab.slug = "";
  tab.url = url;
  tab.title = "";
  tab.since = Date.now();
  shutByThePerson.delete(name);
  if (!web.tabs.some((t) => t.url && t.id !== tab.id)) web.active = web.tabs.indexOf(tab);
  return tab;
}

function addWebTab(name, kind = "web", { focus = true, forTheSeat = false } = {}) {
  const web = webStateOf(name);
  const cap = forTheSeat ? WEB_TAB_CAP : WEB_TAB_CAP - 1;
  if (kind !== "artifact" && webTabsIn(web).length >= cap) return null;
  const tab = { id: `w${++webSeq}`, url: "", title: "", kind };
  web.tabs.push(tab);
  if (focus) web.active = web.tabs.length - 1;
  return tab;
}

st.shelfWanted = false;

function wantShelfIndex(fresh) {
  if (st.shelfWanted) return;
  st.shelfWanted = true;
  pullShelf(!!fresh).finally(() => { st.shelfWanted = false; render(); });
}

function askAboutArtifactTab(name) {
  const t = webTabNow(name);
  const box = structPool.get(name)?.host.querySelector(".sv-composer textarea");
  if (!box || t?.kind !== "artifact") return;
  const page = shelfPageOf(t.slug);
  const now = shelfVersionsOf(page, t.tab).find((v) => v.n === t.version);
  const about = [page?.title || t.slug, now?.label].filter(Boolean).join(" · ");
  if (!box.value.trim()) box.value = `about "${about}": `;
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
  box.dispatchEvent(new Event("input", { bubbles: true }));
}

const artifactTabOf = (name) => (webOfSeat.get(name)?.tabs || []).find((t) => t.kind === "artifact") || null;

const showingArtifact = (name, slug) => {
  const web = webOfSeat.get(name);
  const tab = web?.tabs[web.active];
  return st.webChat === name && paneShownFor(name) && tab?.kind === "artifact" && (!slug || tab.slug === slug);
};

function openArtifactTab(name, index, v, quiet) {
  if (!ART_WEBVIEW || !index || !index.slug) return null;
  const web = webStateOf(name);
  const tab = web.tabs.find((t) => t.kind === "artifact") || addWebTab(name, "artifact");
  tab.kind = "artifact";
  tab.slug = index.slug;
  tab.tab = index.tab || "";
  tab.version = v || 0;
  tab.at = index.at || "";
  tab.url = shelfTabAddress(tab.slug, tab.tab, tab.version, tab.at);
  web.active = web.tabs.indexOf(tab);
  touchWeb(name);
  if (st.webChat === name && paneShownFor(name)) render();
  else if (!quiet) openBrowser(name);
  wantShelfIndex(true);
  return tab;
}

function closeWebTab(name, id) {
  const web = webStateOf(name);
  const i = web.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  if (drivenTab.get(name) === id) {
    shutByThePerson.set(name, { url: web.tabs[i].url || "", at: Date.now() });
    drivenTab.delete(name);
  }
  wokeForAShot.delete(name);
  web.tabs.splice(i, 1);
  web.active = Math.max(0, Math.min(web.active, web.tabs.length - 1));
  if (!web.tabs.length) return closeBrowser();
  render();
}

function gotoWeb(name, raw) {
  const url = webAddress(raw);
  if (!url) return;
  const web = webStateOf(name);
  if (!web.tabs.length) addWebTab(name);
  const tab = web.tabs[web.active];
  const shelved = shelfTabOf(url);
  tab.kind = shelved ? "artifact" : "web";
  tab.slug = shelved?.slug || "";
  tab.tab = shelved?.tab || "";
  tab.version = shelved?.version || 0;
  tab.at = shelved?.at || "";
  tab.url = shelved ? shelfTabAddress(tab.slug, tab.tab, tab.version, tab.at) : url;
  tab.title = "";
  render();
}

function openBrowser(name) {
  if (!ART_WEBVIEW) return;
  if (st.webChat === name && paneShownFor(name)) return closeBrowser();
  if (st.cockChat) closeCockpit();
  if (st.deviceChat) closeDevice();
  if (st.reviewChat) exitReview();
  if (st.threadChat) closeThreadPanel();
  if (prsOnScreen()) closePrs();
  if (finishOn()) closeFinish();
  releaseKeyboard();
  const web = webStateOf(name);
  if (!web.tabs.length) addWebTab(name);
  st.webChat = name;
  if (!takeFieldPane(name)) openTile(name, false);
  render();
}

function closeBrowser() {
  if (!st.webChat) return;
  st.webChat = null;
  dropFieldPane();
  render();
}

function webPaneOf(el, s) {
  const pane = document.createElement("section");
  pane.className = "art web";
  pane.innerHTML = `
    <div class="art-head">
      <svg class="art-face" aria-hidden="true"><use href="#i-browser"/></svg>
      <div class="art-id"><b>${phrase("browser")}</b><span></span></div>
      <button class="art-btn first web-out">${phrase("browser")}</button>
      <button class="art-btn web-link" hidden>${phrase("copy link")}</button>
      <button class="art-btn web-ask" hidden>${phrase("ask for a change")}</button>
      <button class="art-btn shut web-shut" title="${phrase("hide the browser — the pages stay open and the seat keeps using them")}" aria-label="${phrase("hide the browser")}"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
    </div>
    <div class="web-tabs"></div>
    <form class="web-url"><button type="button" class="web-step web-back" title="${phrase("back")}" aria-label="${phrase("back")}"><svg aria-hidden="true"><use href="#i-chev"/></svg></button><button type="button" class="web-step web-fwd" title="${phrase("forward")}" aria-label="${phrase("forward")}"><svg aria-hidden="true"><use href="#i-chev"/></svg></button><button type="button" class="web-step web-again" title="${phrase("reload this page")}" aria-label="${phrase("reload this page")}"><svg aria-hidden="true"><use href="#i-reload"/></svg></button><input type="text" spellcheck="false" placeholder="${phrase("address — localhost:3000 or any page")}"><button type="button" class="web-print" title="${phrase("send a screenshot of this screen to the chat")}" aria-label="${phrase("send a screenshot of this screen to the chat")}"><svg aria-hidden="true"><use href="#i-camera"/></svg></button><button type="button" class="web-review" title="${phrase("ask the AI to review this screen")}">${phrase("review")}</button><button type="button" class="web-pick" title="${phrase("point at an element to talk about it right there")}"><svg aria-hidden="true"><use href="#i-target"/></svg><span>${phrase("reference")}</span></button><span class="web-faces" hidden></span></form>
    <div class="web-rail sh-tabs" hidden></div>
    <div class="art-stage"></div>`;
  followStageSize(pane.querySelector(".art-stage"));
  pane.addEventListener("click", (ev) => ev.stopPropagation());
  pane.querySelector(".web-shut").addEventListener("click", closeBrowser);
  pane.querySelector(".web-out").addEventListener("click", () => {
    const t = webTabNow(s.name);
    if (!t) return;
    if (t.kind === "artifact") return window.hiveOpenShelf({ slug: t.slug, tab: t.tab, version: t.version });
    if (t.url) window.open(t.url, "_blank");
  });
  pane.querySelector(".web-link").addEventListener("click", (ev) => {
    ev.stopPropagation();
    const t = webTabNow(s.name);
    if (t?.kind !== "artifact") return;
    toClipboard(shelfLinkOf(t.slug, t.tab)).then(() => markCopied(pane.querySelector(".web-link")), () => {});
  });
  pane.querySelector(".web-ask").addEventListener("click", (ev) => { ev.stopPropagation(); askAboutArtifactTab(s.name); });
  pane.querySelector(".web-url").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const field = ev.currentTarget.querySelector("input");
    field.blur();
    gotoWeb(s.name, field.value);
  });
  pane.querySelector(".web-url input").addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.value = ev.currentTarget.dataset.h || "";
    ev.currentTarget.blur();
  });
  pane.querySelector(".web-back").addEventListener("click", (ev) => { ev.stopPropagation(); stepWeb(s.name, "back"); });
  pane.querySelector(".web-fwd").addEventListener("click", (ev) => { ev.stopPropagation(); stepWeb(s.name, "forward"); });
  pane.querySelector(".web-again").addEventListener("click", (ev) => { ev.stopPropagation(); stepWeb(s.name, "reload"); });
  pane.querySelector(".web-print").addEventListener("click", (ev) => { ev.stopPropagation(); sendScreenPrint(s.name); });
  pane.querySelector(".web-review").addEventListener("click", (ev) => { ev.stopPropagation(); sendScreenReview(s.name); });
  pane.querySelector(".web-pick").addEventListener("click", (ev) => { ev.stopPropagation(); toggleWebPick(s.name, pane); });
  el.appendChild(pane);
  dressWebPane(pane, webExtrasOf(s.name));
  setTimeout(() => pane.querySelector(".web-url input")?.focus(), 0);
  return pane;
}

const webYards = new Map();

const webDriving = new Map();

const DRIVING_LINGER = 2500;

const drivingNow = (name) => {
  const said = webDriving.get(name);
  if (!said) return false;
  return said.busy > 0 || Date.now() < said.until;
};

let drivingPaint = null;

const paintDrivingSoon = (wait = 0) => {
  if (drivingPaint) return;
  drivingPaint = setTimeout(() => { drivingPaint = null; render(); }, wait);
};

function markDriving(name, busy) {
  const said = webDriving.get(name) || { busy: 0, until: 0 };
  said.busy = Math.max(0, said.busy + busy);
  if (busy < 0) {
    said.until = Date.now() + DRIVING_LINGER;
    setTimeout(() => paintDrivingSoon(), DRIVING_LINGER + 60);
  }
  webDriving.set(name, said);
  paintDrivingSoon();
}

let personsFocus = null;
let lastFocus = null;

document.addEventListener("focusin", (ev) => {
  lastFocus = ev.target;
  if (!ev.target.closest?.("#webyard")) personsFocus = ev.target;
}, true);

const SEAT_HAND_OPS = new Set(["click", "hover", "type", "key", "step", "choose", "upload"]);
const SEAT_HAND_LINGER = 800;
const seatHands = new Map();
const handJobs = new Set();

function markSeatHands(name, busy) {
  const said = seatHands.get(name) || { busy: 0, until: 0 };
  said.busy = Math.max(0, said.busy + busy);
  if (busy < 0) said.until = Date.now() + SEAT_HAND_LINGER;
  seatHands.set(name, said);
}

const seatHandsOnThePage = (name) => {
  const said = seatHands.get(name);
  return !!said && (said.busy > 0 || Date.now() < said.until);
};

const pageMayHoldFocus = (name) => webYards.get(name)?.classList.contains("onstage") && !seatHandsOnThePage(name);

const pageThePersonWasIn = (frame) =>
  lastFocus !== frame && lastFocus?.isConnected && lastFocus.matches?.("#webyard .yard.onstage webview:not(.off):not(.behind)") ? lastFocus : null;

const webTouch = new Map();

const PAGE_SLEEP_AFTER = 30 * 60 * 1000;

const touchWeb = (name) => webTouch.set(name, Date.now());

const pageDozing = (name, onstage) => !onstage && Date.now() - (webTouch.get(name) || 0) > PAGE_SLEEP_AFTER;

const yardOf = (name) => {
  let yard = webYards.get(name);
  if (yard && yard.isConnected) return yard;
  yard = document.createElement("div");
  yard.className = "yard";
  yard.dataset.name = name;
  yard.innerHTML = `<div class="yard-glow"></div><div class="yard-mark">${phrase("the AI is using this page")}</div>`;
  $("webyard").appendChild(yard);
  webYards.set(name, yard);
  return yard;
};

const frameOfTab = (name, tab) => {
  if (!tab || !tab.url) return null;
  return webYards.get(name)?.querySelector(`webview[data-id="${tab.id}"]`) || null;
};

function frameOfSeat(name) {
  const web = webOfSeat.get(name);
  return frameOfTab(name, web?.tabs[web.active]);
}

function frameTheSeatDrives(name) {
  const web = webOfSeat.get(name);
  if (!web) return null;
  return frameOfTab(name, tabOfSeatDriving(name) || web.tabs[web.active]);
}

const wakeDrivenTab = (name) => {
  const own = tabOfSeatDriving(name);
  if (!own || !own.url || seatSeesItsOwnTab(name)) return false;
  wokeForAShot.set(name, own.id);
  paintYards();
  return true;
};

const letDrivenTabSleep = (name) => {
  if (!wokeForAShot.delete(name)) return;
  paintYards();
};

const nextPaint = () => new Promise((done) => {
  let settled = false;
  const finish = () => { if (settled) return; settled = true; done(); };
  setTimeout(finish, 60);
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(finish));
});

const WAKE_SETTLE = 150;
const WAKE_SETTLE_BLURRED = 750;

async function shotReady(woke) {
  await nextPaint();
  if (!woke) return;
  await new Promise((done) => setTimeout(done, document.hasFocus() ? WAKE_SETTLE : WAKE_SETTLE_BLURRED));
}

const FRAME_WAIT = 9000;

function bornWebFrame(yard, name, t) {
  const frame = document.createElement("webview");
  frame.dataset.id = t.id;
  frame.setAttribute("partition", "persist:seat-browser");
  frame.setAttribute("allowpopups", "");
  frame.setAttribute("title", phrase("the page this tab is showing"));
  frame.addEventListener("ipc-message", (ev) => {
    if (ev.channel === "hive-ask") askOnTheElement(name, frame, ev.args[0]);
    if (ev.channel === "hive-here") {
      const el = String(ev.args[0]?.el || "");
      HERE_EL.set(frameKey(name, frame), el);
      if (frameIsUpFront(name, frame)) standOnThePage(name, el, tabOfFrame(name, frame));
    }
    if (ev.channel === "hive-pick-cancel") setWebPick(name, false);
    if (ev.channel === "hive-quote") sendPageQuote(name, ev.args[0]);
    if (ev.channel === "hive-key") pageKey(name, ev.args[0]);
  });
  watchFrame(frame, t, () => render());
  frame.addEventListener("focus", () => {
    if (pageMayHoldFocus(name) && frameIsUpFront(name, frame)) return;
    const back = pageThePersonWasIn(frame) || personsFocus;
    if (back?.isConnected) back.focus({ preventScroll: true });
  });
  frame.addEventListener("dom-ready", () => {
    try { frame.send("hive-quote-label", phrase("quote")); } catch {}
    PINS_HELD.delete(frameKey(name, frame));
    FACES_HELD.delete(frameKey(name, frame));
    HERE_EL.delete(frameKey(name, frame));
    /* the same guard the beat uses: a page the agent opened with the pane closed is not a page
       the person is looking at, and the team must not be told that they are. */
    if (showingArtifact(name) && frameIsUpFront(name, frame)) standOnThePage(name, "", tabOfFrame(name, frame));
    paintPagePins(name, frame);
    paintPageFaces(name, frame);
    watchPagePins(name, frame);
  });
  frame.addEventListener("page-title-updated", (ev) => { t.title = String(ev.title || "").slice(0, 60); render(); });
  frame.addEventListener("console-message", (ev) => {
    const level = typeof ev.level === "string" ? ev.level : (["verbose", "info", "warning", "error"][ev.level] || "log");
    t.logs = t.logs || [];
    t.logs.push({ level, text: String(ev.message || "").slice(0, 2000), line: ev.line || 0, source: String(ev.sourceId || "").slice(-80) });
    if (t.logs.length > 500) t.logs.splice(0, t.logs.length - 500);
  });
  frame.addEventListener("did-start-loading", () => { t.logs = []; });
  frame.addEventListener("did-navigate", (ev) => {
    if (t.kind === "artifact" || !ev.url) return;
    t.url = ev.url;
    frame.dataset.here = ev.url;
    render();
  });
  yard.appendChild(frame);
  return frame;
}

let yardsAgain = 0;

function paintYardsSoon() {
  if (yardsAgain) return;
  yardsAgain = requestAnimationFrame(() => { yardsAgain = 0; paintYards(); });
}

function followStageSize(stage) {
  if (typeof ResizeObserver !== "function") return;
  new ResizeObserver(paintYardsSoon).observe(stage);
}

addEventListener("resize", paintYardsSoon);

function paintYards() {
  if (!ART_WEBVIEW) return;
  const alive = new Set(st.data.sessions.map((x) => x.name));
  for (const key of st.blocks.flatMap((b) => b.keys)) if (key.startsWith("draft:")) alive.add(key);
  for (const [name, yard] of [...webYards]) {
    const web = webOfSeat.get(name);
    if (alive.has(name) && web && web.tabs.some((t) => t.url)) continue;
    yard.remove();
    webYards.delete(name);
    webOfSeat.delete(name);
  }
  for (const [name, own] of webOfSeat) {
    if (!alive.has(name) || !own.tabs.some((t) => t.url)) continue;
    const yard = yardOf(name);
    yard.classList.toggle("driving", drivingNow(name) && seatActsWhereThePersonLooks(name));
    const onstage = placeYard(name, yard);
    if (onstage) touchWeb(name);
    own.asleep = pageDozing(name, onstage);
    if (own.asleep) {
      for (const f of [...yard.querySelectorAll("webview")]) f.remove();
      continue;
    }
    const now = own.tabs[own.active];
    const want = new Set(own.tabs.filter((t) => t.url).map((t) => t.id));
    for (const f of [...yard.querySelectorAll("webview")]) if (!want.has(f.dataset.id)) f.remove();
    const woke = wokeForAShot.get(name);
    for (const t of own.tabs) {
      if (!t.url) continue;
      const frame = yard.querySelector(`webview[data-id="${t.id}"]`) || bornWebFrame(yard, name, t);
      if (frame.dataset.here !== t.url) { frame.dataset.here = t.url; frame.src = t.url; }
      const upFront = t.id === now?.id;
      frame.classList.toggle("behind", !upFront && t.id === woke);
      frame.classList.toggle("off", !upFront && t.id !== woke);
    }
  }
}

function placeYard(name, yard) {
  const showing = st.webChat === name && paneShownFor(name);
  const stage = showing ? webPaneOfName(name)?.querySelector(".art-stage") : null;
  const box = stage?.getBoundingClientRect();
  const onstage = !!box && box.width > 1 && box.height > 1;
  yard.classList.toggle("onstage", onstage);
  if (!onstage) return false;
  yard.style.left = `${Math.round(box.left)}px`;
  yard.style.top = `${Math.round(box.top)}px`;
  yard.style.width = `${Math.round(box.width)}px`;
  yard.style.height = `${Math.round(box.height)}px`;
  return true;
}

function driveBrowsers() {
  if (!ART_WEBVIEW) return;
  for (const s of st.data.sessions) {
    const sync = s.browser;
    if (!sync) continue;
    if (sync.want || (sync.ops || []).length) touchWeb(s.name);
    const want = sync.want;
    if (want && browserApplied.get(s.name) !== want.seq) {
      browserApplied.set(s.name, want.seq);
      landSeatOn(s.name, want.url);
    }
    for (const job of sync.ops || []) {
      if (browserShot.has(job.id)) continue;
      browserShot.add(job.id);
      markDriving(s.name, 1);
      if (SEAT_HAND_OPS.has(job.op)) {
        handJobs.add(job.id);
        markSeatHands(s.name, 1);
      }
      if (job.op === "shoot") runBrowserShot(s.name, job.id);
      else if (job.op === "eval") runBrowserEval(s.name, job.id, job.code);
      else if (job.op === "console") runBrowserConsole(s.name, job.id);
      else if (job.op === "viewport") runBrowserViewport(s.name, job.id, job);
      else if (job.op === "profile") runBrowserProfile(s.name, job.id, job);
      else if (job.op === "cookies") runBrowserCookies(s.name, job.id);
      else if (job.op === "setcookie") runBrowserSetCookie(s.name, job.id, job);
      else if (job.op === "map") runBrowserMap(s.name, job.id);
      else if (job.op === "click") runBrowserClick(s.name, job.id, job);
      else if (job.op === "hover") runBrowserHover(s.name, job.id, job);
      else if (job.op === "type") runBrowserType(s.name, job.id, job);
      else if (job.op === "key") runBrowserKey(s.name, job.id, job);
      else if (job.op === "wait") runBrowserWait(s.name, job.id, job);
      else if (job.op === "choose") runBrowserChoose(s.name, job.id, job);
      else if (job.op === "tabs") runBrowserTabs(s.name, job.id, job);
      else if (job.op === "step") runBrowserStep(s.name, job.id, job);
      else if (job.op === "upload") runBrowserUpload(s.name, job.id, job);
      else if (job.op === "network") runBrowserNetwork(s.name, job.id, job);
    }
  }
}

const NO_PAGE = "this seat has no page open — browser_navigate first, the pane does not have to be open";

function noPageOf(name) {
  const shut = shutByThePerson.get(name);
  if (!shut) return NO_PAGE;
  shutByThePerson.delete(name);
  return `the person closed the tab you were driving (${shut.url || "no address"}) — browser_navigate opens it again if you still need it`;
}

const browserAnswer = (id, name) => (payload) => {
  if (name) markDriving(name, -1);
  if (name && handJobs.delete(id)) markSeatHands(name, -1);
  return fetch("/api/browser/result", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...payload }) }).catch(() => {});
};

function pageOfSeat(name, wait = FRAME_WAIT) {
  const until = Date.now() + wait;
  return new Promise((done) => {
    const look = () => {
      const frame = frameTheSeatDrives(name);
      if (frame && frame.dataset.here && typeof frame.executeJavaScript === "function") return settle(frame);
      if (Date.now() > until) return done(null);
      setTimeout(look, 120);
    };
    const settle = (frame) => {
      let loading = true;
      try { loading = frame.isLoading(); } catch { loading = false; }
      if (!loading) return done(frame);
      const stop = () => { frame.removeEventListener("did-stop-loading", stop); clearTimeout(giveUp); done(frame); };
      const giveUp = setTimeout(() => { frame.removeEventListener("did-stop-loading", stop); done(frame); }, Math.max(500, until - Date.now()));
      frame.addEventListener("did-stop-loading", stop);
    };
    look();
  });
}

async function runBrowserShot(name, id) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  const woke = wakeDrivenTab(name);
  try {
    await shotReady(woke);
    let img = await frame.capturePage();
    if (img.isEmpty()) {
      await shotReady(true);
      img = await frame.capturePage();
    }
    if (img.isEmpty()) return post({ error: "the page gave back an empty frame — it may still be painting" });
    shotWidthOf.set(name, img.getSize().width);
    post({ image: img.toDataURL() });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  } finally {
    letDrivenTabSleep(name);
  }
}

const EVAL_REFUSED = /^\{"__evalError":".*(Content Security Policy|unsafe-eval)/;

async function evalPastThePolicy(frame, code) {
  try {
    const value = await frame.executeJavaScript(code);
    return JSON.stringify(value ?? null);
  } catch (err) {
    return JSON.stringify({ __evalError: String(err && err.message || err) });
  }
}

async function runBrowserEval(name, id, code) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  try {
    const value = await frame.executeJavaScript(`(() => { try { return JSON.stringify(eval(${JSON.stringify(code)})); } catch (e) { return JSON.stringify({ __evalError: String(e && e.message || e) }); } })()`);
    if (typeof value === "string" && EVAL_REFUSED.test(value)) return post({ value: await evalPastThePolicy(frame, code) });
    post({ value: typeof value === "string" ? value : JSON.stringify(value ?? null) });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function runBrowserViewport(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  if (!window.seatBrowser) return post({ error: "device emulation needs the desktop app" });
  try {
    const wcId = frame.getWebContentsId();
    const params = job.reset ? null : { width: job.width, height: job.height, mobile: job.mobile };
    const done = await window.seatBrowser.emulate(wcId, params);
    if (done && done.error) return post({ error: done.error });
    const web = webStateOf(name);
    const tab = tabOfSeatDriving(name) || web.tabs[web.active];
    if (tab) tab.viewport = job.reset ? null : { width: job.width, height: job.height, mobile: job.mobile };
    render();
    post({ value: job.reset ? "reset to the window size" : `${job.width}\u00d7${job.height}${job.mobile ? " (mobile)" : ""}` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function runBrowserProfile(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  if (!window.seatBrowser) return post({ error: "profiles need the desktop app" });
  let origin;
  try { origin = new URL(frame.dataset.here).origin; } catch { return post({ error: "navigate to a page first" }); }
  const done = await window.seatBrowser.profile({ profile: job.profile, origin });
  if (done && done.error) return post({ error: done.error });
  try { frame.reload(); } catch {}
  post({ profile: job.profile });
}

async function runBrowserSetCookie(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  if (!window.seatBrowser) return post({ error: "cookies need the desktop app" });
  let origin;
  try { origin = new URL(frame.dataset.here).origin; } catch { return post({ error: "navigate to a page first" }); }
  const done = await window.seatBrowser.setCookie({ name: job.cookieName, value: job.value, origin });
  if (done && done.error) return post({ error: done.error });
  post({ value: `set ${job.cookieName} on ${origin}` });
}

async function runBrowserCookies(name, id) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  if (!window.seatBrowser) return post({ error: "cookies need the desktop app" });
  let origin;
  try { origin = new URL(frame.dataset.here).origin; } catch { return post({ error: "navigate to a page first" }); }
  const done = await window.seatBrowser.cookies({ origin });
  if (done && done.error) return post({ error: done.error });
  post({ cookies: done.cookies || [] });
}

const inThePage = (frame, fn, ...args) =>
  frame.executeJavaScript(`(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(", ")})`);

async function reachInPage(name, frame, ref) {
  const at = await inThePage(frame, reachRef, ref);
  if (!at || at.error) return { error: at?.error || `${ref} could not be reached` };
  if (!window.seatBrowser) return { error: "driving a page needs the desktop app" };
  return { at, wcId: frame.getWebContentsId() };
}

async function runBrowserMap(name, id) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  try {
    post({ value: sayPage(await inThePage(frame, readPage)) });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function pointOnThePage(frame, name, job) {
  if (!window.seatBrowser) return { error: "driving a page needs the desktop app" };
  const wide = await frame.executeJavaScript("window.innerWidth");
  const shot = shotWidthOf.get(name);
  const scale = shot && wide ? wide / shot : 1;
  const x = Math.round(job.x * scale);
  const y = Math.round(job.y * scale);
  return { wcId: frame.getWebContentsId(), at: { x, y, tag: `the point ${x},${y}`, said: "" } };
}

async function reachOrPoint(name, frame, job) {
  return job.ref ? reachInPage(name, frame, job.ref) : pointOnThePage(frame, name, job);
}

async function runBrowserHover(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  try {
    const found = await reachOrPoint(name, frame, job);
    if (found.error) return post({ error: found.error });
    const done = await window.seatBrowser.input(found.wcId, { kind: "hover", x: found.at.x, y: found.at.y });
    if (done && done.error) return post({ error: done.error });
    post({ value: `the mouse is over ${found.at.tag}${found.at.said ? ` "${found.at.said}"` : ""} — browser_snapshot again to see what it showed` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function runBrowserClick(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  try {
    const found = await reachOrPoint(name, frame, job);
    if (found.error) return post({ error: found.error });
    const done = await window.seatBrowser.input(found.wcId, { kind: "click", x: found.at.x, y: found.at.y });
    if (done && done.error) return post({ error: done.error });
    post({ value: `clicked ${found.at.tag}${found.at.said ? ` "${found.at.said}"` : ""}` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

const FOCUS_SETTLE = 60;

async function runBrowserType(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  try {
    const found = await reachInPage(name, frame, job.ref);
    if (found.error) return post({ error: found.error });
    const clicked = await window.seatBrowser.input(found.wcId, { kind: "click", x: found.at.x, y: found.at.y });
    if (clicked && clicked.error) return post({ error: clicked.error });
    await new Promise((settle) => setTimeout(settle, FOCUS_SETTLE));
    await frame.executeJavaScript('document.execCommand("selectAll")').catch(() => {});
    const typed = await window.seatBrowser.input(found.wcId, { kind: "text", text: job.text });
    if (typed && typed.error) return post({ error: typed.error });
    if (job.submit) {
      const sent = await window.seatBrowser.input(found.wcId, { kind: "key", key: "Enter" });
      if (sent && sent.error) return post({ error: sent.error });
    }
    post({ value: `typed into ${found.at.tag}${found.at.said ? ` "${found.at.said}"` : ""}${job.submit ? " and pressed Enter" : ""}` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function runBrowserKey(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  if (!window.seatBrowser) return post({ error: "driving a page needs the desktop app" });
  try {
    const done = await window.seatBrowser.input(frame.getWebContentsId(), { kind: "key", key: job.key });
    if (done && done.error) return post({ error: done.error });
    post({ value: `pressed ${job.key}` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function runBrowserWait(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  const until = Date.now() + job.seconds * 1000;
  while (Date.now() < until) {
    try {
      const seen = await inThePage(frame, lookFor, job.text, job.gone === true);
      if (seen?.done) return post({ value: job.gone ? `"${job.text}" is gone` : `"${job.text}" is on the page` });
    } catch (err) {
      return post({ error: String(err && err.message || err) });
    }
    await new Promise((again) => setTimeout(again, 300));
  }
  post({ error: job.gone ? `"${job.text}" was still there after ${job.seconds}s` : `"${job.text}" did not show up in ${job.seconds}s` });
}

async function runBrowserChoose(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  try {
    const done = await inThePage(frame, chooseOption, job.ref, job.option);
    if (done.error) return post({ error: done.error });
    post({ value: `chose "${done.chose}"` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

function runBrowserTabs(name, id, job) {
  const post = browserAnswer(id, name);
  const web = webStateOf(name);
  const pages = web.tabs.filter((t) => t.url);
  if (job.act === "list") {
    if (!pages.length) return post({ error: noPageOf(name) });
    const mine = drivenTab.get(name);
    const seen = web.tabs[web.active]?.id;
    const mark = (t) => [t.id === mine ? "← yours" : "", t.id === seen ? "← the person is looking at this one" : ""].filter(Boolean).join("  ");
    return post({ value: web.tabs.filter((t) => t.url).map((t, i) => `${i + 1}. ${t.title || "(untitled)"} ${t.url}  ${mark(t)}`.trimEnd()).join("\n") });
  }
  if (job.act === "open") {
    const tab = addWebTab(name, "web", { focus: false, forTheSeat: true });
    if (!tab) return post({ error: `this seat already has ${WEB_TAB_CAP} pages open — close one with browser_tabs before opening another` });
    tab.url = webAddress(job.url || "");
    tab.title = "";
    drivenTab.set(name, tab.id);
    shutByThePerson.delete(name);
    touchWeb(name);
    render();
    return post({ value: tab.url ? `opened a new tab on ${tab.url}` : "opened an empty tab" });
  }
  const at = Number(job.index) || 0;
  const tab = pages[at - 1];
  if (!tab) return post({ error: `there is no tab ${job.index} — browser_tabs list shows what is open` });
  if (job.act === "select") {
    drivenTab.set(name, tab.id);
    shutByThePerson.delete(name);
    touchWeb(name);
    render();
    return post({ value: `now acting on ${tab.title || tab.url}${seatSeesItsOwnTab(name) ? "" : ", which is not the tab the person is looking at"}` });
  }
  if (job.act === "close") {
    closeWebTab(name, tab.id);
    return post({ value: `closed ${tab.title || tab.url}` });
  }
  post({ error: `${job.act} is not something tabs do — list, open, select or close` });
}

async function runBrowserStep(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  try {
    if (job.way === "back" && !frame.canGoBack()) return post({ error: "there is nothing behind this page in this tab" });
    if (job.way === "forward" && !frame.canGoForward()) return post({ error: "there is nothing ahead of this page in this tab" });
    const landed = new Promise((done) => {
      const settle = () => { frame.removeEventListener("did-stop-loading", settle); clearTimeout(giveUp); done(true); };
      const giveUp = setTimeout(() => { frame.removeEventListener("did-stop-loading", settle); done(false); }, 15000);
      frame.addEventListener("did-stop-loading", settle);
    });
    if (job.way === "back") frame.goBack();
    else if (job.way === "forward") frame.goForward();
    else if (!catchUpArtifact(name)) frame.reload();
    await landed;
    post({ value: `${job.way === "reload" ? "reloaded" : `went ${job.way} to`} ${frame.getURL ? frame.getURL() : frame.dataset.here}` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function runBrowserUpload(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  if (!window.seatBrowser) return post({ error: "handing a file to a page needs the desktop app" });
  try {
    const marked = await inThePage(frame, markUpload, job.ref);
    if (marked.error) return post({ error: marked.error });
    const done = await window.seatBrowser.upload(frame.getWebContentsId(), job.files);
    await inThePage(frame, forgetUpload).catch(() => {});
    if (done && done.error) return post({ error: done.error });
    post({ value: `handed ${job.files.map((f) => f.split("/").pop()).join(", ")} to ${marked.said}` });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

async function runBrowserNetwork(name, id, job) {
  const post = browserAnswer(id, name);
  const frame = await pageOfSeat(name);
  if (!frame) return post({ error: noPageOf(name) });
  if (!window.seatBrowser) return post({ error: "reading the calls a page makes needs the desktop app" });
  try {
    const done = await window.seatBrowser.network(frame.getWebContentsId());
    if (done && done.error) return post({ error: done.error });
    const said = String(job.about || "").toLowerCase();
    const calls = (done.calls || [])
      .filter((c) => (!job.failedOnly || c.failed || c.status >= 400))
      .filter((c) => !said || c.url.toLowerCase().includes(said));
    if (!calls.length) return post({ value: job.failedOnly ? "no call on this page failed" : "this page has not called anything yet" });
    post({ value: calls.map((c) => `${c.failed || c.status || "…"} ${c.method} ${c.url}${c.kind ? ` · ${c.kind}` : ""}${c.ms ? ` · ${c.ms}ms` : ""}${c.size ? ` · ${Math.round(c.size / 1024)}kB` : ""}`).join("\n") });
  } catch (err) {
    post({ error: String(err && err.message || err) });
  }
}

function runBrowserConsole(name, id) {
  const post = browserAnswer(id, name);
  const web = webStateOf(name);
  const tab = web.tabs[web.active];
  if (!tab) return post({ error: NO_PAGE });
  post({ lines: (tab.logs || []).slice(-200) });
}

const webPick = new Map();

function setWebPick(name, on) {
  webPick.set(name, on);
  webPaneOfName(name)?.querySelector(".web-pick")?.classList.toggle("on", on);
  try { frameOfSeat(name)?.send("hive-pick-mode", on); } catch {}
}

function toggleWebPick(name) { setWebPick(name, !webPick.get(name)); }

function sendPageQuote(name, quote) {
  const said = String(quote?.said || "").trim();
  const e = structPool.get(name);
  if (!said || !e?.quotes) return;
  const tab = artifactTabOf(name);
  const shelved = tab && tab.slug ? shelfTabOf(tab.url) : null;
  const from = shelved
    ? [quote.title || tab.slug, shelved.tab, shelved.version ? `v${shelved.version}` : "", shelved.at ? `#${shelved.at}` : ""].filter(Boolean).join(" · ")
    : String(quote?.url || "");
  e.quotes.add(said, from);
  e.host.querySelector(".sv-composer textarea")?.focus();
}

const PINS_HELD = new Map();

const PINS_BEAT = 5000;

const HERE_HELD = new Map();

const HERE_EL = new Map();

const FACES_HELD = new Map();

const HERE_AGAIN = 25000;

function standOnThePage(name, el, tabNow) {
  const tab = tabNow || webTabNow(name);
  const here = tab?.kind === "artifact" && tab.slug
    ? { slug: tab.slug, tab: tab.tab || "", el: el || "" }
    : { slug: "", tab: "", el: "" };
  const shape = `${here.slug}|${here.tab}|${here.el}`;
  const was = HERE_HELD.get(name);
  /* standing still still has to be said out loud: the team drops anyone whose word is old. */
  if (was && was.shape === shape && Date.now() - was.at < HERE_AGAIN) return;
  HERE_HELD.set(name, { shape, at: Date.now() });
  fetch("/api/shelf/here", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seat: name, ...here })
  }).catch(() => {});
}

async function paintPageFaces(name, frame) {
  const tab = tabOfFrame(name, frame);
  if (tab?.kind !== "artifact" || !tab.slug) return;
  let said = null;
  try {
    const r = await fetch(`/api/shelf/watching?slug=${encodeURIComponent(tab.slug)}`);
    said = await r.json();
  } catch { return; }
  const watching = Array.isArray(said?.watching) ? said.watching : [];
  const shape = JSON.stringify(watching);
  if (FACES_HELD.get(frameKey(name, frame)) !== shape) {
    FACES_HELD.set(frameKey(name, frame), shape);
    try { frame.send("hive-faces", watching); } catch {}
  }
  /* the bar belongs to the tab in front: a beat from a tab behind must not repaint it. */
  if (frameIsUpFront(name, frame)) paintFacesOfPane(name, watching);
}

function paintFacesOfPane(name, watching) {
  const host = webPaneOfName(name)?.querySelector(".web-faces");
  if (!host) return;
  host.textContent = "";
  host.hidden = !watching.length;
  for (const one of watching) {
    const face = document.createElement("i");
    face.className = "web-face";
    face.style.background = one.colour;
    face.title = one.mine ? phrase("you") : one.dev;
    face.textContent = String(one.dev || "?").slice(0, 2).toUpperCase();
    host.appendChild(face);
  }
}

const pinsWatch = new Map();

function watchPagePins(name, frame) {
  const key = `${name}|${frame?.dataset?.id || ""}`;
  clearInterval(pinsWatch.get(key));
  const beat = setInterval(() => {
    const tab = tabOfFrame(name, frame);
    if (tab?.kind !== "artifact" || !frame.isConnected) {
      clearInterval(beat);
      pinsWatch.delete(key);
      return;
    }
    paintPagePins(name, frame);
    paintPageFaces(name, frame);
    if (showingArtifact(name) && frameIsUpFront(name, frame)) standOnThePage(name, HERE_EL.get(key) || "", tab);
  }, PINS_BEAT);
  pinsWatch.set(key, beat);
}

function threadsOnThePage(comments, tab) {
  const here = (comments || []).filter((one) => one.pin && !one.re && (!one.tab || one.tab === tab));
  return here.map((top, at) => ({
    id: top.id,
    n: at + 1,
    el: top.pin.el || "",
    elAt: top.pin.elAt || "",
    done: !!top.done,
    said: [top, ...(comments || []).filter((one) => one.re === top.id)].map((one) => ({ who: one.who || "", text: one.text || "", agent: !!one.agent }))
  }));
}

function tabOfFrame(name, frame) {
  const web = webOfSeat.get(name);
  return (web?.tabs || []).find((one) => one.id === frame?.dataset?.id) || null;
}

const frameKey = (name, frame) => `${name}|${frame?.dataset?.id || ""}`;

const frameIsUpFront = (name, frame) => webTabNow(name)?.id === frame?.dataset?.id;

async function paintPagePins(name, frame) {
  const tab = tabOfFrame(name, frame);
  if (tab?.kind !== "artifact" || !tab.slug) return;
  let said = null;
  try {
    const r = await fetch(`/api/shelf/comments?slug=${encodeURIComponent(tab.slug)}`);
    said = await r.json();
  } catch { return; }
  const pins = threadsOnThePage(said?.comments, tab.tab);
  const shape = JSON.stringify(pins);
  if (PINS_HELD.get(frameKey(name, frame)) === shape) return;
  PINS_HELD.set(frameKey(name, frame), shape);
  try { frame.send("hive-pins", pins); } catch {}
}

function threadLine(tab, ask, said, thread) {
  const at = ask.elAt || ask.selector || "";
  return `${said} · responda na página com reply_on_page: slug "${tab.slug}", conversa "${thread}", no pedaço "${at}"`;
}

async function askOnTheElement(name, frame, ask) {
  if (!ask || !ask.selector) return;
  setWebPick(name, false);
  const said = String(ask.said || "").trim();
  const tab = tabOfFrame(name, frame);
  if (tab?.kind !== "artifact" || !tab.slug) return sendPickReference(name, frame, ask);
  if (!said) return;
  const pin = { frame: ask.frame || "", name: ask.name || "", el: ask.selector, elAt: ask.elAt || "", x: ask.x || 0, y: ask.y || 0 };
  let wrote = null;
  try {
    const r = await fetch("/api/shelf/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: tab.slug, tab: tab.tab, v: tab.version || 0, text: said, pin, re: ask.re || "", seat: name, quiet: ask.where === "chat" })
    });
    wrote = await r.json();
  } catch {
    return sendPickReference(name, frame, ask);
  }
  /* the words were already wiped from the box: if the shelf refused them, they go to the seat
     rather than nowhere. */
  if (!wrote?.comment) return sendPickReference(name, frame, ask);
  PINS_HELD.delete(frameKey(name, frame));
  paintPagePins(name, frame);
  /* answering in the chat still writes in the conversation first: the words belong to the page,
     and what goes to the seat is the address of the conversation it has to answer in. */
  if (ask.where === "chat") {
    sendPickReference(name, frame, { ...ask, said: threadLine(tab, ask, said, wrote.comment.re || wrote.comment.id) });
  }
}

const REVIEW_ASK = "revisar esta tela nos viewports 390 e 1440: passa as 10 heurísticas de Nielsen e o copy check da tela";

function referenceLine(pick) {
  const one = (value, cap) => String(value || "").replace(/\s+/g, " ").trim().slice(0, cap);
  const styles = pick.styles || {};
  const bits = [styles["font-size"], styles["font-weight"], styles.color, styles.padding ? `pad ${one(styles.padding, 40)}` : ""].map((x) => one(x, 40)).filter(Boolean);
  const text = one(pick.text, 120);
  const url = one(pick.url, 300);
  return [`<${one(pick.selector, 200)}>${text ? ` "${text}"` : ""}`, url, bits.join(" ")].filter(Boolean).join(" · ");
}

function intoTheBox(e, words, shot) {
  if (words) svTypePath(e, words);
  if (shot) attachFilesToSeat(e, [{ name: "browser.png", data: shot }]);
  e.host.querySelector(".sv-composer textarea")?.focus();
}

async function sendPickReference(name, frame, pick) {
  setWebPick(name, false);
  if (!pick || !pick.selector) return;
  let crop = "";
  try {
    const r = pick.rect || {};
    if (r.width > 0 && r.height > 0) crop = (await frame.capturePage(r)).toDataURL();
  } catch {}
  const e = structPool.get(name);
  if (e) return intoTheBox(e, [String(pick.said || "").trim(), referenceLine(pick)].filter(Boolean).join(" · "), crop);
  fetch("/api/browser/reference", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, selector: pick.selector, tag: pick.tag || "", text: pick.text || "", said: pick.said || "", url: pick.url || "", styles: pick.styles || {}, crop })
  }).catch(() => {});
}

async function sendScreenPrint(name) {
  const frame = frameOfSeat(name);
  if (!frame) return;
  let crop = "";
  try { crop = (await frame.capturePage()).toDataURL(); } catch {}
  const e = structPool.get(name);
  if (e) return intoTheBox(e, frame.dataset.here || "", crop);
  fetch("/api/browser/print", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, url: frame.dataset.here || "", crop }) }).catch(() => {});
}

function sendScreenReview(name) {
  const frame = frameOfSeat(name);
  if (!frame) return;
  const e = structPool.get(name);
  if (e) return intoTheBox(e, [frame.dataset.here || "", REVIEW_ASK].filter(Boolean).join(" · "), "");
  fetch("/api/browser/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, url: frame.dataset.here || "" }) }).catch(() => {});
}

function catchUpArtifact(name) {
  const tab = webTabNow(name);
  if (tab?.kind !== "artifact") return false;
  const was = tab.url;
  tab.version = 0;
  wantShelfIndex(true);
  render();
  return tab.url !== was;
}

function stepWeb(name, way) {
  const frame = frameOfSeat(name);
  if (!frame) return;
  touchWeb(name);
  if (way === "reload" && catchUpArtifact(name)) return;
  try {
    if (way === "back" && frame.canGoBack()) frame.goBack();
    else if (way === "forward" && frame.canGoForward()) frame.goForward();
    else if (way === "reload") frame.reload();
  } catch {}
}

function openPopupTab(wcId, url) {
  if (!/^https?:\/\//i.test(String(url || ""))) return;
  for (const [name, yard] of webYards) {
    for (const frame of yard.querySelectorAll("webview")) {
      let mine = 0;
      try { mine = frame.getWebContentsId(); } catch { mine = 0; }
      if (mine !== wcId) continue;
      const tab = addWebTab(name);
      if (!tab) return window.seatBrowser?.openExternal(url);
      tab.url = url;
      tab.title = "";
      touchWeb(name);
      render();
      return;
    }
  }
  window.seatBrowser?.openExternal(url);
}

const webExtrasOf = (name) => ({
  pane: null,
  frameNow: () => frameOfSeat(name),
  tabNow: () => webTabNow(name),
  repaint: () => render(),
  newTab: () => { if (addWebTab(name)) render(); }
});

registerSurface({
  id: "browser",
  tabLabel: (s) => {
    const tab = s ? webTabNow(s.name) : null;
    if (!tab?.url || tab.kind === "artifact") return null;
    const label = tab.title || tab.url.replace(/^https?:\/\//, "");
    return { label, title: tab.url, face: tab.icon ? `<span class="sp-ti">${tabIconHtml(tab)}</span>` : "" };
  }
});

const webPaneOfName = (name) => (sidePanelWebHost(name) || document.querySelector(`.tile[data-name="${CSS.escape(name)}"]`))?.querySelector(".art.web") || null;

function webChordFor(name, event) {
  const pane = webPaneOfName(name);
  if (!pane) return false;
  return webChord(event, { ...webExtrasOf(name), pane });
}

function pageKey(name, said) {
  if (!said) return;
  const event = { code: String(said.code || ""), key: String(said.key || ""), altKey: !!said.alt, ctrlKey: !!said.ctrl, metaKey: !!said.meta, shiftKey: !!said.shift };
  if (webChordFor(name, event)) return;
  keyFromPage(said, name);
}

window.addEventListener("keydown", (event) => {
  const pane = event.target?.closest?.(".art.web");
  const name = pane?.closest(".tile, .art.sp")?.dataset.name;
  if (!name || event.repeat || !webChordFor(name, event)) return;
  event.preventDefault();
  event.stopPropagation();
}, true);

function paintWebOfChat(el, s) {
  const on = st.webChat === s.name && paneShownFor(s.name) && ART_WEBVIEW;
  const host = on ? sidePanelWebHost(s.name) : null;
  if (on && !host) el.classList.add("arting");
  if (host) el.querySelector(":scope > .art.web")?.remove();
  const had = (host || el).querySelector(".art.web");
  if (!on) { el.querySelector(".art.web")?.remove(); return; }
  if (!webOfSeat.get(s.name)?.tabs.length) addWebTab(s.name);
  const pane = had || webPaneOf(host || el, s);
  const web = webStateOf(s.name);
  const now = web.tabs[web.active];
  const live = web.tabs.filter((t) => t.url).length;
  pane.querySelector(".art-id span").textContent = `${s.name} \u00b7 ${live ? tabsSaid(live) : phrase("new tab")}`;
  pane.querySelector(".web-out").hidden = !now?.url;
  const tabsBox = pane.querySelector(".web-tabs");
  pane.classList.toggle("web-one", web.tabs.length <= 1);
  const full = webTabsIn(web).length >= WEB_TAB_CAP - 1;
  const mine = drivenTab.get(s.name);
  const busy = drivingNow(s.name);
  const h = web.tabs.map((t, i) => `<button class="web-tab${i === web.active ? " on" : ""}${t.id === mine ? " driven" : ""}${t.id === mine && busy ? " busy" : ""}" data-id="${t.id}"${t.id === mine ? ` title="${phrase("the AI is using this page")}"` : ""}>${t.id === mine ? '<u aria-hidden="true"></u>' : ""}${tabIconHtml(t)}<span>${esc(t.title || t.url || phrase("new tab"))}</span><i data-id="${t.id}">\u00d7</i></button>`).join("")
    + `<button class="web-plus"${full ? " disabled" : ""} title="${full ? phrase("tab limit — close one first") : phrase("new tab")}">+</button>`;
  if (tabsBox.dataset.h !== h) {
    tabsBox.dataset.h = h;
    tabsBox.innerHTML = h;
    tabsBox.querySelectorAll(".web-tab").forEach((b) => b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (ev.target.tagName === "I") return closeWebTab(s.name, ev.target.dataset.id);
      const at = webStateOf(s.name);
      at.active = Math.max(0, at.tabs.findIndex((t) => t.id === b.dataset.id));
      render();
    }));
    tabsBox.querySelector(".web-plus")?.addEventListener("click", (ev) => { ev.stopPropagation(); if (addWebTab(s.name)) render(); });
  }
  paintArtifactChrome(pane, now);
  const input = pane.querySelector(".web-url input");
  const said = now?.url || "";
  const untouched = document.activeElement !== input || input.value === input.dataset.h;
  if (untouched && input.dataset.h !== said) {
    input.dataset.h = said;
    input.value = said;
  }
  const frame = frameOfSeat(s.name);
  const canStep = (way) => {
    try { return way === "back" ? frame.canGoBack() : frame.canGoForward(); } catch { return false; }
  };
  pane.querySelector(".web-back").disabled = !frame || !canStep("back");
  pane.querySelector(".web-fwd").disabled = !frame || !canStep("forward");
  pane.querySelector(".web-again").disabled = !frame;
  paintWebExtras(pane, now);
  const stage = pane.querySelector(".art-stage");
  let hint = stage.querySelector(".web-empty");
  if (!now?.url && !hint) {
    hint = document.createElement("div");
    hint.className = "web-empty";
    hint.textContent = phrase("type an address to start");
    stage.appendChild(hint);
  }
  if (now?.url && hint) hint.remove();
}

function paintArtifactChrome(pane, now) {
  const rail = pane.querySelector(".web-rail");
  const mine = now?.kind === "artifact" ? now : null;
  pane.querySelector(".web-link").hidden = !mine;
  pane.querySelector(".web-ask").hidden = !mine;
  pane.querySelector(".web-out").textContent = mine ? phrase("the shelf") : phrase("browser");
  const page = mine ? shelfPageOf(mine.slug) : null;
  if (!mine || !page) {
    rail.hidden = true;
    if (mine && !page) wantShelfIndex();
    return;
  }
  rail.hidden = false;
  const shown = paintPageChrome(rail, {
    page,
    tab: mine.tab,
    version: mine.version,
    onTab: (tab) => { mine.tab = tab; mine.version = 0; mine.at = ""; render(); },
    onVersion: (n) => { mine.version = n; render(); }
  });
  mine.tab = shown.tab;
  const proposal = shelfLinkTab(page, shown.tab) ? shelfPickedProposal(page, mine.version) : null;
  mine.url = proposal ? proposal.url : shelfTabAddress(mine.slug, shown.tab, shown.now?.n || 0, mine.at);
}

const PAGE_BEAT = 20000;

const pagesMark = (list) => list.map((one) => `${one.key}:${one.n}:${one.label}`).join(",");

async function pullPages() {
  if (someoneReadingAPage()) wantShelfIndex(true);
  let fresh = [];
  try {
    fresh = (await apiGet("/api/artifacts")).pages || [];
  } catch { return; }
  if (pagesMark(fresh) === pagesMark(st.published)) return;
  st.published = fresh;
  shelvePreviews();
  render();
}

function pathOfPreview(url) {
  if (!String(url || "").startsWith("file://")) return "";
  try { return decodeURIComponent(new URL(url).pathname); } catch { return ""; }
}

function pageShelvedSince(tab) {
  const path = pathOfPreview(tab.url);
  if (!path || !tab.since) return null;
  const page = st.published.find((one) => one.path === path && one.slug && (one.at || 0) > tab.since);
  if (!page) return null;
  if (shelfPageOf(page.slug)) return page;
  wantShelfIndex();
  return null;
}

function shelvePreviews() {
  for (const [name, web] of webOfSeat) {
    for (const tab of [...web.tabs]) {
      if (tab.kind !== "web") continue;
      const page = pageShelvedSince(tab);
      if (!page) continue;
      const landed = openArtifactTab(name, { slug: page.slug, tab: page.tab || "" }, 0, true);
      if (!landed) continue;
      const gone = web.tabs.indexOf(tab);
      if (gone >= 0) web.tabs.splice(gone, 1);
      if (drivenTab.get(name) === tab.id) drivenTab.delete(name);
      web.active = Math.max(0, web.tabs.indexOf(landed));
    }
  }
}

const someoneReadingAPage = () =>
  (st.webChat && showingArtifact(st.webChat)) || (shelfOnScreen() && !!st.shelfOpen);

const pagesOfChat = (name) => st.published.filter((one) => one.session === name);

async function openKeptPage(name, one) {
  if (showingArtifact(name, one.slug)) return closeBrowser();
  const index = await artifactIndexAt(one.session || name, one.path);
  if (!index || index.error || !(index.versions || []).length) return;
  openArtifactTab(name, index, 0);
}

function markArtRows(name) {
  const e = structPool.get(name);
  if (!e) return;
  const slug = showingArtifact(name) ? artifactTabOf(name)?.slug : "";
  for (const row of e.host.querySelectorAll(".sv-art")) {
    row.classList.toggle("here", !!slug && row.dataset.slug === slug);
  }
}

const QUESTION_CLOSERS = ["question_answered", "question_dismissed", "question_failed"];
const PLAN_CLOSERS = ["plan_approved", "plan_dismissed"];

function svQuestionCard(e, ev) {
  const card = questionCard(ev.questions, (answers) =>
    svCmd(e, { type: "answer", id: ev.id, answers }).then((r) => {
      if (r?.ok) e.asked.delete(ev.id);
      return r;
    }), ev.id);
  e.asked.set(ev.id, card);
  svAppend(e, card);
  noteAsk(e, ev, card);
}

const FRONT_STATE = { needs: "needs you", done: "done", working: "working", idle: "idle", opening: "opening" };

/* the chats a plan opened are read beside the chat that opened them: they never took a tile, so
   this list is the only place the person sees them without going to the field. One click and the
   one she wants becomes a tile — the other fronts stay out of the way. */
function frontsOfChat(name) {
  if (!name) return [];
  const seats = (st.data.sessions || []).filter((s) => s.by === name);
  const rows = seats.map((s) => ({
    name: s.name,
    said: s.title && s.title !== s.name ? s.title : "",
    where: s.where === "cloud" ? "cloud" : "local",
    model: s.model || "",
    state: s.state || "idle",
    now: s.now || s.summary || "",
    live: true,
  }));
  for (const j of (st.data.spawning || [])) {
    if (j.by !== name) continue;
    if (j.name && rows.some((one) => one.name === j.name)) continue;
    rows.push({
      name: j.name || "",
      said: "",
      where: j.where === "cloud" ? "cloud" : "local",
      model: j.model || "",
      state: j.error ? "needs" : "opening",
      now: j.error || j.step || j.mission || "",
      live: false,
    });
  }
  return rows;
}

function frontsPaneOf(el) {
  const pane = document.createElement("aside");
  pane.className = "fronts";
  pane.innerHTML = `<div class="fr-head"><span class="tag"></span><span class="n"></span></div><div class="fr-list"></div>`;
  pane.addEventListener("mousedown", (ev) => ev.stopPropagation());
  el.appendChild(pane);
  return pane;
}

function paintFrontsOfChat(el, s) {
  const busy = ["arting", "threading", "reviewing", "deviced"].some((one) => el.classList.contains(one));
  const rows = st.open === s.name && !busy ? frontsOfChat(s.name) : [];
  const had = el.querySelector(".fronts");
  el.classList.toggle("fronting", rows.length > 0);
  if (!rows.length) { had?.remove(); return; }
  const pane = had || frontsPaneOf(el);
  pane.querySelector(".fr-head .tag").textContent = phrase("fronts");
  pane.querySelector(".fr-head .n").textContent = rows.length === 1 ? phrase("1 chat") : phrase("{n} chats", { n: rows.length });
  const list = pane.querySelector(".fr-list");
  /* what a front is doing changes with every poll. Rebuilding the list for a line of text would
     throw away the button the keyboard is on, so the rows are only rebuilt when the rows
     themselves change, and the words inside them are written in place. */
  const shape = rows.map((one) => `${one.name}|${one.state}|${one.live ? 1 : 0}`).join(",");
  if (list.dataset.shape !== shape) {
    list.dataset.shape = shape;
    list.innerHTML = rows.map((one) => `<button class="fr-row" data-seat="${esc(one.name)}" data-state="${esc(one.state)}"${one.live ? "" : " disabled"}>`
      + `<span class="fr-name">${esc(one.name || phrase("picking a name"))}</span>`
      + `<span class="fr-st">${esc(phrase(FRONT_STATE[one.state] || one.state))}</span>`
      + `<span class="fr-said"></span><span class="fr-meta"></span></button>`).join("");
    for (const row of list.querySelectorAll(".fr-row")) {
      row.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (row.dataset.seat) openTile(row.dataset.seat);
      });
    }
  }
  [...list.querySelectorAll(".fr-row")].forEach((row, at) => {
    const one = rows[at];
    if (!one) return;
    row.querySelector(".fr-said").textContent = one.said || one.now || "";
    row.querySelector(".fr-meta").textContent = [one.where === "cloud" ? phrase("on the server") : phrase("here"), one.model && pillLabel(prettyModelId(one.model).name)].filter(Boolean).join(" \u00b7 ");
  });
}

function svDraftPaint(e) {
  const draft = e.draft;
  if (!draft) return;
  draft.frame = 0;
  const blocks = liveMarkdown(draft.raw);
  for (let i = 0; i < blocks.length; i++) {
    if (draft.blocks[i] === blocks[i]) continue;
    const hold = document.createElement("div");
    hold.innerHTML = blocks[i];
    const fresh = hold.firstElementChild;
    if (!fresh) continue;
    wireMdShots(e, fresh);
    wireLinks(e.name, fresh);
    enrichMarkdown(fresh, { seat: e });
    const worn = draft.el.children[i];
    if (worn) draft.el.replaceChild(fresh, worn);
    else draft.el.appendChild(fresh);
  }
  while (draft.el.children.length > blocks.length) draft.el.lastElementChild.remove();
  draft.blocks = blocks;
  if (e.atBottom) e.scroll.scrollTop = e.scroll.scrollHeight;
}

function svStreamDelta(e, ev) {
  const inner = ev.event;
  if (ev.parent_tool_use_id) return;
  if (e.conv && inner?.type === "content_block_start" && inner.content_block?.type === "thinking") svConvThinking(e, "", true);
  if (inner?.type !== "content_block_delta") return;
  if (inner.delta?.type === "thinking_delta" && !e.thoughtAt && !ev.replayed) e.thoughtAt = Date.now();
  if (inner.delta?.type === "thinking_delta" && e.conv) svConvThinking(e, inner.delta.thinking);
  if (inner.delta?.type === "text_delta") {
    if (e.conv) return svConvStream(e, inner.delta.text);
    if (!e.draft) e.draft = { el: svLine(e, "sv-msg md streaming", ""), raw: "", blocks: [], frame: 0 };
    e.draft.raw += inner.delta.text;
    if (!e.draft.frame) e.draft.frame = requestAnimationFrame(() => svDraftPaint(e));
  }
}

function svAssistant(e, ev) {
  if (ev.parent_tool_use_id) {
    const card = e.tools.get(ev.parent_tool_use_id);
    for (const b of ev.message?.content || []) {
      if (b.type === "text" && b.text.trim()) {
        if (card?.kind) { card.sub = b.text.slice(0, 600); svConvShow(e); }
        else if (card) {
          let sub = card.querySelector(".tsub");
          if (!sub) { sub = document.createElement("div"); sub.className = "tsub"; card.appendChild(sub); }
          sub.textContent = b.text.slice(0, 600);
        }
        svSubEcho(e, ev.parent_tool_use_id, b.text.slice(0, 600));
      }
      if (b.type === "tool_use") svSubCall(e, ev.parent_tool_use_id, b);
    }
    return;
  }
  const said = (ev.message?.content || []).find((b) => b.type !== "text" || b.text.trim());
  let settled = null;
  if (e.draft) {
    cancelAnimationFrame(e.draft.frame);
    if (e.conv) settled = said?.type === "text" ? svConvSettle(e, said.text) : null;
    if (e.conv && !settled) svConvDraftDrop(e);
    else if (!e.conv) e.draft.el.remove();
    e.draft = null;
  }
  for (const b of ev.message?.content || []) {
    if (b.type === "text" && b.text.trim()) {
      if (e.conv && settled && b === said) { settled.seq = Number(ev.seq) || 0; continue; }
      if (e.conv) svConvSaid(e, b.text).seq = Number(ev.seq) || 0;
      else {
        const div = document.createElement("div");
        div.className = "sv-msg md";
        div.innerHTML = renderMarkdown(b.text);
        wireMdShots(e, div);
        wireLinks(e.name, div);
        enrichMarkdown(div, { seat: e });
        svAppend(e, div);
      }
    }
    if (b.type === "thinking" && b.thinking?.trim() && e.conv) {
      const spent = e.thoughtAt ? Date.now() - e.thoughtAt : 0;
      e.thoughtAt = 0;
      svConvThink(e, b.thinking, spent >= 200 ? `· ${tookLabel(spent)}` : "");
    }
    if (b.type === "thinking" && b.thinking?.trim() && !e.conv) {
      const think = document.createElement("details");
      think.className = "sv-think";
      think.innerHTML = `<summary><span class="tw c">${phrase("thinking")}</span><span class="tw n">${phrase("thought")}</span><span class="tdur"></span></summary><div class="tk"></div>`;
      think.querySelector(".tk").textContent = b.thinking;
      const spent = e.thoughtAt ? Date.now() - e.thoughtAt : 0;
      e.thoughtAt = 0;
      if (spent >= 200) {
        think.classList.add("timed");
        think.querySelector(".tdur").textContent = `· ${tookLabel(spent)}`;
      }
      svAppend(e, think);
    }
    if (b.type === "tool_use") {
      const card = svToolCard(e, b, !ev.replayed);
      if (ev.replayed) {
        if (card.kind) { card.running = false; svConvShow(e); }
        else card.classList.remove("running");
      }
    }
  }
}

const SYNTHETIC_TAGS = /^<(?:local-command-stdout|local-command-stderr|command-name|command-message|command-args)>/;

const HARNESS_NOTES = [
  { open: "<task-notification>", label: "task notification" },
  { open: "<system-reminder>", label: "system note" },
  { open: "<session-start-hook>", label: "session hook" }
];

function svFoldedNote(e, label, body) {
  return svConvNote(e, label, body);
}

const SKILL_BODY = /^Base directory for this skill:/;

function svSynthetic(e, text) {
  const card = e.skillCard;
  e.skillCard = null;
  if (!card) return svFoldedNote(e, SKILL_BODY.test(text) ? "skill" : "note", text);
  if (card.kind) { card.body = trimBody(text); return void svConvShow(e); }
  const body = card.querySelector(".tbody");
  if (body) body.textContent = trimBody(text);
}

function svUserText(e, text, synthetic) {
  const clean = text.trim();
  if (!clean || clean.startsWith("[Request interrupted")) return;
  if (synthetic || SKILL_BODY.test(clean)) return svSynthetic(e, clean);
  const harness = HARNESS_NOTES.find((h) => clean.startsWith(h.open));
  if (harness) {
    const summary = clean.match(/<summary>([\s\S]*?)<\/summary>/)?.[1].trim();
    const status = clean.match(/<status>(.*?)<\/status>/)?.[1].trim();
    /* this driver never gets the notification as text — `svSubTask` reads the system events the sdk
       turns it into. kept for the harness that hands it over the way the model reads it. */
    const landed = clean.match(/<tool-use-id>(.*?)<\/tool-use-id>/)?.[1];
    if (landed) svSubUnpin(e, landed);
    const label = phrase(harness.label) + (status ? ` · ${status}` : "");
    svFoldedNote(e, label, summary || clean.replace(/<\/?[\w-]+>/g, "").trim());
    return;
  }
  if (SYNTHETIC_TAGS.test(clean)) {
    const bare = clean.replace(/<\/?[a-z-]+>/g, "").trim();
    if (bare) svLine(e, "sv-meta", bare);
    return;
  }
  svLine(e, "sv-user", clean);
}

function weaveHandles(text, sessions, mine, oneLine = false, side = "") {
  const seats = expandMentions(text, sessions, mine, oneLine, side);
  if (seats.error) return seats;
  const folk = expandPeople(seats.text, st.team.devs, st.team.me, mine, oneLine);
  if (folk.error) return folk;
  return { text: folk.text, peers: [...(seats.peers || []), ...(folk.people || [])] };
}

function paintMentions(el) {
  if (el.kind) return svConvMentions(el);
  paintSaidChips(el);
}

function svPeerFrom(e, from, consumed) {
  /* the banner says who wrote in the words the person keeps this chat under, not in the name the
     machine handed it — the same name the rail, the pane and the mention menu all say. */
  const seat = st.data.sessions.find((one) => one.name === from);
  return svConvPeer(e, seat ? seatLabel(seat) : from, consumed, from);
}

function svUser(e, ev) {
  if (ev.parent_tool_use_id) {
    for (const b of (Array.isArray(ev.message?.content) ? ev.message.content : [])) {
      if (b.type === "tool_result") svSubLanded(e, ev.parent_tool_use_id, b.tool_use_id, b.is_error);
    }
    return;
  }
  if (ev.subtype === "say") {
    const text = (Array.isArray(ev.message?.content) ? ev.message.content : [])
      .filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!ev.from) rememberSent(e, text, ev.seq);
    if (ev.cid && e.said?.has(ev.cid)) return void (e.saidSeqs ||= new Map()).set(ev.cid, Number(ev.seq) || 0);
    if (ev.from) svPeerFrom(e, ev.from, ev.consumed);
    const bubble = svLine(e, ev.from ? "sv-user peer" : "sv-user", splitPeerHandle(text).body || "(image)");
    paintMentions(bubble);
    if (ev.cid) bubble.dataset.cid = ev.cid;
    if (ev.uuid && !ev.from) bubble.dataset.uuid = ev.uuid;
    if (!ev.from && Number(ev.seq)) bubble.seq = Number(ev.seq);
    for (const path of ev.images || []) svUserThumb(e, bubble, path);
    if (ev.edited) svLine(e, "sv-meta sv-edited", phrase("you edited this message · what came after it left the conversation"));
    svTrimTurns(e);
    return;
  }
  const content = ev.message?.content;
  if (typeof content === "string") {
    svUserText(e, content, ev.isSynthetic);
    svTrimTurns(e);
    return;
  }
  for (const b of content || []) {
    if (b.type === "tool_result") svToolResult(e, b, !ev.replayed);
    if (b.type === "text") svUserText(e, b.text, ev.isSynthetic);
  }
  if (isHumanTurnContent(content)) svTrimTurns(e);
}

const isHumanTurnContent = (content) => Array.isArray(content) && content.some((b) => b.type === "text") && !content.some((b) => b.type === "tool_result");

function svAlreadyPainted(e, ev) {
  if (!Number(ev.seq)) return false;
  if (Number(ev.seq) <= (e.lastSeq || 0)) return true;
  e.lastSeq = Number(ev.seq);
  return false;
}

function svEvent(e, ev) {
  if (svAlreadyPainted(e, ev)) return;
  e.heardAt = Date.now();
  if (!e.firstSeq && Number(ev.seq) > 0) e.firstSeq = Number(ev.seq);
  e.at = (ev.ts && Date.parse(ev.ts)) || Date.now();
  const live = !ev.replayed;
  seatEventSeen(e, ev);
  composerSaw(e, ev, live);
  if (e.conv) svConvSteerSaw(e, ev);
  if (ev.type === "system") {
    if (ev.subtype === "init") {
      if (e.conv) svConvTurnStart(e);
      if (ev.agent) e.agent = ev.agent;
      if (ev.model) e.model = ev.model;
      if (typeof ev.effort === "string") e.effort = ev.effort;
      e.heard = { model: ev.model || e.heard?.model || "", effort: typeof ev.effort === "string" ? ev.effort : e.heard?.effort || "" };
      paintPills(e);
      const gone = new Set(ev.terminal_slash_commands || []);
      e.slashGone = gone;
      e.slash = (ev.slash_commands || []).filter((c) => !gone.has(c));
      e.skills = new Set(Array.isArray(ev.skills) ? ev.skills.filter((one) => typeof one === "string") : []);
      e.slashInfo = {};
      if (live) {
        e.turnOpen = ev.working !== false;
        svActivity(e, e.turnOpen ? "working" : "");
        if (e.turnOpen && !e.driverDequeues) svDequeue(e);
        mcpSignInsAtInit(e, ev);
      }
    }
    if (ev.subtype === "commands_changed") {
      if (Array.isArray(ev.commands)) {
        const gone = e.slashGone || new Set();
        const info = {};
        for (const c of ev.commands) {
          if (!c || typeof c.name !== "string" || gone.has(c.name)) continue;
          info[c.name] = { description: typeof c.description === "string" ? c.description : "", argumentHint: typeof c.argumentHint === "string" ? c.argumentHint : "" };
        }
        e.slashInfo = info;
        e.slash = Object.keys(info);
      }
      return;
    }
    if (ev.subtype === "status") {
      if (live && ev.status === "compacting") {
        svActivity(e, phrase("compacting the conversation…"));
      }
      if (ev.compact_result && ev.compact_result !== "success") {
        svLine(e, "sv-meta warn", `${phrase("compact failed")}${ev.compact_error ? ` — ${ev.compact_error}` : ""}`);
        if (live) refreshContext(e);
      }
      return;
    }
    if (ev.subtype === "compact_boundary") {
      const m = ev.compact_metadata || {};
      const kfmt = (t) => t == null ? "?" : `${(t / 1000).toFixed(t >= 99500 ? 0 : 1)}k`;
      const secs = m.duration_ms ? ` · ${Math.max(1, Math.round(m.duration_ms / 1000))}s` : "";
      const how = m.trigger === "auto" ? phrase("on its own") : m.trigger === "idle" ? phrase("while idle, before the cache expired") : phrase("you asked");
      svLine(e, "sv-meta sv-compacted", phrase("context compacted ({how}) · {pre} → {post} tokens{secs}", { how, pre: kfmt(m.pre_tokens), post: kfmt(m.post_tokens), secs }));
      if (live) refreshContext(e);
      return;
    }
    if (ev.subtype === "api_retry") return void (e.conv && svConvRetry(e, ev));
    svSubTask(e, ev);
    return;
  }
  if (e.conv?.retrying && (ev.type === "stream_event" || ev.type === "assistant") && !ev.parent_tool_use_id) svConvRecovered(e);
  if (ev.type === "stream_event") {
    if (live && !ev.parent_tool_use_id) {
      const delta = ev.event?.delta?.type;
      if (delta === "thinking_delta") svActivity(e, "thinking");
      else if (delta === "text_delta") svActivity(e, "writing");
    }
    return svStreamDelta(e, ev);
  }
  if (ev.type === "assistant") {
    if (live && !ev.parent_tool_use_id) {
      for (const b of ev.message?.content || []) {
        if (b.type === "tool_use") {
          (e.pendingTools ||= new Map()).set(b.id, b.name);
          svActivity(e, `running ${toolSays(b.name)}`);
        }
      }
    }
    memoryTurnSaw(e, ev);
    return svAssistant(e, ev);
  }
  if (ev.type === "user") {
    if (live && e.pendingTools?.size) {
      for (const b of (Array.isArray(ev.message?.content) ? ev.message.content : [])) {
        if (b.type === "tool_result") {
          e.pendingTools.delete(b.tool_use_id);
          svConvRunOff(e, e.tools.get(b.tool_use_id));
        }
      }
      const next = [...e.pendingTools.values()].pop();
      svActivity(e, next ? `running ${toolSays(next)}` : "working");
    }
    memoryTurnSaw(e, ev);
    return svUser(e, ev);
  }
  if (ev.type === "result") {
    if (e.conv) svConvTurnEnded(e, ev.is_error === true);
    if (live) {
      e.turnOpen = false;
      e.turnFailed = ev.is_error === true;
      e.thoughtAt = 0;
      e.pendingTools?.clear();
      svActivity(e, "");
      for (const card of e.tools.values()) svConvRunOff(e, card);
      for (const [id, item] of [...(e.subs || [])]) if (!item.dataset.bg) svSubUnpin(e, id);
      refreshContext(e);
    }
    memoryTurnEnded(e);
    return;
  }
  if (ev.type === "driver") {
    if (composerDriverNote(e, ev, live)) return;
    if (ev.subtype === "started" || ev.subtype === "slept") svSubsOfAnEndedProcess(e);
    /* the seat was reopened under the same name and its diary started over at 1: what this
       tile painted belongs to a driver that is gone, its open turn included */
    if (ev.subtype === "diary_reset") {
      svReset(e);
      e.turnOpen = false;
      svActivity(e, "");
      svLine(e, "sv-meta", phrase("this chat was reopened — what follows is its new driver"));
      void refreshDriverState(e);
      return;
    }
    if (ev.subtype === "shell") return void svShellBlock(e, ev);
    if (ev.subtype === "mcp_app") return void svMcpApp(e, ev);
    if (ev.subtype === "turn_started") {
      if (live) { e.turnOpen = true; svActivity(e, "working"); }
      return;
    }
    if (ev.subtype === "question") { if (live) svActivity(e, phrase("waiting for your answer")); return svQuestionCard(e, ev); }
    /* the card is the answer to a held ExitPlanMode, and that one always carries the id the
       answer goes back on. A "plan" with no id is nobody's question, and it must never say the
       chat stopped and is waiting — whatever agent sent it, and whatever it ends up being called. */
    if (ev.subtype === "plan" && ev.id) { if (live) svActivity(e, phrase("waiting for you to read the plan")); return svPlanCard(e, ev); }
    if (ev.subtype === "todo") return void svLine(e, "sv-meta", ev.text || "");
    if (PLAN_CLOSERS.includes(ev.subtype)) return void closePlanCard(e, ev);
    if (ev.subtype === "mode_changed") {
      e.mode = ev.mode === "plan" ? "plan" : "";
      paintPills(e);
      return;
    }
    if (QUESTION_CLOSERS.includes(ev.subtype)) {
      if (live) svActivity(e, "working");
      const c = e.asked.get(ev.id);
      closeAsk(e, ev, c);
      if (!c) return;
      closeQuestion(c);
      if (ev.subtype !== "question_answered") dropQuestion(c, ev.subtype === "question_dismissed" ? phrase("dropped — you said it in the chat instead") : `dropped — ${ev.error || phrase("the answer did not fit")}`);
      e.asked.delete(ev.id);
      return;
    }
    if (ev.subtype === "provider_changed") {
      e.agent = ev.agent;
      e.model = ev.model || "";
      e.turnOpen = false;
      e.catalog = null;
      e.catalogPull = null;
      paintPills(e);
      return void svLine(e, "sv-meta", phrase("continued with {agent} · {model}", { agent: providerName(ev.agent), model: ev.model }));
    }
    if (ev.subtype === "started_fresh") {
      e.turnOpen = false;
      if (live) refreshContext(e);
      return void svLine(e, "sv-meta", ev.history
        ? phrase("started fresh — your next message carries an extract of the old conversation, and the whole of it is in {file}", { file: ev.history })
        : phrase("started fresh"));
    }
    if (ev.subtype === "model_changed") {
      settlePick(e, "model");
      e.model = ev.model || "";
      svSwitched(e, { model: e.model, effort: e.heard?.effort ?? e.effort ?? "" }, ev.label);
      paintPills(e);
      repaintColumnsPicker(e);
      if (live) refreshContext(e);
      return;
    }
    if (ev.subtype === "effort_changed") {
      settlePick(e, "effort");
      e.effort = ev.level || "";
      svSwitched(e, { model: e.heard?.model || e.model || "", effort: e.effort });
      paintPills(e);
      repaintColumnsPicker(e);
      if (live) render();
      return;
    }
    if (ev.subtype === "account_changed") {
      settlePick(e, "account");
      e.account = ev.account;
      paintPills(e);
      repaintColumnsPicker(e);
      return;
    }
    if (ev.subtype === "account_took_over") {
      const gone = ev.from || "default";
      const here = ev.account || "default";
      return void svLine(e, "sv-meta", ev.until
        ? phrase("{gone} had no room left until {when} — {here} picked the turn up from here", { gone, here, when: artClock(ev.until) })
        : phrase("{gone} had no room left — {here} picked the turn up from here", { gone, here }));
    }
    if (ev.subtype === "login_reread") {
      return void svLine(e, "sv-meta", phrase("{gone} answered with an expired login — this chat reopened it and is trying once more", { gone: ev.account || "default" }));
    }
    if (ev.subtype === "every_account_spent") {
      if (ev.why === "login") return void svLine(e, "sv-meta warn", phrase("the login on {gone} expired — sign in again in Settings, then send the message again", { gone: ev.account || "default" }));
      e.limitedUntil = Date.parse(ev.until || "") || Number(ev.until) || Date.now();
      return void svLine(e, "sv-meta", ev.until
        ? phrase("every login on this machine is out of room — {gone} comes back {when}", { gone: ev.account || "default", when: artClock(ev.until) })
        : phrase("every login on this machine is out of room"));
    }
    if (ev.subtype === "resume_planned") {
      return void svLine(e, "sv-meta", phrase("it picks the turn up again by itself at {when}", { when: artClock(ev.at) }));
    }
    if (ev.subtype === "resumed_after_limit") {
      e.limitedUntil = 0;
      return void svLine(e, "sv-meta", phrase("{here} has room again — the refused turn runs again", { here: ev.account || "default" }));
    }
    if (ev.subtype === "account_came_home") {
      return void svLine(e, "sv-meta", phrase("{here} has room again, so this chat is back on it", { here: ev.account || "default" }));
    }
    if (ev.subtype === "interrupted") return void svConvStopped(e);
    if (ev.subtype === "stop_task_failed") {
      if (!live) return;
      e.bgStopping = 0;
      return void svLine(e, "sv-meta warn", phrase("the background work could not be stopped — {why}", { why: ev.error || "?" }));
    }
    /* the driver says the moment a queued message enters the turn. before this event the chip
       only left on the next init, and the take back button was dead for the whole gap. */
    if (ev.subtype === "said_now") return void (e.conv && svConvSteer(e, ev.cid));
    if (ev.subtype === "dispatched") {
      if (e.conv) svConvDispatched(e, ev.cid);
      e.driverDequeues = true;
      e.limitedUntil = 0;
      if (live) { e.turnOpen = true; svActivity(e, "working"); }
      const held = (e.queuedEls || []).find((el) => el.dataset.cid === ev.cid);
      if (held && live) svDequeue(e, held);
      else if (live) svDequeuedEarly(e, ev.cid);
      return;
    }
    if (ev.subtype === "unsaid") {
      if (e.conv) svConvUnsay(e, ev.cid);
      else e.scroll.querySelector(`.sv-user[data-cid="${ev.cid}"]`)?.remove();
      const held = (e.queuedEls || []).find((el) => el.dataset.cid === ev.cid);
      if (held) {
        e.queuedEls.splice(e.queuedEls.indexOf(held), 1);
        held.remove();
        paintQueue(e);
        paintActivity(e);
      }
      return;
    }
    if (ev.subtype === "resaid") {
      const held = (e.queuedEls || []).find((el) => el.dataset.cid === ev.cid);
      if (held && typeof ev.text === "string") {
        held.dataset.text = ev.text;
        held.dataset.images = JSON.stringify(Array.isArray(ev.images) ? ev.images : []);
        delete held.dataset.sig;
        paintQueue(e);
      }
      if (e.conv) svConvResay(e, ev.cid, ev.text, ev.images);
      return;
    }
    if (ev.subtype === "rewound") {
      if (e.conv) svConvRewind(e, ev.target);
      return;
    }
    if (ev.subtype === "forked") return void svForked(e, ev);
    if (ev.subtype === "said_as") {
      if (e.conv) svConvSaidAs(e, ev.was, ev.uuid);
      return;
    }
    if (ev.subtype === "edit_failed") {
      if (live && e.conv) editFailed(e, svConvBubbleOf(e, ev.target), ev.error);
      return;
    }
    if (ev.subtype === "replayed") return void svLine(e, "sv-meta", phrase("replayed the last {n} of {total} messages — the model remembers all of it", { n: ev.count, total: ev.total }));
    if (ev.subtype === "windowed") return void svEarlier(e, ev);
    if (ev.subtype === "warning" || ev.subtype === "error") return void svLine(e, "sv-meta warn", ev.message || ev.error || ev.subtype);
    return;
  }
}

const shellTook = (ms) => (ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : `${(ms / 1000).toFixed(1)}s`);

const shellWentWrong = (ev) => !!ev.error || !!ev.timedOut || !!ev.signal || (ev.code !== 0 && ev.code !== null && ev.code !== undefined);

function shellState(ev) {
  if (ev.running) return phrase("running…");
  if (ev.error) return ev.error;
  if (ev.timedOut) return phrase("stopped after {took} — it was taking too long", { took: shellTook(ev.ms || 0) });
  if (ev.signal) return `${ev.signal} · ${shellTook(ev.ms || 0)}`;
  if (ev.code === 0) return shellTook(ev.ms || 0);
  return phrase("exit {code} · {took}", { code: ev.code, took: shellTook(ev.ms || 0) });
}

function paintShellBlock(el, ev) {
  el.classList.toggle("running", !!ev.running);
  el.classList.toggle("bad", !ev.running && shellWentWrong(ev));
  el.classList.toggle("unrecorded", !!ev.unrecorded);
  el.classList.toggle("quiet", !!ev.quiet);
  el.querySelector(".sh-cmd").textContent = ev.command || "";
  const cwd = el.querySelector(".sh-cwd");
  cwd.textContent = ev.cwd ? String(ev.cwd).replace(/^\/(?:Users|home)\/[^/]+/, "~") : "";
  cwd.title = ev.cwd || "";
  el.querySelector(".sh-state").textContent = shellState(ev);
  const out = el.querySelector(".sh-out");
  out.textContent = ev.output || "";
  out.hidden = !ev.output;
  const note = el.querySelector(".sh-note");
  note.textContent = [
    ev.truncated ? phrase("the middle of the output was cut") : "",
    ev.quiet ? phrase("ran outside the chat's history — gone on the next reload") : ev.unrecorded ? phrase("not kept in the chat's history — reopen this chat so the next one is") : ""
  ].filter(Boolean).join(" · ");
  note.hidden = !note.textContent;
}

function svShellBlock(e, ev) {
  e.shells ||= new Map();
  const held = ev.cid ? e.shells.get(ev.cid) : null;
  if (held?.isConnected) {
    paintShellBlock(held, ev);
    return held;
  }
  const el = document.createElement("div");
  el.className = "sv-shell";
  if (ev.cid) el.dataset.cid = ev.cid;
  el.innerHTML = `<div class="sh-line"><span class="sh-mark">$</span><span class="sh-cmd"></span><span class="sh-cwd"></span><span class="sh-state"></span></div><pre class="sh-out"></pre><div class="sh-note" hidden></div>`;
  paintShellBlock(el, ev);
  if (ev.cid) e.shells.set(ev.cid, el);
  svAppend(e, el);
  return el;
}

const AGENT_NAMES = { claude: "claude", codex: "codex", kimi: "kimi", kiro: "kiro", cursor: "cursor", gemini: "gemini", antigravity: "antigravity", opencode: "opencode" };

function seatAgent(e) {
  return AGENT_NAMES[e.agent] || "claude";
}

const DRAFT_EFFORT_KINDS = { claude: ["structured"], codex: ["structured", "terminal"], kimi: ["structured"] };

function draftCarriesEffort(agent, kind) {
  const kinds = DRAFT_EFFORT_KINDS[AGENT_NAMES[agent] || "claude"] || [];
  return kinds.includes(kind === "terminal" ? "terminal" : "structured");
}

function modelNameOf(e, id, label = "") {
  const raw = String(id || "");
  if (!raw) return "";
  const pretty = prettyModelId(raw).name;
  if (pretty !== withoutVariant(raw).split("/").pop()) return pretty;
  const row = (e.catalog || []).find((m) => m.value === raw || m.resolved === raw);
  return pillLabel(row?.label || label) || pretty;
}

function svSwitched(e, after, label = "") {
  const before = e.heard;
  e.heard = after;
  if (!e.conv || !before?.model) return;
  svConvSwitch(e, before, after, (id) => modelNameOf(e, id, id === after.model ? label : ""));
}

function pillLabel(text) {
  return String(text || "")
    .replace(/\s*\(recommended\)/i, "")
    .replace(/\s*\([^)]*context\)/i, "")
    .trim();
}

const MODEL_WORDS = { opus: "Opus", sonnet: "Sonnet", haiku: "Haiku", fable: "Fable" };

function prettyModelId(id) {
  const raw = String(id || "");
  const variant = /\[(\d+(?:\.\d+)?[km])\]/i.exec(raw);
  const bare = raw.replace(/\[[^\]]*\]/g, "").split("/").pop();
  const said = /^claude-([a-z]+)-([\d.-]+?)(?:-\d{8})?$/.exec(bare);
  const name = said ? `${MODEL_WORDS[said[1]] || titleCase(said[1])} ${said[2].split("-").join(".")}` : bare;
  return { name, context: variant ? variant[1].toUpperCase().replace("K", "k") : "" };
}

function normalizeLooseModels(rows) {
  return (Array.isArray(rows) ? rows : []).filter((m) => m?.value).map((m) => ({
    value: m.value,
    label: m.displayName || prettyModelId(m.value).name || m.value,
    description: m.description || "",
    context: prettyModelId(m.resolvedModel || m.value).context,
    group: String(m.value).includes("/") ? String(m.value).split("/")[0] : "",
    resolved: m.resolvedModel || "",
    isDefault: m.value === "default",
    efforts: (m.supportedEffortLevels || []).map((v) => ({ value: v, label: v, description: "" })),
    defaultEffort: "",
    badges: [],
  }));
}

function markOf(agent) {
  return `<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><use href="#i-${AGENT_NAMES[agent] || "claude"}"/></svg>`;
}

function effortBarsEl({ total, lit }, said) {
  const el = document.createElement("span");
  el.className = "txt effort-bars";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", said);
  el.innerHTML = Array.from({ length: total }, (_, at) => `<i class="${at < lit ? "on" : ""}" style="--bar:${(at + 1) / total}"></i>`).join("");
  return el;
}

function titleCase(word) {
  const t = String(word || "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function withoutVariant(id) {
  return String(id || "").replace(/\[[^\]]*\]/g, "");
}

function catalogRow(e) {
  const rows = e.catalog || [];
  if (!rows.length) return null;
  const id = e.model || "";
  if (!id) return rows.find((m) => m.isDefault) || null;
  const bare = withoutVariant(id);
  /* an explicit pick wins outright. Matching by the id the session resolved to,
     prefer the row that names the model over the "default" alias: "Opus" tells
     you where you are, "Default" does not. */
  return rows.find((m) => m.value === id)
    || rows.find((m) => m.resolved === id && !m.isDefault)
    || rows.find((m) => m.resolved === id)
    || rows.find((m) => m.resolved && withoutVariant(m.resolved) === bare && !m.isDefault)
    || rows.find((m) => m.resolved && withoutVariant(m.resolved) === bare)
    || rows.find((m) => withoutVariant(m.value) === bare)
    || null;
}

function modelNamed(rows, arg) {
  const want = String(arg || "").trim().toLowerCase();
  if (!want) return null;
  const same = (text) => String(text || "").toLowerCase() === want;
  const firstWord = (m) => prettyModelId(m.resolved || m.value).name.toLowerCase().split(" ")[0];
  return (rows || []).find((m) => same(m.value) || same(m.resolved))
    || (rows || []).find((m) => !m.isDefault && (same(withoutVariant(m.value)) || same(withoutVariant(m.resolved))))
    || (rows || []).find((m) => !m.isDefault && same(m.label))
    || (rows || []).find((m) => !m.isDefault && firstWord(m) === want)
    || null;
}

const OLD_DRIVER = /unknown (control op|command control)/;

const STILL_COMING_UP = /not listening|not connected to the driver/i;

const CATALOG_RETRY_STEP = 1500;

const CATALOG_RETRY_CAP = 12000;

const CATALOG_TRIES = 8;

function refreshCatalog(e, refresh) {
  if (e.catalogPull && !refresh) return e.catalogPull;
  if (e.draft) return refreshDraftCatalog(e);
  const settle = (models, wrong) => {
    e.catalogError = wrong || "";
    if (!wrong) {
      e.catalog = dressCatalog(e, models || []);
      e.catalogTries = 0;
    } else {
      /* a failed attempt is not an answer. Keeping the settled promise here made
         one bad moment — a driver still booting, a window that blinked — the
         last word for the life of the seat: every later ask handed back this
         same rejection without dialling, and the picker went to its grave
         saying there was none. */
      e.catalogPull = null;
    }
    paintPills(e);
    e.menu?.repaint?.();
    return wrong ? null : e.catalog;
  };
  /* a seat mid-turn answers control commands only when the turn lets go, so the
     ask can time out with nothing wrong at all. Remembering that as an error
     put a dead "the driver did not answer" card in the picker that stayed there.
     Forget the attempt instead, and the next open simply asks again. */
  const later = () => {
    e.catalogPull = null;
    e.catalogError = "";
    paintPills(e);
    e.menu?.repaint?.();
    return null;
  };
  /* nothing is wrong yet, so say nothing and knock again in a moment. After
     enough quiet knocks the seat really is not answering, and then it is worth
     a card — one the next open still gets to replace. */
  const comingUp = (why) => {
    e.catalogTries = (e.catalogTries || 0) + 1;
    if (e.catalogTries > CATALOG_TRIES) return settle(null, why);
    later();
    clearTimeout(e.catalogWait);
    e.catalogWait = setTimeout(() => {
      if (!e.catalog && e.host.isConnected) refreshCatalog(e);
    }, Math.min(CATALOG_RETRY_CAP, CATALOG_RETRY_STEP * e.catalogTries));
    return null;
  };
  const pull = svCmd(e, { type: "control", op: "catalog", ...(refresh ? { refresh: true } : {}) }).then(async (r) => {
    if (r?.ok) {
      const now = r.data?.current || {};
      if (now.model) e.model = now.model;
      if (typeof now.effort === "string") e.effort = now.effort;
      if ("account" in now) e.account = now.account;
      if (typeof now.fast === "boolean") e.fast = now.fast;
      e.effortFrom = now.from || "";
      return settle(r.data?.models);
    }
    if (r?.silent) return later();
    if (STILL_COMING_UP.test(r?.error || "")) return comingUp(r.error);
    if (!OLD_DRIVER.test(r?.error || "")) return settle(null, r?.error || phrase("the session did not answer"));
    /* a seat opened before this existed still answers the older op */
    const older = await svCmd(e, { type: "control", op: "models" });
    if (older?.ok) {
      const models = normalizeLooseModels(older.data);
      if (models.length) {
        await borrowEffortFromSettings(e);
        return settle(models);
      }
    }
    if (older?.silent) return later();
    return settle(null, phrase("this chat started before the picker existed. Close it and open it again with the same name — the conversation comes back with it."));
  });
  e.catalogPull = pull;
  return pull;
}

async function borrowEffortFromSettings(e) {
  if (e.effort || e.where !== "local" || seatAgent(e) !== "claude") return;
  const said = await fetch("/api/effort").then((r) => r.json()).catch(() => null);
  if (!said?.effort) return;
  e.effort = said.effort;
  e.effortFrom = "settings";
}

function accountReach(e) {
  if (e.mirror) return { can: false, why: phrase("this is somebody else's chat — you watch it, you do not sign it in") };
  if (e.where === "cloud") return { can: false, why: phrase("accounts live on your machine — a remote chat uses the server's own login") };
  if (e.account === undefined) return { can: false, why: phrase("this chat started before the login picker existed. Close it and open it again with the same name — the conversation comes back with it.") };
  if (e.account === null) return { can: false, why: phrase("this chat runs on a login the hive did not set up, so it will not move it") };
  return { can: true, why: "" };
}

function accountsOf(e) {
  return providerAccounts(seatAgent(e));
}

function accountRow(name, e) {
  return accountsOf(e).find((a) => (a.name === "default" ? "" : a.name) === name) || null;
}

function paintAccountPill(e) {
  const pill = e.host.querySelector(".sv-pill-account");
  if (!pill) return;
  if (!st.accountsAsked) pullAccounts();
  const reach = accountReach(e);
  pill.hidden = accountsOf(e).length < 2;
  pill.classList.toggle("off", !reach.can);
  pill.disabled = !reach.can;
  const held = reach.can ? (accountRow(e.account, e) || null) : null;
  const name = reach.can ? (held?.name || e.account || phrase("default")) : phrase("account");
  pill.innerHTML = `<svg class="mark" viewBox="0 0 16 16" aria-hidden="true"><use href="#i-user"/></svg><span class="txt"></span><span class="chev">▾</span>`;
  pill.querySelector(".txt").textContent = name;
  pill.title = reach.can
    ? [name, phrase("the {agent} login this chat runs on", { agent: providerName(seatAgent(e)) }), held?.email || ""].filter(Boolean).join(" · ")
    : reach.why;
}

function paintPills(e) {
  const host = e.host;
  const model = host.querySelector(".sv-pill-model");
  const effort = host.querySelector(".sv-pill-effort");
  paintAccountPill(e);
  if (!model || !effort) return;
  const row = catalogRow(e);
  const bare = prettyModelId(e.model);
  const name = pillLabel(row?.label) || bare.name;
  model.innerHTML = `${markOf(seatAgent(e))}<span class="txt"></span><svg class="chev" aria-hidden="true"><use href="#i-chev"/></svg>`;
  model.querySelector(".txt").textContent = name || phrase("model");
  model.title = [row?.label, row?.description].filter(Boolean).join(" · ") || e.model || phrase("the model this chat is on");
  paintFastMark(e, model);

  /* both pills stay put whatever the answer is — a control that comes and goes
     makes the footer dance and leaves you unsure the chat has one at all. */
  const levels = row?.efforts || [];
  const level = e.effort || row?.defaultEffort || "";
  const silent = !!row && !levels.length;
  effort.classList.toggle("off", silent);
  effort.disabled = silent;
  effort.innerHTML = `<span class="txt"></span><span class="dim"></span><svg class="chev" aria-hidden="true"><use href="#i-chev"/></svg>`;
  const levelSaid = silent ? phrase("thinking") : level ? titleCase(level) : phrase("default");
  const bars = st.effortStyle === "bars" && !silent && level && levels.length ? effortBars(levels, level) : null;
  if (st.effortStyle === "bars" && level && !row && !e.catalogPull && !e.catalogError && !e.draft) refreshCatalog(e);
  if (bars) effort.querySelector(".txt").replaceWith(effortBarsEl(bars, levelSaid));
  else effort.querySelector(".txt").textContent = levelSaid;
  const context = row?.context || bare.context;
  const onDefault = !silent && !e.effort && !!level;
  effort.querySelector(".dim").textContent = `${onDefault ? ` (${phrase("default")})` : ""}${context ? ` · ${context}` : ""}`;
  effort.title = silent
    ? phrase("{model} has no thinking levels to choose from", { model: name || phrase("this model") })
    : !level
      ? phrase("how hard this model thinks — this chat is on the model's own default")
      : onDefault
        ? phrase("how hard this model thinks · {level}, the model's own default", { level })
        : e.effortFrom === "settings"
          ? phrase("how hard this model thinks · {level}, inherited from your settings", { level })
          : phrase("how hard this model thinks · now on {level}", { level });
  if (e.draft && !draftCarriesEffort(e.agent, e.draftKind)) {
    effort.classList.add("off");
    effort.disabled = true;
    effort.title = phrase("how hard it thinks is picked once the chat is open");
  }
  paintModePill(e);
}

function paintModePill(e) {
  const pick = e.host.querySelector(".sv-composer .sv-pick");
  if (!pick) return;
  let pill = e.host.querySelector(".sv-pill-mode");
  if (e.mode !== "plan") { pill?.remove(); return; }
  if (!pill) {
    pill = document.createElement("button");
    pill.type = "button";
    pill.className = "sv-pill sv-pill-mode";
    pill.addEventListener("click", () => setPlanMode(e, false));
    pick.prepend(pill);
  }
  const said = phrase("Plan mode — click to return to normal build mode");
  pill.innerHTML = `<svg class="cp-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg><span class="txt">${esc(phrase("Plan"))}</span>`;
  pill.title = said;
  pill.setAttribute("aria-label", said);
  pill.setAttribute("aria-pressed", "true");
}

const PICK_FIELDS = { model: ["model"], effort: ["effort", "effortFrom"], account: ["account"] };

function pickOf(e, field) {
  e.picks ||= {};
  return (e.picks[field] ||= { rev: 0, ver: 0, pending: 0, base: null });
}

function settlePick(e, field) {
  const pick = pickOf(e, field);
  pick.ver += 1;
  pick.pending = 0;
  pick.base = null;
}

const pickPending = (e, field) => !!e.picks?.[field]?.pending;

function repaintColumnsPicker(e) {
  if (e.menu?.el?.classList.contains("cp-pick")) e.menu.repaint?.();
}

function closeSeatPicker(e) {
  if (e?.menu) e.menu = null;
  for (const stray of document.querySelectorAll(".sv-menu")) stray.remove();
  for (const lit of document.querySelectorAll(".sv-pill.open")) lit.classList.remove("open");
}

function clickLeavesPicker(target) {
  return !target?.closest?.(".sv-menu") && !target?.closest?.(".sv-pill") && !target?.closest?.(".sv-ctx");
}

const CATALOG_FRESH_FOR = 10 * 60 * 1000;

const machineCatalogs = new Map();

function knownCatalog(agent) {
  const held = machineCatalogs.get(agent);
  return held && Date.now() - held.at < CATALOG_FRESH_FOR ? held.models : null;
}

function keepCatalog(agent, models) {
  if (models?.length) machineCatalogs.set(agent, { models, at: Date.now() });
}

function refreshDraftCatalog(e) {
  const agent = seatAgent(e);
  if (!providerReady(agent)) {
    e.catalogError = providerWhyNot(agent);
    e.catalog = null;
    e.catalogPull = null;
    paintPills(e);
    e.menu?.repaint?.();
    return Promise.resolve(null);
  }
  const settle = (models, wrong) => {
    if (seatAgent(e) !== agent) return null;
    e.catalogError = wrong || "";
    e.catalog = wrong ? null : dressCatalog(e, models || []);
    e.catalogPull = wrong ? null : e.catalogPull;
    paintPills(e);
    e.menu?.repaint?.();
    return wrong ? null : e.catalog;
  };
  const known = knownCatalog(agent);
  if (known) return Promise.resolve(settle(known, ""));
  const pull = fetch(`/api/catalog?agent=${encodeURIComponent(agent)}`).then((r) => r.json()).then(
    (answer) => {
      if (!answer?.error) keepCatalog(agent, answer?.models);
      return settle(answer?.models, answer?.error || (answer?.models?.length ? "" : phrase("{agent} has no model to offer on this machine", { agent })));
    },
    () => settle(null, phrase("the app could not ask which models it can run"))
  );
  e.catalogPull = pull;
  return pull;
}

function draftTakesAgent(e, agent) {
  e.agent = agent;
  e.model = rememberedModel(agent);
  const kept = rememberedOptions(agent, e.model) || {};
  e.effort = typeof kept.effort === "string" ? kept.effort : "";
  e.effortFrom = e.effort ? "session" : "";
  e.fast = kept.fast === true;
  rememberSeatPick(e);
  e.catalog = null;
  e.catalogError = "";
  e.catalogPull = null;
  e.catalogTries = 0;
  paintPills(e);
  return refreshCatalog(e);
}

document.addEventListener("mousedown", (ev) => {
  if (!document.querySelector(".sv-menu")) return;
  if (!clickLeavesPicker(ev.target)) return;
  closeEveryPicker();
}, true);

function closeEveryPicker() {
  for (const e of structPool.values()) if (e.menu) closeSeatPicker(e);
  for (const d of drafts.values()) if (d.e.menu) closeSeatPicker(d.e);
  for (const stray of document.querySelectorAll(".sv-menu")) stray.remove();
  for (const lit of document.querySelectorAll(".sv-pill.open")) lit.classList.remove("open");
}

const PICKER_CAP = 384;

const PICKER_FLOOR = 132;

const PICKER_LIFT = 8;

const PICKER_AIR = 14;

/* the menu grows up from the composer and the seat clips whatever crosses its
   top edge. A ceiling read off the window (52vh) is taller than a small pane,
   so the first rows landed above the tile and were simply gone: the list never
   overflowed its own box, so no scrollbar ever appeared to bring them back.
   The ceiling is the room THIS seat has, and whatever still does not fit above
   the composer hangs down over it instead of off the top. */
function pickerFit(seat, bar) {
  const above = bar.top - seat.top - PICKER_AIR;
  const least = Math.min(PICKER_FLOOR, seat.height - PICKER_AIR);
  const tall = Math.max(0, Math.min(PICKER_CAP, Math.max(above, least)));
  return { tall, over: Math.max(0, tall - above) };
}

function pickerRow({ label, hint, key, on, locked }) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "sv-row" + (on ? " on" : "") + (locked ? " locked" : "");
  row.innerHTML = `<span class="tick"></span><span class="nm"><b></b><i></i></span>`;
  row.querySelector(".tick").innerHTML = on ? svgIcon("i-check") : "";
  row.querySelector(".nm b").textContent = label;
  const note = row.querySelector(".nm i");
  note.textContent = hint || "";
  if (hint) row.title = hint;
  else note.remove();
  if (key) {
    const k = document.createElement("span");
    k.className = "key";
    k.textContent = key;
    row.appendChild(k);
  }
  if (locked) row.disabled = true;
  return row;
}

function openSeatPicker(e, kind) {
  const raycast = raycastOn();
  const asked = kind;
  const columns = raycast && kind !== "account";
  const thinkingFirst = raycast && asked === "effort";
  if (thinkingFirst) kind = "model";
  if (raycast ? e.menu?.asked === asked : e.menu?.kind === kind) return void closeSeatPicker(e);
  closeSeatPicker(e);
  const composer = e.host.querySelector(".sv-composer");
  const pill = e.host.querySelector(`.sv-pill-${asked}`);
  if (!composer) return;
  const el = document.createElement("div");
  el.className = "sv-menu";
  el.innerHTML = `<div class="rail" role="tablist" hidden></div><div class="panel"><div class="q"><span class="mag"><svg aria-hidden="true"><use href="#i-mag"/></svg></span><input spellcheck="false" autocomplete="off" /></div><div class="list"></div></div>`;
  if (columns) {
    el.classList.add("cp-pick");
    el.tabIndex = -1;
    el.insertAdjacentHTML("beforeend", `<div class="fx" hidden><div class="fxh"></div><div class="fxl" role="listbox" aria-label="${esc(phrase("Thinking"))}"></div></div>`);
  } else if (raycast) {
    const keys = [["↵", phrase("picks")], ...(kind === "model" ? [["⇥", phrase("provider")]] : []), ["esc", phrase("closes")]];
    el.querySelector(".panel").insertAdjacentHTML("beforeend", `<div class="mf">${keys.map(([cap, said]) => `<span class="kr"><span class="rc-key">${cap}</span>${esc(said)}</span>`).join("")}</div>`);
  }
  const input = el.querySelector("input");
  const list = el.querySelector(".list");
  const rail = el.querySelector(".rail");
  input.placeholder = kind === "model" ? phrase("search models…")
    : kind === "account" ? phrase("which login should it use?")
    : phrase("how hard should it think?");
  for (const stray of document.querySelectorAll(".sv-menu")) stray.remove();
  for (const lit of document.querySelectorAll(".sv-pill.open")) lit.classList.remove("open");
  composer.appendChild(el);
  pill?.classList.add("open");
  /* no listener of its own: one per open is one per open to leak, and a seat view
     dropped with a picker in it left its handler on the document holding a node
     that is no longer on screen — from then on every mousedown anywhere read as
     "away" and swept the picker of whatever seat you were using. The document
     already has the one handler this needs, and it asks the pointer, not a stale
     closure. */
  /* the catalogue can arrive on a retry long after this opened, and a picker
     that only ever painted once sat on "asking this chat what it can run…"
     with the answer already in hand. */
  e.menu = raycast
    ? { kind, asked, el, repaint: () => { if (e.menu?.el === el) paint(); } }
    : { kind, el, repaint: () => { if (e.menu?.el === el) paint(); } };

  let rows = [];
  const search = el.querySelector(".q");
  let mine = seatAgent(e);
  let viewing = mine;
  const foreignCatalogs = new Map();
  const canTransfer = !e.draft && !e.mirror;
  const fetchForeignCatalog = (agent) => {
    if (foreignCatalogs.has(agent)) return;
    const known = e.where === "cloud" ? null : knownCatalog(agent);
    if (known) return void foreignCatalogs.set(agent, { models: known, error: "" });
    foreignCatalogs.set(agent, { loading: true });
    const request = e.where === "cloud"
      ? svCmd(e, { type: "control", op: "providerCatalog", agent }).then((result) => result.ok ? result.data : { error: result.error })
      : fetch(`/api/catalog?agent=${encodeURIComponent(agent)}`).then((response) => response.json());
    request.then(
      (result) => {
        if (e.where !== "cloud" && !result.error) keepCatalog(agent, result.models);
        foreignCatalogs.set(agent, { models: result.models || [], error: result.error || "" });
      },
      () => foreignCatalogs.set(agent, { error: phrase("could not load this provider's models") })
    ).finally(() => { if (e.menu?.el === el) paint(); });
  };

  if (kind === "model") {
    rail.hidden = false;
    const offered = (e.draft || canTransfer) && e.where !== "cloud" ? readyAgents(mine) : Object.keys(AGENT_NAMES);
    for (const name of Object.keys(AGENT_NAMES)) {
      if (!offered.includes(name)) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sv-rail-btn" + (name === mine ? " on" : e.draft || canTransfer ? "" : " away");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", name);
      btn.title = name === mine ? providerName(name) : e.draft ? phrase("open the chat on {agent}", { agent: providerName(name) }) : canTransfer ? phrase("continue this chat with {agent}", { agent: providerName(name) }) : phrase("{agent} — not in this chat", { agent: providerName(name) });
      btn.innerHTML = markOf(name);
      btn.addEventListener("click", () => {
        viewing = name;
        for (const other of rail.children) other.classList.toggle("on", other === btn);
        input.value = "";
        if (e.draft && name !== mine) {
          mine = name;
          btn.title = name;
          draftTakesAgent(e, name).then(() => { if (e.menu?.el === el) paint(); });
        }
        if (canTransfer && name !== mine) fetchForeignCatalog(name);
        paint();
        if (viewing === mine || canTransfer) input.focus();
      });
      rail.appendChild(btn);
    }
    if (canTransfer) for (const name of offered) if (name !== mine) fetchForeignCatalog(name);
  }

  const say = (headline, body) => {
    list.innerHTML = `<div class="empty"><b></b><span></span></div>`;
    list.querySelector("b").textContent = headline;
    const rest = list.querySelector("span");
    if (body) rest.textContent = body;
    else rest.remove();
    search.hidden = !columns;
  };

  const paint = () => {
    const heldLevel = column?.contains(document.activeElement) ? document.activeElement.dataset.level ?? null : null;
    const highlighted = columns ? rows[cursor]?.dataset.pick : undefined;
    const heldPick = columns && rows.includes(document.activeElement) ? document.activeElement.dataset.pick : null;
    if (columns) hideEffortColumn();
    paintMenu(heldLevel);
    paintModelFoot(e, el, { kind, ownAgent: viewing === mine });
    if (columns) {
      cursor = highlighted ? rows.findIndex((one) => one.dataset.pick === highlighted) : -1;
      rows[cursor]?.classList.add("cursor");
      if (heldPick) (rows.find((one) => one.dataset.pick === heldPick) || (search.hidden ? el : input)).focus();
    }
    if (columns && heldLevel !== null && (column.hidden || !el.contains(document.activeElement))) (search.hidden ? el : input).focus();
  };

  const paintMenu = (heldLevel) => {
    const q = input.value.trim().toLowerCase();
    list.style.minHeight = "";
    list.textContent = "";
    rows = [];
    search.hidden = false;
    if (kind === "model" && viewing !== mine && canTransfer) {
      const foreign = foreignCatalogs.get(viewing);
      if (!foreign || foreign.loading) return say(phrase("loading models…"));
      if (foreign.error) return say(phrase("could not load this provider's models"), foreign.error);
      if (!raycast) return paintModels(q, foreign.models, viewing);
      const head = document.createElement("div");
      head.className = "sv-xhead";
      head.innerHTML = `<b></b><span></span>`;
      head.querySelector("b").textContent = phrase("Continue on {agent}", { agent: providerName(viewing) });
      head.querySelector("span").textContent = phrase("the whole conversation goes along");
      list.appendChild(head);
      paintModels(q, foreign.models, viewing);
      const foot = document.createElement("div");
      foot.className = "sv-xfoot";
      foot.textContent = phrase("{agent} stops when the turn ends", { agent: providerName(mine) });
      list.appendChild(foot);
      return;
    }
    if (kind === "model" && viewing !== mine) {
      return say(phrase("{agent} is not in this chat", { agent: viewing }),
                 phrase("a chat is opened on one agent and stays on it. Open a new chat to work with {agent}.", { agent: viewing }));
    }
    if (kind === "account") return paintLogins();
    if (e.catalogError) return say(phrase("no picker in this chat"), e.catalogError);
    if (!e.catalog) {
      return say(phrase("asking this chat what it can run…"),
                 e.turnOpen ? phrase("it is mid-turn, so it may take a moment to answer") : "");
    }
    if (kind === "effort") paintEfforts();
    else if (columns) {
      paintModels(q);
      paintEffortColumn(heldLevel);
    } else if (raycast) {
      paintModels(q);
      if (!q) paintEfforts(true);
    } else paintModels(q);
    /* a search box over five rows is furniture */
    if (!q && rows.length < 8 && !columns) search.hidden = true;
  };

  const column = el.querySelector(".fx");
  let effortRows = [];

  const hideEffortColumn = () => {
    if (!column) return;
    column.hidden = true;
    column.querySelector(".fxl").textContent = "";
    effortRows = [];
  };

  const paintEffortColumn = (held = null) => {
    const row = catalogRow(e);
    const levels = row?.efforts || [];
    if (!column || !levels.length || (e.draft && !draftCarriesEffort(e.agent, e.draftKind))) return hideEffortColumn();
    column.hidden = false;
    column.querySelector(".fxh").textContent = pillLabel(row?.label) || prettyModelId(e.model).name || phrase("Thinking");
    const fxl = column.querySelector(".fxl");
    fxl.textContent = "";
    effortRows = [];
    const now = e.effort || row?.defaultEffort || "";
    const choices = [...(now ? [] : [{ value: "", label: phrase("Default"), own: true }]), ...levels];
    for (const lv of choices) {
      const item = pickerRow({ label: lv.own ? lv.label : titleCase(lv.label || lv.value), hint: !lv.own && lv.value === row?.defaultEffort ? phrase("Default") : "", on: lv.value === now });
      item.classList.add("effort");
      item.dataset.level = lv.value;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(lv.value === now));
      item.tabIndex = -1;
      item.addEventListener("click", () => {
        if (!lv.own) return pickEffort(lv.value);
        closeSeatPicker(e);
        e.host.querySelector(".sv-composer textarea")?.focus();
      });
      fxl.appendChild(item);
      effortRows.push(item);
    }
    if (held !== null) (effortRows.find((one) => one.dataset.level === held) || effortRows.find((one) => one.classList.contains("on")) || effortRows[0])?.focus();
  };

  const focusEfforts = () => {
    if (!effortRows.length) return false;
    (effortRows.find((one) => one.classList.contains("on")) || effortRows[0]).focus();
    return true;
  };

  const pickByNumber = (kev) => {
    const mod = applePlatform() ? kev.metaKey && !kev.ctrlKey : kev.ctrlKey && !kev.metaKey;
    if (!mod || kev.altKey || kev.shiftKey || !/^[1-9]$/.test(kev.key)) return false;
    kev.preventDefault();
    rows.filter((r) => !r.disabled)[Number(kev.key) - 1]?.click();
    return true;
  };

  const stepProvider = (kev) => {
    const mod = applePlatform() ? kev.metaKey && !kev.ctrlKey : kev.ctrlKey && !kev.metaKey;
    if (!mod || !kev.shiftKey || kev.altKey || (kev.key !== "ArrowUp" && kev.key !== "ArrowDown") || rail.hidden) return false;
    const tabs = [...rail.querySelectorAll(".sv-rail-btn")];
    if (tabs.length < 2) return false;
    kev.preventDefault();
    const at = Math.max(0, tabs.findIndex((one) => one.classList.contains("on")));
    input.value = "";
    tabs[(at + (kev.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length].click();
    input.focus();
    return true;
  };

  const modelRowKey = (kev) => {
    const at = rows.indexOf(document.activeElement);
    if (at < 0) return false;
    if (["Tab", "Enter", " "].includes(kev.key) || kev.metaKey || kev.ctrlKey || kev.altKey) return false;
    if (kev.key.length === 1) { input.focus(); return true; }
    kev.preventDefault();
    const usable = rows.filter((one) => !one.disabled);
    const here = usable.indexOf(document.activeElement);
    const go = (one) => { if (!one) return; rows[cursor]?.classList.remove("cursor"); cursor = rows.indexOf(one); one.classList.add("cursor"); one.focus(); };
    if (kev.key === "ArrowDown") go(usable[(here + 1) % usable.length]);
    else if (kev.key === "ArrowUp") go(usable[(here - 1 + usable.length) % usable.length]);
    else if (kev.key === "Home") go(usable[0]);
    else if (kev.key === "End") go(usable[usable.length - 1]);
    else if (kev.key === "ArrowRight") document.activeElement.click();
    else if (kev.key === "ArrowLeft") input.focus();
    return true;
  };

  if (columns) el.answerKey = (kev) => {
    if (pickByNumber(kev)) return true;
    if (stepProvider(kev)) return true;
    if (kev.key === "Escape" && !kev.metaKey && !kev.ctrlKey && !kev.altKey && !kev.shiftKey) {
      kev.preventDefault();
      closeSeatPicker(e);
      e.host.querySelector(".sv-composer textarea")?.focus();
      return true;
    }
    if (modelRowKey(kev)) return true;
    if (rail.contains(document.activeElement)) {
      if (["Tab", "Enter", " "].includes(kev.key) || kev.metaKey || kev.ctrlKey || kev.altKey || kev.shiftKey) return false;
      kev.preventDefault();
      const tabs = [...rail.querySelectorAll(".sv-rail-btn")];
      const at = tabs.indexOf(document.activeElement);
      if ((kev.key === "ArrowDown" || kev.key === "ArrowUp") && tabs.length) {
        const next = tabs[(at + (kev.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length];
        next.click();
        next.focus();
      } else if (kev.key === "ArrowRight") input.focus();
      return true;
    }
    if (document.activeElement === el) {
      if (kev.key === "Tab" || kev.metaKey || kev.ctrlKey || kev.altKey) return false;
      kev.preventDefault();
      if (kev.key === "ArrowRight" || kev.key === "ArrowDown") (effortRows[0] || (!search.hidden ? input : null))?.focus();
      return true;
    }
    if (!column?.contains(document.activeElement)) return false;
    const at = effortRows.indexOf(document.activeElement);
    if (["Enter", " ", "Tab"].includes(kev.key) || kev.metaKey || kev.ctrlKey || kev.altKey) return false;
    kev.preventDefault();
    if (kev.key === "Escape") { closeSeatPicker(e); e.host.querySelector(".sv-composer textarea")?.focus(); }
    else if (kev.key === "ArrowLeft") input.focus();
    else if (kev.key === "ArrowDown" || kev.key === "ArrowUp") effortRows[(Math.max(0, at) + (kev.key === "ArrowDown" ? 1 : -1) + effortRows.length) % effortRows.length]?.focus();
    else if (kev.key === "Home") effortRows[0]?.focus();
    else if (kev.key === "End") effortRows[effortRows.length - 1]?.focus();
    return true;
  };

  const paintLogins = () => {
    const reach = accountReach(e);
    if (!reach.can) return say(phrase("no login to pick here"), reach.why);
    const held = accountsOf(e);
    if (!held.length) return say(phrase("asking this machine which logins it holds…"));
    for (const a of held) {
      const value = a.name === "default" ? "" : a.name;
      const item = pickerRow({
        label: a.name,
        hint: a.loggedIn ? [a.email, a.tier].filter(Boolean).join(" · ") : accountSaid(a),
        on: value === e.account,
        locked: !a.loggedIn && !a.blind,
      });
      item.addEventListener("click", () => pickAccount(value));
      list.appendChild(item);
      rows.push(item);
    }
  };

  const paintEfforts = (inline = false) => {
    const row = catalogRow(e);
    const levels = row?.efforts || [];
    if (!levels.length) {
      if (inline) return;
      return say(phrase("nothing to choose here"), phrase("this model does not take thinking levels — it decides on its own"));
    }
    if (inline) {
      const head = document.createElement("div");
      head.className = "grp thinking";
      head.textContent = `${phrase("Thinking")} · ${row?.label || row?.value || ""}`;
      list.appendChild(head);
    }
    const now = e.effort || row?.defaultEffort || "";
    if (!now) {
      const own = pickerRow({ label: phrase("default"), hint: phrase("the model decides on its own"), on: true });
      own.addEventListener("click", () => closeSeatPicker(e));
      list.appendChild(own);
      rows.push(own);
    }
    for (const lv of levels) {
      const marks = [
        lv.description,
        lv.value === row?.defaultEffort ? phrase("the model's own default") : "",
        lv.value === now && e.effortFrom === "settings" ? phrase("from your settings") : "",
      ].filter(Boolean);
      const item = pickerRow({
        label: lv.label || lv.value,
        hint: marks.join(" · "),
        on: lv.value === now,
      });
      if (raycast) item.classList.add("effort");
      item.addEventListener("click", () => pickEffort(lv.value));
      list.appendChild(item);
      rows.push(item);
    }
  };

  const paintModels = (q, catalog = e.catalog || [], agent = mine) => {
    const all = catalog.filter((m) => {
      if (!q) return true;
      return `${m.label} ${m.value} ${m.description} ${m.group}`.toLowerCase().includes(q);
    });
    const here = catalogRow(e);
    if (raycast && !columns && agent === mine && !q && !catalog.some((m) => m.group)) {
      const head = document.createElement("div");
      head.className = "grp";
      head.textContent = `${providerName(mine)} · ${phrase("this chat")}`;
      list.appendChild(head);
    }
    const groups = new Map();
    for (const m of all) {
      const key = m.group || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    let shortcut = 0;
    for (const [name, items] of groups) {
      if (name) {
        const head = document.createElement("div");
        head.className = "grp";
        head.textContent = name;
        list.appendChild(head);
      }
      for (const m of items) {
        shortcut += 1;
        const item = pickerRow({
          label: m.label || m.value,
          hint: m.description || (m.group ? m.value : ""),
          key: columns ? (shortcut <= 9 && !q ? `${applePlatform() ? "⌘" : "Ctrl+"}${shortcut}` : "") : shortcut <= 3 && !q ? `⌃${shortcut}` : "",
          on: agent === mine && !!here && m.value === here.value,
        });
        item.dataset.pick = `${agent}:${m.value}`;
        item.addEventListener("click", () => {
          if (agent === mine) return pickModel(m.value);
          switchSeatProvider(e, agent, m.value);
          if (columns) e.host.querySelector(".sv-composer textarea")?.focus();
        });
        list.appendChild(item);
        rows.push(item);
      }
    }
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><b></b></div>`;
      list.querySelector("b").textContent = phrase("no model here matches that");
    }
  };

  /* A busy seat answers a control command only after its turn lets go, and that
     can be minutes. Waiting for the reply before moving the tick left the menu
     showing the old choice while the session had already switched — the change
     looked lost. So the pick lands on screen at once and the reply only
     reconciles: it confirms, or it puts the old value back and says why.
     Either way a model_changed event from any source has the last word. */
  const apply = (field, label, before, send, keepOpen = false) => {
    const pick = pickOf(e, field);
    const seen = Object.fromEntries(Object.keys(PICK_FIELDS).map((one) => [one, pickOf(e, one).ver]));
    if (!pick.pending) pick.base = Object.fromEntries(PICK_FIELDS[field].map((key) => [key, before[key]]));
    pick.ver += 1;
    seen[field] = pick.ver;
    pick.rev += 1;
    const rev = pick.rev;
    pick.pending = rev;
    paintPills(e);
    if (keepOpen) paint();
    else closeSeatPicker(e);
    if (label) svLine(e, "sv-meta", label);
    send().then((r) => {
      if (pick.rev !== rev) return;
      if (r?.ok) {
        if (pick.pending === rev) {
          pick.pending = 0;
          pick.base = null;
        }
        const ours = (other) => pickOf(e, other).ver === seen[other] && (other === field || !pickPending(e, other));
        if (Array.isArray(r.data?.models)) e.catalog = dressCatalog(e, r.data.models);
        if (typeof r.data?.effort === "string" && ours("effort")) e.effort = r.data.effort;
        if (r.data && "account" in r.data && ours("account")) e.account = r.data.account;
        paintPills(e);
        e.menu?.repaint?.();
        return;
      }
      if (pick.pending !== rev) return;
      /* a seat mid-turn can take longer to answer than the wait allows. Silence
         is not a refusal: the driver still has the command and will apply it,
         and its model_changed says so. Undoing the pick here is what made a
         second change look impossible — the first one kept snapping back. */
      if (r?.silent) {
        svLine(e, "sv-meta", phrase("this chat is mid-turn — the change lands as soon as it comes up for air"));
        return;
      }
      Object.assign(e, pick.base || Object.fromEntries(PICK_FIELDS[field].map((key) => [key, before[key]])));
      pick.pending = 0;
      pick.base = null;
      paintPills(e);
      e.menu?.repaint?.();
      svLine(e, "sv-meta warn", r?.error || phrase("the session did not take it"));
    });
  };

  const snapshot = () => ({ model: e.model, effort: e.effort, effortFrom: e.effortFrom, account: e.account });

  const pickForTheDraft = (patch) => {
    Object.assign(e, patch);
    rememberSeatPick(e, "effort" in patch && "model" in patch ? {} : "effort" in patch ? { effort: patch.effort } : {});
    paintPills(e);
    closeSeatPicker(e);
    e.host.querySelector(".sv-composer textarea")?.focus();
  };

  const toTheText = () => e.host.querySelector(".sv-composer textarea")?.focus();
  const nextAfterModel = () => focusEfforts() || void input.focus();

  const pickModel = (value) => {
    if (value === e.model) return void (columns ? nextAfterModel() : closeSeatPicker(e));
    if (e.draft) {
      const row = e.catalog?.find((m) => m.value === value);
      const kept = rememberedOptions(seatAgent(e), value) || {};
      const wanted = typeof kept.effort === "string" ? kept.effort : e.effort;
      const effort = row?.efforts?.some((level) => level.value === wanted) ? wanted : "";
      const patch = { model: value, effort, effortFrom: effort ? "session" : "", ...(typeof kept.fast === "boolean" ? { fast: kept.fast } : {}) };
      if (!columns) return pickForTheDraft(patch);
      Object.assign(e, patch);
      rememberSeatPick(e);
      paintPills(e);
      paint();
      nextAfterModel();
      return;
    }
    const before = snapshot();
    const custom = !!e.catalog?.find((m) => m.value === value)?.custom;
    e.model = value;
    rememberSeatPick(e);
    /* another model is another context window — the gauge below the composer
       would keep counting against the old ceiling until it asks again. */
    refreshContext(e);
    apply("model", "", before, () => svCmd(e, { type: "control", op: "setModel", model: value, ...(custom ? { custom: true } : {}) }), columns);
    if (columns) nextAfterModel();
  };

  const pickAccount = (value) => {
    if (value === e.account) return void closeSeatPicker(e);
    if (e.draft) return pickForTheDraft({ account: value });
    const before = snapshot();
    e.account = value;
    apply("account", `account → ${value || "default"}`, before,
          () => svCmd(e, { type: "control", op: "setAccount", account: value }));
  };

  const pickEffort = (level) => {
    if (level === e.effort) {
      closeSeatPicker(e);
      if (columns) toTheText();
      return;
    }
    if (e.draft) return pickForTheDraft({ effort: level, effortFrom: "session" });
    const before = snapshot();
    e.effort = level;
    e.effortFrom = "session";
    rememberSeatPick(e, { effort: level });
    apply("effort", "", before, () => svCmd(e, { type: "control", op: "setEffort", level }));
    if (columns) toTheText();
  };

  let cursor = -1;
  const moveCursor = (step) => {
    if (!rows.length) return;
    rows[cursor]?.classList.remove("cursor");
    cursor = (cursor + step + rows.length) % rows.length;
    rows[cursor].classList.add("cursor");
    rows[cursor].scrollIntoView({ block: "nearest" });
  };

  input.addEventListener("input", () => { cursor = -1; paint(); });
  input.addEventListener("keydown", (kev) => {
    kev.stopPropagation();
    if (kev.key === "Escape") { kev.preventDefault(); closeSeatPicker(e); e.host.querySelector(".sv-composer textarea")?.focus(); return; }
    const bare = !kev.metaKey && !kev.ctrlKey && !kev.altKey && !kev.shiftKey;
    if (columns && bare && kev.key === "ArrowRight" && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
      const highlighted = rows[cursor];
      if (highlighted && !highlighted.disabled) { kev.preventDefault(); return void highlighted.click(); }
      if (viewing !== mine) return;
      kev.preventDefault();
      return void focusEfforts();
    }
    if (columns && bare && kev.key === "ArrowLeft" && input.selectionStart === 0 && input.selectionEnd === 0 && !rail.hidden) {
      const on = rail.querySelector(".sv-rail-btn.on") || rail.querySelector(".sv-rail-btn");
      if (on) { kev.preventDefault(); on.focus(); return; }
    }
    if (kev.key === "ArrowDown") { kev.preventDefault(); return moveCursor(1); }
    if (kev.key === "ArrowUp") { kev.preventDefault(); return moveCursor(-1); }
    if (kev.key === "Enter") { kev.preventDefault(); return void (rows[cursor] || rows[0])?.click(); }
    if (columns && kev.key === "Tab") {
      if (!kev.shiftKey || rail.hidden) return;
      const on = rail.querySelector(".sv-rail-btn.on") || rail.querySelector(".sv-rail-btn");
      if (on) { kev.preventDefault(); on.focus(); }
      return;
    }
    if (raycast && kev.key === "Tab" && !rail.hidden && rail.children.length > 1) {
      kev.preventDefault();
      const tabs = [...rail.children];
      const at = tabs.findIndex((one) => one.classList.contains("on"));
      return void tabs[(at + (kev.shiftKey ? tabs.length - 1 : 1)) % tabs.length].click();
    }
    if (kev.ctrlKey && /^[123]$/.test(kev.key)) {
      const target = rows.filter((r) => !r.disabled)[Number(kev.key) - 1];
      if (target) { kev.preventDefault(); target.click(); }
    }
  });

  const fitToSeat = () => {
    const seat = e.host.getBoundingClientRect();
    const bar = composer.getBoundingClientRect();
    if (!seat.height || !bar.height) return;
    const { tall, over } = pickerFit(seat, bar);
    el.style.maxHeight = `${tall}px`;
    el.style.bottom = over ? `${composer.clientHeight + PICKER_LIFT - over}px` : "";
  };

  paint();
  fitToSeat();
  input.focus();
  if (columns && thinkingFirst) focusEfforts();
  else if (thinkingFirst) list.querySelector(".grp.thinking")?.scrollIntoView({ block: "start" });
  refreshCatalog(e, !!e.catalog).then(() => { if (e.menu?.el === el) paint(); });
}

if (typeof window !== "undefined") {
  window.addEventListener("keydown", (kev) => {
    const menu = document.activeElement?.closest?.(".sv-menu.cp-pick");
    if (typeof menu?.answerKey === "function" && menu.answerKey(kev) === true) kev.stopImmediatePropagation();
  }, true);
}

const PILL_COMMANDS = new Set(["account"]);

const NATIVE_COMMANDS = new RegExp(`^/(${NATIVE_COMMAND_NAMES.filter((one) => !PILL_COMMANDS.has(one)).join("|")})(?:\\s+(.+))?$`);

function cmdCardModel(card) {
  const s = structuredClone(card.s);
  return {
    ...s,
    dismiss: phrase("dismiss"),
    config: s.config && { ...s.config, rows: s.config.rows.map((row) => ({ ...row, opts: row.opts && row.opts.map((value) => ({ key: value, value, sel: card.picked.get(row.name) === value })) })) }
  };
}

const paintCmdCard = (card, patch) => {
  Object.assign(card.s, patch);
  card.view.show(cmdCardModel(card));
};

function setConfig(card, key, value) {
  const turn = (card.turns.get(key)?.turn || 0) + 1;
  card.turns.set(key, { turn, marked: 0 });
  card.picked.delete(key);
  paintCmdCard(card, {});
  svCmd(card.e, { type: "say", text: `/config ${key}=${value}` }).then((r) => {
    const sent = card.turns.get(key);
    if (!r?.ok || turn <= sent.marked) return;
    sent.marked = turn;
    if (card.s.config?.rows.find((row) => row.name === key)?.opts?.includes(value)) card.picked.set(key, value);
    paintCmdCard(card, {});
  });
}

async function compactFromCard(card) {
  const go = (label, busy) => paintCmdCard(card, { context: { ...card.s.context, go: { label, busy } } });
  go(phrase("compacting…"), true);
  const r = await svCmd(card.e, { type: "control", op: "compact", focus: "" });
  if (r?.ok) return go(r.data?.queued ? phrase("queued — runs when this turn ends") : phrase("compact asked"), true);
  go(phrase("compact now"), false);
  const msg = r?.error || phrase("failed");
  svLine(card.e, "sv-meta warn", OLD_DRIVER.test(msg) ? phrase("this seat's driver is older than the native commands — close the seat and reopen it with the same name; resume keeps the conversation") : msg);
}

function svCmdCard(e, title) {
  const card = { e, picked: new Map(), turns: new Map(), s: { title, asking: phrase("asking the session…"), state: "asking", warn: "", mcp: [], agents: [], config: null, context: null } };
  card.view = commandCardView(cmdCardModel(card), {
    dismiss: () => card.view.close(),
    authenticate: (name, row) => mcpAuthenticate(e, name, row, (cls, text) => {
      svLine(e, cls, text);
      card.view.close();
    }),
    configSet: (key, value) => setConfig(card, key, value),
    configLine: (pair) => svCmd(e, { type: "say", text: `/config ${pair}` }).then((r) => !!r?.ok),
    compact: () => compactFromCard(card)
  });
  const el = card.view.el;
  const grow = new ResizeObserver(() => {
    if (e.atBottom && el.isConnected) e.scroll.scrollTop = e.scroll.scrollHeight;
  });
  grow.observe(el);
  svAppend(e, el);
  e.atBottom = true;
  const pin = () => { if (e.atBottom && el.isConnected) e.scroll.scrollTop = e.scroll.scrollHeight; };
  pin();
  requestAnimationFrame(pin);
  setTimeout(pin, 120);
  setTimeout(pin, 400);
  return card;
}

async function loadMcpBody(e, card, fail) {
  const r = await svCmd(e, { type: "control", op: "mcp" });
  if (!r?.ok) return fail(r?.error);
  const mcp = (r.data || []).map((s, at) => ({
    key: String(at),
    name: s.name,
    dot: (s.status === "failed" && raycastOn() ? "var(--red)" : MCP_DOT[s.status]) || "var(--txt-3)",
    status: phrase(MCP_STATUS_WORDS[s.status] || s.status) + (s.tools?.length ? ` · ${s.tools.length} tools` : ""),
    error: s.error || "",
    auth: s.status === "needs-auth" ? phrase("authenticate") : ""
  }));
  if (!mcp.length) return fail(phrase("this session has no MCP servers"));
  paintCmdCard(card, { state: "mcp", mcp });
}

const MCP_STATUS_WORDS = { connected: "connected", "needs-auth": "needs authorization", failed: "failed", pending: "connecting", disabled: "turned off" };
const MCP_DOT = { connected: "var(--green)", "needs-auth": "var(--yellow)", failed: "var(--accent)", pending: "var(--txt-3)", disabled: "var(--line-3)" };

/* the mode lives in the claude driver: no other program has a setMode behind it, so on a codex or
   kimi seat the command could only fail with the driver's own words. It says so itself instead. */
const CLAUDE_ONLY_COMMANDS = new Set(["config", "agents", "plane-mode"]);

const CONTEXT_TONES = ["var(--accent)", "var(--txt-2)", "var(--txt-3)", "var(--accent-d)"];

function contextTones(u) {
  const used = (u.categories || []).filter((c) => c.tokens && !/free/i.test(c.name) && (!c.kind || c.kind === "used"));
  const parts = used.map((c, at) => ({ c, tone: CONTEXT_TONES[at % CONTEXT_TONES.length] }));
  const free = Math.max(0, (u.maxTokens ?? 0) - (u.totalTokens ?? 0));
  return { parts, free: free ? phrase("free {n}k", { n: Math.round(free / 1000) }) : "" };
}

function contextColors(u) {
  const used = (u.categories || []).filter((c) => c.tokens && (!c.kind || c.kind === "used"));
  return { parts: used.map((c) => ({ c, tone: c.color || "var(--blue)" })), free: "" };
}

function contextOf(u) {
  const { parts, free } = raycastOn() ? contextTones(u) : contextColors(u);
  return {
    segments: parts.map(({ c, tone }, at) => ({ key: String(at), width: `${(c.tokens / Math.max(1, u.maxTokens)) * 100}%`, tone, title: `${c.name}: ${c.tokens.toLocaleString()} tokens` })),
    legend: parts.map(({ c, tone }, at) => ({ key: String(at), tone, text: `${c.name} ${Math.round(c.tokens / 1000)}k` })),
    free,
    meta: `${(u.totalTokens ?? 0).toLocaleString()} of ${(u.maxTokens ?? 0).toLocaleString()} tokens · ${Math.round(u.percentage ?? 0)}% · ${u.model || ""}`,
    go: { label: phrase("compact now"), busy: false }
  };
}

async function setPlanMode(e, on) {
  const r = await svCmd(e, { type: "control", op: "setMode", mode: on ? "plan" : "normal" });
  if (r?.ok) { e.mode = r.data?.mode === "plan" ? "plan" : ""; paintPills(e); }
  return r;
}

async function runNativeCommand(e, cmd, arg) {
  if (CLAUDE_ONLY_COMMANDS.has(cmd) && seatAgent(e) !== "claude") {
    svLine(e, "sv-meta warn", phrase("/{cmd} is Claude Code's own — {agent} has nothing behind it here", { cmd, agent: seatAgent(e) }));
    return;
  }
  if (cmd === "model" && arg) {
    const row = modelNamed((await refreshCatalog(e)) || e.catalog, arg);
    if (!row) {
      const said = arg.length > 40 ? `${arg.slice(0, 40)}…` : arg;
      svLine(e, "sv-meta warn", phrase("no model here goes by \"{name}\" — the picker has the ones that do", { name: said }));
      return;
    }
    const r = await svCmd(e, { type: "control", op: "setModel", model: row.value });
    if (r?.ok) {
      e.model = r.data?.model || row.value;
      if (typeof r.data?.effort === "string") e.effort = r.data.effort;
      if (Array.isArray(r.data?.models)) e.catalog = r.data.models;
      paintPills(e);
    }
    if (!r?.ok) svLine(e, "sv-meta warn", r?.error || phrase("failed"));
    return;
  }
  if (cmd === "effort" && arg) {
    const r = await svCmd(e, { type: "control", op: "setEffort", level: arg });
    if (r?.ok) {
      e.effort = r.data?.effort ?? arg;
      if (Array.isArray(r.data?.models)) e.catalog = r.data.models;
      paintPills(e);
    }
    if (!r?.ok) svLine(e, "sv-meta warn", r?.error || phrase("failed"));
    return;
  }
  if (cmd === "plane-mode") {
    const off = /^(off|no|nao|não|sair|desliga)$/i.test(String(arg || "").trim());
    const r = await setPlanMode(e, !off);
    const said = off
      ? phrase("plane mode off — this chat works as it did before")
      : phrase("plane mode on — it plans, and nothing runs until you approve");
    svLine(e, r?.ok ? "sv-meta" : "sv-meta warn", r?.ok ? said : r?.error || phrase("failed"));
    return;
  }
  if (cmd === "fresh") return void startFresh(e);
  if (cmd === "compact") {
    const r = await svCmd(e, { type: "control", op: "compact", focus: arg || "" });
    if (r?.ok) {
      svLine(e, "sv-meta", r.data?.queued ? phrase("compact queued — it runs when this turn ends") : phrase("compact asked"));
      return;
    }
    const msg = r?.error || phrase("failed");
    svLine(e, "sv-meta warn", OLD_DRIVER.test(msg) ? phrase("this seat's driver is older than the native commands — close the seat and reopen it with the same name; resume keeps the conversation") : msg);
    return;
  }
  /* typing the command lands in the same picker the pill opens */
  if (cmd === "model" || cmd === "effort" || cmd === "account") return void openSeatPicker(e, cmd);
  const card = svCmdCard(e, "/" + cmd);
  const fail = (msg) => {
    const text = /unknown command control/.test(msg || "")
      ? phrase("this seat's driver is older than the native commands — close the seat and reopen it with the same name; resume keeps the conversation")
      : msg || phrase("the session did not answer");
    paintCmdCard(card, { state: "warn", warn: text });
  };
  if (cmd === "mcp") {
    await loadMcpBody(e, card, fail);
    return;
  }
  if (cmd === "agents") {
    const r = await svCmd(e, { type: "control", op: "agents" });
    if (!r?.ok) return fail(r?.error);
    const agents = (r.data || []).map((a, at) => ({ key: String(at), name: a.name || a.agentType || "?", about: (a.whenToUse || a.description || "").slice(0, 160) }));
    if (!agents.length) return fail(phrase("this session has no agents"));
    paintCmdCard(card, { state: "agents", agents });
    return;
  }
  if (cmd === "config") {
    paintCmdCard(card, { state: "" });
    const styles = await svCmd(e, { type: "control", op: "styles" });
    const seatStyles = styles?.ok ? styles.data : null;
    const CONFIG_KEYS = [
      { key: "autoCompact", opts: ["true", "false"], about: "compact the conversation on its own when it grows" },
      { key: "thinking", opts: ["true", "false"], about: "stream the model's thinking" },
      { key: "verbose", opts: ["true", "false"], about: "full command output instead of summaries" },
      { key: "recap", opts: ["true", "false"], about: "a recap at the end of long turns" },
      { key: "checkpoints", opts: ["true", "false"], about: "file checkpoints, so a turn can be rewound" },
      { key: "turnDuration", opts: ["true", "false"], about: "say how long each turn took" },
      { key: "outputStyle", opts: seatStyles?.available?.length ? seatStyles.available : ["default", "Proactive", "Concise", "Explanatory", "Learning"], about: "how the answers are written", now: seatStyles?.current || "" },
      { key: "language", opts: null, about: "the language Claude answers in — pt-BR, en, …" },
    ];
    for (const def of CONFIG_KEYS) if (def.now && def.opts?.includes(def.now)) card.picked.set(def.key, def.now);
    paintCmdCard(card, {
      state: "config",
      config: {
        rows: CONFIG_KEYS.map((def) => ({ key: def.key, name: def.key, about: phrase(def.about), opts: def.opts })),
        freeHint: phrase("anything else: key=value — the session confirms in the transcript"),
        apply: phrase("apply"),
        note: phrase("each change answers in the transcript · model, effort and mcp have their own cards · theme and the other terminal looks live in the TUI only")
      }
    });
    return;
  }
  if (cmd === "context") {
    const r = await svCmd(e, { type: "control", op: "context" });
    if (!r?.ok) return fail(r?.error);
    paintCmdCard(card, { state: "context", context: contextOf(r.data || {}) });
    return;
  }
}

async function structuredCtrlC(e) {
  const now = Date.now();
  if (now - (e.ctrlCAt || 0) < 2000) {
    e.ctrlCAt = 0;
    await fetch("/api/kill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: e.name, where: e.where }) });
    forgetSeat(e.name);
    closeTile();
    pull();
    return;
  }
  e.ctrlCAt = now;
  interruptStructured(e);
}

function svUserThumb(e, bubble, path) {
  return svConvThumb(e, bubble, path);
}

export { REVIEW_ASK, referenceLine, askOnTheElement, frameIsUpFront, frameKey, seatActsWhereThePersonLooks, frameOfTab, frameTheSeatDrives, letDrivenTabSleep, noPageOf, seatSeesItsOwnTab, shotReady, shutByThePerson, tabOfSeatDriving, wakeDrivenTab, wokeForAShot, paintPagePins, paintPageFaces, standOnThePage, tabOfFrame, threadLine, threadsOnThePage, watchPagePins, AGENT_NAMES, CATALOG_RETRY_CAP, CLAUDE_ONLY_COMMANDS, CATALOG_RETRY_STEP, CATALOG_TRIES, DEVICE_BEAT, DEVICE_RETRY, DRIVING_LINGER, FRAME_BEAT, FRAME_WAIT, HARNESS_NOTES, MCP_DOT, MODEL_WORDS, NATIVE_COMMANDS, NO_PAGE, OLD_DRIVER, PAGE_BEAT, PAGE_SLEEP_AFTER, PHONE_NAMES, PR_LINK, QUESTION_CLOSERS, SHELF_TAB, SKILL_BODY, STILL_COMING_UP, SYNTHETIC_TAGS, THREAD_LINK, VIDEO_STEP, VIDEO_WAIT, WEB_TAB_CAP, accountReach, accountRow, addWebTab, applePlatform, artifactTabOf, askAboutArtifactTab, askDeviceFrame, askWhichPhone, bootDevice, bornWebFrame, borrowEffortFromSettings, browserAnswer, browserApplied, browserShot, canWatchVideo, canopy, catalogRow, catchUpArtifact, clickLeavesPicker, closeBrowser, closeCockpit, closeDevice, closeEveryPicker, closeSeatPicker, closeWebTab, cockpitPaneOf, cockpitUrlOf, codecOfSps, deviceAct, deviceApplied, deviceCall, deviceCanvasOf, deviceClock, deviceFrameLanded, deviceFrameUrlOf, deviceKeyOf, deviceOfSeat, devicePaneOf, deviceSaid, deviceScreenOf, deviceVideoLanded, draftCarriesEffort, driveBrowsers, drivenTab, drivingNow, drivingPaint, frameOfSeat, frameUrlOf, giveUpVideo, goToThread, gotoWeb, h264Pictures, h264Units, homeOfLink, inThePage, joinBytes, landSeatOn, leavesForTheBrowser, markArtRows, markDriving, markOf, mcpAuthenticate, modelNamed, nalTypeOf, normalizeLooseModels, openArtifactTab, openArtifactUrl, openBrowser, openCockpit, openDevice, openKeptPage, openOutside, openPopupTab, openPrLink, openSeatPicker, openThreadLink, openWebPage, pageDozing, pageOfSeat, pagesMark, pagesOfChat, paintAccountPill, paintArtifactChrome, paintCanopyOfChat, paintCockpitOfChat, paintDeviceChipOfChat, paintDeviceOfChat, paintDrivingSoon, paintFrontsOfChat, paintMentions, paintPills, paintWebChipOfChat, paintWebOfChat, paintYards, pathOfPreview, phonesToBoot, pickerFit, pickerRow, pillLabel, placeYard, pointOnDevice, prKeyOf, pullPages, questionCard, reachInPage, refreshCanopy, refreshCatalog, registerPr, registerThread, runBrowserChoose, runBrowserClick, runBrowserConsole, runBrowserHover, runBrowserCookies, runBrowserEval, runBrowserKey, runBrowserMap, runBrowserNetwork, runBrowserProfile, runBrowserSetCookie, runBrowserShot, runBrowserStep, runBrowserTabs, runBrowserType, runBrowserUpload, runBrowserViewport, runBrowserWait, runNativeCommand, sayOnDevice, seatAgent, sendDevicePrint, sendPageQuote, setPlanMode, sendPickReference, sendScreenPrint, sendScreenReview, setWebPick, shelfLinkOf, shelfTabAddress, shelfTabOf, shelvePreviews, showingArtifact, someoneReadingAPage, startDevice, startDeviceVideo, stepWeb, stopDeviceFrames, stopDeviceVideo, stopFrameLoop, structuredCtrlC, svAlreadyPainted, svAssistant, svCmdCard, svShellBlock, svDraftPaint, svEvent, svFoldedNote, svPeerFrom, svQuestionCard, svStreamDelta, svSynthetic, svUser, svUserText, svUserThumb, tabsSaid, tabTheSeatDrives, tapDevice, threadKeyOf, titleCase, toggleWebPick, touchWeb, waitForRegistered, wantShelfIndex, videoNeverCame, watchDevice, weaveHandles, webAddress, webDriving, webOfSeat, webPaneOf, webPick, webSeq, webStateOf, webTabNow, webTabsIn, webTouch, webYards, wireLinks, withoutVariant, yardOf };
