import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAME_MS } from "../assets/frame-rate.mjs";
import { AMPLITUDE, BLINK_SHUT, SCAN_MS, easeEye, glanceOf, idlePose, rhythmOf, startIdleClock } from "../assets/avatar/idle-clock.mjs";
import { SACCADES, avatarSvg, lookDeltas } from "../assets/avatar/avatar.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const rhythm = { breath: 4, sway: 8, every: 5, at: 0, glance: 10, glanceAt: 0 };

test("the body breathes and sways on the wave the keyframes used to draw", () => {
  const start = idlePose(rhythm, 0);
  assert.deepEqual(start.scale, [1, 1]);
  assert.equal(start.rotate, -AMPLITUDE.face.sway);
  const full = idlePose(rhythm, rhythm.breath / 2);
  assert.deepEqual(full.scale, [1 + AMPLITUDE.face.breath[0], 1 + AMPLITUDE.face.breath[1]]);
  assert.equal(idlePose(rhythm, rhythm.sway / 2).rotate, AMPLITUDE.face.sway);
  assert.equal(idlePose(rhythm, rhythm.sway / 2, AMPLITUDE.mug).rotate, AMPLITUDE.mug.sway);
});

test("the eyes shut once per blink, for a fraction of a second", () => {
  const shutAt = rhythm.every * (BLINK_SHUT[0] + BLINK_SHUT[1]) / 2;
  assert.equal(idlePose(rhythm, shutAt).shut, true);
  assert.equal(idlePose(rhythm, rhythm.every / 2).shut, false);
  assert.equal(idlePose({ ...rhythm, at: -1 }, shutAt - 1).shut, true, "the offset moves the blink like animation-delay did");
  const shutFor = rhythm.every * (BLINK_SHUT[1] - BLINK_SHUT[0]);
  assert.ok(shutFor > 0.1 && shutFor < 0.3, `${shutFor}s is not a blink`);
});

test("a glance lands on the next saccade and holds there", () => {
  const second = SACCADES[1];
  const expected = lookDeltas(null, second.yaw, second.pitch)[0];
  assert.deepEqual(glanceOf(rhythm, rhythm.glance * (second.at / 100) + 0.01), expected);
  assert.deepEqual(glanceOf(rhythm, 0), lookDeltas(null, 0, 0)[0]);
});

test("the rhythm comes from the face itself, and a face without one gets the old defaults", () => {
  const svg = { style: { getPropertyValue: (name) => ({ "--av-breath": "3.4s", "--av-blink-at": "-2.1s" })[name] || "" } };
  const read = rhythmOf(svg);
  assert.equal(read.breath, 3.4);
  assert.equal(read.at, -2.1);
  assert.equal(read.sway, 7);
  assert.deepEqual(rhythmOf(null), { breath: 4, sway: 7, every: 5, at: 0, glance: 14, glanceAt: 0 });
});

test("the mood's tempo, set on the face's slot, wins over the face's own breath", () => {
  const svg = { style: { getPropertyValue: (name) => (name === "--av-breath" ? "4.5s" : "") } };
  const host = { style: { getPropertyValue: (name) => (name === "--av-breath" ? "1.9s" : "") } };
  assert.equal(rhythmOf(svg, host).breath, 1.9, "thrashing breathes at its own tempo");
  assert.equal(rhythmOf(svg).breath, 4.5, "with no mood the face keeps its own");
});

test("a new tempo carries on from the breath already taken, without a jump", () => {
  const face = fakeFace();
  const doc = { hidden: false, querySelectorAll: () => [face.host] };
  const { win, run } = fakeScreen();
  startIdleClock({ doc, win });
  const heights = [];
  const track = (frames) => { for (let i = 0; i < frames; i++) { run(); heights.push(Number(face.props.scale.split(" ")[1])); } };
  track(37);
  face.props["--av-breath"] = "1.9s";
  track(48);
  const steps = heights.slice(1).map((h, i) => Math.abs(h - heights[i]));
  const largest = Math.max(...steps);
  const smoothest = 2 * Math.PI * AMPLITUDE.face.breath[1] / 2 / 1.9 * (FRAME_MS / 1000);
  assert.ok(largest <= smoothest * 1.05, `one frame moved the breath by ${largest}, more than the fastest tempo ever can (${smoothest})`);
  const late = heights.slice(-46);
  assert.ok(Math.max(...late) - Math.min(...late) > AMPLITUDE.face.breath[1] * 0.9, "and the faster tempo is the one now playing");
});

test("the eyes ease toward where they look and stop exactly there", () => {
  let at = { dx: 0, dy: 0 };
  const goal = { dx: 4, dy: -2 };
  for (let i = 0; i < 20; i++) at = easeEye(at, goal, 0.45);
  assert.deepEqual(at, goal);
});

test("the face carries no animation of its own any more", () => {
  const svg = avatarSvg({ shape: "ball", face: "dark", colour: "blue" });
  assert.doesNotMatch(svg, /<style>/, "no keyframes injected per face");
  assert.doesNotMatch(svg, /--av-look/);
  assert.match(svg, /--av-breath:[\d.]+s/, "the rhythm still rides on the face");
  assert.doesNotMatch(page, /@keyframes av-(breath|sway|blink|flicker)/, "nothing in the page animates a face per screen frame");
  assert.doesNotMatch(page, /\.av-alive[^{]*\{[^}]*animation/, "and no rule hands one back");
});

test("the collapsed rail holds every face in it still, the new rail included", () => {
  assert.match(page, /#shell\.rail-min #rail \.av-alive \{ --av-still: 1; \}/);
  assert.match(page, /<nav id="rail"[^>]*>.*<div id="rail-next">/, "the new rail lives inside #rail");
  assert.match(page, /body\.no-motion \.av-alive/, "calm and away hold them too");
});

function fakeScreen() {
  const waits = [];
  const frames = [];
  const win = {
    setTimeout(fn, ms) { waits.push({ fn, ms }); return waits.length; },
    clearTimeout(id) { if (id) waits[id - 1] = null; },
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    getComputedStyle: (host) => ({ getPropertyValue: () => (host.still ? "1" : "0") })
  };
  let now = 0;
  const run = () => {
    const at = waits.findIndex(Boolean);
    if (at < 0) return null;
    const { fn, ms } = waits[at];
    waits[at] = null;
    now += ms;
    fn();
    const frame = frames.shift();
    frame?.(now);
    return ms;
  };
  return { win, run };
}

function fakeFace({ still = false } = {}) {
  const props = {};
  const classes = new Set(["av-alive"]);
  const look = { style: { transform: "", removeProperty() { this.transform = ""; } } };
  const seat = { dataset: { eye: "0" }, querySelector: () => look };
  const svg = {
    isConnected: true,
    classList: { contains: (name) => name === "avatar" },
    style: { getPropertyValue: () => "" },
    querySelectorAll: () => [seat]
  };
  const host = {
    still,
    isConnected: true,
    classList: {
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      remove: (name) => classes.delete(name)
    },
    style: {
      set scale(v) { props.scale = v; },
      set rotate(v) { props.rotate = v; },
      getPropertyValue: (name) => props[name] || "",
      removeProperty: (name) => { delete props[name]; }
    },
    querySelector: () => svg,
    getClientRects: () => [1],
    closest: () => null
  };
  return { host, props, classes, look, svg };
}

test("every frame waits a twenty-fourth of a second, whatever the screen", () => {
  const face = fakeFace();
  const doc = { hidden: false, querySelectorAll: () => [face.host] };
  const { win, run } = fakeScreen();
  const clock = startIdleClock({ doc, win });
  const seen = [];
  for (let i = 0; i < 30; i++) seen.push(run());
  assert.ok(seen.every((ms) => ms === FRAME_MS), `waits were ${[...new Set(seen)].join(", ")}`);
  assert.ok(face.props.scale && face.props.rotate, "the body moves");
  clock.stop();
  assert.equal(face.props.scale, undefined, "stopping hands the face back untouched");
});

test("a face held still is left alone, and the clock parks instead of drawing", () => {
  const face = fakeFace({ still: true });
  const doc = { hidden: false, querySelectorAll: () => [face.host] };
  const { win, run } = fakeScreen();
  startIdleClock({ doc, win });
  run();
  assert.equal(run(), SCAN_MS, "nothing to draw, so it only checks back once a second");
  assert.equal(face.props.scale, undefined);
  assert.equal(face.classes.has("av-blinking"), false);
});

test("a face taken over by a mood is let go on the next frame", () => {
  const face = fakeFace();
  const doc = { hidden: false, querySelectorAll: () => [face.host] };
  const { win, run } = fakeScreen();
  startIdleClock({ doc, win });
  run();
  run();
  assert.ok(face.props.scale);
  face.classes.delete("av-alive");
  run();
  assert.equal(face.props.scale, undefined);
  assert.equal(face.props.rotate, undefined);
});
