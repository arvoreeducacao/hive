import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerDeviceRoutes } from "../routes/device.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "..", "server.mjs"), "utf8");
const deviceRoutes = readFileSync(join(here, "..", "routes", "device.mjs"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

const ROUTES = ["open", "shot", "tap", "swipe", "type", "key", "tree", "logs", "close"];

test("the fleet carries the device next to the browser, and only the public shape of it", () => {
  assert.match(server, /browser: browserState\(name\),\n\s+device: deviceState\(name\),/);
  const fn = cut(deviceRoutes, "export const deviceState = (name, now = Date.now()) => {", "\n};", "routes/device.mjs");
  assert.match(fn, /platform: d\.platform, avd: d\.avd, serial: d\.serial, booted: d\.booted, app: d\.app, width: d\.width, height: d\.height, at: d\.at/);
  assert.doesNotMatch(fn, /shot:/);
});

test("the device says it is busy only for a few seconds after the seat itself touched it", () => {
  const fn = cut(deviceRoutes, "export const deviceState = (name, now = Date.now()) => {", "\n};", "routes/device.mjs");
  assert.match(fn, /busy: now - \(d\.usedAt \|\| 0\) < DEVICE_BUSY_FOR/);
  assert.match(deviceRoutes, /export const DEVICE_BUSY_FOR = 5000;/);
  assert.match(deviceRoutes, /const bySeat = \(asked\) => asked\.where !== undefined;/);
  const mark = cut(deviceRoutes, "function markUse(asked) {", "\n}\n", "routes/device.mjs");
  assert.match(mark, /if \(d && bySeat\(asked\)\) d\.usedAt = Date\.now\(\);/);
  assert.match(cut(deviceRoutes, "const withDevice = (asked, json) => {", "\n  };", "routes/device.mjs"), /markUse\(asked\);\s*return got;/);
  assert.match(cut(deviceRoutes, '"/api/device/open"', '"/api/device/shot"', "routes/device.mjs"), /deviceOfSeat\.set\(asked\.name, state\);\s*markUse\(asked\);/);
});

test("the driver comes from app/lib/device.mjs and is built once per sdk", () => {
  assert.match(deviceRoutes, /from "\.\.\/lib\/device\.mjs"/);
  const fn = cut(deviceRoutes, "function androidOf() {", "\n}\n", "routes/device.mjs");
  assert.match(fn, /toolsOf\(sdkRootOf\(\)\)/);
  assert.match(fn, /no Android SDK on this machine/);
  assert.match(fn, /createDriver\(\{ tools \}\)/);
});

test("every device route is a POST on the seat's name, and refuses a name that is not a seat", () => {
  for (const route of ROUTES) {
    assert.ok(deviceRoutes.includes(`on("POST", "/api/device/${route}"`), `route ${route} is not registered`);
  }
  const door = cut(deviceRoutes, "const found = async (req, json)", "const withDevice", "routes/device.mjs");
  assert.match(door, /json\(\{ error: "unknown session" \}, 400\);/);
  assert.match(door, /return \{ refused: true \};/);
  assert.ok(deviceRoutes.includes('on(null, "/api/device/list"'));
});

test("device guards stop after answering invalid and unopened seats", async () => {
  const routes = new Map();
  registerDeviceRoutes((method, path, handler) => routes.set(path, handler), {
    isSeatName: (name) => name === "seat",
    bodyOf: async (req) => req.body
  });
  const answers = [];
  const json = (body, status = 200) => { answers.push({ body, status }); };
  const tap = routes.get("/api/device/tap");

  await assert.doesNotReject(() => tap({ body: { name: "bad", x: 1, y: 1 } }, {}, new URL("http://hive/api/device/tap"), json));
  assert.deepEqual(answers.pop(), { body: { error: "unknown session" }, status: 400 });

  await assert.doesNotReject(() => tap({ body: { name: "seat", x: 1, y: 1 } }, {}, new URL("http://hive/api/device/tap"), json));
  assert.deepEqual(answers.pop(), { body: { error: "no device on this seat — call device_open first" }, status: 400 });
});

test("open picks the avd, boots or reuses, opens the app, and keeps the state for the pane", () => {
  const r = cut(deviceRoutes, '"/api/device/open"', '"/api/device/shot"', "routes/device.mjs");
  assert.match(r, /platform !== "android" && platform !== "ios"/);
  assert.match(r, /const kit = driverOf\(platform\)/);
  assert.match(r, /platform === "ios" \? \{ avd: String\(asked\.avd \|\| ""\) \} : chooseAvd\(kit\.drive\.avds\(\), asked\.avd\)/);
  assert.match(r, /kit\.drive\.boot\(\{ avd: chosen\.avd, window: asked\.window === true \}\)/);
  assert.match(r, /deviceOfSeat\.set\(asked\.name, state\)/);
  assert.match(r, /packageOf\(asked\.app\)/);
  assert.match(r, /kit\.drive\.openApp\(up\.serial, pkg\)/);
  assert.match(r, /return json\(\{ ok: true, serial: up\.serial, avd: up\.avd, fresh: up\.fresh, bootMs: up\.bootMs, width: up\.width, height: up\.height, app: state\.app \}\)/);
});

test("shot answers a data url, and frame answers png bytes reusing a photo younger than 400ms", () => {
  const shot = cut(deviceRoutes, '"/api/device/shot"', '"/api/device/frame"', "routes/device.mjs");
  assert.match(shot, /deviceShot\(asked\.name, \{ fresh: 0 \}\)/);
  assert.match(shot, /image: `data:image\/png;base64,\$\{got\.png\.toString\("base64"\)\}`/);
  const frame = cut(deviceRoutes, '"/api/device/frame"', '"/api/device/video"', "routes/device.mjs");
  assert.match(frame, /url\.searchParams\.get\("name"\)/);
  assert.match(frame, /!deviceOfSeat\.has\(name\)\) return json\(\{ error: "no device" \}, 404\)/);
  assert.match(frame, /"content-type": "image\/png"/);
  const cache = cut(deviceRoutes, "async function deviceShot(name", "\n}\n", "routes/device.mjs");
  assert.match(cache, /Date\.now\(\) - d\.shot\.at < fresh/);
  assert.match(cache, /if \(d\.shooting\) return d\.shooting;/);
  assert.match(deviceRoutes, /FRAME_FRESH/);
});

test("input routes validate their numbers and keys before touching adb, and forget the last photo after", () => {
  const tap = cut(deviceRoutes, '"/api/device/tap"', '"/api/device/swipe"', "routes/device.mjs");
  assert.match(tap, /give x and y in device pixels/);
  assert.match(tap, /onDevice\.drive\.tap\(onDevice\.d\.serial, x, y, onDevice\.d\.width, onDevice\.d\.height\)/);
  assert.match(tap, /onDevice\.d\.shot = null/);
  const swipe = cut(deviceRoutes, '"/api/device/swipe"', '"/api/device/type"', "routes/device.mjs");
  assert.match(swipe, /Math\.min\(5000, Math\.max\(50, Math\.round\(Number\(got\.asked\.ms\) \|\| 300\)\)\)/);
  const type = cut(deviceRoutes, '"/api/device/type"', '"/api/device/key"', "routes/device.mjs");
  assert.match(type, /there is nothing to type/);
  assert.match(type, /text\.length > 500/);
  const key = cut(deviceRoutes, '"/api/device/key"', '"/api/device/tree"', "routes/device.mjs");
  assert.match(key, /const resolved = onDevice\.drive\.keyOf\(got\.asked\.key\)/);
  assert.match(key, /resolved\.button \|\| String\(resolved\.code\)/);
});

test("tree, logs and close go through the driver and close forgets the seat", () => {
  const tree = cut(deviceRoutes, '"/api/device/tree"', '"/api/device/logs"', "routes/device.mjs");
  assert.match(tree, /onDevice\.drive\.tree\(onDevice\.d\.serial\)/);
  assert.match(tree, /nodes: tree\.nodes, count: tree\.count/);
  const logs = cut(deviceRoutes, '"/api/device/logs"', '"/api/device/close"', "routes/device.mjs");
  assert.match(logs, /Math\.min\(LOG_LINES_MAX, Math\.max\(10/);
  assert.match(logs, /pkg: onDevice\.d\.app/);
  const close = cut(deviceRoutes, '"/api/device/close"', "\n  });\n}", "routes/device.mjs");
  assert.match(close, /onDevice\.drive\.kill\(onDevice\.d\.serial\)/);
  assert.match(close, /deviceOfSeat\.delete\(got\.asked\.name\)/);
});

test("an emulator that vanished is forgotten, so the next call says device_open again", () => {
  const fn = cut(deviceRoutes, "function deviceReply(name, r, did) {", "\n}\n", "routes/device.mjs");
  assert.match(fn, /DEVICE_GONE\.test/);
  assert.match(fn, /deviceOfSeat\.delete\(name\)/);
  assert.match(fn, /call device_open again/);
  const missing = cut(deviceRoutes, "function deviceOf(name) {", "\n}\n", "routes/device.mjs");
  assert.match(missing, /no device on this seat — call device_open first/);
});

test("nothing about the device goes through a shell string", () => {
  assert.doesNotMatch(deviceRoutes, /sh\("bash"/);
  assert.doesNotMatch(deviceRoutes, /exec\(`/);
  assert.doesNotMatch(deviceRoutes, /execSync|spawnSync/);
});

test("the domain answers through the router, not the if-chain", () => {
  assert.match(server, /registerDeviceRoutes\(on,/);
  assert.doesNotMatch(server, /url\.pathname === "\/api\/device\//);
});
