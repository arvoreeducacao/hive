import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views, state } from "./dom.mjs";

await views();
const { openSeatPicker, closeSeatPicker } = await app("chat-and-panes");
const { providerTransferState } = await app("provider-transfer");
const { getStructured } = await app("chat-stretches");
const st = await state();

let sequence = 0;
function bench(t) {
  const e = getStructured({ name: `transfer-${++sequence}`, where: "local", agent: "claude", model: "opus" });
  document.body.appendChild(e.host);
  e.agent = "claude";
  e.model = "opus";
  e.catalog = [{ value: "opus", label: "Opus" }];
  st.providers = [{ id: "claude", ready: true }, { id: "codex", ready: true }, { id: "kimi", ready: false }];
  t.after(() => { closeSeatPicker(e); e.host.remove(); });
  return e;
}

test("the existing picker browses another available provider without changing the active model", async (t) => {
  const e = bench(t);
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ json: async () => ({ models: [{ value: "gpt", label: "GPT test" }] }) });
  t.after(() => { globalThis.fetch = original; });
  openSeatPicker(e, "model");
  assert.equal(e.menu.el.querySelector('[aria-label="kimi"]'), null);
  e.menu.el.querySelector('[aria-label="codex"]').click();
  await new Promise((done) => setTimeout(done, 0));
  assert.match(e.menu.el.textContent, /GPT test/);
  assert.equal(e.agent, "claude");
  assert.equal(e.model, "opus");
});

test("progress keeps the draft and failures leave the composer available", (t) => {
  const e = bench(t);
  const input = e.host.querySelector("textarea");
  input.value = "Continue with the same API";
  providerTransferState(e, { phase: "starting", agent: "codex" });
  assert.equal(e.host.querySelector('[role="status"]').hidden, false);
  assert.equal(e.host.querySelector(".sv-composer").getAttribute("aria-busy"), "true");
  assert.equal(input.value, "Continue with the same API");
  providerTransferState(e, { phase: "failed", error: "model unavailable" });
  assert.equal(e.providerTransfer, null);
  assert.equal(e.host.querySelector(".sv-composer").getAttribute("aria-busy"), "false");
  assert.match(e.host.querySelector('[role="status"]').textContent, /model unavailable/);
  assert.equal(input.value, "Continue with the same API");
});

test("reconnecting after an old transfer keeps the current model and active turn", async (t) => {
  const e = bench(t);
  const { watchProviderTransfer } = await app("provider-transfer");
  e.agent = "codex";
  e.model = "newer-model";
  e.turnOpen = true;
  const catalog = e.catalog;
  e.ws = { readyState: 1, send(text) {
    const cmd = JSON.parse(text);
    assert.equal(cmd.op, "transferStatus");
    e.pending.get(cmd.cid)({ ok: true, data: { id: "old", phase: "done", agent: "codex", model: "old-model" } });
    e.pending.delete(cmd.cid);
  } };
  await watchProviderTransfer(e);
  assert.equal(e.model, "newer-model");
  assert.equal(e.turnOpen, true);
  assert.equal(e.catalog, catalog);
  assert.equal(e.providerTransfer, null);
});
