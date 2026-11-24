import { test } from "node:test";
import assert from "node:assert/strict";
import { resayCommand, sayGate } from "../engine/protocol.mjs";

function heldGate() {
  const gate = sayGate();
  gate.push({ text: "first", images: [], cid: "c1" });
  gate.push({ text: "second", images: [], cid: "c2" });
  return gate;
}

test("a queued message is rewritten in place and the chat hears it", () => {
  const gate = heldGate();
  const said = [];
  const answer = resayCommand(gate, { target: "c2", text: "  second, reworded  ", images: ["/tmp/a.png", 7] }, (event) => said.push(event));
  assert.deepEqual(answer, { ok: true });
  assert.deepEqual(said, [{ type: "driver", subtype: "resaid", cid: "c2", text: "second, reworded", images: ["/tmp/a.png"] }]);
  assert.equal(gate.unsay("c2").text, "second, reworded");
});

test("an image without words goes back as an image", () => {
  const gate = heldGate();
  const answer = resayCommand(gate, { target: "c2", text: "", images: ["/tmp/a.png"] }, () => {});
  assert.deepEqual(answer, { ok: true });
  assert.equal(gate.unsay("c2").text, "(image)");
});

test("nothing to say is refused and the message keeps its words", () => {
  const gate = heldGate();
  const answer = resayCommand(gate, { target: "c2", text: "   ", images: [] }, () => {});
  assert.equal(answer.ok, false);
  assert.equal(gate.unsay("c2").text, "second");
});

test("a message that already left the queue is a miss, not a new message", () => {
  const gate = heldGate();
  const said = [];
  const answer = resayCommand(gate, { target: "c9", text: "late" }, (event) => said.push(event));
  assert.equal(answer.ok, false);
  assert.deepEqual(said, []);
});
