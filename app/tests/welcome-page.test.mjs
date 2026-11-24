import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const realFetch = globalThis.fetch;
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { wb, wReachable } = await app("welcome");
const { closeWelcome, openWelcome, wPaint } = await app("avatars");
const { agentRows, needsSetup, serverStepLeft } = await app("welcome-page");
const { endTour } = await app("tour");
await app("hold-numbers");

bootSolid();

const machineWith = (over = {}) => ({
  ok: true,
  agents: {},
  deps: [{ name: "tmux", ok: true, needed: true, why: "every session lives in a tmux window", install: "brew install tmux" }, { name: "gh", ok: true, needed: true }, { name: "claude", ok: true, needed: true }],
  gh: { ok: true, detail: "ada" },
  claude: { loggedIn: true, email: "ada@example.com" },
  ...over
});

const stateWith = (over = {}) => ({ dev: "ada", hub: "/Users/ada/hub", hubLooks: { ok: true }, wantsServer: false, machine: machineWith(), setup: { ok: false }, server: {}, signature: {}, claudeOnServer: {}, finished: false, ...over });

let world;
let actions;

function answer(onboarding, act = () => ({ ok: true })) {
  world = onboarding;
  actions = [];
  globalThis.fetch = async (url, init) => {
    const said = String(url);
    if (said.startsWith("/api/onboarding/action")) {
      const body = JSON.parse(init.body);
      actions.push(body);
      const reply = act(body);
      if (reply?.ok && body.action === "setup") world = { ...world, setup: { ok: true } };
      return { ok: true, json: async () => reply };
    }
    if (said.startsWith("/api/onboarding")) return { ok: true, json: async () => world };
    return { ok: true, status: 200, json: async () => ({ sessions: [] }), text: async () => "{}" };
  };
}

const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((go) => setTimeout(go, 0)); };
const stage = () => $("w-stage");
const button = (act) => stage().querySelector(`[data-w="${act}"]`);
const rowNamed = (name) => [...stage().querySelectorAll(".wp-row")].find((row) => row.querySelector(".wp-name")?.firstChild?.textContent === name);

async function open(onboarding, act) {
  answer(onboarding, act);
  Object.assign(wb, { dev: "", hub: "", s: null, busy: "", setupError: "", nameWrong: false, ready: false });
  openWelcome("hello");
  await settle();
}

function noTour() {
  const around = $("wp-around");
  around.checked = false;
  around.dispatchEvent(new Event("change", { bubbles: true }));
}

beforeEach(() => {
  if (!$("welcome").hidden) closeWelcome();
  if (st.tourAt >= 0) endTour();
});

test("the first open is one page: the title, this computer, You with the face, Agents, Tools and Start", async () => {
  await open(stateWith());
  assert.ok($("welcome").classList.contains("one-page"));
  assert.equal(stage().querySelector(".wp-title").textContent, "Welcome to the hive.");
  assert.match(stage().querySelector(".wp-sub").textContent, /Setting up this computer\./);
  assert.deepEqual([...stage().querySelectorAll(".wp-label")].map((one) => one.textContent), ["You", "Agents", "Tools"]);
  assert.ok(stage().querySelector("#w-mug"), "the face stays, as the hive has it");
  assert.equal($("w-dev").value, "ada");
  assert.equal($("w-hub").value, "/Users/ada/hub");
  assert.ok(document.activeElement === $("w-dev"), "the name field takes the focus");
  assert.equal(button("start").disabled, false);
  assert.ok(!button("start-bare"), "an agent is ready, so no start without one");
});

test("the agents read as rows: Claude signed in, Codex missing with the command to copy", async () => {
  await open(stateWith());
  const claude = rowNamed("Claude");
  assert.equal(claude.querySelector(".wp-dot").dataset.ready, "true");
  assert.match(claude.textContent, /Signed in as ada@example\.com/);
  const codex = rowNamed("Codex");
  assert.equal(codex.querySelector(".wp-dot").dataset.ready, "false");
  assert.equal(codex.querySelector(".wp-copy").dataset.copy, "npm install -g @openai/codex");
  assert.equal(codex.querySelector(".wp-copy").getAttribute("aria-label"), "Copy npm install -g @openai/codex");
  assert.ok(!rowNamed("Kimi"), "agents the machine does not have stay out");
  assert.ok(rowNamed("GitHub"), "GitHub sits in Tools");
  assert.ok(!rowNamed("tmux"), "a tool that is there needs no row");
});

test("with no agent ready, Start waits and Start without an agent is offered", async () => {
  await open(stateWith({ machine: machineWith({ claude: { loggedIn: false } }) }));
  noTour();
  assert.equal(button("start").disabled, true);
  assert.equal(button("start").getAttribute("aria-describedby"), "wp-hint");
  assert.match(stage().querySelector(".wp-hint").textContent, /Set up one agent to start\./);
  assert.match(rowNamed("Claude").textContent, /Not signed in/);
  assert.equal(rowNamed("Claude").querySelector(".wp-copy").dataset.copy, "claude");
  button("start-bare").click();
  await settle();
  assert.deepEqual(actions.map((one) => one.action), ["setup", "finish"]);
  assert.equal(actions[0].name, "ada");
  assert.equal(actions[0].hub, "/Users/ada/hub");
  assert.equal($("welcome").hidden, true, "the app opens");
});

test("Start runs the setup, lands in the app and shows the hive around, as the first open always did", async () => {
  await open(stateWith());
  $("w-dev").value = "Ada Lovelace";
  $("w-dev").dispatchEvent(new Event("input", { bubbles: true }));
  button("start").click();
  await settle();
  assert.deepEqual(actions.map((one) => one.action), ["setup", "finish"]);
  assert.equal(actions[0].name, "ada-lovelace");
  assert.equal($("welcome").hidden, true);
  assert.ok(st.tourAt >= 0, "the tour starts");
});

test("turning the tour off lands in the app with nothing on top", async () => {
  await open(stateWith({ setup: { ok: true } }));
  noTour();
  button("start").click();
  await settle();
  assert.deepEqual(actions.map((one) => one.action), ["finish"], "a machine already set up only finishes");
  assert.ok(st.tourAt === undefined || st.tourAt < 0);
});

test("a folder changed on a machine already set up is saved before the page closes", async () => {
  await open(stateWith({ setup: { ok: true }, configHub: "/Users/ada/hub" }));
  noTour();
  const typedHub = (url) => new URL(String(url), "http://x").searchParams.get("hub");
  const realAnswer = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("/api/onboarding?") && typedHub(url)) world = { ...world, hub: typedHub(url) };
    return realAnswer(url, init);
  };
  $("w-hub").value = "/Users/ada/other";
  $("w-hub").dispatchEvent(new Event("input", { bubbles: true }));
  button("start").click();
  await settle();
  assert.deepEqual(actions.map((one) => one.action), ["setup", "finish"]);
  assert.equal(actions[0].hub, "/Users/ada/other");
});

test("with a server to reach, Start sets up this computer and then walks through the server, step by step", async () => {
  await open(stateWith({ wantsServer: true, server: { url: "https://hive.example", answers: false } }));
  assert.ok(stage().querySelector("#wp-server"), "the server has its own section");
  button("start").click();
  await settle();
  assert.deepEqual(actions.map((one) => one.action), ["setup"]);
  assert.equal(wb.step, "server");
  assert.equal($("welcome").hidden, false);
  assert.equal($("welcome").classList.contains("one-page"), false, "the server steps keep their own pages and bar");
  assert.ok($("w-dots").querySelector('[data-id="server"]'));
  assert.ok(!$("w-dots").querySelector('[data-id="machine"], [data-id="setup"]'), "the machine and the key live on the first page now");
});

test("Start runs once even when a slow refresh repaints the page in between", async () => {
  let release;
  const slow = new Promise((go) => { release = go; });
  await open(stateWith());
  noTour();
  const realAnswer = globalThis.fetch;
  let held = false;
  globalThis.fetch = async (url, init) => {
    if (!held && String(url).startsWith("/api/onboarding?") && actions.some((one) => one.action === "setup")) {
      held = true;
      await slow;
    }
    return realAnswer(url, init);
  };
  button("start").click();
  await settle();
  wPaint();
  assert.equal(button("start").disabled, true, "Start stays locked while the setup lands");
  button("start").click();
  release();
  await settle();
  assert.deepEqual(actions.map((one) => one.action), ["setup", "finish"]);
});

test("a wrong name stops Start, says why and keeps the focus on the name", async () => {
  await open(stateWith());
  $("w-dev").value = "a";
  $("w-dev").dispatchEvent(new Event("input", { bubbles: true }));
  button("start").click();
  await settle();
  assert.deepEqual(actions, []);
  assert.equal($("w-dev").getAttribute("aria-invalid"), "true");
  assert.match($("w-dev-note").textContent, /2 to 30/);
  assert.ok(document.activeElement === $("w-dev"));
});

test("a workspace folder that does not exist stops Start on the folder", async () => {
  await open(stateWith({ hubLooks: { ok: false, why: "that folder does not exist" } }));
  button("start").click();
  await settle();
  assert.deepEqual(actions, []);
  assert.match($("w-hub-note").textContent, /that folder does not exist/);
  assert.ok(document.activeElement === $("w-hub"));
});

test("a setup the app refuses says why, frees Start and offers a way out", async () => {
  await open(stateWith(), (body) => (body.action === "setup" ? { error: "missing dependencies: tmux" } : { ok: true }));
  button("start").click();
  await settle();
  assert.match(stage().querySelector(".wp-error").textContent, /missing dependencies: tmux/);
  assert.equal(button("start").disabled, false);
  assert.equal($("welcome").hidden, false);
  button("skip-setup").click();
  await settle();
  assert.equal($("welcome").hidden, true);
  assert.ok(!actions.some((one) => one.action === "finish"), "skipping does not mark the setup as done");
});

test("Enter in a field starts, and a repaint keeps what is being typed and the caret", async () => {
  await open(stateWith({ setup: { ok: true } }));
  noTour();
  const field = $("w-hub");
  field.focus();
  field.value = "/Users/ada/hub2";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.setSelectionRange(5, 9, "backward");
  world = stateWith({ setup: { ok: true }, machine: machineWith({ agents: { kimi: "/usr/bin/kimi" } }) });
  wb.s = world;
  wPaint();
  assert.ok(rowNamed("Kimi"), "the page repainted");
  assert.ok(document.activeElement === $("w-hub"), "the field keeps the focus");
  assert.equal($("w-hub").value, "/Users/ada/hub2");
  assert.equal($("w-hub").selectionStart, 5);
  assert.equal($("w-hub").selectionEnd, 9, "a selection survives the repaint");
  $("w-hub").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
  await settle();
  assert.deepEqual(actions.map((one) => one.action), ["finish"]);
});

test("a repaint keeps the focus on the button that had it", async () => {
  await open(stateWith({ machine: machineWith({ claude: { loggedIn: false } }) }));
  const copy = rowNamed("Codex").querySelector(".wp-copy");
  copy.focus();
  wb.s = stateWith({ machine: machineWith({ claude: { loggedIn: false }, agents: { kimi: "/usr/bin/kimi" } }) });
  wPaint();
  const again = rowNamed("Codex").querySelector(".wp-copy");
  assert.ok(again !== copy, "the row was painted again");
  assert.ok(document.activeElement === again);
});

test("the setup and the server steps are read from the state", () => {
  assert.equal(needsSetup(stateWith({ setup: { ok: true } })), false);
  assert.equal(needsSetup(stateWith({ setup: { ok: false } })), true);
  assert.equal(needsSetup(stateWith({ setup: { ok: true }, configHub: "/a", hub: "/b" })), true);
  assert.equal(serverStepLeft(stateWith()), "", "no server wanted, nothing left");
  assert.equal(serverStepLeft(stateWith({ wantsServer: true, setup: { ok: true }, server: { answers: true }, signature: { ok: true }, claudeOnServer: { loggedIn: false } })), "login");
  assert.equal(agentRows(machineWith({ deps: [], claude: { loggedIn: false } }))[0].command, "npm install -g @anthropic-ai/claude-code");
  assert.equal(wReachable("machine"), false);
  assert.equal(wReachable("setup"), false);
});
