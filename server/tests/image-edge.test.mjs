import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { imageEdge, IMAGE_EDGE_CEILING } from "../engine/protocol.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from("\x89PNG\r\n\x1a\n", "binary").copy(bytes);
  bytes.write("IHDR", 12, "binary");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width, height) {
  const bytes = Buffer.alloc(22, 0);
  bytes.writeUInt16BE(0xffd8, 0);
  bytes.writeUInt16BE(0xffe0, 2);
  bytes.writeUInt16BE(6, 4);
  bytes.writeUInt16BE(0xffc0, 10);
  bytes.writeUInt16BE(11, 12);
  bytes.writeUInt16BE(height, 15);
  bytes.writeUInt16BE(width, 17);
  return bytes;
}

test("a png says how wide the retina screenshot really is", () => {
  assert.strictEqual(imageEdge(png(2442, 1200)), 2442);
  assert.strictEqual(imageEdge(png(800, 3000)), 3000);
});

test("a jpeg says it past the header that comes before the frame", () => {
  assert.strictEqual(imageEdge(jpeg(2442, 1200)), 2442);
});

test("anything that is not a picture measures nothing instead of guessing", () => {
  assert.strictEqual(imageEdge(Buffer.from("not a picture at all")), 0);
  assert.strictEqual(imageEdge(Buffer.alloc(0)), 0);
  assert.strictEqual(imageEdge(null), 0);
});

test("the ceiling is the one the api holds conversations of many images to", () => {
  assert.strictEqual(IMAGE_EDGE_CEILING, 2000);
});

test("a picture wider than the ceiling reaches the seat as a path, not as a 400", () => {
  const driver = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  const block = driver.slice(driver.indexOf("async function imageBlock"), driver.indexOf("async function userMessage"));
  assert.match(block, /imageEdge\(bytes\) > IMAGE_EDGE_CEILING/,
    "driver.mjs hands the model the bytes of a picture the API refuses, and the whole conversation stops answering");
  assert.match(block, /return \{ type: "text", text: String\(path\) \}/,
    "the picture the seat cannot send has to arrive as a path it can read");
});
