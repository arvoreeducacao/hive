import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SYNC_PREFIX = "/sync";
export const PHONE_PREFIX = "/phone";
export const BODY_CEILING = 8 << 20;
export const CURSORS_CEILING = 1 << 20;
export const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".css": "text/css",
  ".woff2": "font/woff2"
};

const here = dirname(fileURLToPath(import.meta.url));
const phoneDir = join(here, "..", "phone");

const PHONE_FILES = {
  "/": join(phoneDir, "index.html"),
  "/index.html": join(phoneDir, "index.html"),
  "/app.js": join(phoneDir, "app.js"),
  "/sw.js": join(phoneDir, "sw.js"),
  "/manifest.webmanifest": join(phoneDir, "manifest.webmanifest"),
  "/icon.svg": join(phoneDir, "icon.svg"),
  "/icon-180.png": join(phoneDir, "icon-180.png"),
  "/icon-512.png": join(phoneDir, "icon-512.png"),
  "/avatar.mjs": join(phoneDir, "avatar.mjs"),
  "/markdown.mjs": join(phoneDir, "markdown.mjs"),
  "/device.mjs": join(here, "device.mjs"),
  "/crypto.mjs": join(here, "crypto.mjs")
};

export const phoneFiles = () => Object.keys(PHONE_FILES);

export function phoneFile(pathname) {
  const rel = pathname === PHONE_PREFIX ? "/" : pathname.slice(PHONE_PREFIX.length);
  const file = PHONE_FILES[rel];
  if (!file || !existsSync(file) || !statSync(file).isFile()) return null;
  return { file, type: TYPES[extname(file)] || "application/octet-stream" };
}

function readBody(request, ceiling = BODY_CEILING) {
  return new Promise((resolve, reject) => {
    const pieces = [];
    let size = 0;
    request.on("data", (chunk) => { size += chunk.length; if (size <= ceiling) pieces.push(chunk); });
    request.on("end", () => (size > ceiling ? reject(new Error("that body is too big")) : resolve(Buffer.concat(pieces).toString("utf8"))));
    request.on("error", reject);
  });
}

export function isSyncPath(pathname) {
  return pathname === SYNC_PREFIX || pathname.startsWith(`${SYNC_PREFIX}/`) || pathname === PHONE_PREFIX || pathname.startsWith(`${PHONE_PREFIX}/`);
}

export async function serveSync(broker, request, response, url, { log = () => {} } = {}) {
  if (url.pathname === PHONE_PREFIX || url.pathname.startsWith(`${PHONE_PREFIX}/`)) {
    if (request.method !== "GET" && request.method !== "HEAD") { response.writeHead(405); response.end(); return true; }
    const found = phoneFile(url.pathname);
    if (!found) { response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "no such route" })); return true; }
    const headers = { "content-type": found.type, "cache-control": "no-store", "x-content-type-options": "nosniff" };
    if (found.type.startsWith("text/html")) headers["content-security-policy"] = "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; manifest-src 'self'; worker-src 'self'";
    response.writeHead(200, headers);
    response.end(request.method === "HEAD" ? undefined : readFileSync(found.file));
    return true;
  }
  const path = url.pathname === SYNC_PREFIX ? "/" : url.pathname.slice(SYNC_PREFIX.length);
  const query = url.search.slice(1);
  if (path === "/stream" && (request.method === "GET" || request.method === "POST")) {
    let cursors = "";
    if (request.method === "POST") {
      try {
        cursors = await readBody(request, CURSORS_CEILING);
      } catch (wrong) {
        response.writeHead(413, { "content-type": "application/json", connection: "close" });
        response.end(JSON.stringify({ error: wrong.message }));
        return true;
      }
    }
    const sink = {
      head: (status, headers) => response.writeHead(status, headers),
      write: (text) => response.write(text),
      end: () => response.end(),
      onClose: (cb) => { request.on("close", cb); response.on("close", cb); response.on("error", cb); }
    };
    await broker.stream({ path, method: request.method, query, headers: request.headers, body: cursors }, sink);
    return true;
  }
  let body = "";
  try {
    if (request.method !== "GET" && request.method !== "HEAD") body = await readBody(request);
  } catch (wrong) {
    response.writeHead(413, { "content-type": "application/json", connection: "close" });
    response.end(JSON.stringify({ error: wrong.message }));
    return true;
  }
  let out;
  try {
    out = await broker.answer({ method: request.method, path, query, headers: request.headers, body });
  } catch (wrong) {
    log(`sync: ${path} stumbled: ${wrong.message}`);
    out = { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "the hive stumbled on that one" }) };
  }
  response.writeHead(out.status, out.headers);
  response.end(out.body);
  return true;
}

export function localFetch(broker) {
  const encoder = new TextEncoder();
  return async (url, init = {}) => {
    const parsed = new URL(String(url), "http://sync");
    const path = parsed.pathname.startsWith(SYNC_PREFIX) ? parsed.pathname.slice(SYNC_PREFIX.length) || "/" : parsed.pathname;
    const query = parsed.search.slice(1);
    const headers = {};
    for (const [key, value] of Object.entries(init.headers || {})) headers[key.toLowerCase()] = value;
    const method = String(init.method || "GET").toUpperCase();
    if (path === "/stream" && (method === "GET" || method === "POST")) {
      let status = 200;
      let heads = {};
      const closers = [];
      let ready;
      let controller = null;
      const opened = new Promise((done) => { ready = done; });
      const stream = new ReadableStream({
        start(given) {
          controller = given;
          const sink = {
            head: (code, given) => { status = code; heads = given; ready(); },
            write: (text) => { try { controller.enqueue(encoder.encode(text)); } catch {} },
            end: () => { try { controller.close(); } catch {} },
            onClose: (cb) => closers.push(cb)
          };
          broker.stream({ path, method, query, headers, body: init.body ? String(init.body) : "" }, sink);
        },
        cancel() { for (const cb of closers) cb(); }
      });
      init.signal?.addEventListener("abort", () => { for (const cb of closers) cb(); try { controller?.error(new Error("the stream was closed by this side")); } catch {} });
      await opened;
      return new Response(stream, { status, headers: heads });
    }
    const out = await broker.answer({ method, path, query, headers, body: init.body ? String(init.body) : "" });
    return new Response(out.body, { status: out.status, headers: out.headers });
  };
}
