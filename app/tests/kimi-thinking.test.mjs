import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { paintPills, openSeatPicker, closeSeatPicker, runNativeCommand } = await app("chat-and-panes");
const { spawnPayloadOf } = await app("draft-seat");

function draft(kind = "structured") {
  const host = document.createElement("div");
  host.innerHTML = '<div class="sv-composer"><button class="sv-pill-model"></button><button class="sv-pill-effort"></button><textarea></textarea></div>';
  document.body.appendChild(host);
  return {
    kind, where: "local",
    e: { draft: true, draftKind: kind, name: "draft:kimi-test", agent: "kimi", where: "local", model: "kimi-code/k3", effort: "", host,
      catalog: [{ value: "kimi-code/k3", label: "K3", defaultEffort: "on", efforts: ["low", "high", "max", "on"].map((value) => ({ value, label: `Thinking ${value}` })) }],
    },
  };
}

test("a new K3 native chat offers its thinking levels and sends the clicked choice locally and to the cloud", () => {
  const d = draft();
  try {
    paintPills(d.e);
    assert.equal(d.e.host.querySelector(".sv-pill-effort").disabled, false);
    openSeatPicker(d.e, "effort");
    const rows = [...d.e.menu.el.querySelectorAll(".sv-row")];
    assert.deepEqual(rows.map((row) => row.querySelector("b").textContent), ["Thinking low", "Thinking high", "Thinking max", "Thinking on"]);
    rows[2].click();
    assert.equal(d.e.host.querySelector(".sv-pill-effort .txt").textContent, "Max");
    assert.equal(spawnPayloadOf(d, "fix it").effort, "max");
    d.where = "cloud";
    assert.equal(spawnPayloadOf(d, "fix it").effort, "max");
  } finally { closeSeatPicker(d.e); d.e.host.remove(); }
});

test("changing to a Kimi model with mandatory thinking drops an unsupported effort", () => {
  const d = draft();
  try {
    d.e.effort = "max";
    d.e.catalog.push({ value: "kimi-code/kimi-for-coding", label: "K2.7 Coding", defaultEffort: "on", efforts: [{ value: "on", label: "Thinking On" }] });
    openSeatPicker(d.e, "model");
    [...d.e.menu.el.querySelectorAll(".sv-row")].find((row) => row.textContent.includes("K2.7 Coding")).click();
    assert.equal(d.e.effort, "");
    assert.equal(d.e.host.querySelector(".sv-pill-effort .txt").textContent, "On");
    assert.equal(spawnPayloadOf(d, "fix it").effort, undefined);
  } finally { closeSeatPicker(d.e); d.e.host.remove(); }
});

test("a Kimi terminal draft does not promise a thinking flag its CLI cannot accept", () => {
  const d = draft("terminal");
  try {
    d.e.effort = "max";
    paintPills(d.e);
    assert.equal(d.e.host.querySelector(".sv-pill-effort").disabled, true);
    assert.equal(spawnPayloadOf(d, "fix it").effort, undefined);
  } finally { closeSeatPicker(d.e); d.e.host.remove(); }
});

function connect(d) {
  const sent = [];
  Object.assign(d.e, { draft: false, effort: "low", tag: "kimi-test", cmdSeq: 0, pending: new Map(), conv: { seq: 0, blocks: [], subs: [], run: null } });
  d.e.ws = {
    readyState: 1,
    send(text) {
      const cmd = JSON.parse(text);
      sent.push(cmd);
      const models = [{ ...d.e.catalog[0], defaultEffort: "high", efforts: d.e.catalog[0].efforts.filter((level) => level.value !== "on") }];
      d.e.pending.get(cmd.cid)({ ok: true, data: { effort: "high", models } });
      d.e.pending.delete(cmd.cid);
    },
  };
  return sent;
}

test("an open chat uses Kimi's confirmed level and refreshed choices after a picker click", async () => {
  const d = draft();
  try {
    const sent = connect(d);
    openSeatPicker(d.e, "effort");
    [...d.e.menu.el.querySelectorAll(".sv-row")].at(-1).click();
    await new Promise(setImmediate);
    assert.equal(sent[0].op, "setEffort");
    assert.equal(sent[0].level, "on");
    assert.equal(d.e.effort, "high");
    assert.equal(d.e.host.querySelector(".sv-pill-effort .txt").textContent, "High");
    openSeatPicker(d.e, "effort");
    assert.equal(d.e.menu.el.querySelectorAll(".sv-row").length, 3);
  } finally { closeSeatPicker(d.e); d.e.host.remove(); }
});

test("the effort command also displays Kimi's resolved level instead of the requested alias", async () => {
  const d = draft();
  try {
    connect(d);
    await runNativeCommand(d.e, "effort", "on");
    assert.equal(d.e.effort, "high");
    assert.equal(d.e.conv.blocks.at(-1).text, "thinking → high");
    assert.equal(d.e.catalog[0].efforts.length, 3);
  } finally { closeSeatPicker(d.e); d.e.host.remove(); }
});
