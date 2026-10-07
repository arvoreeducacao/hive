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
const preload = readFileSync(join(here, "..", "main", "preload.js"), "utf8");
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");
const peer = readFileSync(join(here, "..", "..", "server", "peer", "peer.mjs"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

test("the viewport route validates the size or takes a reset", () => {
  const r = cut(browserRoutes, '"/api/browser/viewport"', '"/api/browser/console"', "routes/browser.mjs");
  assert.match(r, /width < 200 \|\| width > 3840/);
  assert.match(r, /return \{ op: "viewport", reset, width, height, mobile/);
});

test("main emulates only seat browser tabs, and can disable", () => {
  const h = cut(main, 'ipcMain.handle("seat-browser:emulate"', "window_.webContents.on", "main.js");
  assert.match(h, /if \(!wc\) return \{ error: "not a seat browser tab" \}/);
  assert.match(h, /Emulation\.clearDeviceMetricsOverride/);
  assert.match(h, /Emulation\.setDeviceMetricsOverride/);
  assert.match(h, /Emulation\.setTouchEmulationEnabled/);
  assert.match(h, /\{ enabled: true, maxTouchPoints: 5 \} : \{ enabled: false \}/, "a desktop viewport passes no touch points — chrome refuses zero and the resize never lands");
  assert.doesNotMatch(h, /maxTouchPoints: (?:params\.mobile \? 5 : )?0/);
  assert.match(main, /seatWc\.add\(guest\.id\)/);
  assert.match(main, /guest\.once\("destroyed", \(\) => seatWc\.delete\(guest\.id\)\)/);
});

test("the preload only bridges emulate, over invoke", () => {
  assert.match(preload, /exposeInMainWorld\("seatBrowser"/);
  assert.match(preload, /ipcRenderer\.invoke\("seat-browser:emulate", wcId, params\)/);
});

test("the renderer sends the tab's webContents id to main", () => {
  const fn = cut(panes, "async function runBrowserViewport", "\nasync function runBrowserProfile", "chat-and-panes.js");
  assert.match(fn, /frame\.getWebContentsId\(\)/);
  assert.match(fn, /window\.seatBrowser\.emulate\(wcId, params\)/);
  assert.match(fn, /post\(\{ error: noPageOf\(name\) \}\)/);
});

test("the hive MCP exposes browser_resize with reset and mobile", () => {
  const tools = cut(mcp, "export const PEER_TOOLS = [", "export function peerCalls", "peer-tools.mjs");
  assert.match(tools, /name: "browser_resize"/);
  const def = cut(tools, 'name: "browser_resize"', 'name: "browser_eval"', "resize def");
  assert.match(def, /reset:/);
  assert.match(def, /mobile:/);
});

test("browserResize reaches the viewport route with a reset branch", () => {
  const fn = cut(peer, "export async function browserResize(", "\nexport async function browserEval", "peer.mjs");
  assert.match(fn, /"POST", "\/api\/browser\/viewport"/);
  assert.match(fn, /reset \? \{ name: self\.name, where: self\.side, reset: true \}/);
});
