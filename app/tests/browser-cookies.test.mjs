import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "..", "server.mjs"), "utf8");
const browserRoutes = readFileSync(join(here, "..", "routes", "browser.mjs"), "utf8");
const panes = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
const main = readFileSync(join(here, "..", "main.js"), "utf8");
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

test("the profile route only accepts the four known profiles", () => {
  const r = cut(browserRoutes, '"/api/browser/profile"', '"/api/browser/set-cookie"', "routes/browser.mjs");
  assert.match(r, /\["teacher", "principal", "teacher2", "student"\]\.includes\(profile\)/);
  assert.match(r, /return \{ op: "profile", profile \}/);
});

test("main reads the token from the hub .env and never returns its value", () => {
  const h = cut(main, 'ipcMain.handle("seat-browser:profile"', 'ipcMain.handle("seat-browser:cookies"', "main.js");
  assert.match(h, /const tok = readHubToken\(profile\)/);
  assert.match(h, /cookies\.set\(\{ url: origin, name: "access_token", value: tok\.value, httpOnly: true/);
  assert.ok(!/return \{ ok: true[^}]*value/.test(h), "must not return the token value to the caller");
  const reader = cut(main, "const readHubToken =", "const maskCookie", "main.js");
  assert.match(reader, /SEAT_PROFILES\[profile\]/);
  assert.match(reader, /join\(hub, "\.env"\)/);
});

test("the token value never crosses the server — the server only forwards the profile name", () => {
  const r = cut(browserRoutes, '"/api/browser/profile"', '"/api/browser/set-cookie"', "routes/browser.mjs");
  assert.ok(!r.includes("DESIGN_REVIEW_TOKEN"), "server route must not touch the token var");
  assert.ok(!r.includes(".env"), "server route must not read the .env");
});

test("the cookie read masks values, main-side", () => {
  const h = cut(main, 'ipcMain.handle("seat-browser:cookies"', 'window_.webContents.on("did-attach-webview"', "main.js");
  assert.match(h, /hint: maskCookie\(c\.value\)/);
  assert.ok(!h.includes("value: c.value"), "raw cookie values must not leave main");
  assert.match(main, /const maskCookie =/);
});

test("the renderer sends only profile and origin to main, then reloads", () => {
  const fn = cut(panes, "async function runBrowserProfile", "\nasync function runBrowserSetCookie", "chat-and-panes.js");
  assert.match(fn, /new URL\(frame\.dataset\.here\)\.origin/);
  assert.match(fn, /window\.seatBrowser\.profile\(\{ profile: job\.profile, origin \}\)/);
  assert.match(fn, /frame\.reload\(\)/);
});

test("the hive MCP exposes browser_profile and browser_cookies", () => {
  const tools = cut(mcp, "export const PEER_TOOLS = [", "export function peerCalls", "peer-tools.mjs");
  assert.match(tools, /name: "browser_profile"/);
  assert.match(tools, /name: "browser_cookies"/);
});
