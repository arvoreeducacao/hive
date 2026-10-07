import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSessions } from "../sessions.mjs";

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

async function waitFor(check) {
  for (let count = 0; count < 300; count++) {
    const value = await check();
    if (value) return value;
    await wait(20);
  }
  assert.fail("the session did not settle");
}

async function bench(t, { legacy = false, transferSignal = null } = {}) {
  const base = await mkdtemp(join(tmpdir(), "hive-provider-process-"));
  const file = join(base, "fixture.mjs");
  const core = new URL("../engine/seat-core.mjs", import.meta.url).href;
  const context = new URL("../engine/transfer-context.mjs", import.meta.url).href;
  await writeFile(file, `
import { readFileSync, writeFileSync, appendFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { arg, createSeatServer, makeSessionStore } from ${JSON.stringify(core)};
import { transferText, transferResult } from ${JSON.stringify(context)};
const base = process.env.HIVE_STATE_DIR;
const name = arg("--name");
const agent = arg("--agent", "claude");
const model = arg("--model", "opus");
const legacy = !!arg("--legacy");
const sockFile = join(base, "sock", name + ".sock");
const metaFile = join(base, "sessions", name + ".json");
const eventsFile = join(base, "events", name + ".ndjson");
let meta = {};
try { meta = JSON.parse(readFileSync(metaFile, "utf8")); } catch {}
const store = makeSessionStore(metaFile, { ...meta, agent, model, cwd: arg("--cwd"), session_id: meta.session_id || agent + "-session" });
await store.persist({});
let seq = 0;
try { for (const line of readFileSync(eventsFile, "utf8").split("\\n")) { try { seq = Math.max(seq, JSON.parse(line).seq || 0); } catch {} } } catch {}
const emit = (event) => appendFileSync(eventsFile, JSON.stringify({ ...event, seq: ++seq }) + "\\n");
let server;
async function leave() {
 if (legacy) { await store.persist({ legacy_flushed: true }); emit({ type: "assistant", message: { content: [{ type: "text", text: "Last saved answer from the old driver" }] } }); }
 await store.flush(); server.close(); rmSync(sockFile, { force: true }); process.exit(0);
}
function handleCommand(cmd, reply) {
 if (cmd.type === "state") return reply({ ok: true, agent, working: existsSync(join(base, "busy")), queued: 0, questions: [] });
 if (cmd.op === "catalog") return reply({ ok: true, data: { models: [{ value: agent === "claude" ? "opus" : "gpt" }] } });
 if (cmd.type === "say") {
   emit({ type: "user", subtype: "say", message: { content: [{ type: "text", text: cmd.text }] } });
   const text = transferText(cmd.text, store);
   writeFileSync(join(base, "received.txt"), text);
   const result = { type: "result", is_error: false };
   transferResult(result, store);
   emit({ type: "assistant", message: { content: [{ type: "text", text: "Understood" }] } });
   emit(result);
   return reply({ ok: true });
 }
 reply({ ok: false, error: "unknown control op " + cmd.op });
}
server = legacy ? createServer((socket) => {
 let buffer = "";
 socket.on("data", (data) => {
  buffer += data;
  let newline;
  while ((newline = buffer.indexOf("\\n")) >= 0) {
   const cmd = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
   handleCommand(cmd, (response) => socket.write(JSON.stringify(response) + "\\n"));
  }
 });
 socket.on("error", () => {});
}).listen(sockFile) : createSeatServer({ sockFile, store, emit, leave, flush: () => store.flush(), handleCommand });
process.on("SIGTERM", leave);
process.on("SIGINT", leave);
`);
  let launches = 0;
  const options = { base, transferValidate: async () => {}, transferSignal, driver: file, windows: false, launch: (args, opts) => spawn(process.execPath, [file, ...args, ...(legacy && launches++ === 0 ? ["--legacy", "true"] : [])], opts) };
  const sessions = createSessions(options);
  t.after(async () => { await sessions.close("example"); sessions.stop(); await rm(base, { recursive: true, force: true }); });
  await sessions.open({ name: "example", agent: "claude", model: "opus", cwd: base });
  await waitFor(async () => (await sessions.command("example", { type: "state" })).ok);
  return { base, sessions, options };
}

test("real driver sockets switch providers without deleting history and the next turn receives context", async (t) => {
  const { sessions, base } = await bench(t);
  await sessions.command("example", { type: "say", text: "The release must preserve the public API" });
  const before = sessions.history("example").events;
  assert.equal((await sessions.command("example", { type: "control", op: "switchProvider", agent: "codex", model: "gpt" })).ok, true);
  const job = await waitFor(async () => {
    const job = (await sessions.command("example", { type: "control", op: "transferStatus" })).data;
    return ["done", "failed"].includes(job?.phase) ? job : null;
  });
  assert.equal(job.phase, "done", job.error);
  assert.equal((await sessions.command("example", { type: "state" })).agent, "codex");
  const events = sessions.history("example").events;
  assert.deepEqual(events.slice(0, before.length), before);
  assert.equal((await sessions.one("example")).state, "idle");
  await sessions.command("example", { type: "say", text: "Continue implementing" });
  assert.match(await readFile(join(base, "received.txt"), "utf8"), /preserve the public API/);
  const visibleUser = sessions.history("example").events.filter((event) => event.subtype === "say").at(-1);
  assert.equal(visibleUser.message.content[0].text, "Continue implementing");
  await sessions.command("example", { type: "say", text: "Next step" });
  assert.equal(await readFile(join(base, "received.txt"), "utf8"), "Next step");
  const meta = JSON.parse(await readFile(join(base, "sessions", "example.json"), "utf8"));
  assert.equal(meta.session_id, "codex-session");
});

test("an invalid destination model restarts the legacy source through real sockets", async (t) => {
  const { sessions, base } = await bench(t, { legacy: true });
  await sessions.command("example", { type: "say", text: "Keep my work" });
  await sessions.command("example", { type: "control", op: "switchProvider", agent: "codex", model: "unavailable" });
  const job = await waitFor(async () => {
    const job = (await sessions.command("example", { type: "control", op: "transferStatus" })).data;
    return job?.phase === "failed" ? job : null;
  });
  assert.equal(job.recovered, true, job.error);
  assert.equal((await sessions.command("example", { type: "state" })).agent, "claude");
  const meta = JSON.parse(await readFile(join(base, "sessions", "example.json"), "utf8"));
  assert.equal(meta.session_id, "claude-session");
  assert.equal(meta.model, "opus");
});


test("a driver opened before the update switches providers and flushes its last saved answer", async (t) => {
  const { sessions, base } = await bench(t, { legacy: true });
  await sessions.command("example", { type: "say", text: "Keep the existing task" });
  await writeFile(join(base, "busy"), "working");
  await sessions.command("example", { type: "control", op: "switchProvider", agent: "codex", model: "gpt" });
  const status = async () => (await sessions.command("example", { type: "control", op: "transferStatus" })).data;
  await waitFor(async () => (await status())?.phase === "waiting");
  assert.equal((await sessions.command("example", { type: "state" })).agent, "claude");
  await rm(join(base, "busy"));
  const job = await waitFor(async () => { const job = await status(); return ["done", "failed"].includes(job?.phase) && job; });
  assert.equal(job.phase, "done", job.error);
  const source = JSON.parse(await readFile(job.sourcePath, "utf8"));
  assert.equal(source.legacy_flushed, true);
  await sessions.command("example", { type: "say", text: "Continue" });
  const received = await readFile(join(base, "received.txt"), "utf8");
  assert.match(received, /Keep the existing task/);
  assert.match(received, /Last saved answer from the old driver/);
});

test("a legacy driver remains untouched when its shutdown signal cannot be sent", async (t) => {
  const { sessions, base } = await bench(t, { legacy: true, transferSignal: async () => { throw new Error("window unavailable"); } });
  await sessions.command("example", { type: "control", op: "switchProvider", agent: "codex", model: "gpt" });
  const job = await waitFor(async () => {
    const job = (await sessions.command("example", { type: "control", op: "transferStatus" })).data;
    return job?.phase === "failed" && job;
  });
  assert.equal(job.error, "window unavailable");
  assert.equal((await sessions.command("example", { type: "state" })).agent, "claude");
  assert.equal(JSON.parse(await readFile(join(base, "sessions", "example.json"), "utf8")).legacy_flushed, undefined);
});
