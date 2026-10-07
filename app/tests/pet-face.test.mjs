import { test } from "node:test";
import assert from "node:assert/strict";
import "./dom.mjs";
import { BASE } from "../assets/avatar/avatar.mjs";
import { MORNING_KEY, dayStamp, hatchNest, mountTamagotchi, writeNest } from "../assets/pets/tamagotchi.mjs";

const midday = () => {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  return day.getTime();
};

const breath = (ms) => new Promise((done) => setTimeout(done, ms));

const raised = (now) => {
  const kept = new Map();
  const store = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)) };
  writeNest(store, hatchNest(now));
  store.setItem(MORNING_KEY, dayStamp(new Date(now)));
  return store;
};

test("the face its person picked is worn even when the creature is not allowed to move", async () => {
  const now = midday();
  const host = document.createElement("div");
  document.body.appendChild(host);
  let wanted = { shape: "ball", face: "dark", colour: "green" };
  const blob = mountTamagotchi(host, {
    store: raised(now), seed: "still", now: () => now,
    reducedMotion: () => true,
    face: () => wanted
  });
  try {
    assert.ok(host.innerHTML.includes(BASE.green), "it opens in the face it was mounted with");
    wanted = { shape: "crawler", face: "dark", colour: "red" };
    await breath(1200);
    assert.ok(host.innerHTML.includes(BASE.red), "the face read from the config after the mount is adopted with the animations off");
  } finally {
    blob.destroy();
    host.remove();
  }
});
