import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });
window.hiveLink = window.hiveLink || { open: () => ({ send() {}, close() {} }) };

const st = await state();
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { paintYards, webOfSeat } = await app("chat-and-panes");
const { openPageInASeat } = await app("page-in-a-seat");
const { drafts } = await app("draft-seat");

const SHELF = {
  repo: "https://github.com/acme/artifacts",
  me: "art",
  pages: [{
    slug: "guarda-roupa-do-avatar-do-hive", title: "Guarda-roupa do avatar do Hive", label: "in-review", owner: "art", at: 20,
    tabs: { documento: { versions: [{ n: 1, label: "in-review", at: 20 }] } }
  }]
};

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat", raw: "idle" });
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (where) => {
  const path = String(where);
  if (path.startsWith("/api/hive")) return Promise.resolve(answered({ sessions: [seat("atendimento-leitura")], spawning: [], archived: [], pod: { up: false, name: "" } }));
  if (path.startsWith("/api/shelf")) return Promise.resolve(answered(SHELF));
  return Promise.resolve(answered({}));
};
after(() => { globalThis.fetch = realFetch; });
window.hiveOpenShelf = () => {};

if (!document.getElementById("webyard")) {
  const yard = document.createElement("div");
  yard.id = "webyard";
  document.body.appendChild(yard);
}

bootSolid();

function hive() {
  st.LIMIT = 6;
  st.data = { sessions: [seat("atendimento-leitura")], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["atendimento-leitura"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.shelf = SHELF;
  st.published = [];
  st.shelfOpen = null;
  st.webChat = null;
  for (const name of [...webOfSeat.keys()]) webOfSeat.delete(name);
  for (const one of [...drafts.values()]) { one.e.host.remove(); drafts.delete(one.id); }
  document.getElementById("webyard").innerHTML = "";
  render();
}

test("the empty chat a page opens in is dressed like an open seat, so the pane has a place on the grid", async () => {
  hive();
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  const key = st.webChat;
  assert.ok(String(key).startsWith("draft:"));
  assert.equal(st.open, key, "the chat did not take the screen, so nothing would show the pane");
  const tile = document.querySelector(`.tile.draft[data-name="${key}"]`);
  assert.ok(tile, "the yard finds the tile by data-name, and the draft tile had none");
  assert.ok(tile.classList.contains("open"), "without .open the .arting grid never places the pane");
  assert.ok(tile.classList.contains("arting"));
  assert.ok(tile.querySelector(".art.web .art-stage"), "the pane was never painted into the tile");
});

test("the page gets a frame of its own even though the chat is not a seat yet", async () => {
  hive();
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  const key = st.webChat;
  paintYards();
  const yard = document.querySelector(`#webyard .yard[data-name="${key}"]`);
  assert.ok(yard, "the yard only knows seats the server lists, and an empty chat is not one of them yet");
  const frame = yard.querySelector("webview");
  assert.ok(frame, "no webview was born for the page");
  assert.match(String(frame.dataset.here), /guarda-roupa-do-avatar-do-hive/, "the frame is not pointed at the page");
  assert.ok(webOfSeat.has(key), "the tab was swept away as belonging to a dead seat");
});

test("a chat that was discarded loses its frame like any seat that left", async () => {
  hive();
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  const key = st.webChat;
  paintYards();
  assert.ok(document.querySelector(`#webyard .yard[data-name="${key}"]`));
  st.blocks[0].keys = st.blocks[0].keys.filter((k) => k !== key);
  paintYards();
  assert.equal(document.querySelector(`#webyard .yard[data-name="${key}"]`), null, "the frame outlived the chat");
});
