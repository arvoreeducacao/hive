import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PAGES_PARTITION, guardDefaultSession, guardPageFrames, guardPagesSession, insidePage, isLocalHost, lockPageGuest, pageMayNotReach } = require("../main/page-guard.js");

const appFrame = { url: "hive://app/", origin: "hive://app", parent: null };
const pageFrame = { url: "about:srcdoc", origin: "null", parent: appFrame };
const shelfFrame = { url: "hive://app/api/shelf/page?slug=x", origin: "null", parent: appFrame };
const nestedFrame = { url: "https://example.com/", origin: "https://example.com", parent: pageFrame };

function navigation(details) {
  let prevented = false;
  return { ...details, preventDefault: () => { prevented = true; }, get prevented() { return prevented; } };
}

test("a page reaches public https and nothing of this machine or its network", () => {
  for (const url of ["https://cdn.jsdelivr.net/npm/chart.js", "wss://stream.example.com/x", "data:image/png;base64,AA==", "blob:null/1", "about:blank", "https://8.8.8.8/"]) {
    assert.equal(pageMayNotReach(url), false, url);
  }
  for (const url of ["http://example.com", "ws://example.com", "hive://app/api/state", "file:///etc/hosts", "https://localhost:3000", "https://app.localhost", "https://127.0.0.1:8790", "https://2130706433/", "https://0x7f000001/", "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://10.1.2.3", "https://172.16.0.1", "https://192.168.1.1", "https://169.254.169.254/latest", "https://100.64.0.1", "https://printer.local", "https://db.internal", "not a url"]) {
    assert.equal(pageMayNotReach(url), true, url);
  }
  assert.equal(isLocalHost("example.com"), false);
  assert.equal(isLocalHost("[fd00::1]"), true);
});

test("only frames that live inside a page are held to the page's rules", () => {
  assert.equal(insidePage(pageFrame), true);
  assert.equal(insidePage(nestedFrame), true, "a frame the page embeds is the page too");
  assert.equal(insidePage(appFrame), false);
  assert.equal(insidePage(shelfFrame), false, "the shelf pane keeps its own rules");
  assert.equal(insidePage(null), false);
  assert.equal(insidePage({ get url() { throw new Error("gone"); } }), false);
});

test("a page frame never navigates anywhere, so no request leaves before the policy sees the answer", () => {
  const contents = new EventEmitter();
  guardPageFrames(contents);
  const away = navigation({ isMainFrame: false, frame: pageFrame, url: "http://127.0.0.1:8790/api/state" });
  contents.emit("will-frame-navigate", away);
  assert.equal(away.prevented, true);
  const outside = navigation({ isMainFrame: false, frame: pageFrame, url: "https://example.com/" });
  contents.emit("will-frame-navigate", outside);
  assert.equal(outside.prevented, true, "not even to a public site");
  const redraw = navigation({ isMainFrame: false, frame: pageFrame, url: "about:srcdoc" });
  contents.emit("will-frame-navigate", redraw);
  assert.equal(redraw.prevented, false, "the app may draw the page again");
  const shelf = navigation({ isMainFrame: false, frame: shelfFrame, url: "hive://app/api/shelf/page?slug=y" });
  contents.emit("will-frame-navigate", shelf);
  assert.equal(shelf.prevented, false);
  const app = navigation({ isMainFrame: true, frame: appFrame, url: "hive://app/?seat=x" });
  contents.emit("will-frame-navigate", app);
  assert.equal(app.prevented, false);
});

test("requests from a page frame to this machine are cancelled, and the app's own requests pass", () => {
  let listener = null;
  guardDefaultSession({ webRequest: { onBeforeRequest: (filter, fn) => { assert.deepEqual(filter, { urls: ["<all_urls>"] }); listener = fn; } } });
  const answer = (details) => { let said = null; listener(details, (value) => { said = value; }); return said; };
  assert.deepEqual(answer({ url: "http://127.0.0.1:8790/api/say", frame: pageFrame }), { cancel: true });
  assert.deepEqual(answer({ url: "https://localhost:5173/", frame: nestedFrame }), { cancel: true });
  assert.deepEqual(answer({ url: "https://cdn.example.com/chart.js", frame: pageFrame }), { cancel: false });
  assert.deepEqual(answer({ url: "http://localhost:3000/shot.png", frame: appFrame }), { cancel: false }, "a chat may still show a dev server's picture");
  assert.deepEqual(answer({ url: "http://localhost:3000/x", frame: null }), { cancel: false });
});

test("the preview's own partition grants nothing, downloads nothing and reaches nothing local", () => {
  const seen = {};
  const pages = new EventEmitter();
  pages.setPermissionRequestHandler = (fn) => { seen.request = fn; };
  pages.setPermissionCheckHandler = (fn) => { seen.check = fn; };
  pages.webRequest = { onBeforeRequest: (filter, fn) => { seen.requests = fn; } };
  guardPagesSession(pages);
  let granted = null;
  seen.request(null, "media", (value) => { granted = value; });
  assert.equal(granted, false);
  assert.equal(seen.check(), false);
  let said = null;
  seen.requests({ url: "http://127.0.0.1:9000/" }, (value) => { said = value; });
  assert.deepEqual(said, { cancel: true });
  const download = navigation({});
  pages.emit("will-download", download);
  assert.equal(download.prevented, true);
  assert.equal(PAGES_PARTITION, "hive-pages");
});

test("a preview page cannot open windows, navigate, redirect, load frames or send WebRTC over UDP", () => {
  const guest = new EventEmitter();
  let opener = null;
  let webrtc = "";
  guest.setWindowOpenHandler = (fn) => { opener = fn; };
  guest.setWebRTCIPHandlingPolicy = (policy) => { webrtc = policy; };
  lockPageGuest(guest);
  assert.equal(webrtc, "disable_non_proxied_udp");
  assert.deepEqual(opener({ url: "https://example.com" }), { action: "deny" });
  for (const name of ["will-navigate", "will-redirect"]) {
    const event = navigation({ url: "http://127.0.0.1/" });
    guest.emit(name, event);
    assert.equal(event.prevented, true, name);
  }
  const nested = navigation({ isMainFrame: false, url: "https://example.com" });
  guest.emit("will-frame-navigate", nested);
  assert.equal(nested.prevented, true);
});
