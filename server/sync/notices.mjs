import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bytesOf, concat, fromB64, random, toB64 } from "./crypto.mjs";

const subtle = globalThis.crypto.subtle;

export const CURVE = { name: "ECDH", namedCurve: "P-256" };
export const SIGN_CURVE = { name: "ECDSA", namedCurve: "P-256" };
export const RECORD_SIZE = 4096;
export const PAYLOAD_CEILING = 3000;
export const TOKEN_LASTS_MS = 12 * 60 * 60 * 1000;
export const TTL_SECONDS = 600;
export const GONE = new Set([404, 410]);
export const SUBJECT_WHEN_UNSAID = "mailto:hive@localhost";

const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);

export const rawOfJwk = (jwk) => concat(new Uint8Array([4]), fromB64(jwk.x), fromB64(jwk.y));

export async function newVapidKeys() {
  const pair = await subtle.generateKey(SIGN_CURVE, true, ["sign", "verify"]);
  return { privateJwk: await subtle.exportKey("jwk", pair.privateKey), publicJwk: await subtle.exportKey("jwk", pair.publicKey) };
}

export function vapidKeysIn(dir) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "notices-key.json");
  if (existsSync(file)) {
    try {
      const held = JSON.parse(readFileSync(file, "utf8"));
      if (held?.privateJwk?.d && held?.publicJwk?.x) return held;
    } catch {}
  }
  return null;
}

export function keepVapidKeys(dir, keys) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "notices-key.json"), JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

export async function vapidToken({ privateJwk, audience, subject, at = Date.now() }) {
  const key = await subtle.importKey("jwk", privateJwk, SIGN_CURVE, false, ["sign"]);
  const head = toB64(bytesOf(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toB64(bytesOf(JSON.stringify({ aud: audience, exp: Math.floor((at + TOKEN_LASTS_MS) / 1000), sub: subject })));
  const signature = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, bytesOf(`${head}.${claims}`)));
  return `${head}.${claims}.${toB64(signature)}`;
}

export async function sealForPush({ p256dh, auth, plain, salt = random(16), ephemeral = null }) {
  const theirRaw = fromB64(p256dh);
  const secret = fromB64(auth);
  const mine = ephemeral || (await subtle.generateKey(CURVE, true, ["deriveBits"]));
  const myRaw = new Uint8Array(await subtle.exportKey("raw", mine.publicKey));
  const theirs = await subtle.importKey("raw", theirRaw, CURVE, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: theirs }, mine.privateKey, 256));
  const fromShared = await subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const seed = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: secret, info: concat(bytesOf("WebPush: info\0"), theirRaw, myRaw) }, fromShared, 256));
  const fromSeed = await subtle.importKey("raw", seed, "HKDF", false, ["deriveBits"]);
  const cekBits = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: bytesOf("Content-Encoding: aes128gcm\0") }, fromSeed, 128));
  const nonce = new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: bytesOf("Content-Encoding: nonce\0") }, fromSeed, 96));
  const cek = await subtle.importKey("raw", cekBits, { name: "AES-GCM" }, false, ["encrypt"]);
  const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, cek, concat(plain, new Uint8Array([2]))));
  return concat(salt, u32(RECORD_SIZE), new Uint8Array([myRaw.length]), myRaw, sealed);
}

export function createNotices({ keys = null, dir = "", subject = "", fetchImpl = (...args) => globalThis.fetch(...args), now = () => Date.now(), log = () => {} } = {}) {
  if (!keys && !dir) throw new Error("notices need a vapid key pair or a place to keep one");
  let held = keys;
  let minting = null;

  async function mine() {
    if (held) return held;
    if (!minting) minting = (async () => keepVapidKeys(dir, vapidKeysIn(dir) || (await newVapidKeys())))();
    held = await minting;
    return held;
  }

  async function publicKey() {
    return toB64(rawOfJwk((await mine()).publicJwk));
  }

  async function send(to, payload, { ttlSeconds = TTL_SECONDS } = {}) {
    const endpoint = String(to?.endpoint || "");
    if (!endpoint || !to?.p256dh || !to?.auth) return { ok: false, gone: true, status: 0 };
    const plain = bytesOf(JSON.stringify(payload));
    if (plain.length > PAYLOAD_CEILING) return { ok: false, gone: false, status: 0 };
    let body;
    let token;
    try {
      body = await sealForPush({ p256dh: to.p256dh, auth: to.auth, plain });
      token = await vapidToken({ privateJwk: (await mine()).privateJwk, audience: new URL(endpoint).origin, subject: subject || SUBJECT_WHEN_UNSAID, at: now() });
    } catch (wrong) {
      log(`notices: ${endpoint} could not be sealed: ${wrong.message}`);
      return { ok: false, gone: false, status: 0 };
    }
    try {
      const said = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `vapid t=${token}, k=${await publicKey()}`,
          "content-encoding": "aes128gcm",
          "content-type": "application/octet-stream",
          ttl: String(ttlSeconds),
          urgency: "high"
        },
        body
      });
      if (!said.ok) log(`notices: ${new URL(endpoint).host} answered ${said.status}`);
      return { ok: said.ok, gone: GONE.has(said.status), status: said.status };
    } catch (wrong) {
      log(`notices: ${endpoint} did not answer: ${wrong.message}`);
      return { ok: false, gone: false, status: 0 };
    }
  }

  return { publicKey, send };
}
