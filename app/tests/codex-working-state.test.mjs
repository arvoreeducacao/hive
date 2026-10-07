import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";
import { newThreadContext, translate } from "../../server/engine/codex-app-server.mjs";
await views();
const { svEvent } = await app("chat-and-panes");
const { getStructured, interruptStructured } = await app("chat-stretches");
const { refreshDriverState } = await app("structured-seats");
let next = 0;
function seat() {
  const e = getStructured({ name: `codex-state-${++next}`, where: "local", agent: "codex" });
  document.body.appendChild(e.host);
  return e;
}
function driver(e, state, interrupt = { ok: true }) {
  const calls = [];
  e.ws = { readyState: 1, send(text) {
    const cmd = JSON.parse(text);
    calls.push(cmd.type);
    const reply = cmd.type === "state" ? state : cmd.type === "interrupt" ? interrupt : { ok: false };
    const done = e.pending.get(cmd.cid);
    e.pending.delete(cmd.cid);
    done?.(reply);
  } };
  return calls;
}
test("resuming an idle Codex thread does not start the working indicator", () => {
  const e = seat();
  svEvent(e, { type: "system", subtype: "init", agent: "codex", working: false });
  assert.equal(e.turnOpen, false);
  assert.equal(e.activity, "");
  assert.equal(e.host.querySelector(".sv-composer").classList.contains("running"), false);
});
test("every real Codex turn starts the indicator and completion stops it", () => {
  const e = seat();
  driver(e, { ok: true, working: false });
  for (const id of ["one", "two"]) {
    const ctx = newThreadContext();
    for (const event of translate({ method: "turn/started", params: { turn: { id } } }, ctx)) svEvent(e, event);
    assert.equal(e.turnOpen, true);
    for (const event of translate({ method: "turn/completed", params: { turn: { id, status: "completed" } } }, ctx)) svEvent(e, event);
    assert.equal(e.turnOpen, false);
  }
});
test("stopping a phantom turn clears the UI when the driver says it was already idle", async () => {
  const e = seat();
  svEvent(e, { type: "system", subtype: "init", agent: "codex" });
  const calls = driver(e, { ok: true, working: false, seq: 44 }, { ok: false, error: "the seat was idle" });
  await interruptStructured(e);
  assert.deepEqual(calls.slice(0, 2), ["interrupt", "state"]);
  assert.equal(e.turnOpen, false);
  assert.equal(e.activity, "");
});
test("reconnecting reconciles a stale working indicator without sending a model message", async () => {
  const e = seat();
  e.turnOpen = true;
  const calls = driver(e, { ok: true, working: false, seq: 44 });
  await refreshDriverState(e);
  assert.equal(e.turnOpen, false);
  assert.ok(!calls.includes("say"));
});
test("a stale state response cannot erase a newer turn", async () => {
  const e = seat();
  svEvent(e, { type: "driver", subtype: "turn_started", seq: 50 });
  driver(e, { ok: true, working: false, seq: 49 });
  await refreshDriverState(e);
  assert.equal(e.turnOpen, true);
});
test("replayed turn starts never put an idle chat back to work", () => {
  const e = seat();
  svEvent(e, { type: "driver", subtype: "turn_started", replayed: true });
  assert.equal(e.turnOpen, false);
});

test("an older Codex driver still starts the indicator when it dispatches a message", () => {
  const e = seat();
  svEvent(e, { type: "driver", subtype: "dispatched", cid: "message-1" });
  assert.equal(e.turnOpen, true);
  assert.equal(e.activity, "working");
});
