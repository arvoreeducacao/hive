import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOT_CEILING, readShot } from "../lib/shot.mjs";

const dataUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

test("a jpeg and a png come back as bytes and an extension", () => {
  assert.deepEqual(readShot(dataUrl("image/jpeg", [1, 2, 3])), { ext: "jpg", bytes: Buffer.from([1, 2, 3]) });
  assert.equal(readShot(dataUrl("image/PNG", [4])).ext, "png");
});

test("anything that is not a jpeg or a png is refused", () => {
  assert.match(readShot(dataUrl("image/gif", [1])).error, /jpeg or png/);
  assert.match(readShot("nem parece imagem").error, /jpeg or png/);
  assert.match(readShot("").error, /jpeg or png/);
  assert.match(readShot(null).error, /jpeg or png/);
});

test("an empty picture and one past the ceiling are refused, and the ceiling is said in MB", () => {
  assert.match(readShot(dataUrl("image/jpeg", [])).error, /came in empty/);
  const big = readShot(dataUrl("image/jpeg", Buffer.alloc(SHOT_CEILING + 1)));
  assert.match(big.error, /4 MB is the ceiling/);
});

test("the ceiling can be lowered by the caller", () => {
  assert.match(readShot(dataUrl("image/jpeg", [1, 2, 3]), 2).error, /is the ceiling/);
});
