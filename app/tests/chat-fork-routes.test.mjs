import { test } from "node:test";
import assert from "node:assert/strict";
import { filesCanGoBack, forkChat, forkTitle, pickCheckpoints, refusalOf, revertFiles } from "../lib/chat-rewind.mjs";
import { registerRewindRoutes } from "../routes/rewind.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const line = (event) => JSON.stringify(event);

const SEAT = {
  name: "valores",
  where: "local",
  structured: true,
  agent: "claude",
  state: "idle",
  title: "Valores incoerentes",
  cwd: "/hub",
  trees: [{ path: "/hub", main: true }, { path: "/hub/.wt-a", main: false }, { path: "/hub/.wt-b" }]
};

const ASKED = [
  { seq: 1, ts: "2026-10-29T10:00:01.000Z", type: "user", subtype: "say", cid: null, images: [], message: { content: [{ type: "text", text: "start" }] } },
  { seq: 2, type: "assistant", uuid: id(2), message: { content: [{ type: "text", text: "done" }] } },
  { seq: 3, type: "result", subtype: "success" },
  { seq: 4, ts: "2026-10-29T10:00:05.000Z", type: "user", subtype: "say", cid: null, images: [], message: { content: [{ type: "text", text: "now this" }] } },
  { seq: 5, type: "assistant", uuid: id(5), message: { content: [{ type: "text", text: "done too" }] } },
  { seq: 6, type: "result", subtype: "success" }
].map(line).join("\n") + "\n";

const ASKED_AT = Date.parse("2026-10-29T10:00:05.000Z");

const readAsked = async () => ASKED;

function checkpointsOf(kept = {}, failing = "") {
  const restored = [];
  return {
    restored,
    list: async (seat, path) => kept[path] || [],
    restore: async (seat, path, ordinal) => {
      restored.push({ seat, path, ordinal });
      return path === failing ? { error: "git would not restore" } : { ok: true };
    }
  };
}

test("only a claude chat that runs here, in the structured view, can revert its files or be forked", () => {
  assert.equal(refusalOf(SEAT), "");
  assert.match(refusalOf(null), /not open on this machine/);
  assert.match(refusalOf({ ...SEAT, where: "cloud" }), /only chats on this machine/);
  assert.match(refusalOf({ ...SEAT, structured: false }), /terminal/);
  assert.match(refusalOf({ ...SEAT, agent: "codex" }, "be forked"), /a codex chat cannot be forked/);
  assert.equal(refusalOf({ ...SEAT, agent: "" }), "", "a seat that never said its agent is claude");
});

test("the files go back to the last checkpoint taken before the message reached the model, per worktree", () => {
  const picks = pickCheckpoints([
    { path: "/a", kept: [{ ordinal: 1, at: 1000 }, { ordinal: 2, at: 4000 }, { ordinal: 3, at: 9000 }] },
    { path: "/b", kept: [{ ordinal: 7, at: 6000 }] },
    { path: "/c", kept: [] }
  ], 5000);
  assert.deepEqual(picks, [{ path: "/a", ordinal: 2 }]);
});

test("the files go back per worktree to the copy taken before the message reached the model", async () => {
  const kept = checkpointsOf({ "/hub/.wt-a": [{ ordinal: 1, at: ASKED_AT - 4000 }, { ordinal: 2, at: ASKED_AT + 1000 }], "/hub/.wt-b": [{ ordinal: 4, at: ASKED_AT - 3000 }], "/hub": [{ ordinal: 9, at: 0 }] });
  const said = await revertFiles({ seat: SEAT, seq: "4", readEvents: readAsked, checkpoints: kept });
  assert.deepEqual(said, { ok: true, restored: 2 });
  assert.deepEqual(kept.restored, [{ seat: "valores", path: "/hub/.wt-a", ordinal: 1 }, { seat: "valores", path: "/hub/.wt-b", ordinal: 4 }], "the main checkout is never checkpointed, so it is never restored");
});

test("the edit asks first whether a copy of the files from before the message exists, and nothing moves while it asks", async () => {
  const kept = checkpointsOf({ "/hub/.wt-a": [{ ordinal: 1, at: ASKED_AT - 4000 }] });
  assert.deepEqual(await filesCanGoBack({ seat: SEAT, seq: 4, readEvents: readAsked, checkpoints: kept }), { ok: true, available: true });
  assert.deepEqual(await filesCanGoBack({ seat: SEAT, seq: 4, readEvents: readAsked, checkpoints: checkpointsOf({ "/hub/.wt-a": [{ ordinal: 3, at: ASKED_AT + 9000 }] }) }), { ok: true, available: false });
  assert.equal((await filesCanGoBack({ seat: { ...SEAT, state: "working" }, seq: 4, readEvents: readAsked, checkpoints: kept })).available, false);
  assert.deepEqual(kept.restored, []);
});

test("with no copy of the files from before the message, nothing moves at all", async () => {
  const kept = checkpointsOf({ "/hub/.wt-a": [{ ordinal: 3, at: ASKED_AT + 9000 }] });
  const said = await revertFiles({ seat: SEAT, seq: 4, readEvents: readAsked, checkpoints: kept });
  assert.match(said.error, /no copy of this chat's files/);
  assert.deepEqual(kept.restored, []);
});

test("a restore that fails says which worktree and why", async () => {
  const said = await revertFiles({ seat: SEAT, seq: 4, readEvents: readAsked, checkpoints: checkpointsOf({ "/hub/.wt-a": [{ ordinal: 1, at: 0 }] }, "/hub/.wt-a") });
  assert.match(said.error, /files did not go back: \/hub\/\.wt-a: git would not restore/);
});

test("a working chat, a bad seq and a message that is not there come back as errors", async () => {
  assert.equal((await revertFiles({ seat: { ...SEAT, state: "working" }, seq: 4, readEvents: readAsked, checkpoints: checkpointsOf() })).status, 409);
  assert.equal((await revertFiles({ seat: SEAT, seq: "x", readEvents: readAsked, checkpoints: checkpointsOf() })).status, 400);
  assert.equal((await revertFiles({ seat: SEAT, seq: 2, readEvents: readAsked, checkpoints: checkpointsOf() })).status, 409);
  assert.match((await revertFiles({ seat: { ...SEAT, agent: "codex" }, seq: 4, readEvents: readAsked, checkpoints: checkpointsOf() })).error, /codex/);
});

const EVENTS = [
  { seq: 1, type: "user", subtype: "say", cid: null, images: [], message: { content: [{ type: "text", text: "start" }] } },
  { seq: 2, type: "assistant", uuid: id(2), message: { content: [{ type: "text", text: "first answer" }] } },
  { seq: 3, type: "result", subtype: "success" },
  { seq: 4, type: "user", subtype: "say", cid: "c1-x", images: [], message: { content: [{ type: "text", text: "more" }] } },
  { seq: 5, type: "assistant", uuid: id(5), message: { content: [{ type: "text", text: "second answer" }] } },
  { seq: 6, type: "result", subtype: "success" }
].map(line).join("\n") + "\n";

test("a fork copies the conversation up to the answer, under the copy's uuids, with the divider at its end", async () => {
  const forks = [];
  const opened = [];
  const said = await forkChat({
    seat: SEAT,
    seq: 2,
    readEvents: async () => EVENTS,
    readMeta: async () => ({ session_id: id(100), cwd: "/hub", model: "opus", effort: "high", home: "work", dirs: ["/hub/.wt-a"], mode: "plan", asleep: true }),
    fork: async (sessionId, options) => { forks.push({ sessionId, ...options }); return { sessionId: id(200) }; },
    readTranscript: async (which) => (which === id(200) ? line({ uuid: id(202), forkedFrom: { messageUuid: id(2) } }) : ""),
    open: async (asked) => { opened.push(asked); return { name: "valores-incoerentes-fork", where: "local" }; },
    now: () => "2026-10-29T12:00:00.000Z"
  });
  assert.deepEqual(said, { ok: true, name: "valores-incoerentes-fork", where: "local", title: "Valores incoerentes fork" });
  assert.deepEqual(forks, [{ sessionId: id(100), upToMessageId: id(2), title: "Valores incoerentes fork", dir: "/hub" }]);
  const [asked] = opened;
  assert.equal(asked.id, id(200));
  assert.equal(asked.cwd, "/hub");
  assert.deepEqual(asked.meta, { model: "opus", effort: "high", home: "work", dirs: ["/hub/.wt-a"] }, "the fork runs where and as the original did, but not asleep or in its mode");
  const events = asked.events.trim().split("\n").map((one) => JSON.parse(one));
  assert.deepEqual(events.map((one) => one.seq), [1, 2, 3, 4]);
  assert.equal(events[1].uuid, id(202));
  assert.deepEqual(events[3], { seq: 4, ts: "2026-10-29T12:00:00.000Z", type: "driver", subtype: "forked", from: "valores", where: "local", title: "Valores incoerentes" });
});

test("a fork of another provider, of an answer still running, or without a session says why", async () => {
  const base = { readEvents: async () => EVENTS, readMeta: async () => ({ session_id: id(100) }), fork: async () => ({ sessionId: id(1) }), readTranscript: async () => "", open: async () => ({ name: "x" }) };
  assert.match((await forkChat({ ...base, seat: { ...SEAT, agent: "gemini" }, seq: 2 })).error, /gemini chat cannot be forked/);
  assert.match((await forkChat({ ...base, seat: SEAT, seq: 99 })).error, /not in this chat/);
  await assert.rejects(forkChat({ ...base, readMeta: async () => ({}), seat: SEAT, seq: 2 }), /no conversation on record/);
  assert.equal(forkTitle("  x  "), "x fork");
  assert.equal(forkTitle("a".repeat(80)).length, 60);
});

test("the routes answer with the status the chat refused with, and refuse a name nobody can have", async () => {
  const routes = new Map();
  const on = (method, path, run) => routes.set(`${method} ${path}`, run);
  const kept = checkpointsOf({ "/hub/.wt-a": [{ ordinal: 1, at: 0 }] });
  registerRewindRoutes(on, {
    bodyOf: async (req) => req.body,
    isSeatName: (name) => /^[a-z0-9-]+$/.test(String(name || "")),
    seatOf: (name) => (name === SEAT.name ? SEAT : null),
    checkpoints: kept,
    readEvents: async () => EVENTS,
    readMeta: async () => ({ session_id: id(100), cwd: "/hub" }),
    fork: async () => ({ sessionId: id(300) }),
    readTranscript: async () => "",
    open: async () => ({ name: "valores-fork", where: "local" })
  });
  const call = async (key, body) => {
    let answer = null;
    await routes.get(key)({ body }, null, null, (data, status = 200) => { answer = { data, status }; });
    return answer;
  };
  assert.deepEqual(await call("POST /api/chat/revert-files", { name: "../x", seq: 1 }), { data: { error: "unknown session" }, status: 400 });
  assert.deepEqual(await call("POST /api/chat/revert-files", { name: "valores", seq: 4 }), { data: { ok: true, restored: 1 }, status: 200 });
  assert.deepEqual(kept.restored, [{ seat: "valores", path: "/hub/.wt-a", ordinal: 1 }]);
  assert.equal((await call("POST /api/chat/revert-files", { name: "gone", seq: 4 })).status, 409);
  const ask = async (query) => {
    let answer = null;
    await routes.get("GET /api/chat/revert-files")({}, null, new URL(`http://hive/api/chat/revert-files?${query}`), (data, status = 200) => { answer = { data, status }; });
    return answer;
  };
  assert.deepEqual(await ask("name=valores&seq=4"), { data: { ok: true, available: true }, status: 200 });
  assert.equal((await ask("name=..%2Fx&seq=4")).status, 400);
  assert.equal((await call("POST /api/chat/fork", { name: "valores", seq: 5 })).data.name, "valores-fork");
  assert.equal((await call("POST /api/chat/fork", { name: "valores", seq: 5, title: "x" })).status, 200);
});
