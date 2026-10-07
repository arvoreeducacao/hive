import { test } from "node:test";
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountsDir, readAccounts, shapeAccount } from "../lib/accounts.mjs";

function machine() {
  const home = mkdtempSync(join(tmpdir(), "hive-accounts-"));
  mkdirSync(join(home, ".claude", "skills"), { recursive: true });
  writeFileSync(join(home, ".claude", "CLAUDE.md"), "how I like it");
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ oauthAccount: { email: "me@x" }, userID: "u1", theme: "dark" }));
  return home;
}

test("a new account borrows the skills and the settings, and never the login", () => {
  const home = machine();
  const dir = shapeAccount(home, join(accountsDir(home), "second"));
  assert.ok(lstatSync(join(dir, "CLAUDE.md")).isSymbolicLink(), "the account keeps its own copy of what should be shared");
  assert.ok(lstatSync(join(dir, "skills")).isSymbolicLink());
  const own = JSON.parse(readFileSync(join(dir, ".claude.json"), "utf8"));
  assert.equal(own.theme, "dark", "the account lost the settings it should have inherited");
  assert.ok(!("oauthAccount" in own) && !("userID" in own), "the second account starts logged in as the first");
});

test("shaping an account twice keeps what is already there", () => {
  const home = machine();
  const dir = join(accountsDir(home), "second");
  shapeAccount(home, dir);
  writeFileSync(join(dir, ".claude.json"), JSON.stringify({ theme: "light" }));
  shapeAccount(home, dir);
  assert.equal(JSON.parse(readFileSync(join(dir, ".claude.json"), "utf8")).theme, "light");
});

test("the list opens with the account you already use, and each one is asked on its own", async () => {
  const home = machine();
  shapeAccount(home, join(accountsDir(home), "second"));
  const asked = [];
  const list = await readAccounts(home, async (dir) => {
    asked.push(dir);
    return JSON.stringify({ loggedIn: !!dir, email: dir ? "two@x" : "one@x", subscriptionType: "max" });
  });
  assert.deepEqual(list.map((a) => a.name), ["default", "second"]);
  assert.deepEqual(asked, ["", join(accountsDir(home), "second")]);
  assert.equal(list[0].email, "one@x");
  assert.equal(list[1].loggedIn, true);
});

test("an account nobody could ask is not called signed out", async () => {
  const home = machine();
  const list = await readAccounts(home, async () => "claude: command not found");
  assert.deepEqual(list, [{ name: "default", email: "", tier: "", loggedIn: false, blind: true }]);
});

test("a login that answers is never blind", async () => {
  const home = machine();
  const list = await readAccounts(home, async () => JSON.stringify({ loggedIn: false }));
  assert.deepEqual(list, [{ name: "default", email: "", tier: "", loggedIn: false, blind: false }]);
});

test("the logins are asked side by side, not one after the other", async () => {
  const home = machine();
  for (const name of ["second", "third", "fourth"]) shapeAccount(home, join(accountsDir(home), name));
  let inFlight = 0;
  let atOnce = 0;
  const list = await readAccounts(home, async () => {
    atOnce = Math.max(atOnce, ++inFlight);
    await new Promise((done) => setTimeout(done, 20));
    inFlight--;
    return JSON.stringify({ loggedIn: true, email: "me@x", subscriptionType: "max" });
  });
  assert.equal(list.length, 4);
  assert.equal(atOnce, 4, "each login waits for the one before it, so the panel pays the sum of the timeouts");
});
