import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { openShot, closeShot, stepShotZoom } = await app("picture-preview");
const img = document.getElementById("shot-img");
const floor = document.getElementById("shot-floor");
document.body.classList.add("experience-next");
Object.defineProperties(floor, { clientWidth: { value: 800 }, clientHeight: { value: 600 } });
Object.defineProperties(img, { naturalWidth: { value: 4000 }, naturalHeight: { value: 6000 } });
globalThis.fetch = async () => ({ ok: true, blob: async () => ({}) });
URL.createObjectURL = () => "blob:test";
URL.revokeObjectURL = () => {};

test("fit shows a tall image entirely even below 25 percent zoom", async () => {
  await openShot("tall.png", "local");
  img.onload();
  assert.ok(parseFloat(img.style.width) <= floor.clientWidth - 32);
  assert.ok(parseFloat(img.style.height) <= floor.clientHeight - 32);
  assert.equal(document.getElementById("shot-pct").textContent, "9%");
  const fittedWidth = img.style.width;
  stepShotZoom(-1);
  assert.equal(img.style.width, fittedWidth, "zoom out must not enlarge an already fitted image");
  stepShotZoom(1);
  assert.ok(parseFloat(img.style.width) > parseFloat(fittedWidth));
  closeShot();
});
