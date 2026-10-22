import { nextFrame } from "../frame-rate.mjs";
import { SACCADES, lookDeltas } from "./avatar.mjs";

export const SCAN_MS = 1000;

export const EYE_EASE = 0.45;

export const BLINK_SHUT = [0.95, 0.985];

export const AMPLITUDE = {
  face: { breath: [0.012, 0.028], sway: 1.4 },
  mug: { breath: [0.05, 0.11], sway: 4.5 }
};

const RHYTHM_DEFAULT = { breath: 4, sway: 7, every: 5, at: 0, glance: 14, glanceAt: 0 };

const RHYTHM_VARS = { breath: "--av-breath", sway: "--av-sway", every: "--av-blink", at: "--av-blink-at", glance: "--av-glance", glanceAt: "--av-glance-at" };

const OFFSETS = new Set(["at", "glanceAt"]);

const AT_REST = { dx: 0, dy: 0 };

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;

const cycle = (seconds, period, at = 0) => {
  const turns = (seconds - at) / period;
  return turns - Math.floor(turns);
};

const wave = (turns) => (1 - Math.cos(2 * Math.PI * (turns - Math.floor(turns)))) / 2;

const secondsOf = (element, name) => Number.parseFloat(element?.style?.getPropertyValue(name));

export function rhythmOf(svg, host = null) {
  const rhythm = { ...RHYTHM_DEFAULT };
  for (const [key, name] of Object.entries(RHYTHM_VARS)) {
    const value = secondsOf(svg, name);
    if (Number.isFinite(value) && (value > 0 || OFFSETS.has(key))) rhythm[key] = value;
  }
  const mood = secondsOf(host, RHYTHM_VARS.breath);
  if (Number.isFinite(mood) && mood > 0) rhythm.breath = mood;
  return rhythm;
}

export function glanceOf(rhythm, seconds) {
  const at = cycle(seconds, rhythm.glance, rhythm.glanceAt) * 100;
  let pick = SACCADES[0];
  for (const step of SACCADES) if (step.at <= at) pick = step;
  return lookDeltas(null, pick.yaw, pick.pitch)[0];
}

export function idlePose(rhythm, seconds, amplitude = AMPLITUDE.face, breathTurns = seconds / rhythm.breath) {
  const breath = wave(breathTurns);
  const sway = wave(seconds / rhythm.sway);
  const blink = cycle(seconds, rhythm.every, rhythm.at);
  return {
    rotate: round(-amplitude.sway + 2 * amplitude.sway * sway, 2),
    scale: [round(1 + amplitude.breath[0] * breath, 4), round(1 + amplitude.breath[1] * breath, 4)],
    shut: blink >= BLINK_SHUT[0] && blink < BLINK_SHUT[1],
    look: glanceOf(rhythm, seconds)
  };
}

export function easeEye(from, to, ease) {
  const dx = from.dx + (to.dx - from.dx) * ease;
  const dy = from.dy + (to.dy - from.dy) * ease;
  const close = Math.abs(to.dx - dx) < 0.05 && Math.abs(to.dy - dy) < 0.05;
  return close ? { dx: to.dx, dy: to.dy } : { dx: round(dx, 2), dy: round(dy, 2) };
}

export function startIdleClock({ doc, win, amplitudeOf = (host) => (host.closest(".brand .mug") ? AMPLITUDE.mug : AMPLITUDE.face) }) {
  const faces = new Map();
  let cancel = null;
  let parked = false;
  let scannedAt = Number.NEGATIVE_INFINITY;

  const visible = (host) => host.isConnected && host.getClientRects().length > 0;
  const still = (host) => win.getComputedStyle(host).getPropertyValue("--av-still").trim() === "1";
  const alive = (host) => host.classList.contains("av-alive");

  const seatsOf = (svg) => [...svg.querySelectorAll(".av-seat")].map((seat) => ({
    eye: Number(seat.dataset.eye) || 0,
    look: seat.querySelector(".av-look"),
    at: AT_REST
  }));

  const release = (host, face) => {
    faces.delete(host);
    if (face.said) {
      host.style.removeProperty("scale");
      host.style.removeProperty("rotate");
    }
    if (face.shut) host.classList.remove("av-blinking");
    for (const seat of face.seats) if (seat.at !== AT_REST) seat.look?.style.removeProperty("transform");
  };

  const adopt = (host) => {
    const svg = host.querySelector(":scope > svg");
    if (!svg) return null;
    const known = faces.get(host);
    if (known && known.svg === svg) return known;
    const amplitude = amplitudeOf(host);
    const face = {
      svg,
      rhythm: rhythmOf(svg, host),
      turns: known?.turns ?? null,
      last: known?.last ?? null,
      amplitude: svg.classList.contains("avatar") ? amplitude : { ...amplitude, sway: 0 },
      seats: seatsOf(svg),
      aim: known?.aim || null,
      still: still(host),
      said: known?.said || "",
      shut: known?.shut || false
    };
    faces.set(host, face);
    return face;
  };

  const scan = () => {
    const hosts = new Set(doc.querySelectorAll(".av-alive"));
    for (const [host, face] of faces) if (!hosts.has(host) || !visible(host)) release(host, face);
    for (const host of hosts) {
      if (!visible(host)) continue;
      const face = adopt(host);
      if (!face) continue;
      face.still = still(host);
      face.rhythm = rhythmOf(face.svg, host);
    }
  };

  const moveBody = (host, face, pose) => {
    const said = pose ? `${pose.scale[0]} ${pose.scale[1]}|${pose.rotate}deg` : "";
    if (said === face.said) return;
    face.said = said;
    if (!pose) {
      host.style.removeProperty("scale");
      host.style.removeProperty("rotate");
      return;
    }
    host.style.scale = `${pose.scale[0]} ${pose.scale[1]}`;
    host.style.rotate = `${pose.rotate}deg`;
  };

  const blink = (host, face, shut) => {
    if (shut === face.shut) return;
    face.shut = shut;
    host.classList.toggle("av-blinking", shut);
  };

  const moveEyes = (face, pose) => {
    let settled = true;
    for (const seat of face.seats) {
      const goal = face.aim ? face.aim[seat.eye] || face.aim[0] || AT_REST : pose ? pose.look : AT_REST;
      const next = face.still ? { dx: goal.dx, dy: goal.dy } : easeEye(seat.at, goal, EYE_EASE);
      if (next.dx === seat.at.dx && next.dy === seat.at.dy) continue;
      settled = false;
      seat.at = next.dx === 0 && next.dy === 0 ? AT_REST : next;
      if (!seat.look) continue;
      if (seat.at === AT_REST) seat.look.style.removeProperty("transform");
      else seat.look.style.transform = `translate(${seat.at.dx}px, ${seat.at.dy}px)`;
    }
    return settled;
  };

  const paint = (host, face, seconds) => {
    if (!alive(host)) {
      release(host, face);
      return false;
    }
    const current = face.svg.isConnected ? face : adopt(host);
    if (!current) {
      release(host, face);
      return false;
    }
    current.turns = current.turns === null ? seconds / current.rhythm.breath : current.turns + (seconds - current.last) / current.rhythm.breath;
    current.last = seconds;
    const pose = current.still ? null : idlePose(current.rhythm, seconds, current.amplitude, current.turns);
    moveBody(host, current, pose);
    blink(host, current, !!pose?.shut);
    const settled = moveEyes(current, pose);
    return !!pose || !settled;
  };

  const frame = (now) => {
    cancel = null;
    if (now - scannedAt >= SCAN_MS) {
      scannedAt = now;
      scan();
    }
    let moving = false;
    if (!doc.hidden) for (const [host, face] of [...faces]) if (paint(host, face, now / 1000)) moving = true;
    if (moving) schedule();
    else park();
  };

  const schedule = () => {
    parked = false;
    cancel = nextFrame(win, frame);
  };

  const park = () => {
    parked = true;
    cancel = nextFrame(win, frame, SCAN_MS);
  };

  const wake = () => {
    if (cancel && !parked) return;
    cancel?.();
    schedule();
  };

  schedule();

  return {
    aim(host, deltas) {
      if (!host || !alive(host) || !visible(host)) return;
      const face = adopt(host);
      if (!face) return;
      face.aim = deltas;
      wake();
    },
    stop() {
      cancel?.();
      cancel = null;
      for (const [host, face] of [...faces]) release(host, face);
    }
  };
}
