import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
await app("arrange");
const { drafts, openDraft } = await app("draft-seat");
const { openChatFromBar } = await app("seat-layout");

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

const shut = (d) => { d.e.host.remove(); drafts.delete(d.id); };

test("a new chat asked for while one chat fills the screen brings the mosaic back", () => {
  hive(["worker"]);
  st.open = "worker";
  const d = openDraft();
  assert.equal(st.open, null, "the old chat still fills the screen, so the new one is behind it");
  assert.ok(st.blocks[0].keys.includes(d.key), "the draft never took a place on the canvas");
  assert.equal(st.blocks[0].keys[st.focus], d.key, "the focus stayed on the chat the person just left");
  shut(d);
});

test("nothing fills the screen, so a new chat leaves the mosaic as it is", () => {
  hive(["worker"]);
  const d = openDraft();
  assert.equal(st.open, null);
  assert.equal(st.blocks[0].keys[st.focus], d.key);
  shut(d);
});

test("a chat opened from the mission bar brings the mosaic back too", async () => {
  hive(["worker"]);
  st.open = "worker";
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => (String(url).startsWith("/api/spawn") ? { ok: true, id: "n1", name: "novo" } : { ok: true, sessions: [], spawning: [] })
  });
  st.cmpTray = st.cmpTray || { marks: new Map(), clear() {} };
  document.getElementById("cmp-in").value = "conserta o login";
  await openChatFromBar();
  assert.equal(st.open, null, "the chat that filled the screen is still hiding the one that just opened");
});

test("a draft already alone on the screen keeps the screen when the command comes again", () => {
  hive(["worker"]);
  const first = openDraft();
  st.open = first.key;
  const again = openDraft();
  assert.equal(again, first, "a second empty draft opened on top of the idle one");
  assert.equal(st.open, first.key, "the draft the person is writing in lost the screen");
  shut(first);
});
