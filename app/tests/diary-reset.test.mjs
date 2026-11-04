import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";
await views();
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");

function seat() {
  const e = getStructured({ name: `diary-reset-${Math.random().toString(36).slice(2, 8)}`, where: "local" });
  document.body.appendChild(e.host);
  e.ws = { readyState: 1, send(text) {
    const cmd = JSON.parse(text);
    const done = e.pending.get(cmd.cid);
    e.pending.delete(cmd.cid);
    done?.(cmd.type === "state" ? { ok: true, working: false, seq: 3 } : { ok: false });
  } };
  return e;
}

const bash = (seq) => ({ seq, type: "assistant", message: { id: `m${seq}`, role: "assistant", content: [{ type: "tool_use", id: `t${seq}`, name: "Bash", input: { command: "gh run watch 1" } }] } });

test("a reopened seat's new diary is painted, and the dead driver's Bash stops running", () => {
  const e = seat();
  svEvent(e, { seq: 180693, type: "driver", subtype: "turn_started" });
  svEvent(e, bash(180694));
  assert.equal(e.turnOpen, true);
  assert.match(e.activity, /Bash/i);

  svEvent(e, { seq: 1, type: "system", subtype: "init", working: false });
  assert.equal(e.lastSeq, 180694, "without the reset the new diary is dropped as already painted");

  svEvent(e, { type: "driver", subtype: "diary_reset" });
  assert.equal(e.turnOpen, false);
  assert.equal(e.activity, "");
  assert.equal(e.lastSeq, 0);
  assert.equal(e.host.querySelector(".sv-composer").classList.contains("running"), false);

  svEvent(e, { seq: 1, type: "system", subtype: "init", working: false });
  svEvent(e, { seq: 2, type: "user", message: { role: "user", content: [{ type: "text", text: "e ai amigao?" }] } });
  assert.equal(e.lastSeq, 2);
  assert.ok(JSON.stringify(e.conv.blocks).includes("e ai amigao?"), "the message sent to the new driver never reached the conversation");
});
