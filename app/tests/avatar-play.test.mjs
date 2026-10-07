import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRAME_MS, PARK_MS, PLAY_IDS, PLAY_BY_ID, frameOf, frameSvg, holdOf, mountPlayer, playHasEyes } from "../assets/avatar/avatar-play.mjs";
import { MOODS, MOOD_PLAY, MOOD_BREATH } from "../assets/mood.mjs";
import { SHAPES } from "../assets/avatar/avatar.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(HERE, "src", "app");
const read = (file) => readFileSync(join(SRC, file), "utf8");
const avatars = read("avatars.js");
const code = readdirSync(SRC).filter((one) => one.endsWith(".js")).map(read).join("\n");
const spec = { shape: "capsule", face: "dark", colour: "blue", wear: {} };
const at = (id, t, clock = t + 4) => frameOf(spec, id, clock, t, null);

test("the engine's twenty-four are all here", () => {
  assert.deepEqual([...PLAY_IDS].sort(), [
    "alert", "burst", "comet", "cross", "egg", "exclaim", "giggle", "glee", "hug", "idle", "muse", "notify",
    "orbit", "play", "sing", "siren", "sleep", "snooze", "soar", "strut", "swirl", "wave", "wide", "wink"
  ]);
});

test("a robot keeps its body: no play changes the shell, only where it stands and how it leans", () => {
  for (const id of PLAY_IDS) {
    assert.ok(PLAY_BY_ID.get(id).keepBody, `${id} would deform the body`);
    for (const t of [0, 0.2, 0.7, 1.4, 2.3, 3.2]) {
      const frame = at(id, t);
      assert.ok(Math.abs(frame.body.rot) <= 20, `${id} at ${t}s leans ${frame.body.rot} degrees`);
      assert.ok(frame.body.sx > 0.85 && frame.body.sx < 1.15 && frame.body.sy > 0.85 && frame.body.sy < 1.15, `${id} at ${t}s stretches the body`);
      const svg = frameSvg(spec, frame, "t");
      assert.ok(!svg.includes("NaN") && !svg.includes("undefined"), `${id} at ${t}s wrote junk into the svg`);
      assert.match(svg, /<clipPath id="t-sc"/, `${id} at ${t}s lost the screen`);
    }
  }
});

test("the arms exist only for the siren, and never touch the body", () => {
  for (const id of PLAY_IDS) {
    for (const t of [0.3, 1.1, 2.2]) {
      const frame = at(id, t);
      if (id === "siren") assert.ok(frame.arms, "the siren waves for help");
      else assert.equal(frame.arms, null, `${id} grew arms`);
    }
  }
  const svg = frameSvg(spec, at("siren", 1), "t");
  assert.match(svg, /class="av-arm"/);
  const swings = [0, 0.2, 0.4].map((dt) => at("siren", 1, 5 + dt).arms.swing);
  assert.ok(new Set(swings).size === 3, "the arms are moving");
});

test("the siren is worn, not become: it takes the antenna's place, the eyes go red and blink", () => {
  const on = at("siren", 1);
  assert.equal(on.look, "scared");
  assert.equal(on.red, 1);
  assert.ok(on.siren, "the lamp is on");
  const svg = frameSvg(spec, on, "t");
  assert.match(svg, /class="av-siren"/);
  assert.ok(!svg.includes("av-crest"), "the antenna is under the lamp");
  assert.match(svg, /#e8483f/, "the glass is red");
  const blink = new Set([0, 0.25, 0.5, 0.75].map((dt) => at("siren", 1, 5 + dt).eyeAlpha));
  assert.ok(blink.size >= 2, "the red eyes blink");
  const sweep = [0, 0.3, 0.6, 0.9, 1.2].map((dt) => at("siren", 1, 5 + dt).siren);
  assert.ok(sweep.some((s) => s.right > 0.7) && sweep.some((s) => s.left > 0.7), "the light sweeps both ways");
  assert.ok(sweep.every((s) => s.left < 0.2 || s.right < 0.2), "sideways, never both at once");
  const quiet = frameSvg(spec, at("idle", 1), "t");
  assert.ok(!quiet.includes("av-siren"), "a calm face carries no lamp");
});

test("the light keeps its turn when the nag asks for the siren again", () => {
  const mid = at("siren", 3, 9.4).siren;
  const nagged = at("siren", 0, 9.4).siren;
  assert.equal(mid.right, nagged.right, "the sweep comes off the shared clock, not off this run");
});

test("the siren replaces the hat while it is on", () => {
  const hatted = { ...spec, wear: { hat: "cap" } };
  const calm = frameSvg(hatted, frameOf(hatted, "idle", 5, 1, null), "t");
  const alarm = frameSvg(hatted, frameOf(hatted, "siren", 5, 1, null), "t");
  assert.match(calm, /data-wear="hat:cap"/);
  assert.ok(!alarm.includes('data-wear="hat:cap"'), "the cap comes off for the lamp");
});

test("being thrown across the window and walking home: scared in the air, angry on the floor", () => {
  assert.equal(at("soar", 0.5).look, "scared");
  const cross = at("cross", 0.5);
  assert.equal(cross.look, "angry");
  assert.ok(cross.tint > 0.5, "the screen goes red");
  assert.ok(cross.blush > 0.3, "with colour under the eyes");
  const huff = new Set([0, 0.1, 0.2].map((dt) => at("cross", 0.5 + dt).body.dx));
  assert.equal(huff.size, 3, "and it huffs");
  assert.equal(at("strut", 0.5).look, "happy", "and recovers a little dignity on the doorstep");
  const glee = at("glee", 0.5);
  assert.equal(glee.look, "joy", "the first throws are a joy ride home");
  assert.equal(glee.blush, 0, "and plain cheeks");
  assert.equal(glee.tint, 0, "and no red on the screen");
  assert.ok(new Set([0, 0.2, 0.4].map((dt) => at("glee", 0.5, 5 + dt).wobble)).size === 3, "the antenna dances");
});

test("the tickle blushes and wiggles, and says nothing", () => {
  const g = at("giggle", 0.4);
  assert.equal(g.look, "happy");
  assert.equal(g.blush, 1);
  assert.notEqual(at("giggle", 0.4).body.rot, at("giggle", 0.5).body.rot, "the wiggle is alive");
  assert.ok(at("giggle", 1.65).body.rot === 0, "and it settles");
});

test("the hug is a squeeze of the whole body, not a stretch", () => {
  const mid = at("hug", 0.27);
  assert.ok(mid.body.sx > 1.05 && mid.body.sy < 0.95, "wider and shorter at the middle of the squeeze");
  assert.ok(Math.abs(at("hug", 1.2).body.sx - 1) < 0.02, "and back to itself");
});

test("the cheer is a hop with the antenna lit, and nothing drawn around the body", () => {
  const hops = [0.15, 0.5, 0.85, 1.2].map((t) => at("burst", t).body.dy);
  assert.ok(hops.some((dy) => dy < -8), "it leaves the floor");
  assert.ok(at("burst", 0.3).flash > 0.5, "the antenna lights up");
  const svg = frameSvg(spec, at("burst", 0.3), "t");
  assert.ok(!/stroke-dasharray|<polygon/.test(svg), "no ring, no stars");
  assert.equal(at("burst", 2.4).body.dy, at("idle", 2.4).body.dy, "and it is standing still before it is over");
});

test("the show sways to the clock and keeps the creature whole", () => {
  const turn = [0, 0.2, 0.45, 0.7].map((dt) => at("sing", 1 + dt, 5 + dt));
  assert.equal(new Set(turn.map((f) => f.body.rot)).size, 4, "the gingado is alive");
  for (const f of turn) assert.equal(f.eyes.length, 2, "both eyes stay on through the song");
  const mid = frameOf(spec, "sing", 9.4, 3, null);
  const nagged = frameOf(spec, "sing", 9.4, 0.9, null);
  assert.equal(mid.body.rot, nagged.body.rot, "the beat comes off the shared clock, not off this run");
});

test("the wave rocks the whole robot and settles before it is over", () => {
  const turn = [0.3, 0.5, 0.7, 0.9].map((t) => at("wave", t));
  assert.equal(new Set(turn.map((f) => f.body.rot)).size, 4, "the rock is alive");
  assert.equal(Math.abs(at("wave", 2.3).body.rot), 0, "and it is standing straight at the end");
  assert.ok(holdOf("wave") <= 3, "a hello is a moment, not a stay");
});

test("night sleep and the sleep of the forlorn both keep the body on stage, with the screen dimmed", () => {
  for (const id of ["sleep", "snooze"]) {
    const f = at(id, 1);
    assert.ok(["dim", "sleepy"].includes(f.look), `${id} looks ${f.look}`);
    assert.ok(f.glow < 0.5, `${id} keeps the screen bright`);
    assert.equal(f.eyes.length, 2, `${id} has no eyes to narrow`);
  }
  assert.equal(playHasEyes("sleep"), false, "a face fast asleep does not follow the cursor");
  assert.equal(playHasEyes("snooze"), true, "a doze still peeks");
});

test("the egg is the robot with its screen off, and it boots into the cheer", () => {
  const egg = at("egg", 0.5);
  assert.equal(egg.eyeAlpha, 0);
  assert.equal(egg.glow, 0);
  assert.equal(playHasEyes("egg"), false);
  assert.match(avatars, /mugPlay\("egg"\)/);
  assert.match(avatars, /mugPlay\("burst"\), 1000 \* holdOf\("egg"\)/);
});

test("the bridge and the blush move with the eyes when the eyes follow the pointer", () => {
  const worn = { ...spec, wear: { glasses: "round" } };
  const aside = frameOf(worn, "idle", 5, 3, null, { yaw: 26, pitch: -22, calm: 1 });
  const svg = frameSvg(worn, aside, "t");
  const shift = aside.eyes[0].shift;
  assert.ok(shift.dx > 10, "the eyes did move");
  assert.match(svg, new RegExp(`<g transform="translate\\(${shift.dx} [-\\d.]+\\)"><path d="M-4 6L4 6"`), "and the bridge went with them");
  const blushing = frameSvg(spec, frameOf(spec, "giggle", 0.4, 1, null, { yaw: 26, pitch: -22, calm: 1 }), "t");
  assert.match(blushing, /opacity="0\.6" transform="translate\([\d.]+ [-\d.]+\)"><ellipse/, "so did the blush");
});

test("a working fleet keeps the whole creature on stage, eyes sweeping the screen", () => {
  const on = at("muse", 1);
  assert.equal(on.look, "curious");
  assert.equal(on.eyes.length, 2);
  const drift = [0, 1.4, 2.9].map((dt) => frameOf(spec, "muse", 5 + dt, 1 + dt, null).eyes.map((e) => e.shift.dx).join());
  assert.equal(new Set(drift).size, 3, "the gaze drifts while it works");
});

test("each one brings what makes it itself", () => {
  assert.ok(at("notify", 0.6).notif, "notify carries the blue bead");
  assert.equal(at("wink", 0.6).look, "wink");
  assert.equal(at("wide", 0.6).look, "surprised");
  assert.equal(at("alert", 0.6).look, "scared");
  assert.ok(Math.abs(at("exclaim", 0.25).body.dy) > 5, "exclaim jumps");
  assert.equal(at("idle", 0.6).eyes.length, 2, "an idle face is looking at you");
  assert.equal(at("orbit", 0.6).look, "curious", "waiting is looking around");
  assert.equal(at("comet", 0.6).look, "surprised", "someone new is noticed");
});

test("a mood settles, a moment passes", () => {
  for (const id of PLAY_IDS) assert.ok(holdOf(id) >= 0.6, `${id} would be gone before it was seen`);
  assert.ok(holdOf("swirl") < holdOf("orbit"), "a hello is shorter than a wait");
});

test("a change of state is watched happening, not cut to", () => {
  const from = frameOf(spec, "wide", 5, 1.5, null).pose;
  const morph = PLAY_BY_ID.get("notify").morph;
  const yaw = (t) => frameOf(spec, "notify", 5 + t, t, from).pose.gaze.yaw;
  const a = yaw(0), z = yaw(morph + 0.3);
  const done = (t) => (yaw(t) - a) / (z - a);
  assert.ok(done(morph / 10) < 0.12, `a tenth into the morph it has already moved ${(done(morph / 10) * 100).toFixed(0)}%`);
  assert.ok(done(morph / 2) > 0.35 && done(morph / 2) < 0.65, `halfway it is ${(done(morph / 2) * 100).toFixed(0)}% of the way`);
  for (const id of ["wide", "notify", "swirl"]) {
    assert.ok(PLAY_BY_ID.get(id).morph >= 0.8, `${id} is a state you watch change, not a vignette`);
  }
});

test("the bead fades in instead of arriving whole in one frame", () => {
  const from = frameOf(spec, "wide", 5, 1.5, null).pose;
  const alpha = (t) => frameOf(spec, "notify", 5 + t, t, from).notif?.alpha ?? 0;
  assert.ok(alpha(0.06) < 0.1, `it is already at ${alpha(0.06)} on the first frames`);
  assert.ok(alpha(0.45) > 0.25 && alpha(0.45) < 0.75, `halfway it is at ${alpha(0.45)}`);
  assert.equal(alpha(1.4), 1, "and whole once the morph is done");
  const svg = frameSvg(spec, frameOf(spec, "notify", 5.2, 0.2, from), "t");
  assert.match(svg, /fill="#2496e8" opacity="[\d.]+"/, "the bead must carry its fade into the svg");
});

test("the screen flickers across a change of expression, so the cut reads as a redraw", () => {
  const from = frameOf(spec, "idle", 5, 2, null).pose;
  const mid = frameOf(spec, "cross", 5.22, 0.22, from);
  assert.ok(mid.eyeAlpha < 0.6, `the eyes stay at ${mid.eyeAlpha} through the switch`);
  assert.equal(frameOf(spec, "cross", 6, 1, from).eyeAlpha, 1);
});

test("blending out of a pose never breaks the body, on any body", () => {
  for (const shape of SHAPES) {
    const who = { ...spec, shape };
    const from = frameOf(who, "siren", 6, 1.2, null).pose;
    for (const id of PLAY_IDS) {
      const svg = frameSvg(who, frameOf(who, id, 7, 0.05, from), "t");
      assert.ok(!svg.includes("NaN"), `${id} on ${shape} broke on the way in from the siren`);
    }
  }
});

test("all of them are wired to something in the app", () => {
  const pet = readFileSync(join(HERE, "assets/pets/tamagotchi.mjs"), "utf8");
  const chooser = avatars.slice(avatars.indexOf("function fleetFeeling()"), avatars.indexOf("function mugRest()"));
  const viaMood = new Set(Object.values(MOOD_PLAY));
  for (const id of PLAY_IDS) {
    const wired = new RegExp(`(mugPlay|teamFlash)\\([^)]*"${id}"`).test(code)
      || viaMood.has(id)
      || chooser.includes(`"${id}"`)
      || pet.includes(`"${id}"`);
    assert.ok(wired, `${id} is drawn by the engine and used by nobody`);
  }
});

test("every mood has a play the engine draws, and a breath to hold between them", () => {
  for (const mood of MOODS) {
    assert.ok(PLAY_IDS.includes(MOOD_PLAY[mood]), `${mood} maps to no play the engine draws`);
    assert.match(MOOD_BREATH[mood] || "", /^[\d.]+s$/, `${mood} has no breath`);
  }
  assert.equal(new Set(Object.values(MOOD_PLAY)).size, MOODS.length, "two moods wearing one play cannot be told apart");
});

test("a mate's face only ever plays a moment, never a mood", () => {
  const moods = ["thinking", "sleep", "alert", "wide", "notify"];
  for (const id of moods) {
    assert.ok(!new RegExp(`teamFlash\\([\\w.]+, "${id}"\\)`).test(code), `${id} on a mate's face is a status, and status is theirs`);
  }
  assert.match(code, /teamFlash\([\w.]+, "swirl"\)/);
});

function fakeScreen() {
  const frames = [];
  const timers = [];
  const saved = { raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame, win: globalThis.window };
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = {
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    setTimeout: (fn, ms) => timers.push({ fn, ms })
  };
  const fire = (ms) => {
    const at = timers.findIndex((t) => t && t.ms === ms);
    if (at < 0) return false;
    const { fn } = timers[at];
    timers[at] = null;
    fn();
    return true;
  };
  let ms = 0;
  const tick = () => {
    const fn = frames.shift();
    if (!fn) return false;
    ms += 16;
    fn(ms);
    assert.equal(frames.length, 0, "no frame is asked for while the pace between two frames runs");
    fire(FRAME_MS);
    return true;
  };
  const restore = () => {
    globalThis.requestAnimationFrame = saved.raf;
    globalThis.cancelAnimationFrame = saved.caf;
    globalThis.window = saved.win;
  };
  const waits = (of) => timers.filter((t) => t && t.ms === of).length;
  return { frames, timers, tick, fire, waits, restore };
}

function countingHost() {
  const host = { writes: 0, html: "" };
  Object.defineProperty(host, "innerHTML", { get: () => host.html, set: (v) => { host.html = v; host.writes += 1; } });
  return host;
}

test("a mounted player keeps looking at whoever is near, and rests again once they are gone", () => {
  const screen = fakeScreen();
  try {
    let company = null;
    const host = { innerHTML: "" };
    const player = mountPlayer(host, spec, { company: () => company });
    player.wake();
    for (let i = 0; i < 100 && screen.tick(); i += 1);
    assert.equal(screen.frames.length, 0, "alone, the idle loop stops on its own");
    const alone = player.paint().eyes[0].shift.dx;

    company = { yaw: 26, pitch: 0, calm: 1 };
    player.wake();
    for (let i = 0; i < 100 && screen.tick(); i += 1);
    assert.equal(screen.frames.length, 1, "with someone near, the loop keeps going");
    assert.ok(player.paint().eyes[0].shift.dx > alone + 8, "and the eyes went to them");

    company = null;
    for (let i = 0; i < 100 && screen.tick(); i += 1);
    assert.equal(screen.frames.length, 0, "and rests again when they leave");
  } finally {
    screen.restore();
  }
});

test("a mood that stays is drawn twenty-four times a second, not once per screen refresh", () => {
  const screen = fakeScreen();
  try {
    const host = countingHost();
    const player = mountPlayer(host, spec);
    player.play("wide", { hold: false });
    for (let i = 0; i < 48; i += 1) assert.ok(screen.tick(), `frame ${i} was never asked for`);
    assert.equal(host.writes, 48, "one draw per frame the pace let through");
    assert.equal(screen.frames.length, 1, "the next frame is asked for only once the pace has run");
    screen.frames.shift()(49 * 16);
    assert.equal(screen.waits(FRAME_MS), 1, "and between two frames the wait is on the clock, not on the screen");
    assert.equal(screen.frames.length, 0);
    player.stop();
    assert.equal(screen.waits(FRAME_MS), 0, "stopping clears the wait too");
  } finally {
    screen.restore();
  }
});

test("a player nobody can see draws nothing, and looks again in a second", () => {
  const screen = fakeScreen();
  try {
    let onScreen = false;
    const host = countingHost();
    const player = mountPlayer(host, spec, { shown: () => onScreen });
    player.play("wide", { hold: false });
    assert.ok(screen.tick());
    assert.equal(host.writes, 0, "hidden, the face is not drawn");
    assert.equal(screen.frames.length, 0, "and no frame is asked for");
    assert.equal(screen.waits(PARK_MS), 1, "it parks and checks back later");
    assert.ok(screen.fire(PARK_MS));
    assert.ok(screen.tick());
    assert.equal(host.writes, 0, "still hidden, still nothing");
    onScreen = true;
    assert.ok(screen.fire(PARK_MS));
    assert.ok(screen.tick());
    assert.equal(host.writes, 1, "back on screen, the face is drawn again");
    assert.equal(screen.frames.length, 1, "and paced like before");
  } finally {
    screen.restore();
  }
});

test("a face the settings hid never gets a player of its own", () => {
  const mugPlay = avatars.slice(avatars.indexOf("function mugPlay("), avatars.indexOf("st.lastMood = "));
  assert.match(mugPlay, /if \(!slot \|\| !slot\.isConnected \|\| slot\.hidden \|\| calmly\(\)\) return;/, "the hidden mug is where a loop ran for nobody at the screen's refresh rate");
});

test("the player reads the real host: off the page or with no box, it is not shown", () => {
  const screen = fakeScreen();
  try {
    const host = countingHost();
    host.isConnected = true;
    host.getClientRects = () => [];
    const player = mountPlayer(host, spec);
    player.play("wide", { hold: false });
    assert.ok(screen.tick());
    assert.equal(host.writes, 0, "a host with no box on screen is not drawn");
    host.getClientRects = () => [{ width: 32, height: 32 }];
    assert.ok(screen.fire(PARK_MS));
    assert.ok(screen.tick());
    assert.equal(host.writes, 1);
  } finally {
    screen.restore();
  }
});
