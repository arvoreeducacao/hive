import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { activeItems, bringSeatIn, tidy } = await app("blocks");
const { paintFrontsOfChat } = await app("chat-and-panes");
const { closeTile, goTo, openTile } = await app("focus-navigation");
const { paintSubchatHead } = await app("subchat-head");

st.LIMIT = 4;

const fleet = (sessions, spawning = []) => {
  st.data = { sessions, spawning, archived: [], pod: { up: false, name: "" } };
  st.seatsKnown = true;
};

const lay = (keys) => {
  st.blocks = [{ id: "b0", ws: st.space, label: "", manual: false, keys: [...keys] }];
  st.block = 0;
  st.focus = 0;
};

const keysOf = () => st.blocks.map((b) => [...b.keys]);

test("a chat another chat opened takes no tile, while it is being born or once it is alive", () => {
  lay(["plano"]);
  fleet(
    [{ name: "plano", where: "local", state: "idle" }],
    [{ id: "n1", name: "loja-do-livro", where: "local", step: "starting", mission: "a loja", by: "plano" }]
  );
  tidy();
  assert.deepEqual(keysOf(), [["plano"]], "the front took a tile while it was being born");
  fleet([
    { name: "plano", where: "local", state: "idle" },
    { name: "loja-do-livro", where: "local", state: "working", by: "plano" },
  ]);
  tidy();
  assert.deepEqual(keysOf(), [["plano"]], "the front took a tile once it was alive");
});

test("a chat the person asked for herself still takes its tile", () => {
  lay(["plano"]);
  fleet(
    [{ name: "plano", where: "local", state: "idle" }],
    [{ id: "n2", name: "pedido-da-pessoa", where: "local", step: "starting", mission: "", by: "" }]
  );
  tidy();
  assert.deepEqual(keysOf(), [["plano", "job:n2"]]);
});

test("a front never takes a place in a block, not even when asked for, and one already saved there leaves it", () => {
  lay(["plano"]);
  fleet([
    { name: "plano", where: "local", state: "idle" },
    { name: "loja-do-livro", where: "local", state: "working", by: "plano" },
  ]);
  tidy();
  assert.equal(bringSeatIn("loja-do-livro"), false);
  assert.deepEqual(keysOf(), [["plano"]]);
  lay(["plano", "loja-do-livro"]);
  tidy();
  assert.deepEqual(keysOf(), [["plano"]], "a front saved in a block by an older Hive stayed there");
});

test("a front whose opener is gone is a chat like any other: asking to see it gives it a place", () => {
  lay(["outro"]);
  fleet([
    { name: "outro", where: "local", state: "idle" },
    { name: "loja-do-livro", where: "local", state: "working", by: "plano" },
  ]);
  tidy();
  assert.equal(bringSeatIn("loja-do-livro"), true);
  assert.deepEqual(keysOf(), [["outro", "loja-do-livro"]]);
});

test("the fronts of the open chat are read beside it, and one click brings one in", () => {
  lay(["plano"]);
  fleet(
    [
      { name: "plano", where: "local", state: "idle" },
      { name: "feriados-e-prazo", where: "cloud", state: "working", title: "o prazo de compra", by: "plano", model: "claude-opus-5" },
    ],
    [{ id: "n3", name: "loja-do-livro", where: "local", step: "starting", mission: "a loja", by: "plano" }]
  );
  st.open = "plano";
  const tile = document.createElement("div");
  tile.className = "tile open";
  paintFrontsOfChat(tile, { name: "plano", where: "local", state: "idle" });
  assert.ok(tile.classList.contains("fronting"));
  const rows = [...tile.querySelectorAll(".fr-row")];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector(".fr-name").textContent, "feriados-e-prazo");
  assert.equal(rows[0].dataset.state, "working");
  assert.equal(rows[1].dataset.state, "opening");
  assert.ok(rows[1].disabled, "a chat still being born cannot be opened yet");
  rows[0].dispatchEvent(new window.Event("click"));
  assert.equal(st.open, "feriados-e-prazo", "clicking a front did not open it");
  assert.ok(!st.blocks.some((b) => b.keys.includes("feriados-e-prazo")), "the front took a place in a block");
});

test("a front opens alone on the screen from anywhere that goes to a chat, and closing it gives the block back", () => {
  lay(["plano", "outro"]);
  st.focus = 1;
  fleet([
    { name: "plano", where: "local", state: "idle" },
    { name: "outro", where: "local", state: "idle" },
    { name: "loja-do-livro", where: "local", state: "working", by: "plano" },
  ]);
  tidy();
  st.open = null;
  goTo("loja-do-livro");
  assert.equal(st.open, "loja-do-livro", "the field, the day screen and the palette all go through goTo");
  assert.deepEqual(keysOf(), [["plano", "outro"]], "the front took a place in a block");
  assert.deepEqual(activeItems().map((it) => it.key), ["loja-do-livro"], "the open front is the only chat on the screen");
  closeTile();
  assert.equal(st.open, null);
  assert.equal(st.focus, 1, "closing the front lost the chat that was in focus");
  assert.deepEqual(activeItems().map((it) => it.key), ["plano", "outro"]);
  openTile("loja-do-livro");
  assert.equal(st.open, "loja-do-livro");
  st.open = null;
});

test("a name that belongs to no chat still goes nowhere", () => {
  lay(["plano"]);
  fleet([{ name: "plano", where: "local", state: "idle" }]);
  tidy();
  goTo("um-chat-que-nao-existe");
  assert.deepEqual(keysOf(), [["plano"]]);
});

test("a chat with no fronts of its own shows no panel", () => {
  lay(["plano"]);
  fleet([{ name: "plano", where: "local", state: "idle" }]);
  st.open = "plano";
  const tile = document.createElement("div");
  tile.className = "tile open";
  paintFrontsOfChat(tile, { name: "plano", where: "local", state: "idle" });
  assert.ok(!tile.classList.contains("fronting"));
  assert.equal(tile.querySelector(".fronts"), null);
});

test("a subchat open alone carries its own head: the way back to its opener, its siblings, and who sent the first message", () => {
  lay(["plano"]);
  const mission = "Copie os arquivos do prefixo fileslivros/ para o bucket novo, em lotes de 15 mil objetos.";
  fleet([
    { name: "plano", where: "local", state: "idle", title: "Migração de Bucket" },
    { name: "files", where: "local", state: "working", title: "Migrar fileslivros", by: "plano", asked: mission },
    { name: "capas", where: "local", state: "needs", title: "Migrar capas", by: "plano" },
  ]);
  tidy();
  st.open = "files";
  const tile = document.createElement("article");
  tile.className = "tile open";
  tile.innerHTML = `<div class="side"></div><div class="well"><div class="sv"><div class="sv-scroll"><div class="sv-user">${mission}</div><div class="sv-user">e agora?</div></div><form class="sv-composer"></form><div class="cp-place"></div></div></div>`;
  paintSubchatHead(tile, st.data.sessions[1]);
  assert.ok(tile.classList.contains("subchat-alone"));
  const head = tile.querySelector(":scope > .sub-head");
  assert.equal(head.querySelector(".sh-opener").textContent, "Migração de Bucket");
  assert.equal(head.querySelector(".sh-me").textContent, "Migrar fileslivros");
  assert.deepEqual([...head.querySelectorAll(".sh-sib")].map((b) => [b.dataset.subOpen, b.classList.contains("on")]), [["files", true], ["capas", false]]);
  assert.ok(tile.querySelector(".sv > .sub-note"), "the composer says who hears what");
  assert.deepEqual([...tile.querySelectorAll(".sv-user")].map((b) => b.classList.contains("from-opener")), [true, false], "only the mission is marked as the opener's");
  head.querySelector('[data-sub-open="capas"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(st.open, "capas", "a sibling opens in place");
  head.querySelector("[data-sub-back]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(st.open, null, "the back button gives the block back");
  paintSubchatHead(tile, st.data.sessions[1]);
  assert.ok(!tile.classList.contains("subchat-alone"));
  assert.ok(head.hidden, "a subchat that is not open alone has no head of its own");
});
