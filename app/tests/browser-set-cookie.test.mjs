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

test("the set-cookie route only accepts a safe cookie name", () => {
  const r = cut(browserRoutes, '"/api/browser/set-cookie"', '"/api/browser/cookies"', "routes/browser.mjs");
  assert.match(r, /\/\^\[A-Za-z0-9_-\]\+\$\/\.test\(cookieName\)/);
  assert.match(r, /return \{ op: "setcookie", cookieName, value/);
});

test("main validates the name again and sets it on the page origin", () => {
  const h = cut(main, 'ipcMain.handle("seat-browser:setcookie"', 'ipcMain.handle("seat-browser:cookies"', "main.js");
  assert.match(h, /\/\^\[A-Za-z0-9_-\]\+\$\/\.test\(name\)/);
  assert.match(h, /cookies\.set\(\{ url: origin, name, value, secure/);
});

test("the renderer writes to the active tab origin", () => {
  const fn = cut(panes, "async function runBrowserSetCookie", "\nasync function runBrowserCookies", "chat-and-panes.js");
  assert.match(fn, /new URL\(frame\.dataset\.here\)\.origin/);
  assert.match(fn, /window\.seatBrowser\.setCookie\(\{ name: job\.cookieName, value: job\.value, origin \}\)/);
});

test("the tool description mandates confirming with the person first", () => {
  const tools = cut(mcp, "export const PEER_TOOLS = [", "export function peerCalls", "peer-tools.mjs");
  const def = cut(tools, 'name: "browser_set_cookie"', 'name: "browser_cookies"', "set-cookie def");
  assert.match(def, /ALWAYS confirm with the person first/);
  assert.match(def, /browser_profile instead/);
});
