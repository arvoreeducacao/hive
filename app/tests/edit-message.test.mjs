import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const keys = readFileSync(join(HERE, "src", "app", "hold-numbers.js"), "utf8");

const { getStructured } = await app("chat-stretches");
const { svConvActions, svConvBeforeCompact, svConvEdit, svConvFlushAll, svConvLine, svConvPush, svConvRewind, svConvSaidAs, svConvSeed } = await app("conversation-model");
const { paintEditPencil } = await app("edit-message");
const { paintStamp, structPool } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let seq = 0;

function pane() {
  const name = `edit-${++seq}`;
  const e = getStructured({ name, where: "local" });
  e.at = 1000;
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  return e;
}

const asked = (e, text, uuid) => {
  const block = svConvLine(e, "sv-user", text);
  block.dataset.uuid = uuid;
  return block;
};
const answered = (e, text) => svConvPush(e, { key: `a${e.conv.blocks.length}`, kind: "said", parts: [`<p>${text}</p>`], streaming: false });
const shown = (e) => (svConvFlushAll(), e.scroll);
const shut = (e) => { e.convView.dispose(); structPool.delete(e.name); };

test("going back to a message drops it and everything after it, and keeps what came before", () => {
  const e = pane();
  asked(e, "lista as turmas", "u1");
  answered(e, "listei");
  asked(e, "pagina de 20 em 20", "u2");
  answered(e, "paginei");
  assert.equal(svConvRewind(e, "u2"), true);
  assert.deepEqual(e.conv.blocks.map((one) => one.kind), ["bubble", "said"]);
  assert.equal(svConvRewind(e, "nao-existe"), false);
  shut(e);
});

test("a message keeps the words it was sent with, so the edit box opens on them", () => {
  const e = pane();
  const block = asked(e, "cria um endpoint de turmas", "u1");
  assert.equal(block.text, "cria um endpoint de turmas");
  svConvEdit(e, "u1", { hint: "o chat esquece", cancel: "cancelar", save: "refazer daqui" });
  const box = shown(e).querySelector(".sv-edit textarea");
  assert.ok(box, "the bubble turns into an edit box in its own place");
  assert.equal(box.value, "cria um endpoint de turmas");
  assert.equal(e.scroll.querySelector(".sv-user"), null);
  svConvActions(e).editCancel(block);
  assert.ok(shown(e).querySelector(".sv-user"), "cancelling puts the bubble back as it was");
  assert.equal(e.scroll.querySelector(".sv-edit"), null);
  shut(e);
});

test("only one message is edited at a time", () => {
  const e = pane();
  const first = asked(e, "um", "u1");
  answered(e, "ok");
  const second = asked(e, "dois", "u2");
  svConvEdit(e, "u1", {});
  svConvEdit(e, "u2", {});
  assert.equal(first.editing, null);
  assert.ok(second.editing);
  shut(e);
});

test("a message behind the compaction line cannot be picked up again", () => {
  const e = pane();
  asked(e, "antes", "u1");
  answered(e, "ok");
  svConvLine(e, "sv-meta sv-compacted", "context compacted");
  asked(e, "depois", "u2");
  assert.equal(svConvBeforeCompact(e, "u1"), true);
  assert.equal(svConvBeforeCompact(e, "u2"), false);
  shut(e);
});

test("a message said again under a new id follows it, so it stays editable", () => {
  const e = pane();
  const block = asked(e, "oi", "u1");
  svConvSaidAs(e, "u1", "u1b");
  assert.equal(block.dataset.uuid, "u1b");
  shut(e);
});

test("the pencil shows on your own message in a native chat, and never on a message from another chat", () => {
  const e = pane();
  asked(e, "minha mensagem", "u1");
  const peer = svConvLine(e, "sv-user peer", "de outro chat");
  peer.dataset.uuid = "p1";
  const [mine, theirs] = shown(e).querySelectorAll(".sv-user");
  for (const el of [mine, theirs]) {
    paintStamp(el);
    paintEditPencil(e, el);
  }
  assert.ok(mine.querySelector(".sv-stamp .st-edit"), "your own message offers the pencil");
  assert.equal(theirs.querySelector(".sv-stamp .st-edit"), null);
  e.agent = "codex";
  paintEditPencil(e, mine);
  assert.equal(mine.querySelector(".sv-stamp .st-edit"), null, "a chat on another provider cannot go back to a point of its conversation");
  shut(e);
});

test("enter with a modifier inside a message box belongs to the box, not to the full-screen key", () => {
  assert.match(keys, /const aMessageBoxKeepsEnter = \(e\) => codeOf\(e\) === "Enter" && !!e\.target\?\.closest\?\.\("\.sv-composer, \.sv-edit"\);/);
  assert.match(keys, /const m = aMessageBoxKeepsEnter\(e\) \? null : whichAction\(e\);/);
});
