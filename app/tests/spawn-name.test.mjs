import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freeNameAmong, nameFromMission, pastHandles, slug } from "../lib/naming.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of the source`);
  return src.slice(a, b);
}

function naming({ seats = [], jobs = [], onScreen = [] } = {}) {
  const made = new Function("freeNameAmong", "spawning", "fleet", "cache", `
    ${slice(server, "function namesOnTheBoard(exceptJob = \"\") {", "async function freeName(")}
    return { namesOnTheBoard, freeNameNow };
  `);
  return made(
    freeNameAmong,
    new Map(jobs.map((j) => [j.id, j])),
    new Map(seats.map((s) => [`${s.where}:${s.name}`, s])),
    { at: 1, data: { sessions: onScreen } }
  );
}

test("a name free of everything on the board comes out untouched", () => {
  const { freeNameNow } = naming({ seats: [{ name: "outro", where: "local" }] });
  assert.equal(freeNameNow("amigao-me-ajuda-a"), "amigao-me-ajuda-a");
});

test("the four first words repeat, so the newborn takes the next free name instead of the old chat's", () => {
  const { freeNameNow } = naming({
    seats: [{ name: "amigao-me-ajuda-a", where: "local" }, { name: "amigao-me-ajuda-a-2", where: "local" }]
  });
  assert.equal(freeNameNow("amigao-me-ajuda-a"), "amigao-me-ajuda-a-3",
    "a name already answering for a live chat cannot be handed to a second one — the tile of the newborn would become the old chat");
});

test("a chat still opening holds its name, so a race of four does not birth four chats with one name", () => {
  const { freeNameNow } = naming({ jobs: [{ id: "n1", name: "compara-os-tres-caminhos", where: "local" }] });
  assert.equal(freeNameNow("compara-os-tres-caminhos"), "compara-os-tres-caminhos-2");
});

test("the job renaming itself is not counted against itself", () => {
  const { freeNameNow } = naming({ jobs: [{ id: "n1", name: "ped-660", where: "local" }] });
  assert.equal(freeNameNow("ped-660", "n1"), "ped-660");
});

test("what the rail already shows counts too, whichever side of the fleet it runs on", () => {
  const { freeNameNow } = naming({ onScreen: [{ name: "biblion-problemas", where: "cloud" }] });
  assert.equal(freeNameNow("biblion-problemas"), "biblion-problemas-2",
    "the rail keys a tile by the bare name, so a cloud seat and a local one cannot share it");
});

test("the name a chat is born with is free before the door answers, not after the seat opens", () => {
  const open = slice(server, "function openJob(body) {", "async function pushMissionAssets");
  assert.match(open, /name: freeNameNow\(/,
    "/api/spawn answers with this name and the rail binds the tile to it — a colliding name here is a tile pointing at another chat");
  const run = slice(server, "async function runJob(job, body) {", "\n}\n");
  assert.match(run, /job\.name = await freeName\(job\.name, job\.where, job\.id\)/,
    "the live listing is still the last word, and it must not count the job against itself");
});

const firstLine = (text) => pastHandles(text).split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) || "";

function openJobWith({ seats = [], onScreen = [] } = {}) {
  const spawning = new Map();
  const made = new Function("freeNameAmong", "slug", "nameFromMission", "firstLine", "spawning", "fleet", "cache", "CLOUD", "podCache", `
    let jobCount = 0;
    ${slice(server, "function namesOnTheBoard(exceptJob = \"\") {", "async function freeName(")}
    ${slice(server, "function openJob(body) {", "async function pushMissionAsset")}
    return openJob;
  `);
  const openJob = made(
    freeNameAmong,
    slug,
    nameFromMission,
    firstLine,
    spawning,
    new Map(seats.map((one) => [`${one.where}:${one.name}`, one])),
    { at: 1, data: { sessions: onScreen } },
    false,
    { at: 0, up: false }
  );
  return { openJob, spawning };
}

test("the chat the person just opened never answers with the name of a chat already on the rail", () => {
  const { openJob } = openJobWith({ onScreen: [{ name: "amigao-me-ajuda-a", where: "local" }] });
  const job = openJob({ prompt: "amigão, me ajuda a entender esse bug do hive", where: "local" });
  assert.equal(job.name, "amigao-me-ajuda-a-2",
    "the door answers with this name and the rail swaps the newborn tile for the seat that carries it");
});

test("two chats asked for in the same breath do not come out with one name", () => {
  const { openJob } = openJobWith();
  const first = openJob({ prompt: "amigão, me ajuda a entender esse bug", where: "local" });
  const second = openJob({ prompt: "amigão, me ajuda a entender outro bug", where: "local" });
  assert.equal(first.name, "amigao-me-ajuda-a");
  assert.equal(second.name, "amigao-me-ajuda-a-2");
});
