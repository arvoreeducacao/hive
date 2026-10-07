import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

await views();

const { getStructured, soakDrafts } = await app("chat-stretches");
const st = await state();

const posted = [];
globalThis.fetch = async (path, options = {}) => {
  posted.push({ path: String(path), body: JSON.parse(options.body || "{}") });
  return { ok: true, status: 200, text: async () => "{}", json: async () => ({ ok: true }) };
};

const rest = (ms) => new Promise((done) => setTimeout(done, ms));

const boxOf = (e) => e.host.querySelector(".sv-composer textarea");

function type(e, text) {
  const box = boxOf(e);
  box.value = text;
  box.dispatchEvent(new window.Event("input", { bubbles: true }));
}

test("what is typed and not sent is kept, and comes back when the chat is drawn again", async () => {
  st.data = { sessions: [], drafts: {} };
  const e = getStructured({ name: "cadencia", where: "local" });
  document.body.appendChild(e.host);

  type(e, "vou pedir o relatório de ");
  await rest(400);
  const kept = posted.filter((one) => one.path === "/api/draft");
  assert.equal(kept.length, 1, "typing writes the draft once, not once per letter");
  assert.equal(kept[0].body.name, "cadencia");
  assert.equal(kept[0].body.text, "vou pedir o relatório de ");
  assert.ok(kept[0].body.at > 0, "the draft carries the moment it was typed");

  st.data.drafts = { antes: { text: "isto ficou de ontem", at: Date.now() } };
  const back = getStructured({ name: "antes", where: "local" });
  assert.equal(boxOf(back).value, "isto ficou de ontem", "a chat drawn for the first time opens with what was left in it");
});

test("what was typed on the other device lands in the box, and what is being typed here is not run over", async () => {
  st.data = { sessions: [], drafts: {} };
  const e = getStructured({ name: "cadencia-dois", where: "local" });
  document.body.appendChild(e.host);

  st.data.drafts = { "cadencia-dois": { text: "escrito no celular", at: Date.now() } };
  soakDrafts();
  assert.equal(boxOf(e).value, "escrito no celular");

  type(e, "escrito no celular e continuado aqui");
  await rest(400);
  st.data.drafts = { "cadencia-dois": { text: "escrito no celular", at: Date.now() - 5000 } };
  soakDrafts();
  assert.equal(boxOf(e).value, "escrito no celular e continuado aqui", "an older draft never wins over what is newer here");
});

test("sending empties the draft on the spot", async () => {
  st.data = { sessions: [], drafts: {} };
  const e = getStructured({ name: "cadencia-tres", where: "local" });
  document.body.appendChild(e.host);
  type(e, "manda isso");
  await rest(400);
  posted.length = 0;

  boxOf(e).dispatchEvent(new window.Event("blur", { bubbles: true }));
  e.host.querySelector(".sv-composer textarea").value = "";
  const { keepDraftNow } = await app("kept-drafts");
  keepDraftNow("cadencia-tres", "");
  assert.deepEqual(posted.map((one) => one.body.text), [""], "the empty box is written through at once");
});
