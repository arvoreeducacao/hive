import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { RECORD_BITRATE, RECORD_LIMIT, createDriver, recordArgs } from "../lib/device.mjs";
import { app } from "./dom.mjs";

const { canWatchVideo, codecOfSps, h264Pictures, h264Units } = await app("chat-and-panes");

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(here, "..", "app.html"), "utf8");
const panes = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
const deviceRoutes = readFileSync(join(here, "..", "routes", "device.mjs"), "utf8");

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const nal = (type, size, fill = 0x42) => {
  const one = new Uint8Array(3 + 1 + size);
  one.set([0, 0, 1], 0);
  one[3] = type;
  one.fill(fill, 4);
  return one;
};

const stream = (...units) => {
  const all = new Uint8Array(units.reduce((n, u) => n + u.length, 0));
  let at = 0;
  for (const u of units) { all.set(u, at); at += u.length; }
  return all;
};

test("the recorder is asked for h264 on the wire, with a limit it can restart from", () => {
  assert.deepEqual(recordArgs("emulator-5554"), [
    "-s", "emulator-5554", "exec-out", "screenrecord", "--output-format=h264",
    "--time-limit", String(RECORD_LIMIT), "--bit-rate", String(RECORD_BITRATE), "-"
  ]);
  assert.ok(RECORD_LIMIT <= 180, "screenrecord refuses more than three minutes");
  assert.deepEqual(recordArgs("x", { limit: 5, bitrate: 900 }).slice(-5), ["--time-limit", "5", "--bit-rate", "900", "-"]);
});

function fakeSpawns() {
  const born = [];
  const spawn = (cmd, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = () => { child.killed = true; };
    child.cmd = cmd;
    child.args = args;
    born.push(child);
    return child;
  };
  return { born, spawn };
}

test("the tape restarts itself when screenrecord hits its limit, and stops when told to", () => {
  const { born, spawn } = fakeSpawns();
  const drive = createDriver({ tools: { adb: "/sdk/adb", emulator: "/sdk/emulator" }, spawn, now: () => 0 });
  const got = [];
  const tape = drive.record("emulator-5554", { onChunk: (c) => got.push(c) });
  assert.equal(born.length, 1);
  assert.equal(born[0].cmd, "/sdk/adb");
  assert.ok(born[0].args.includes("screenrecord"));
  born[0].stdout.emit("data", Uint8Array.from([1, 2, 3]));
  assert.deepEqual([...got[0]], [1, 2, 3]);
  born[0].emit("close");
  assert.equal(born.length, 2, "the limit is not the end of the stream — a new recorder takes over");
  born[1].stdout.emit("data", Uint8Array.from([9]));
  assert.equal(got.length, 2);
  tape.stop();
  assert.equal(born[1].killed, true);
  born[1].emit("close");
  assert.equal(born.length, 2, "nothing comes back after stop");
});

test("a device that keeps dropping the recorder is given up on, not spun forever", () => {
  const { born, spawn } = fakeSpawns();
  let clock = 0;
  const drive = createDriver({ tools: { adb: "/sdk/adb", emulator: "/e" }, spawn, now: () => clock });
  const ends = [];
  drive.record("emulator-5554", { onEnd: (why) => ends.push(why) });
  for (let i = 0; i < 6 && born.length <= 5; i++) {
    clock += 10;
    born[born.length - 1].emit("close");
  }
  assert.ok(born.length <= 4, `gave up after ${born.length} tries instead of spinning`);
  assert.match(ends[0] || "", /stopped sending video/);
});

test("a recorder that runs a long time before closing is always restarted", () => {
  const { born, spawn } = fakeSpawns();
  let clock = 0;
  const drive = createDriver({ tools: { adb: "/sdk/adb", emulator: "/e" }, spawn, now: () => clock });
  drive.record("emulator-5554", {});
  for (let i = 0; i < 5; i++) {
    clock += 200000;
    born[born.length - 1].emit("close");
  }
  assert.equal(born.length, 6, "a full three-minute run is a healthy run, however many times it happens");
});

test("the stream is cut on start codes, even when one is split across two reads", () => {
  const seen = [];
  const eat = h264Units((one) => seen.push(one));
  const whole = stream(nal(7, 16), nal(8, 3), nal(5, 40), nal(1, 20), nal(1, 20));
  eat(whole.slice(0, 25));
  eat(whole.slice(25, 26));
  eat(whole.slice(26));
  assert.deepEqual(seen.map((u) => u[3] & 0x1f), [7, 8, 5, 1], "the last unit waits for the next start code");
  eat(stream(nal(1, 8)));
  assert.deepEqual(seen.map((u) => u[3] & 0x1f), [7, 8, 5, 1, 1]);
  assert.deepEqual([...seen[0].slice(0, 4)], [0, 0, 1, 7], "each unit carries its own start code");
});

test("nothing is emitted until a second start code proves where the first unit ends", () => {
  const seen = [];
  const eat = h264Units((one) => seen.push(one));
  eat(stream(nal(7, 10)));
  assert.equal(seen.length, 0);
  eat(stream(nal(5, 10)));
  assert.equal(seen.length, 1);
});

test("units are gathered into pictures, and the one carrying an IDR is the key", () => {
  const shots = [];
  const make = h264Pictures((bytes, key) => shots.push({ bytes, key }));
  const eat = h264Units(make);
  eat(stream(nal(7, 8), nal(8, 4), nal(5, 30), nal(1, 12), nal(1, 12), nal(1, 4)));
  assert.equal(shots.length, 3);
  assert.equal(shots[0].key, true, "the first picture carries the header and the IDR");
  assert.deepEqual([shots[1].key, shots[2].key], [false, false]);
  assert.equal(shots[0].bytes.length, (3 + 1 + 8) + (3 + 1 + 4) + (3 + 1 + 30), "the header travels glued to the key picture");
  assert.deepEqual([...shots[1].bytes.slice(0, 4)], [0, 0, 1, 1]);
});

test("the codec is read off the sequence header, not guessed", () => {
  const sps = Uint8Array.from([0, 0, 1, 0x67, 0x42, 0x80, 0x1f, 0xaa]);
  assert.equal(codecOfSps(sps), "avc1.42801f");
  const high = Uint8Array.from([0, 0, 1, 0x67, 0x64, 0x00, 0x28]);
  assert.equal(codecOfSps(high), "avc1.640028");
});

test("a browser without a video decoder is not offered one", () => {
  assert.equal(canWatchVideo(), false, "the sandbox has no VideoDecoder, and asking must not throw");
});

test("the route hands the seat's recorder straight to the response, and stops it when the page leaves", () => {
  const route = cut(deviceRoutes, 'on(null, "/api/device/video"', "\n  });\n", "routes/device.mjs");
  assert.match(route, /content-type": "video\/h264"/);
  assert.match(route, /cache-control": "no-store"/);
  assert.match(route, /foundOne\.drive\.record\(foundOne\.d\.serial/);
  assert.match(route, /onChunk: \(chunk\) => \{ if \(!res\.writableEnded\) res\.write\(chunk\); \}/);
  assert.match(route, /req\.on\("close", \(\) => tape\.stop\(\)\)/);
  assert.match(route, /res\.on\("close", \(\) => tape\.stop\(\)\)/);
  assert.match(route, /if \(!isSeatName\(name\)\) return json/);
});

test("the pane has a canvas for the video, a tap on it, and the photo loop steps aside", () => {
  const pane = cut(panes, "function devicePaneOf(el, s) {", "\n}\n", "chat-and-panes.js");
  assert.match(pane, /<canvas class="device-live" hidden/);
  assert.match(pane, /live\.addEventListener\("click", \(ev\) => \{ ev\.stopPropagation\(\); tapDevice\(s\.name, live, ev\); \}\)/);
  const ask = cut(panes, "function askDeviceFrame(name, now = false) {", "\n}\n", "chat-and-panes.js");
  assert.match(ask, /deviceTape\?\.painted/, "no photo is taken while the video is painting");
  const paint = cut(panes, "function paintDeviceOfChat(el, s) {", "\n}\n", "chat-and-panes.js");
  assert.match(paint, /if \(!st\.deviceGone && startDeviceVideo\(s\.name\)\) \{ gone\.hidden = true; return; \}/);
  const give = cut(panes, "function giveUpVideo(name, tape) {", "\n}\n", "chat-and-panes.js");
  assert.match(give, /askDeviceFrame\(name, true\)/, "when the video fails the photos come back");
});

test("a tap lands the same whether it came from the photo or from the video", () => {
  const tap = cut(panes, "function tapDevice(name, face, ev) {", "\n}\n", "chat-and-panes.js");
  assert.match(tap, /face\.naturalWidth \|\| face\.width/);
  assert.match(tap, /face\.naturalHeight \|\| face\.height/);
});

test("when the stream goes quiet the last unit is shown instead of waiting for the next one", () => {
  const shots = [];
  const eat = h264Units(h264Pictures((bytes, key) => shots.push(key)));
  eat(stream(nal(7, 8), nal(8, 4), nal(5, 30)));
  assert.equal(shots.length, 0, "the key picture is still waiting for a start code that may never come");
  eat.rest();
  assert.equal(shots.length, 1, "a quiet stream hands over what it already holds");
  assert.equal(shots[0], true);
  eat.rest();
  assert.equal(shots.length, 1, "and nothing is handed over twice");
});

test("a half-read unit is never passed off as whole", () => {
  const seen = [];
  const eat = h264Units((one) => seen.push(one));
  eat(Uint8Array.from([0, 0]));
  eat.rest();
  assert.equal(seen.length, 0, "bytes that are not even a start code are not a picture");
  eat(Uint8Array.from([1, 0x65]));
  eat.rest();
  assert.equal(seen.length, 0, "a start code with almost nothing after it is not a picture either");
});

test("the settle timer is armed on every read and dropped when the tape stops", () => {
  const watch = cut(panes, "async function watchDevice(name, canvas, tape, control) {", "\n}\n", "chat-and-panes.js");
  assert.match(watch, /clearTimeout\(tape\.settle\);\n\s+eat\(value\);/);
  assert.match(watch, /tape\.settle = setTimeout\(\(\) => \{ if \(st\.deviceTape === tape\) eat\.rest\(\); \}, VIDEO_SETTLE\);/);
  assert.match(cut(panes, "function stopDeviceVideo() {", "\n}\n", "chat-and-panes.js"), /clearTimeout\(tape\.settle\)/);
});

test("the video pane says nothing while it connects, and the pointer is a finger", () => {
  const paint = cut(panes, "function paintDeviceOfChat(el, s) {", "\n}\n", "chat-and-panes.js");
  assert.match(paint, /if \(!st\.deviceGone && startDeviceVideo\(s\.name\)\) \{ gone\.hidden = true; return; \}/);
  const waiting = paint.indexOf("waiting for the first frame");
  const video = paint.indexOf("startDeviceVideo");
  assert.ok(video < waiting, "the video decides before the waiting box is ever written");
  const rule = cut(page, ".device-screen, .device-live {", "}", "app.html");
  assert.doesNotMatch(rule, /crosshair/);
  const drawn = /cursor: url\("data:image\/svg\+xml,([^"]+)"\) (\d+) (\d+), pointer/.exec(rule);
  assert.ok(drawn, "the screen of a phone is touched, so the cursor is drawn, not borrowed from links");
  const svg = decodeURIComponent(drawn[1]);
  const box = /width='(\d+)' height='(\d+)'/.exec(svg);
  assert.ok(box, "the drawing carries its own size");
  assert.equal(Number(drawn[2]), Number(box[1]) / 2, "the hot spot is the middle of the circle, not its corner");
  assert.equal(Number(drawn[3]), Number(box[2]) / 2);
  assert.ok(Number(box[1]) <= 128 && Number(box[2]) <= 128, "a browser drops a cursor bigger than 128px");
  assert.equal((svg.match(/<circle/g) || []).length, 2, "a dark ring under a light one, so it reads on either wallpaper");
});
