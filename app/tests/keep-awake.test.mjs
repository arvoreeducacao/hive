import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { KEEP_AWAKE_GRACE_MS, agentsWorkHere, createKeepAwake, createKeepAwakeTick, inhibitorCommand, keepAwakeRunsHere } from "../lib/keep-awake.mjs";
import { cleanPatch } from "../lib/config.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const page = readFileSync(join(HERE, "app.html"), "utf8");

function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    setTimer(run, ms) {
      const id = next++;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer(id) { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, one]) => one.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = until;
    },
    pending: () => timers.size
  };
}

function fakeSpawner() {
  const children = [];
  const spawn = (command, args) => {
    const child = new EventEmitter();
    child.pid = 4000 + children.length;
    child.command = command;
    child.args = args;
    child.killed = false;
    child.kill = () => { child.killed = true; child.emit("exit", null, "SIGTERM"); return true; };
    children.push(child);
    return child;
  };
  return { spawn, children };
}

function keeper(over = {}) {
  const clock = fakeClock();
  const spawner = fakeSpawner();
  const lines = [];
  const keep = createKeepAwake({
    command: inhibitorCommand("darwin", 77),
    spawn: spawner.spawn,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    log: (line) => lines.push(line),
    ...over
  });
  return { keep, clock, spawner, lines };
}

test("each platform holds its own inhibitor, tied to the server's life", () => {
  assert.deepEqual(inhibitorCommand("darwin", 77), { command: "caffeinate", args: ["-i", "-w", "77"] });
  assert.deepEqual(inhibitorCommand("linux", 77), {
    command: "systemd-inhibit",
    args: ["--what=idle:sleep", "--who=Hive", "--why=Agents are working", "--mode=block", "tail", "--pid=77", "-f", "/dev/null"]
  });
  assert.equal(inhibitorCommand("win32", 77), null);
});

test("only a chat of this machine that is working keeps the computer awake", () => {
  assert.equal(agentsWorkHere([]), false);
  assert.equal(agentsWorkHere(undefined), false);
  assert.equal(agentsWorkHere([{ where: "local", state: "idle" }, { where: "local", state: "needs" }]), false);
  assert.equal(agentsWorkHere([{ where: "cloud", state: "working" }]), false, "a chat on the server keeps the server awake, not this computer");
  assert.equal(agentsWorkHere([{ where: "local", state: "done" }, { where: "local", state: "working" }]), true);
});

test("the sandbox, a pod and the tests never hold the computer awake", () => {
  assert.equal(keepAwakeRunsHere({}), true);
  assert.equal(keepAwakeRunsHere({ HIVE_POD: "hive-jonas-0" }), true, "a laptop that names its pod is still a laptop");
  assert.equal(keepAwakeRunsHere({ HIVE_SANDBOX: "1" }), false);
  assert.equal(keepAwakeRunsHere({ KUBERNETES_SERVICE_HOST: "10.0.0.1" }), false);
  assert.equal(keepAwakeRunsHere({ NODE_TEST_CONTEXT: "child-v8" }), false);
});

test("a working chat holds one inhibitor, and a new turn inside the grace keeps the same one", () => {
  const { keep, clock, spawner } = keeper();
  keep.update({ enabled: true, working: true });
  keep.update({ enabled: true, working: true });
  assert.equal(spawner.children.length, 1, "one hold, however often the fleet is read");
  assert.equal(spawner.children[0].command, "caffeinate");
  assert.deepEqual(spawner.children[0].args, ["-i", "-w", "77"]);
  assert.equal(keep.holding(), true);

  keep.update({ enabled: true, working: false });
  clock.advance(30000);
  assert.equal(keep.holding(), true, "the grace bridges the gap between two turns");
  keep.update({ enabled: true, working: true });
  clock.advance(120000);
  assert.equal(spawner.children.length, 1);
  assert.equal(spawner.children[0].killed, false);

  keep.update({ enabled: true, working: false });
  keep.update({ enabled: true, working: false });
  clock.advance(KEEP_AWAKE_GRACE_MS - 1);
  assert.equal(keep.holding(), true);
  clock.advance(1);
  assert.equal(keep.holding(), false, "a minute after the last chat stops, the computer may sleep");
  assert.equal(spawner.children[0].killed, true);
  assert.equal(clock.pending(), 0);
});

test("with the setting off nothing is held, and turning it off lets go at once", () => {
  const { keep, spawner } = keeper();
  keep.update({ enabled: false, working: true });
  assert.equal(spawner.children.length, 0);
  assert.equal(keep.holding(), false);

  keep.update({ enabled: true, working: true });
  assert.equal(keep.holding(), true);
  keep.update({ enabled: false, working: true });
  assert.equal(keep.holding(), false, "no grace once the person turned it off");
  assert.equal(spawner.children[0].killed, true);
});

test("an idle machine that never worked holds nothing and waits for nothing", () => {
  const { keep, clock, spawner } = keeper();
  keep.update({ enabled: true, working: false });
  assert.equal(spawner.children.length, 0);
  assert.equal(clock.pending(), 0);
});

test("an inhibitor that dies while agents work comes back, backing off", () => {
  const { keep, clock, spawner, lines } = keeper();
  keep.update({ enabled: true, working: true });
  spawner.children[0].emit("exit", 1, null);
  assert.equal(keep.holding(), false);
  clock.advance(4999);
  assert.equal(spawner.children.length, 1);
  clock.advance(1);
  assert.equal(spawner.children.length, 2, "tried again after five seconds");
  spawner.children[1].emit("error", new Error("spawn systemd-inhibit ENOENT"));
  clock.advance(9999);
  assert.equal(spawner.children.length, 2);
  clock.advance(1);
  assert.equal(spawner.children.length, 3, "and after ten the next time");
  assert.ok(lines.some((line) => line.includes("ENOENT")), "the reason is written to the log");
});

test("a spawn that throws is retried instead of taking the server down", () => {
  let calls = 0;
  const { keep, clock } = keeper({ spawn: () => { calls++; throw new Error("no such file"); } });
  keep.update({ enabled: true, working: true });
  assert.equal(calls, 1);
  clock.advance(5000);
  assert.equal(calls, 2);
  keep.update({ enabled: false, working: false });
  clock.advance(60000);
  assert.equal(calls, 2, "turning it off stops the retries");
});

test("stopping the server kills the inhibitor it holds", () => {
  const { keep, clock, spawner } = keeper();
  keep.update({ enabled: true, working: true });
  keep.stop();
  assert.equal(spawner.children[0].killed, true);
  assert.equal(keep.holding(), false);
  assert.equal(clock.pending(), 0);
});

test("a platform without an inhibitor never spawns anything", () => {
  const { keep, spawner } = keeper({ command: null });
  keep.update({ enabled: true, working: true });
  assert.equal(spawner.children.length, 0);
});

test("the setting takes true or false and turns the rest away", () => {
  assert.equal(cleanPatch({ keepAwakeWhileAgentsWork: false }).clean.keepAwakeWhileAgentsWork, false);
  assert.equal(cleanPatch({ keepAwakeWhileAgentsWork: true }).clean.keepAwakeWhileAgentsWork, true);
  const { clean, problems } = cleanPatch({ keepAwakeWhileAgentsWork: "yes" });
  assert.equal(clean.keepAwakeWhileAgentsWork, true);
  assert.deepEqual(problems, ["patch: keepAwakeWhileAgentsWork should be true or false"]);
});

test("the server reads the setting, on unless turned off, and follows the chats of this machine", () => {
  assert.match(server, /keepAwakeWhileAgentsWork: cleanFlag\(raw\.keepAwakeWhileAgentsWork, "keepAwakeWhileAgentsWork", tilde\(CONFIG_FILE\), problems, true\)/);
  assert.match(server, /readSetting: async \(\) => \(await readConfig\(\)\)\.config\.keepAwakeWhileAgentsWork/);
  assert.match(server, /readSessions: async \(\) => \(await collect\(\)\)\.sessions/);
  assert.match(server, /const keepAwake = keepAwakeRunsHere\(process\.env\)/);
  assert.match(server, /inhibitorCommand\(process\.platform, process\.pid\)/);
  assert.match(server, /if \(keepAwake\) setInterval\(\(\) => \{ keepAwakeTick\(\)\.catch\(\(\) => \{\}\); \}, KEEP_AWAKE_TICK_MS\)/);
  assert.match(server, /process\.on\("exit", \(\) => keepAwake\?\.stop\(\)\);/);
  assert.match(server, /if \(clean\.keepAwakeWhileAgentsWork !== undefined\) keepAwakeTick\(\)/, "turning it off lets go without waiting for the next tick");
});

test("the setting lives with the machine's other settings", () => {
  const pane = page.slice(page.indexOf('<section class="pref-pane" data-pane="conversation"'), page.indexOf('<section class="pref-pane" data-pane="slack"'));
  assert.match(pane, /<h3 class="set-head">Keep the computer awake while agents work<\/h3>/);
  assert.match(pane, /<div class="set-row" data-control="t-keep-awake">/);
  assert.match(pane, /<button class="ghost flip" id="t-keep-awake" type="button"><\/button>/);
  assert.match(pane, /Closing a laptop lid still puts it to sleep\./);
});

test("the switch in the settings turns it off and on, and says what it does", async () => {
  const { app, state } = await import("./dom.mjs");
  const st = await state();
  const { $ } = await app("core");
  await app("themes");
  const { adoptKeepAwake } = await app("pure-helpers");
  const { speak } = await import("../assets/i18n.mjs");
  const sent = [];
  globalThis.fetch = async (url, how = {}) => {
    const body = how.body ? JSON.parse(how.body) : null;
    if (body) sent.push([url, body]);
    return { ok: true, status: 200, json: async () => ({ config: { keepAwakeWhileAgentsWork: body?.config?.keepAwakeWhileAgentsWork ?? true } }) };
  };
  adoptKeepAwake({ config: {} });
  const flip = $("t-keep-awake");
  assert.equal(st.keepAwake, true, "on unless the file turns it off");
  assert.equal(flip.getAttribute("aria-pressed"), "true");
  assert.equal($("s-keep-awake-say").textContent, "the computer stays awake while a chat of this machine works");
  flip.click();
  for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 5));
  assert.equal(st.keepAwake, false);
  assert.equal(flip.getAttribute("aria-pressed"), "false");
  assert.equal($("s-keep-awake-say").textContent, "the computer sleeps on its usual schedule");
  assert.deepEqual(sent.at(-1), ["/api/config", { config: { keepAwakeWhileAgentsWork: false } }]);
  flip.click();
  for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 5));
  assert.equal(st.keepAwake, true);
  assert.deepEqual(sent.at(-1), ["/api/config", { config: { keepAwakeWhileAgentsWork: true } }]);
  speak("pt-BR");
  try {
    adoptKeepAwake({ config: { keepAwakeWhileAgentsWork: false } });
    assert.equal($("s-keep-awake-say").textContent, "o computador dorme no horário de sempre");
  } finally {
    speak("en");
  }
  assert.equal(flip.tagName, "BUTTON", "a real button, so Tab, Enter and Space reach it");
});

test("a slow check that started while the setting was on never turns the hold back on after a newer check turned it off", async () => {
  const updates = [];
  let enabled = true;
  let releaseSessions;
  const slowSessions = new Promise((go) => { releaseSessions = go; });
  let sessionReads = 0;
  const tick = createKeepAwakeTick({
    keepAwake: { update: (state) => updates.push(state) },
    readSetting: async () => enabled,
    readSessions: () => (++sessionReads === 1 ? slowSessions : Promise.resolve([]))
  });
  const stale = tick();
  await new Promise((go) => setTimeout(go, 5));
  enabled = false;
  await tick();
  releaseSessions([{ where: "local", state: "working" }]);
  await stale;
  assert.deepEqual(updates, [{ enabled: false, working: false }]);
});

test("the newest check applies what it read", async () => {
  const updates = [];
  const tick = createKeepAwakeTick({
    keepAwake: { update: (state) => updates.push(state) },
    readSetting: async () => true,
    readSessions: async () => [{ where: "local", state: "working" }, { where: "cloud", state: "working" }]
  });
  await tick();
  assert.deepEqual(updates, [{ enabled: true, working: true }]);
});
