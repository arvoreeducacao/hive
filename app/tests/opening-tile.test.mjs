import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { render } = await app("arrange");
const { tiles, jobName, justCreated } = await app("leader-key");

window.hiveLink = window.hiveLink || { open: (path, handlers) => ({ path, send() {}, close() { handlers?.close?.(); } }) };

const onCanvas = () => [...document.querySelectorAll("#canvas .tile")].filter((t) => !t.dataset.gone);

const seat = (name, extra = {}) => ({ name, title: name, where: "local", state: "working", kind: "structured", structured: true, agent: "kimi", ...extra });

function hive({ sessions, spawning, keys }) {
  st.LIMIT = 4;
  st.data = { sessions, spawning, archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a" }];
  st.space = "a";
  st.blocks = [{ id: "blk0", ws: "a", label: "", manual: false, keys }];
  st.block = 0;
  st.focus = 0;
  st.seatsKnown = true;
  st.mirrorDev = "";
  st.holding = "";
}

const job = { id: "n7", name: "testando", where: "local", step: "starting", mission: "Testando", error: "", model: "kimi-code/k3", at: Date.now(), naming: false, settled: true };

test("a chat asked for is a seat tile from the start, in an opening state, and the seat that follows paints that same element", () => {
  hive({ sessions: [], spawning: [job], keys: ["job:n7"] });
  st.open = "job:n7";
  render();
  const opening = document.querySelector("#canvas .tile");
  assert.ok(opening, "a tile is on the canvas while the chat opens");
  assert.ok(opening.classList.contains("opening"));
  assert.ok(!opening.classList.contains("spawning"), "not the old first-flight card");
  assert.equal(opening.dataset.name, "testando");
  assert.equal(tiles.get("job:n7"), opening);
  assert.equal(tiles.get("testando"), opening);
  assert.match(opening.querySelector(".well .badge").textContent, /starting/);
  assert.ok(opening.classList.contains("open"), "the open chat is this tile even before the seat is alive");

  st.data = { ...st.data, sessions: [seat("testando")], spawning: [{ ...job, landed: 1 }] };
  render();
  const born = document.querySelectorAll("#canvas .tile");
  assert.equal(born.length, 1, "one tile, not one leaving and one arriving");
  assert.equal(born[0], opening, "the very same element");
  assert.ok(!opening.classList.contains("opening"));
  assert.deepEqual([...st.blocks[0].keys], ["testando"]);
  assert.equal(st.open, "testando");
  assert.ok(opening.isConnected);

  st.data = { ...st.data, spawning: [] };
  render();
  assert.equal(document.querySelectorAll("#canvas .tile").length, 1);
  assert.equal(document.querySelector("#canvas .tile"), opening);
  st.open = null;
});

test("a job with no name yet still gets the first-flight card", () => {
  hive({ sessions: [], spawning: [{ ...job, id: "n8", name: "" }], keys: ["job:n8"] });
  render();
  const card = document.querySelector("#canvas .tile");
  assert.ok(card.classList.contains("spawning"));
  assert.ok(!card.classList.contains("opening"));
  assert.ok(!tiles.has(""), "no tile registered under an empty name");
});

test("the tile stands from the enter itself, before the roster has heard of the job, and survives every repaint", () => {
  hive({ sessions: [], spawning: [], keys: ["job:n10"] });
  justCreated.set("n10", Date.now());
  jobName.set("n10", "novo-chat");
  render();
  const el = onCanvas()[0];
  assert.ok(el, "a tile is on the canvas the moment the chat is asked for");
  assert.ok(el.classList.contains("opening"));
  assert.equal(el.dataset.name, "novo-chat");
  assert.equal(tiles.get("novo-chat"), el);
  render();
  render();
  assert.ok(el.isConnected, "a repaint never takes the opening tile off the canvas");
  assert.ok(!el.dataset.gone, "the alias under the seat name is not swept as a stray tile");
  assert.equal(onCanvas().length, 1);
  st.data.spawning = [{ ...job, id: "n10", name: "novo-chat" }];
  render();
  assert.equal(onCanvas()[0], el);
  assert.equal(tiles.get("job:n10"), el);
});

test("when the server settles on another free name, the seat still lands on the same tile", () => {
  hive({ sessions: [], spawning: [{ ...job, id: "n9", name: "repetido" }], keys: ["job:n9"] });
  render();
  const el = onCanvas()[0];
  st.data.spawning = [{ ...job, id: "n9", name: "repetido-2" }];
  render();
  assert.equal(tiles.get("repetido-2"), el);
  st.data.sessions = [seat("repetido-2")];
  render();
  assert.equal(onCanvas()[0], el);
  assert.ok(!el.classList.contains("opening"));
  assert.deepEqual([...st.blocks[0].keys], ["repetido-2"]);
});

test("a chat drawn before the server named it still turns into the live chat, instead of a card frozen on starting", () => {
  hive({ sessions: [], spawning: [{ ...job, id: "n11", name: "", settled: false }], keys: ["job:n11"] });
  render();
  assert.ok(tiles.get("job:n11").classList.contains("spawning"));

  st.data = { ...st.data, spawning: [{ ...job, id: "n11", name: "voo" }] };
  render();
  const named = onCanvas();
  assert.equal(named.length, 1);
  assert.ok(named[0].classList.contains("opening"), "once the chat has a name, its tile is the one that becomes the chat");

  st.data = { ...st.data, sessions: [seat("voo")], spawning: [{ ...job, id: "n11", name: "voo", landed: 1 }] };
  render();
  const live = onCanvas();
  assert.equal(live.length, 1);
  assert.ok(!live[0].classList.contains("spawning"), "the first-flight card would never update again");
  assert.ok(!live[0].classList.contains("opening"));
  assert.equal(live[0].dataset.name, "voo");
  assert.deepEqual([...st.blocks[0].keys], ["voo"]);
});
