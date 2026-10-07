import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountRanDry, resetsAtFrom } from "../engine/protocol.mjs";
import {
  accountOrder, accountsHeld, hasRoom, noteBack, noteSpent, pickAccount, readLedger,
  DEFAULT_ACCOUNT, GUESSED_WAIT_MS,
} from "../engine/accounts.mjs";

function machine(accounts = [], order = null) {
  const base = mkdtempSync(join(tmpdir(), "hive-ledger-"));
  mkdirSync(join(base, "accounts"), { recursive: true });
  for (const one of accounts) mkdirSync(join(base, "accounts", one), { recursive: true });
  if (order) writeFileSync(join(base, "accounts", "order.json"), JSON.stringify(order));
  return base;
}

const refused = (says) => ({
  type: "result", subtype: "success", is_error: true,
  terminal_reason: "api_error", api_error_status: 429, result: says,
});

const NOON = Date.parse("2026-08-24T15:00:00Z");

test("the hour an account says it comes back is read out of the sentence it says it in", () => {
  const said = [
    ["You've hit your session limit · resets 6:30pm (America/Sao_Paulo)", "2026-08-24T21:30:00.000Z"],
    ["You've hit your weekly limit · resets Aug 25 at 2pm (America/Sao_Paulo)", "2026-08-25T17:00:00.000Z"],
    ["You've hit your org's monthly spend limit · run /usage-credits to raise it · your session limit resets 1am (America/Sao_Paulo)", "2026-08-25T04:00:00.000Z"],
  ];
  for (const [text, when] of said) {
    assert.equal(new Date(resetsAtFrom(text, NOON)).toISOString(), when, text);
  }
});

test("an hour that has already gone by today is tomorrow's, not this morning's", () => {
  const when = resetsAtFrom("resets 8am (America/Sao_Paulo)", NOON);
  assert.equal(new Date(when).toISOString(), "2026-08-25T11:00:00.000Z");
});

test("a sentence with no hour in it, or a zone nobody knows, reads as no hour at all", () => {
  assert.equal(resetsAtFrom("You've hit your individual spend limit · run /usage-credits", NOON), 0);
  assert.equal(resetsAtFrom("resets 3pm (Middle/Earth)", NOON), 0);
  assert.equal(resetsAtFrom("", NOON), 0);
});

test("a spent login and a busy server arrive as the same refusal and are told apart", () => {
  assert.equal(accountRanDry(refused("You've hit your org's monthly spend limit · run /usage-credits to raise it"), NOON).why, "spent");
  assert.equal(accountRanDry(refused("You've hit your individual spend limit · run /usage-credits to raise it"), NOON).why, "spent");
  assert.equal(accountRanDry(refused("You've hit your weekly limit · resets 2pm (America/Sao_Paulo)"), NOON).why, "spent");
  assert.equal(accountRanDry(refused("Claude AI usage limit reached"), NOON).why, "spent");
  assert.equal(accountRanDry(refused("Your credit balance is too low to run this"), NOON).why, "spent");
  assert.equal(accountRanDry(refused("Failed to authenticate: OAuth session expired"), NOON).why, "login");
  assert.equal(accountRanDry(refused("API Error: 529 Overloaded. This is a server-side issue"), NOON), null);
  assert.equal(accountRanDry(refused("API Error: Connection lost mid-response."), NOON), null);
});

test("a turn that ended well is never read as a spent login", () => {
  assert.equal(accountRanDry({ type: "result", subtype: "success", is_error: false, terminal_reason: "completed", result: "spend limit" }), null);
  assert.equal(accountRanDry({ type: "assistant", result: "You've hit your session limit" }), null);
  assert.equal(accountRanDry(null), null);
});

test("the logins a machine holds always start with the one it had before it held any", async () => {
  assert.deepEqual(await accountsHeld(machine([])), [DEFAULT_ACCOUNT]);
  assert.deepEqual(await accountsHeld(machine(["work", "spare"])), [DEFAULT_ACCOUNT, "spare", "work"]);
});

test("with nothing written down the seat tries its own login first, then the rest", async () => {
  assert.deepEqual(await accountOrder(machine(["work", "spare"]), "work"), ["work", DEFAULT_ACCOUNT, "spare"]);
  assert.deepEqual(await accountOrder(machine(["work"]), ""), [DEFAULT_ACCOUNT, "work"]);
});

test("an order the person wrote down is the order, and names they do not hold are dropped", async () => {
  const base = machine(["work", "spare"], ["spare", "gone", "work"]);
  assert.deepEqual(await accountOrder(base, "work"), ["spare", "work", DEFAULT_ACCOUNT]);
});

test("a login with no mark has room, one with an hour ahead of it does not, one with no hour never does", async () => {
  const base = machine(["work"]);
  assert.equal(hasRoom(await readLedger(base), "work"), true);
  await noteSpent(base, "work", { until: Date.now() + 60000 });
  assert.equal(hasRoom(await readLedger(base), "work"), false);
  await noteSpent(base, "work", { until: Date.now() - 60000 });
  assert.equal(hasRoom(await readLedger(base), "work"), true);
  await noteSpent(base, "work", { until: 0, why: "login" });
  assert.equal(hasRoom(await readLedger(base), "work", Date.now() + 31536000000), false);
});

test("what one seat writes down every other seat reads, and neither erases the other", async () => {
  const base = machine(["work", "spare"]);
  await noteSpent(base, "work", { until: Date.now() + 60000, says: "no room" });
  await noteSpent(base, "spare", { until: Date.now() + 60000, says: "none here either" });
  const ledger = await readLedger(base);
  assert.deepEqual(Object.keys(ledger).sort(), ["spare", "work"]);
  await noteBack(base, "work");
  assert.deepEqual(Object.keys(await readLedger(base)), ["spare"]);
});

test("what a seat says about a refusal is kept short enough to sit in a panel", async () => {
  const base = machine([]);
  await noteSpent(base, DEFAULT_ACCOUNT, { says: "x".repeat(900) });
  assert.equal((await readLedger(base))[DEFAULT_ACCOUNT].says.length, 300);
});

test("the login picked is the next one down the order with room, and never the one that just failed", async () => {
  const now = Date.now();
  const order = ["work", DEFAULT_ACCOUNT, "spare"];
  const ledger = { work: { until: now + 60000 } };
  assert.equal(pickAccount({ order, current: "work", ledger, now }), DEFAULT_ACCOUNT);
  assert.equal(pickAccount({ order, current: "work", ledger: { ...ledger, default: { until: now + 60000 } }, now }), "spare");
  assert.equal(pickAccount({ order, current: "work", ledger: { work: { until: 0 }, default: { until: 0 }, spare: { until: 0 } }, now }), "");
  assert.equal(pickAccount({ order: [DEFAULT_ACCOUNT], current: "", ledger: {}, now }), "");
});

test("a machine that only ever had one login behaves as it did before any of this existed", async () => {
  const base = machine([]);
  const order = await accountOrder(base, "");
  assert.deepEqual(order, [DEFAULT_ACCOUNT]);
  assert.equal(pickAccount({ order, current: "", ledger: await readLedger(base) }), "");
});

test("the guessed wait is a wait, not an afternoon", () => {
  assert.ok(GUESSED_WAIT_MS > 60000 && GUESSED_WAIT_MS <= 3600000);
});
