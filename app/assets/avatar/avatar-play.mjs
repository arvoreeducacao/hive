import { BOX, TAU, round2, clamp, lerp, hash, normalAvatar, avatarKey, wearKey, parseWear, bodyOf, bodySvg, eyeShapes } from "./avatar.mjs";

const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t) => 1 - (1 - t) ** 5
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    let t = Math.imul((s = (s + 0x6d2b79f5) >>> 0) ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

function noise(t, period, phase = 0) {
  const a = (t / period) * TAU;
  return 0.55 * Math.sin(a + phase) + 0.3 * Math.sin(2 * a + 1.7 * phase + 1.1) + 0.15 * Math.sin(3 * a + 2.3 * phase + 2.4);
}

const blinkRng = rng(24301);
const BLINKS = (() => {
  const out = [];
  let t = 1.4;
  while (t < 900) {
    out.push(t);
    t += 1.9 + 2.7 * blinkRng();
    if (blinkRng() < 0.18) { out.push(t); t += 0.24; }
  }
  return out;
})();

function lidAt(t) {
  for (const at of BLINKS) {
    if (t < at) break;
    const p = (t - at) / 0.18;
    if (p >= 0 && p <= 1) return p < 0.45 ? 1 - p / 0.45 : (p - 0.45) / 0.55;
  }
  return 1;
}

const steps = (clock, hz) => Math.floor(clock * hz) % 2;

const basePose = (over = {}) => ({
  look: "attentive",
  gaze: { yaw: 0, pitch: 0 },
  lids: [1, 1],
  eyeAlpha: 1,
  glow: 0.5,
  tint: 0,
  blush: 0,
  red: 0,
  rot: 0,
  dx: 0,
  dy: 0,
  sx: 1,
  sy: 1,
  wobble: 0,
  flash: 0,
  busy: 0,
  follow: true,
  siren: null,
  arms: null,
  notif: null,
  ...over
});

export const SIREN_SWEEP = 0.6;

export const PLAYS = [
  { id: "idle", duration: 2.4, morph: 0.8, keepFace: true, keepBody: true, pose: () => basePose() },

  { id: "wink", duration: 1.6, morph: 0.3, keepBody: true, pose: () => basePose({ look: "wink", rot: 3, gaze: { yaw: -4, pitch: 3 } }) },

  { id: "wide", duration: 1.8, morph: 0.9, keepBody: true, pose: () => basePose({ look: "surprised", gaze: { yaw: 0, pitch: 6 } }) },

  { id: "alert", duration: 2.4, hold: 2, morph: 0.45, keepBody: true, pose: (spec, t) => {
    const fade = clamp((2.2 - t) / 0.5);
    return basePose({ look: "scared", rot: 3 * Math.sin(t * 22) * fade, wobble: 9 * Math.sin(t * 26) * fade, gaze: { yaw: 0, pitch: 4 } });
  } },

  { id: "notify", duration: 2.2, morph: 0.9, keepBody: true, pose: (spec, t) => {
    const k = clamp(t / 0.45);
    const pop = 1 + 0.14 * Math.sin(k * Math.PI) * (1 - 0.35 * k);
    return basePose({ look: "attentive", gaze: { yaw: 16, pitch: 9 }, notif: { r: k < 1 ? pop : 1, alpha: 1 } });
  } },

  { id: "exclaim", duration: 2, morph: 0.45, keepBody: true, pose: (spec, t) => {
    const jump = Math.sin(clamp(t / 0.5) * Math.PI);
    return basePose({ look: "scared", dy: -14 * jump, wobble: 12 * Math.sin(t * 24) * clamp((1.6 - t) / 0.4), gaze: { yaw: 0, pitch: 8 } });
  } },

  { id: "siren", duration: 2.4, hold: 2.4, morph: 0.5, keepBody: true, pose: (spec, t, clock) => {
    const sweep = Math.sin(clock * TAU * SIREN_SWEEP);
    return basePose({
      look: "scared",
      red: 1,
      eyeAlpha: steps(clock, 2) ? 1 : 0.35,
      glow: 0.7,
      siren: { left: 0.08 + 0.92 * clamp(-sweep), right: 0.08 + 0.92 * clamp(sweep), lens: steps(clock, 1.25) },
      arms: { swing: 16 * Math.sin(clock * TAU * 1.5) },
      gaze: { yaw: 0, pitch: 5 }
    });
  } },

  { id: "sleep", duration: 2.4, morph: 0.5, keepBody: true, pose: (spec, t, clock) => basePose({ look: "dim", follow: false, dy: 4 + 1.5 * Math.sin((clock / 4.6) * TAU), rot: 3, glow: 0.25 }) },

  { id: "egg", duration: 1.8, morph: 0.4, keepBody: true, pose: () => basePose({ look: "none", eyeAlpha: 0, glow: 0, follow: false }) },

  { id: "play", duration: 2, morph: 0.5, keepBody: true, pose: (spec, t) => {
    const hop = Math.sin(clamp(t / 0.6) * Math.PI);
    return basePose({ look: "happy", dy: -12 * hop, wobble: 10 * Math.sin(t * 20) * clamp((1.4 - t) / 0.4) });
  } },

  { id: "orbit", duration: 3.4, hold: 2.5, morph: 0.6, keepBody: true, pose: (spec, t) => basePose({
    look: "curious", gaze: { yaw: 18 * Math.sin(t * 2.2), pitch: 8 * Math.cos(t * 2.2) }, rot: 2 * Math.sin(t * 2.2)
  }) },

  { id: "swirl", duration: 1.3, hold: 1.3, morph: 0.8, keepFace: true, keepBody: true, pose: (spec, t) => basePose({
    look: "happy", wobble: 14 * Math.sin(t * 18) * clamp((1.2 - t) / 0.3), flash: clamp((1.2 - t) / 0.6)
  }) },

  { id: "burst", duration: 2.6, hold: 2.4, morph: 0.4, keepBody: true, pose: (spec, t) => {
    const live = clamp((1.7 - t) / 0.4);
    const hop = Math.abs(Math.sin(t * TAU * 0.9)) * live;
    return basePose({ look: "happy", dy: -16 * hop, flash: live, wobble: 8 * Math.sin(t * 16) * live });
  } },

  { id: "comet", duration: 2.4, hold: 2.4, morph: 0.45, keepBody: true, pose: (spec, t) => {
    const turn = -Math.cos(clamp(t / 1.6) * Math.PI);
    return basePose({ look: "surprised", gaze: { yaw: 18 * turn, pitch: 6 }, rot: 3 * turn });
  } },

  { id: "sing", duration: 2.4, hold: 7.2, morph: 0.5, keepBody: true, pose: (spec, t, clock) => {
    const beat = clock * 1.1;
    const sway = Math.sin(beat * TAU);
    return basePose({
      look: steps(clock, 1.1) ? "happy" : "surprised",
      rot: 7 * sway,
      dy: -8 * Math.abs(Math.sin(beat * 2 * TAU)),
      wobble: 10 * sway,
      gaze: { yaw: 6 * sway, pitch: 6 }
    });
  } },

  { id: "giggle", duration: 1.7, morph: 0.35, keepBody: true, pose: (spec, t) => {
    const fizz = clamp((1.55 - t) / 0.5);
    return basePose({ look: "happy", blush: 1, rot: 3.2 * Math.sin(t * 21) * fizz, wobble: 12 * Math.sin(t * 30) * fizz, dy: -2 * Math.abs(Math.sin(t * 21)) * fizz });
  } },

  { id: "hug", duration: 1.8, morph: 0.4, keepBody: true, pose: (spec, t) => {
    const squeeze = Math.sin(clamp(t / 0.55) * Math.PI) * 0.1;
    return basePose({ look: "happy", blush: 0.5, sx: 1 + squeeze, sy: 1 - squeeze });
  } },

  { id: "wave", duration: 2.4, hold: 2.4, morph: 0.4, keepBody: true, pose: (spec, t) => {
    const swing = Math.sin(t * TAU * 1.6);
    const fade = clamp(t / 0.25) * clamp((2.2 - t) / 0.5);
    return basePose({ look: "happy", rot: 15 * swing * fade, dy: -3.5 * Math.abs(swing) * fade, wobble: 12 * swing * fade });
  } },

  { id: "cross", duration: 2.2, morph: 0.45, keepBody: true, pose: (spec, t) => {
    const huff = Math.sin(t * 13);
    return basePose({ look: "angry", tint: 1, blush: 0.7, dx: 1.2 * huff, gaze: { yaw: 0, pitch: -4 } });
  } },

  { id: "glee", duration: 2.2, morph: 0.45, keepBody: true, pose: (spec, t, clock) => basePose({
    look: "joy", wobble: 12 * Math.sin(clock * TAU * 1.3), dy: -3 * Math.abs(Math.sin(clock * TAU * 0.9)), gaze: { yaw: 0, pitch: 6 }
  }) },

  { id: "soar", duration: 1.6, morph: 0.25, keepBody: true, pose: () => basePose({ look: "scared", wobble: 6 }) },

  { id: "strut", duration: 1.8, morph: 0.4, keepBody: true, pose: (spec, t) => basePose({
    look: "happy", dy: -3 * Math.sin(clamp(t / 0.6) * Math.PI), flash: 0.5 * clamp((1.4 - t) / 0.6), gaze: { yaw: 0, pitch: 10 }
  }) },

  { id: "muse", duration: 2.8, morph: 0.6, keepBody: true, pose: (spec, t, clock) => basePose({
    look: "curious",
    gaze: { yaw: 14 * Math.sin((clock / 2.6) * TAU), pitch: -4 + 3 * Math.sin((clock / 7.7) * TAU) },
    busy: 1,
    wobble: 22 * Math.sin(clock * TAU * 1.1)
  }) },

  { id: "snooze", duration: 2.6, morph: 0.7, keepBody: true, pose: (spec, t, clock) => basePose({
    look: "sleepy", dy: 2 + 1.2 * Math.sin((clock / 3.4) * TAU), glow: 0.3
  }) }
];

export const PLAY_BY_ID = new Map(PLAYS.map((p) => [p.id, p]));

export const PLAY_IDS = PLAYS.map((p) => p.id);

const EYE_SAMPLES = [0, 0.25, 0.6, 1.2, 2];
const eyesByPlay = new Map();

export function playHasEyes(id) {
  if (eyesByPlay.has(id)) return eyesByPlay.get(id);
  const play = PLAY_BY_ID.get(id);
  const open = !!play && EYE_SAMPLES.some((t) => {
    const p = play.pose({ shape: "ball", face: "dark", colour: "blue" }, t, t);
    return p.eyeAlpha > 0.01 && p.follow;
  });
  eyesByPlay.set(id, open);
  return open;
}

export const holdOf = (id) => {
  const p = PLAY_BY_ID.get(id);
  return Math.max(0.6, p?.hold ?? p?.duration ?? 2);
};

const NUMBERS = ["eyeAlpha", "glow", "tint", "blush", "red", "rot", "dx", "dy", "sx", "sy", "wobble", "flash", "busy"];

function blend(a, b, t) {
  const out = { ...b };
  for (const key of NUMBERS) out[key] = lerp(a[key], b[key], t);
  out.gaze = { yaw: lerp(a.gaze.yaw, b.gaze.yaw, t), pitch: lerp(a.gaze.pitch, b.gaze.pitch, t) };
  out.lids = [lerp(a.lids[0], b.lids[0], t), lerp(a.lids[1], b.lids[1], t)];
  out.look = t < 0.5 ? a.look : b.look;
  out.follow = t < 0.5 ? a.follow : b.follow;
  if (a.look !== b.look) out.eyeAlpha *= 1 - 0.7 * Math.sin(t * Math.PI);
  out.siren = b.siren ? { ...b.siren, alpha: t } : a.siren ? { ...a.siren, alpha: 1 - t } : null;
  out.arms = b.arms ? { ...b.arms, alpha: t } : a.arms ? { ...a.arms, alpha: 1 - t } : null;
  out.notif = b.notif ? { ...b.notif, alpha: t } : a.notif ? { ...a.notif, alpha: 1 - t } : null;
  return out;
}

export const BREATH_REST = 0.006;
export const BREATH_NEAR = 0.02;
export const BREATH_PERIOD = 3.4;

const centreOf = (e) => (e.kind === "rect" ? { x: e.cx, y: e.cy } : { x: e.x, y: e.y });

export function frameOf(spec, state, t, since, from, company = null) {
  const play = PLAY_BY_ID.get(state) || PLAY_BY_ID.get("idle");
  let pose = play.pose(spec, Math.max(0, since), t);
  if (from && since < play.morph) pose = blend(from, pose, ease.inOutCubic(clamp(since / play.morph)));

  const alive = pose.eyeAlpha > 0.01;
  const wander = alive && pose.follow ? 1 : 0;
  const near = company && pose.follow ? clamp(company.calm ?? 0) : 0;
  const quiet = 1 - 0.75 * near;
  const gaze = {
    yaw: lerp(pose.gaze.yaw, company ? company.yaw : 0, near) + (5.5 * noise(t, 11.3, 0.4) + 1.6 * noise(t, 3.7, 2.1)) * wander * quiet,
    pitch: lerp(pose.gaze.pitch, company ? company.pitch : 0, near) + (4.2 * noise(t, 9.1, 1.3) + 1.3 * noise(t, 4.3, 0.7)) * wander * quiet
  };
  const lid = alive && pose.follow ? lidAt(t) : 1;
  const breath = 1 + (BREATH_REST + BREATH_NEAR * near) * Math.sin((t / BREATH_PERIOD) * TAU);
  const driftX = 0.6 * noise(t, 7.9, 1.9);
  const driftY = 0.7 * noise(t, 5.3, 0.3);

  const glasses = parseWear(spec.wear).glasses;
  const shift = { dx: round2(gaze.yaw * 0.5), dy: round2(-gaze.pitch * 0.45) };
  const eyes = eyeShapes(pose.look, glasses).map((e, i) => {
    const c = centreOf(e);
    const open = Math.max(0.06, Math.min(lid, pose.lids[i] ?? 1));
    return { ...e, shift, squash: open, centre: c };
  });

  return {
    pose,
    look: pose.look,
    eyes,
    eyeAlpha: round2(pose.eyeAlpha),
    glow: round2(pose.glow),
    tint: round2(pose.tint),
    blush: round2(pose.blush),
    red: round2(pose.red),
    body: {
      rot: round2(pose.rot),
      dx: round2(pose.dx + driftX),
      dy: round2(pose.dy + driftY),
      sx: round2(pose.sx * (1 - 0.35 * (breath - 1))),
      sy: round2(pose.sy * breath)
    },
    wobble: round2(pose.wobble),
    flash: round2(pose.flash),
    busy: round2(pose.busy),
    siren: pose.siren ? { left: round2(pose.siren.left), right: round2(pose.siren.right), lens: pose.siren.lens, alpha: round2(pose.siren.alpha ?? 1) } : null,
    arms: pose.arms ? { swing: round2(pose.arms.swing), alpha: round2(pose.arms.alpha ?? 1) } : null,
    notif: pose.notif ? { r: round2(pose.notif.r), alpha: round2(pose.notif.alpha ?? 1) } : null
  };
}

const SPAN = BOX * 2;

export function frameSvg(spec, frame, id) {
  const body = bodyOf(spec.shape);
  const b = frame.body;
  const transform = `translate(${b.dx} ${b.dy}) translate(0 ${body.foot}) rotate(${b.rot}) scale(${b.sx} ${b.sy}) translate(0 ${-body.foot})`;
  const eyes = frame.eyes.map((e) => {
    const c = e.centre;
    const moved = { ...e };
    const wrap = `translate(${round2(c.x + e.shift.dx)} ${round2(c.y + e.shift.dy)}) scale(1 ${round2(e.squash)}) translate(${round2(-c.x)} ${round2(-c.y)})`;
    moved.transform = wrap;
    return moved;
  });
  const inner = bodySvg(spec, id, {
    look: frame.look,
    eyes,
    eyeAlpha: frame.eyeAlpha,
    glow: frame.glow,
    tint: frame.tint,
    blush: frame.blush,
    red: frame.red,
    transform,
    wobble: frame.wobble,
    flash: frame.flash,
    busy: frame.busy,
    siren: frame.siren && frame.siren.alpha > 0.3 ? frame.siren : null,
    arms: frame.arms && frame.arms.alpha > 0.3 ? frame.arms : null,
    notif: frame.notif
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-BOX} ${-BOX} ${SPAN} ${SPAN}" aria-hidden="true" class="avatar"><g>${inner}</g></svg>`;
}

export const FRAME_MS = 1000 / 24;

export const PARK_MS = 1000;

export function mountPlayer(host, spec, opts = {}) {
  const safe = { ...normalAvatar(spec), wear: parseWear(spec?.wear) };
  const id = `pl${hash(avatarKey(safe) + wearKey(safe.wear) + (opts.salt || "")).toString(36)}`;
  let state = "idle";
  let since = 0;
  let from = null;
  let raf = 0;
  let pace = 0;
  let last = 0;
  let clock = opts.clock || 0.35;
  let timer = 0;

  const company = () => (opts.company ? opts.company() : null);
  const watched = () => {
    const c = company();
    return !!c && (c.calm ?? 0) > 0.01;
  };
  const rendered = () => {
    if (typeof host.getClientRects !== "function") return true;
    return host.isConnected && host.getClientRects().length > 0;
  };
  const shown = opts.shown || rendered;

  const draw = () => {
    const frame = frameOf(safe, state, clock, since, from, company());
    host.innerHTML = frameSvg(safe, frame, id);
    return frame;
  };

  const running = () => !!(raf || pace);
  const frame = () => { raf = requestAnimationFrame(step); };
  const later = (ms) => { pace = window.setTimeout(() => { pace = 0; frame(); }, ms); };

  const step = (now) => {
    raf = 0;
    if (!shown()) { later(PARK_MS); return; }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    clock += dt;
    since += dt;
    draw();
    if (state === "idle" && since > 1.2 && !watched()) return;
    later(FRAME_MS);
  };

  const run = () => { if (!running()) { last = 0; frame(); } };

  return {
    get state() { return state; },
    play(next, { hold = true } = {}) {
      if (!PLAY_BY_ID.has(next) || next === state) return;
      from = frameOf(safe, state, clock, since, from).pose;
      state = next;
      since = 0;
      window.clearTimeout(timer);
      run();
      if (hold && next !== "idle") timer = window.setTimeout(() => (opts.onRest ? opts.onRest() : this.play("idle")), 1000 * holdOf(next));
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(pace);
      pace = 0;
      state = "idle";
      window.clearTimeout(timer);
    },
    wake: run,
    paint: draw
  };
}
