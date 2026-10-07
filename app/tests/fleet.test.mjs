import { test } from "node:test";
import assert from "node:assert";
import { fleetPlan, ownsFleet, seatIsRestorable, localRestoreScript, REVIVE_WINDOW, archiveEntry, seatFromArchive, archiveOrder, GAVE_UP_DIED_AGAIN, GAVE_UP_NOTHING_TO_RESUME, TUI_CONTINUES, withoutTheLiving, HELD_STILL_ANSWERS, settleSpawnJobs, forgetSpawnJobsOf, JOB_LINGERS_MS, JOB_ABANDONED_MS } from "../lib/fleet.mjs";

const chat = (over = {}) => ({
  name: "acq-front",
  where: "local",
  id: "3f1c9a2e-1111-4222-8333-444455556666",
  kind: "chat",
  cwd: "/home/dev/Arvore/arvore-hub",
  model: "",
  account: "",
  ...over
});

test("the hive of the machine drives the fleet", () => {
  assert.strictEqual(ownsFleet({}), true);
  assert.strictEqual(ownsFleet({ owns: "1" }), true);
});

test("a sandbox hive reads the fleet but never drives it", () => {
  assert.strictEqual(ownsFleet({ sandbox: true }), false);
  assert.strictEqual(ownsFleet({ owns: "1", sandbox: true }), false);
});

test("a hive told not to own the fleet does not own it", () => {
  assert.strictEqual(ownsFleet({ owns: "0" }), false);
});

test("a dead tmux server means every restorable seat comes back", () => {
  const seats = [chat(), chat({ name: "shipping", where: "cloud", cwd: "/workspace/worktrees/arvore-hub/shipping" })];
  const plan = fleetPlan(seats, false, []);
  assert.strictEqual(plan.restore.length, 2);
  assert.strictEqual(plan.prune.length, 0);
});

test("a window that died on its own comes back once, with the session still alive", () => {
  const seats = [chat(), chat({ name: "gone" })];
  const plan = fleetPlan(seats, true, ["acq-front", "hub"], 1000);
  assert.deepStrictEqual(plan.restore.map((s) => s.name), ["gone"]);
  assert.strictEqual(plan.prune.length, 0);
});

test("a seat that dies again right after being revived is left dead, and says why", () => {
  const now = 10 * REVIVE_WINDOW;
  const seats = [chat({ name: "gone", revivedAt: now - 60000 })];
  const plan = fleetPlan(seats, true, ["hub"], now);
  assert.strictEqual(plan.restore.length, 0);
  assert.deepStrictEqual(plan.prune.map((one) => one.seat.name), ["gone"]);
  assert.strictEqual(plan.prune[0].why, GAVE_UP_DIED_AGAIN);
});

test("a seat revived long ago is a fresh death and comes back", () => {
  const now = 10 * REVIVE_WINDOW;
  const seats = [chat({ name: "gone", revivedAt: now - REVIVE_WINDOW - 1 })];
  const plan = fleetPlan(seats, true, ["hub"], now);
  assert.deepStrictEqual(plan.restore.map((s) => s.name), ["gone"]);
  assert.strictEqual(plan.prune.length, 0);
});

test("a seat killed from the app is out of the fleet, so no plan brings it back", () => {
  const seats = [chat()];
  const plan = fleetPlan(seats, true, ["acq-front", "hub"], 1000);
  assert.strictEqual(plan.restore.length, 0);
  assert.strictEqual(plan.prune.length, 0);
});

test("a gone seat that cannot be restored is pruned instead, and says why", () => {
  const plan = fleetPlan([chat({ name: "gone", id: "" })], true, ["hub"], 1000);
  assert.strictEqual(plan.restore.length, 0);
  assert.deepStrictEqual(plan.prune.map((one) => one.seat.name), ["gone"]);
  assert.strictEqual(plan.prune[0].why, GAVE_UP_NOTHING_TO_RESUME);
});

test("every seat we give up on carries a reason — the archive is the only trace left", () => {
  const now = 10 * REVIVE_WINDOW;
  const plan = fleetPlan(
    [chat({ name: "no-id", id: "" }), chat({ name: "twice", revivedAt: now - 60000 })],
    true, ["hub"], now);
  assert.strictEqual(plan.prune.length, 2);
  for (const one of plan.prune) assert.ok(one.why, `${one.seat.name} was dropped without a reason`);
});

test("the reason travels into the archive entry, and does not come back out with the seat", () => {
  const entry = archiveEntry(chat({ name: "twice" }), 1700, GAVE_UP_DIED_AGAIN);
  assert.strictEqual(entry.why, GAVE_UP_DIED_AGAIN);
  assert.strictEqual(entry.archivedAt, 1700);
  const back = seatFromArchive(entry);
  assert.strictEqual(back.why, undefined);
  assert.strictEqual(back.archivedAt, undefined);
  assert.strictEqual(back.name, "twice");
});

test("a chat without a session id is not restorable, a shell is", () => {
  assert.strictEqual(seatIsRestorable(chat({ id: "" })), false);
  assert.strictEqual(seatIsRestorable({ name: "term", where: "local", kind: "shell" }), true);
  const plan = fleetPlan([chat({ id: "" })], false, []);
  assert.strictEqual(plan.restore.length, 0);
});

test("a seat with shell metacharacters never reaches a script", () => {
  assert.strictEqual(seatIsRestorable(chat({ cwd: "/tmp; rm -rf /" })), false);
  assert.strictEqual(seatIsRestorable(chat({ account: "a$(id)" })), false);
  assert.strictEqual(seatIsRestorable(chat({ name: "x;y" })), false);
  assert.strictEqual(seatIsRestorable(chat({ model: "opus`id`" })), false);
});

test("the local script resumes the id in the seat's cwd with its account", () => {
  const script = localRestoreScript(
    [chat({ account: "extra", model: "opus" })],
    { hub: "/home/dev/Arvore/arvore-hub", hiveHome: "/home/dev/.hive", shell: "zsh" }
  );
  assert.match(script, /tmux new-session -d -s hive-local -n hub/);
  assert.match(script, /new-window -d -t hive-local -n acq-front/);
  assert.match(script, /claude --resume 3f1c9a2e-1111-4222-8333-444455556666/);
  assert.match(script, /CLAUDE_CONFIG_DIR=\/home\/dev\/\.hive\/accounts\/extra /);
  assert.match(script, /--model opus/);
  assert.match(script, /--remote-control acq-front/);
});

test("the local script honours the remote-control switch and restores shells", () => {
  const script = localRestoreScript(
    [{ name: "term", where: "local", kind: "shell", cwd: "/home/dev/Arvore/arvore-hub" }],
    { hub: "/home/dev/Arvore/arvore-hub", hiveHome: "/home/dev/.hive", shell: "zsh", remoteControl: false }
  );
  assert.match(script, /ZDOTDIR=\/home\/dev\/\.hive\/shell\/zsh exec zsh -l/);
  assert.match(script, /exec zsh -l/);
  assert.doesNotMatch(script, /--remote-control/);
  assert.doesNotMatch(script, /claude --resume/);
  assert.match(script, /set-window-option -t "hive-local:=term" remain-on-exit on/,
    "a shell window that vanishes on exit cannot tell the app it ended, and the fleet would bring it back");
});

test("only a shell keeps its window after it ends — a chat's window goes with the agent", () => {
  const script = localRestoreScript(
    [{ name: "chat", where: "local", kind: "chat", id: "9f1c2ab3-0000-4000-8000-000000000000", cwd: "/home/dev/hub" }],
    { hub: "/home/dev/hub", hiveHome: "/home/dev/.hive" }
  );
  assert.doesNotMatch(script, /remain-on-exit/);
});

test("a structured seat restores through the driver", () => {
  const seat = { name: "estruturado", where: "local", kind: "structured", id: "abcd1234-0000-0000-0000-000000000000", cwd: "/tmp/hub", model: "sonnet" };
  assert.ok(seatIsRestorable(seat));
  const local = localRestoreScript([seat], { hub: "/tmp/hub", hiveHome: "/tmp/hive", engineDir: "/tmp/drv" });
  assert.ok(local.includes("/tmp/drv/driver.mjs"));
  assert.ok(local.includes("--resume-id abcd1234-0000-0000-0000-000000000000"));
  assert.ok(local.includes("HIVE_STATE_DIR=/tmp/hive"));
  assert.ok(!local.includes("claude --resume"));
});

test("a seat on another agent restores through its own driver, resuming the session that agent named", () => {
  const drivers = { opencode: "opencode-driver.mjs", codex: "codex-driver.mjs", kimi: "kimi-driver.mjs", kiro: "kiro-driver.mjs", cursor: "cursor-driver.mjs" };
  for (const [agent, driver] of Object.entries(drivers)) {
    const seat = { name: agent, where: "local", kind: "structured", agent, id: agent === "kimi" ? "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9" : "abcd1234-0000-0000-0000-000000000000", cwd: "/tmp/hub", model: "" };
    assert.ok(seatIsRestorable(seat), `${agent} seat is not restorable`);
    const local = localRestoreScript([seat], { hub: "/tmp/hub", hiveHome: "/tmp/hive", engineDir: "/tmp/drv", autocompact: "200k" });
    assert.ok(local.includes(`/tmp/drv/${driver} --agent ${agent} --name ${agent}`), `${agent} came back through ${local}`);
    assert.ok(local.includes(`--resume-id ${seat.id}`), `${agent} came back without its session`);
    assert.ok(local.includes("--autocompact 200k"), `${agent} lost the ceiling on the way back`);
    assert.ok(!local.includes("turn-driver.mjs"), `${agent} was downgraded to the turn driver`);
  }
});

test("a session id with shell metacharacters never reaches a script, whatever agent named it", () => {
  assert.strictEqual(seatIsRestorable({ name: "k", where: "local", kind: "structured", agent: "kimi", id: "session_$(id)" }), false);
  assert.strictEqual(seatIsRestorable({ name: "k", where: "local", kind: "structured", agent: "kimi", id: "" }), false);
  assert.strictEqual(seatIsRestorable(chat({ kind: "structured", id: "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9" })), false, "claude resumes only a transcript id");
});

test("a claude seat with the agent recorded still uses the claude driver", () => {
  const seat = { name: "cl", where: "local", kind: "structured", agent: "claude", id: "abcd1234-0000-0000-0000-000000000000", cwd: "/tmp/hub" };
  const local = localRestoreScript([seat], { hub: "/tmp/hub", hiveHome: "/tmp/hive", engineDir: "/tmp/drv" });
  assert.ok(local.includes("/tmp/drv/driver.mjs"));
  assert.ok(local.includes("--resume-id"));
});

test("a terminal on another agent comes back on that CLI's own continue, and a crooked agent never reaches a script", () => {
  for (const agent of Object.keys(TUI_CONTINUES)) {
    const seat = chat({ name: `${agent}-tui`, agent, id: "" });
    assert.strictEqual(seatIsRestorable(seat), true, `${agent} terminal is not restorable`);
    const script = localRestoreScript([seat], { hub: "/hub", hiveHome: "/home/dev/.hive", autocompact: "200k" });
    assert.ok(script.includes(TUI_CONTINUES[agent]), `${agent} terminal did not continue its last session`);
    assert.ok(script.includes(`HIVE_SEAT=${agent}-tui HIVE_SIDE=local HIVE_STATE_DIR=/home/dev/.hive`), `${agent} terminal came back without knowing its seat`);
    assert.ok(!script.includes("claude --resume"));
    assert.ok(!script.includes("--autocompact"), "a terminal on another agent has no ceiling flag to take");
  }
  const kimi = localRestoreScript([chat({ agent: "kimi", model: "kimi-code/k3" })], { hub: "/hub", hiveHome: "/home/dev/.hive" });
  assert.ok(kimi.includes("kimi -c --yolo --model 'kimi-code/k3'"));
  assert.strictEqual(seatIsRestorable(chat({ agent: "pi" })), false, "a terminal on an agent with no continue command cannot come back");
  assert.strictEqual(seatIsRestorable(chat({ kind: "structured", agent: "x;y" })), false);
  assert.strictEqual(seatIsRestorable(chat({ agent: "claude" })), true);
});

test("an archived seat is the fleet record plus the day it stopped, and it comes back whole", () => {
  const seat = { name: "kardex", where: "local", kind: "structured", agent: "claude", id: "abcd1234-0000-0000-0000-000000000000", cwd: "/tmp/hub", model: "opus[1m]", account: "work", revivedAt: 111 };
  const parked = archiveEntry(seat, 900);
  assert.equal(parked.archivedAt, 900);
  assert.equal(parked.revivedAt, undefined, "the archived record kept a restart mark that only means something while it runs");
  for (const field of ["name", "where", "kind", "agent", "id", "cwd", "model", "account"]) {
    assert.equal(parked[field], seat[field], `${field} did not survive the archive, so the seat comes back as someone else`);
  }
  const back = seatFromArchive(parked);
  assert.equal(back.archivedAt, undefined);
  assert.ok(seatIsRestorable(back), "an archived seat stopped being restorable, which makes the archive a grave");
});

test("a shell seat archives too, and it has no session id to lose", () => {
  const seat = { name: "term", where: "local", kind: "shell", cwd: "/tmp/hub" };
  const back = seatFromArchive(archiveEntry(seat, 5));
  assert.ok(seatIsRestorable(back));
  assert.equal(back.kind, "shell");
});

test("the archive shows the newest first, because that is the one being looked for", () => {
  const list = archiveOrder([
    { name: "old", archivedAt: 10 },
    { name: "new", archivedAt: 300 },
    { name: "mid", archivedAt: 200 },
    { name: "undated" }
  ]);
  assert.deepEqual(list.map((s) => s.name), ["new", "mid", "old", "undated"]);
});

test("archiveOrder does not reorder the list it was handed", () => {
  const given = [{ name: "a", archivedAt: 1 }, { name: "b", archivedAt: 9 }];
  archiveOrder(given);
  assert.deepEqual(given.map((s) => s.name), ["a", "b"], "sorting in place would shuffle the map the server holds");
});

test("a seat comes back without a compaction ceiling when the person set none", () => {
  const script = localRestoreScript([chat()], { hub: "/hub", hiveHome: "/home/dev/.hive" });
  assert.ok(script.includes("claude --resume"));
  assert.ok(!script.includes("--autocompact"));
});

test("the ceiling the person chose rides along on every seat that comes back", () => {
  const seats = [chat(), chat({ name: "shipping", kind: "structured" })];
  const local = localRestoreScript(seats, { hub: "/hub", hiveHome: "/home/dev/.hive", autocompact: "200k" });
  assert.ok(local.includes("claude --resume 3f1c9a2e-1111-4222-8333-444455556666 --dangerously-skip-permissions --remote-control acq-front --autocompact 200k"));
  assert.ok(local.includes("driver.mjs --name shipping --cwd \\$PWD --resume-id 3f1c9a2e-1111-4222-8333-444455556666 --autocompact 200k"));
});

test("a shell seat never takes the ceiling, a native seat on another agent does", () => {
  const shell = localRestoreScript([chat({ name: "term", kind: "shell" })], { hub: "/hub", hiveHome: "/home/dev/.hive", autocompact: "200k" });
  assert.ok(!shell.includes("--autocompact"));
  const codex = localRestoreScript([chat({ name: "codex", kind: "structured", agent: "codex" })], { hub: "/hub", hiveHome: "/home/dev/.hive", autocompact: "200k" });
  assert.ok(codex.includes("codex-driver.mjs --agent codex --name codex --cwd \\$PWD --resume-id 3f1c9a2e-1111-4222-8333-444455556666 --autocompact 200k"));
});

test("a seat on another agent comes back inside the login it ran on, in that agent's own variable", () => {
  const script = localRestoreScript(
    [
      chat({ name: "cx", agent: "codex", kind: "structured", account: "extra" }),
      chat({ name: "kr", agent: "kiro", kind: "chat", account: "team" }),
      chat({ name: "km", agent: "kimi", kind: "chat", account: "" }),
    ],
    { hub: "/home/dev/Arvore/arvore-hub", hiveHome: "/home/dev/.hive", shell: "zsh", engineDir: "/eng" }
  );
  assert.match(script, /CODEX_HOME=\/home\/dev\/\.hive\/providers\/codex\/accounts\/extra HIVE_STATE_DIR=\/home\/dev\/\.hive node \/eng\/codex-driver\.mjs/);
  assert.match(script, /XDG_DATA_HOME=\/home\/dev\/\.hive\/providers\/kiro\/accounts\/team\/share HIVE_SEAT=kr HIVE_SIDE=local/);
  assert.doesNotMatch(script, /KIMI_CODE_HOME=/, "the login everybody starts with sets no variable");
  assert.doesNotMatch(script, /CLAUDE_CONFIG_DIR=/, "a codex login never reaches claude's variable");
});

import { join } from "node:path";
import { localRestorePlan } from "../lib/fleet.mjs";

test("the restore plan says what to run for each seat without a shell in between", () => {
  const plan = localRestorePlan(
    [chat({ account: "extra", model: "opus" }), { name: "term", where: "local", kind: "shell", cwd: "/home/dev/Arvore/arvore-hub" }],
    { hub: "/home/dev/Arvore/arvore-hub", hiveHome: "/home/dev/.hive", autocompact: "80" }
  );
  assert.equal(plan[0].program, "claude");
  assert.deepEqual(plan[0].args, ["--resume", "3f1c9a2e-1111-4222-8333-444455556666", "--dangerously-skip-permissions", "--remote-control", "acq-front", "--model", "opus", "--autocompact", "80"]);
  assert.equal(plan[0].env.CLAUDE_CONFIG_DIR, join("/home/dev/.hive", "accounts", "extra"));
  assert.equal(plan[0].env.FORCE_HYPERLINK, "1");
  assert.equal(plan[1].program, "shell");
  assert.equal(plan[1].cwd, "/home/dev/Arvore/arvore-hub");
  assert.doesNotMatch(localRestorePlan([chat()], { hub: "/h", hiveHome: "/i", remoteControl: false })[0].args.join(" "), /--remote-control/);
});

test("a structured seat in the plan runs its driver under node with the cwd spelled out", () => {
  const seat = { name: "estruturado", where: "local", kind: "structured", id: "abcd1234-0000-0000-0000-000000000000", cwd: "/tmp/w", model: "sonnet" };
  const [one] = localRestorePlan([seat], { hub: "/tmp/hub", hiveHome: "/tmp/hive", engineDir: "/tmp/drv", autocompact: "80" });
  assert.equal(one.program, "node");
  assert.deepEqual(one.args, [join("/tmp/drv", "driver.mjs"), "--name", "estruturado", "--cwd", "/tmp/w", "--resume-id", seat.id, "--model", "sonnet", "--autocompact", "80"]);
  assert.equal(one.env.HIVE_STATE_DIR, "/tmp/hive");
  const [oc] = localRestorePlan([{ ...seat, agent: "opencode" }], { hub: "/tmp/hub", hiveHome: "/tmp/hive", engineDir: "/tmp/drv", autocompact: "80" });
  assert.deepEqual(oc.args, [join("/tmp/drv", "opencode-driver.mjs"), "--agent", "opencode", "--name", "estruturado", "--cwd", "/tmp/w", "--resume-id", seat.id, "--model", "sonnet", "--autocompact", "80"]);
});

test("a terminal on another agent comes back through that agent's own continue, with its login and the seat's name", () => {
  const seat = { name: "cx", where: "local", kind: "chat", agent: "codex", id: "session_abcdef12", cwd: "/tmp/w", account: "work", model: "o3" };
  assert.ok(seatIsRestorable(seat));
  const [one] = localRestorePlan([seat], { hub: "/tmp/hub", hiveHome: "/tmp/hive" });
  assert.equal(one.program, "codex");
  assert.deepEqual(one.args, ["resume", "--last", "--dangerously-bypass-approvals-and-sandbox", "--model", "o3"]);
  assert.equal(one.env.HIVE_SEAT, "cx");
  assert.equal(one.env.HIVE_STATE_DIR, "/tmp/hive");
  assert.match(one.env.CODEX_HOME, /work$/);
  assert.equal(one.env.CLAUDE_CONFIG_DIR, undefined);
});

test("a seat that lived in a Windows folder is still one this hive brings back", () => {
  assert.equal(seatIsRestorable(chat({ cwd: "C:\\Users\\Ana Lima\\dev\\arvore-hub" })), true);
  assert.equal(seatIsRestorable(chat({ cwd: "C:/Users/ana/dev" })), true);
  assert.equal(seatIsRestorable(chat({ cwd: "C:\\Users\\ana; rm -rf /" })), false);
});


test("an archived Codex seat resumes its thread through the app-server driver", () => {
  const seat = { name: "astra", where: "local", kind: "structured", agent: "codex", id: "abcd1234-0000-0000-0000-000000000000", cwd: "/tmp/hub", model: "gpt-6-astra" };
  const local = localRestoreScript([seat], { hub: "/tmp/hub", hiveHome: "/tmp/hive", engineDir: "/tmp/drv" });
  assert.ok(seatIsRestorable(seat));
  assert.ok(local.includes("/tmp/drv/codex-driver.mjs --agent codex"));
  assert.ok(local.includes(`--resume-id ${seat.id}`));
  assert.ok(local.includes("--model 'gpt-6-astra'"));
  assert.ok(!local.includes("turn-driver.mjs"));
});

test("a seat with no window but a driver that still answers is held back, not brought back twice", () => {
  const planned = fleetPlan([chat({ name: "gone" }), chat({ name: "orphan" })], true, ["hub"], 1000);
  const { restore, held } = withoutTheLiving(planned.restore, new Set(["orphan"]));
  assert.deepStrictEqual(restore.map((s) => s.name), ["gone"]);
  assert.deepStrictEqual(held.map((s) => s.name), ["orphan"]);
  assert.match(HELD_STILL_ANSWERS, /still answers/);
  assert.deepStrictEqual(withoutTheLiving(planned.restore, new Set()).restore, planned.restore);
});

test("a seat whose window is already open is not opened twice", () => {
  const script = localRestoreScript([chat()], { hub: "/hub", hiveHome: "/home/dev/.hive" });
  assert.ok(
    script.includes("! tmux list-windows -t hive-local -F '#W' 2>/dev/null | grep -qxF -- 'acq-front' && tmux new-window -d -t hive-local -n acq-front"),
    "a tick that misreads the session as dead would open a second chat with the same conversation"
  );
});

const job = (over = {}) => ({ id: "n1", name: "acq-front", where: "local", settled: true, at: 0, ...over });

test("a chat closed in its first seconds takes its opening card with it", () => {
  const jobs = new Map([["n1", job()]]);
  settleSpawnJobs(jobs, new Set(["acq-front"]), 1000);
  assert.ok(jobs.has("n1"), "the opening card left before the chat had painted its own");
  settleSpawnJobs(jobs, new Set(), 2000);
  assert.ok(!jobs.has("n1"), "a chat that came up and went away left its opening card on the wall for five minutes, and closing it did nothing");
});

test("an opening card lingers while its chat is up, and leaves after", () => {
  const jobs = new Map([["n1", job()]]);
  settleSpawnJobs(jobs, new Set(["acq-front"]), 1000);
  settleSpawnJobs(jobs, new Set(["acq-front"]), 1000 + JOB_LINGERS_MS);
  assert.ok(jobs.has("n1"));
  settleSpawnJobs(jobs, new Set(["acq-front"]), 1001 + JOB_LINGERS_MS);
  assert.ok(!jobs.has("n1"));
});

test("an opening card whose chat never came up waits the whole start-up window", () => {
  const jobs = new Map([["n1", job({ settled: false })]]);
  settleSpawnJobs(jobs, new Set(), JOB_ABANDONED_MS);
  assert.ok(jobs.has("n1"), "a slow start lost its card before the chat had a chance to answer");
  settleSpawnJobs(jobs, new Set(), JOB_ABANDONED_MS + 1);
  assert.ok(!jobs.has("n1"));
});

test("closing a chat forgets its opening card and no one else's", () => {
  const jobs = new Map([["n1", job()], ["n2", job({ id: "n2", where: "cloud" })], ["n3", job({ id: "n3", name: "other" })]]);
  forgetSpawnJobsOf(jobs, "acq-front", "local");
  assert.deepStrictEqual([...jobs.keys()], ["n2", "n3"]);
});
