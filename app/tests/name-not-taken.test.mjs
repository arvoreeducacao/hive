import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { settleSpawnJobs } from "../lib/fleet.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(src, from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of the source`);
  return src.slice(a, b);
}

/* freeNameNow steps aside from every name this app knows (spawn-name.test.mjs). What it
   cannot know — a seat opened from another machine, a rail one poll behind — is why the
   name a job carries only becomes an address once the machine that runs the seat agreed. */

test("a job carries its name unsettled until the live listing agrees with it", () => {
  const open = slice(server, "function openJob(body) {", "async function pushMissionAssets");
  assert.match(open, /settled: false/);
  const run = slice(server, "async function runJob(job, body) {", "\n}\n");
  assert.match(run, /job\.name = await freeName\(job\.name, job\.where, job\.id\);\n\s*job\.settled = true;/,
    "the stamp has to come from freeName's answer, never from the name the mission asked for");
});

test("a job whose name a live seat still answers to does not retire onto that seat", () => {
  const jobs = new Map([["n1", { id: "n1", name: "acq-front", where: "local", at: 0, settled: false }]]);
  settleSpawnJobs(jobs, new Set(["acq-front"]), 1000);
  assert.ok(!jobs.get("n1").landed,
    "an unsettled name matching a live seat used to land the job on it, and the tile followed");
  assert.match(server, /settleSpawnJobs\(spawning, alive\);/);
});

test("the screen is told whether the name it is showing is settled", () => {
  const state = slice(server, "    spawning: [...spawning.values()].map", "worktrees:");
  assert.match(state, /settled: !!j\.settled/);
  const blocks = readFileSync(join(HERE, "src", "app", "blocks.js"), "utf8");
  assert.match(blocks, /job \? \(job\.settled \? job\.name : ""\) : jobName\.get\(id\)/,
    "the tile binds to a seat by a settled name only");
});
