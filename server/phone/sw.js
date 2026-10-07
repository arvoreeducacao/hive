const SHELL = "hive-phone-shell-v15";
const NAMES_CACHE = "hive-phone-names";
const NAMES_FILE = "/phone/names.json";
const DB = "hive-phone";
const KEPT = "kept";
const FILES = ["/phone/", "/phone/index.html", "/phone/app.js", "/phone/manifest.webmanifest", "/phone/icon.svg", "/phone/icon-180.png", "/phone/icon-512.png", "/phone/avatar.mjs", "/phone/markdown.mjs", "/phone/crypto.mjs", "/phone/device.mjs"];
const PAGE_PREFIX = "/phone/page/";
const PAGES_KEPT = 12;
const PAGE_POLICY = "sandbox allow-scripts allow-forms; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-ancestors 'self'";
const pages = new Map();

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((one) => one !== SHELL && one !== NAMES_CACHE).map((one) => caches.delete(one)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  const said = event.data || {};
  if (said.page?.id && typeof said.page.html === "string") {
    pages.set(said.page.id, said.page.html);
    while (pages.size > PAGES_KEPT) pages.delete(pages.keys().next().value);
    event.source?.postMessage({ kept: said.page.id });
  }
  if (said.forget) pages.delete(said.forget);
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith(PAGE_PREFIX)) {
    const html = pages.get(url.pathname.slice(PAGE_PREFIX.length));
    event.respondWith(html === undefined
      ? new Response("that page is not held here any more", { status: 404, headers: { "content-type": "text/plain" } })
      : new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_POLICY, "x-content-type-options": "nosniff" } }));
    return;
  }
  if (event.request.method !== "GET" || !FILES.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).then((fresh) => {
    const copy = fresh.clone();
    caches.open(SHELL).then((cache) => cache.put(event.request, copy)).catch(() => {});
    return fresh;
  }).catch(() => caches.match(event.request)));
});

function fromB64(text) {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) out[at] = binary.charCodeAt(at);
  return out;
}

function keptInDb(key) {
  return new Promise((done) => {
    let asked;
    try { asked = indexedDB.open(DB, 1); } catch { return done(undefined); }
    asked.onerror = () => done(undefined);
    asked.onsuccess = () => {
      const db = asked.result;
      let req;
      try { req = db.transaction(KEPT, "readonly").objectStore(KEPT).get(key); } catch { return done(undefined); }
      req.onsuccess = () => done(req.result);
      req.onerror = () => done(undefined);
    };
  });
}

async function openNotice(said) {
  const box = said.n;
  const seat = String(said.seat || "");
  if (!box?.keyId || !box?.nonce || !box?.ct || !seat) return null;
  try {
    const keys = (await keptInDb("seatKeys")) || {};
    const raw = keys[seat]?.[box.keyId];
    if (!raw) return null;
    const key = await crypto.subtle.importKey("raw", fromB64(raw), { name: "AES-GCM" }, false, ["decrypt"]);
    const aad = new TextEncoder().encode(`${seat}|notice|${said.seq}|${box.keyId}`);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.nonce), additionalData: aad }, key, fromB64(box.ct));
    const held = JSON.parse(new TextDecoder().decode(plain));
    return held && typeof held === "object" ? held : null;
  } catch {
    return null;
  }
}

async function whatToSay(said) {
  const seat = String(said.seat || "");
  let held = {};
  try {
    const kept = await (await caches.open(NAMES_CACHE)).match(new Request(NAMES_FILE));
    if (kept) held = await kept.json();
  } catch {}
  const words = held.words || {};
  const line = await openNotice(said);
  const more = Number(said.more) || 0;
  const rest = more ? (words.more || "").replace("{n}", String(more)) : "";
  const body = [line?.text || (said.wake === "needs" ? words.needs || "" : words.done || ""), rest].filter(Boolean).join("\n");
  return { seat, title: line?.title || held.names?.[seat] || words.chat || "Hive", body };
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let said = {};
    try { said = event.data ? event.data.json() : {}; } catch {}
    const line = await whatToSay(said);
    await self.registration.showNotification(line.title, { body: line.body, tag: `seat-${line.seat}`, data: { seat: line.seat }, icon: "/phone/icon-180.png", badge: "/phone/icon-180.png" });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const seat = event.notification.data?.seat || "";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const open = clients.find((one) => one.url.includes("/phone"));
    if (open) { open.focus(); open.postMessage({ open: seat }); return; }
    return self.clients.openWindow(`/phone/${seat ? `?open=${encodeURIComponent(seat)}` : ""}`);
  }));
});
