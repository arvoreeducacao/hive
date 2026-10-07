import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { paintPills, openSeatPicker, closeSeatPicker } = await app("chat-and-panes");
const { spawnPayloadOf } = await app("draft-seat");
const levels = ["low", "medium", "high", "xhigh", "max", "ultra"];

function draft() {
  const host = document.createElement("div");
  host.innerHTML = '<div class="sv-composer"><button class="sv-pill-model"></button><button class="sv-pill-effort"></button><textarea></textarea></div>';
  document.body.appendChild(host);
  const e = {
    draft: true, name: "draft:codex-test", agent: "codex", where: "local", model: "gpt-6-astra", effort: "", host,
    catalog: [{ value: "gpt-6-astra", label: "GPT-6-Astra", defaultEffort: "low", efforts: levels.map((value) => ({ value, label: value })) }],
  };
  return { e, where: "local", kind: "structured" };
}

test("a new Astra chat exposes all thinking levels and sends the selected level", () => {
  const d = draft();
  try {
    paintPills(d.e);
    assert.equal(d.e.host.querySelector(".sv-pill-effort").disabled, false);
    openSeatPicker(d.e, "effort");
    const rows = [...d.e.menu.el.querySelectorAll(".sv-row")];
    assert.deepEqual(rows.map((row) => row.querySelector("b").textContent), levels);
    rows.at(-1).click();
    assert.equal(d.e.effort, "ultra");
    assert.equal(d.e.host.querySelector(".sv-pill-effort .txt").textContent, "Ultra");
    assert.equal(spawnPayloadOf(d, "fix the integration").effort, "ultra");
  } finally { closeSeatPicker(d.e); d.e.host.remove(); }
});

test("switching to a model without the selected level clears it before creating the chat", () => {
  const d = draft();
  try {
    d.e.effort = "ultra";
    d.e.catalog.push({ value: "gpt-5.6-luna", label: "GPT-5.6-Luna", efforts: [{ value: "low" }] });
    openSeatPicker(d.e, "model");
    const row = [...d.e.menu.el.querySelectorAll(".sv-row")].find((node) => node.textContent.includes("GPT-5.6-Luna"));
    assert.ok(row);
    row.click();
    assert.equal(d.e.model, "gpt-5.6-luna");
    assert.equal(d.e.effort, "");
    assert.equal(spawnPayloadOf(d, "fix it").effort, undefined);
  } finally { closeSeatPicker(d.e); d.e.host.remove(); }
});
