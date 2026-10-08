import { test } from "node:test";
import assert from "node:assert";
import { CREDENTIAL_SAVED, loginConfirmed } from "../lib/server-login.mjs";

test("a login counts once the credential is on the server, whatever the Claude screen happened to print", () => {
  assert.equal(loginConfirmed(`Paste code here if prompted >\n${CREDENTIAL_SAVED}`), true);
  assert.equal(loginConfirmed("Login successful. Press Enter to continue"), true);
});

test("a screen with no confirmation and no credential is not a login", () => {
  assert.equal(loginConfirmed("Paste code here if prompted >"), false);
  assert.equal(loginConfirmed(""), false);
});
