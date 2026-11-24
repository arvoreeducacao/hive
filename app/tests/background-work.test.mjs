import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

await views();

const st = await state();
const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvFlushAll, svConvSeed, svConvTool } = await app("conversation-model");
const { svSubEcho, svSubPin, svSubTask, svSubsOfAnEndedProcess } = await app("subagents-dock");
const { structPool } = await app("structured-seats");
const { backgroundWorkItems, backgroundWorkLine, taskKind } = await app("background-work");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let made = 0;

function pane() {
  const name = `bgw-${++made}`;
  const e = getStructured({ name, where: "local" });
  e.at = Date.now();
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  st.data = { ...(st.data || {}), sessions: [{ name, where: "local", title: "Background work" }] };
  return e;
}

function shut(e) {
  e.bgDialog?.close();
  e.convView.dispose();
  structPool.delete(e.name);
}

function wire(e, answer = { ok: true }) {
  const sent = [];
  e.ws = {
    readyState: 1,
    send(raw) {
      const cmd = JSON.parse(raw);
      sent.push(cmd);
      queueMicrotask(() => e.pending.get(cmd.cid)?.(answer));
    }
  };
  return sent;
}

const settle = async () => { for (let hop = 0; hop < 6; hop++) await new Promise((done) => setTimeout(done, 5)); };
const started = (taskId, toolUseId, taskType = "local_bash") => ({ type: "system", subtype: "task_started", task_id: taskId, tool_use_id: toolUseId, task_type: taskType, description: "x" });
const living = (...tasks) => ({ type: "system", subtype: "background_tasks_changed", tasks });
const bash = (e, id, command) => svConvTool(e, { id, name: "Bash", input: { command, run_in_background: true } }, true);
const shownLine = (e) => (svConvFlushAll(), e.scroll.querySelector('.tl-status[data-status="bg"]'));
const opener = (row) => row.querySelector(".tl-status-open");
const stopper = (row) => row.querySelector('.tl-status-icon[data-act="bg-stop"]');

test("each kind of task the agent reports lands in one of four families", () => {
  assert.equal(taskKind("local_agent"), "subagent");
  assert.equal(taskKind("remote_agent"), "subagent");
  assert.equal(taskKind("local_bash"), "command");
  assert.equal(taskKind("monitor_mcp"), "monitor");
  assert.equal(taskKind("local_workflow"), "background_task");
  assert.equal(taskKind(undefined), "background_task");
});

test("a command that runs in the foreground never shows on the line", () => {
  const e = pane();
  svSubTask(e, started("b1", "tool-1"));
  assert.deepEqual(backgroundWorkItems(e), []);
  assert.equal(backgroundWorkLine(e), null);
  shut(e);
});

test("a command sent to the background is one line, named by what it does, with its own clock", () => {
  const e = pane();
  bash(e, "tool-1", "npm run dev");
  svSubTask(e, started("b1", "tool-1"));
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "Start the dev server" }));
  const line = backgroundWorkLine(e);
  assert.equal(line.label, "Running · Start the dev server");
  assert.equal(line.icon, "terminal");
  assert.ok(line.t0 > 0);
  assert.equal(backgroundWorkItems(e)[0].command, "npm run dev");
  const row = shownLine(e);
  assert.ok(row, "the line sits at the end of the timeline");
  assert.equal(opener(row).textContent.trim(), "Running · Start the dev server");
  assert.match(opener(row).title, /^Details · running for \d+s$/, "the clock lives in the tip, not on the line");
  assert.equal(stopper(row).getAttribute("aria-label"), "Stop background work");
  assert.equal(stopper(row).textContent, "", "stop is an icon, not a word");
  assert.equal(row.querySelector(".tl-status-for"), null);
  shut(e);
});

test("several at once are counted by family, and the newest activity is the detail", () => {
  const e = pane();
  svSubPin(e, { id: "a1", name: "Agent", input: { subagent_type: "Explore", description: "map the repo" } });
  svSubPin(e, { id: "a2", name: "Agent", input: { subagent_type: "Explore", description: "read the tests" } });
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "Watch the build" }));
  e.at = 1000;
  svSubEcho(e, "a1", "reading src/app");
  e.at = 2000;
  svSubEcho(e, "a2", "found 12 files");
  const line = backgroundWorkLine(e);
  assert.equal(line.label, "Waiting on 2 subagents and 1 command");
  assert.equal(line.detail, "read the tests: found 12 files");
  assert.equal(line.icon, "working");
  assert.equal(line.t0, 0, "the clock is only for a line about one thing");
  shut(e);
});

test("a subagent the dock already holds is not counted twice when the list names it", () => {
  const e = pane();
  svSubPin(e, { id: "a1", name: "Agent", input: { subagent_type: "Explore", description: "map the repo" } });
  svSubTask(e, started("t-a", "a1", "local_agent"));
  svSubTask(e, living({ task_id: "t-a", task_type: "local_agent", description: "map the repo" }));
  assert.equal(backgroundWorkItems(e).length, 1);
  assert.equal(backgroundWorkLine(e).label, "Waiting · map the repo");
  shut(e);
});

test("the line goes away when the task lands, and when the process that ran it is gone", () => {
  const e = pane();
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "one" }));
  svSubTask(e, { type: "system", subtype: "task_notification", task_id: "b1", status: "completed" });
  assert.equal(backgroundWorkLine(e), null);
  svSubTask(e, living({ task_id: "b2", task_type: "local_bash", description: "two" }));
  svSubsOfAnEndedProcess(e);
  assert.equal(backgroundWorkLine(e), null);
  shut(e);
});

test("a list from a dead seat hours ago is not shown as running now", () => {
  const e = pane();
  e.at = Date.now() - 7 * 60 * 60 * 1000;
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "old" }));
  assert.equal(backgroundWorkLine(e), null);
  shut(e);
});

test("while a turn runs, Stop belongs to the composer and the line's Stop waits", () => {
  const e = pane();
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "one" }));
  e.turnOpen = true;
  assert.equal(backgroundWorkLine(e).actions[0].disabled, true);
  e.turnOpen = false;
  assert.equal(backgroundWorkLine(e).actions[0].disabled, false);
  e.mirror = { owner: "someone" };
  assert.equal(backgroundWorkLine(e).actions[0].disabled, true, "a mirrored chat is not ours to stop");
  shut(e);
});

test("Stop asks the driver to stop every task on the line, and says so while it waits", async () => {
  const e = pane();
  const sent = wire(e);
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "one" }, { task_id: "b2", task_type: "local_bash", description: "two" }));
  stopper(shownLine(e)).click();
  await settle();
  assert.deepEqual(sent.map((one) => one.type), ["stop_task"]);
  assert.deepEqual(sent[0].task_ids, ["b1", "b2"]);
  const again = stopper(shownLine(e));
  assert.equal(again.getAttribute("aria-label"), "Stopping…");
  assert.equal(again.disabled, true);
  svSubTask(e, living());
  assert.equal(shownLine(e), null);
  assert.equal(e.bgStopping, 0);
  shut(e);
});

test("a Stop the driver refuses says why in the chat and lets the person try again", async () => {
  const e = pane();
  wire(e, { ok: false, error: "the seat was asleep — there was no background work to stop" });
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "one" }));
  stopper(shownLine(e)).click();
  await settle();
  assert.equal(e.bgStopping, 0);
  assert.ok(e.conv.blocks.some((one) => one.cls === "sv-meta warn" && /asleep/.test(one.text)));
  shut(e);
});

test("Details opens a dialog with each task, its state and its command, and closes when the work ends", () => {
  const e = pane();
  bash(e, "tool-1", "python3 audit.py -j 6\n> scratch/audit.log 2>&1");
  svSubTask(e, started("b1", "tool-1"));
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "Audit" }));
  svSubPin(e, { id: "a1", name: "Agent", input: { subagent_type: "Explore", description: "map the repo" } });
  svSubEcho(e, "a1", "reading src/app");
  opener(shownLine(e)).click();
  const dialog = e.bgDialog;
  assert.ok(dialog?.open);
  assert.equal(dialog.querySelector(".bgw-title").textContent, "Background work");
  const items = [...dialog.querySelectorAll(".bgw-item")];
  assert.deepEqual(items.map((one) => one.querySelector(".bgw-name").textContent), ["map the repo", "Audit"]);
  assert.deepEqual(items.map((one) => one.querySelector(".bgw-state").getAttribute("aria-label").split(" · ")[0]), ["Waiting", "Running"]);
  assert.equal(items[0].querySelector(".bgw-state").textContent, "", "the state is a mark with a tip, not a word");
  assert.equal(items[0].querySelector(".bgw-name").title, "Explore", "the subagent type is in the tip");
  assert.equal(items[1].querySelector(".bgw-cmd").textContent, "python3 audit.py -j 6\n> scratch/audit.log 2>&1");
  assert.equal(items[0].querySelector(".bgw-current .bgw-text").textContent, "reading src/app");
  assert.ok(document.activeElement === dialog.querySelector(".bgw-close"), "the focus starts on the close button");
  svSubTask(e, { type: "system", subtype: "task_notification", task_id: "b1", status: "completed" });
  assert.equal(dialog.querySelectorAll(".bgw-item").length, 1, "the dialog follows the line");
  svSubsOfAnEndedProcess(e);
  assert.equal(dialog.open, false);
  assert.equal(e.bgDialog, null);
  shut(e);
});

test("a command named only by its own text is titled Command in the dialog", () => {
  const e = pane();
  bash(e, "tool-1", "sleep 60");
  svSubTask(e, started("b1", "tool-1"));
  svSubTask(e, living({ task_id: "b1", task_type: "local_bash", description: "" }));
  assert.equal(backgroundWorkLine(e).label, "Running · sleep 60");
  opener(shownLine(e)).click();
  assert.equal(e.bgDialog.querySelector(".bgw-name").textContent, "Command");
  e.bgDialog.querySelector(".bgw-close").click();
  assert.equal(e.bgDialog, null);
  shut(e);
});

test("a subagent with a long run shows the step it is on, and the earlier ones one click away", () => {
  const e = pane();
  svSubPin(e, { id: "a1", name: "Agent", input: { subagent_type: "Explore", description: "map the repo" } });
  svSubEcho(e, "a1", "listing the routes");
  svSubEcho(e, "a1", "reading src/app");
  svSubEcho(e, "a1", "found 14 screens");
  opener(shownLine(e)).click();
  const run = e.bgDialog.querySelector(".bgw-run");
  assert.equal(run.open, false);
  assert.equal(run.querySelector("summary .bgw-current .bgw-text").textContent, "found 14 screens");
  assert.deepEqual([...run.querySelectorAll(".bgw-steps .bgw-text")].map((one) => one.textContent), ["listing the routes", "reading src/app"]);
  run.open = true;
  run.dispatchEvent(new window.Event("toggle"));
  svSubEcho(e, "a1", "reading the reader page");
  assert.equal(e.bgDialog.querySelector(".bgw-run").open, true, "a run the person opened stays open while new steps arrive");
  shut(e);
});

