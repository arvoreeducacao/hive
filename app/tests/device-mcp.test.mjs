import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deviceCall, hiveDoor, DEVICE_OPEN_WAIT } from "../../server/peer/peer.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const mcp = readFileSync(join(here, "..", "..", "server", "peer", "peer-tools.mjs"), "utf8");
const peer = readFileSync(join(here, "..", "..", "server", "peer", "peer.mjs"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

const TOOLS = ["device_open", "device_screenshot", "device_tap", "device_swipe", "device_type", "device_key", "device_tree", "device_logs", "device_close"];

test("the hive MCP exposes the nine device tools, each saying it needs the hive open on this machine", () => {
  const tools = cut(mcp, "export const PEER_TOOLS = [", "export function peerCalls", "peer-tools.mjs");
  for (const name of TOOLS) assert.match(tools, new RegExp(`name: "${name}"`), name);
  const open = cut(tools, 'name: "device_open"', 'name: "device_screenshot"', "open def");
  assert.match(open, /Only works where the hive app is open/);
  assert.match(open, /properties: \{\s*platform:/);
  for (const key of ["avd:", "app:", "window:"]) assert.ok(open.includes(key), key);
  for (const name of TOOLS.slice(2, 8)) {
    const def = cut(tools, `name: "${name}"`, "inputSchema", name);
    assert.match(def, /Needs device_open first/, name);
  }
  assert.match(cut(tools, 'name: "device_tap"', 'name: "device_swipe"', "tap"), /required: \["x", "y"\]/);
  assert.match(cut(tools, 'name: "device_key"', 'name: "device_tree"', "key"), /required: \["key"\]/);
  assert.ok(tools.indexOf('name: "device_open"') > tools.indexOf('name: "browser_console"'), "device tools come after the browser ones");
  assert.ok(tools.indexOf('name: "device_close"') < tools.indexOf('name: "spawn"'), "and before spawn");
});

test("device_screenshot returns an image block, and every other call goes through deviceCall", () => {
  const shot = cut(mcp, "async device_screenshot()", "async device_tap(", "peer-tools.mjs");
  assert.match(shot, /deviceCall\(\{ path: "shot", env \}\)/);
  assert.match(shot, /return image\(said\.image/);
  const open = cut(mcp, "async device_open(args)", "async device_screenshot()", "peer-tools.mjs");
  assert.match(open, /deviceCall\(\{ path: "open", payload: \{ platform: args\.platform \|\| "android", avd: args\.avd \|\| "", app: args\.app \|\| "", window: args\.window === true \}, timeout: DEVICE_OPEN_WAIT, env \}\)/);
  assert.match(open, /the person sees it in the device pane/);
  for (const [name, path] of [["device_tap", "tap"], ["device_swipe", "swipe"], ["device_type", "type"], ["device_key", "key"], ["device_tree", "tree"], ["device_logs", "logs"], ["device_close", "close"]]) {
    const call = cut(mcp, `async ${name}(`, "\n    },\n", name);
    assert.match(call, new RegExp(`deviceCall\\(\\{ path: "${path}"`), name);
    assert.match(call, /if \(done\.error\) return failure\(done\.error\)/, name);
  }
});

test("deviceCall knocks on the hive door with the seat's name and side, with the browser's error when there is no door", () => {
  const fn = cut(peer, "export async function deviceCall(", "\nexport async function browserNavigate", "peer.mjs");
  assert.match(fn, /hiveDoor\(self\.base\)/);
  assert.match(fn, /no hive answering on this machine — the app has to be open where the pane is/);
  assert.match(fn, /`\/api\/device\/\$\{path\}`/);
  assert.match(fn, /\{ name: self\.name, where: self\.side, \.\.\.payload \}/);
  assert.ok(DEVICE_OPEN_WAIT > 150000, "a cold boot may take 150s, and the door has to wait for it");
  const door = cut(peer, "function askTheApp(door, method, path, payload", "\n}\n", "peer.mjs");
  assert.match(door, /\{ timeout = 120000 \} = \{\}/);
});

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-device-"));
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(join(base, "sessions", "seat.json"), JSON.stringify({ session_id: "s1", cwd: "/w/hub" }));
  return base;
}

async function fakeApp(base, reply) {
  const seen = [];
  const app = createServer((req, res) => {
    let body = "";
    req.on("data", (piece) => { body += piece; });
    req.on("end", () => {
      seen.push({ path: req.url, body: body ? JSON.parse(body) : null });
      res.setHeader("content-type", "application/json");
      const said = reply(req.url);
      res.statusCode = said.error ? 502 : 200;
      res.end(JSON.stringify(said));
    });
  });
  await new Promise((up) => app.listen({ path: hiveDoor(base) }, up));
  return { seen, close: () => new Promise((done) => app.close(done)) };
}

const envOf = (base) => ({ HIVE_SEAT: "seat", HIVE_STATE_DIR: base });

test("over a real door, deviceCall posts the payload and hands the answer back", async () => {
  const base = await hive();
  const app = await fakeApp(base, (path) => (path === "/api/device/tap" ? { ok: true, x: 540, y: 1200 } : { error: `unknown ${path}` }));
  try {
    const done = await deviceCall({ path: "tap", payload: { x: 540, y: 1200 }, env: envOf(base) });
    assert.equal(done.ok, true);
    assert.deepEqual(done.said, { ok: true, x: 540, y: 1200 });
    assert.deepEqual(app.seen, [{ path: "/api/device/tap", body: { name: "seat", where: "local", x: 540, y: 1200 } }]);
    const wrong = await deviceCall({ path: "tree", env: envOf(base) });
    assert.equal(wrong.error, "unknown /api/device/tree");
  } finally {
    await app.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("without a hive on this machine the call fails the way the browser tools do", async () => {
  const base = await hive();
  try {
    const done = await deviceCall({ path: "shot", env: envOf(base) });
    assert.equal(done.error, "no hive answering on this machine — the app has to be open where the pane is");
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
