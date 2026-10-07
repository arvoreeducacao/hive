import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { labelOf, ofBlock } = await app("blocks");

const labelFor = (keys, sessions, spawning = []) => {
  st.LIMIT = 4;
  st.block = 0;
  st.seatsKnown = true;
  st.data = { sessions, spawning };
  const b = { id: "b1", label: "", manual: false, keys: [...keys] };
  return labelOf(b, ofBlock(b));
};

test("a seat keeps its own driver kind without stealing the tab's label", () => {
  const seats = [
    { name: "remover-toasts", title: "remover os toasts", kind: "chat" },
    { name: "area-pedidos-tech", title: "área de pedidos", kind: "structured" }
  ];
  const one = labelFor(["remover-toasts"], seats);
  assert.equal(one.txt, "remover os toasts");
  const two = labelFor(["remover-toasts", "area-pedidos-tech"], seats);
  assert.equal(two.txt, "remover os toasts +1");
});

test("only a block with nothing but jobs in it is still starting", () => {
  const seated = labelFor(["remover-toasts"], [{ name: "remover-toasts", title: "remover os toasts", kind: "chat" }]);
  assert.notEqual(seated.txt, "starting…");
  const onlyJobs = labelFor(["job:1"], [], [{ id: "1", title: "abrindo" }]);
  assert.equal(onlyJobs.txt, "starting…");
});
