import { test } from "node:test";
import assert from "node:assert/strict";
import "./dom.mjs";
import { ASK } from "../assets/pets/rally.mjs";
import { MORNING_KEY, SAY_LINES, dayStamp, hatchNest, mountTamagotchi, writeNest } from "../assets/pets/tamagotchi.mjs";

const midday = () => {
  const day = new Date();
  day.setHours(12, 0, 0, 0);
  return day.getTime();
};

const breath = (ms = 40) => new Promise((done) => setTimeout(done, ms));

const shelf = () => {
  const kept = new Map();
  return { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, String(v)) };
};

const raise = (host, kind, altKey = false) => host.dispatchEvent(new PointerEvent(kind, { button: 0, altKey, clientX: 4, clientY: 4, bubbles: true }));

const serve = (host) => {
  raise(host, "pointerdown", true);
  raise(host, "pointerup", true);
};

const eager = () => {
  const was = { ...ASK };
  Object.assign(ASK, { quiet: 0, every: 5, spread: 0, hold: 60000, after: 0 });
  return () => Object.assign(ASK, was);
};

const raised = (now) => {
  const store = shelf();
  writeNest(store, hatchNest(now));
  store.setItem(MORNING_KEY, dayStamp(new Date(now)));
  return store;
};

const nestBy = (clock) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const blob = mountTamagotchi(host, { store: raised(clock()), seed: "ping pong", now: clock });
  return { host, blob, close: () => { blob.destroy(); host.remove(); } };
};

const nest = (now) => nestBy(() => now);

test("the creature asks for a game, and the tap that would have been a pat starts it", async () => {
  const back = eager();
  const now = midday();
  const { host, blob, close } = nest(now);
  try {
    await breath();
    assert.equal(blob.sayNow(), SAY_LINES.pong, "the invitation is what the balloon says");
    assert.equal(host.querySelectorAll(".pong").length, 0, "nothing is on the court until it is accepted");
    raise(host, "pointerdown");
    raise(host, "pointerup");
    assert.equal(blob.scoreNow(), "0–0", "the tap opened a match at love all");
    assert.ok(host.querySelector(".pong-ball") && host.querySelector(".pong-bat"), "a ball and a bat are on the court");
    assert.equal(host.querySelector(".pong-score").textContent, "0–0");
  } finally {
    close();
    back();
  }
});

test("a seat that starts calling takes the ball away", async () => {
  const back = eager();
  const now = midday();
  const { host, blob, close } = nest(now);
  try {
    await breath();
    raise(host, "pointerdown");
    raise(host, "pointerup");
    assert.equal(blob.scoreNow(), "0–0", "a match is on");
    blob.setMood("needs");
    assert.equal(blob.scoreNow(), "", "the match is over the moment a seat calls");
    assert.equal(host.querySelectorAll(".pong").length, 0, "and nothing of it is left on the rail");
    assert.equal(blob.playNow(), "siren", "the creature goes back to fetching you");
  } finally {
    close();
    back();
  }
});

test("with no invitation standing, the same tap is still only a pat", async () => {
  const now = midday();
  const { host, blob, close } = nest(now);
  try {
    const before = blob.careNow();
    raise(host, "pointerdown");
    raise(host, "pointerup");
    assert.equal(blob.scoreNow(), "", "an unasked tap never opens a match");
    assert.ok(blob.careNow() > before, "it feeds the heart, the way a pat does");
  } finally {
    close();
  }
});

test("a fleet at work is exactly when it asks: the wait is what the game is for", async () => {
  const back = eager();
  const now = midday();
  const { host, blob, close } = nest(now);
  try {
    blob.setMood("working");
    await breath();
    assert.equal(blob.sayNow(), SAY_LINES.pong, "seats at work leave the person free to play");
    raise(host, "pointerdown");
    raise(host, "pointerup");
    assert.equal(blob.scoreNow(), "0–0", "and the tap opens the match all the same");
  } finally {
    close();
    back();
  }
});

test("the match lives through the fleet going back to work, and only a call ends it", async () => {
  const back = eager();
  const now = midday();
  const { host, blob, close } = nest(now);
  try {
    await breath();
    raise(host, "pointerdown");
    raise(host, "pointerup");
    assert.equal(blob.scoreNow(), "0–0", "a match is on");
    blob.setMood("working");
    assert.equal(blob.scoreNow(), "0–0", "a seat starting work does not take the ball away");
    assert.notEqual(blob.playNow(), "muse", "and the creature keeps playing instead of pacing with the fleet");
    blob.setMood("needs");
    assert.equal(blob.scoreNow(), "", "a seat that calls does");
  } finally {
    close();
    back();
  }
});

test("the wait for a quiet moment is not restarted every time a seat wakes up", async () => {
  const was = { ...ASK };
  Object.assign(ASK, { quiet: 1000, every: 5, spread: 0, hold: 60000, after: 0 });
  let at = midday();
  const { blob, close } = nestBy(() => at);
  try {
    at += 600;
    blob.setMood("working");
    at += 600;
    await breath();
    assert.equal(blob.sayNow(), SAY_LINES.pong, "the wait carries across seats that came and went");
  } finally {
    close();
    Object.assign(ASK, was);
  }
});

test("a seat that calls does restart the wait", async () => {
  const was = { ...ASK };
  Object.assign(ASK, { quiet: 1000, every: 5, spread: 0, hold: 60000, after: 0 });
  let at = midday();
  const { blob, close } = nestBy(() => at);
  try {
    blob.setMood("needs");
    at += 5000;
    blob.setMood("working");
    await breath();
    assert.notEqual(blob.sayNow(), SAY_LINES.pong, "the quiet only counts from the moment nobody was waiting");
  } finally {
    close();
    Object.assign(ASK, was);
  }
});

test("whoever does not want to wait to be asked serves, whatever the fleet is doing", () => {
  const now = midday();
  const { host, blob, close } = nest(now);
  try {
    blob.setMood("needs");
    serve(host);
    assert.equal(blob.scoreNow(), "0–0", "a seat calling does not stand between a person and a game");
    assert.ok(host.querySelector(".pong-ball") && host.querySelector(".pong-bat"), "a ball and a bat are on the court");
  } finally {
    close();
  }
});

test("the serve feeds the heart no less than the pat it replaces, and never twice", () => {
  const now = midday();
  const { host, blob, close } = nest(now);
  try {
    const before = blob.careNow();
    serve(host);
    assert.equal(blob.careNow(), before, "the serve is the match, not a pat with a match on top");
    serve(host);
    assert.equal(blob.scoreNow(), "0–0", "and a second serve mid-match changes nothing");
  } finally {
    close();
  }
});

test("an egg is cracked by the serve, not carried onto a court", () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const blob = mountTamagotchi(host, { store: shelf(), seed: "ping pong", now: () => midday() });
  try {
    serve(host);
    assert.equal(blob.scoreNow(), "", "nothing that has not hatched is playing");
    assert.equal(blob.playNow(), "burst", "the shell breaks instead");
  } finally {
    blob.destroy();
    host.remove();
  }
});
