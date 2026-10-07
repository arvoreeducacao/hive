import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createProviderTransfers, prepareContext, transcriptEntry, providerTransferWaiting, unsupportedTransferControl } from "../provider-transfer.mjs";
import { transferText, transferResult, transferEvent } from "../engine/transfer-context.mjs";

const user = (text) => ({ type: "user", subtype: "say", message: { content: [{ type: "text", text }] } });
const answer = (text) => ({ type: "assistant", message: { content: [{ type: "text", text }] } });

async function fixture(t, options = {}) {
  const base = await mkdtemp(join(tmpdir(), "hive-transfer-test-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  await mkdir(join(base, "sessions"));
  await mkdir(join(base, "events"));
  const source = { agent: "claude", cwd: base, session_id: "original", model: "opus", account: "second", title: "The task", errand: "The request", effort: "max" };
  const file = join(base, "sessions", "test.json");
  await writeFile(file, JSON.stringify(source));
  await writeFile(join(base, "events", "test.ndjson"), [user("Keep the public API"), answer("Updated src/parser.js; tests passed")].map(JSON.stringify).join("\n"));
  const calls = [];
  let agent = "claude";
  let held = 0;
  let clock = 0;
  const transfer = createProviderTransfers({
    base,
    now: () => clock,
    readyTimeout: 200,
    wait: async () => { clock += 100; },
    command: async (name, cmd) => {
      calls.push(cmd.op || cmd.type);
      if (cmd.op === "prepareTransfer") return { ok: true, data: { waiting: held++ < (options.waiting || 0) } };
      if (cmd.op === "catalog") return options.failTarget && agent === "codex" ? { ok: false, error: "sign in failed" } : { ok: true, data: { models: [{ value: agent === "codex" ? "gpt" : "opus" }] } };
      return { ok: true, agent };
    },
    validate: options.validate,
    stop: async () => { calls.push("stop"); },
    start: async (name, meta) => { calls.push(`start:${meta.agent}`); agent = meta.agent; },
  });
  return { base, transfer, file, source, calls };
}

async function finished(transfer) {
  for (let i = 0; i < 200; i++) {
    const state = transfer.status("test");
    if (["done", "failed"].includes(state?.phase)) return state;
    await new Promise((done) => setTimeout(done, 5));
  }
  assert.fail("transfer did not settle");
}

test("a provider switch keeps the chat history and cwd, starts a fresh provider session and carries context", async (t) => {
  const { base, transfer, file, calls } = await fixture(t, { waiting: 2 });
  const before = await readFile(join(base, "events", "test.ndjson"), "utf8");
  const result = await transfer.begin("test", "codex", "gpt");
  assert.equal(result.ok, true);
  assert.equal((await transfer.begin("test", "kimi", "k3")).ok, false);
  assert.equal((await finished(transfer)).phase, "done");
  const meta = JSON.parse(await readFile(file, "utf8"));
  assert.equal(meta.session_id, undefined);
  assert.equal(meta.account, undefined);
  assert.equal(meta.effort, undefined);
  assert.equal(meta.cwd, base);
  assert.equal(meta.title, "The task");
  assert.equal(meta.errand, "The request");
  assert.equal(await readFile(join(base, "events", "test.ndjson"), "utf8"), before);
  assert.match(await readFile(meta.provider_context.path, "utf8"), /Keep the public API/);
  assert.equal(calls.filter((value) => value === "prepareTransfer").length, 3);
  assert.ok(calls.indexOf("stop") < calls.indexOf("start:codex"));
  assert.equal(calls.at(-1), "releaseTransfer");
});

test("failure in the destination restores the exact source session, model and account", async (t) => {
  const { transfer, file, source, calls } = await fixture(t, { failTarget: true });
  await transfer.begin("test", "codex", "gpt");
  const result = await finished(transfer);
  assert.equal(result.phase, "failed");
  assert.equal(result.recovered, true);
  assert.match(result.error, /sign in failed/);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), source);
  assert.deepEqual(calls.filter((value) => value.startsWith("start:")), ["start:codex", "start:claude"]);
});

test("an unavailable provider never stops the original session", async (t) => {
  const { transfer, file, source, calls } = await fixture(t, { validate: async () => { throw new Error("provider off"); } });
  await transfer.begin("test", "codex", "gpt");
  assert.equal((await finished(transfer)).phase, "failed");
  assert.equal(calls.includes("stop"), false);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), source);
});

test("the extract stays bounded and excludes thinking while retaining a complete readable history", async (t) => {
  const { base } = await fixture(t);
  const eventsFile = join(base, "large.ndjson");
  const events = [user("Original constraint"), ...Array.from({ length: 80 }, (_, n) => answer(`${n} ${"x".repeat(8000)}`)), answer("Last decision")];
  events.push({ type: "assistant", message: { content: [{ type: "thinking", thinking: "private reasoning" }] } });
  await writeFile(eventsFile, events.map(JSON.stringify).join("\n"));
  const context = await prepareContext({ eventsFile, directory: join(base, "context"), source: { cwd: base }, target: { agent: "codex" }, budget: 12000 });
  const extract = await readFile(context.path, "utf8");
  assert.ok(extract.length < 15000);
  assert.match(extract, /Original constraint/);
  assert.match(extract, /Last decision/);
  assert.doesNotMatch(extract, /private reasoning/);
  const history = await readFile(context.history, "utf8");
  assert.ok(history.length > 600000);
  assert.doesNotMatch(history, /private reasoning/);
  assert.equal(transcriptEntry({ type: "user", message: { content: {} } }), "");
});

test("context survives failed attempts and is consumed only after a successful transferred turn", async (t) => {
  const { base } = await fixture(t);
  const path = join(base, "context.md");
  await writeFile(path, "Previous decisions");
  const store = { meta: { provider_context: { path, delivered: false } }, persist(patch) { Object.assign(this.meta, patch); } };
  transferResult({ type: "result" }, store);
  assert.equal(store.meta.provider_context.delivered, false);
  const hydrated = transferText("Continue", store);
  assert.match(hydrated, /Previous decisions.*Current user message:.*Continue/s);
  assert.equal(transferEvent(user(hydrated), store).message.content[0].text, "Continue");
  transferResult({ type: "result", is_error: true }, store);
  assert.match(transferText("Retry", store), /Previous decisions/);
  transferResult({ type: "result", is_error: false }, store);
  assert.equal(transferText("Next", store), "Next");
});

test("a restarted Hive restores the original session from an unfinished transfer", async (t) => {
  const { base, source, file } = await fixture(t);
  const directory = join(base, "transfers", "test", "interrupted");
  await mkdir(directory, { recursive: true });
  const sourcePath = join(directory, "source.json");
  await writeFile(sourcePath, JSON.stringify(source));
  await writeFile(join(base, "transfers", "test", "current.json"), JSON.stringify({ id: "interrupted", phase: "starting", agent: "codex", model: "gpt", sourcePath }));
  await writeFile(file, JSON.stringify({ agent: "codex", cwd: base, provider_switching: true, provider_previous: sourcePath }));
  let starts = 0;
  const transfer = createProviderTransfers({
    base,
    stop: async () => {},
    start: async (name, meta) => { starts++; assert.equal(meta.session_id, "original"); },
    command: async (name, cmd) => cmd.op === "catalog" ? { ok: true, data: { models: [] } } : { ok: true, agent: "claude" }
  });
  await Promise.all([transfer.restore("test"), transfer.restore("test")]);
  assert.equal((await finished(transfer)).recovered, true);
  assert.equal(starts, 1);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), source);
});

test("a completed transfer is not rolled back when the app restarted before recording completion", async (t) => {
  const { base, file } = await fixture(t);
  const directory = join(base, "transfers", "test");
  await mkdir(directory, { recursive: true });
  const sourcePath = join(directory, "source.json");
  await writeFile(join(directory, "current.json"), JSON.stringify({ id: "released", phase: "starting", agent: "codex", model: "gpt", sourcePath }));
  await writeFile(file, JSON.stringify({ agent: "codex", provider_switching: false, provider_previous: sourcePath }));
  const transfer = createProviderTransfers({ base, stop: () => assert.fail("a released session must not stop"), start: () => assert.fail("a released session must not restart"), command: () => assert.fail("no driver command is needed") });
  assert.equal((await transfer.restore("test")).phase, "done");
});

test("simultaneous requests cannot start two transfers", async (t) => {
  const { transfer } = await fixture(t);
  const results = await Promise.all([transfer.begin("test", "codex", "gpt"), transfer.begin("test", "kimi", "k3")]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  await finished(transfer);
});


test("only explicit missing transfer controls enable legacy compatibility", () => {
  for (const error of ["unknown control op prepareTransfer", "Codex seats do not support /prepareTransfer", "Kimi seats do not support /prepareTransfer", "Kiro seats do not support /prepareTransfer", "Cursor seats do not support /prepareTransfer", "OpenCode seats do not support /prepareTransfer"]) {
    assert.equal(unsupportedTransferControl({ ok: false, error }, "prepareTransfer"), true);
  }
  for (const reply of [null, { ok: false, error: "socket timed out" }, { ok: false, error: "unknown control op setModel" }, { ok: true }]) assert.equal(unsupportedTransferControl(reply, "prepareTransfer"), false);
});

test("legacy readiness requires a saved conversation and no work, queue, questions or peers", () => {
  const idle = { ok: true, working: false, queued: 0, questions: [], expecting: [] };
  assert.equal(providerTransferWaiting(idle), false);
  for (const patch of [{ working: true }, { queued: 1 }, { questions: ["question"] }, { expecting: ["peer"] }]) assert.equal(providerTransferWaiting({ ...idle, ...patch }), true);
  for (const patch of [{ ok: false }, { working: undefined }, { queued: undefined }, { questions: undefined }, { events_write_failed: true }]) assert.throws(() => providerTransferWaiting({ ...idle, ...patch }));
});
