import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

Object.defineProperty(globalThis.navigator, "platform", { value: "Linux x86_64", configurable: true });
await state();
const asked = [];
window.hiveMacPermissions = {
  now: async () => { asked.push("now"); return { mac: false, now: {} }; },
  open: async (kind) => { asked.push(kind); return { ok: false }; },
  hear: () => {}
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
await views();
const { openMacPermissions, macPermissionsHere } = await app("mac-permissions");
const { paintDevicesHere } = await app("behavior-settings");

test("off the Mac the permissions row stays hidden and the dialog never opens, though the app hands every platform the bridge", async () => {
  assert.equal(macPermissionsHere(), false);
  await paintDevicesHere();
  assert.equal(document.getElementById("perm-row").hidden, true);
  assert.equal(await openMacPermissions("microphone"), false);
  assert.deepEqual(asked, []);
});
