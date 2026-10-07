import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });
window.hiveLink = window.hiveLink || { open: () => ({ send() {}, close() {} }) };

const st = await state();
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { webOfSeat } = await app("chat-and-panes");
const { openPageInASeat } = await app("page-in-a-seat");
const { drafts, sendDraft } = await app("draft-seat");

const SHELF = {
  repo: "https://github.com/arvoreeducacao/artefatos",
  me: "art",
  pages: [{
    slug: "guarda-roupa-do-avatar-do-hive", title: "Guarda-roupa do avatar do Hive", label: "in-review", owner: "art", at: 20,
    tabs: { documento: { versions: [{ n: 1, label: "in-review", at: 20 }] } }
  }]
};

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat", raw: "idle" });
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
let spawned = null;
globalThis.fetch = (where, init) => {
  const path = String(where);
  if (path.startsWith("/api/spawn")) {
    spawned = init?.body ? JSON.parse(init.body) : null;
    return Promise.resolve(answered({ ok: true, id: "n1", name: "guarda-roupa-duvidas" }));
  }
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
  spawned = null;
  for (const name of [...webOfSeat.keys()]) webOfSeat.delete(name);
  for (const one of [...drafts.values()]) { one.e.host.remove(); drafts.delete(one.id); }
  document.getElementById("webyard").innerHTML = "";
  render();
}

async function pageDraft() {
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  const key = st.webChat;
  return drafts.get(String(key).slice(6));
}

test("a first message sent from the chat a page opened keeps the screen", async () => {
  hive();
  const d = await pageDraft();
  assert.equal(st.open, d.key, "the page never took the screen with its chat");
  await sendDraft(d, "me explica esse rfc");
  assert.equal(st.open, "job:n1", "the chat that just opened lost the screen back to the mosaic");
});

test("the first message carries the page link, so the seat knows what it is about", async () => {
  hive();
  const d = await pageDraft();
  await sendDraft(d, "me explica esse rfc");
  assert.ok(spawned, "the draft never asked for a seat");
  assert.equal(spawned.prompt, "hive://shelf/guarda-roupa-do-avatar-do-hive?tab=documento\nme explica esse rfc");
});

test("a link the person already pasted is not pasted twice", async () => {
  hive();
  const d = await pageDraft();
  await sendDraft(d, "me explica hive://shelf/guarda-roupa-do-avatar-do-hive?tab=documento");
  assert.equal(spawned.prompt, "me explica hive://shelf/guarda-roupa-do-avatar-do-hive?tab=documento");
});
