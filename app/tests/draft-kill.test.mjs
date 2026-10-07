import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
await app("arrange");
const { drafts, openDraft } = await app("draft-seat");
const { run } = await app("themes");

globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: true, models: [] }) });

window.hiveLink = window.hiveLink || { open: (path, handlers) => ({ path, send() {}, close() { handlers?.close?.(); } }) };

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "structured", structured: true, agent: "claude" });

function hive(keys) {
  st.LIMIT = 4;
  st.data = { sessions: keys.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a" }];
  st.space = "a";
  st.blocks = [{ id: "blk0", ws: "a", label: "", manual: false, keys: [...keys] }];
  st.block = 0;
  st.focus = 0;
  st.seatsKnown = true;
  st.accountsAsked = true;
  st.open = null;
  st.mirrorDev = "";
  st.holding = "";
}

test("the close-the-seat key throws away the new chat in focus, with no confirm", () => {
  hive(["worker"]);
  const d = openDraft();
  st.focus = st.blocks[0].keys.indexOf(d.key);
  run("kill");
  assert.equal(drafts.has(d.id), false, "the draft is still kept");
  assert.equal(st.blocks[0].keys.includes(d.key), false, "the draft still holds a place in the block");
  assert.equal(document.querySelector("#confirm.on, #confirm:not([hidden])")?.classList.contains("on") ?? false, false, "a confirm opened for a chat that never started");
});

test("a new chat that is already being sent stays while the seat is born", () => {
  hive(["worker"]);
  const d = openDraft();
  st.focus = st.blocks[0].keys.indexOf(d.key);
  d.sending = true;
  run("kill");
  assert.equal(drafts.has(d.id), true, "the draft was thrown away while its seat was being born");
  d.e.host.remove();
  drafts.delete(d.id);
});
