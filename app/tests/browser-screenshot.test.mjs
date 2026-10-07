import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "..", "server.mjs"), "utf8");
const browserRoutes = readFileSync(join(here, "..", "routes", "browser.mjs"), "utf8");
const panes = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");
const peer = readFileSync(join(here, "..", "..", "server", "peer", "peer.mjs"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

test("the fleet carries both the navigate intent and pending ops", () => {
  assert.match(server, /browser: browserState\(name\),/);
  const fn = cut(browserRoutes, "export const browserState =", "\n};", "routes/browser.mjs");
  assert.match(fn, /want \|\| ops\.length \? \{ want, ops \} : null/);
});

test("the shoot route holds the request until the renderer answers, with a timeout", () => {
  const r = cut(browserRoutes, '"/api/browser/shoot"', '"/api/browser/eval"', "routes/browser.mjs");
  assert.match(r, /\(\(\) => \(\{ op: "shoot" \}\)/);
  const held = cut(browserRoutes, "const holdBrowserOp = ", "export const browserState", "routes/browser.mjs");
  assert.match(held, /new Promise\(\(resolve\)/);
  assert.match(held, /setTimeout\(/);
  assert.match(held, /browserJobs\.set\(id, \{ resolve, timer \}\)/);
});

test("the result route resolves the held job and clears the op", () => {
  const r = cut(browserRoutes, '"/api/browser/result"', "\n  });\n}", "routes/browser.mjs");
  assert.match(r, /const job = browserJobs\.get\(asked\.id\)/);
  assert.match(r, /clearTimeout\(job\.timer\)/);
  assert.match(r, /if \(asked\.error\) job\.resolve\(\{ error/);
  assert.match(r, /asked\.image !== undefined/);
});

test("the renderer captures the pane and posts the image back, once per job", () => {
  assert.match(panes, /const browserShot = new Set\(\);/);
  const fn = cut(panes, "for (const job of sync.ops", "\n}", "chat-and-panes.js");
  assert.match(fn, /if \(browserShot\.has\(job\.id\)\) continue;/);
  const shot = cut(panes, "async function runBrowserShot", "\nasync function runBrowserEval", "chat-and-panes.js");
  assert.match(shot, /frame\.capturePage\(\)/);
  assert.match(shot, /img\.toDataURL\(\)/);
  assert.match(shot, /post\(\{ error: noPageOf\(name\) \}\)/);
  assert.match(panes, /const NO_PAGE = "this seat has no page open/);
});

test("browser_screenshot returns an image content block", () => {
  const call = cut(mcp, "async browser_screenshot()", "async publish(args)", "peer-tools.mjs");
  assert.match(call, /browserShoot\(\{ env \}\)/);
  assert.match(call, /return image\(done\.image/);
  const helper = cut(mcp, "function image(dataUrl", "\nfunction ", "peer-tools.mjs");
  assert.match(helper, /type: "image", data, mimeType: mime/);
});

test("browserShoot reaches the app over the hive door", () => {
  const fn = cut(peer, "export async function browserShoot(", "\nexport async function browserNavigate", "peer.mjs");
  assert.match(fn, /"POST", "\/api\/browser\/shoot"/);
  assert.match(fn, /hiveDoor\(self\.base\)/);
});
