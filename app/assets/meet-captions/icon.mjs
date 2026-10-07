import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BOX = 48;
const CORNER = 13;
const TURN = (32 * Math.PI) / 180;
const GREEN = [0x48, 0x65, 0x2f];
const CREAM = [0xfa, 0xf8, 0xf3];
const STEM = { x: 24, top: 15, bottom: 33, half: 1.3 };
const SIZES = [16, 32, 48, 128];
const SUB = 8;
const STEPS = 96;

const curve = (from, one, two, to) => Array.from({ length: STEPS }, (_, step) => {
  const t = step / STEPS;
  const u = 1 - t;
  return [u * u * u * from[0] + 3 * u * u * t * one[0] + 3 * u * t * t * two[0] + t * t * t * to[0], u * u * u * from[1] + 3 * u * u * t * one[1] + 3 * u * t * t * two[1] + t * t * t * to[1]];
});
const GRAIN = [...curve([24, 7], [34.5, 15], [34.5, 33], [24, 41]), ...curve([24, 41], [13.5, 33], [13.5, 15], [24, 7])];

function inGrain(x, y) {
  let inside = false;
  for (let at = 0, last = GRAIN.length - 1; at < GRAIN.length; last = at++) {
    const [ax, ay] = GRAIN[at];
    const [bx, by] = GRAIN[last];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function inPlate(x, y) {
  const dx = Math.max(CORNER - x, x - (BOX - CORNER), 0);
  const dy = Math.max(CORNER - y, y - (BOX - CORNER), 0);
  return x >= 0 && x <= BOX && y >= 0 && y <= BOX && dx * dx + dy * dy <= CORNER * CORNER;
}

function inStem(x, y) {
  const near = Math.min(STEM.bottom, Math.max(STEM.top, y));
  return (x - STEM.x) ** 2 + (y - near) ** 2 <= STEM.half ** 2;
}

function colorAt(x, y) {
  if (!inPlate(x, y)) return null;
  const dx = x - 24;
  const dy = y - 24;
  const rx = 24 + dx * Math.cos(TURN) + dy * Math.sin(TURN);
  const ry = 24 - dx * Math.sin(TURN) + dy * Math.cos(TURN);
  return inGrain(rx, ry) && !inStem(rx, ry) ? CREAM : GREEN;
}

function draw(side) {
  const pixels = Buffer.alloc(side * side * 4);
  for (let py = 0; py < side; py++) for (let px = 0; px < side; px++) {
    const sum = [0, 0, 0];
    let hits = 0;
    for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
      const color = colorAt(((px + (sx + 0.5) / SUB) * BOX) / side, ((py + (sy + 0.5) / SUB) * BOX) / side);
      if (!color) continue;
      hits += 1;
      for (let channel = 0; channel < 3; channel++) sum[channel] += color[channel];
    }
    const at = (py * side + px) * 4;
    for (let channel = 0; channel < 3; channel++) pixels[at + channel] = hits ? Math.round(sum[channel] / hits) : 0;
    pixels[at + 3] = Math.round((hits * 255) / (SUB * SUB));
  }
  return pixels;
}

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (bytes) => { let c = 0xffffffff; for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

function png(side, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(side * (side * 4 + 1));
  for (let row = 0; row < side; row++) pixels.copy(rows, row * (side * 4 + 1) + 1, row * side * 4, (row + 1) * side * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "extension", "icons");
mkdirSync(out, { recursive: true });
for (const side of SIZES) writeFileSync(join(out, `icon-${side}.png`), png(side, draw(side)));
