import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsToSignIn } from "../lib/providers.mjs";

const provider = (id, more = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), installed: true, enabled: true, ready: false, why: "", accounts: [], ...more });

test("the first run offers a sign-in for every agent this machine has, and only those", () => {
  const rows = agentsToSignIn([
    provider("claude", { ready: true, accounts: [{ name: "default", loggedIn: true, email: "ada@example.com" }] }),
    provider("codex"),
    provider("kimi", { installed: false }),
    provider("cursor", { enabled: false })
  ]);
  assert.deepEqual(rows.map((one) => one.id), ["claude", "codex"]);
  assert.deepEqual(rows[0], { id: "claude", name: "Claude", ready: true, who: "ada@example.com", why: "" });
  assert.equal(rows[1].ready, false);
});

test("with no agent installed there is nothing to sign in to", () => {
  assert.deepEqual(agentsToSignIn([provider("claude", { installed: false })]), []);
  assert.deepEqual(agentsToSignIn(undefined), []);
});
