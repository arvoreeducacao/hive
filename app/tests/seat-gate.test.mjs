import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(HERE, "..", "server.mjs"), "utf8");

const block = (opening) => {
  const start = server.indexOf(opening);
  assert.ok(start >= 0, `${opening} is gone from server.mjs`);
  return server.slice(start, start + 900);
};

test("a device of mine reaching a seat asks the switch, instead of being waved through", () => {
  const allow = block("allow: (who, seat)");
  assert.ok(!/mine\.kinds\.has\(who\)\)\s*return true/.test(allow),
    "a key on the roster is enough again — turning the switch off would stop cutting anything");
  assert.match(allow, /mine\.kinds\.has\(who\)\)\s*return deviceMayReachSeats\(who\)/);
});

test("only another machine of mine reaches the relay, and only with its switch on — the phone reads through the sync door", () => {
  const gate = block("function deviceMayReachSeats");
  assert.match(gate, /=== "mac" && switches\.machines/);
  assert.doesNotMatch(gate, /"phone"/, "the phone is back on the relay, which carries conversations in the clear");
});

test("the switches are read before a seat note is served, never from a stale copy", () => {
  const branch = block("if (SEAT_KINDS.has(envelope.kind))");
  assert.match(branch, /refreshSwitches\(\)/,
    "the relay serves on whatever the switches happened to be at boot");
});

test("opening a chat and reading the shelf answer to the same switch", () => {
  assert.match(server, /mine: \(who\) => \(mine\.kinds\.has\(who\) \? deviceMayReachSeats\(who\) : who === serverKey\(\)\)/);
});

test("my other machines starts off, like the phone and unlike the team", () => {
  assert.match(server, /machines: cleanFlag\(raw\.machines, "machines", tilde\(CONFIG_FILE\), problems, false\)/);
  assert.match(server, /share: cleanFlag\(raw\.share, "share", tilde\(CONFIG_FILE\), problems\)/);
});

test("a roster we could not refresh stops being an answer once it is old enough", () => {
  const refresh = block("async function refreshMyDevices");
  assert.match(refresh, /MINE_STALE/, "a revoked device keeps the run of the seats while the door is down");
});

test("reading a seat costs the same as typing in it: the keyboard has to be lent", () => {
  const allow = block("allow: (who, seat)");
  assert.ok(!/need === "read"/.test(allow),
    "anyone who can land an envelope here reads the conversation again, without borrowing anything");
  assert.match(allow, /lent\.with === who/, "the lend stopped being what opens a seat to somebody else");
});

test("the door the server itself knocks on stays open, or the phone loses its pictures", () => {
  const allow = block("allow: (who, seat)");
  assert.match(allow, /who === serverKey\(\)\)\s*return true/,
    "/api/image stamps the ask with the broker's own key, and the broker is on nobody's roster");
});
