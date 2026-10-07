import { deflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SIDE = 1024;
const PLATE = 824;
const CORNER_N = 2.8;
const CORNER_SHARE = 185.4 / 824;
const SUB = 4;

const SHADOW_OFFSET = 14;
const SHADOW_BLUR = 10;
const SHADOW_PASSES = 3;
const SHADOW_ALPHA = 0.3;

const CELL_RADIUS = 112;
const CELL_GAP = 24;
const CELL_CORNER = 18;

const PLATE_TOP = [32, 27, 24];
const PLATE_BOTTOM = [14, 12, 11];
const CELL_TOP = [128, 122, 113];
const CELL_BOTTOM = [92, 87, 80];
const LIT_TOP = [229, 128, 87];
const LIT_BOTTOM = [194, 94, 63];
const GLOW_COLOR = [205, 105, 74];
const GLOW_REACH = 2.4;
const GLOW_STRENGTH = 0.2;

const MID = SIDE / 2;
const TOP_EDGE = MID - PLATE / 2;

const BLEED = SIDE / PLATE;

function metrics(scale) {
  const radius = CELL_RADIUS * scale;
  const apothem = (radius * Math.sqrt(3)) / 2;
  const drawApothem = apothem - (CELL_GAP * scale) / 2;
  const corner = CELL_CORNER * scale;
  const coreApothem = drawApothem - corner;
  const core = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    const coreRadius = coreApothem / (Math.sqrt(3) / 2);
    core.push([coreRadius * Math.cos(a), coreRadius * Math.sin(a)]);
  }
  const spacing = apothem * 2;
  const cells = [{ x: MID, y: MID, lit: true }];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    cells.push({ x: MID + spacing * Math.cos(a), y: MID + spacing * Math.sin(a), lit: false });
  }
  return { radius, corner, coreApothem, core, cells, glowRange: radius * GLOW_REACH };
}

const NORMALS = [];
for (let k = 0; k < 6; k++) {
  const a = (k * Math.PI) / 3;
  NORMALS.push([Math.cos(a), Math.sin(a)]);
}

function insideSquircle(x, y, side) {
  const half = side / 2;
  const corner = side * CORNER_SHARE;
  const dx = Math.abs(x - MID);
  const dy = Math.abs(y - MID);
  if (dx > half || dy > half) return false;
  const flat = half - corner;
  if (dx <= flat || dy <= flat) return true;
  const u = (dx - flat) / corner;
  const v = (dy - flat) / corner;
  return u ** CORNER_N + v ** CORNER_N <= 1;
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len = vx * vx + vy * vy;
  let t = len ? (wx * vx + wy * vy) / len : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const dx = wx - t * vx;
  const dy = wy - t * vy;
  return Math.sqrt(dx * dx + dy * dy);
}

function insideCell(dx, dy, shape) {
  let worst = -Infinity;
  for (let k = 0; k < 6; k++) {
    const d = dx * NORMALS[k][0] + dy * NORMALS[k][1];
    if (d > worst) worst = d;
  }
  if (worst <= shape.coreApothem) return true;
  if (worst > shape.coreApothem + shape.corner) return false;
  let best = Infinity;
  for (let k = 0; k < 6; k++) {
    const a = shape.core[k];
    const b = shape.core[(k + 1) % 6];
    const d = segmentDistance(dx, dy, a[0], a[1], b[0], b[1]);
    if (d < best) best = d;
  }
  return best <= shape.corner;
}

function ramp(top, bottom, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    top[0] + (bottom[0] - top[0]) * k,
    top[1] + (bottom[1] - top[1]) * k,
    top[2] + (bottom[2] - top[2]) * k
  ];
}

function paint({ clip, flatGround, scale }) {
  const shape = metrics(scale);
  const lit = shape.cells[0];

  const sample = (x, y) => {
    if (clip && !insideSquircle(x, y, clip)) return null;

    let nearest = shape.cells[0];
    let nearestDistance = Infinity;
    for (const cell of shape.cells) {
      const dx = x - cell.x;
      const dy = y - cell.y;
      const d = dx * dx + dy * dy;
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = cell;
      }
    }

    let color;
    let onCell = false;
    if (insideCell(x - nearest.x, y - nearest.y, shape)) {
      onCell = true;
      const local = (y - nearest.y + shape.radius) / (shape.radius * 2);
      color = nearest.lit ? ramp(LIT_TOP, LIT_BOTTOM, local) : ramp(CELL_TOP, CELL_BOTTOM, local);
    } else {
      color = flatGround ? PLATE_TOP.slice() : ramp(PLATE_TOP, PLATE_BOTTOM, (y - TOP_EDGE) / PLATE);
    }

    if (!(onCell && nearest.lit)) {
      const gx = x - lit.x;
      const gy = y - lit.y;
      const reach = Math.sqrt(gx * gx + gy * gy) / shape.glowRange;
      if (reach < 1) {
        const k = (1 - reach) ** 2 * GLOW_STRENGTH;
        color = [
          color[0] + (GLOW_COLOR[0] - color[0]) * k,
          color[1] + (GLOW_COLOR[1] - color[1]) * k,
          color[2] + (GLOW_COLOR[2] - color[2]) * k
        ];
      }
    }
    return color;
  };

  const bodyA = new Float32Array(SIDE * SIDE);
  const bodyR = new Float32Array(SIDE * SIDE);
  const bodyG = new Float32Array(SIDE * SIDE);
  const bodyB = new Float32Array(SIDE * SIDE);
  const total = SUB * SUB;

  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      let r = 0, g = 0, b = 0, covered = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const color = sample(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB);
          if (!color) continue;
          r += color[0]; g += color[1]; b += color[2]; covered++;
        }
      }
      const i = y * SIDE + x;
      bodyA[i] = covered / total;
      if (covered) {
        bodyR[i] = r / covered;
        bodyG[i] = g / covered;
        bodyB[i] = b / covered;
      }
    }
  }

  return { bodyA, bodyR, bodyG, bodyB };
}

function blurAxis(src, dst, r) {
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < SIDE; y++) {
    const row = y * SIDE;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + Math.min(SIDE - 1, Math.max(0, i))];
    for (let x = 0; x < SIDE; x++) {
      dst[x * SIDE + y] = sum * norm;
      const out = Math.min(SIDE - 1, Math.max(0, x - r));
      const inc = Math.min(SIDE - 1, Math.max(0, x + r + 1));
      sum += src[row + inc] - src[row + out];
    }
  }
}

function droppedShadow(bodyA) {
  const shadow = new Float32Array(SIDE * SIDE);
  for (let y = SHADOW_OFFSET; y < SIDE; y++) {
    shadow.set(bodyA.subarray((y - SHADOW_OFFSET) * SIDE, (y - SHADOW_OFFSET) * SIDE + SIDE), y * SIDE);
  }
  const scratch = new Float32Array(SIDE * SIDE);
  for (let p = 0; p < SHADOW_PASSES; p++) {
    blurAxis(shadow, scratch, SHADOW_BLUR);
    blurAxis(scratch, shadow, SHADOW_BLUR);
  }
  return shadow;
}

const table = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([size, body, sum]);
}

function encode(rows, channels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIDE, 0);
  ihdr.writeUInt32BE(SIDE, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function plated() {
  const { bodyA, bodyR, bodyG, bodyB } = paint({ clip: PLATE, flatGround: false, scale: 1 });
  const shadow = droppedShadow(bodyA);
  const rows = [];
  for (let y = 0; y < SIDE; y++) {
    const row = Buffer.alloc(1 + SIDE * 4);
    for (let x = 0; x < SIDE; x++) {
      const i = y * SIDE + x;
      const front = bodyA[i];
      const behind = shadow[i] * SHADOW_ALPHA * (1 - front);
      const out = front + behind;
      const j = 1 + x * 4;
      if (out > 0) {
        row[j] = Math.round((bodyR[i] * front) / out);
        row[j + 1] = Math.round((bodyG[i] * front) / out);
        row[j + 2] = Math.round((bodyB[i] * front) / out);
        row[j + 3] = Math.round(out * 255);
      }
    }
    rows.push(row);
  }
  return encode(rows, 4);
}

function bled() {
  const { bodyR, bodyG, bodyB } = paint({ clip: 0, flatGround: true, scale: BLEED });
  const rows = [];
  for (let y = 0; y < SIDE; y++) {
    const row = Buffer.alloc(1 + SIDE * 3);
    for (let x = 0; x < SIDE; x++) {
      const i = y * SIDE + x;
      const j = 1 + x * 3;
      row[j] = Math.round(bodyR[i]);
      row[j + 1] = Math.round(bodyG[i]);
      row[j + 2] = Math.round(bodyB[i]);
    }
    rows.push(row);
  }
  return encode(rows, 3);
}

function rounded() {
  const { bodyA, bodyR, bodyG, bodyB } = paint({ clip: SIDE, flatGround: true, scale: BLEED });
  const rows = [];
  for (let y = 0; y < SIDE; y++) {
    const row = Buffer.alloc(1 + SIDE * 4);
    for (let x = 0; x < SIDE; x++) {
      const i = y * SIDE + x;
      const j = 1 + x * 4;
      row[j] = Math.round(bodyR[i]);
      row[j + 1] = Math.round(bodyG[i]);
      row[j + 2] = Math.round(bodyB[i]);
      row[j + 3] = Math.round(bodyA[i] * 255);
    }
    rows.push(row);
  }
  return encode(rows, 4);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const target = join(HERE, "icon.png");
const desktop = plated();
writeFileSync(target, desktop);
console.log(`${target} · ${SIDE}x${SIDE} · ${(desktop.length / 1024).toFixed(1)} KB`);

const phoneTarget = join(HERE, "../../mobile/assets/icon.png");
const phone = bled();
writeFileSync(phoneTarget, phone);
console.log(`${phoneTarget} · ${SIDE}x${SIDE} · sangrando, sem alfa · ${(phone.length / 1024).toFixed(1)} KB`);

const openingTarget = join(HERE, "../../mobile/assets/opening.png");
const opening = rounded();
writeFileSync(openingTarget, opening);
console.log(`${openingTarget} · ${SIDE}x${SIDE} · o mesmo desenho, já recortado · ${(opening.length / 1024).toFixed(1)} KB`);

if (process.platform !== "darwin") {
  console.log("icon.icns is only rebuilt on macOS — commit it from a Mac when the drawing changes");
} else {
  const iconset = join(HERE, "icon.iconset");
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset);
  for (const side of [16, 32, 128, 256, 512]) {
    for (const [pixels, name] of [[side, `icon_${side}x${side}.png`], [side * 2, `icon_${side}x${side}@2x.png`]]) {
      execFileSync("sips", ["-z", String(pixels), String(pixels), target, "--out", join(iconset, name)], { stdio: "ignore" });
    }
  }
  const icns = join(HERE, "icon.icns");
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", icns]);
  rmSync(iconset, { recursive: true, force: true });
  console.log(`${icns} · every size drawn from the 1024 and packed by iconutil`);
}
