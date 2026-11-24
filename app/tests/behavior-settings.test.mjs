import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
const sent = [];
globalThis.fetch = async (url, init) => {
  const body = init?.body ? JSON.parse(init.body) : null;
  sent.push({ url: String(url), body });
  const config = { ...(body?.config || {}) };
  return { ok: true, json: async () => (String(url).includes("/api/config") ? { config } : { ok: true }) };
};

await views();
const behavior = await app("behavior-settings");
const { adoptBehavior, setConfirm } = behavior;
const { confirmBefore } = await app("confirmations");
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 5)); };

const flipOn = (id) => document.getElementById(id).classList.contains("on");
const checked = (id) => [...document.querySelectorAll(`#${id} button[data-value]`)].find((one) => one.getAttribute("aria-checked") === "true")?.dataset.value;

test("a config with none of the new settings paints the hive of today", () => {
  adoptBehavior({ config: {} });
  assert.equal(checked("f-effort-style"), "word");
  assert.equal(checked("f-background"), "balanced");
  assert.equal(document.getElementById("f-provider-check").value, "auto");
  assert.equal(document.getElementById("f-text-writer").value, "");
  assert.equal(flipOn("t-slash-skills"), true);
  assert.equal(flipOn("t-devices"), true);
  assert.equal(flipOn("t-device-agents"), true);
  assert.equal(flipOn("t-confirm-unpin"), false);
  assert.equal(flipOn("t-confirm-archive"), false);
  assert.equal(flipOn("t-confirm-close-chat"), true);
  assert.equal(flipOn("t-confirm-close-terminal"), true);
});

test("what the file says is what the screen shows", () => {
  adoptBehavior({ config: { effortStyle: "bars", background: "economy", providerCheck: "5m", devices: false, confirm: { archive: true, closeChat: false } } });
  assert.equal(st.effortStyle, "bars");
  assert.equal(checked("f-effort-style"), "bars");
  assert.equal(checked("f-background"), "economy");
  assert.equal(document.getElementById("f-provider-check").value, "5m");
  assert.equal(flipOn("t-devices"), false);
  assert.equal(document.getElementById("t-device-agents").disabled, true, "agents cannot be given what devices off takes away");
  assert.equal(confirmBefore("archive"), true);
  assert.equal(confirmBefore("closeChat"), false);
  assert.equal(confirmBefore("closeTerminal"), true);
  adoptBehavior({ config: {} });
});

test("a click on a switch saves just that key, and confirm goes whole so no other answer is lost", async () => {
  sent.length = 0;
  document.getElementById("t-slash-skills").click();
  await settle();
  assert.deepEqual(sent.find((one) => one.url.includes("/api/config")).body, { config: { slashSkills: false } });
  sent.length = 0;
  setConfirm("closeTerminal", false);
  await settle();
  document.getElementById("t-confirm-archive").click();
  await settle();
  const last = sent.filter((one) => one.url.includes("/api/config")).pop().body.config;
  assert.deepEqual(last, { confirm: { closeTerminal: false, archive: true } });
  adoptBehavior({ config: {} });
});

test("the segments move with the arrows, Home and End, and keep the focus", async () => {
  const host = document.getElementById("f-background");
  host.querySelector('button[data-value="balanced"]').focus();
  host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await settle();
  assert.equal(st.background, "performance");
  assert.ok(document.activeElement === host.querySelector('button[data-value="performance"]'));
  host.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
  await settle();
  assert.equal(st.background, "economy");
  host.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  await settle();
  assert.equal(st.background, "performance");
  assert.equal([...host.querySelectorAll("button")].filter((one) => one.tabIndex === 0).length, 1, "one stop in the tab order");
  adoptBehavior({ config: {} });
});
