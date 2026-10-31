import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { forkPoint, transcriptEntries, transcriptFileOf, sayGate, EDIT_BEFORE_COMPACT, EDIT_NO_RECORD } from "../engine/protocol.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");

const entry = (uuid, parentUuid, extra = {}) => ({ uuid, parentUuid, ...extra });

const conversation = [
  entry("u1", null),
  entry("a1", "u1"),
  entry("t1", "a1"),
  entry("u2", "t1"),
  entry("a2", "u2"),
  entry("u3", "a2"),
  entry("a3", "u3"),
];

test("an edited message is picked up from the entry right before it", () => {
  assert.deepEqual(forkPoint(conversation, "u3"), { found: true, at: "a2" });
  assert.deepEqual(forkPoint(conversation, "u2"), { found: true, at: "t1" });
});

test("editing the message that opened the conversation starts it over", () => {
  assert.deepEqual(forkPoint(conversation, "u1"), { found: true, at: "" });
});

test("a message behind a compaction cannot be reached: the summary starts a chain of its own", () => {
  const compacted = [...conversation, entry("cb", null, { type: "system" }), entry("sum", "cb"), entry("u4", "sum"), entry("a4", "u4")];
  assert.deepEqual(forkPoint(compacted, "u4"), { found: true, at: "sum" });
  assert.deepEqual(forkPoint(compacted, "u2"), { found: false, error: EDIT_BEFORE_COMPACT });
});

test("after an edit the conversation follows the new branch, and the one left behind is out of reach", () => {
  const edited = [...conversation, entry("u3b", "a2"), entry("a3b", "u3b")];
  assert.deepEqual(forkPoint(edited, "u3b"), { found: true, at: "a2" });
  assert.equal(forkPoint(edited, "u3").found, false);
  assert.deepEqual(forkPoint(edited, "u2"), { found: true, at: "t1" });
});

test("what a subagent wrote beside the conversation never decides where it goes on", () => {
  const withSide = [...conversation, entry("s1", "a3", { isSidechain: true })];
  assert.deepEqual(forkPoint(withSide, "u3"), { found: true, at: "a2" });
});

test("the transcript is read from whichever login folder holds the session", async () => {
  const root = mkdtempSync(join(tmpdir(), "hive-edit-"));
  const empty = join(root, "empty");
  const login = join(root, "login");
  mkdirSync(join(login, "projects", "-repo"), { recursive: true });
  const file = join(login, "projects", "-repo", "s-1.jsonl");
  writeFileSync(file, [
    JSON.stringify({ type: "queue-operation" }),
    JSON.stringify({ type: "user", uuid: "u1", parentUuid: null, message: { role: "user", content: "oi" } }),
    "not json",
    JSON.stringify({ type: "assistant", uuid: "a1", parentUuid: "u1", message: { role: "assistant", content: [] } }),
  ].join("\n") + "\n");
  assert.equal(await transcriptFileOf("s-1", [empty, login]), file);
  assert.equal(await transcriptFileOf("s-2", [empty, login]), "");
  assert.equal(await transcriptFileOf("", [login]), "");
  assert.deepEqual(await transcriptEntries(file), [
    { uuid: "u1", parentUuid: null, isSidechain: false },
    { uuid: "a1", parentUuid: "u1", isSidechain: false },
  ]);
});

function edits({ busy = false, anonymous = false } = {}) {
  const source = driver.slice(driver.indexOf('if (cmd.type === "edit") {'), driver.indexOf('if (cmd.type === "expect") {'));
  const gate = sayGate();
  if (busy) gate.push({ text: "trabalhando" });
  const seen = { interrupted: 0, edits: [], dismissed: [], dispatched: [], emitted: [] };
  const session = { interrupt: async () => { seen.interrupted += 1; } };
  const run = new Function(
    "cmd", "reply", "gate", "session", "anonymous", "EDIT_NO_RECORD", "dismissQuestions", "editNow", "dispatchSay", "emit",
    `let pendingEdit = null; ${source} return reply(null);`
  );
  return {
    gate,
    seen,
    ask: (cmd) => new Promise((done) => run(cmd, done, gate, session, anonymous, EDIT_NO_RECORD,
      (text) => seen.dismissed.push(text),
      async (answer) => { seen.edits.push(cmd); answer({ ok: true }); return true; },
      (item) => seen.dispatched.push(item),
      (event) => seen.emitted.push(event))),
  };
}

test("an idle chat takes the edit at once and holds the queue while it goes back", async () => {
  const b = edits();
  await b.ask({ type: "edit", target: "u3", text: "outra coisa" });
  assert.equal(b.seen.edits.length, 1);
  assert.equal(b.seen.interrupted, 0);
  assert.equal(b.gate.busy, true, "a message sent while the conversation goes back has to wait for the edited one");
});

test("a working chat stops the turn first and says so", async () => {
  const b = edits({ busy: true });
  const reply = await b.ask({ type: "edit", target: "u3", text: "outra coisa" });
  assert.deepEqual(reply, { ok: true, stopping: true });
  assert.equal(b.seen.interrupted, 1);
  assert.equal(b.seen.edits.length, 0, "the conversation only goes back once the stopped turn has ended");
  assert.deepEqual(b.seen.dismissed, ["outra coisa"], "an open card cannot hold the turn the edit is stopping");
});

test("an edit with nothing in it, without the message it replaces, or in a chat that keeps no record is refused", async () => {
  assert.match((await edits().ask({ type: "edit", target: "u3", text: "  " })).error, /needs text/);
  assert.match((await edits().ask({ type: "edit", text: "oi" })).error, /the message it replaces/);
  assert.equal((await edits({ anonymous: true }).ask({ type: "edit", target: "u3", text: "oi" })).error, EDIT_NO_RECORD);
});

test("the edited message opens the session at the point the transcript names, once", () => {
  assert.match(driver, /if \(fresh\.resume && pickUpAt\) fresh\.resumeSessionAt = pickUpAt;/);
  assert.match(driver, /if \(pendingEdit && await editNow\(\)\) return true;\n\s+dispatchSay\(gate\.turnEnded\(\)\);/, "a stopped turn hands its end to the edit before the queue moves");
  assert.match(driver, /retire\("mute session"\);\n\s+dispatchSay\(underAFreshName\(item\)\);/, "a message said again to a fresh session needs a new id, or the transcript takes it as one it already has");
});

function failoverRedo({ lastSaid }) {
  const redoSource = driver.match(/const logins = accountFailover\(\{[\s\S]*?\n\s+redo: (\(\) => \{[^\n]*\}),\n/)[1];
  const freshNameSource = driver.match(/function underAFreshName\(item\) \{[\s\S]*?\n\}\n/)[0];
  const sent = [];
  const emitted = [];
  const build = new Function("lastSaid", "dispatchSay", "emit", "randomUUID", `${freshNameSource}\nreturn ${redoSource};`);
  const redo = build(lastSaid, (item) => sent.push(item), (event) => emitted.push(event), () => "u-again");
  return { redo, sent, emitted };
}

test("the turn a spent login refused goes to the next login under a new id, or the transcript takes it as one it already has", () => {
  const b = failoverRedo({ lastSaid: { text: "continue", images: [], cid: "c1", uuid: "u-refused" } });
  assert.equal(b.redo(), true);
  assert.equal(b.sent.length, 1);
  assert.equal(b.sent[0].text, "continue");
  assert.equal(b.sent[0].cid, "c1");
  assert.equal(b.sent[0].uuid, "u-again");
  assert.deepEqual(b.emitted, [{ type: "driver", subtype: "said_as", was: "u-refused", uuid: "u-again" }], "the bubble on screen has to follow the new id to stay editable");
});

test("with nothing said yet the next login has no turn to take over", () => {
  const b = failoverRedo({ lastSaid: null });
  assert.equal(b.redo(), false);
  assert.deepEqual(b.sent, []);
});
