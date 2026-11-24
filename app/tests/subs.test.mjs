import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const {
  AGENT_TOOL, ASYNC_LAUNCH, SUB_LOG_MAX, SUB_STALE,
  paintSubs, svSubAsync, svSubCall, svSubEcho, svSubLanded, svSubPin, svSubTask, svSubUnpin, svSubsOfAnEndedProcess
} = await app("subagents-dock");
const { svConvSeed } = await app("conversation-model");
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { structPool } = await app("structured-seats");
const { backgroundWorkLine, openBackgroundWork } = await app("background-work");

let seq = 0;

function seat(at) {
  const name = `subs-${++seq}`;
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  if (at) e.at = at;
  return e;
}

const call = (id, input) => ({ id, name: "Agent", input });
const pinned = (e) => e.conv.subs.length;
const rows = (e) => {
  openBackgroundWork(e);
  return e.bgDialog?.open ? [...e.bgDialog.querySelectorAll(".bgw-item")] : [];
};
const line = (e) => backgroundWorkLine(e);
const item = (e, id) => e.subs.get(id);
const steps = (e, id) => item(e, id).steps.map((one) => one.text);

test("the tools that spawn a subagent are the ones that get pinned", () => {
  assert.ok(AGENT_TOOL.test("Agent"));
  assert.ok(AGENT_TOOL.test("task"));
  assert.ok(!AGENT_TOOL.test("Bash"));
  assert.ok(!AGENT_TOOL.test("ListAgents"));
});

test("a launched subagent takes a seat above the box, wearing its type and its errand", () => {
  const e = seat();
  svSubPin(e, call("t1", { subagent_type: "Explore", description: "Demo subagent", prompt: "list the repo" }));
  assert.equal(pinned(e), 1);
  assert.ok(line(e));
  assert.equal(item(e, "t1").name, "Explore");
  assert.equal(item(e, "t1").arg, "Demo subagent");
  assert.equal(rows(e)[0].querySelector(".bgw-name").title, "Explore");
  assert.equal(rows(e)[0].querySelector(".bgw-name").textContent, "Demo subagent");
  structPool.delete(e.name);
});

test("with no description the errand is the prompt itself, on one line", () => {
  const e = seat();
  svSubPin(e, call("t1", { prompt: "look at\n  the thing" }));
  assert.equal(item(e, "t1").name, "subagent");
  assert.equal(item(e, "t1").arg, "look at the thing");
  structPool.delete(e.name);
});

test("the errand stays put while the run happens", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short", prompt: "the whole brief" }));
  assert.equal(item(e, "t1").body, "the whole brief");
  svSubEcho(e, "t1", "reading the third file");
  assert.equal(item(e, "t1").body, "the whole brief");
  structPool.delete(e.name);
});

test("what it says stacks up — the run is every line, not the last one", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short", prompt: "brief" }));
  svSubEcho(e, "t1", "I'll explore both repos");
  svSubEcho(e, "t1", "found the screen, reading it now");
  assert.deepEqual(steps(e, "t1"), ["I'll explore both repos", "found the screen, reading it now"]);
  assert.equal(rows(e)[0].querySelector(".bgw-current .bgw-text").textContent, "found the screen, reading it now");
  assert.deepEqual([...rows(e)[0].querySelectorAll(".bgw-steps .bgw-text")].map((one) => one.textContent), ["I'll explore both repos"]);
  structPool.delete(e.name);
});

test("the log is empty until there is a run to show", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  assert.equal(rows(e)[0].querySelector(".bgw-current"), null);
  svSubEcho(e, "t1", "starting");
  assert.ok(rows(e)[0].querySelector(".bgw-current"));
  structPool.delete(e.name);
});

test("the calls it makes are steps too, wearing the face of the tool", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  const step = svSubCall(e, "t1", { id: "c1", name: "Bash", input: { command: "cd /tmp && grep -rn foo ." } });
  assert.equal(step.face, "run");
  assert.equal(step.text, "Bash grep -rn foo .");
  assert.equal(step.of, "c1");
  assert.equal(rows(e)[0].querySelector(".bgw-step").dataset.kind, "run");
  structPool.delete(e.name);
});

test("an mcp call says which server it left the box for", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  const step = svSubCall(e, "t1", { id: "c1", name: "mcp__slack__send_dm", input: { text: "oi" } });
  assert.equal(step.face, "mcp");
  assert.equal(step.text, "slack send_dm oi");
  structPool.delete(e.name);
});

test("a call is open until its result lands, and then it is ticked", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  const step = svSubCall(e, "t1", { id: "c1", name: "Read", input: { file_path: "/tmp/x.ts" } });
  assert.equal(step.open, true);
  svSubLanded(e, "t1", "c1", false);
  assert.equal(step.open, false);
  assert.equal(step.landed, true);
  assert.equal(step.bad, false);
  assert.ok(!rows(e)[0].querySelector(".bgw-step").classList.contains("bad"));
  structPool.delete(e.name);
});

test("a call that came back an error says so instead of pretending it landed", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  const step = svSubCall(e, "t1", { id: "c1", name: "Read", input: { file_path: "/tmp/x.ts" } });
  svSubLanded(e, "t1", "c1", true);
  assert.equal(step.bad, true);
  assert.ok(rows(e)[0].querySelector(".bgw-step").classList.contains("bad"));
  structPool.delete(e.name);
});

test("a result for a call nobody logged is not an event", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  svSubCall(e, "t1", { id: "c1", name: "Read", input: { file_path: "/tmp/x.ts" } });
  svSubLanded(e, "t1", "whatever", false);
  svSubLanded(e, "t1", "", false);
  assert.equal(steps(e, "t1").length, 1);
  structPool.delete(e.name);
});

test("only the last step is the one it is on", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  const first = svSubEcho(e, "t1", "one");
  const second = svSubEcho(e, "t1", "two");
  assert.equal(first.now, false);
  assert.equal(second.now, true);
  structPool.delete(e.name);
});

test("a long run drops its oldest steps instead of growing without end", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "short" }));
  for (let i = 0; i < SUB_LOG_MAX + 5; i += 1) svSubEcho(e, "t1", `step ${i}`);
  const all = steps(e, "t1");
  assert.equal(all.length, SUB_LOG_MAX);
  assert.equal(all[0], "step 5");
  structPool.delete(e.name);
});

test("steps of a run that was never pinned go nowhere", () => {
  const e = seat();
  assert.equal(svSubEcho(e, "ghost", "talking to nobody"), null);
  assert.equal(svSubCall(e, "ghost", { id: "c1", name: "Bash", input: {} }), null);
  structPool.delete(e.name);
});

test("a landed subagent leaves the dock — the chat card is the only place it lives now", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubUnpin(e, "t1");
  assert.equal(pinned(e), 0);
  assert.equal(e.subs.size, 0);
  assert.equal(rows(e).length, 0);
  assert.equal(line(e), null);
  structPool.delete(e.name);
});

test("unpinning a subagent nobody pinned is not an event", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubUnpin(e, "whatever");
  assert.equal(pinned(e), 1);
  structPool.delete(e.name);
});

test("two runs at once stack, and each leaves on its own", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubPin(e, call("t2", { description: "two" }));
  assert.equal(pinned(e), 2);
  svSubUnpin(e, "t1");
  assert.equal(pinned(e), 1);
  assert.equal(item(e, "t2").arg, "two");
  assert.equal(rows(e).length, 1);
  structPool.delete(e.name);
});

test("the launch metadata of a background agent is a start, not an answer", () => {
  assert.ok(ASYNC_LAUNCH.test("Async agent launched successfully. (This tool result is internal"));
  assert.ok(!ASYNC_LAUNCH.test("Confirmed: the crop calls omit aspect_ratio"));
});

test("a background run is marked as one", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  assert.equal(item(e, "t1").dataset.bg, "");
  svSubAsync(e, "t1");
  assert.equal(item(e, "t1").dataset.bg, "1");
  structPool.delete(e.name);
});

test("the clock of a pin is the clock of the launch, so a reload does not restart it", () => {
  const at = Date.now() - 90000;
  const e = seat(at);
  svSubPin(e, call("t1", { description: "one" }));
  assert.equal(item(e, "t1").dataset.t0, String(at));
  assert.equal(line(e).t0, at);
  structPool.delete(e.name);
});

test("a launch old enough to be a ghost of a dead seat is not pinned at all", () => {
  const e = seat(Date.now() - SUB_STALE - 1000);
  assert.equal(svSubPin(e, call("t1", { description: "last week" })), null);
  assert.equal(pinned(e), 0);
  structPool.delete(e.name);
});

const started = (toolId, taskId, extra = {}) => ({ type: "system", subtype: "task_started", task_id: taskId, tool_use_id: toolId, task_type: "local_agent", ...extra });

test("the launch of a background task tells the pin which task it is", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubTask(e, started("t1", "task-a"));
  assert.equal(item(e, "t1").dataset.task, "task-a");
  structPool.delete(e.name);
});

test("the notification that the task landed takes the pin down", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubTask(e, started("t1", "task-a"));
  svSubTask(e, { type: "system", subtype: "task_notification", task_id: "task-a", tool_use_id: "t1", status: "completed", summary: "69 itens" });
  assert.equal(pinned(e), 0);
  structPool.delete(e.name);
});

test("a task that failed or was killed is just as over as one that completed", () => {
  for (const status of ["failed", "cancelled", "killed", "stopped", "timed_out"]) {
    const e = seat();
    svSubPin(e, call("t1", { description: "one" }));
    svSubTask(e, { type: "system", subtype: "task_notification", tool_use_id: "t1", status });
    assert.equal(pinned(e), 0, status);
    structPool.delete(e.name);
  }
});

test("a task still running is not a reason to take anything down", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubTask(e, { type: "system", subtype: "task_notification", tool_use_id: "t1", status: "running" });
  svSubTask(e, { type: "system", subtype: "task_updated", task_id: "task-a", patch: { status: "running" } });
  assert.equal(pinned(e), 1);
  structPool.delete(e.name);
});

test("the patch that closes a task closes the pin, which the patch only knows by task id", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubTask(e, started("t1", "task-a"));
  svSubTask(e, { type: "system", subtype: "task_updated", task_id: "task-a", patch: { status: "completed", end_time: 1 } });
  assert.equal(pinned(e), 0);
  structPool.delete(e.name);
});

test("the list of what is still alive drops the pins that are not on it", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubPin(e, call("t2", { description: "two" }));
  svSubTask(e, started("t1", "task-a"));
  svSubTask(e, started("t2", "task-b"));
  svSubTask(e, { type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "task-b", task_type: "local_agent" }] });
  assert.equal(pinned(e), 1);
  assert.equal(item(e, "t2").dataset.task, "task-b");
  structPool.delete(e.name);
});

test("a pin that does not know its task yet survives a list that cannot be about it", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "first" }));
  svSubPin(e, call("t2", { description: "second, still being registered" }));
  svSubTask(e, started("t1", "task-a"));
  svSubTask(e, { type: "system", subtype: "background_tasks_changed", tasks: [{ task_id: "task-a" }] });
  assert.equal(pinned(e), 2);
  structPool.delete(e.name);
});

test("the task events of a background bash are not about any pin", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubTask(e, started("t1", "task-a"));
  svSubTask(e, { type: "system", subtype: "task_notification", task_id: "task-z", tool_use_id: "tBash", status: "completed" });
  assert.equal(pinned(e), 1);
  structPool.delete(e.name);
});

test("a seat with nothing pinned does not care about tasks at all", () => {
  const e = seat();
  assert.doesNotThrow(() => svSubTask(e, { type: "system", subtype: "background_tasks_changed", tasks: [] }));
  assert.equal(pinned(e), 0);
  structPool.delete(e.name);
});

test("painting a seat that is not on screen is not an error", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  assert.doesNotThrow(() => paintSubs(e));
  structPool.delete(e.name);
});

test("a chat whose process starts again keeps no pin of a task that died with the old one", () => {
  const e = seat();
  svSubPin(e, call("t1", { description: "one" }));
  svSubPin(e, call("t2", { description: "two" }));
  svSubTask(e, started("t1", "task-a"));
  svSubsOfAnEndedProcess(e);
  assert.equal(pinned(e), 0);
  structPool.delete(e.name);
});

function backgroundAgent(e, id) {
  svSubPin(e, call(id, { description: "screens" }));
  svSubAsync(e, id);
  svSubTask(e, started(id, `task-${id}`));
}

test("a message sent while a background agent runs keeps it on the line", () => {
  const e = seat();
  e.driverDequeues = true;
  backgroundAgent(e, "t1");
  svEvent(e, { type: "result" });
  svEvent(e, { type: "system", subtype: "init" });
  assert.equal(pinned(e), 1);
  assert.ok(line(e));
  structPool.delete(e.name);
});

for (const subtype of ["started", "slept"]) {
  test(`a driver that reports ${subtype} takes down the pins of the process that is gone`, () => {
    const e = seat();
    backgroundAgent(e, "t1");
    svEvent(e, { type: "driver", subtype });
    assert.equal(pinned(e), 0);
    structPool.delete(e.name);
  });
}
