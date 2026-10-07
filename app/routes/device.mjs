import { existsSync } from "node:fs";
import { FRAME_FRESH, LOG_LINES, LOG_LINES_MAX, chooseAvd, createDriver, packageOf, sdkRootOf, toolsOf } from "../lib/device.mjs";
import { createIosDriver, iosToolsOf } from "../lib/device-ios.mjs";

const deviceOfSeat = new Map();
let androidDriver = null;
let iosDriver = null;
let deviceSeq = 0;

export const DEVICE_BUSY_FOR = 5000;

export const deviceState = (name, now = Date.now()) => {
  const d = deviceOfSeat.get(name);
  if (!d) return null;
  return { platform: d.platform, avd: d.avd, serial: d.serial, booted: d.booted, app: d.app, width: d.width, height: d.height, at: d.at, want: d.want, busy: now - (d.usedAt || 0) < DEVICE_BUSY_FOR };
};

const bySeat = (asked) => asked.where !== undefined;

function markUse(asked) {
  const d = deviceOfSeat.get(asked.name);
  if (d && bySeat(asked)) d.usedAt = Date.now();
}

function androidOf() {
  const tools = toolsOf(sdkRootOf());
  if (!tools || !existsSync(tools.adb)) {
    const expected = tools ? tools.adb : "~/Android/Sdk/platform-tools/adb";
    return { error: `no Android SDK on this machine — expected adb at ${expected}; install Android Studio (or the command-line tools) or point ANDROID_HOME at the sdk` };
  }
  if (!androidDriver || androidDriver.tools.adb !== tools.adb) androidDriver = { tools, drive: createDriver({ tools }) };
  return androidDriver;
}

function iosOf() {
  if (process.platform !== "darwin") return { error: "the iOS simulator only runs on a mac — open the seat on one, or use platform android" };
  const tools = iosToolsOf();
  if (!existsSync(tools.xcrun)) return { error: `no xcrun at ${tools.xcrun} — install Xcode and run xcode-select --install` };
  if (!iosDriver) iosDriver = { tools, drive: createIosDriver({ tools }) };
  return iosDriver;
}

const driverOf = (platform) => (platform === "ios" ? iosOf() : androidOf());

function deviceOf(name) {
  const d = deviceOfSeat.get(name);
  if (!d) return { error: "no device on this seat — call device_open first" };
  const kit = driverOf(d.platform);
  if (kit.error) return kit;
  return { d, drive: kit.drive };
}

const DEVICE_GONE = /not found|offline|no devices|device '.*' not found|closed|invalid device|no devices are booted|current state: shutdown/i;

function deviceReply(name, r, did) {
  if (r && r.ok === false) {
    if (DEVICE_GONE.test(`${r.err} ${r.out}`)) {
      deviceOfSeat.delete(name);
      return { error: `the device is gone (${r.err || "the driver lost it"}) — call device_open again` };
    }
    return { error: `${did} failed: ${r.err || String(r.out || "").trim() || "the driver said nothing"}` };
  }
  return { ok: true };
}

async function deviceShot(name, { fresh = FRAME_FRESH } = {}) {
  const found = deviceOf(name);
  if (found.error) return found;
  const { d, drive } = found;
  if (d.shot && Date.now() - d.shot.at < fresh) return { png: d.shot.png, at: d.shot.at, width: d.width, height: d.height };
  if (d.shooting) return d.shooting;
  d.shooting = (async () => {
    try {
      const got = await drive.shot(d.serial);
      if (got.error) {
        const check = await drive.booted(d.serial);
        if (!check) { deviceOfSeat.delete(name); return { error: `the device ${d.serial} is not answering any more — call device_open again` }; }
        return got;
      }
      d.shot = { png: got.png, at: Date.now() };
      return { png: got.png, at: d.shot.at, width: d.width, height: d.height };
    } finally {
      d.shooting = null;
    }
  })();
  return d.shooting;
}

export function registerDeviceRoutes(on, ctx) {
  const { isSeatName, bodyOf } = ctx;

  const found = async (req, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) {
      json({ error: "unknown session" }, 400);
      return { refused: true };
    }
    return { asked };
  };

  const withDevice = (asked, json) => {
    const got = deviceOf(asked.name);
    if (got.error) {
      json(got, 400);
      return { refused: true };
    }
    markUse(asked);
    return got;
  };

  on(null, "/api/device/list", async (req, res, url, json) => {
    const android = androidOf();
    const ios = iosOf();
    if (android.error && ios.error) return json({ error: `${android.error} — and ${ios.error}` }, 502);
    const [avds, running] = android.error ? [[], []] : await Promise.all([android.drive.avds(), android.drive.running()]);
    const sims = ios.error ? [] : await ios.drive.sims();
    return json({ ok: true, avds, running, sdk: android.error ? "" : android.tools.root, sims, android: android.error || "", ios: ios.error || "" });
  });

  on("POST", "/api/device/open", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    const platform = String(asked.platform || "android").trim().toLowerCase();
    if (platform !== "android" && platform !== "ios") return json({ error: `device_open knows android and ios — not ${platform}` }, 400);
    const kit = driverOf(platform);
    if (kit.error) return json(kit, 502);
    const chosen = platform === "ios" ? { avd: String(asked.avd || "") } : chooseAvd(kit.drive.avds(), asked.avd);
    if (chosen.error) return json(chosen, 400);
    const up = await kit.drive.boot({ avd: chosen.avd, window: asked.window === true });
    if (up.error) return json(up, 502);
    const state = { platform, avd: up.avd, serial: up.serial, booted: true, app: "", width: up.width, height: up.height, at: Date.now(), want: ++deviceSeq, shot: null, shooting: null };
    deviceOfSeat.set(asked.name, state);
    markUse(asked);
    let opened = null;
    const pkg = packageOf(asked.app);
    if (pkg) {
      opened = await kit.drive.openApp(up.serial, pkg);
      if (opened.error) return json({ ...opened, serial: up.serial, avd: up.avd, bootMs: up.bootMs, width: up.width, height: up.height }, 502);
      state.app = pkg;
    }
    return json({ ok: true, serial: up.serial, avd: up.avd, fresh: up.fresh, bootMs: up.bootMs, width: up.width, height: up.height, app: state.app });
  });

  on("POST", "/api/device/shot", async (req, res, url, json) => {
    const asked = await bodyOf(req);
    if (!isSeatName(asked.name)) return json({ error: "unknown session" }, 400);
    markUse(asked);
    const got = await deviceShot(asked.name, { fresh: 0 });
    if (got.error) return json(got, 502);
    return json({ ok: true, image: `data:image/png;base64,${got.png.toString("base64")}`, width: got.width, height: got.height });
  });

  on(null, "/api/device/frame", async (req, res, url, json) => {
    const name = url.searchParams.get("name") || "";
    if (!isSeatName(name) || !deviceOfSeat.has(name)) return json({ error: "no device" }, 404);
    const got = await deviceShot(name);
    if (got.error) return json(got, 502);
    res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store", "x-device-width": String(got.width || 0), "x-device-height": String(got.height || 0) });
    return res.end(got.png);
  });

  on(null, "/api/device/video", async (req, res, url, json) => {
    const name = url.searchParams.get("name") || "";
    if (!isSeatName(name)) return json({ error: "unknown session" }, 400);
    const foundOne = deviceOf(name);
    if (foundOne.error) return json(foundOne, 404);
    res.writeHead(200, {
      "content-type": "video/h264",
      "cache-control": "no-store",
      "x-device-width": String(foundOne.d.width || 0),
      "x-device-height": String(foundOne.d.height || 0)
    });
    const tape = foundOne.drive.record(foundOne.d.serial, {
      onChunk: (chunk) => { if (!res.writableEnded) res.write(chunk); },
      onEnd: () => { if (!res.writableEnded) res.end(); }
    });
    req.on("close", () => tape.stop());
    res.on("close", () => tape.stop());
  });

  on("POST", "/api/device/tap", async (req, res, url, json) => {
    const got = await found(req, json);
    if (got.refused) return;
    const x = Math.round(Number(got.asked.x));
    const y = Math.round(Number(got.asked.y));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) return json({ error: "give x and y in device pixels" }, 400);
    const onDevice = withDevice(got.asked, json);
    if (onDevice.refused) return;
    const done = deviceReply(got.asked.name, await onDevice.drive.tap(onDevice.d.serial, x, y, onDevice.d.width, onDevice.d.height), "tap");
    if (!done.error) onDevice.d.shot = null;
    return json(done.error ? done : { ok: true, x, y }, done.error ? 502 : 200);
  });

  on("POST", "/api/device/swipe", async (req, res, url, json) => {
    const got = await found(req, json);
    if (got.refused) return;
    const at = ["x1", "y1", "x2", "y2"].map((k) => Math.round(Number(got.asked[k])));
    if (at.some((v) => !Number.isFinite(v) || v < 0)) return json({ error: "give x1, y1, x2 and y2 in device pixels" }, 400);
    const ms = Math.min(5000, Math.max(50, Math.round(Number(got.asked.ms) || 300)));
    const onDevice = withDevice(got.asked, json);
    if (onDevice.refused) return;
    const done = deviceReply(got.asked.name, await onDevice.drive.swipe(onDevice.d.serial, ...at, ms, onDevice.d.width, onDevice.d.height), "swipe");
    if (!done.error) onDevice.d.shot = null;
    return json(done.error ? done : { ok: true, ms }, done.error ? 502 : 200);
  });

  on("POST", "/api/device/type", async (req, res, url, json) => {
    const got = await found(req, json);
    if (got.refused) return;
    const text = String(got.asked.text || "");
    if (!text) return json({ error: "there is nothing to type" }, 400);
    if (text.length > 500) return json({ error: "type at most 500 characters at a time" }, 400);
    const onDevice = withDevice(got.asked, json);
    if (onDevice.refused) return;
    const done = deviceReply(got.asked.name, await onDevice.drive.type(onDevice.d.serial, text), "type");
    if (!done.error) onDevice.d.shot = null;
    return json(done.error ? done : { ok: true, typed: text.length }, done.error ? 502 : 200);
  });

  on("POST", "/api/device/key", async (req, res, url, json) => {
    const got = await found(req, json);
    if (got.refused) return;
    const onDevice = withDevice(got.asked, json);
    if (onDevice.refused) return;
    const resolved = onDevice.drive.keyOf(got.asked.key);
    if (resolved.error) return json(resolved, 400);
    const said = resolved.button || String(resolved.code);
    const done = deviceReply(got.asked.name, await onDevice.drive.key(onDevice.d.serial, resolved), `key ${said}`);
    if (!done.error) onDevice.d.shot = null;
    return json(done.error ? done : { ok: true, key: said }, done.error ? 502 : 200);
  });

  on("POST", "/api/device/tree", async (req, res, url, json) => {
    const got = await found(req, json);
    if (got.refused) return;
    const onDevice = withDevice(got.asked, json);
    if (onDevice.refused) return;
    const tree = await onDevice.drive.tree(onDevice.d.serial);
    if (tree.error) return json(tree, 502);
    return json({ ok: true, nodes: tree.nodes, count: tree.count });
  });

  on("POST", "/api/device/logs", async (req, res, url, json) => {
    const got = await found(req, json);
    if (got.refused) return;
    const onDevice = withDevice(got.asked, json);
    if (onDevice.refused) return;
    const lines = Math.min(LOG_LINES_MAX, Math.max(10, Math.round(Number(got.asked.lines) || LOG_LINES)));
    const said = await onDevice.drive.logs(onDevice.d.serial, { lines, pkg: onDevice.d.app });
    return json({ ok: true, lines: said.lines, app: onDevice.d.app });
  });

  on("POST", "/api/device/close", async (req, res, url, json) => {
    const got = await found(req, json);
    if (got.refused) return;
    const onDevice = withDevice(got.asked, json);
    if (onDevice.refused) return;
    const stopped = await onDevice.drive.kill(onDevice.d.serial);
    deviceOfSeat.delete(got.asked.name);
    return json({ ok: true, serial: onDevice.d.serial, avd: onDevice.d.avd, killed: stopped.ok });
  });
}
