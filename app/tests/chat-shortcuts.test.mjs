import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $, ACTION_GROUPS, ACTION_NAMES, ACTION_SAID, CTRL_KEYS, DEFAULT_KEYS, MAC_KEYS, formatKey, overrides } = await app("core");
const { applyBindings } = await app("shared");
const { chatOrder, copyChatLink, copyPrNumber, stepChat, toggleSidebar } = await app("chat-shortcuts");
const { whichAction } = await app("brand-face");
await app("themes");
await app("hold-numbers");

window.hiveLink = { open: () => ({ send() {}, close() {} }) };

const clipped = [];
Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { clipped.push(text); } }, configurable: true });

const was = globalThis.fetch;
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
test.after(() => { globalThis.fetch = was; });

const settle = () => new Promise((done) => setImmediate(done));

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive(names, { focus = 0, open = null } = {}) {
  st.LIMIT = 4;
  st.data = { sessions: names.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: [...names] }];
  st.block = 0;
  st.focus = focus;
  st.open = open;
  st.seatsKnown = true;
  st.typing = null;
  st.pending = false;
  st.leader = null;
  st.chords = {};
  st.keys = { ...DEFAULT_KEYS };
  st.explicitKeys = new Set();
  st.capturing = null;
  st.tourAt = -1;
  st.prs = [];
  st.reviewChat = null;
  st.openPr = null;
  clipped.length = 0;
}

function railOf(names) {
  $("rail-sessions").innerHTML = names.map((name) => `<div class="item" tabindex="-1" data-name="${name}"><span class="name">${name}</span></div>`).join("");
}

const press = (init) => {
  const ev = new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  (document.activeElement || document).dispatchEvent(ev);
  return ev;
};

test("the new shortcuts sit on both key families, in the list, with a name and a sentence each", () => {
  assert.deepEqual(MAC_KEYS.prevChat, { meta: true, shift: true, code: "BracketLeft" });
  assert.deepEqual(MAC_KEYS.nextChat, { meta: true, shift: true, code: "BracketRight" });
  assert.deepEqual(MAC_KEYS.newChat, { meta: true, shift: true, code: "KeyO" });
  assert.deepEqual(MAC_KEYS.sidebar, { meta: true, code: "KeyB" });
  assert.deepEqual(MAC_KEYS.copyChat, { meta: true, shift: true, code: "KeyC" });
  assert.deepEqual(MAC_KEYS.copyPr, { meta: true, shift: true, code: "KeyK" });
  assert.deepEqual(MAC_KEYS.nextArea, { code: "F6" });
  assert.deepEqual(MAC_KEYS.prevArea, { shift: true, code: "F6" });
  for (const action of ["prevChat", "nextChat", "newChat", "sidebar", "copyChat", "copyPr", "nextArea", "prevArea"]) {
    assert.ok(CTRL_KEYS[action], `${action} has a key on the ctrl family`);
    assert.ok(ACTION_SAID[action] && ACTION_NAMES[action], `${action} has a sentence and a name`);
    assert.ok(ACTION_GROUPS.some(([, , actions]) => actions.includes(action)), `${action} sits in a group`);
  }
  for (const family of [MAC_KEYS, CTRL_KEYS]) {
    const labels = Object.values(family).map(formatKey);
    assert.deepEqual(labels.filter((one, at) => labels.indexOf(one) !== at), [], "two defaults of the same family share a key");
  }
  assert.deepEqual(ACTION_GROUPS.map(([, title]) => title), ["Chats", "Panels", "Voice", "Navigation", "Notifications"]);
});

test("a key the file gave to another action keeps it, and the new default steps aside", () => {
  hive(["uma"]);
  assert.deepEqual(applyBindings({ prs: "ctrl+shift+o" }), []);
  assert.equal(whichAction(new window.KeyboardEvent("keydown", { code: "KeyO", ctrlKey: true, shiftKey: true })).action, "prs");
  assert.equal(st.keys.newChat, null);
  assert.deepEqual(overrides(), { prs: "ctrl+shift+o", newChat: "off" });
  applyBindings({});
});

test("the default leader takes ctrl+b quietly, and the sidebar key gives way without a line in the file", () => {
  hive(["uma"]);
  assert.deepEqual(applyBindings({ leader: "on" }), []);
  assert.equal(st.keys.sidebar, null);
  assert.deepEqual(overrides(), { leader: "on" });
  assert.deepEqual(applyBindings({ leader: "ctrl+b" }), [], "the leader written out is the same default leader");
  applyBindings({});
});

test("next and previous chat follow the order of the list on the side, and stop at its ends", () => {
  hive(["a", "b", "c"], { focus: 1 });
  railOf(["c", "a", "b"]);
  assert.deepEqual(chatOrder(), ["c", "a", "b"]);
  assert.equal(stepChat(1), false, "b is the last one in the list");
  assert.equal(st.blocks[0].keys[st.focus], "b");
  railOf(["c", "a", "b"]);
  assert.equal(stepChat(-1), true);
  assert.equal(st.blocks[0].keys[st.focus], "a");
});

test("from the middle of the list the step lands on its neighbour, both ways", () => {
  hive(["a", "b", "c"], { focus: 0 });
  railOf(["c", "a", "b"]);
  assert.equal(stepChat(1), true);
  assert.equal(st.blocks[0].keys[st.focus], "b");
  railOf(["c", "a", "b"]);
  assert.equal(stepChat(-1), true);
  assert.equal(st.blocks[0].keys[st.focus], "a");
  railOf(["c", "a", "b"]);
  assert.equal(stepChat(-1), true);
  assert.equal(st.blocks[0].keys[st.focus], "c");
  railOf(["c", "a", "b"]);
  assert.equal(stepChat(-1), false, "the first one has nothing above it");
  assert.equal(st.blocks[0].keys[st.focus], "c");
});

test("with no list on the side, the order is the order of the blocks", () => {
  hive(["a", "b"], { focus: 0 });
  $("rail-sessions").innerHTML = "";
  assert.deepEqual(chatOrder(), ["a", "b"]);
});

test("the sidebar key folds the list on the side and unfolds it again", () => {
  hive(["a"]);
  const shell = $("shell");
  shell.classList.remove("rail-min");
  assert.equal(toggleSidebar(), true);
  assert.equal(shell.classList.contains("rail-min"), true);
  assert.equal(toggleSidebar(), true);
  assert.equal(shell.classList.contains("rail-min"), false);
});

test("copy chat puts a link to the chat on the clipboard, and the PR link while a PR is being read", async () => {
  hive(["uma"]);
  await copyChatLink();
  assert.deepEqual(clipped, ["hive://seat/uma"]);
  st.prs = [{ key: "o/r#12", session: "uma", number: 12, url: "https://github.com/o/r/pull/12", repo: "o/r" }];
  st.reviewChat = "uma";
  await copyChatLink();
  assert.equal(clipped.at(-1), "https://github.com/o/r/pull/12");
});

test("copy PR number copies the chat's PR with the #, and says so when there is none", async () => {
  hive(["uma"]);
  await copyPrNumber();
  assert.deepEqual(clipped, []);
  assert.match($("hud").textContent, /This chat has no PR/);
  st.prs = [{ key: "o/r#77", session: "uma", number: 77, url: "https://github.com/o/r/pull/77", repo: "o/r" }];
  await copyPrNumber();
  assert.deepEqual(clipped, ["#77"]);
});

test("the copy shortcuts answer with the focus in a text field, the way the composer holds it", async () => {
  hive(["uma"]);
  const field = document.createElement("textarea");
  document.body.append(field);
  field.focus();
  const ev = press({ key: "C", code: "KeyC", ctrlKey: true, altKey: true });
  await settle();
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(clipped, ["hive://seat/uma"]);
  field.remove();
});
