import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const browserRoutes = readFileSync(join(here, "..", "routes", "browser.mjs"), "utf8");
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");
const peer = readFileSync(join(here, "..", "..", "server", "peer", "peer.mjs"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

await views();
const { FRAME_WAIT, NO_PAGE, bornWebFrame, runBrowserConsole, runBrowserEval, webOfSeat, webYards } = await app("chat-and-panes");

const posts = [];
const catchFetch = () => {
  posts.length = 0;
  const was = globalThis.fetch;
  globalThis.fetch = async (url, init) => { posts.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) }; };
  return () => { globalThis.fetch = was; };
};

const ran = [];

function seatOnAPage(name, answer = () => JSON.stringify(7)) {
  const yard = document.createElement("div");
  const frame = document.createElement("webview");
  frame.dataset.id = "t1";
  frame.dataset.here = "http://localhost:3000/";
  frame.isLoading = () => false;
  frame.executeJavaScript = async (code) => { ran.push(code); return answer(code); };
  yard.appendChild(frame);
  webOfSeat.set(name, { tabs: [{ id: "t1", url: "http://localhost:3000/" }], active: 0 });
  webYards.set(name, yard);
  return frame;
}

const fire = (frame, kind, fields = {}) => {
  const ev = new window.Event(kind);
  Object.assign(ev, fields);
  frame.dispatchEvent(ev);
};

test("the eval route requires code and queues an eval op", () => {
  const r = cut(browserRoutes, '"/api/browser/eval"', '"/api/browser/print"', "routes/browser.mjs");
  assert.match(r, /if \(!code\) return \{ error/);
  assert.match(r, /return \{ op: "eval", code \}/);
  const held = cut(browserRoutes, "const holdBrowserOp = ", "export const browserState", "routes/browser.mjs");
  assert.match(held, /ops\.push\(\{ id, \.\.\.op \}\)/, "the op lands in the seat's queue");
});

test("the console route queues a console op", () => {
  const r = cut(browserRoutes, '"/api/browser/console"', '"/api/browser/map"', "routes/browser.mjs");
  assert.match(r, /\(\(\) => \(\{ op: "console" \}\)/);
});

test("the result route carries value and lines back, not only image", () => {
  const r = cut(browserRoutes, '"/api/browser/result"', "\n  });\n}", "routes/browser.mjs");
  assert.match(r, /asked\.value !== undefined/);
  assert.match(r, /asked\.lines !== undefined/);
});

test("eval runs in the page and returns a json-safe value", async () => {
  const restore = catchFetch();
  ran.length = 0;
  seatOnAPage("eval-seat");
  await runBrowserEval("eval-seat", "op1", "1 + 6");
  restore();
  assert.equal(ran.length, 1);
  assert.match(ran[0], /JSON\.stringify\(eval\("1 \+ 6"\)\)/);
  assert.match(ran[0], /__evalError/);
  assert.deepEqual(posts.map((p) => p.url), ["/api/browser/result"]);
  assert.deepEqual(posts[0].body, { id: "op1", value: "7" });
});

test("eval with no page open says so instead of hanging on a guess", async () => {
  const restore = catchFetch();
  webOfSeat.delete("blind-seat");
  webYards.delete("blind-seat");
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const asked = runBrowserEval("blind-seat", "op2", "1");
  mock.timers.tick(FRAME_WAIT + 500);
  mock.timers.reset();
  await asked;
  restore();
  assert.deepEqual(posts[0].body, { id: "op2", error: NO_PAGE });
});

test("a page that throws on eval answers with the error, not with silence", async () => {
  const restore = catchFetch();
  seatOnAPage("angry-seat", () => { throw new Error("detached frame"); });
  await runBrowserEval("angry-seat", "op3", "boom");
  restore();
  assert.equal(posts[0].body.error, "detached frame");
});

test("the webview buffers console messages per tab and clears them on reload", () => {
  const restore = catchFetch();
  const yard = document.createElement("div");
  const tab = { id: "t9", url: "http://localhost:3000/", kind: "page" };
  webOfSeat.set("log-seat", { tabs: [tab], active: 0 });
  webYards.set("log-seat", yard);
  const frame = bornWebFrame(yard, "log-seat", tab);
  fire(frame, "console-message", { level: 3, message: "boom", line: 12, sourceId: "http://localhost:3000/app.js" });
  fire(frame, "console-message", { level: "warning", message: "careful" });
  assert.deepEqual(tab.logs.map((l) => l.level), ["error", "warning"]);
  assert.equal(tab.logs[0].text, "boom");
  assert.equal(tab.logs[0].line, 12);
  for (let i = 0; i < 520; i += 1) fire(frame, "console-message", { level: 1, message: `line ${i}` });
  assert.equal(tab.logs.length, 500, "the buffer stays bounded");
  assert.equal(tab.logs.at(-1).text, "line 519");
  fire(frame, "did-start-loading");
  assert.deepEqual(tab.logs, []);
  restore();
});

test("the console op hands back the tail of what the page said", async () => {
  const restore = catchFetch();
  const tab = { id: "t1", url: "http://localhost:3000/", logs: Array.from({ length: 260 }, (_, i) => ({ level: "log", text: `say ${i}` })) };
  webOfSeat.set("tail-seat", { tabs: [tab], active: 0 });
  runBrowserConsole("tail-seat", "op4");
  restore();
  assert.equal(posts[0].body.lines.length, 200);
  assert.equal(posts[0].body.lines[0].text, "say 60");
});

test("the hive MCP exposes browser_eval and browser_console", () => {
  const tools = cut(mcp, "export const PEER_TOOLS = [", "export function peerCalls", "peer-tools.mjs");
  assert.match(tools, /name: "browser_eval"/);
  assert.match(tools, /name: "browser_console"/);
  const evalDef = cut(tools, 'name: "browser_eval"', "name: \"browser_console\"", "eval def");
  assert.match(evalDef, /required: \["code"\]/);
});

test("browser_eval and browser_console reach the app over the door", () => {
  const e = cut(peer, "export async function browserEval(", "\nexport async function browserConsole", "peer.mjs");
  assert.match(e, /"POST", "\/api\/browser\/eval"/);
  const c = cut(peer, "export async function browserConsole(", "\nexport async function browserShoot", "peer.mjs");
  assert.match(c, /"POST", "\/api\/browser\/console"/);
});
