import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { makeWarnOnce, makeEventsTrouble, makeSessionStore } from "../engine/seat-core.mjs";
import { unpackShots, eventLine } from "../engine/protocol.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driverSource = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");
const turnDriverSource = readFileSync(join(HERE, "engine/turn-driver.mjs"), "utf8");

test("a warning is delivered once and a repeat of the same one stays quiet", () => {
  const said = [];
  const warn = makeWarnOnce((message) => said.push(message));
  assert.equal(warn("disk full"), true);
  assert.equal(warn("disk full"), false);
  assert.equal(warn("permission denied"), true);
  assert.deepEqual(said, ["disk full", "permission denied"]);
});

test("events trouble speaks once per failure, flags the seat as broken and names the file", () => {
  const said = [];
  const trouble = makeEventsTrouble("/pod/events/seat.ndjson", (line) => said.push(line));
  assert.equal(trouble.broken, false);
  trouble.note(new Error("ENOSPC: no space left on device"));
  trouble.note(new Error("ENOSPC: no space left on device"));
  assert.equal(said.length, 1);
  assert.match(said[0], /stopped taking writes/);
  assert.match(said[0], /\/pod\/events\/seat\.ndjson/);
  assert.match(said[0], /ENOSPC/);
  assert.equal(trouble.broken, true);
  trouble.note(new Error("EACCES: permission denied"));
  assert.equal(said.length, 2);
});

test("a session file that cannot be written warns once, and persist keeps the meta in memory", async () => {
  const said = [];
  const warn = makeWarnOnce((message) => said.push(message));
  const store = makeSessionStore("/dev/null/never/session.json", { births: 3 }, (e) => warn(`the session file stopped taking writes: ${String(e?.message || e)}`));
  await store.persist({ session_id: "s1" });
  await store.persist({ session_id: "s2" });
  assert.equal(said.length, 1);
  assert.match(said[0], /session file stopped taking writes/);
  assert.equal(store.meta.session_id, "s2");
  assert.equal(store.meta.births, 3);
});

test("a session file that writes fine never warns", async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-trouble-"));
  try {
    const said = [];
    const store = makeSessionStore(join(home, "seat.json"), {}, (e) => said.push(String(e)));
    await store.persist({ session_id: "s1" });
    assert.deepEqual(said, []);
    assert.equal(JSON.parse(await readFile(join(home, "seat.json"), "utf8")).session_id, "s1");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a slow write cannot land after the write that followed it", async () => {
  const landed = [];
  let hold = () => {};
  const held = new Promise((go) => { hold = go; });
  let calls = 0;
  const write = async (file, line) => {
    const mine = calls++;
    if (mine === 0) await held;
    landed.push(JSON.parse(line).model);
  };
  const store = makeSessionStore("/x/seat.json", { model: "fable" }, () => {}, write);
  const first = store.persist({ model_id: "claude-opus-5[1m]" });
  const second = store.persist({ model: "opus[1m]" });
  hold();
  await Promise.all([first, second]);
  assert.deepEqual(landed, ["fable", "opus[1m]"], "the queued write must be the last one on disk");
  assert.equal(store.meta.model, "opus[1m]");
});

test("setModel writes the pick and the resolved id in one go", () => {
  const setModel = driverSource.slice(driverSource.indexOf("setModel: async () =>"), driverSource.indexOf("mcpReconnect: async () =>"));
  assert.equal((setModel.match(/persistSession\(/g) || []).length, 1, "two persists here race and the old model wins");
  assert.match(setModel, /persistSession\(\{ \.\.\.\(id \? \{ model_id: id \} : \{\}\), model: chosenModel \|\| null/);
});

function emitOfDriver({ appendFile, eventsFile, trouble }) {
  const source = driverSource.slice(driverSource.indexOf("function emit("), driverSource.indexOf("\nfor (const key"));
  return new Function(
    "appendFile", "eventsFile", "eventsTrouble", "unpackShots", "eventLine", "compactLine", "keepShots", "shotsDir",
    `let seq = 0; let appendChain = Promise.resolve(); ${source}; return { emit, flush: () => appendChain };`
  )(appendFile, eventsFile, trouble, unpackShots, eventLine, () => null, async () => {}, "/x/shots");
}

test("a failed events append is noted instead of swallowed, and the chain keeps going", async () => {
  const said = [];
  const trouble = makeEventsTrouble("/x/events/seat.ndjson", (line) => said.push(line));
  const written = [];
  let failures = 2;
  const appendFile = async (_file, line) => {
    if (failures > 0) { failures -= 1; throw new Error("ENOSPC: no space left on device"); }
    written.push(line);
  };
  const seat = emitOfDriver({ appendFile, eventsFile: "/x/events/seat.ndjson", trouble });
  seat.emit({ type: "driver", subtype: "started" });
  seat.emit({ type: "driver", subtype: "warning", message: "x" });
  await seat.flush();
  assert.equal(said.length, 1);
  assert.equal(trouble.broken, true);
  seat.emit({ type: "driver", subtype: "exit" });
  await seat.flush();
  assert.equal(written.length, 1);
  assert.equal(JSON.parse(written[0]).seq, 3);
});

test("the pod driver wires the trouble into the append chain, the session store and the state reply", () => {
  assert.match(driverSource, /appendFile\(eventsFile, line\);\s*\}\)\.catch\(\(e\) => eventsTrouble\.note\(e\)\)/);
  assert.match(driverSource, /makeSessionStore\(sessionFile, storedSession, \(e\) => sessionTrouble\(/);
  assert.match(driverSource, /subtype: "warning", message/);
  assert.match(driverSource, /events_write_failed: eventsTrouble\.broken/);
});

test("the turn driver carries the same wiring", () => {
  assert.match(turnDriverSource, /appendFile\(eventsFile, line\)\)\.catch\(\(e\) => eventsTrouble\.note\(e\)\)/);
  assert.match(turnDriverSource, /makeSessionStore\(sessionFile, loadedMeta, \(e\) => sessionTrouble\(/);
  assert.match(turnDriverSource, /events_write_failed: eventsTrouble\.broken/);
});
