import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BAGUETTE_ENTRY, BAGUETTE_NAME, BAGUETTE_RECIPE, BAGUETTE_SHA256, BAGUETTE_URL, HELPER_FRAMEWORKS, buildArgs,
  chooseSim, createIosDriver, helperArgs, helperNameOf, iosToolsOf, keyArgs, keyOf, lastLines, parsePngSize,
  parseSimList, swipeArgs, tapArgs, untarArgs
} from "../lib/device-ios.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const panes = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");

const tools = {
  xcrun: "/usr/bin/xcrun",
  clang: "/usr/bin/clang",
  baguette: "baguette",
  source: "/hive/app/native/simscreen.m",
  cacheDir: "/hive/home/native"
};

const listing = (stateOfBBB = "Shutdown") => JSON.stringify({
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-18-3": [
      { udid: "AAA", name: "iPad Pro 11-inch (M4)", state: "Shutdown", isAvailable: true },
      { udid: "BBB", name: "iPhone 16", state: stateOfBBB, isAvailable: true },
      { udid: "CCC", name: "iPhone 16 Pro", state: "Booted", isAvailable: true },
      { udid: "DDD", name: "iPhone 12", state: "Shutdown", isAvailable: false }
    ]
  }
});
const LISTING = listing();

const png = (width, height) => {
  const buf = Buffer.alloc(24);
  buf.write("\x89PNG\r\n\x1a\n", 0, "binary");
  buf.writeUInt32BE(0x49484452, 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
};

const ok = (out = "") => ({ ok: true, out, err: "" });
const no = (err) => ({ ok: false, out: "", err });

function fakeExec(answers) {
  const calls = [];
  const exec = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts });
    const key = args.join(" ");
    for (const [match, reply] of answers) {
      if (key.includes(match)) return typeof reply === "function" ? reply(args) : reply;
    }
    return ok("");
  };
  return { exec, calls, argv: () => calls.map((c) => c.args.join(" ")) };
}

test("the listing becomes plain simulators, and the ones Xcode cannot run are dropped", () => {
  const sims = parseSimList(LISTING);
  assert.deepEqual(sims.map((one) => one.name), ["iPad Pro 11-inch (M4)", "iPhone 16", "iPhone 16 Pro"]);
  assert.equal(sims[0].runtime, "iOS 18 3");
  assert.equal(sims[2].state, "Booted");
  assert.deepEqual(parseSimList("not json"), []);
  assert.deepEqual(parseSimList(""), []);
});

test("choosing a simulator prefers what is asked for, then what is booted, then an iPhone", () => {
  const sims = parseSimList(LISTING);
  assert.equal(chooseSim(sims, "iPhone 16").sim.udid, "BBB");
  assert.equal(chooseSim(sims, "bbb").sim.udid, "BBB");
  assert.equal(chooseSim(sims, "").sim.udid, "CCC");
  assert.equal(chooseSim(sims.filter((one) => one.state !== "Booted"), "").sim.name, "iPhone 16");
  assert.match(chooseSim(sims, "iPhone 4").error, /no simulator called "iPhone 4"/);
  assert.match(chooseSim(sims, "iPhone 4").error, /iPhone 16 Pro/);
  assert.match(chooseSim([], "").error, /no iOS simulator on this machine/);
});

test("the screen size is read from the png the simulator hands back", () => {
  assert.deepEqual(parsePngSize(png(1179, 2556)), { width: 1179, height: 2556 });
  assert.equal(parsePngSize(Buffer.alloc(4)), null);
  assert.equal(parsePngSize(Buffer.alloc(40)), null);
  assert.equal(parsePngSize(null), null);
});

test("a key becomes a hardware button or a HID usage, and BACK is refused instead of guessed", () => {
  assert.deepEqual(keyOf("HOME"), { button: "home" });
  assert.deepEqual(keyOf("lock"), { button: "lock" });
  assert.deepEqual(keyOf("KEYCODE_HOME"), { button: "home" });
  assert.deepEqual(keyOf("ENTER"), { code: 40 });
  assert.deepEqual(keyOf("del"), { code: 42 });
  assert.deepEqual(keyOf("44"), { code: 44 });
  assert.match(keyOf("BACK").error, /no BACK|unknown key "BACK"/);
  assert.match(keyOf("").error, /there is no key/);
});

test("gestures are handed to baguette in device pixels, with the screen size as the space they live in", () => {
  assert.deepEqual(
    tapArgs("BBB", 997, 1212, 1179, 2556),
    ["tap", "--udid", "BBB", "--x", "997", "--y", "1212", "--width", "1179", "--height", "2556"]
  );
  const swipe = swipeArgs("BBB", 1, 2, 3, 4, 300, 1179, 2556);
  assert.deepEqual(swipe.slice(0, 12), ["swipe", "--udid", "BBB", "--start-x", "1", "--start-y", "2", "--end-x", "3", "--end-y", "4", "--width"]);
  assert.deepEqual(swipe.slice(-2), ["--duration", "0.3"]);
  assert.deepEqual(keyArgs("BBB", { button: "home" }), ["press", "--udid", "BBB", "--button", "home"]);
  assert.deepEqual(keyArgs("BBB", { code: 40 }), ["key", "--udid", "BBB", "--code", "40"]);
});

test("booting picks a simulator, waits for it, and measures the screen from a real screenshot", async () => {
  let booted = false;
  const { exec, argv } = fakeExec([
    ["simctl boot", () => { booted = true; return ok(""); }],
    ["list devices", () => ok(listing(booted ? "Booted" : "Shutdown"))],
    ["screenshot", { ok: true, out: png(1179, 2556), err: "" }]
  ]);
  const drive = createIosDriver({ tools, exec });
  const up = await drive.boot({ avd: "iPhone 16" });
  assert.equal(up.error, undefined);
  assert.equal(up.serial, "BBB");
  assert.equal(up.avd, "iPhone 16");
  assert.equal(up.fresh, true);
  assert.deepEqual([up.width, up.height], [1179, 2556]);
  assert.ok(argv().includes("simctl boot BBB"));
  assert.ok(argv().includes("simctl bootstatus BBB -b"));
});

test("a simulator that is already up is reused instead of booted again", async () => {
  const { exec, argv } = fakeExec([
    ["list devices", ok(LISTING)],
    ["screenshot", { ok: true, out: png(1206, 2622), err: "" }]
  ]);
  const drive = createIosDriver({ tools, exec });
  const up = await drive.boot({});
  assert.equal(up.serial, "CCC");
  assert.equal(up.fresh, false);
  assert.ok(!argv().some((one) => one.startsWith("simctl boot ")));
});

test("boot refuses a name that is not here rather than booting something else", async () => {
  const { exec, argv } = fakeExec([["list devices", ok(LISTING)]]);
  const drive = createIosDriver({ tools, exec });
  const up = await drive.boot({ avd: "Pixel 7" });
  assert.match(up.error, /no simulator called "Pixel 7"/);
  assert.ok(!argv().some((one) => one.includes("simctl boot")));
});

test("the screenshot comes back on stdout as bytes, not through a temporary file", async () => {
  const { exec, calls } = fakeExec([["screenshot", { ok: true, out: png(1179, 2556), err: "" }]]);
  const drive = createIosDriver({ tools, exec });
  const got = await drive.shot("BBB");
  assert.ok(got.png.length >= 24);
  const shot = calls.find((c) => c.args.includes("screenshot"));
  assert.deepEqual(shot.args, ["simctl", "io", "BBB", "screenshot", "--type=png", "-"]);
  assert.equal(shot.opts.encoding, "buffer");
});

test("an app that will not launch answers with the bundle ids that look like the one asked for", async () => {
  const { exec } = fakeExec([
    ["simctl launch", no("Unable to lookup app")],
    ["listapps", ok('CFBundleIdentifier = "com.example.reader"; CFBundleIdentifier = "com.apple.Maps";')]
  ]);
  const drive = createIosDriver({ tools, exec });
  const opened = await drive.openApp("BBB", "com.other.reader");
  assert.match(opened.error, /com\.example\.reader/);
  assert.ok(!opened.error.includes("com.apple.Maps"));
});

test("there is no accessibility tree on iOS, and the driver says so instead of answering nothing", async () => {
  const drive = createIosDriver({ tools, exec: fakeExec([]).exec });
  const got = await drive.tree("BBB");
  assert.match(got.error, /device_screenshot/);
});

test("a baguette that was pointed at and is not there explains itself with the one-line recipe", async () => {
  const { exec } = fakeExec([["tap", no("spawn baguette ENOENT")]]);
  const drive = createIosDriver({ tools, exec });
  const done = await drive.tap("BBB", 10, 20, 1179, 2556);
  assert.equal(done.ok, false);
  assert.match(done.err, /baguette is not where it was/);
  assert.ok(done.err.includes(BAGUETTE_RECIPE));
});

const loose = { ...tools, baguette: "" };
const tarball = Buffer.from("a baguette, as far as anyone here can tell");
const rightSha = createHash("sha256").update(tarball).digest("hex");

function baguetteWorld({ have = [], bytes = tarball, arch = "arm64", grab, wantSha = rightSha } = {}) {
  const here = new Set(have);
  const wrote = [];
  const moved = [];
  const { exec, calls } = fakeExec([]);
  const drive = createIosDriver({
    tools: loose,
    exec: async (cmd, args, opts) => {
      if (cmd === "/usr/bin/tar") here.add(join(loose.cacheDir, "Baguette"));
      return exec(cmd, args, opts);
    },
    exists: (path) => here.has(path),
    makeDir: () => {},
    arch,
    wantSha,
    grabBytes: grab || (async () => bytes),
    putFile: async (path, data) => { wrote.push({ path, size: data.length }); },
    moveFile: async (from, to) => { moved.push({ from, to }); here.add(to); },
    dropFile: async () => {},
    makeRunnable: async () => {}
  });
  return { drive, calls, wrote, moved, here };
}

test("baguette is fetched once, checked against the sha this hive pins, and kept in the hive home", async () => {
  const w = baguetteWorld();
  const got = await w.drive.ensureBaguette();
  assert.equal(got.error, undefined);
  assert.equal(got.bin, join(loose.cacheDir, BAGUETTE_NAME));
  assert.deepEqual(w.moved, [{ from: join(loose.cacheDir, "Baguette"), to: join(loose.cacheDir, BAGUETTE_NAME) }]);
  const untar = w.calls.find((c) => c.cmd === "/usr/bin/tar");
  assert.deepEqual(untar.args, untarArgs(join(loose.cacheDir, `${BAGUETTE_NAME}.tar.gz`), loose.cacheDir));
  assert.ok(untar.args.includes(BAGUETTE_ENTRY), "only the executable comes out, not the 38MB bundle beside it");
  assert.ok(untar.args.includes("--strip-components=1"), "and it lands as a plain file, not inside the folder the tarball carries");
  const again = await w.drive.ensureBaguette();
  assert.equal(again.bin, got.bin);
  assert.equal(w.wrote.length, 1, "the second call is the copy already on disk");
});

test("a download that does not match the pinned checksum installs nothing", async () => {
  const w = baguetteWorld({ bytes: Buffer.from("something else entirely") });
  const got = await w.drive.ensureBaguette();
  assert.match(got.error, /does not match the checksum/);
  assert.equal(w.moved.length, 0, "nothing was put where the driver would run it");
  assert.notEqual(rightSha, BAGUETTE_SHA256, "the pinned sha is the upstream tarball, not this test fixture");
});

test("a copy already on the machine is used instead of reaching the network", async () => {
  const kept = baguetteWorld({ have: [join(loose.cacheDir, BAGUETTE_NAME)], grab: async () => { throw new Error("the network was touched"); } });
  assert.equal((await kept.drive.ensureBaguette()).bin, join(loose.cacheDir, BAGUETTE_NAME));

  const brewed = baguetteWorld({ have: ["/opt/homebrew/bin/baguette"], grab: async () => { throw new Error("the network was touched"); } });
  assert.equal((await brewed.drive.ensureBaguette()).bin, "/opt/homebrew/bin/baguette");
});

test("a mac that is not arm64 is told upstream has no build for it, rather than downloading one that will not run", async () => {
  const w = baguetteWorld({ arch: "x64", grab: async () => { throw new Error("the network was touched"); } });
  const got = await w.drive.ensureBaguette();
  assert.match(got.error, /only publishes an arm64 build/);
  assert.ok(got.error.includes(BAGUETTE_URL));
});

test("a download that fails leaves the recipe behind instead of a blank tap", async () => {
  const w = baguetteWorld({ grab: async () => { throw new Error("getaddrinfo ENOTFOUND github.com"); } });
  const got = await w.drive.ensureBaguette();
  assert.match(got.error, /could not download baguette/);
  assert.ok(got.error.includes(BAGUETTE_RECIPE));
});

test("the log window is trimmed to the lines that were asked for", () => {
  assert.deepEqual(lastLines("a\nb\nc\n", 2), ["b", "c"]);
  assert.deepEqual(lastLines("a\nb", 10), ["a", "b"]);
  assert.deepEqual(lastLines("", 5), []);
});

test("the helper is named after the source it was built from, so an edited helper is a new binary", () => {
  const one = helperNameOf("/x.m", () => Buffer.from("first"));
  const two = helperNameOf("/x.m", () => Buffer.from("second"));
  assert.match(one, /^simscreen-[0-9a-f]{12}$/);
  assert.notEqual(one, two);
  assert.equal(one, helperNameOf("/x.m", () => Buffer.from("first")));
});

test("the helper is built once with arc and the frameworks it needs, then reused from the cache", async () => {
  const args = buildArgs("/hive/app/native/simscreen.m", "/hive/home/native/simscreen-abc");
  assert.deepEqual(args.slice(0, 6), ["-fobjc-arc", "-O2", "-o", "/hive/home/native/simscreen-abc", "/hive/app/native/simscreen.m", "-framework"]);
  for (const one of HELPER_FRAMEWORKS) assert.ok(args.includes(one), one);

  const seen = [];
  const { exec } = fakeExec([]);
  const drive = createIosDriver({
    tools,
    exec: async (cmd, argv, opts) => { seen.push(cmd); return exec(cmd, argv, opts); },
    exists: (path) => path === tools.source || seen.includes(tools.clang),
    makeDir: () => {},
    nameHelper: () => "simscreen-abc"
  });
  const first = await drive.ensureHelper();
  assert.equal(first.bin, "/hive/home/native/simscreen-abc");
  await drive.ensureHelper();
  assert.equal(seen.filter((one) => one === tools.clang).length, 1);
});

test("a helper that will not build stops the video with the reason, instead of retrying for ever", async () => {
  const drive = createIosDriver({
    tools,
    exec: async () => no("clang: error: no such file"),
    exists: (path) => path === tools.source,
    makeDir: () => {},
    nameHelper: () => "simscreen-abc"
  });
  const ends = [];
  const tape = drive.record("BBB", { onChunk: () => {}, onEnd: (why) => ends.push(why) });
  await new Promise((r) => setTimeout(r, 20));
  tape.stop();
  assert.equal(ends.length, 1);
  assert.match(ends[0], /could not build the screen helper: clang: error/);
});

test("video is the helper on the simulator's udid, and its bytes go straight through", async () => {
  const spawned = [];
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill() { this.killed = true; } });
  const drive = createIosDriver({
    tools,
    exec: async () => ok(""),
    exists: () => true,
    makeDir: () => {},
    nameHelper: () => "simscreen-abc",
    spawn: (bin, argv, opts) => { spawned.push({ bin, argv, opts }); return child; }
  });
  const chunks = [];
  const tape = drive.record("BBB", { onChunk: (one) => chunks.push(one) });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].bin, "/hive/home/native/simscreen-abc");
  assert.deepEqual(spawned[0].argv, helperArgs("BBB", { fps: 30, bitrate: 6000000 }));
  child.stdout.emit("data", Buffer.from([0, 0, 0, 1, 0x27]));
  assert.deepEqual([...chunks[0]], [0, 0, 0, 1, 0x27]);
  tape.stop();
  assert.equal(child.killed, true);
});

test("the tools point at xcrun, at the helper source in the repo, and at a cache under the hive home", () => {
  const found = iosToolsOf({ env: { HIVE_HOME: "/hive/home" }, home: "/Users/x", here: "/hive/app/lib" });
  assert.equal(found.xcrun, "/usr/bin/xcrun");
  assert.equal(found.source, "/hive/app/native/simscreen.m");
  assert.equal(found.cacheDir, "/hive/home/native");
  assert.equal(found.baguette, "", "nothing is pointed at until someone points at it");
  assert.equal(iosToolsOf({ env: { HIVE_BAGUETTE: "/opt/bag" }, home: "/Users/x", here: "/hive/app/lib" }).baguette, "/opt/bag");
  assert.equal(iosToolsOf({ env: {}, home: "/Users/x", here: "/hive/app/lib" }).cacheDir, "/Users/x/.hive/native");
});

test("what the helper writes is what the pane already knows how to read", () => {
  const block = (() => {
    const from = "\nconst nalTypeOf =";
    const to = "\nfunction h264Pictures";
    const a = panes.indexOf(from);
    const b = panes.indexOf(to, a + 1);
    assert.ok(a >= 0 && b > a, "could not cut the h264 parser out of chat-and-panes.js");
    return panes.slice(a, b);
  })();
  const { h264Units, nalTypeOf, codecOfSps } = new Function(`${block}\nreturn { h264Units, nalTypeOf, codecOfSps };`)();

  const sps = Buffer.from("0000000127420032ab402500a0f25a00", "hex");
  const pps = Buffer.from("0000000128ce3c8000", "hex");
  const idr = Buffer.concat([Buffer.from([0, 0, 0, 1, 0x65]), Buffer.alloc(8, 0x42)]);

  const units = [];
  const eat = h264Units((one) => units.push(one));
  eat(new Uint8Array(Buffer.concat([sps, pps, idr])));
  eat.rest();

  assert.deepEqual(units.map(nalTypeOf), [7, 8, 5]);
  assert.equal(codecOfSps(units[0]), "avc1.420032");
});
