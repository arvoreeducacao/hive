import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(join(HERE, "src", "app", "providers.js"), "utf8");

const start = source.indexOf("function providerAccounts");
const end = source.indexOf("\n}\n", start) + 3;
assert.ok(start >= 0 && end > start, "could not cut providerAccounts out of providers.js");

const providerAccountsOf = (providers) =>
  new Function("providerOf", `${source.slice(start, end)} return providerAccounts;`)(
    (id) => providers.find((p) => p.id === id)
  );

const names = (accounts) => accounts.map((a) => a.name);

test("logins come back in the order the person saved, not default first", () => {
  const providerAccounts = providerAccountsOf([
    { id: "claude", order: ["tec", "default"], accounts: [{ name: "default" }, { name: "tec" }] },
  ]);
  assert.deepEqual(names(providerAccounts("claude")), ["tec", "default"]);
});

test("a login missing from the saved order goes last, in the order it arrived", () => {
  const providerAccounts = providerAccountsOf([
    { id: "claude", order: ["tec"], accounts: [{ name: "default" }, { name: "spare" }, { name: "tec" }] },
  ]);
  assert.deepEqual(names(providerAccounts("claude")), ["tec", "default", "spare"]);
});

test("with no saved order the logins stay as the server sent them", () => {
  const providerAccounts = providerAccountsOf([
    { id: "claude", order: [], accounts: [{ name: "default" }, { name: "tec" }] },
  ]);
  assert.deepEqual(names(providerAccounts("claude")), ["default", "tec"]);
});

test("an unknown provider has no logins", () => {
  assert.deepEqual(providerAccountsOf([])("claude"), []);
});
