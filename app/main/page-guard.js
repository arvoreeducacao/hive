const PAGES_PARTITION = "hive-pages";
const PAGE_DOCUMENT = "about:srcdoc";
const PAGE_ORIGIN = "null";
const QUIET_SCHEMES = new Set(["data:", "blob:", "about:"]);
const OPEN_SCHEMES = new Set(["https:", "wss:"]);
const LOCAL_NAMES = [/^localhost$/, /\.localhost$/, /\.local$/, /\.internal$/, /\.lan$/, /\.home\.arpa$/];

function ipv4Local(host) {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const [a, b] = parts.map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function ipv6Local(host) {
  if (!host.includes(":")) return null;
  const bare = host.toLowerCase();
  if (bare === "::" || bare === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(bare);
  if (mapped) return ipv4Local(mapped[1]) !== false;
  if (/^::ffff:/.test(bare)) return true;
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(bare);
}

function isLocalHost(rawHost) {
  const host = String(rawHost || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  const four = ipv4Local(host);
  if (four !== null) return four;
  const six = ipv6Local(host);
  if (six !== null) return six;
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  return LOCAL_NAMES.some((name) => name.test(host));
}

function pageMayNotReach(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl)); } catch { return true; }
  if (QUIET_SCHEMES.has(url.protocol)) return false;
  if (!OPEN_SCHEMES.has(url.protocol)) return true;
  return isLocalHost(url.hostname);
}

function insidePage(frame) {
  try {
    for (let at = frame; at; at = at.parent) {
      if (at.url === PAGE_DOCUMENT && at.origin === PAGE_ORIGIN) return true;
    }
  } catch {}
  return false;
}

function guardPageFrames(contents) {
  contents.on("will-frame-navigate", (event) => {
    if (event.isMainFrame || !insidePage(event.frame)) return;
    if (/^about:(srcdoc|blank)$/.test(String(event.url || ""))) return;
    event.preventDefault();
  });
}

function guardDefaultSession(defaultSession) {
  defaultSession.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, answer) => {
    answer({ cancel: insidePage(details.frame) && pageMayNotReach(details.url) });
  });
}

function guardPagesSession(pages) {
  pages.setPermissionRequestHandler((_contents, _permission, grant) => grant(false));
  pages.setPermissionCheckHandler(() => false);
  pages.webRequest.onBeforeRequest({ urls: ["<all_urls>"] }, (details, answer) => answer({ cancel: pageMayNotReach(details.url) }));
  pages.on("will-download", (event) => event.preventDefault());
}

function lockPageGuest(guest) {
  guest.setWebRTCIPHandlingPolicy("disable_non_proxied_udp");
  guest.setWindowOpenHandler(() => ({ action: "deny" }));
  guest.on("will-navigate", (event) => event.preventDefault());
  guest.on("will-redirect", (event) => event.preventDefault());
  guest.on("will-frame-navigate", (event) => { if (!event.isMainFrame) event.preventDefault(); });
}

module.exports = { PAGES_PARTITION, guardDefaultSession, guardPageFrames, guardPagesSession, insidePage, isLocalHost, lockPageGuest, pageMayNotReach };
