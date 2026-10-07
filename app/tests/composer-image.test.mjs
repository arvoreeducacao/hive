import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { $ } = await app("core");
const { imageTray } = await app("pinned-images");
const { composerSend } = await app("seat-layout");
const { structPool } = await app("structured-seats");
const { pool } = await app("leader-key");

const SHOT = "/hub/.hive/assets/mission-tela-1.png";

function bench(kind) {
  structPool.clear();
  pool.clear();
  const said = { text: "", images: null, typed: [] };
  if (kind === "structured") {
    structPool.set("oi", { ws: { readyState: 1 }, type: (text, images) => { said.text = text; said.images = images; } });
  } else {
    pool.set("oi", { ws: { readyState: 1, send: (chunk) => said.typed.push(chunk) } });
  }
  st.LIMIT = 4;
  st.data = { sessions: [{ name: "oi", where: "local", state: "idle", kind: kind === "structured" ? "structured" : "chat", structured: kind === "structured" }], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.blocks = [{ id: "b1", ws: "w0", label: "", manual: true, keys: ["oi"] }];
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.missionMode = false;
  st.seatsKnown = true;
  st.team = { me: "", sharing: false, devs: [] };
  const box = $("cmp-in");
  box.value = "";
  const tray = $("cmp-attach");
  for (const chip of [...tray.children]) chip.remove();
  st.cmpTray = imageTray(tray, box, () => ({ where: "local", name: "" }));
  return { said, box };
}

test("a picture sent from the bar reaches a structured seat as a picture, with the mark left in the words", () => {
  const b = bench("structured");
  b.box.value = "centraliza isso";
  st.cmpTray.add(SHOT);
  composerSend();
  assert.equal(b.said.text, "centraliza isso [Image #1]");
  assert.deepEqual(b.said.images, [SHOT]);
  assert.equal(b.box.value, "", "the box is emptied once the seat took it");
  assert.equal($("cmp-attach").querySelectorAll(".att").length, 0, "the tray lets the chip go with the message");
});

test("a tui seat has no channel for pictures, so the mark goes back to being the path", () => {
  const b = bench("chat");
  b.box.value = "centraliza isso";
  st.cmpTray.add(SHOT);
  composerSend();
  assert.equal(b.said.typed[0], `centraliza isso ${SHOT}`);
});
