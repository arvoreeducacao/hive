import { phrase } from "./core.js";
import { svCmd } from "./chat-stretches.js";
import { svConvAppendAfter } from "./conversation-model.js";
import { appVariables, liveTheme, makeAppFrame } from "./page-dress.js";

const PROTOCOL_VERSION = "2026-01-26";
const APP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const APP_MIN_HEIGHT = 80;
const APP_MAX_HEIGHT = 2000;
const APP_DEFAULT_HEIGHT = 320;
const APP_MAX_PENDING = 8;
const APP_ARGUMENTS_SHOWN = 600;

const isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);

const clampHeight = (raw) => {
  const height = Number(raw);
  return Number.isFinite(height) && height > 0 ? Math.round(Math.min(APP_MAX_HEIGHT, Math.max(APP_MIN_HEIGHT, height))) : APP_DEFAULT_HEIGHT;
};

function createAppHost({ hostContext, toolCall, post, callTool, readResource, openLink, sendMessage, requestDisplayMode, onSize, onTeardown }) {
  let initialized = false;
  let toolCallSent = false;
  let pending = 0;
  let disposed = false;
  let declaredModes;
  const send = (message) => { if (!disposed) post(message); };
  const notify = (method, params) => send({ jsonrpc: "2.0", method, params });
  const respond = (id, result) => send({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
  const answer = (id, run) => {
    if (pending >= APP_MAX_PENDING) return fail(id, -32000, "Too many requests in flight.");
    pending += 1;
    Promise.resolve().then(run).then(
      (result) => { pending -= 1; respond(id, result ?? {}); },
      (error) => { pending -= 1; fail(id, -32000, String(error?.message || error)); }
    );
  };
  const sendToolCall = () => {
    if (!initialized || toolCallSent) return;
    toolCallSent = true;
    notify("ui/notifications/tool-input", { arguments: isObject(toolCall?.arguments) ? toolCall.arguments : {} });
    if (toolCall?.result) notify("ui/notifications/tool-result", toolCall.result);
  };
  const requests = {
    "ui/initialize": (id, params) => {
      const modes = params?.appCapabilities?.availableDisplayModes;
      declaredModes = Array.isArray(modes) ? modes.filter((mode) => typeof mode === "string") : undefined;
      respond(id, {
        protocolVersion: PROTOCOL_VERSION,
        hostInfo: { name: "hive", version: "1" },
        hostCapabilities: { openLinks: {}, serverTools: {}, serverResources: {}, logging: {}, message: { text: {} } },
        hostContext: hostContext()
      });
    },
    ping: (id) => respond(id, {}),
    "tools/call": (id, params) => {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (typeof name !== "string" || !name.trim() || !isObject(args)) return fail(id, -32602, "tools/call needs a tool name and object arguments.");
      answer(id, () => callTool({ name, arguments: args }));
    },
    "resources/read": (id, params) => {
      if (typeof params?.uri !== "string" || !params.uri.trim()) return fail(id, -32602, "resources/read needs a uri.");
      answer(id, () => readResource({ uri: params.uri }));
    },
    "ui/open-link": (id, params) => {
      if (typeof params?.url !== "string" || !/^https?:\/\//i.test(params.url)) return fail(id, -32602, "Only http(s) links can be opened.");
      answer(id, () => openLink(params.url).then(() => ({})));
    },
    "ui/message": (id, params) => {
      const blocks = Array.isArray(params?.content) ? params.content : [params?.content];
      const texts = blocks.map((block) => (isObject(block) && block.type === "text" && typeof block.text === "string" ? block.text : null));
      const text = texts.includes(null) ? "" : texts.join("\n").trim();
      if (params?.role !== "user" || !text) return fail(id, -32602, "Only text messages from the user role are supported.");
      answer(id, () => sendMessage(text).then(() => ({})));
    },
    "ui/request-display-mode": (id, params) => {
      const current = hostContext().displayMode;
      const mode = params?.mode;
      const allowed = typeof mode === "string" && hostContext().availableDisplayModes.includes(mode) && (!declaredModes || declaredModes.includes(mode));
      if (!allowed || mode === current) return respond(id, { mode: current });
      answer(id, () => requestDisplayMode(mode).then((result) => ({ mode: result })));
    }
  };
  const notifications = {
    "ui/notifications/initialized": () => {
      if (initialized) return;
      initialized = true;
      sendToolCall();
    },
    "ui/notifications/size-changed": (params) => {
      if (typeof params?.height === "number") onSize(params.height);
    },
    "ui/notifications/request-teardown": () => onTeardown()
  };
  return {
    receive(data) {
      if (disposed || !isObject(data) || data.jsonrpc !== "2.0" || typeof data.method !== "string") return;
      const params = isObject(data.params) ? data.params : {};
      const known = typeof data.id === "string" || typeof data.id === "number";
      if (known) {
        const run = requests[data.method];
        if (!run) return fail(data.id, -32601, `Method not found: ${data.method}`);
        return run(data.id, params);
      }
      notifications[data.method]?.(params);
    },
    contextChanged(changes) {
      if (initialized) notify("ui/notifications/host-context-changed", changes);
    },
    dispose() {
      disposed = true;
    }
  };
}

const liveApps = new Set();

function heardApp(event) {
  for (const app of [...liveApps]) {
    if (!app.frame.isConnected) continue;
    if (event.source && event.source === app.frame.contentWindow) return app.host?.receive(event.data);
  }
}

let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("message", heardApp);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const full = [...liveApps].find((app) => app.mode === "fullscreen");
    if (!full) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    full.setMode("inline");
  }, true);
}

const argumentsShown = (args) => {
  const text = JSON.stringify(args ?? {}, null, 2);
  return text.length > APP_ARGUMENTS_SHOWN ? `${text.slice(0, APP_ARGUMENTS_SHOWN)}…` : text;
};

function askInCard(card, { title, detail, yes }) {
  const box = card.querySelector(".sv-mcp-app-ask");
  if (!box.hidden) return Promise.reject(new Error("Another request is waiting for the person."));
  box.querySelector(".sv-mcp-app-ask-title").textContent = title;
  const said = box.querySelector(".sv-mcp-app-ask-detail");
  said.textContent = detail || "";
  said.hidden = !detail;
  const allow = box.querySelector(".sv-mcp-app-ask-yes");
  const deny = box.querySelector(".sv-mcp-app-ask-no");
  allow.textContent = yes;
  deny.textContent = phrase("Not now");
  box.hidden = false;
  allow.focus();
  return new Promise((resolve) => {
    const settle = (approved) => {
      box.hidden = true;
      allow.onclick = null;
      deny.onclick = null;
      resolve(approved);
    };
    allow.onclick = () => settle(true);
    deny.onclick = () => settle(false);
  });
}

async function driverSays(e, cmd) {
  const said = await svCmd(e, { type: "control", ...cmd });
  if (!said?.ok) throw new Error(said?.error || phrase("this chat did not answer the app"));
  return said.data;
}

const clickedInside = (frame) => document.activeElement === frame && navigator.userActivation?.isActive !== false;

function appCard(app) {
  const card = document.createElement("div");
  card.className = "sv-mcp-app";
  card.dataset.state = "loading";
  if (app.prefersBorder) card.dataset.border = "1";
  card.innerHTML = `<div class="sv-mcp-app-box"><div class="sv-mcp-app-head"><svg aria-hidden="true"><use href="#i-grid"/></svg><span class="sv-mcp-app-title"></span><span class="sv-mcp-app-server"></span><button type="button" class="sv-mcp-app-grow"><svg aria-hidden="true"><use href="#i-expand"/></svg></button></div>`
    + `<div class="sv-mcp-app-stage"></div><div class="sv-mcp-app-ask" role="alertdialog" hidden><b class="sv-mcp-app-ask-title"></b><pre class="sv-mcp-app-ask-detail"></pre><div class="sv-mcp-app-ask-row"><button type="button" class="sv-mcp-app-ask-no"></button><button type="button" class="sv-mcp-app-ask-yes"></button></div></div>`
    + `<p class="sv-mcp-app-note"></p></div>`;
  card.querySelector(".sv-mcp-app-title").textContent = app.title || app.tool;
  card.querySelector(".sv-mcp-app-server").textContent = phrase("{server} app", { server: app.server });
  card.querySelector(".sv-mcp-app-note").textContent = phrase("opening the app…");
  return card;
}

function appNote(card, text) {
  card.dataset.state = "bad";
  const note = card.querySelector(".sv-mcp-app-note");
  note.hidden = false;
  note.textContent = text;
}

async function fetchApp(e, id, part) {
  const asked = new URLSearchParams({ name: String(e.name || ""), where: String(e.where || "local"), id, ...(part ? { part } : {}) });
  const res = await fetch(`/api/render/app?${asked}`);
  if (!res.ok) throw new Error(res.status === 404 ? phrase("this app is no longer on disk") : `HTTP ${res.status}`);
  return part === "meta" ? res.json() : res.text();
}

function mountApp(e, card, meta, html) {
  const box = card.querySelector(".sv-mcp-app-box");
  const stage = card.querySelector(".sv-mcp-app-stage");
  const grow = card.querySelector(".sv-mcp-app-grow");
  const theme = liveTheme(card);
  const frame = makeAppFrame(html, { title: phrase("{server} app", { server: meta.server }), theme, csp: meta.csp, permissions: meta.permissions });
  frame.style.height = `${APP_DEFAULT_HEIGHT}px`;
  const live = { frame, host: null, mode: "inline", setMode: null };
  const fullscreenWorks = typeof box.showPopover === "function";
  if (fullscreenWorks) box.setAttribute("popover", "manual");
  const context = () => ({
    theme: theme.tone,
    styles: { variables: appVariables(theme) },
    displayMode: live.mode,
    availableDisplayModes: fullscreenWorks ? ["inline", "fullscreen"] : ["inline"],
    containerDimensions: live.mode === "fullscreen" ? { width: frame.clientWidth, height: frame.clientHeight } : { width: stage.clientWidth || card.clientWidth, maxHeight: APP_MAX_HEIGHT },
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: "desktop",
    userAgent: "hive",
    deviceCapabilities: { touch: matchMedia("(pointer: coarse)").matches, hover: matchMedia("(hover: hover)").matches },
    toolInfo: { tool: { name: meta.tool, title: meta.title } }
  });
  live.setMode = (mode) => {
    if (mode === live.mode || !fullscreenWorks) return live.mode;
    live.mode = mode;
    card.dataset.mode = mode;
    if (mode === "fullscreen") box.showPopover();
    else if (box.matches(":popover-open")) box.hidePopover();
    grow.querySelector("use")?.setAttribute("href", mode === "fullscreen" ? "#i-x" : "#i-expand");
    grow.setAttribute("aria-label", mode === "fullscreen" ? phrase("Exit full screen") : phrase("Open full screen"));
    grow.title = grow.getAttribute("aria-label");
    live.host?.contextChanged({ displayMode: mode, containerDimensions: context().containerDimensions });
    if (mode === "inline") grow.focus();
    return mode;
  };
  grow.setAttribute("aria-label", phrase("Open full screen"));
  grow.title = phrase("Open full screen");
  grow.hidden = !fullscreenWorks;
  grow.addEventListener("click", () => live.setMode(live.mode === "fullscreen" ? "inline" : "fullscreen"));
  const toolCall = { arguments: meta.input, result: meta.result };
  const start = () => {
    live.host?.dispose();
    live.host = createAppHost({
      hostContext: context,
      toolCall,
      post: (message) => frame.contentWindow?.postMessage(message, "*"),
      callTool: async ({ name, arguments: args }) => {
        const tool = await driverSays(e, { op: "mcpAppTool", app: meta.id, tool: name });
        if (!tool.callable) throw new Error(phrase("{server} does not let its app run {tool}", { server: meta.server, tool: name }));
        if (!tool.readOnly) {
          const approved = await askInCard(card, { title: phrase("Allow {server} to run {tool}?", { server: meta.server, tool: tool.title || name }), detail: argumentsShown(args), yes: phrase("Allow") });
          if (!approved) throw new Error("Declined by the person.");
        }
        return driverSays(e, { op: "mcpAppCall", app: meta.id, tool: name, arguments: args });
      },
      readResource: ({ uri }) => driverSays(e, { op: "mcpAppRead", app: meta.id, uri }),
      openLink: async (url) => {
        if (!clickedInside(frame)) throw new Error("Links open only from a click in the app.");
        window.open(url, "_blank", "noopener,noreferrer");
      },
      sendMessage: async (text) => {
        if (typeof e.type !== "function") throw new Error("Messages cannot be sent from here.");
        const approved = await askInCard(card, { title: phrase("Send this message from {server}?", { server: meta.server }), detail: text, yes: phrase("Send") });
        if (!approved) throw new Error("Declined by the person.");
        e.type(text);
      },
      requestDisplayMode: async (mode) => (mode === "fullscreen" && !clickedInside(frame) ? live.mode : live.setMode(mode)),
      onSize: (height) => { frame.style.height = `${clampHeight(height)}px`; },
      onTeardown: () => live.setMode("inline")
    });
  };
  frame.addEventListener("load", start);
  stage.textContent = "";
  stage.appendChild(frame);
  liveApps.add(live);
  card.dataset.state = "ready";
  card.querySelector(".sv-mcp-app-note").hidden = true;
  listen();
  return live;
}

async function svMcpApp(e, ev) {
  const app = ev?.app;
  if (!app || !APP_ID.test(String(app.id || ""))) return null;
  const card = appCard(app);
  const anchor = e.tools?.get(ev.tool_use_id);
  const toolRow = anchor?.kind === "tool" ? anchor : null;
  if (toolRow) toolRow.keep = true;
  svConvAppendAfter(e, toolRow, card);
  try {
    const [meta, html] = await Promise.all([fetchApp(e, app.id, "meta"), fetchApp(e, app.id)]);
    return mountApp(e, card, meta, html);
  } catch (error) {
    appNote(card, `${phrase("the app did not open")} · ${String(error?.message || error).slice(0, 200)}`);
    return null;
  }
}

export { createAppHost, svMcpApp };
