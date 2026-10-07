import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, "..", "server.mjs"), "utf8");

const slice = (from, to) => {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${from} is gone from server.mjs`);
  const end = source.indexOf(to, start + from.length);
  assert.ok(end > start, `${to} is gone from server.mjs`);
  return source.slice(start, end);
};

test("a note to a teammate goes through the server, never into their pod", () => {
  const sending = slice("async function noteToPeer(", "\n}");
  assert.match(sending, /\/api\/peer-note/);
  assert.doesNotMatch(sending, /kubectl/);
});

test("nothing writes into a folder inside somebody else's pod any more", () => {
  for (const gone of ["KNOCK_DIR", "SAY_DIR", "POKE_DIR", "OUT_DIR", "podOfDev", "writeToPod("]) {
    assert.ok(!source.includes(gone), `${gone} is still here, and it only existed to reach into another pod`);
  }
});

test("no write reaches into a box by shelling into it any more, not even my own", () => {
  assert.ok(!source.includes("writeToMyPod("), "writeToMyPod is back — a box is written to over its own door");
  const binding = slice("async function bindSeatSession(", "\n}");
  assert.doesNotMatch(binding, /onPod\.|kubectl/, "binding a seat to its transcript shells into the box again");
});

test("no recurring tick shells out to the cluster more than once a minute", () => {
  const ticks = [...source.matchAll(/setInterval\(\(\)\s*=>\s*\{\s*(\w+)\(.*?\}\s*,\s*(\d+)\)/g)];
  assert.ok(ticks.length, "the app stopped ticking at all, which is not what this guards");
  const fast = [];
  for (const [, name, every] of ticks) {
    if (Number(every) >= 60000) continue;
    const body = source.indexOf(`async function ${name}(`) >= 0
      ? slice(`async function ${name}(`, "\n}\n")
      : "";
    if (/kubectl/.test(body)) fast.push(`${name} every ${every}ms shells out to the cluster`);
  }
  assert.deepEqual(fast, [], fast.join("\n"));
});

test("the team channel is followed once, not polled", () => {
  const following = slice("async function followTeamNotes(", "\n}");
  assert.match(following, /stream\.follow/);
  assert.match(following, /notesFollowed/, "it has to remember it already follows, or every tick opens another");
});
