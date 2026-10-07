import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { openShot, closeShot } = await app("picture-preview");
const img = document.getElementById("shot-img");
const note = document.getElementById("shot-note");
const pending = [];
globalThis.fetch = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
URL.createObjectURL = (blob) => `blob:${blob.id}`;
URL.revokeObjectURL = () => {};
afterEach(() => { pending.length = 0; closeShot(); });
const response = (id) => ({ ok: true, blob: async () => ({ id }) });

test("an older image response cannot replace the latest image", async () => {
  const old = openShot("old.png", "local");
  const latest = openShot("latest.png", "local");
  pending.shift().resolve(response("old"));
  await old;
  assert.equal(img.hasAttribute("src"), false);
  pending.shift().resolve(response("latest"));
  await latest;
  assert.equal(img.getAttribute("src"), "blob:latest");
  closeShot();
});

test("closing and reopening invalidates the pending image and its errors", async () => {
  const old = openShot("old.png", "local");
  closeShot();
  const latest = openShot("latest.png", "local");
  pending.shift().reject(new Error("offline"));
  await old;
  assert.equal(note.textContent, "opening…");
  pending.shift().resolve(response("latest"));
  await latest;
  assert.equal(img.getAttribute("src"), "blob:latest");
  closeShot();
});

test("a stale server error cannot replace the latest image's loading state", async () => {
  const old = openShot("old.png", "local");
  const latest = openShot("latest.png", "local");
  pending.shift().resolve({ ok: false, json: async () => ({ error: "missing old file" }) });
  await old;
  assert.equal(note.textContent, "opening…");
  pending.shift().resolve(response("latest"));
  await latest;
  closeShot();
});
