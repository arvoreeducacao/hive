import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { commentsHere, heardFromPage, paintShelf, pinsHere, talkParts } = await app("shelf");

const PAGE = {
  slug: "catalogacao-de-livros",
  title: "Catalogação de livros",
  label: "draft",
  owner: "guilherme",
  at: 1788892625580,
  tabs: {
    documento: { versions: [{ n: 1, label: "draft", at: 1, bytes: 100 }] },
    telas: { versions: [{ n: 1, label: "draft", at: 2, bytes: 200 }] }
  }
};

const COMMENTS = [
  { id: "c-1", tab: "telas", v: 1, who: "rick", at: 1788892700000, text: "o botão de baixo some no celular", pin: { frame: "f-3", name: "Opção B", x: 0.4, y: 0.6 }, done: false },
  { id: "c-2", tab: "telas", v: 1, who: "guilherme", at: 1788892800000, text: "no desktop também", re: "c-1", done: false },
  { id: "c-3", tab: "documento", v: 1, who: "ada", at: 1788892900000, text: "falta o número", done: false },
  { id: "c-4", tab: "telas", v: 1, who: "ada", at: 1788893000000, text: "a cor do chip", pin: { frame: "f-1", name: "Hoje", x: 0.1, y: 0.2 }, done: true, doneBy: "guilherme" }
];

const asked = [];
globalThis.fetch = async (url, init) => {
  asked.push({ url: String(url), init });
  return { json: async () => ({ me: "guilherme", comments: COMMENTS }) };
};

async function open(tab = "telas") {
  st.shelf = { repo: "https://github.com/arvoreeducacao/artefatos", me: "guilherme", pages: [PAGE] };
  st.shelfQuery = "";
  st.shelfWho = "team";
  st.shelfState = "";
  st.shelfShut = new Set();
  st.shelfAt = "";
  st.shelfOpen = PAGE.slug;
  st.shelfTab = tab;
  st.shelfVersion = 0;
  st.shelfTalk.slug = "";
  paintShelf();
  await new Promise((then) => setTimeout(then, 0));
  return {
    button: document.getElementById("sh-talk"),
    side: document.getElementById("sh-side"),
    items: [...document.querySelectorAll("#sh-side .sh-c")]
  };
}

test("opening a page asks the server for its comments and counts the ones on the open tab", async () => {
  const { button, side } = await open("telas");
  assert.ok(asked.some((one) => one.url === "/api/shelf/comments?slug=catalogacao-de-livros"));
  assert.equal(button.textContent, "comments · 3");
  assert.equal(side.hidden, true, "the panel stays shut until someone asks for it");
});

test("the panel lists the comments of the open tab, replies under their parent, pins numbered in order", async () => {
  st.shelfTalk.open = true;
  const { side, items } = await open("telas");
  assert.equal(side.hidden, false);
  assert.deepEqual(items.map((one) => one.dataset.id), ["c-1", "c-2", "c-4"]);
  assert.equal(items[1].dataset.reply, "yes");
  assert.equal(items[2].dataset.done, "yes");
  assert.deepEqual(pinsHere().map((one) => [one.id, one.n]), [["c-1", 1], ["c-4", 2]]);
  assert.deepEqual([...side.querySelectorAll(".sh-cn")].map((one) => one.textContent), ["1", "2"]);
});

test("switching to the documento tab shows that tab's comments and no pins", async () => {
  st.shelfTalk.open = true;
  const { items } = await open("documento");
  assert.deepEqual(commentsHere().map((one) => one.id), ["c-3"]);
  assert.deepEqual(items.map((one) => one.dataset.id), ["c-3"]);
  assert.deepEqual(pinsHere(), []);
});

test("a click on the page while marking becomes the pin of the comment being written", async () => {
  st.shelfTalk.open = false;
  await open("telas");
  heardFromPage({ type: "pin", frame: "f-2", name: "Opção A", x: 0.25, y: 0.75 });
  assert.deepEqual(st.shelfTalk.draftPin, { frame: "f-2", name: "Opção A", x: 0.25, y: 0.75 });
  assert.equal(st.shelfTalk.open, true, "the panel opens so the person can write");
  const ctx = talkParts().ctx;
  assert.equal(ctx.hidden, false);
  assert.equal(talkParts().ctxSay.textContent, "pinned to Opção A");
  talkParts().drop.click();
  assert.equal(st.shelfTalk.draftPin, null);
  assert.equal(talkParts().ctx.hidden, true);
});

test("a pin clicked on the page brings its comment into view", async () => {
  st.shelfTalk.open = false;
  await open("telas");
  heardFromPage({ type: "open", id: "c-4" });
  assert.equal(st.shelfTalk.open, true);
  const hot = document.querySelector('#sh-side .sh-c[data-hot="yes"]');
  assert.equal(hot?.dataset.id, "c-4");
});
