import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";
import { PT_BR, fill } from "../assets/i18n.mjs";
import { SCREEN_READER_CHOICES, SCREEN_READER_DEFAULT, cleanPatch, cleanScreenReader } from "../lib/config.mjs";

await views();
const reader = await app("screen-reader");
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { svConvFlushAll } = await app("conversation-model");
const st = await state();

const english = (text, vars) => fill(text, vars);
const portuguese = (text, vars) => fill(PT_BR[text] ?? text, vars);

const seat = (raw, extra = {}) => ({ name: "fix-login", title: "Fix the login", raw, state: raw, cwd: "/Users/a/hub/acme-hub", trees: [], asks: [], ...extra });

let next = 0;
const key = () => `k${++next}`;
const ask = () => ({ key: key(), kind: "bubble", body: "go", text: "go" });
const said = (text, extra = {}) => ({ key: key(), kind: "said", parts: [`<p>${text}</p>`], streaming: false, ...extra });
const tool = (extra = {}) => ({ key: key(), kind: "tool", face: "run", tool: "Bash", name: "Bash", arg: "npm test", cmd: "npm test", running: true, stat: "", ...extra });
const think = (body) => ({ key: key(), kind: "think", body });

function walk(level, frames) {
  let memory = null;
  const heard = [];
  for (const frame of frames) {
    const detail = level === "status" ? undefined : reader.turnDetailOf(frame.blocks || [], memory?.level === level ? memory.tail : null, english);
    const out = reader.nextChatAnnouncement(memory, { chat: frame.chat || "fix-login", level, status: frame.status, request: frame.request || "", failed: !!frame.failed, detail }, english);
    memory = out.memory;
    heard.push([...out.messages, ...(out.status ? [out.status] : []), ...(out.step ? [`step: ${out.step}`] : [])]);
  }
  return heard;
}

test("the screen reader settings take only their choices, and announcements start at status only", () => {
  assert.deepEqual(SCREEN_READER_CHOICES, ["status", "messages", "everything"]);
  assert.equal(SCREEN_READER_DEFAULT, "status");
  assert.equal(cleanScreenReader(undefined, "x", []), "status");
  const problems = [];
  assert.equal(cleanScreenReader("loud", "x", problems), "status");
  assert.equal(problems.length, 1);
  assert.deepEqual(cleanPatch({ screenReaderAnnouncements: "everything", screenReaderWindowTitle: true }), { clean: { screenReaderAnnouncements: "everything", screenReaderWindowTitle: true }, problems: [] });
  assert.equal(st.screenReaderWindowTitle, false, "the window title stays plain until it is turned on");
  assert.equal(st.screenReaderAnnouncements, "status");
});

test("the window title leads with the status and the chat's name, then its project", () => {
  const base = { on: true, chat: "Fix the login", project: "acme-hub", say: english };
  assert.equal(reader.windowTitle({ ...base, on: false, status: "working" }), "Hive");
  assert.equal(reader.windowTitle({ ...base, chat: "" }), "Hive");
  assert.equal(reader.windowTitle({ ...base, status: "working" }), "Working: Fix the login - acme-hub");
  assert.equal(reader.windowTitle({ ...base, status: "approval" }), "Needs approval: Fix the login - acme-hub");
  assert.equal(reader.windowTitle({ ...base, status: "input" }), "Needs your input: Fix the login - acme-hub");
  assert.equal(reader.windowTitle({ ...base, status: "idle" }), "Fix the login - acme-hub", "when the turn ends only the status goes away");
  assert.equal(reader.windowTitle({ ...base, project: "", status: "working" }), "Working: Fix the login");
  assert.equal(reader.windowTitle({ ...base, base: "fix-login", on: false }), "fix-login", "a chat in its own window keeps its name");
});

test("in Portuguese the title says Trabalhando, Precisa de aprovação and Precisa da sua resposta", () => {
  const base = { on: true, chat: "Corrigir o login", project: "acme-hub", say: portuguese };
  assert.equal(reader.windowTitle({ ...base, status: "working" }), "Trabalhando: Corrigir o login - acme-hub");
  assert.equal(reader.windowTitle({ ...base, status: "approval" }), "Precisa de aprovação: Corrigir o login - acme-hub");
  assert.equal(reader.windowTitle({ ...base, status: "input" }), "Precisa da sua resposta: Corrigir o login - acme-hub");
});

test("the chat's status comes from its question or approval first, then from its live turn", () => {
  assert.equal(reader.chatStatusOf(null), "idle");
  assert.equal(reader.chatStatusOf(seat("working")), "working");
  assert.equal(reader.chatStatusOf(seat("needs", { asks: [{ id: "q1" }] })), "input");
  assert.equal(reader.chatStatusOf(seat("needs")), "approval");
  assert.equal(reader.chatStatusOf(seat("idle")), "idle");
  const live = { ws: { readyState: 1 }, turnOpen: true };
  assert.equal(reader.chatStatusOf(seat("idle"), live), "working", "the live turn is newer than the last poll");
  assert.equal(reader.chatStatusOf(seat("working"), { ...live, turnOpen: false }), "idle");
  assert.equal(reader.chatStatusOf(seat("working"), { ws: { readyState: 3 }, turnOpen: false }), "working", "a chat that is not connected keeps the poll's word");
  assert.equal(reader.projectOf(seat("idle", { trees: [{ repo: "dev-workspaces" }] })), "dev-workspaces");
  assert.equal(reader.projectOf(seat("idle")), "acme-hub");
});

test("status only: a turn starting, needing you and ending, each said once", () => {
  const heard = walk("status", [
    { status: "idle" },
    { status: "working" },
    { status: "working" },
    { status: "approval" },
    { status: "approval" },
    { status: "working" },
    { status: "input", request: "q1" },
    { status: "input", request: "q2" },
    { status: "idle" },
    { status: "idle" },
    { status: "working" },
    { status: "idle", failed: true }
  ]);
  assert.deepEqual(heard, [[], ["Working"], [], ["Needs approval"], [], [], ["Needs your input"], ["Needs your input"], ["Finished"], [], ["Working"], ["Failed"]]);
});

test("the first look at a chat is silent, and so is switching to another chat", () => {
  const heard = walk("status", [{ status: "working" }, { status: "working", chat: "other" }, { status: "idle", chat: "other" }]);
  assert.deepEqual(heard, [[], [], ["Finished"]]);
});

test("status only never reads the agent's messages", () => {
  const first = said("Looking at the login form");
  const heard = walk("status", [
    { status: "idle", blocks: [ask()] },
    { status: "working", blocks: [ask(), first, tool()] }
  ]);
  assert.deepEqual(heard, [[], ["Working"]]);
});

test("status and messages reads each message the agent finishes and goes on from, never the closing reply nor the reasoning", () => {
  const go = ask();
  const first = said("Looking at the login form");
  const run = tool();
  const thought = think("secret reasoning that is never read");
  const last = said("All done, the login works");
  const heard = walk("messages", [
    { status: "idle", blocks: [go] },
    { status: "working", blocks: [go, { ...first, streaming: true }] },
    { status: "working", blocks: [go, first, run] },
    { status: "working", blocks: [go, first, run, thought] },
    { status: "working", blocks: [go, first, run, thought, last] },
    { status: "idle", blocks: [go, first, run, thought, last] }
  ]);
  assert.deepEqual(heard, [[], ["Working"], ["Looking at the login form"], [], [], ["Finished"]]);
  assert.ok(!heard.flat().some((one) => one.includes("secret")));
});

test("a very long message is cut and points to the chat", () => {
  const go = ask();
  const long = said("a".repeat(2500));
  const heard = walk("messages", [{ status: "working", blocks: [go] }, { status: "working", blocks: [go, long, tool()] }]);
  assert.equal(heard[1].length, 1);
  assert.ok(heard[1][0].endsWith("… More in the chat."));
  assert.ok(heard[1][0].length < 2100);
});

test("messages already on screen when the chat is opened, or when the level is raised, are not replayed", () => {
  const go = ask();
  const old = said("Earlier step");
  const blocks = [go, old, tool()];
  assert.deepEqual(walk("messages", [{ status: "working", blocks }, { status: "working", blocks }]), [[], []]);
  let memory = reader.nextChatAnnouncement(null, { chat: "c", level: "status", status: "working", detail: reader.turnDetailOf([], null) }).memory;
  const raised = reader.nextChatAnnouncement(memory, { chat: "c", level: "messages", status: "working", detail: reader.turnDetailOf(blocks, null) }, english);
  assert.deepEqual(raised.messages, []);
  memory = raised.memory;
  const fresh = said("New step");
  const later = reader.nextChatAnnouncement(memory, { chat: "c", level: "messages", status: "working", detail: reader.turnDetailOf([...blocks, fresh, tool()], memory.tail) }, english);
  assert.deepEqual(later.messages, ["New step"]);
});

test("everything adds the step the agent is on, once per step, and Thinking for reasoning", () => {
  const go = ask();
  const run = tool();
  const edit = tool({ face: "write", tool: "Edit", name: "Edit", arg: "src/login.js", cmd: "" });
  const heard = walk("everything", [
    { status: "idle", blocks: [go] },
    { status: "working", blocks: [go, run] },
    { status: "working", blocks: [go, { ...run, running: false, stat: "ok" }] },
    { status: "working", blocks: [go, run, think("hm")] },
    { status: "working", blocks: [go, run, think("hm"), edit] },
    { status: "approval", blocks: [go, run, think("hm"), edit] },
    { status: "working", blocks: [go, run, think("hm"), edit] },
    { status: "idle", blocks: [go, run, think("hm"), edit] }
  ]);
  assert.deepEqual(heard, [[], ["Working", "step: Running npm test"], [], ["step: Thinking…"], ["step: Editing src/login.js"], ["Needs approval"], ["step: Editing src/login.js"], ["Finished"]]);
  assert.deepEqual(walk("messages", [{ status: "working", blocks: [go] }, { status: "working", blocks: [go, run] }]), [[], []], "steps belong to Everything only");
});

test("a message and a status that land together are read as one announcement, status last", () => {
  assert.equal(reader.oneAnnouncement(["Looking at the form", "Needs approval"]), "Looking at the form. Needs approval");
  assert.equal(reader.oneAnnouncement(["Done!", "Finished"]), "Done! Finished");
});

test("the focused chat speaks through the live regions and leads the window title", async () => {
  const e = getStructured({ name: "reader-live", where: "local", agent: "claude" });
  document.body.appendChild(e.host);
  e.ws = { readyState: 1, send() {} };
  st.data = { ...st.data, sessions: [{ name: "reader-live", title: "Fix the login", raw: "idle", state: "idle", where: "local", cwd: "/x/acme-hub", trees: [], asks: [] }] };
  st.open = "reader-live";
  st.screenReaderAnnouncements = "messages";
  st.screenReaderWindowTitle = true;
  const status = document.getElementById("sr-chat-status");
  const detail = document.getElementById("sr-chat-detail");
  assert.ok(status && detail);
  assert.equal(status.getAttribute("aria-live"), "polite");
  reader.followFocusedChat();
  assert.equal(document.title, "Fix the login - acme-hub");
  svEvent(e, { type: "user", subtype: "say", message: { content: [{ type: "text", text: "fix the login" }] } });
  svEvent(e, { type: "system", subtype: "init", session_id: "s1", agent: "claude" });
  assert.equal(status.textContent, "Working");
  assert.equal(document.title, "Working: Fix the login - acme-hub");
  svEvent(e, { type: "assistant", message: { content: [{ type: "thinking", thinking: "private" }, { type: "text", text: "Looking at the **form**" }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "npm test" } }] } });
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 5)); svConvFlushAll(); }
  assert.equal(detail.textContent, "Looking at the form");
  svEvent(e, { type: "result", is_error: false });
  for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 5)); svConvFlushAll(); }
  assert.equal(status.textContent, "Finished");
  assert.equal(document.title, "Fix the login - acme-hub");
  st.screenReaderWindowTitle = false;
  reader.followFocusedChat();
  assert.equal(document.title, "Hive", "turning the setting off gives the window its plain name back");
  st.open = null;
  st.screenReaderAnnouncements = "status";
});

test("the two settings live in The conversation pane and change what the app reads", async () => {
  const pane = document.querySelector('.pref-pane[data-pane="conversation"]');
  const select = pane.querySelector("#f-sr-say");
  const flip = pane.querySelector("#t-sr-title");
  assert.equal(pane.querySelector('label[for="f-sr-say"]').textContent, "screen reader announcements");
  assert.equal(pane.querySelector('label[for="t-sr-title"]').textContent, "screen reader window title");
  assert.deepEqual([...select.options].map((one) => one.value), ["status", "messages", "everything"]);
  assert.equal(select.value, "status");
  assert.equal(flip.getAttribute("aria-pressed"), "false");
  const before = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
  try {
    select.value = "everything";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    assert.equal(st.screenReaderAnnouncements, "everything");
    flip.focus();
    flip.click();
    assert.equal(st.screenReaderWindowTitle, true);
    assert.equal(flip.getAttribute("aria-pressed"), "true");
    assert.equal(pane.querySelector("#s-sr-title-say").textContent, "the window title starts with the chat's status and name");
    assert.ok(document.activeElement === flip, "the switch keeps the focus after it repaints");
    flip.click();
    assert.equal(st.screenReaderWindowTitle, false);
    assert.equal(document.title, "Hive");
  } finally {
    globalThis.fetch = before;
    select.value = "status";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
