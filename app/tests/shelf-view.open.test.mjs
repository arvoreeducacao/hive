import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { openShelfPage, paintShelf, shelfBack } = await app("shelf");

const PAGE = {
  slug: "publicar-sem-claude-ai",
  title: "Publicar sem claude.ai",
  label: "em-revisao",
  owner: "joao",
  at: 1787428353481,
  tabs: { documento: { versions: [{ n: 1, label: "em-revisao", at: 1, bytes: 15150 }, { n: 2, label: "em-revisao-cadeia-dos-prs", at: 2, bytes: 15337 }] } }
};

function shelf({ open = null, tab = "documento", version = 0 } = {}) {
  st.shelf = { repo: "https://github.com/arvoreeducacao/artefatos", me: "joao", pages: [PAGE] };
  st.shelfQuery = "";
  st.shelfWho = "team";
  st.shelfState = "";
  st.shelfShut = new Set();
  st.shelfAt = "";
  st.shelfOpen = open;
  st.shelfTab = tab;
  st.shelfVersion = version;
  paintShelf();
  return {
    shelf: document.getElementById("shelf"),
    view: document.getElementById("sh-view"),
    frame: document.getElementById("sh-frame"),
    title: document.getElementById("sh-vtitle"),
    tabs: document.getElementById("sh-tabs"),
    foot: document.getElementById("sh-vf")
  };
}

test("opening a page shows the reader — the panel used to stay hidden and the screen went black", () => {
  const els = shelf({ open: PAGE.slug });
  assert.equal(els.shelf.dataset.on, "view");
  assert.equal(els.view.hidden, false, "the reader has to be visible, or nothing is");
});

test("the reader points at the page it was asked for", () => {
  const els = shelf({ open: PAGE.slug, version: 1 });
  assert.equal(els.frame.dataset.here, "/api/shelf/page?slug=publicar-sem-claude-ai&tab=documento&v=1");
  assert.equal(els.title.textContent, "Publicar sem claude.ai");
  assert.match(els.foot.textContent, /^a\/publicar-sem-claude-ai\/documento\.v1\.html {2}· {2}em-revisao {2}· {2}/);
});

test("with no version asked, the newest one opens", () => {
  const els = shelf({ open: PAGE.slug });
  assert.equal(els.frame.dataset.here, "/api/shelf/page?slug=publicar-sem-claude-ai&tab=documento&v=2");
  const rail = [...els.tabs.querySelectorAll(".sh-ver")];
  assert.deepEqual(rail.map((b) => b.textContent), ["v2", "v1"]);
  assert.deepEqual(rail.map((b) => b.getAttribute("aria-pressed")), ["true", "false"]);
});

test("a click on an older version turns the page back without leaving the reader", () => {
  const els = shelf({ open: PAGE.slug });
  els.tabs.querySelectorAll(".sh-ver")[1].dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(st.shelfVersion, 1);
  assert.equal(els.frame.dataset.here, "/api/shelf/page?slug=publicar-sem-claude-ai&tab=documento&v=1");
  assert.equal(els.view.hidden, false);
});

test("back on the gallery, the reader gets out of the way", () => {
  shelf({ open: PAGE.slug });
  shelfBack();
  assert.equal(document.getElementById("shelf").dataset.on, "gallery");
  assert.equal(document.getElementById("sh-view").hidden, true);
  assert.equal(st.shelfOpen, null);
});

test("the lente tab tells the page it is inside the hive, and which theme is worn", () => {
  const withLente = { ...PAGE, tabs: { ...PAGE.tabs, lente: { versions: [{ n: 1, label: "delivered", at: 3, bytes: 164000 }] } } };
  st.shelf = { repo: "https://github.com/arvoreeducacao/artefatos", me: "joao", pages: [withLente] };
  st.themeName = "";
  st.shelfOpen = withLente.slug;
  st.shelfTab = "lente";
  st.shelfVersion = 0;
  paintShelf();
  assert.equal(document.getElementById("sh-frame").dataset.here, "/api/shelf/page?slug=publicar-sem-claude-ai&tab=lente&v=1&embed=1&theme=dark");
  st.shelfTab = "documento";
  paintShelf();
  assert.equal(document.getElementById("sh-frame").dataset.here, "/api/shelf/page?slug=publicar-sem-claude-ai&tab=documento&v=2", "a document keeps the plain address: only the lente reads the hints");
});

test("opening a page lands on a tab it actually has, and on its newest version", () => {
  shelf({ open: null });
  openShelfPage(PAGE, "telas");
  assert.equal(st.shelfTab, "documento", "a tab the page never published is not a tab");
  assert.equal(st.shelfVersion, 0);
  assert.equal(document.getElementById("sh-frame").dataset.here, "/api/shelf/page?slug=publicar-sem-claude-ai&tab=documento&v=2");
});
