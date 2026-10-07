import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { SHOT_EDGE, shrinkShot } = await app("hold-numbers");

const PIXEL = "iVBORw0KGgoAAAANSUhEUg==";
const shotOf = (data = PIXEL) => `data:image/png;base64,${data}`;

function screen(width, height) {
  const drawn = [];
  globalThis.createImageBitmap = async () => ({ width, height, close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { drawImage: (_bitmap, _x, _y, w, h) => drawn.push({ w, h }) }; }
    async convertToBlob() { return new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }); }
  };
  return drawn;
}

function forget() {
  delete globalThis.createImageBitmap;
  delete globalThis.OffscreenCanvas;
}

test("a retina screenshot is brought under the width the api takes", async () => {
  const drawn = screen(2880, 1800);
  const small = await shrinkShot(shotOf());
  forget();
  assert.deepEqual(drawn, [{ w: SHOT_EDGE, h: 1000 }]);
  assert.notEqual(small, shotOf(), "the picture went to the seat at the size the clipboard had");
  assert.match(small, /^data:image\/png;base64,/);
});

test("a screenshot already small enough is left exactly as it came", async () => {
  const drawn = screen(1200, 800);
  const same = await shrinkShot(shotOf());
  forget();
  assert.deepEqual(drawn, []);
  assert.equal(same, shotOf());
});

test("a file that is not a picture goes through untouched", async () => {
  screen(9000, 9000);
  const csv = "data:text/csv;base64,YQ==";
  const same = await shrinkShot(csv);
  forget();
  assert.equal(same, csv);
});

test("a browser that cannot resize sends the picture rather than nothing", async () => {
  forget();
  const same = await shrinkShot(shotOf());
  assert.equal(same, shotOf());
});
