import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { bringSeatIn, tidy } = await app("blocks");
const { paintFrontsOfChat } = await app("chat-and-panes");
const { goTo, openTile } = await app("focus-navigation");

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

test("asking to see a front is what gives it a place on the screen", () => {
  lay(["plano"]);
  fleet([
    { name: "plano", where: "local", state: "idle" },
    { name: "loja-do-livro", where: "local", state: "working", by: "plano" },
  ]);
  tidy();
  assert.equal(bringSeatIn("loja-do-livro"), true);
  assert.deepEqual(keysOf(), [["plano", "loja-do-livro"]]);
  assert.equal(bringSeatIn("loja-do-livro"), false, "asking twice must not duplicate the tile");
  tidy();
  assert.deepEqual(keysOf(), [["plano", "loja-do-livro"]], "the tidy pass took the front back off the screen");
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
  assert.ok(st.blocks.some((b) => b.keys.includes("feriados-e-prazo")), "clicking a front did not bring it to the screen");
});

test("a front is reachable from anywhere that goes to a chat, not only from the panel", () => {
  lay(["plano"]);
  fleet([
    { name: "plano", where: "local", state: "idle" },
    { name: "loja-do-livro", where: "local", state: "working", by: "plano" },
  ]);
  tidy();
  goTo("loja-do-livro");
  assert.ok(st.blocks.some((b) => b.keys.includes("loja-do-livro")), "the field, the day screen and the palette all go through goTo");
  st.open = "";
  openTile("loja-do-livro");
  assert.equal(st.open, "loja-do-livro");
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
