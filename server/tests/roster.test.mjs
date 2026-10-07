import { test } from "node:test";
import assert from "node:assert/strict";

import {CODE_ALPHABET, CODE_LENGTH, PAIRING_TTL_MS, TRIES_BEFORE_CLOSING, createRosterStore, emptyRoster, mintCode, openPairing, publicView, readRoster, redeemPairing, revoke, sameCode, touch } from "../roster.mjs";
import { newIdentity } from "../identity.mjs";

const keyPair = () => newIdentity().publicSsh;

const paired = (over = {}) => {
  const publicSsh = keyPair();
  const opened = openPairing(emptyRoster(), { now: 1000, code: "ABCD2345", ...over });
  const done = redeemPairing(opened.roster, { code: "ABCD2345", publicSsh, name: "iphone", now: 1001 });
  return { publicSsh, ...done };
};

test("a code comes out readable and the agreed length", () => {
  const code = mintCode();
  assert.equal(code.length, CODE_LENGTH);
  for (const letter of code) assert.ok(CODE_ALPHABET.includes(letter), `${letter} is not in the alphabet`);
  assert.equal(sameCode(" abcd2345 ", "ABCD2345"), true);
  assert.equal(sameCode("ABCD2345", "ABCD2346"), false);
});

test("pairing puts the device on the roster, and never keeps the code", () => {
  const done = paired();
  assert.equal(done.device.kind, "mac");
  assert.equal(done.device.name, "iphone");
  assert.match(done.device.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.equal(done.roster.pairing, null);
  assert.equal(JSON.stringify(done.roster).includes("ABCD2345"), false);
});

test("the code works once and only once", () => {
  const first = paired();
  const again = redeemPairing(first.roster, { code: "ABCD2345", publicSsh: keyPair(), now: 1002 });
  assert.match(again.error, /nobody is pairing/);
});

test("the code dies of old age", () => {
  const opened = openPairing(emptyRoster(), { now: 1000, code: "ABCD2345" });
  const late = redeemPairing(opened.roster, { code: "ABCD2345", publicSsh: keyPair(), now: 1000 + PAIRING_TTL_MS + 1 });
  assert.match(late.error, /expired/);
  assert.equal(late.roster.pairing, null);
});

test("a wrong code does not pair, and five wrong tries close it", () => {
  let roster = openPairing(emptyRoster(), { now: 1000, code: "ABCD2345" }).roster;
  for (let round = 1; round < TRIES_BEFORE_CLOSING; round += 1) {
    const wrong = redeemPairing(roster, { code: "ZZZZ9999", publicSsh: keyPair(), now: 1000 });
    assert.match(wrong.error, /wrong/);
    roster = wrong.roster;
  }
  const last = redeemPairing(roster, { code: "ZZZZ9999", publicSsh: keyPair(), now: 1000 });
  assert.match(last.error, /too many wrong codes/);
  assert.equal(last.roster.pairing, null);
  assert.equal(last.roster.devices.length, 0);
});

test("a key that is not ed25519 does not pair, and the same key does not pair twice", () => {
  const opened = openPairing(emptyRoster(), { now: 1000, code: "ABCD2345" });
  assert.match(redeemPairing(opened.roster, { code: "ABCD2345", publicSsh: "ssh-rsa AAAA", now: 1000 }).error, /ed25519/);

  const first = paired();
  const reopened = openPairing(first.roster, { now: 2000, code: "EFGH6789" });
  const twice = redeemPairing(reopened.roster, { code: "EFGH6789", publicSsh: first.publicSsh, now: 2001 });
  assert.match(twice.error, /already on the roster/);
});

test("revoking marks one device and leaves the others", () => {
  const first = paired();
  const reopened = openPairing(first.roster, { now: 2000, code: "EFGH6789" });
  const other = redeemPairing(reopened.roster, { code: "EFGH6789", publicSsh: keyPair(), name: "ipad", now: 2001 });

  const gone = revoke(other.roster, first.device.fingerprint, { now: 3000 });
  assert.equal(gone.device.revokedAt, 3000);
  assert.equal(gone.roster.devices.length, 2);
  assert.equal(gone.roster.devices.find((one) => one.fingerprint === other.device.fingerprint).revokedAt, 0);
  assert.match(revoke(gone.roster, first.device.fingerprint, { now: 3001 }).error, /no live device/);
});

test("lastSeen is written at most once a minute", () => {
  const done = paired();
  assert.equal(touch(done.roster, done.device.fingerprint, { now: 1002 }).touched, false);
  const later = touch(done.roster, done.device.fingerprint, { now: 1001 + 60000 });
  assert.equal(later.touched, true);
  assert.equal(later.roster.devices[0].lastSeen, 61001);
});

test("what the roster shows outside never carries a key", () => {
  const done = paired();
  const shown = publicView(done.roster);
  assert.deepEqual(Object.keys(shown[0]).sort(), ["fingerprint", "kind", "lastSeen", "name", "pairedAt", "revoked"]);
});

test("a device of a kind the server no longer knows is dropped when the file is read, and never answers again", () => {
  const dead = { fingerprint: "SHA256:x", publicSsh: keyPair(), name: "iPhone", kind: "phone", pairedAt: 1, lastSeen: 1, revokedAt: 0 };
  const kept = { fingerprint: "SHA256:y", publicSsh: keyPair(), name: "mac", kind: "mac", pairedAt: 1, lastSeen: 1, revokedAt: 0 };
  const read = readRoster(JSON.stringify({ version: 1, pairing: null, devices: [dead, kept] }));
  assert.deepEqual(read.devices.map((one) => one.kind), ["mac"]);
});

test("a broken file gives an empty roster instead of taking the server down", () => {
  assert.deepEqual(readRoster("{ not json"), emptyRoster());
  assert.deepEqual(readRoster(""), emptyRoster());
  assert.deepEqual(readRoster(JSON.stringify({ version: 1, devices: "nope" })).devices, []);
});

test("the store writes only when something changed", () => {
  let held = emptyRoster();
  let writes = 0;
  const store = createRosterStore({ read: () => held, write: (roster) => { held = roster; writes += 1; }, now: () => 1000 });
  const opened = store.open({ code: "ABCD2345" });
  assert.equal(writes, 1);
  const done = store.redeem({ code: opened.code, publicSsh: keyPair(), name: "iphone" });
  assert.equal(writes, 2);
  assert.equal(store.keepName(done.device.fingerprint, "iphone velho").kept, true);
  assert.equal(writes, 3);
  assert.equal(store.keepName("SHA256:nobody", "x").kept, false);
  assert.equal(writes, 3);
  assert.equal(store.keepName(done.device.fingerprint, "iphone velho").kept, true);
  assert.equal(writes, 3);
});
