import { test } from "node:test";
import assert from "node:assert/strict";
import { takeShelfThumbs } from "../src/app/shelf-thumbs.js";

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

test("outside the desktop app nothing is pictured", () => {
  assert.equal(takeShelfThumbs([{ id: "web", slug: "x", tab: "documento", v: 1 }], { shoot: async () => "", send: async () => {}, here: () => false }), null);
});

test("only the main window, on screen, takes pictures: a detached chat window or a hidden one leaves the job for the main window", async () => {
  const source = (await import("node:fs")).readFileSync(new URL("../src/app/shelf-thumbs.js", import.meta.url), "utf8");
  assert.match(source, /get\("seat"\)/, "a detached chat window is told apart by its ?seat= address");
  assert.match(source, /!document\.hidden/, "a hidden window gives back empty frames, so it does not try");
});
