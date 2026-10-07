import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createOutputTap, isOutputName, listOutputs, loudEnough, monitorOf, outputsFromPactl } from "../lib/meeting-outputs.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

const SINKS = JSON.stringify([
  { name: "alsa_output.pci-0000_08_00.1.hdmi-stereo", description: "(null)", properties: { "device.description": "GA106 High Definition Audio Controller", "node.nick": "HDMI 0" } },
  { name: "alsa_output.usb-headset", description: "Headset USB", properties: {} },
  { name: "bad name; rm -rf /", properties: {} }
]);

test("the outputs are read the way the system names them, with the one in use marked", () => {
  assert.deepEqual(outputsFromPactl(SINKS, "alsa_output.usb-headset"), [
    { id: "alsa_output.pci-0000_08_00.1.hdmi-stereo", name: "GA106 High Definition Audio Controller · HDMI 0", default: false },
    { id: "alsa_output.usb-headset", name: "Headset USB", default: true }
  ]);
  assert.deepEqual(outputsFromPactl("not json"), []);
});

test("only linux with pactl names its outputs; everywhere else the window keeps listening", async () => {
  assert.deepEqual(await listOutputs({ platform: "darwin" }), { supported: false, outputs: [] });
  assert.deepEqual(await listOutputs({ platform: "linux", exec: async () => ({ ok: false, out: "" }) }), { supported: false, outputs: [] });
  const found = await listOutputs({ platform: "linux", exec: async (cmd, args) => ({ ok: true, out: args[0] === "get-default-sink" ? "alsa_output.usb-headset\n" : SINKS }) });
  assert.equal(found.supported, true);
  assert.equal(found.outputs.find((one) => one.default).id, "alsa_output.usb-headset");
});

test("what is recorded is the monitor of the output picked, and a strange name falls back to the default", () => {
  assert.equal(monitorOf(""), "@DEFAULT_MONITOR@");
  assert.equal(monitorOf("alsa_output.usb-headset"), "alsa_output.usb-headset.monitor");
  assert.equal(monitorOf("x; rm -rf /"), "@DEFAULT_MONITOR@");
  assert.equal(isOutputName("x y"), false);
});

test("a quiet output is brought up before the model hears it, and silence is dropped", () => {
  assert.equal(loudEnough(new Float32Array(1600)), null);
  const quiet = new Float32Array(1600).fill(0.01);
  const raised = loudEnough(quiet);
  assert.ok(Math.abs(raised[0] - 0.08) < 1e-6, "0.01 at most eight times louder, so noise is not turned into a voice");
  assert.equal(loudEnough(new Float32Array(1600).fill(0.002)), null, "a hum below the floor is not sound to write down");
  const loud = new Float32Array(1600).fill(0.7);
  assert.equal(loudEnough(loud), loud);
});

test("the tap turns the bytes of parec into pieces, across a split sample, and hands over the rest when it stops", async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => { child.emit("close"); };
  const asked = [];
  const pieces = [];
  const tap = createOutputTap({ output: "alsa_output.usb-headset", onChunk: (chunk) => pieces.push(chunk), spawn: (cmd, args) => { asked.push([cmd, ...args]); return child; } });
  assert.deepEqual(asked[0].slice(0, 3), ["parec", "--device", "alsa_output.usb-headset.monitor"]);
  assert.ok(asked[0].includes("--rate=16000") && asked[0].includes("--channels=1") && asked[0].includes("--format=float32le"));
  const sound = Buffer.from(new Float32Array(16000).fill(0.25).buffer);
  child.stdout.emit("data", sound.subarray(0, 4001));
  child.stdout.emit("data", sound.subarray(4001));
  assert.equal(tap.heard(), true);
  assert.equal(pieces.length, 0);
  await tap.stop();
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].pcm.length, 16000);
  assert.ok(Math.abs(pieces[0].pcm[15999] - 0.25) < 1e-6);
  await tap.stop();
  assert.equal(pieces.length, 1);
});

test("a right click on a meeting of your own offers to delete it, and nobody else's", () => {
  const view = readFileSync(join(HERE, "src/panels/meetings.jsx"), "utf8");
  const screen = readFileSync(join(HERE, "src/app/meetings.js"), "utf8");
  assert.match(view, /onContextMenu=\{\(ev\) => \{ if \(!r\(\)\.mine\) return; ev\.preventDefault\(\)/);
  assert.match(screen, /mine: one\.owner === me && !live/);
  assert.match(screen, /removeRow: \(\) => \{[^}]*removeMeeting\(id\)/);
});
