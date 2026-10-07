import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const source = (name) => readFileSync(join(HERE, "src/app", `${name}.js`), "utf8");
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
await views();
const { paintNewChatKinds, providerReady, providerWhyNot, readyAgents, statusOf } = await app("providers");

const provider = (id, over = {}) => ({ id, label: id, name: id, color: "#000000", version: "1", enabled: true, installed: true, ready: true, why: "", accounts: [{ name: "default", loggedIn: true }], order: ["default"], ...over });

test("before the list arrives every agent is offered, so an app that cannot reach its server keeps working", () => {
  st.providers = [];
  assert.equal(providerReady("kimi"), true);
  assert.deepEqual(readyAgents(), ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]);
});

test("an agent that is off, missing or signed out leaves the pickers, and the chat's own agent always stays", () => {
  st.providers = [provider("claude"), provider("codex", { ready: false, why: "Codex is turned off in providers" }), provider("kimi"), provider("kiro", { ready: false, installed: false, why: "Kiro is not installed on this machine" }), provider("cursor"), provider("opencode")];
  assert.deepEqual(readyAgents(), ["claude", "kimi", "cursor", "opencode"]);
  assert.deepEqual(readyAgents("codex"), ["claude", "codex", "kimi", "cursor", "opencode"]);
  assert.equal(providerWhyNot("kiro"), "Kiro is not installed on this machine");
});

test("the new-chat kinds hide the agents the pickers hide, and a hidden choice falls to the first one left", () => {
  st.providers = [provider("claude", { ready: false, why: "nobody is signed in to Claude" }), provider("codex"), provider("kimi", { ready: false, why: "off" }), provider("kiro"), provider("cursor", { ready: false, why: "off" }), provider("opencode")];
  const sel = document.getElementById("n-kind");
  sel.value = "structured";
  paintNewChatKinds();
  const hidden = [...sel.options].filter((o) => o.disabled).map((o) => o.value);
  assert.deepEqual(hidden, ["structured", "terminal", "kimi", "kimi-tui", "cursor", "cursor-tui"]);
  assert.equal(sel.value, "codex", "the claude kinds are gone, so the first agent with room is picked");
  assert.equal([...sel.options].find((o) => o.value === "structured").title, "nobody is signed in to Claude");
});

test("the status of a provider is one word the list can colour", () => {
  assert.deepEqual(statusOf(provider("codex", { accounts: [{ name: "default", loggedIn: true, tier: "team" }] })), { status: "authenticated · team", tone: "ok" });
  assert.deepEqual(statusOf(provider("codex", { accounts: [{ name: "default", loggedIn: true }, { name: "work", loggedIn: true }] })), { status: "2 logins", tone: "ok" });
  assert.deepEqual(statusOf(provider("codex", { enabled: false })), { status: "turned off", tone: "dim" });
});

test("the seat picker's rail, the draft catalogue and the routine editor all ask the same question", () => {
  const panes = source("chat-and-panes");
  assert.match(panes, /const offered = \(e\.draft \|\| canTransfer\) && e\.where !== "cloud" \? readyAgents\(mine\) : Object\.keys\(AGENT_NAMES\);/);
  assert.match(panes, /if \(!providerReady\(agent\)\) \{\s*e\.catalogError = providerWhyNot\(agent\);/);
  assert.doesNotMatch(panes, /does not sign in with a Claude account/, "the login pill no longer refuses every other agent");
  assert.match(source("draft-seat"), /AGENT_NAMES\[kept\?\.agent\] && providerReady\(kept\.agent\) \? kept\.agent : \(readyAgents\(\)\[0\] \|\| "claude"\)/);
  assert.match(source("routines"), /ROUTINE_AGENTS\.filter\(\(a\) => readyAgents\(r\.agent\)\.includes\(a\)\)/);
  assert.match(source("new-chat"), /if \(!providerReady\(agent\)\) \{[\s\S]*?box\.disabled = true;/);
});

test("the screen is a section of the page, opened by the key the accounts modal had", () => {
  assert.match(page, /<section id="providers" data-t hidden aria-label="Providers and accounts/);
  assert.doesNotMatch(page, /id="accounts"/, "the old modal is gone");
  assert.match(page, /id="btn-accounts">providers and accounts <kbd id="k-accounts">/);
  assert.match(source("themes"), /case "accounts": return providersOnScreen\(\) \? closeProviders\(\) : openProviders\(\);/);
  assert.match(source("hold-numbers"), /if \(providersOnScreen\(\) && !\$\("confirm"\)\.classList\.contains\("on"\)\) \{\s*const m = whichAction\(e\);\s*if \(e\.key === "Escape" \|\| m\?\.action === "accounts"\)/);
});

test("the tab's form is painted once solid has swapped the tab in, not before — and the menu button has one handler", () => {
  const providers = source("providers");
  assert.match(providers, /const HOST_OF_TAB = \{ accounts: "pv-add", configuration: "pv-form" \};/);
  assert.match(providers, /if \(hostId && !host\) \{\s*if \(tries === 0\) queueMicrotask\(\(\) => paintProviderHosts\(force, 1\)\);\s*else if \(tries === 1\) setTimeout\(\(\) => paintProviderHosts\(force, 2\), 0\);\s*return;\s*\}\s*hostsPainted = stamp;/);
  assert.doesNotMatch(providers, /\$\("btn-accounts"\)/, "the menu button already runs the accounts action from thread.js; a second handler would open and close the screen in one click");
  assert.match(source("thread"), /\$\("btn-accounts"\)\.addEventListener\("click", \(\) => run\("accounts"\)\);/);
});
