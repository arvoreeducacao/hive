import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP = join(HERE, "../assets/icon.png");

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function readPng(file) {
  const png = readFileSync(file);
  let at = 8;
  let head = null;
  const parts = [];
  while (at < png.length) {
    const size = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + size);
    if (type === "IHDR") head = { width: png.readUInt32BE(at + 8), height: png.readUInt32BE(at + 12), depth: data[8], colorType: data[9] };
    if (type === "IDAT") parts.push(data);
    at += 12 + size;
  }
  const channels = CHANNELS[head.colorType];
  const stride = head.width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  const pixels = Buffer.alloc(head.height * stride);
  let read = 0;
  for (let y = 0; y < head.height; y++) {
    const filter = raw[read];
    read += 1;
    const line = raw.subarray(read, read + stride);
    read += stride;
    const row = y * stride;
    const above = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y ? pixels[above + x] : 0;
      const corner = y && x >= channels ? pixels[above + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const guess = left + up - corner;
        const dl = Math.abs(guess - left);
        const du = Math.abs(guess - up);
        const dc = Math.abs(guess - corner);
        value += dl <= du && dl <= dc ? left : du <= dc ? up : corner;
      }
      pixels[row + x] = value & 255;
    }
  }
  return { ...head, channels, stride, pixels };
}

const at = (png, x, y) => [...png.pixels.subarray(y * png.stride + x * png.channels, y * png.stride + (x + 1) * png.channels)];

test("the macOS icon keeps its own plate, its shadow and its transparency", () => {
  const png = readPng(DESKTOP);
  assert.equal(png.colorType, 6);
  assert.equal(at(png, 0, 0)[3], 0, "the Mac draws the rounded plate and the shadow itself, and needs the canvas around them empty");
});
