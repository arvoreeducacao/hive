import test from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { goToBlock } = await app("focus-navigation");
const { render } = await app("arrange");

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive() {
  st.LIMIT = 4;
  st.data = { sessions: ["s1", "s2", "s3"].map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a", tint: "#111" }];
  st.space = "a";
  st.blocks = [["s1"], ["s2"], ["s3"]].map((keys, i) => ({ id: `blk${i}`, ws: "a", label: "", manual: true, keys }));
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.mirrorDev = "";
  st.holding = "";
}

const num = () => document.querySelector("#strip .num")?.textContent;
const pressed = () => [...document.querySelectorAll("#blocks button[data-i]")].map((b) => b.getAttribute("aria-pressed"));
const railNames = () => [...document.querySelectorAll("#rail-sessions .item")].map((i) => i.dataset.name);
const tally = () => [...document.querySelectorAll("#blocks button[data-i] em")].map((e) => e.textContent);
const tallyOf = (bs) => bs.filter((b) => b.ws === st.space).map((b) => `${b.keys.length}/${st.LIMIT}`);

test("a render that falls after the canvas does not leave the strip, the tabs and the rail deaf", () => {
  hive();
  render();
  goToBlock(1);
  assert.equal(num(), "block 2 of 3");

  const calls = document.getElementById("n-calls");
  const home = calls.parentElement;
  const quiet = console.warn;
  const warned = [];
  console.warn = (...said) => warned.push(String(said[0]));
  calls.remove();

  st.data = { ...st.data, sessions: [...st.data.sessions, seat("s4")] };
  try { render(); } catch { /* an older render let the fall out, and solid's queue went with it */ }

  assert.ok(railNames().includes("s4"), "the rail saw the seat the render sat down in a block");
  assert.equal(st.blocks.some((b) => b.keys.includes("s4")), true);
  assert.deepEqual(tally(), tallyOf(st.blocks), "the tabs count the seats the blocks actually hold");
  assert.ok(warned.some((w) => /the render could not finish/.test(w)), "the fall is named instead of swallowed");

  home.appendChild(calls);
  console.warn = quiet;
  render();
});
