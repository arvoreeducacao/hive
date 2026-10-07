export const SHAPES = ["ball", "tall", "wide", "triangle", "capsule", "tv", "crawler", "cocoon", "bee"];

export const FACES = ["dark"];

export const COLOURS = ["red", "orange", "amber", "green", "turquoise", "blue", "purple", "pink"];

export const BASE = {
  red: "#e0625c",
  orange: "#ff812e",
  amber: "#e0af68",
  green: "#9fcf9a",
  turquoise: "#4fbbbc",
  blue: "#7dcfff",
  purple: "#a08fd0",
  pink: "#e58bb0"
};

export const INK = "#1b1b1b";
export const PAPER = "#fffbf2";
export const BLUSH = "#f49ab0";
export const ALARM = "#e0625c";

export const R = 100;
export const BOX = 125;
export const TAU = Math.PI * 2;

export const round2 = (n) => Math.round(n * 100) / 100;
export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function hash(seed) {
  let h = 0x811c9dc5;
  for (const ch of String(seed || "")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pick(list, n) {
  return list[n % list.length];
}

export function avatarFor(seed) {
  const h = hash(seed);
  return {
    shape: pick(SHAPES, h),
    face: pick(FACES, Math.imul(h ^ 0x9e3779b9, 0x85ebca6b) >>> 13),
    colour: pick(COLOURS, Math.imul(h ^ 0x7f4a7c15, 0xc2b2ae35) >>> 19)
  };
}

export const SLOTS = SHAPES.length * COLOURS.length;

export const faceSlot = (spec) => `${spec.shape}/${spec.colour}`;

export function slotIsFree(spec, taken) {
  return !taken.has(faceSlot(spec));
}

export function nearestFree(spec, taken) {
  const s0 = SHAPES.indexOf(spec.shape);
  const c0 = COLOURS.indexOf(spec.colour);
  for (let step = 0; step < SLOTS; step++) {
    const shape = SHAPES[(s0 + (step % SHAPES.length)) % SHAPES.length];
    const colour = COLOURS[(c0 + Math.floor(step / SHAPES.length)) % COLOURS.length];
    const next = { ...spec, shape, colour };
    if (slotIsFree(next, taken)) return next;
  }
  return { ...spec };
}

export function dealFaces(devs) {
  const out = new Map();
  const taken = new Set();
  const list = [...devs].filter((d) => d && d.dev).sort((a, b) => a.dev.localeCompare(b.dev));
  for (const d of list) {
    const chosen = parseAvatar(d.avatar);
    if (!chosen || taken.has(faceSlot(chosen))) continue;
    taken.add(faceSlot(chosen));
    out.set(d.dev, chosen);
  }
  for (const d of list) {
    if (out.has(d.dev)) continue;
    const wanted = parseAvatar(d.avatar) || avatarFor(d.dev);
    const free = nearestFree(wanted, taken);
    taken.add(faceSlot(free));
    out.set(d.dev, free);
  }
  return out;
}

export function isAvatar(spec) {
  return !!spec && SHAPES.includes(spec.shape) && FACES.includes(spec.face) && COLOURS.includes(spec.colour);
}

export function avatarKey(spec) {
  return `${spec.shape}/${spec.face}/${spec.colour}`;
}

export const OLD_SHAPES = { circle: "ball", pebble: "wide", squircle: "tv", capsule: "capsule", hexagon: "crawler", triangle: "triangle", cloud: "tall", droplet: "cocoon" };

export const OLD_FACES = ["neutral", "attentive", "surprised", "excited", "happy", "laughing", "curious", "sleepy", "suspicious", "sad", "proud", "shy", "scared", "confused"];

export function parseAvatar(text) {
  const [shape, face, colour] = String(text || "").split("/");
  const spec = {
    shape: SHAPES.includes(shape) ? shape : OLD_SHAPES[shape],
    face: FACES.includes(face) ? face : OLD_FACES.includes(face) || face === "light" ? FACES[0] : undefined,
    colour
  };
  return isAvatar(spec) ? spec : null;
}

/* the face can also be the blobatar of the name instead of a robot. it is written in the avatar key,
   so a hive that does not know it reads no avatar and draws the robot its name deals */
export const BLOB_FACE = "blobatar";

export const isFaceKey = (text) => String(text ?? "").trim() === BLOB_FACE || !!parseAvatar(text);

export function normalAvatar(spec, seed = "") {
  if (isAvatar(spec)) return spec;
  const mapped = spec && parseAvatar(`${spec.shape}/${spec.face}/${spec.colour}`);
  return mapped || avatarFor(String(spec?.seed || seed));
}

export function mixHex(hex, towards, t) {
  const read = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = read(hex);
  const b = read(towards);
  return `#${a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, "0")).join("")}`;
}

export const paintOf = (colour) => BASE[colour] || BASE.blue;
export const shadeOf = (colour) => mixHex(paintOf(colour), INK, 0.38);

export const WEAR = {
  glasses: ["round", "square"],
  hat: ["cap", "beanie", "bucket", "headband", "tophat", "crown", "party", "wizard", "fedora", "cowboy"],
  extra: ["bowtie", "bow", "scarf", "tie", "moustache"]
};

export const MOVED_WEAR = { "marks:moustache": ["extra", "moustache"] };

export const WEAR_SLOTS = Object.keys(WEAR);

export const RETIRED_WEAR = {
  hair: ["mullet", "perm"],
  glasses: ["shades", "aviator", "eighties", "shield", "monocle"],
  marks: ["moustache", "blush", "freckles", "sweat"],
  extra: ["headphones"]
};

export const isRetiredWear = (slot, model) => !!RETIRED_WEAR[slot] && RETIRED_WEAR[slot].includes(model);

export function parseWear(raw) {
  const out = {};
  if (!raw) return out;
  if (typeof raw === "string") {
    for (const part of raw.split(/\s+/)) {
      const [slot, model] = MOVED_WEAR[part] || part.split(":");
      if (WEAR[slot] && WEAR[slot].includes(model) && !out[slot]) out[slot] = model;
    }
    return out;
  }
  if (typeof raw !== "object") return out;
  for (const slot of WEAR_SLOTS) if (WEAR[slot].includes(raw[slot])) out[slot] = raw[slot];
  for (const [old, [slot, model]] of Object.entries(MOVED_WEAR)) {
    const [oldSlot, oldModel] = old.split(":");
    if (raw[oldSlot] === oldModel && !out[slot]) out[slot] = model;
  }
  return out;
}

export function wearKey(wear) {
  const w = parseWear(wear);
  return WEAR_SLOTS.filter((slot) => w[slot]).map((slot) => `${slot}:${w[slot]}`).join(" ");
}

export const isDressed = (wear) => wearKey(wear) !== "";

export const UNFIT = { triangle: ["extra:tie"] };

export const fitsBody = (shape, slot, model) => !(UNFIT[shape] || []).includes(`${slot}:${model}`);

export function wornBy(shape, wear) {
  const w = parseWear(wear);
  const out = {};
  for (const slot of WEAR_SLOTS) if (w[slot] && fitsBody(shape, slot, w[slot])) out[slot] = w[slot];
  return out;
}

const n2 = (v) => round2(v);
const attrs = (extra) => (extra ? ` ${extra}` : "");
const rectEl = (x, y, w, h, rx, fill, extra) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}"${rx ? ` rx="${n2(rx)}"` : ""} fill="${fill}"${attrs(extra)}/>`;
const pathEl = (d, fill, extra) => `<path d="${d}" fill="${fill}"${attrs(extra)}/>`;
const circleEl = (cx, cy, r, fill, extra) => `<circle cx="${n2(cx)}" cy="${n2(cy)}" r="${n2(r)}" fill="${fill}"${attrs(extra)}/>`;
const ellipseEl = (cx, cy, rx, ry, fill, extra) => `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}" fill="${fill}"${attrs(extra)}/>`;
const strokeEl = (d, colour, w, extra) => `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"${attrs(extra)}/>`;

const shellEl = (shell, fill, extra) => (shell.d ? pathEl(shell.d, fill, extra) : rectEl(shell.x, shell.y, shell.w, shell.h, shell.rx, fill, extra));

export const BODY = {
  ball: {
    shell: { d: "M-96 -14A96 96 0 0 1 96 -14V26A64 64 0 0 1 32 90H-32A64 64 0 0 1 -96 26Z" },
    top: -110, foot: 90, hw: 90, faceY: -25, antenna: [[0, -110]], hat: [-96, 48],
    arms: [[-106, -31, -126, -93], [106, -31, 126, -93]]
  },
  tall: {
    shell: { d: "M-66 -64A66 66 0 0 1 66 -64V52A52 52 0 0 1 14 104H-14A52 52 0 0 1 -66 52Z" },
    top: -130, foot: 104, hw: 64, faceY: -20, antenna: [[0, -130]], hat: [-98, 57],
    arms: [[-80, -26, -100, -88], [80, -26, 100, -88]]
  },
  wide: {
    shell: { d: "M-112 -16A112 74 0 0 1 112 -16V34A48 48 0 0 1 64 82H-64A48 48 0 0 1 -112 34Z" },
    top: -90, foot: 82, hw: 110, faceY: -15, antenna: [[0, -90]], hat: [-78, 62],
    arms: [[-124, -18, -140, -80], [124, -18, 140, -80]]
  },
  triangle: {
    shell: { d: "M-22 -100Q0 -134 22 -100L94 54Q120 96 70 96H-70Q-120 96 -94 54Z" },
    top: -122, foot: 96, hw: 22, faceY: 40, antenna: [[0, -120]], hat: [-90, 28],
    arms: [[-104, 26, -124, -36], [104, 26, 124, -36]]
  },
  capsule: {
    shell: { d: "M-70 -14A70 70 0 0 1 70 -14V36A70 70 0 0 1 -70 36Z" },
    top: -84, foot: 106, hw: 70, faceY: -16, antenna: [[40, -80]], hat: [-70, 39],
    arms: [[-86, -22, -106, -84], [86, -22, 106, -84]]
  },
  tv: {
    shell: { x: -96, y: -74, w: 192, h: 148, rx: 44 },
    top: -74, foot: 74, hw: 96, faceY: -7, antenna: [[-30, -74]], hat: [-64, 92],
    arms: [[-112, -13, -132, -75], [112, -13, 132, -75]]
  },
  crawler: {
    shell: { x: -70, y: -26, w: 140, h: 96, rx: 30 },
    top: -102, foot: 96, hw: 74, faceY: -60, antenna: [], hat: [-90, 62],
    arms: [[-88, -10, -108, -72], [88, -10, 108, -72]],
    under: (col, shade) => rectEl(-84, 62, 60, 34, 12, INK) + rectEl(24, 62, 60, 34, 12, INK)
      + [-64, -44, 44, 64].map((x) => circleEl(x, 79, 8, shade)).join("")
  },
  cocoon: {
    shell: { d: "M0 -122Q80 -122 82 -30Q84 54 18 94Q0 104 -18 94Q-84 54 -82 -30Q-80 -122 0 -122Z" },
    top: -122, foot: 98, hw: 60, faceY: -36, antenna: [], hat: [-104, 55],
    arms: [[-98, 4, -120, -58], [98, 4, 120, -58]],
    over: (col, shade) => circleEl(0, 40, 8, shade)
  },
  bee: {
    shell: { d: "M-68 -34A68 68 0 0 1 68 -34V38Q68 58 44 74L14 94Q0 102 -14 94L-44 74Q-68 58 -68 38Z" },
    top: -100, foot: 98, hw: 66, faceY: 10, antenna: [[-30, -92, -6, -22], [30, -92, 6, -22]], hat: [-80, 50],
    arms: [[-86, -6, -106, -68], [86, -6, 106, -68]],
    stripes: true
  }
};

export const bodyOf = (shape) => BODY[shape] || BODY.ball;

export const EYE_X = 27;
export const SCREEN = { w: 124, h: 84, rx: 42 };

export const LOOKS = {
  attentive: [[6, 42, 48, 0], [6, 42, 48, 0]],
  happy: [["arc"], ["arc"]],
  joy: [["joy"], ["joy"]],
  surprised: [[4, 46, 54, 0], [4, 46, 54, 0]],
  sleepy: [["u"], ["u"]],
  suspicious: [[2, 42, 56, 0], ["hmm"]],
  sad: [[10, 46, 18, -16], [10, 46, 18, 16]],
  curious: [["round"], ["round"]],
  scared: [["poor"], ["poor"]],
  angry: [["brow"], ["brow"]],
  wink: [[6, 42, 48, 0], [8, 36, 8, -5]],
  dim: [[14, 34, 8, 0], [14, 34, 8, 0]],
  dot: [[6, 12, 12, 0], [6, 12, 12, 0]],
  dizzy: [["x"], ["x"]],
  none: []
};

export const lookOf = (look) => LOOKS[look] || LOOKS.attentive;

export const GLASSES_LOOKS = ["attentive"];

export function eyeShapes(look, worn) {
  const glasses = GLASSES_LOOKS.includes(look) ? worn : null;
  return lookOf(look).map((e, i) => {
    const x = i ? EYE_X : -EYE_X;
    if (e[0] === "arc") return { kind: "arc", x, y: 0, path: `M${n2(x - 18)} 12Q${n2(x)} -10 ${n2(x + 18)} 12`, w: 10 };
    if (e[0] === "joy") return { kind: "fill", round: 12, x, y: 0, path: `M${n2(x - 16)} 16A16 30 0 0 1 ${n2(x + 16)} 16Z` };
    if (e[0] === "u") return { kind: "arc", x, y: 0, path: `M${n2(x - 17)} 10Q${n2(x)} 22 ${n2(x + 17)} 10`, w: 9 };
    if (e[0] === "round") return { kind: "circle", x, y: 6, r: 23 };
    if (e[0] === "hmm") {
      const cy = 6;
      return { kind: "fill", round: 12, x, y: 0, path: `M${n2(x - 15)} ${n2(cy + 3)}L${n2(x + 15)} ${n2(cy - 4)}V${n2(cy + 12)}A6 6 0 0 1 ${n2(x + 9)} ${n2(cy + 18)}H${n2(x - 9)}A6 6 0 0 1 ${n2(x - 15)} ${n2(cy + 12)}Z` };
    }
    if (e[0] === "poor") {
      const o = i ? -1 : 1;
      const cy = 6;
      const sweep = i ? 0 : 1;
      return { kind: "fill", round: 12, x, y: 0, path: `M${n2(x - o * 15)} ${n2(cy + 10)}L${n2(x + o * 2)} ${n2(cy - 18)}H${n2(x + o * 9)}A6 6 0 0 ${sweep} ${n2(x + o * 15)} ${n2(cy - 12)}V${n2(cy + 12)}A6 6 0 0 ${sweep} ${n2(x + o * 9)} ${n2(cy + 18)}H${n2(x - o * 9)}A6 6 0 0 ${sweep} ${n2(x - o * 15)} ${n2(cy + 12)}Z` };
    }
    if (e[0] === "x") return { kind: "x", x, y: 0, path: `M${n2(x - 10)} -10L${n2(x + 10)} 10M${n2(x + 10)} -10L${n2(x - 10)} 10`, w: 7 };
    if (e[0] === "brow") {
      const inner = i ? -1 : 1;
      return { kind: "brow", x, y: 2, path: `M${n2(x - inner * 12)} -12L${n2(x + inner * 12)} -1L${n2(x + inner * 12)} 13L${n2(x - inner * 12)} 13Z`, w: 6 };
    }
    const [dy, w, h, rot] = e;
    if (glasses === "round" && h >= 20) return { kind: "circle", x, y: dy, r: h / 2 };
    if (glasses === "square" && h >= 20) return { kind: "rect", x: x - (h - 2) / 2, y: dy - (h - 2) / 2, w: h - 2, h: h - 2, rx: 5, rot: 0, cx: x, cy: dy };
    return { kind: "rect", x: x - w / 2, y: dy - h / 2, w, h, rx: Math.min(w, h) * 0.42, rot, cx: x, cy: dy };
  });
}

function innerEdge(e, side) {
  if (e.kind === "rect") return { x: e.cx + side * e.w / 2, y: e.cy };
  if (e.kind === "circle") return { x: e.x + side * e.r, y: e.y };
  return { x: e.x + side * 14, y: e.y };
}

export function bridgeOf(shapes) {
  const l = innerEdge(shapes[0], 1);
  const r = innerEdge(shapes[1], -1);
  const y = (l.y + r.y) / 2;
  return `M${n2(l.x - 1)} ${n2(y)}L${n2(r.x + 1)} ${n2(y)}`;
}

export function eyeEl(e, fill, extra) {
  if (e.kind === "arc" || e.kind === "x") return strokeEl(e.path, fill, e.w, extra);
  if (e.kind === "fill") return e.round ? `<path d="${e.path}" fill="${fill}" stroke="${fill}" stroke-width="${n2(e.round)}" stroke-linejoin="round"${attrs(extra)}/>` : pathEl(e.path, fill, extra);
  if (e.kind === "brow") return `<path d="${e.path}" fill="${fill}" stroke="${fill}" stroke-width="${n2(e.w)}" stroke-linejoin="round"${attrs(extra)}/>`;
  if (e.kind === "circle") return circleEl(e.x, e.y, e.r, fill, extra);
  const turn = e.rot ? ` transform="rotate(${e.rot} ${n2(e.cx)} ${n2(e.cy)})"` : "";
  return rectEl(e.x, e.y, e.w, e.h, e.rx, fill, `${extra || ""}${turn}`.trim());
}

export function toneOf(colour) {
  return { screen: mixHex(paintOf(colour), INK, 0.66), eye: PAPER };
}

export function lookDeltas(spec, dYaw, dPitch) {
  const d = { dx: round2(dYaw * 0.5), dy: round2(-dPitch * 0.45) };
  return [d, { ...d }];
}

const SACCADES = [
  { at: 0, yaw: 0, pitch: 0 },
  { at: 17, yaw: 7.5, pitch: -2.5 },
  { at: 38, yaw: 2, pitch: 4 },
  { at: 55, yaw: -6.5, pitch: -1.5 },
  { at: 72, yaw: -1.5, pitch: -4.5 },
  { at: 88, yaw: 5, pitch: 2 },
  { at: 100, yaw: 0, pitch: 0 }
];

function lookKeyframes(spec, id) {
  const frames = [];
  for (let s = 0; s < SACCADES.length; s++) {
    const step = SACCADES[s];
    const d = lookDeltas(spec, step.yaw, step.pitch)[0];
    if (s > 0) {
      const prev = lookDeltas(spec, SACCADES[s - 1].yaw, SACCADES[s - 1].pitch)[0];
      frames.push(`${Math.max(0, step.at - 3)}% { transform: translate(${prev.dx}px, ${prev.dy}px); }`);
    }
    frames.push(`${step.at}% { transform: translate(${d.dx}px, ${d.dy}px); }`);
  }
  return `@keyframes ${id}-look0 { ${frames.join(" ")} }@keyframes ${id}-look1 { ${frames.join(" ")} }`;
}

export function screenSvg(spec, id, look, { eyes = null, eyeAlpha = 1, tint = 0, blush = 0, red = 0, glow = 0.5, live = false } = {}) {
  const body = bodyOf(spec.shape);
  const tone = toneOf(spec.colour);
  const cy = body.faceY;
  const { w, h, rx } = SCREEN;
  if (look === "angry" && tint < 0.01) tint = 0.55;
  const eyeFill = red > 0.5 ? ALARM : tone.eye;
  const shapes = eyes || eyeShapes(look, parseWear(spec.wear).glasses);
  const wrap = (e, i, inner) => (live
    ? `<g class="av-seat" data-eye="${i}" transform="translate(0 ${n2(cy)})" style="--av-look:${id}-look${i}"><g class="av-look">${inner}</g></g>`
    : `<g transform="translate(0 ${n2(cy)})">${inner}</g>`);
  const moved = (e, inner) => (e.transform ? `<g transform="${e.transform}">${inner}</g>` : inner);
  const drawn = shapes.map((e, i) => wrap(e, i, moved(e, eyeEl(e, eyeFill, live && e.kind === "rect" ? 'class="av-eye"' : "")))).join("");
  const glowing = shapes.map((e) => `<g transform="translate(0 ${n2(cy)})">${moved(e, eyeEl(e, eyeFill))}</g>`).join("");
  const glasses = parseWear(spec.wear).glasses;
  const shift = shapes[0] && shapes[0].shift ? shapes[0].shift : { dx: 0, dy: 0 };
  const bridge = glasses && GLASSES_LOOKS.includes(look) && shapes.length === 2
    ? (live
      ? `<g class="av-seat" data-eye="0" transform="translate(0 ${n2(cy)})" style="--av-look:${id}-look0"><g class="av-look">${strokeEl(bridgeOf(shapes), eyeFill, 6)}</g></g>`
      : `<g transform="translate(${n2(shift.dx)} ${n2(cy + shift.dy)})">${strokeEl(bridgeOf(shapes), eyeFill, 6)}</g>`)
    : "";
  const alpha = eyeAlpha < 0.995 ? ` opacity="${n2(eyeAlpha)}"` : "";
  return `<defs><clipPath id="${id}-sc"><rect x="${-w / 2}" y="${n2(cy - h / 2)}" width="${w}" height="${h}" rx="${rx}"/></clipPath>`
    + `<pattern id="${id}-sl" width="4" height="4" patternUnits="userSpaceOnUse"><rect y="3" width="4" height="1" fill="#000" fill-opacity=".22"/></pattern>`
    + `<radialGradient id="${id}-sv" cx=".5" cy=".5" r=".62"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></radialGradient>`
    + `<filter id="${id}-sg" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter></defs>`
    + rectEl(-w / 2, cy - h / 2, w, h, rx, tone.screen)
    + `<g clip-path="url(#${id}-sc)" class="av-crt">`
    + (tint > 0.01 ? rectEl(-w / 2, cy - h / 2, w, h, 0, ALARM, `opacity="${n2(tint * 0.34)}"`) : "")
    + (glow > 0.01 && shapes.length ? `<g filter="url(#${id}-sg)" opacity="${n2(glow * eyeAlpha)}">${glowing}</g>` : "")
    + `<g class="av-eyes"${alpha}>${drawn}${bridge}</g>`
    + (blush > 0.01 ? `<g opacity="${n2(blush * 0.6)}" transform="translate(${n2(shift.dx)} ${n2(shift.dy)})">${ellipseEl(-EYE_X - 4, cy + 27, 14, 6, BLUSH)}${ellipseEl(EYE_X + 4, cy + 27, 14, 6, BLUSH)}</g>` : "")
    + rectEl(-w / 2, cy - h / 2, w, h, 0, `url(#${id}-sl)`, 'opacity=".45"')
    + rectEl(-w / 2, cy - h / 2, w, h, 0, `url(#${id}-sv)`, 'opacity=".55"')
    + glintSvg(id, cy)
    + `</g>`
    + rectEl(-w / 2 + 1.5, cy - h / 2 + 1.5, w - 3, h - 3, rx - 1.5, "none", `stroke="${mixHex(tone.screen, INK, 0.45)}" stroke-width="3"`);
}

export function glintSvg(id, cy) {
  const { w, h, rx } = SCREEN;
  const inset = 4.5;
  const top = cy - h / 2 + inset;
  const left = -w / 2 + inset;
  const r = rx - inset;
  const end = left + w * 0.58;
  return `<defs><linearGradient id="${id}-gl" gradientUnits="userSpaceOnUse" x1="${n2(left)}" y1="0" x2="${n2(end)}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`
    + `<path d="M${n2(left)} ${n2(top + r + 10)}V${n2(top + r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(left + r)} ${n2(top)}H${n2(end)}" fill="none" stroke="url(#${id}-gl)" stroke-width="3" stroke-linecap="butt"/>`;
}

export function textureSvg(spec, id) {
  const body = bodyOf(spec.shape);
  const hx = -body.hw * 0.38;
  const hy = body.top + 34;
  const hr = Math.max(26, body.hw * 0.5);
  return `<defs><linearGradient id="${id}-tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".38" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>`
    + `<radialGradient id="${id}-ts" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".6" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
    + `<clipPath id="${id}-tc">${shellEl(body.shell, "#000")}</clipPath></defs>`
    + `<g clip-path="url(#${id}-tc)">`
    + rectEl(-130, -170, 260, 300, 0, `url(#${id}-tg)`)
    + ellipseEl(hx, hy, hr * 1.25, hr * 0.8, `url(#${id}-ts)`, `transform="rotate(-18 ${n2(hx)} ${n2(hy)})"`)
    + rectEl(-130, body.foot - 8, 260, 10, 0, "#000", 'opacity=".12"')
    + `</g>`;
}

export function shellSvg(spec, id) {
  const body = bodyOf(spec.shape);
  const col = paintOf(spec.colour);
  const shade = shadeOf(spec.colour);
  let out = (body.under ? body.under(col, shade) : "") + shellEl(body.shell, col);
  if (body.stripes) {
    out += `<clipPath id="${id}-st">${shellEl(body.shell, "#000")}</clipPath><g clip-path="url(#${id}-st)">${rectEl(-100, 58, 200, 10, 0, INK)}${rectEl(-100, 78, 200, 10, 0, INK)}</g>`;
  }
  return out;
}

export function crestSvg(spec, { wobble = 0, glow = 0, busy = 0 } = {}) {
  const body = bodyOf(spec.shape);
  const col = paintOf(spec.colour);
  const pair = body.antenna.length > 1;
  return body.antenna.map(([x, y, dx = 0, dy = -22], i) => {
    const tip = { x: x + dx, y: y + dy };
    const lit = busy > 0.01 ? mixHex(col, BASE.amber, clamp(busy)) : col;
    const ball = glow > 0.01 ? mixHex(lit, "#ffffff", glow * 0.7) : lit;
    const swing = wobble ? ` transform="rotate(${n2(wobble * (i % 2 ? -1 : 1))} ${n2(x)} ${n2(y + 4)})"` : "";
    return `<g class="av-crest"${swing}>${strokeEl(`M${n2(x)} ${n2(y + 4)}L${n2(tip.x)} ${n2(tip.y)}`, INK, pair ? 5 : 6)}${circleEl(tip.x, tip.y - 4, pair ? 8 : 11, ball)}</g>`;
  }).join("");
}

export const ARM_SHOULDER = 13;
export const ARM_TIP = 6.5;

export function taperPath(x0, y0, r0, x1, y1, r1) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  return `M${n2(x0 + nx * r0)} ${n2(y0 + ny * r0)}L${n2(x1 + nx * r1)} ${n2(y1 + ny * r1)}A${n2(r1)} ${n2(r1)} 0 0 0 ${n2(x1 - nx * r1)} ${n2(y1 - ny * r1)}L${n2(x0 - nx * r0)} ${n2(y0 - ny * r0)}A${n2(r0)} ${n2(r0)} 0 0 0 ${n2(x0 + nx * r0)} ${n2(y0 + ny * r0)}Z`;
}

export function armsSvg(spec, swing = 0) {
  const body = bodyOf(spec.shape);
  const col = paintOf(spec.colour);
  return body.arms.map(([x0, y0, x1, y1], i) => {
    const a = swing * (i ? -1 : 1);
    return `<g class="av-arm" transform="rotate(${n2(a)} ${n2(x0)} ${n2(y0)})">${pathEl(taperPath(x0, y0, ARM_SHOULDER, x1, y1, ARM_TIP), col)}${pathEl(taperPath(x0 - 2, y0 - 3, ARM_SHOULDER * 0.45, x1 - 2, y1 - 3, ARM_TIP * 0.45), "#fff", 'opacity=".16"')}</g>`;
  }).join("");
}

export function hatSvg(spec, id) {
  const body = bodyOf(spec.shape);
  const model = parseWear(spec.wear).hat;
  if (!model) return "";
  const [brim, wb] = body.hat;
  const apex = body.top;
  const bare = shellEl(body.shell, "#000");
  const crown = (colour) => `<clipPath id="${id}-hc">${bare}</clipPath>${rectEl(-130, -170, 260, brim + 170, 0, colour, `clip-path="url(#${id}-hc)"`)}`;
  const band = (colour, pad, hgt, yoff = 6) => rectEl(-wb - pad, brim - yoff, 2 * wb + 2 * pad, hgt, hgt / 2, colour);
  const ry = Math.max(brim - apex + 3, wb * 0.55);
  const dtop = brim - ry;
  const dome = (colour) => crown(colour) + pathEl(`M${n2(-wb - 2)} ${n2(brim)}A${n2(wb + 2)} ${n2(ry)} 0 0 1 ${n2(wb + 2)} ${n2(brim)}Z`, colour);
  const RED = BASE.red;
  const DARK_RED = mixHex(BASE.red, INK, 0.3);
  let out = "";
  if (model === "cap") out = dome(BASE.blue) + band(BASE.blue, 3, 10) + rectEl(-4, brim - 6, wb + 26, 10, 5, BASE.blue) + circleEl(0, dtop + 1, 5, BASE.blue);
  if (model === "beanie") out = dome(RED) + band(DARK_RED, 4, 14, 8) + circleEl(0, dtop - 2, 9, PAPER);
  if (model === "bucket") out = dome(BASE.green) + band(BASE.green, 22, 11);
  if (model === "headband") out = band(RED, 3, 13, 7) + rectEl(wb * 0.45, brim - 7, 22, 13, 6, PAPER, 'opacity=".7"');
  if (model === "tophat") {
    const tw = Math.min(wb + 2, 44);
    const th = Math.max(56, tw * 1.3);
    const bw = Math.max(wb, tw);
    out = crown(INK) + rectEl(-tw, brim - th, 2 * tw, th + 4, 5, INK) + rectEl(-bw - 20, brim - 4, 2 * bw + 40, 10, 5, INK) + rectEl(-tw, brim - 20, 2 * tw, 8, 0, RED);
  }
  if (model === "crown") {
    const step = (2 * wb) / 4;
    let d = `M${n2(-wb)} ${n2(brim + 6)}V${n2(brim - 26)}`;
    for (let i = 1; i <= 4; i++) d += `L${n2(-wb + step * (i - 0.5))} ${n2(brim - 8)}L${n2(-wb + step * i)} ${n2(brim - 26)}`;
    d += `V${n2(brim + 6)}Z`;
    out = pathEl(d, BASE.amber) + [0, 1, 2, 3, 4].map((i) => circleEl(-wb + step * i, brim - 26, 3.5, RED)).join("");
  }
  if (model === "party") {
    const ph = Math.max(70, wb * 1.1);
    const b4 = wb + 4;
    out = crown(BASE.pink) + pathEl(`M${n2(-b4)} ${n2(brim + 4)}L0 ${n2(brim - ph)}L${n2(b4)} ${n2(brim + 4)}Z`, BASE.pink)
      + strokeEl(`M${n2(-b4 * 0.6)} ${n2(brim - ph * 0.4)}h${n2(b4 * 1.2)}M${n2(-b4 * 0.3)} ${n2(brim - ph * 0.7)}h${n2(b4 * 0.6)}`, PAPER, 4)
      + circleEl(0, brim - ph - 2, 6, BASE.amber);
  }
  if (model === "wizard") {
    const wh = Math.max(76, wb * 1.2);
    const b4 = wb + 4;
    out = crown(BASE.purple) + pathEl(`M${n2(-b4)} ${n2(brim + 4)}Q${n2(-b4 * 0.55)} ${n2(brim - wh * 0.5)} 8 ${n2(brim - wh)}Q${n2(b4 * 0.5)} ${n2(brim - wh * 0.45)} ${n2(b4)} ${n2(brim + 4)}Z`, BASE.purple)
      + band(BASE.purple, 24, 11, 5)
      + pathEl(`M0 ${n2(brim - wh * 0.45)}l2.5 6 6.5 .5 -5 4.5 1.5 6.5 -5.5 -3.5 -5.5 3.5 1.5 -6.5 -5 -4.5 6.5 -.5z`, BASE.amber);
  }
  if (model === "fedora") {
    const FELT = "#433c38";
    const FELT_BRIM = "#4f4743";
    const FELT_BAND = "#141212";
    const w = wb + 2;
    const ch = clamp(Math.max(brim - apex + 14, wb * 0.72), 52, 62);
    const top = brim - ch;
    const B = wb + 28;
    const tw = w * 0.9;
    const dome2 = `M${n2(-w)} ${n2(brim)}C${n2(-w)} ${n2(brim - ch * 0.55)} ${n2(-tw)} ${n2(top + 18)} ${n2(-tw)} ${n2(top + 12)}`
      + `Q${n2(-tw)} ${n2(top)} ${n2(-tw * 0.72)} ${n2(top)}Q${n2(-tw * 0.3)} ${n2(top + 1)} 0 ${n2(top + 8)}Q${n2(tw * 0.3)} ${n2(top + 1)} ${n2(tw * 0.72)} ${n2(top)}`
      + `Q${n2(tw)} ${n2(top)} ${n2(tw)} ${n2(top + 12)}C${n2(tw)} ${n2(top + 18)} ${n2(w)} ${n2(brim - ch * 0.55)} ${n2(w)} ${n2(brim)}Z`;
    const dent = `M${n2(-tw * 0.34)} ${n2(top + 1)}Q0 ${n2(top + 20)} ${n2(tw * 0.34)} ${n2(top + 1)}Q0 ${n2(top + 10)} ${n2(-tw * 0.34)} ${n2(top + 1)}Z`;
    const brimPath = `M${n2(-B)} ${n2(brim - 10)}Q${n2(-B - 2)} ${n2(brim + 6)} ${n2(-B + 16)} ${n2(brim + 8)}`
      + `Q${n2(-B * 0.5)} ${n2(brim + 15)} 0 ${n2(brim + 15)}Q${n2(B * 0.5)} ${n2(brim + 15)} ${n2(B - 16)} ${n2(brim + 8)}`
      + `Q${n2(B + 2)} ${n2(brim + 6)} ${n2(B)} ${n2(brim - 10)}Q${n2(B - 8)} ${n2(brim - 4)} ${n2(B * 0.6)} ${n2(brim - 4)}`
      + `H${n2(-B * 0.6)}Q${n2(-B + 8)} ${n2(brim - 4)} ${n2(-B)} ${n2(brim - 10)}Z`;
    out = crown(FELT) + pathEl(dome2, FELT) + pathEl(dent, "#000", 'opacity=".2"')
      + strokeEl(`M${n2(-tw * 0.86)} ${n2(top + 14)}Q${n2(-tw * 0.78)} ${n2(top + 4)} ${n2(-tw * 0.5)} ${n2(top + 3)}`, "#fff", 4, 'opacity=".14"')
      + rectEl(-w - 1, brim - 18, 2 * w + 2, 20, 0, FELT_BAND)
      + rectEl(-w * 0.55 - 8, brim - 20, 16, 22, 3, FELT_BAND)
      + rectEl(-w * 0.55 - 2, brim - 17, 4, 14, 1, "#fff", 'opacity=".12"')
      + pathEl(brimPath, FELT_BRIM)
      + strokeEl(`M${n2(-B + 12)} ${n2(brim + 2)}H${n2(B - 12)}`, "#000", 3, 'opacity=".26"')
      + strokeEl(`M${n2(-B + 12)} ${n2(brim + 9)}Q0 ${n2(brim + 17)} ${n2(B - 12)} ${n2(brim + 9)}`, "#000", 3, 'opacity=".22"')
      + strokeEl(`M${n2(-B + 3)} ${n2(brim - 7)}Q${n2(-B + 2)} ${n2(brim + 3)} ${n2(-B + 22)} ${n2(brim + 5)}`, "#fff", 3, 'opacity=".14"');
  }
  if (model === "cowboy") {
    const TAN = "#c2894d";
    const TAN_DARK = "#8a5a2c";
    const TAN_BAND = "#5b3a1e";
    const w = wb + 2;
    const ch = clamp(Math.max(brim - apex + 14, wb * 0.78), 50, 72);
    const top = brim - ch;
    const B = Math.max(wb + 38, body.hw + 6);
    const dome2 = `M${n2(-w)} ${n2(brim)}C${n2(-w * 0.99)} ${n2(brim - ch * 0.5)} ${n2(-w * 0.92)} ${n2(top + 4)} ${n2(-w * 0.56)} ${n2(top)}`
      + `Q${n2(-w * 0.28)} ${n2(top - 4)} 0 ${n2(top + 13)}Q${n2(w * 0.28)} ${n2(top - 4)} ${n2(w * 0.56)} ${n2(top)}`
      + `C${n2(w * 0.92)} ${n2(top + 4)} ${n2(w * 0.99)} ${n2(brim - ch * 0.5)} ${n2(w)} ${n2(brim)}Z`;
    const crease = `M${n2(-w * 0.3)} ${n2(top + 2)}Q0 ${n2(top + 26)} ${n2(w * 0.3)} ${n2(top + 2)}Q0 ${n2(top + 14)} ${n2(-w * 0.3)} ${n2(top + 2)}Z`;
    const brimPath = `M${n2(-B)} ${n2(brim - 26)}C${n2(-B + 2)} ${n2(brim + 2)} ${n2(-B + 20)} ${n2(brim + 12)} ${n2(-B * 0.42)} ${n2(brim + 13)}`
      + `H${n2(B * 0.42)}C${n2(B - 20)} ${n2(brim + 12)} ${n2(B - 2)} ${n2(brim + 2)} ${n2(B)} ${n2(brim - 26)}`
      + `C${n2(B - 6)} ${n2(brim - 8)} ${n2(B - 22)} ${n2(brim - 1)} ${n2(B * 0.42)} ${n2(brim - 1)}`
      + `H${n2(-B * 0.42)}C${n2(-B + 22)} ${n2(brim - 1)} ${n2(-B + 6)} ${n2(brim - 8)} ${n2(-B)} ${n2(brim - 26)}Z`;
    const stitch = `M${n2(-B + 8)} ${n2(brim - 14)}C${n2(-B + 12)} ${n2(brim + 2)} ${n2(-B + 24)} ${n2(brim + 8)} ${n2(-B * 0.42)} ${n2(brim + 9)}H${n2(B * 0.42)}C${n2(B - 24)} ${n2(brim + 8)} ${n2(B - 12)} ${n2(brim + 2)} ${n2(B - 8)} ${n2(brim - 14)}`;
    out = crown(TAN) + pathEl(dome2, TAN) + pathEl(crease, "#000", 'opacity=".18"')
      + strokeEl(`M${n2(-w * 0.58)} ${n2(top + 10)}Q${n2(-w * 0.42)} ${n2(top + 2)} ${n2(-w * 0.24)} ${n2(top + 1)}`, "#fff", 4, 'opacity=".14"')
      + rectEl(-w - 1, brim - 15, 2 * w + 2, 12, 0, TAN_BAND)
      + rectEl(-w * 0.34 - 7, brim - 17, 14, 16, 3, BASE.amber)
      + rectEl(-w * 0.34 - 3, brim - 13, 6, 8, 1.5, TAN_BAND)
      + pathEl(brimPath, TAN)
      + strokeEl(stitch, TAN_DARK, 2.5, 'stroke-dasharray="4 5" opacity=".7"')
      + strokeEl(`M${n2(-B + 14)} ${n2(brim + 6)}Q0 ${n2(brim + 15)} ${n2(B - 14)} ${n2(brim + 6)}`, "#000", 3, 'opacity=".2"');
  }
  return out ? `<g data-wear="hat:${model}">${out}</g>` : "";
}

export function extraSvg(spec, id) {
  const body = bodyOf(spec.shape);
  const model = parseWear(spec.wear).extra;
  if (!model) return "";
  const fy = body.faceY;
  const fb = fy + 42;
  const RED = BASE.red;
  const DARK_RED = mixHex(BASE.red, INK, 0.3);
  let out = "";
  if (model === "bowtie") {
    out = pathEl(`M-26 ${n2(fb + 6)}l22 9 -22 9zM26 ${n2(fb + 6)}l-22 9 22 9z`, RED) + circleEl(0, fb + 15, 5, DARK_RED);
  }
  if (model === "bow") {
    out = pathEl(`M-44 ${n2(fy - 46)}l-20 -12 2 24zM-44 ${n2(fy - 46)}l20 -12 -2 24z`, BASE.pink) + circleEl(-44, fy - 46, 5, mixHex(BASE.pink, INK, 0.3));
  }
  if (model === "scarf") {
    out = `<clipPath id="${id}-xc">${shellEl(body.shell, "#000")}</clipPath><g clip-path="url(#${id}-xc)">`
      + rectEl(-130, fb + 2, 260, 18, 0, RED)
      + [-100, -60, -20, 20, 60, 100].map((x) => rectEl(x, fb + 2, 10, 18, 0, DARK_RED)).join("")
      + rectEl(18, fb + 12, 20, 46, 8, RED) + rectEl(18, fb + 30, 20, 5, 0, DARK_RED) + rectEl(18, fb + 44, 20, 5, 0, DARK_RED)
      + `</g>`;
  }
  if (model === "tie") {
    const NAVY = "#2b3550";
    const len = clamp(body.foot - fb - 4, 16, 54);
    const knot = `M-9 ${n2(fb + 1)}H9L13 ${n2(fb + 13)}H-13Z`;
    const blade = `M-10 ${n2(fb + 12)}H10L14 ${n2(fb + len - 12)}L0 ${n2(fb + len)}L-14 ${n2(fb + len - 12)}Z`;
    const stripes = [0.3, 0.62].map((t) => {
      const y = fb + 12 + (len - 12) * t;
      return strokeEl(`M-16 ${n2(y + 8)}L16 ${n2(y - 8)}`, RED, 4);
    }).join("");
    out = `<clipPath id="${id}-xc">${shellEl(body.shell, "#000")}</clipPath><g clip-path="url(#${id}-xc)">`
      + `<clipPath id="${id}-tb">${pathEl(blade, "#000")}</clipPath>`
      + pathEl(blade, NAVY, `stroke="${NAVY}" stroke-width="5" stroke-linejoin="round"`)
      + `<g clip-path="url(#${id}-tb)">${stripes}</g>`
      + pathEl(knot, NAVY, `stroke="${NAVY}" stroke-width="5" stroke-linejoin="round"`)
      + strokeEl(`M-9 ${n2(fb + 13)}H9`, RED, 3)
      + `</g>`;
  }
  if (model === "moustache") out = moustacheSvg(body.faceY);
  return out ? `<g data-wear="extra:${model}">${out}</g>` : "";
}

export function moustacheSvg(faceY) {
  const y = faceY + 36;
  const half = (s) => `M0 ${n2(y - 6)}C${n2(s * 10)} ${n2(y - 19)} ${n2(s * 30)} ${n2(y - 17)} ${n2(s * 41)} ${n2(y - 8)}`
    + `C${n2(s * 49)} ${n2(y - 2)} ${n2(s * 54)} ${n2(y + 6)} ${n2(s * 46)} ${n2(y + 10)}`
    + `C${n2(s * 40)} ${n2(y + 5)} ${n2(s * 34)} ${n2(y + 2)} ${n2(s * 25)} ${n2(y + 4)}`
    + `C${n2(s * 14)} ${n2(y + 7)} ${n2(s * 6)} ${n2(y + 6)} 0 ${n2(y + 3)}Z`;
  return pathEl(half(1), INK, `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`)
    + pathEl(half(-1), INK, `stroke="${INK}" stroke-width="4" stroke-linejoin="round"`)
    + strokeEl(`M-30 ${n2(y - 10)}Q-18 ${n2(y - 14)} -8 ${n2(y - 11)}M8 ${n2(y - 11)}Q18 ${n2(y - 14)} 30 ${n2(y - 10)}`, "#fff", 3, 'opacity=".14"');
}

export function sirenSvg(spec, id, { left = 1, right = 0, lens = 1 } = {}) {
  const body = bodyOf(spec.shape);
  const [brim, wb] = body.hat;
  const rx = Math.min(44, Math.max(26, wb * 0.66));
  const ry = Math.min(50, Math.max(30, brim - body.top + 8, wb * 0.72));
  const bw = Math.max(wb, rx + 6);
  const top = brim - ry;
  const ly = top + ry * 0.5;
  const beam = (dir, alpha) => (alpha < 0.02 ? "" : `<path d="M${n2(wb * 0.3)} ${n2(ly)}L${n2(wb + 90)} ${n2(ly - 34)}L${n2(wb + 90)} ${n2(ly + 34)}Z" fill="url(#${id}-rb)" opacity="${n2(alpha)}"${dir < 0 ? ' transform="scale(-1 1)"' : ""}/>`);
  return `<defs><radialGradient id="${id}-rg" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ff9a8a"/><stop offset=".45" stop-color="#e8483f"/><stop offset="1" stop-color="#8f1d1a"/></radialGradient>`
    + `<radialGradient id="${id}-rh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff812e" stop-opacity=".55"/><stop offset="1" stop-color="#ff812e" stop-opacity="0"/></radialGradient>`
    + `<linearGradient id="${id}-rb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff812e" stop-opacity=".55"/><stop offset="1" stop-color="#ff812e" stop-opacity="0"/></linearGradient>`
    + `<clipPath id="${id}-rc">${shellEl(body.shell, "#000")}</clipPath></defs>`
    + `<g class="av-siren">`
    + ellipseEl(0, ly, wb * 2.6, ry * 1.6, `url(#${id}-rh)`, `opacity="${n2(0.5 + 0.5 * Math.max(left, right))}"`)
    + beam(1, right) + beam(-1, left)
    + rectEl(-130, -170, 260, brim + 170, 0, "#15201f", `clip-path="url(#${id}-rc)"`)
    + pathEl(`M${n2(-rx)} ${n2(brim - 2)}A${n2(rx)} ${n2(ry)} 0 0 1 ${n2(rx)} ${n2(brim - 2)}Z`, `url(#${id}-rg)`)
    + ellipseEl(-rx * 0.4, top + ry * 0.4, rx * 0.2, ry * 0.28, "#fff", 'opacity=".3"')
    + circleEl(0, ly, Math.max(5, rx * 0.22), "#ffd9d2", `opacity="${n2(0.2 + 0.75 * lens)}"`)
    + rectEl(-bw - 5, brim - 7, 2 * bw + 10, 14, 7, "#15201f") + rectEl(-rx - 6, brim - 9, 2 * rx + 12, 6, 3, "#2f4a47")
    + `</g>`;
}

export function wearPaths(spec, wear, id = "av") {
  const dressed = { ...spec, wear: wornBy(spec.shape, wear) };
  if (!isDressed(dressed.wear)) return "";
  return extraSvg(dressed, id) + hatSvg(dressed, id);
}

export function idleRhythm(spec) {
  const h = hash(avatarKey(spec));
  return {
    breath: round2(3.1 + ((h >>> 3) % 190) / 100),
    sway: round2(6.4 + ((h >>> 11) % 320) / 100),
    every: round2(3.9 + ((h >>> 17) % 340) / 100),
    at: round2(-((h >>> 23) % 500) / 100),
    glance: round2(11 + ((h >>> 5) % 700) / 100),
    glanceAt: round2(-((h >>> 13) % 900) / 100)
  };
}

export function bodySvg(spec, id, { look = "attentive", eyes = null, eyeAlpha = 1, tint = 0, blush = 0, red = 0, glow = 0.5, live = false, transform = "", wobble = 0, flash = 0, busy = 0, siren = null, arms = null, notif = null } = {}) {
  const body = bodyOf(spec.shape);
  const wear = wornBy(spec.shape, spec.wear);
  const covered = !!wear.hat || !!siren;
  const pose = transform ? ` transform="${transform}"` : "";
  return `<g class="av-body"${pose}>`
    + shellSvg(spec, id)
    + textureSvg(spec, id)
    + screenSvg(spec, id, look, { eyes, eyeAlpha, tint, blush, red, glow, live })
    + (body.over ? body.over(paintOf(spec.colour), shadeOf(spec.colour)) : "")
    + (covered ? "" : crestSvg(spec, { wobble, glow: flash, busy }))
    + (arms ? armsSvg(spec, arms.swing) : "")
    + (siren ? sirenSvg(spec, id, siren) : (extraSvg({ ...spec, wear }, id) + hatSvg({ ...spec, wear }, id)))
    + (notif ? circleEl(body.hw * 0.72, body.top + 10, 15 * notif.r, "#2496e8", `opacity="${n2(notif.alpha)}"`) : "")
    + `</g>`;
}

export function avatarSvg(spec, opts = {}) {
  const safe = normalAvatar(spec, opts.seed);
  const wear = parseWear(spec?.wear);
  const dressed = { ...safe, wear };
  const id = opts.id || `av-${hash(avatarKey(safe) + wearKey(wear) + (opts.salt || ""))}`;
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : "";
  const label = opts.title ? `<title>${opts.title}</title>` : "";
  const role = opts.title ? 'role="img"' : 'aria-hidden="true"';
  const span = BOX * 2;
  const beat = idleRhythm(safe);
  const clock = ` style="--av-breath:${beat.breath}s;--av-sway:${beat.sway}s;--av-blink:${beat.every}s;--av-blink-at:${beat.at}s;--av-glance:${beat.glance}s;--av-glance-at:${beat.glanceAt}s"`;
  const motion = `<style>${lookKeyframes(safe, id)}</style>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-BOX} ${-BOX} ${span} ${span}"${size} ${role} class="${opts.class || "avatar"}"${clock}>${label}${motion}<g>${bodySvg(dressed, id, { live: true })}</g></svg>`;
}
