import test from "node:test";
import assert from "node:assert/strict";
import {
  aadOf, bytesOf, decrypt, encrypt, fingerprintOf, fromB64, keyIdOf, newAgreer, newSeatKey, newSigner, open,
  publicSigner, rawPublic, seal, signEntry, signRequest, textOf, toB64, verifyEntry, verifyRequest
} from "../sync/crypto.mjs";

test("base64url survives a round trip of random bytes", () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
  assert.deepEqual(fromB64(toB64(bytes)), bytes);
});

test("the fingerprint is the ssh-keygen shape over the ssh wire format", async () => {
  const raw = new Uint8Array(32);
  const printed = await fingerprintOf(raw);
  assert.match(printed, /^SHA256:[A-Za-z0-9+/]{43}$/);
  assert.equal(printed, await fingerprintOf(raw));
});

test("a sealed seat key opens only with the recipient's agreement key", async () => {
  const alice = await newAgreer();
  const bob = await newAgreer();
  const aliceRaw = await rawPublic(alice.publicKey);
  const bobRaw = await rawPublic(bob.publicKey);
  const key = newSeatKey();
  const box = await seal(aliceRaw, key);
  assert.equal(toB64(await open(alice.privateKey, aliceRaw, box)), toB64(key));
  await assert.rejects(() => open(bob.privateKey, bobRaw, box));
});

test("an event is bound to its seat, lane, seq and key id", async () => {
  const key = newSeatKey();
  const keyId = await keyIdOf(key);
  const aad = aadOf({ seat: "s", lane: "events", seq: 7, keyId });
  const box = await encrypt(key, aad, bytesOf("hello"));
  assert.equal(textOf(await decrypt(key, aad, box)), "hello");
  await assert.rejects(() => decrypt(key, aadOf({ seat: "s", lane: "events", seq: 8, keyId }), box));
  await assert.rejects(() => decrypt(key, aadOf({ seat: "other", lane: "events", seq: 7, keyId }), box));
  await assert.rejects(() => decrypt(newSeatKey(), aad, box));
});

test("a request signature covers method, path, body, time, nonce and audience", async () => {
  const me = await newSigner();
  const pub = await publicSigner(await rawPublic(me.publicKey));
  const fields = { method: "POST", path: "/seats", body: "{}", at: 1, nonce: "n", audience: "SHA256:x" };
  const sig = await signRequest(me.privateKey, fields);
  assert.equal(await verifyRequest(pub, sig, fields), true);
  for (const [field, other] of [["method", "GET"], ["path", "/roster"], ["body", "{ }"], ["at", 2], ["nonce", "m"], ["audience", "SHA256:y"]]) {
    assert.equal(await verifyRequest(pub, sig, { ...fields, [field]: other }), false, field);
  }
});

test("a log entry signature covers position, key id and ciphertext", async () => {
  const me = await newSigner();
  const pub = await publicSigner(await rawPublic(me.publicKey));
  const entry = { seat: "s", lane: "events", seq: 1, keyId: "k", nonce: "n", ct: "c", by: "me" };
  entry.sig = await signEntry(me.privateKey, entry);
  assert.equal(await verifyEntry(pub, entry), true);
  assert.equal(await verifyEntry(pub, { ...entry, seq: 2 }), false);
  assert.equal(await verifyEntry(pub, { ...entry, ct: "d" }), false);
});

import { rawOfSsh, signerOfPem } from "../sync/crypto.mjs";
import { newIdentity } from "../identity.mjs";

test("a hive identity in pem and ssh form is the same key in webcrypto, with the same fingerprint", async () => {
  const identity = newIdentity("mac");
  const raw = rawOfSsh(identity.publicSsh);
  assert.equal(await fingerprintOf(raw), identity.fingerprint);
  const key = await signerOfPem(identity.secret);
  const pub = await publicSigner(raw);
  const fields = { method: "GET", path: "/me", body: "", at: 7, nonce: "n", audience: "SHA256:pod" };
  assert.equal(await verifyRequest(pub, await signRequest(key, fields), fields), true);
  assert.equal(rawOfSsh("ssh-rsa AAAA nope"), null);
});
