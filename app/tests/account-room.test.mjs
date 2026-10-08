import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { accountRoomSay, paintProviders } = await app("providers");

const accountRoom = (one) => accountRoomSay(one);

const painted = (one) => {
  st.providersTrouble = "";
  st.providers = [{ id: "claude", label: "Claude", name: "Claude", color: "#D97757", version: "2.0", enabled: true, installed: true, ready: true, why: "", order: [], accounts: [{ name: one.name, loggedIn: true, email: "ada@example.dev", tier: "", ...one }] }];
  st.providerOpen = "claude";
  st.providerTab = "accounts";
  document.getElementById("providers").hidden = false;
  paintProviders();
  return document.querySelector("#providers .pv-acc");
};

const inAnHour = Date.now() + 60 * 60 * 1000;
const anHourAgo = Date.now() - 60 * 60 * 1000;

test("an account nobody has spent says nothing at all", () => {
  assert.equal(accountRoom({ name: "default" }), "");
  assert.equal(accountRoom({ name: "default", spent: null }), "");
});

test("an account out of room says the hour it comes back", () => {
  const said = accountRoom({ name: "acme", spent: { until: inAnHour, why: "limit" } });
  assert.match(said, /out of room until \d\d:\d\d/);
  const row = painted({ name: "acme", spent: { until: inAnHour, why: "limit" } });
  assert.match(row.querySelector("small.out").textContent, /out of room until \d\d:\d\d/);
});

test("an hour that has already passed is not a warning any more", () => {
  assert.equal(accountRoom({ name: "acme", spent: { until: anHourAgo, why: "limit" } }), "");
  assert.equal(painted({ name: "acme", spent: { until: anHourAgo, why: "limit" } }).querySelector("small.out"), null);
});

test("a mark with no hour on it is not painted as a wait with no end", () => {
  assert.equal(accountRoom({ name: "acme", spent: { until: 0, why: "spent" } }), "");
});

test("a login that fell out is a different sentence, because signing in again is the fix", () => {
  const said = accountRoom({ name: "acme", spent: { until: 0, why: "login" } });
  assert.match(said, /sign in again/);
  assert.doesNotMatch(said, /out of room until/);
});

test("an account signed in again is not still called signed out by an old mark", () => {
  assert.equal(accountRoom({ name: "acme", loggedIn: true, spent: { until: 0, why: "login" } }), "");
  assert.equal(painted({ name: "acme", loggedIn: true, spent: { until: 0, why: "login" } }).querySelector("small.out"), null);
});

test("an account signed out is offered the sign-in, default included", () => {
  const signIn = (one) => painted(one).querySelector("[data-pv-signin]");
  assert.equal(signIn({ name: "default", loggedIn: false }).dataset.pvSignin, "default");
  assert.equal(signIn({ name: "acme", loggedIn: false }).dataset.pvSignin, "acme");
  assert.equal(painted({ name: "acme", loggedIn: true }).querySelector("[data-pv-signin]"), null);
  assert.equal(painted({ name: "acme", loggedIn: false, blind: true }).querySelector("[data-pv-signin]"), null);
});

test("the screen paints the provider on the left and its logins on the right", () => {
  painted({ name: "default" });
  const item = document.querySelector("#providers .pv-item.here");
  assert.ok(item, "the open provider is marked in the list");
  assert.match(item.textContent, /Claude/);
  assert.equal(document.querySelector("#providers .pv-switch").getAttribute("aria-checked"), "true");
  assert.ok(document.getElementById("pv-add"), "the add-a-login form is on the accounts tab");
  assert.ok(document.getElementById("pv-name"), "with its nickname field");
});

test("a provider that is not on this machine paints its switch off and disabled", () => {
  st.providersTrouble = "";
  st.providers = [{ id: "codex", label: "Codex", name: "Codex", color: "#10A37F", version: "", enabled: true, installed: false, ready: false, why: "", order: [], accounts: [] }];
  st.providerOpen = "codex";
  st.providerTab = "accounts";
  document.getElementById("providers").hidden = false;
  paintProviders();
  for (const sw of document.querySelectorAll("#providers .pv-switch")) {
    assert.equal(sw.getAttribute("aria-checked"), "false");
    assert.equal(sw.disabled, true);
  }
});
