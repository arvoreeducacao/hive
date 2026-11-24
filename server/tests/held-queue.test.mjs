import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORCE_STOPPED, KEPT_QUEUE_CEILING, queueKeeper, sayGate } from "../engine/protocol.mjs";
import { createSessions, marksTurn } from "../sessions.mjs";
import { seatSockPath } from "../engine/paths.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const DRIVERS = ["driver", "codex-driver", "cursor-driver", "gemini-driver", "kimi-driver", "kiro-driver", "opencode-driver", "turn-driver"];
const sourceOf = (name) => readFileSync(join(HERE, "engine", `${name}.mjs`), "utf8");

test("a stop holds the queue: the turn ends and the next message waits", () => {
  const gate = sayGate();
  const first = gate.push({ text: "first", cid: "c1" });
  assert.equal(first.text, "first");
  assert.equal(gate.push({ text: "second", cid: "c2" }), null);
  assert.equal(gate.hold(), true);
  assert.equal(gate.turnEnded(), null);
  assert.equal(gate.busy, false);
  assert.equal(gate.held, true);
  assert.deepEqual(gate.items().map((one) => one.cid), ["c2"]);
});

test("resume starts the oldest held message and lets the rest flow", () => {
  const gate = sayGate();
  gate.push({ text: "running", cid: "c1" });
  gate.push({ text: "a", cid: "c2" });
  gate.push({ text: "b", cid: "c3" });
  gate.hold();
  gate.turnEnded();
  const next = gate.release();
  assert.equal(next.cid, "c2");
  assert.equal(gate.busy, true);
  assert.equal(gate.held, false);
  assert.equal(gate.turnEnded().cid, "c3");
});

test("a stop with nothing queued leaves no hold behind", () => {
  const gate = sayGate();
  gate.push({ text: "running", cid: "c1" });
  gate.hold();
  assert.equal(gate.turnEnded(), null);
  assert.equal(gate.held, false);
  assert.equal(gate.push({ text: "next", cid: "c2" }).cid, "c2", "the next message goes straight in");
});

test("an idle seat has nothing to hold", () => {
  const gate = sayGate();
  assert.equal(gate.hold(), false);
  assert.equal(gate.push({ text: "hi", cid: "c1" }).cid, "c1");
});

test("a message sent while held waits behind the held ones until released", () => {
  const gate = sayGate();
  gate.push({ text: "running", cid: "c1" });
  gate.push({ text: "held", cid: "c2" });
  gate.hold();
  gate.turnEnded();
  assert.equal(gate.push({ text: "new", cid: "c3" }), null);
  assert.equal(gate.release().cid, "c2");
  assert.deepEqual(gate.items().map((one) => one.cid), ["c3"]);
});

test("send now takes one held message and the rest stay held", () => {
  const gate = sayGate();
  gate.push({ text: "running", cid: "c1" });
  gate.push({ text: "a", cid: "c2" });
  gate.push({ text: "b", cid: "c3" });
  gate.hold();
  gate.turnEnded();
  assert.equal(gate.take("c3").cid, "c3");
  assert.equal(gate.busy, true, "the taken message is the running turn now");
  assert.equal(gate.turnEnded(), null);
  assert.equal(gate.held, true);
  assert.deepEqual(gate.items().map((one) => one.cid), ["c2"]);
});

test("a kept queue comes back held after a restart, and every change is kept", () => {
  const changes = [];
  const gate = sayGate({ kept: [{ text: "left over", images: ["/a.png"], cid: "c9", uuid: "u9" }, { text: 3 }, null], onChange: (change) => changes.push(change) });
  assert.equal(gate.held, true);
  assert.equal(gate.busy, false);
  assert.deepEqual(gate.items(), [{ text: "left over", images: ["/a.png"], cid: "c9", uuid: "u9" }]);
  assert.equal(gate.release().cid, "c9");
  assert.deepEqual(changes.at(-1), { items: [], held: false, flipped: true });
});

test("the kept queue has a ceiling", () => {
  const kept = Array.from({ length: KEPT_QUEUE_CEILING + 5 }, (_, at) => ({ text: `m${at}`, cid: `c${at}` }));
  assert.equal(sayGate({ kept }).queued, KEPT_QUEUE_CEILING);
});

test("rewriting a held message is kept, so a restart brings the new words back", () => {
  const changes = [];
  const gate = sayGate({ kept: [{ text: "old words", images: [], cid: "c1", uuid: "u1" }], onChange: (change) => changes.push(change) });
  const before = changes.length;
  gate.resay("c1", { text: "new words", images: ["/b.png"] });
  assert.ok(changes.length > before, "the rewrite never reached the keeper");
  assert.deepEqual(changes.at(-1).items.map((item) => item.text), ["new words"]);
});

test("the keeper persists the queue and announces only when the hold flips", () => {
  const persisted = [];
  const emitted = [];
  const keep = queueKeeper((patch) => persisted.push(patch), (event) => emitted.push(event));
  keep({ items: [{ text: "a", images: [], cid: "c1" }], held: false, flipped: false });
  keep({ items: [{ text: "a", images: [], cid: "c1" }], held: true, flipped: true });
  keep({ items: [], held: false, flipped: true });
  assert.equal(persisted.length, 3);
  assert.deepEqual(emitted, [
    { type: "driver", subtype: "queue_held", count: 1 },
    { type: "driver", subtype: "queue_released", count: 0 }
  ]);
});

test("the hold notes and the force stop note never make a seat look busy", () => {
  for (const subtype of ["queue_held", "queue_released", "force_stopped"]) assert.equal(marksTurn({ type: "driver", subtype }), false, subtype);
});

test("every driver holds on stop, resumes on request, force stops and says whether it holds", () => {
  for (const name of DRIVERS) {
    const source = sourceOf(name);
    assert.match(source, /cmd\.type === "resume"/, `${name} answers resume`);
    assert.match(source, /"forceStop"/, `${name} answers forceStop`);
    assert.match(source, /held: (gate\.held|held && queue\.length > 0)/, `${name} reports the hold in its state`);
    assert.match(source, /FORCE_STOPPED/, `${name} records why the turn ended`);
    assert.match(source, /queueKeeper\(persistSession/, `${name} keeps its queue across a restart`);
  }
  for (const name of DRIVERS.filter((one) => one !== "turn-driver")) {
    const interrupt = sourceOf(name).slice(sourceOf(name).indexOf('if (cmd.type === "interrupt")'));
    assert.ok(interrupt.indexOf("gate.hold()") > 0 && interrupt.indexOf("gate.hold()") < interrupt.indexOf("return reply({ ok: true })"), `${name} holds the queue when stopped`);
  }
});

test("a person's message releases the hold, a peer's and a steer do not", () => {
  for (const name of DRIVERS.filter((one) => one !== "turn-driver")) {
    const say = sourceOf(name).slice(sourceOf(name).indexOf('if (cmd.type === "say")'), sourceOf(name).indexOf('if (cmd.type === "expect")'));
    assert.match(say, /!from && !cmd\.steer \? gate\.release\(\) : null;\n    if \(freed\) dispatchSay\(freed\);/, name);
  }
  const turnSay = sourceOf("turn-driver").slice(sourceOf("turn-driver").indexOf('if (cmd.type === "say")'), sourceOf("turn-driver").indexOf('if (cmd.type === "expect")'));
  assert.match(turnSay, /if \(!from && !cmd\.steer\) held = false;/, "turn-driver");
});

test("the force stop the drivers answer ends only their own agent process", () => {
  const claude = sourceOf("driver");
  const stop = claude.slice(claude.indexOf("function forceStop("), claude.indexOf("function handleCommand("));
  assert.match(stop, /stale\.close\(\)/, "the sdk session closes and takes its CLI with it");
  assert.match(stop, /openSession\(true\)/, "the same conversation opens again");
  for (const name of ["cursor-driver", "gemini-driver", "kimi-driver", "kiro-driver", "codex-driver"]) {
    const source = sourceOf(name);
    const one = source.slice(source.indexOf("function forceStop("), source.indexOf("function handleCommand("));
    assert.match(one, /rpc\?\.close\(\)/, name);
    assert.doesNotMatch(one, /process\.kill|kill\(-/, `${name} kills nothing but its own child`);
  }
});

function seatWith(base, name, answer) {
  mkdirSync(join(base, "events"), { recursive: true });
  mkdirSync(join(base, "sessions"), { recursive: true });
  mkdirSync(join(base, "sock"), { recursive: true });
  writeFileSync(join(base, "sessions", `${name}.json`), JSON.stringify({ cwd: "/repo", model: "opus", session_id: "s1" }));
  writeFileSync(join(base, "events", `${name}.ndjson`), "");
  const heard = [];
  const listening = createServer((live) => {
    live.on("data", (chunk) => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        const cmd = JSON.parse(line);
        heard.push(cmd.type);
        live.write(JSON.stringify(answer(cmd)) + "\n");
      }
    });
  });
  return {
    heard,
    up: () => new Promise((done) => listening.listen(seatSockPath(base, name), done)),
    down: () => new Promise((done) => listening.close(done))
  };
}

test("force stop asks the driver first and takes its answer", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-force-"));
  const seat = seatWith(base, "stubborn", () => ({ ok: true, outcome: "killed" }));
  await seat.up();
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    const said = await sessions.command("stubborn", { type: "forceStop" });
    assert.deepEqual(said, { ok: true, outcome: "killed" });
    assert.deepEqual(seat.heard, ["forceStop"]);
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a driver this Hive did not start is never ended from here", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-force-"));
  const seat = seatWith(base, "foreign", () => ({ ok: false, error: "unknown command forceStop" }));
  await seat.up();
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    const said = await sessions.command("foreign", { type: "forceStop" });
    assert.equal(said.ok, false);
    assert.match(said.error, /not started by this Hive/);
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

test("a driver that refuses for a reason of its own is not ended", async () => {
  const base = mkdtempSync(join(tmpdir(), "hive-force-"));
  const seat = seatWith(base, "refuses", () => ({ ok: false, error: "this chat is changing providers" }));
  await seat.up();
  const sessions = createSessions({ base, driver: "/nao/vou/rodar" });
  try {
    const said = await sessions.command("refuses", { type: "forceStop" });
    assert.deepEqual(said, { ok: false, error: "this chat is changing providers" });
  } finally {
    sessions.stop();
    await seat.down();
    rmSync(base, { recursive: true, force: true });
  }
});

test("the reason a force stop gives is the one the timeline shows", () => {
  assert.equal(FORCE_STOPPED, "Force stopped by user");
});
