import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = () => Promise.resolve(answered({ sessions: [] }));
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function lay(names) {
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions: names.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: [...names] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.threadChat = null;
  st.reviewChat = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threads = [];
  st.prs = [];
  render();
}

function clickInsideHead(name, pick) {
  lay(["a", "b"]);
  const el = tiles.get(name);
  const target = pick(el);
  assert.ok(target, "the button the test aims at is not on the tile");
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  return { open: st.open, confirm: $("confirm").classList.contains("on") };
}

test("the close button asks, and does not open the seat on its way", () => {
  const said = clickInsideHead("a", (el) => el.querySelector(".t-close"));
  assert.equal(said.confirm, true, "the x has to raise the confirm");
  assert.equal(said.open, null, "the x also opened the seat — the click reached the side under it");
});

test("the other head buttons do not open the seat either", () => {
  for (const cls of ["t-web", "t-edit", "t-fold"]) {
    const said = clickInsideHead("a", (el) => el.querySelector(`.${cls}`));
    assert.equal(said.open, null, `${cls} opened the seat — the click reached the side under it`);
  }
});

test("the side itself still opens and closes the seat", () => {
  lay(["a", "b"]);
  const summary = tiles.get("a").querySelector(".summary");
  summary.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(st.open, "a", "clicking the card body has to open the seat");
  render();
  tiles.get("a").querySelector(".summary").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(st.open, null, "clicking it again has to put the seat back in the grid");
});

test("the close button names the chat by the name it has now, not the one it was born with", () => {
  lay(["a", "b"]);
  const written = "the name the person wrote";
  st.data.sessions = st.data.sessions.map((one) => (one.name === "a" ? { ...one, title: written, mine: true } : one));
  render();
  tiles.get("a").querySelector(".t-close").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal($("confirm").classList.contains("on"), true, "the x has to raise the confirm");
  assert.equal($("c-who").textContent, written,
    "the confirm named the chat by the title the tile was built with — a rename after that never reached the button");
});
