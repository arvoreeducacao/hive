import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

await views();

const st = await state();
const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvFlushAll, svConvLine, svConvPush, svConvSeed } = await app("conversation-model");
const { paintForkButton, svForked } = await app("chat-fork");
const { paintEditPencil } = await app("edit-message");
const { paintStamp, structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let made = 0;

function pane(seat = {}) {
  const name = `fork-${++made}`;
  const e = getStructured({ name, where: "local" });
  e.at = 1000;
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  st.data = { ...(st.data || {}), sessions: [{ name, where: "local", title: "Valores incoerentes", ...seat }] };
  return e;
}

const asked = (e, text, seq) => {
  const block = svConvLine(e, "sv-user", text);
  block.seq = seq;
  block.dataset.uuid = `u${seq}`;
  return block;
};
const answered = (e, text, seq) => svConvPush(e, { key: `a${seq}`, kind: "said", parts: [`<p>${text}</p>`], streaming: false, seq });
const shown = (e) => (svConvFlushAll(), e.scroll);
const shut = (e) => { e.convView.dispose(); structPool.delete(e.name); };
const settle = async () => { for (let hop = 0; hop < 6; hop++) await new Promise((done) => setTimeout(done, 5)); };

const BACKGROUND = /^\/api\/(tasks|secrets\/pending)(\?|$)/;

function stubFetch(answers) {
  const calls = [];
  const was = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (!BACKGROUND.test(String(url))) calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    const answer = answers[String(url)] ?? { ok: true };
    return { json: async () => answer };
  };
  return { calls, restore: () => { globalThis.fetch = was; } };
}

function twoTurns(e) {
  asked(e, "lista as turmas", 1);
  answered(e, "listei", 2);
  asked(e, "pagina de 20 em 20", 3);
  answered(e, "paginei", 4);
  const answers = [...shown(e).querySelectorAll(".sv-msg")];
  for (const one of answers) paintStamp(one);
  return answers;
}

test("the fork sits on the answer that closes a turn, and leaves while the chat still works", () => {
  const e = pane();
  const [first, last] = twoTurns(e);
  for (const one of [first, last]) paintForkButton(e, one);
  assert.ok(first.querySelector(".sv-stamp .st-fork"), "an answer followed by a new message closed its turn");
  assert.ok(last.querySelector(".sv-stamp .st-fork"), "the last answer of a quiet chat closes its turn");
  assert.equal(last.querySelector(".st-fork").getAttribute("aria-label"), "Fork from this response");
  e.turnOpen = true;
  paintForkButton(e, last);
  assert.equal(last.querySelector(".st-fork"), null, "the answer still being written is not a place to fork from");
  shut(e);
});

test("only a claude chat on this machine forks, and never a mirror or a chat with no record", () => {
  for (const [label, change] of [["codex", (e) => { e.agent = "codex"; }], ["mirror", (e) => { e.mirror = true; }], ["cloud", (e) => { e.where = "cloud"; }]]) {
    const e = pane();
    const [first] = twoTurns(e);
    change(e);
    paintForkButton(e, first);
    assert.equal(first.querySelector(".st-fork"), null, label);
    shut(e);
  }
  const anon = pane({ anon: true });
  const [first] = twoTurns(anon);
  paintForkButton(anon, first);
  assert.equal(first.querySelector(".st-fork"), null, "an anonymous chat keeps no record to fork");
  shut(anon);
});

test("a fork that does not open says why in the chat and gives the button back", async () => {
  const e = pane();
  const [first] = twoTurns(e);
  paintForkButton(e, first);
  const net = stubFetch({ "/api/chat/fork": { error: "that answer is still being written — fork it when the turn ends" } });
  try {
    const button = first.querySelector(".st-fork");
    button.click();
    assert.ok(button.classList.contains("busy"));
    await settle();
    assert.deepEqual(net.calls.map((one) => [one.url, one.body]), [["/api/chat/fork", { name: e.name, seq: 2, title: "Valores incoerentes" }]]);
    assert.ok(button.disabled === false && !button.classList.contains("busy"));
    assert.match(shown(e).textContent, /still being written/);
  } finally { net.restore(); shut(e); }
});

test("the fork opens on a divider that names where it came from, and goes there while that chat lives", () => {
  const e = pane();
  svForked(e, { from: e.name, title: "Valores incoerentes" });
  const divider = shown(e).querySelector(".sv-forked");
  assert.match(divider.querySelector(".fk-label").textContent, /Forked from Valores incoerentes/);
  assert.equal(divider.querySelector(".fk-pill").disabled, false);
  svForked(e, { from: "gone-chat", title: "Antigo" });
  const gone = shown(e).querySelectorAll(".sv-forked")[1];
  assert.match(gone.querySelector(".fk-label").textContent, /Antigo/);
  assert.equal(gone.querySelector(".fk-pill").disabled, true, "a source that is not open any more cannot be opened");
  shut(e);
});

async function editing(seat, available = true) {
  const e = pane(seat);
  twoTurns(e);
  const sent = [];
  e.ws = { readyState: 1, send(text) { const cmd = JSON.parse(text); sent.push(cmd); e.pending.get(cmd.cid)?.({ ok: true }); } };
  const mine = shown(e).querySelectorAll(".sv-user")[1];
  paintStamp(mine);
  paintEditPencil(e, mine);
  const net = stubFetch({ [`/api/chat/revert-files?name=${e.name}&seq=3`]: { ok: true, available } });
  try {
    mine.querySelector(".st-edit").click();
    await settle();
  } finally { net.restore(); }
  return { e, sent, asked: net.calls };
}

test("with a copy of the files from before the message, the edit offers to put them back, and does it before it asks again", async () => {
  const { e, sent, asked } = await editing({ trees: [{ path: "/hub", main: true }, { path: "/hub/.wt-a", main: false }] });
  assert.deepEqual(asked.map((one) => one.url), [`/api/chat/revert-files?name=${e.name}&seq=3`], "the edit asks whether that copy exists");
  const box = shown(e).querySelector(".sv-edit");
  const revert = box.querySelector(".sv-edit-revert input");
  assert.ok(revert, "the worktree's files can go back");
  assert.equal(box.querySelector(".sv-edit-revert").textContent, "Revert files too");
  revert.checked = true;
  revert.dispatchEvent(new window.Event("change"));
  await settle();
  assert.match(box.querySelector(".sv-edit-hint").textContent, /files go back/);
  const net = stubFetch({ "/api/chat/revert-files": { ok: true, restored: 1 } });
  try {
    box.querySelector(".sv-edit-save").click();
    await settle();
    assert.deepEqual(net.calls.map((one) => [one.url, one.body]), [["/api/chat/revert-files", { name: e.name, seq: 3 }]]);
    assert.deepEqual(sent.map((one) => [one.type, one.target, one.text]), [["edit", "u3", "pagina de 20 em 20"]], "the edit goes out only after the files are back");
  } finally { net.restore(); shut(e); }
});

test("files that cannot go back keep the edit open with the reason, and nothing is sent", async () => {
  const { e, sent } = await editing({ trees: [{ path: "/hub/.wt-a", main: false }] });
  const box = shown(e).querySelector(".sv-edit");
  const revert = box.querySelector(".sv-edit-revert input");
  revert.checked = true;
  revert.dispatchEvent(new window.Event("change"));
  const net = stubFetch({ "/api/chat/revert-files": { error: "there is no copy of this chat's files from before that message — edit it keeping the files instead" } });
  try {
    box.querySelector(".sv-edit-save").click();
    await settle();
    assert.deepEqual(sent, []);
    const still = shown(e).querySelector(".sv-edit");
    assert.ok(still, "the edit box stays open");
    assert.match(still.querySelector(".sv-edit-hint").textContent, /no copy of this chat's files/);
    assert.equal(still.querySelector(".sv-edit-save").disabled, false);
  } finally { net.restore(); shut(e); }
});

test("without a worktree, without a copy from before the message, or while the chat works, the edit offers nothing else", async () => {
  const plain = await editing({ trees: [{ path: "/hub", main: true }] });
  assert.equal(shown(plain.e).querySelector(".sv-edit-revert"), null);
  assert.deepEqual(plain.asked, [], "a chat with no worktree does not even ask");
  shut(plain.e);
  const none = await editing({ trees: [{ path: "/hub/.wt-a", main: false }] }, false);
  assert.equal(shown(none.e).querySelector(".sv-edit-revert"), null, "no copy from before the message, no offer");
  shut(none.e);
  const e = pane({ trees: [{ path: "/hub/.wt-a", main: false }] });
  twoTurns(e);
  e.turnOpen = true;
  const mine = shown(e).querySelectorAll(".sv-user")[1];
  paintStamp(mine);
  paintEditPencil(e, mine);
  mine.querySelector(".st-edit").click();
  assert.equal(shown(e).querySelector(".sv-edit-revert"), null, "a working chat is stopped first and its files are not touched");
  shut(e);
});
