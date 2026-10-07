import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const stretches = readFileSync(join(HERE, "src", "app", "chat-stretches.js"), "utf8");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const { parseStructuredTail } = new Function(
  'const PR_LINK = /https:\\/\\/github\\.com\\/[\\w.-]+\\/[\\w.-]+\\/pull\\/\\d+/g;'
  + 'const prettyModel = (m) => m || "";'
  + slice(server, "const FINISH_WORDS", "function structuredStateOf", "server.mjs")
  + "return { parseStructuredTail };"
)();

const log = (...events) => events.map((e) => JSON.stringify(e)).join("\n");
const started = (account) => ({ type: "driver", subtype: "started", name: "seat", account });
const moved = (account) => ({ type: "driver", subtype: "account_changed", account });

test("a seat that never says which login it is on is read as unknown, not as the default", () => {
  const info = parseStructuredTail(log({ type: "driver", subtype: "started", name: "seat" }));
  assert.equal(info.account, undefined);
});

test("the account everybody starts with is an empty word, and it is still a word", () => {
  const info = parseStructuredTail(log(started("")));
  assert.equal(info.account, "");
});

test("the last thing the seat said about its login is the one that counts", () => {
  const info = parseStructuredTail(log(started(""), moved("work"), moved("spare")));
  assert.equal(info.account, "spare");
});

test("only starting and moving speak for the login — no other event does", () => {
  const info = parseStructuredTail(log(
    started("work"),
    { type: "driver", subtype: "model_changed", model: "claude-opus-5", account: "spare" }
  ));
  assert.equal(info.account, "work");
});

const bench = () => {
  const fleet = new Map();
  const saved = [];
  const built = new Function(
    "fleet", "seatKey", "rememberSeat",
    slice(server, "const structuredAccounts = new Map();", "function prettyModel", "server.mjs")
      .replace(/const MODEL_WORDS[\s\S]*$/, "")
    + "return { rememberStructuredAccount, structuredAccounts };"
  )(
    fleet,
    (where, name) => `${where}:${name}`,
    (seat) => { fleet.set(`${seat.where}:${seat.name}`, seat); saved.push(seat); }
  );
  return { ...built, fleet, saved };
};

test("the fleet follows the seat, so bringing it back does not put it on the old login", () => {
  const b = bench();
  b.fleet.set("local:seat", { name: "seat", where: "local", account: "", kind: "structured" });
  b.rememberStructuredAccount("seat", "local", { account: "work" });
  assert.equal(b.fleet.get("local:seat").account, "work");
  assert.equal(b.saved.length, 1);
});

test("a login that did not change is not written to the fleet over and over", () => {
  const b = bench();
  b.fleet.set("local:seat", { name: "seat", where: "local", account: "work", kind: "structured" });
  b.rememberStructuredAccount("seat", "local", { account: "work" });
  assert.deepEqual(b.saved, []);
});

test("a tail that scrolled past the login still knows which one the seat is on", () => {
  const b = bench();
  b.fleet.set("local:seat", { name: "seat", where: "local", account: "", kind: "structured" });
  b.rememberStructuredAccount("seat", "local", { account: "work" });
  const later = { account: undefined };
  b.rememberStructuredAccount("seat", "local", later);
  assert.equal(later.account, "work");
});

test("a seat that never said anything about its login leaves the fleet alone", () => {
  const b = bench();
  b.fleet.set("local:seat", { name: "seat", where: "local", account: "work", kind: "structured" });
  const info = { account: undefined };
  b.rememberStructuredAccount("seat", "local", info);
  assert.deepEqual(b.saved, []);
  assert.equal(info.account, undefined);
});

test("the chip takes the seat's word over the command tmux was started with", () => {
  assert.match(server, /account: typeof structuredInfo\?\.account === "string" \? structuredInfo\.account : account,/);
});

test("the footer of an open chat carries the account next to the model and the thinking", () => {
  const foot = slice(stretches, '<div class="sv-foot">', "</div>", "chat-stretches.js");
  for (const pill of ["sv-pill-model", "sv-pill-effort", "sv-pill-account"]) {
    assert.ok(foot.includes(pill), `${pill} is missing from the composer footer`);
  }
  assert.match(stretches, /\.sv-pill-account"\)\.addEventListener\("click", \(\) => openSeatPicker\(e, "account"\)\)/);
});
