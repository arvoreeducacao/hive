import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncBroker } from "../sync/broker.mjs";
import { Device, memoryStore } from "../sync/device.mjs";
import { localFetch } from "../sync/mount.mjs";
import { aadOf, bytesOf, decrypt, fromB64, rawOfSsh, textOf, toB64 } from "../sync/crypto.mjs";
import { createNotices, newVapidKeys, rawOfJwk, sealForPush, SUBJECT_WHEN_UNSAID, vapidToken } from "../sync/notices.mjs";
import { newIdentity } from "../identity.mjs";

const subtle = globalThis.crypto.subtle;
const RFC_PLAIN = "When I grow up, I want to be a watermelon";
const RFC = {
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw"
};

const jwkOf = (publicB64, privateB64) => {
  const raw = fromB64(publicB64);
  return {
    kty: "EC",
    crv: "P-256",
    x: toB64(raw.subarray(1, 33)),
    y: toB64(raw.subarray(33, 65)),
    ...(privateB64 ? { d: privateB64 } : {}),
    ext: true
  };
};

async function agreementPair(publicB64, privateB64) {
  const shape = { name: "ECDH", namedCurve: "P-256" };
  return {
    privateKey: await subtle.importKey("jwk", { ...jwkOf(publicB64, privateB64), key_ops: ["deriveBits"] }, shape, true, ["deriveBits"]),
    publicKey: await subtle.importKey("jwk", { ...jwkOf(publicB64), key_ops: [] }, shape, true, [])
  };
}

async function openAsTheUserAgent(body, { uaPublic, uaPrivate, auth }) {
  const salt = body.subarray(0, 16);
  const keyLength = body[20];
  const asPublic = body.subarray(21, 21 + keyLength);
  const sealed = body.subarray(21 + keyLength);
  const ua = await agreementPair(uaPublic, uaPrivate);
  const theirs = await subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: theirs }, ua.privateKey, 256));
  const fromShared = await subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const info = new Uint8Array([...bytesOf("WebPush: info\0"), ...fromB64(uaPublic), ...asPublic]);
  const seed = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: fromB64(auth), info }, fromShared, 256));
  const fromSeed = await subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"]);
  const cekBits = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: bytesOf("Content-Encoding: aes128gcm\0") }, fromSeed, 128));
  const nonce = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: bytesOf("Content-Encoding: nonce\0") }, fromSeed, 96));
  const cek = await subtle.importKey("raw", cekBits, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cek, sealed));
  return textOf(plain.subarray(0, plain.length - 1));
}

test("a sealed notice is the aes128gcm body a browser knows how to open", async () => {
  const body = await sealForPush({
    p256dh: RFC.uaPublic,
    auth: RFC.auth,
    plain: bytesOf(RFC_PLAIN),
    salt: fromB64(RFC.salt),
    ephemeral: await agreementPair(RFC.asPublic, RFC.asPrivate)
  });

  assert.equal(toB64(body.subarray(0, 16)), RFC.salt, "the salt leads the body");
  assert.deepEqual([...body.subarray(16, 20)], [0, 0, 16, 0], "the record size is 4096");
  assert.equal(body[20], 65, "the key that follows is an uncompressed point");
  assert.equal(toB64(body.subarray(21, 86)), RFC.asPublic, "the sender's ephemeral key travels in the header");
  assert.equal(await openAsTheUserAgent(body, { uaPublic: RFC.uaPublic, uaPrivate: RFC.uaPrivate, auth: RFC.auth }), RFC_PLAIN);
});

test("the vapid token says who is pushing, to which host, and is signed by the key the browser was given", async () => {
  const keys = await newVapidKeys();
  const at = 1757500000000;
  const token = await vapidToken({ privateJwk: keys.privateJwk, audience: "https://web.push.apple.com", subject: "https://hive.example", at });
  const [head, claims, signature] = token.split(".");
  assert.deepEqual(JSON.parse(textOf(fromB64(head))), { typ: "JWT", alg: "ES256" });
  const said = JSON.parse(textOf(fromB64(claims)));
  assert.equal(said.aud, "https://web.push.apple.com");
  assert.equal(said.sub, "https://hive.example");
  assert.ok(said.exp > Math.floor(at / 1000) && said.exp <= Math.floor(at / 1000) + 12 * 60 * 60);
  const publicKey = await subtle.importKey("raw", rawOfJwk(keys.publicJwk), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  assert.equal(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, fromB64(signature), bytesOf(`${head}.${claims}`)), true);
});

test("with no contact given, the token still carries one, and it names nobody", async () => {
  let sent;
  const notices = createNotices({
    keys: await newVapidKeys(),
    fetchImpl: async (url, init) => { sent = init; return { ok: true, status: 201 }; }
  });
  await notices.send({ endpoint: "https://web.push.apple.com/abc", p256dh: RFC.uaPublic, auth: RFC.auth }, { seat: "jonas-1", wake: "done" });
  const claims = JSON.parse(textOf(fromB64(sent.headers.authorization.split(".")[1])));
  assert.equal(claims.sub, SUBJECT_WHEN_UNSAID);
  assert.doesNotMatch(SUBJECT_WHEN_UNSAID, /\./, "the contact it falls back to carries nobody's domain");
});

test("a notice reaches the phone push service with the vapid headers on it", async () => {
  const asked = [];
  const notices = createNotices({
    keys: await newVapidKeys(),
    subject: "https://hive.example",
    now: () => 1757500000000,
    fetchImpl: async (url, init) => {
      asked.push({ url, init });
      return { ok: true, status: 201 };
    }
  });
  const said = await notices.send({ endpoint: "https://web.push.apple.com/abc", p256dh: RFC.uaPublic, auth: RFC.auth }, { seat: "jonas-1", wake: "done" });
  assert.equal(said.ok, true);
  assert.equal(asked.length, 1);
  assert.match(asked[0].init.headers.authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{80,}$/);
  assert.equal(asked[0].init.headers["content-encoding"], "aes128gcm");
  assert.equal(asked[0].init.headers.ttl, "600");
  assert.equal(
    await openAsTheUserAgent(asked[0].init.body, { uaPublic: RFC.uaPublic, uaPrivate: RFC.uaPrivate, auth: RFC.auth }),
    JSON.stringify({ seat: "jonas-1", wake: "done" })
  );
});

function brokerIn(dataDir, pod, mac, notices, more = {}) {
  const trusted = (fingerprint) => {
    if (fingerprint === mac.fingerprint) return { signer: rawOfSsh(mac.publicSsh), name: "mac do jonas", kind: "mac" };
    if (fingerprint === pod.fingerprint) return { signer: rawOfSsh(pod.publicSsh), name: "pod", kind: "pod" };
    return null;
  };
  return createSyncBroker({ dataDir, audience: pod.fingerprint, owner: "jonas", trusted, notices, doneFloorMs: 0, ...more });
}

test("the end of a turn rings the phone, and only the phone that asked for it", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-notices-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const sent = [];
  let answerWith = { ok: true, gone: false, status: 201 };
  const notices = {
    publicKey: async () => "BPublicKeyOfThisHive",
    send: async (to, payload) => {
      sent.push({ to, payload });
      return answerWith;
    }
  };
  const broker = brokerIn(dataDir, pod, macIdentity, notices);
  const at = () => localFetch(broker);

  const mac = await Device.fromIdentity({ name: "mac do jonas", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), fetchImpl: at(), lean: true });
  await mac.enroll("http://sync/sync", { kind: "mac" });

  const code = await mac.openCode();
  const phone = await Device.create({ name: "iphone do jonas", fetchImpl: at() });
  await phone.pair("http://sync/sync", code.code);

  const otherCode = await mac.openCode();
  const tablet = await Device.create({ name: "ipad velho", fetchImpl: at() });
  await tablet.pair("http://sync/sync", otherCode.code);

  assert.equal((await phone.noticesKey()).key, "BPublicKeyOfThisHive");
  await phone.takeNotices({ endpoint: "https://web.push.apple.com/phone", p256dh: RFC.uaPublic, auth: RFC.auth }, { needs: true, done: true });
  await tablet.takeNotices({ endpoint: "https://web.push.apple.com/tablet", p256dh: RFC.uaPublic, auth: RFC.auth }, { needs: true, done: false });

  await mac.openSeat({ id: "jonas-1", title: "o CRM manda a régua sozinho" });
  await mac.share("jonas-1", phone.fingerprint);
  await mac.share("jonas-1", tablet.fingerprint);

  await mac.write("jonas-1", { type: "assistant", text: "li a fila" });
  assert.equal(sent.length, 0, "a message in the middle of a turn rings nobody");

  await mac.write("jonas-1", { type: "result", cost: 0.4, turns: 3 }, { wake: "done" });
  assert.deepEqual(sent.map((one) => one.to.endpoint), ["https://web.push.apple.com/phone"], "only the device that wants the end of a turn hears it");
  assert.deepEqual(sent[0].payload.seat, "jonas-1");
  assert.equal(sent[0].payload.wake, "done");

  sent.length = 0;
  await mac.write("jonas-1", { type: "question", id: "q1", questions: [{ question: "posso mexer no schema?", header: "schema", options: [] }] }, { wake: "needs" });
  assert.deepEqual(sent.map((one) => one.to.endpoint).sort(), ["https://web.push.apple.com/phone", "https://web.push.apple.com/tablet"], "a question rings both, because being asked is never muted");

  sent.length = 0;
  const heard = [];
  const stop = phone.listen((note) => heard.push(note.kind));
  await phone.sync();
  await new Promise((done) => setTimeout(done, 60));
  await mac.write("jonas-1", { type: "result", cost: 0.1, turns: 1 }, { wake: "done" });
  assert.equal(sent.length, 0, "a phone with the page open is told by the page, not by the push service");
  stop();
  phone.close?.();
  await new Promise((done) => setTimeout(done, 60));

  sent.length = 0;
  answerWith = { ok: false, gone: true, status: 410 };
  await mac.write("jonas-1", { type: "result", cost: 0.2, turns: 2 }, { wake: "done" });
  await new Promise((done) => setTimeout(done, 60));
  assert.equal(sent.length, 1);
  assert.equal(broker.state.notices[phone.fingerprint], undefined, "a subscription the push service calls gone is dropped");

  sent.length = 0;
  answerWith = { ok: true, gone: false, status: 201 };
  await mac.write("jonas-1", { type: "result", cost: 0.3, turns: 1 }, { wake: "done" });
  assert.equal(sent.length, 0, "a dropped subscription is not tried again");

  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a phone hears the end of a turn at most once in a while, and the next ring says how many it missed", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-notices-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const sent = [];
  const notices = { publicKey: async () => "BPublicKeyOfThisHive", send: async (to, payload) => { sent.push(payload); return { ok: true, gone: false, status: 201 }; } };
  const broker = brokerIn(dataDir, pod, macIdentity, notices, { doneFloorMs: 400 });
  const at = () => localFetch(broker);

  const mac = await Device.fromIdentity({ name: "mac do jonas", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), fetchImpl: at(), lean: true });
  await mac.enroll("http://sync/sync", { kind: "mac" });
  const phone = await Device.create({ name: "iphone do jonas", fetchImpl: at() });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  await phone.takeNotices({ endpoint: "https://web.push.apple.com/phone", p256dh: RFC.uaPublic, auth: RFC.auth }, { needs: true, done: true });

  for (const id of ["jonas-1", "jonas-2", "jonas-3", "jonas-4", "jonas-5"]) {
    await mac.openSeat({ id, title: `chat ${id}` });
    await mac.share(id, phone.fingerprint);
  }

  for (const id of ["jonas-1", "jonas-2", "jonas-3", "jonas-4"]) await mac.write(id, { type: "result", cost: 0.1, turns: 1 }, { wake: "done" });
  assert.equal(sent.length, 1, "four chats coming back in the same minute is one ring, not four");
  assert.equal(sent[0].more, undefined);

  await mac.write("jonas-5", { type: "question", id: "q1", questions: [] }, { wake: "needs" });
  assert.equal(sent.length, 2, "being asked something is never held back");
  assert.equal(sent[1].wake, "needs");

  await new Promise((done) => setTimeout(done, 450));
  await mac.write("jonas-5", { type: "result", cost: 0.1, turns: 1 }, { wake: "done" });
  assert.equal(sent.length, 3);
  assert.equal(sent[2].more, 3, "the ring that gets through counts the other chats that came back while it was quiet");

  await new Promise((done) => setTimeout(done, 450));
  await mac.write("jonas-1", { type: "result", cost: 0.1, turns: 1 }, { wake: "done" });
  assert.equal(sent[3].more, undefined, "a quiet stretch with nothing missed rings with no tally");

  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("the line the phone shows rides the push sealed, and the hive never sees it", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-notices-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const sent = [];
  const notices = { publicKey: async () => "BPublicKeyOfThisHive", send: async (to, payload) => { sent.push(payload); return { ok: true, gone: false, status: 201 }; } };
  const broker = brokerIn(dataDir, pod, macIdentity, notices);
  const at = () => localFetch(broker);

  const mac = await Device.fromIdentity({ name: "mac do jonas", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), fetchImpl: at(), lean: true });
  await mac.enroll("http://sync/sync", { kind: "mac" });
  const phone = await Device.create({ name: "iphone do jonas", fetchImpl: at() });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  await phone.takeNotices({ endpoint: "https://web.push.apple.com/phone", p256dh: RFC.uaPublic, auth: RFC.auth }, { needs: true, done: true });

  await mac.openSeat({ id: "jonas-1", title: "a fila do suporte" });
  await mac.share("jonas-1", phone.fingerprint);
  const notice = { title: "a fila do suporte", text: "são 135 abertos, 27 de verdade" };
  await mac.write("jonas-1", { type: "result", cost: 0.4, turns: 3 }, { wake: "done", notice });

  assert.equal(sent.length, 1);
  const box = sent[0].n;
  assert.ok(box.keyId && box.nonce && box.ct);
  const inTheClear = JSON.stringify(sent[0]);
  for (const word of `${notice.title} ${notice.text}`.split(/\W+/).filter((one) => one.length > 4)) {
    assert.ok(!inTheClear.includes(word), `what the chat said never travels in the clear: ${word}`);
  }
  await phone.sync();
  const said = JSON.parse(textOf(await decrypt(phone.keyFor("jonas-1", box.keyId), aadOf({ seat: "jonas-1", lane: "notice", seq: sent[0].seq, keyId: box.keyId }), box)));
  assert.deepEqual(said, notice);

  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});
