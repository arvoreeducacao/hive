import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { railViewModel } = await app("mirror");
const seat = (name, over = {}) => ({ name, where: "local", state: "idle", ...over });

test("the rail's view model comes from the store — local always, cloud only with a pod or a seat there", () => {
  st.data = { pod: { up: false, name: "" }, sessions: [seat("a")], archived: [] };
  st.blocks = [{ id: "b1", ws: "w1", keys: ["a"] }];
  st.block = 0;
  st.archOpen = false;
  assert.deepEqual(railViewModel().groups.map((g) => g.key), ["local"]);
  st.data = { pod: { up: true, name: "pod-1" }, sessions: [seat("a")], archived: [] };
  const groups = railViewModel().groups;
  assert.deepEqual(groups.map((g) => g.key), ["cloud", "local"]);
  assert.equal(groups[0].label, "cloud · pod-1");
  const [a] = groups[1].items;
  assert.equal(a.tag, "b1");
  assert.equal(a.here, true);
});
