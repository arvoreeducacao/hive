import { test } from "node:test";
import assert from "node:assert/strict";
import { coverFromTop, takeShelfThumbs } from "../src/app/shelf-thumbs.js";

const here = () => true;

test("the window pictures one queued page at a time and hands each picture back by its id", async () => {
  const shot = [];
  const sent = [];
  const shoot = async (job) => { shot.push(job.id); return "data:image/png;base64,AAAA"; };
  const send = async (id, data) => { sent.push([id, data]); };
  const jobs = [{ id: "a", slug: "galeria", tab: "telas", v: 2 }, { id: "b", slug: "outra", tab: "documento", v: 1 }];
  const first = takeShelfThumbs(jobs, { shoot, send, here });
  assert.equal(takeShelfThumbs(jobs, { shoot, send, here }), null, "a second poll while the first picture is being taken waits");
  await first;
  assert.deepEqual(sent, [["a", "data:image/png;base64,AAAA"]]);
  await takeShelfThumbs(jobs, { shoot, send, here });
  assert.deepEqual(shot, ["a", "b"], "a job already answered is not taken again, even if a stale poll still lists it");
});

test("a page that would not load is still answered, so the queue lets go of it", async () => {
  const sent = [];
  await takeShelfThumbs([{ id: "broken", slug: "x", tab: "documento", v: 1 }], {
    shoot: async () => { throw new Error("the page never finished loading"); },
    send: async (id, data) => { sent.push([id, data]); },
    here
  });
  assert.deepEqual(sent, [["broken", ""]]);
});

test("a proposal job is shrunk from its picture, not shot as a page", async () => {
  const sent = [];
  await takeShelfThumbs([{ id: "p", kind: "proposal", slug: "x", tab: "telas" }], {
    shoot: async () => { throw new Error("a proposal is not a page to load"); },
    picture: async (job) => `data:image/webp;base64,${job.id}`,
    send: async (id, data) => { sent.push([id, data]); },
    here
  });
  assert.deepEqual(sent, [["p", "data:image/webp;base64,p"]]);
});

test("a tall phone screen keeps its top and is not squashed into the card", () => {
  assert.deepEqual(coverFromTop(390, 844), { x: 0, y: 0, width: 480, height: 844 * (480 / 390) });
  assert.deepEqual(coverFromTop(1280, 800), { x: 0, y: 0, width: 480, height: 300 }, "a page capture fills the card exactly as before");
  const wide = coverFromTop(2000, 600);
  assert.equal(wide.height, 300);
  assert.equal(wide.x, (480 - wide.width) / 2, "a very wide screen is centred");
});

test("outside the desktop app nothing is pictured", () => {
  assert.equal(takeShelfThumbs([{ id: "web", slug: "x", tab: "documento", v: 1 }], { shoot: async () => "", send: async () => {}, here: () => false }), null);
});

test("only the main window, on screen, takes pictures: a detached chat window or a hidden one leaves the job for the main window", async () => {
  const source = (await import("node:fs")).readFileSync(new URL("../src/app/shelf-thumbs.js", import.meta.url), "utf8");
  assert.match(source, /get\("seat"\)/, "a detached chat window is told apart by its ?seat= address");
  assert.match(source, /!document\.hidden/, "a hidden window gives back empty frames, so it does not try");
});
