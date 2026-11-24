import { apiPost, phrase } from "./core.js";
import { svAppend } from "./structured-seats.js";
import { ESCAPE_MESSAGE, HEIGHT_MESSAGE, MEASURE, dressPage, liveTheme, makePageFrame, previewStage, themeFor } from "./page-dress.js";

const PAGE_TOOL = /^(mcp__)?hive(__|:)html_render$/i;
const PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAGE_MIN_HEIGHT = 80;
const PAGE_MAX_HEIGHT = 2000;
const PAGE_DEFAULT_HEIGHT = 480;
const PAGE_MAX_FIT = 20000;
const PAGE_MAX_TITLE = 200;
const GROWTH_WINDOW_MS = 3000;
const GROWTH_STEPS = 12;
const PREVIEW_PARTITION = "hive-pages";
const PREVIEW_CAPTURE_MAX = 4000;
const PREVIEW_SETTLE_MS = 400;
const PREVIEW_GIVE_UP_MS = 30000;
const PREVIEW_REMEMBERED = 100;
const CONSOLE_LEVELS = ["log", "info", "warning", "error"];
const OWN_CONSOLE = /^Unrecognized Content-Security-Policy directive 'webrtc'\.$/;

const isPageTool = (name) => PAGE_TOOL.test(String(name || ""));

const fitHeight = (height) => Math.min(PAGE_MAX_FIT, Math.max(PAGE_MIN_HEIGHT, Math.ceil(height)));

function readRenderAnswer(text) {
  let said;
  try { said = JSON.parse(String(text || "")); } catch { return null; }
  const page = said?.render;
  if (!page || !PAGE_ID.test(String(page.id || ""))) return null;
  const title = String(page.title || "").replace(/\s+/g, " ").trim().slice(0, PAGE_MAX_TITLE) || "HTML";
  const height = Math.min(PAGE_MAX_HEIGHT, Math.max(PAGE_MIN_HEIGHT, Math.round(Number(page.height)) || PAGE_DEFAULT_HEIGHT));
  return { id: page.id, title, height };
}

const resultText = (content) => (typeof content === "string"
  ? content
  : (Array.isArray(content) ? content : []).map((part) => (part?.type === "text" ? part.text : "")).join("\n"));

const liveFrames = new Set();
const growthOf = new WeakMap();

let openViewer = null;

function grewTooOften(frame, now) {
  const width = frame.clientWidth;
  const was = growthOf.get(frame);
  const steps = was && was.width === width ? was.steps.filter((at) => now - at < GROWTH_WINDOW_MS) : [];
  steps.push(now);
  growthOf.set(frame, { width, steps });
  return steps.length > GROWTH_STEPS;
}

function fitFrame(frame, reported) {
  const height = Number(reported);
  if (!Number.isFinite(height) || height <= 0 || frame.dataset.fit !== "1") return;
  const fitted = fitHeight(height);
  const was = parseFloat(frame.style.height) || 0;
  if (fitted > was && grewTooOften(frame, Date.now())) {
    frame.dataset.fit = "held";
    frame.style.height = `${Math.min(Math.max(was, PAGE_MIN_HEIGHT), PAGE_MAX_HEIGHT)}px`;
    return;
  }
  frame.style.height = `${fitted}px`;
}

function heardPage(ev) {
  const kind = ev.data?.type;
  if (kind === ESCAPE_MESSAGE) {
    if (openViewer && ev.source && ev.source === openViewer.frame.contentWindow) closeViewer();
    return;
  }
  if (kind !== HEIGHT_MESSAGE) return;
  for (const frame of liveFrames) {
    if (!frame.isConnected || frame.contentWindow !== ev.source) continue;
    fitFrame(frame, ev.data.height);
    return;
  }
}

let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("message", heardPage);
}

function pageFrame(html, { title, height, fit, escape = false, theme }) {
  listen();
  const frame = makePageFrame(html, { title, theme: theme || liveTheme(null), report: fit, escape });
  frame.dataset.fit = fit ? "1" : "";
  if (fit) frame.style.height = `${height}px`;
  liveFrames.add(frame);
  return frame;
}

function forgetFrames(root) {
  for (const frame of root.querySelectorAll("iframe.sv-page-frame")) liveFrames.delete(frame);
}

function closeViewer() {
  const viewer = openViewer;
  if (!viewer) return;
  openViewer = null;
  for (const one of viewer.quieted) one.inert = false;
  forgetFrames(viewer.node);
  viewer.node.remove();
  if (viewer.back?.isConnected) viewer.back.focus();
}

function openFullPage(row) {
  if (!row.pageHtml) return;
  closeViewer();
  const node = document.createElement("div");
  node.className = "sv-page-viewer";
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  node.setAttribute("aria-label", row.pageTitle || "HTML");
  node.innerHTML = `<div class="sv-page-viewer-bar"><span class="sv-page-viewer-title"></span><button type="button" class="sv-page-viewer-close"></button></div><div class="sv-page-viewer-stage"></div>`;
  node.querySelector(".sv-page-viewer-title").textContent = row.pageTitle || "HTML";
  const close = node.querySelector(".sv-page-viewer-close");
  close.textContent = phrase("Close");
  close.addEventListener("click", closeViewer);
  const frame = pageFrame(row.pageHtml, { title: row.pageTitle || "HTML", height: 0, fit: false, escape: true });
  node.querySelector(".sv-page-viewer-stage").appendChild(frame);
  const quieted = [...document.body.children].filter((one) => !one.inert);
  for (const one of quieted) one.inert = true;
  openViewer = { node, frame, quieted, back: row.querySelector(".sv-page-grow") };
  document.body.appendChild(node);
  close.focus();
}

function viewerKeys(event) {
  if (!openViewer) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    closeViewer();
  }
  return true;
}

window.addEventListener("keydown", (event) => { if (viewerKeys(event)) event.stopImmediatePropagation(); }, true);

function svPageRow(e, block, live) {
  const row = document.createElement("div");
  row.className = "sv-page";
  row.dataset.page = "1";
  row.dataset.state = live ? "drawing" : "waiting";
  row.innerHTML = `<div class="sv-page-stage"></div><button type="button" class="sv-page-grow" hidden><svg aria-hidden="true"><use href="#i-expand"/></svg></button><p class="sv-page-note"></p>`;
  const grow = row.querySelector(".sv-page-grow");
  grow.setAttribute("aria-label", phrase("Open full screen"));
  grow.title = phrase("Open full screen");
  grow.addEventListener("click", () => openFullPage(row));
  row.querySelector(".sv-page-note").textContent = phrase("drawing the page…");
  e.tools.set(block.id, row);
  svAppend(e, row);
  return row;
}

function svPageFailed(row, reason) {
  row.dataset.state = "bad";
  row.querySelector(".sv-page-grow").hidden = true;
  const note = row.querySelector(".sv-page-note");
  note.hidden = false;
  note.textContent = reason ? `${phrase("the page did not show")} · ${reason.slice(0, 200)}` : phrase("the page did not show");
}

async function svPageLanded(e, row, block) {
  const text = resultText(block.content);
  if (block.is_error) return svPageFailed(row, text.replace(/\s+/g, " ").trim());
  const page = readRenderAnswer(text);
  if (!page) return svPageFailed(row, "");
  row.dataset.state = "drawing";
  row.pageTitle = page.title;
  const asked = new URLSearchParams({ name: String(e.name || ""), where: String(e.where || "local"), id: page.id });
  let html = "";
  try {
    const res = await fetch(`/api/render/page?${asked}`);
    if (!res.ok) throw new Error(res.status === 404 ? phrase("this page is no longer on disk") : `HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    return svPageFailed(row, String(err?.message || err));
  }
  row.pageHtml = html;
  const stage = row.querySelector(".sv-page-stage");
  forgetFrames(stage);
  stage.textContent = "";
  stage.appendChild(pageFrame(html, { title: page.title, height: page.height, fit: true, theme: liveTheme(row) }));
  row.dataset.state = "ready";
  row.querySelector(".sv-page-note").hidden = true;
  row.querySelector(".sv-page-grow").hidden = false;
}

const previewsDone = [];
let previewing = "";

const inTheApp = () => /Electron/i.test(navigator.userAgent) && !new URLSearchParams(location.search).get("seat") && !document.hidden;

function levelOf(raw) {
  if (typeof raw === "string") return CONSOLE_LEVELS.includes(raw) ? raw : raw === "warn" ? "warning" : "log";
  return CONSOLE_LEVELS[Math.min(3, Math.max(0, Number(raw) || 0))];
}

const dataUrlOf = (html) => {
  const bytes = new TextEncoder().encode(html);
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return `data:text/html;charset=utf-8;base64,${btoa(binary)}`;
};

function drawOffScreen({ html, width, appearance }) {
  return new Promise((resolve, reject) => {
    const stage = document.createElement("webview");
    stage.setAttribute("partition", PREVIEW_PARTITION);
    stage.className = "sv-page-preview-stage";
    stage.setAttribute("aria-hidden", "true");
    stage.style.width = `${width}px`;
    stage.style.height = "800px";
    const said = [];
    let over = false;
    const finish = (settle, value) => {
      if (over) return;
      over = true;
      clearTimeout(giveUp);
      stage.remove();
      settle(value);
    };
    const giveUp = setTimeout(() => finish(reject, new Error("the page never finished loading")), PREVIEW_GIVE_UP_MS);
    stage.addEventListener("console-message", (ev) => {
      const text = String(ev.message || "");
      if (said.length < 50 && !OWN_CONSOLE.test(text)) said.push({ level: levelOf(ev.level), text: text.slice(0, 2000) });
    });
    stage.addEventListener("did-fail-load", (ev) => {
      if (ev.isMainFrame === false || ev.errorCode === -3) return;
      finish(reject, new Error(ev.errorDescription || "the page did not load"));
    });
    stage.addEventListener("did-stop-loading", () => setTimeout(async () => {
      try {
        const contentHeight = Math.max(1, Number(await stage.executeJavaScript(MEASURE)) || 1);
        const capturedHeight = Math.min(PREVIEW_CAPTURE_MAX, contentHeight);
        stage.style.height = `${capturedHeight}px`;
        await new Promise((done) => setTimeout(done, PREVIEW_SETTLE_MS));
        const shot = await stage.capturePage();
        if (shot.isEmpty()) throw new Error("the page gave back an empty frame");
        finish(resolve, { image: shot.toDataURL(), contentHeight, capturedHeight, console: said });
      } catch (err) {
        finish(reject, err);
      }
    }, PREVIEW_SETTLE_MS), { once: true });
    stage.setAttribute("src", dataUrlOf(previewStage(html, appearance, themeFor(appearance))));
    document.body.appendChild(stage);
  });
}

async function takePreview(job) {
  let said;
  try {
    const res = await fetch(`/api/render/preview/source?id=${encodeURIComponent(job.id)}`);
    if (!res.ok) return;
    const html = await res.text();
    said = await drawOffScreen({ html, width: job.width, appearance: job.appearance });
  } catch (err) {
    said = { error: String(err?.message || err) };
  }
  await apiPost("/api/render/preview/result", { id: job.id, ...said }).catch(() => {});
}

async function takePagePreviews(jobs) {
  if (previewing || !inTheApp() || !Array.isArray(jobs)) return;
  const job = jobs.find((one) => one && typeof one.id === "string" && !previewsDone.includes(one.id));
  if (!job) return;
  previewing = job.id;
  previewsDone.push(job.id);
  if (previewsDone.length > PREVIEW_REMEMBERED) previewsDone.shift();
  try { await takePreview(job); } finally { previewing = ""; }
}

export { isPageTool, readRenderAnswer, svPageLanded, svPageRow, takePagePreviews };
