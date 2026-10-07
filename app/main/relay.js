const { createHash } = require("node:crypto");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const SUN_PATH_CEILING = 100;

function socketPathFor({ home, platform = process.platform, hub = "", short = tmpdir() } = {}) {
  if (platform === "win32") {
    const mark = createHash("sha256").update(String(hub || home || "hive")).digest("hex").slice(0, 12);
    return `\\\\.\\pipe\\hive-${mark}`;
  }
  const wanted = join(home, "hive.sock");
  if (Buffer.byteLength(wanted) <= SUN_PATH_CEILING) return wanted;
  const mark = createHash("sha256").update(wanted).digest("hex").slice(0, 12);
  return join(short, `hive-${mark}.sock`);
}

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "content-encoding", "content-length"
]);

const SCHEME = "hive";
const SHELF_SCHEME = "shelf";
const SHELF_SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const HOST = "app";
const HOME_PAGE = `${SCHEME}://${HOST}/`;

function pathOf(rawUrl) {
  const raw = String(rawUrl);
  if (raw.startsWith("/")) return raw;
  const url = new URL(raw);
  return `${url.pathname}${url.search}`;
}

function headersToSend(headers) {
  const out = {};
  for (const [key, value] of headers) {
    const low = String(key).toLowerCase();
    if (low === "host" || low === "origin" || low === "referer" || HOP_BY_HOP.has(low)) continue;
    out[low] = value;
  }
  return out;
}

function headersToAnswer(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const low = String(key).toLowerCase();
    if (HOP_BY_HOP.has(low)) continue;
    out[low] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return out;
}

function isNamedPipe(path) {
  return String(path).startsWith("\\\\.\\pipe\\");
}

function socketUrlFor(socketPath, rawUrl) {
  /* the "ws" package parses this address with the WHATWG URL parser before
     splitting it back apart on the colon — a named pipe's backslashes are not
     valid authority syntax there, so "//" (which asks for an authority) has to
     stay out; without it the whole thing lands in the URL's opaque path and
     the backslashes survive untouched */
  const slashes = isNamedPipe(socketPath) ? "" : "//";
  return `ws+unix:${slashes}${socketPath}:${pathOf(rawUrl)}`;
}

function registerScheme() {
  const { protocol } = require("electron");
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
    },
    {
      scheme: SHELF_SCHEME,
      privileges: { standard: true, secure: true, stream: true }
    }
  ]);
}

function shelfPagePath(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl)); } catch { return null; }
  if (url.protocol !== `${SHELF_SCHEME}:`) return null;
  if (!SHELF_SLUG.test(url.hostname)) return null;
  if (url.pathname && url.pathname !== "/") return null;
  const asked = new URLSearchParams({ slug: url.hostname });
  for (const key of ["tab", "v"]) {
    const value = url.searchParams.get(key);
    if (value) asked.set(key, value);
  }
  return `/api/shelf/page?${asked}`;
}

function serveShelfPages(session, socketPath) {
  try { session.protocol.unhandle(SHELF_SCHEME); } catch {}
  session.protocol.handle(SHELF_SCHEME, (request) => {
    if (request.method !== "GET") return new Response("the shelf only answers GET", { status: 405 });
    const path = shelfPagePath(request.url);
    if (!path) return new Response("that is not a page on the shelf", { status: 404 });
    return askTheSocket({ url: path, method: "GET", headers: new Map() }, socketPath)
      .catch((wrong) => new Response(`the hive server is not answering: ${wrong.message}`, { status: 502 }));
  });
}

async function askTheSocket(request, socketPath) {
  const http = require("node:http");
  const { Readable } = require("node:stream");
  const body = ["GET", "HEAD"].includes(request.method) ? null : Buffer.from(await request.arrayBuffer());
  const headers = headersToSend(request.headers);
  if (body) headers["content-length"] = String(body.length);
  return new Promise((answer, fail) => {
    const out = http.request({ socketPath, path: pathOf(request.url), method: request.method, headers }, (res) => {
      answer(new Response(res.statusCode === 204 || res.statusCode === 304 ? null : Readable.toWeb(res), {
        status: res.statusCode,
        headers: headersToAnswer(res.headers)
      }));
    });
    out.on("error", fail);
    out.end(body || undefined);
  });
}

function serveOverSocket(socketPath) {
  const { protocol } = require("electron");
  protocol.handle(SCHEME, (request) => askTheSocket(request, socketPath).catch((wrong) =>
    new Response(`the hive server is not answering: ${wrong.message}`, { status: 502 })));
}

const linkKey = (page, id) => `${page}\u0000${id}`;

function wireTerminals({ ipcMain, socketPath }) {
  const WebSocket = require("ws");
  const links = new Map();

  const drop = (key) => {
    const held = links.get(key);
    if (!held) return;
    links.delete(key);
    try { held.link.close(); } catch {}
  };

  const dropPagesBefore = (sender, page) => {
    for (const [key, held] of [...links]) if (held.sender === sender && held.page !== page) drop(key);
  };

  ipcMain.on("hive:open", (event, id, rawUrl, page) => {
    dropPagesBefore(event.sender, page);
    const key = linkKey(page, id);
    drop(key);
    const speak = (channel, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, id, payload, page);
    };
    let link;
    try { link = new WebSocket(socketUrlFor(socketPath, rawUrl)); } catch (wrong) { return speak("hive:error", wrong.message); }
    links.set(key, { link, sender: event.sender, page });
    link.on("open", () => speak("hive:open"));
    link.on("message", (raw, binary) => speak("hive:data", binary ? raw : raw.toString()));
    link.on("close", () => { if (links.get(key)?.link === link) links.delete(key); speak("hive:close"); });
    link.on("error", (wrong) => speak("hive:error", wrong.message));
  });

  ipcMain.on("hive:send", (_event, id, text, page) => {
    const held = links.get(linkKey(page, id));
    if (held && held.link.readyState === 1) held.link.send(text);
  });

  ipcMain.on("hive:close", (_event, id, page) => drop(linkKey(page, id)));
  return { links, drop };
}

module.exports = { SUN_PATH_CEILING, socketPathFor, SCHEME, SHELF_SCHEME, SHELF_SLUG, HOST, HOME_PAGE, shelfPagePath, serveShelfPages, pathOf, headersToSend, headersToAnswer, socketUrlFor, isNamedPipe, HOP_BY_HOP, registerScheme, serveOverSocket, askTheSocket, wireTerminals };
