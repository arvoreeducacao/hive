const subtle = globalThis.crypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const SIGN = "Ed25519";
export const AGREE = "X25519";
export const SEAL_INFO = "hive-seal-v1";
export const REQUEST_TAG = "hive-request-v1";
export const ENTRY_TAG = "hive-entry-v1";

export const bytesOf = (text) => encoder.encode(String(text ?? ""));
export const textOf = (bytes) => decoder.decode(bytes);
export const random = (count) => globalThis.crypto.getRandomValues(new Uint8Array(count));

export function toB64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64(text) {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) out[at] = binary.charCodeAt(at);
  return out;
}

export function concat(...parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const u32 = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const framed = (fields) => concat(...fields.flatMap((field) => {
  const bytes = field instanceof Uint8Array ? field : bytesOf(field);
  return [u32(bytes.length), bytes];
}));

export const sha256 = async (bytes) => new Uint8Array(await subtle.digest("SHA-256", bytes));
export const hexOf = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

export const newSigner = (extractable = false) => subtle.generateKey({ name: SIGN }, extractable, ["sign", "verify"]);
export const newAgreer = (extractable = false) => subtle.generateKey({ name: AGREE }, extractable, ["deriveBits"]);
export const rawPublic = async (key) => new Uint8Array(await subtle.exportKey("raw", key));
export const publicSigner = (raw) => subtle.importKey("raw", raw, { name: SIGN }, true, ["verify"]);
export const publicAgreer = (raw) => subtle.importKey("raw", raw, { name: AGREE }, true, []);

const PAIR_SHAPES = {
  signer: { name: SIGN, privateUse: ["sign"], publicUse: ["verify"] },
  agreer: { name: AGREE, privateUse: ["deriveBits"], publicUse: [] }
};

export const isJwkPair = (held) => !!held && typeof held === "object" && !!held.privateJwk && !!held.publicJwk;

export async function exportPair(pair) {
  return { privateJwk: await subtle.exportKey("jwk", pair.privateKey), publicJwk: await subtle.exportKey("jwk", pair.publicKey) };
}

export async function importPair(held, kind) {
  const shape = PAIR_SHAPES[kind];
  return {
    privateKey: await subtle.importKey("jwk", held.privateJwk, { name: shape.name }, true, shape.privateUse),
    publicKey: await subtle.importKey("jwk", held.publicJwk, { name: shape.name }, true, shape.publicUse)
  };
}

export async function fingerprintOf(rawSignerPublic) {
  const wire = framed(["ssh-ed25519", rawSignerPublic]);
  const digest = await sha256(wire);
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return `SHA256:${btoa(binary).replace(/=+$/, "")}`;
}

export const sign = async (privateKey, bytes) => new Uint8Array(await subtle.sign({ name: SIGN }, privateKey, bytes));
export const verify = (publicKey, signature, bytes) => subtle.verify({ name: SIGN }, publicKey, signature, bytes);

async function sealingKey(shared, salt) {
  const base = await subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: bytesOf(SEAL_INFO) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function seal(recipientRawAgreer, plain) {
  const ephemeral = await newAgreer();
  const ephemeralRaw = await rawPublic(ephemeral.publicKey);
  const recipient = await publicAgreer(recipientRawAgreer);
  const shared = new Uint8Array(await subtle.deriveBits({ name: AGREE, public: recipient }, ephemeral.privateKey, 256));
  const key = await sealingKey(shared, concat(ephemeralRaw, recipientRawAgreer));
  const nonce = random(12);
  const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: ephemeralRaw }, key, plain));
  return { epk: toB64(ephemeralRaw), nonce: toB64(nonce), ct: toB64(sealed) };
}

export async function open(agreerPrivate, myRawAgreer, box) {
  const ephemeralRaw = fromB64(box.epk);
  const ephemeral = await publicAgreer(ephemeralRaw);
  const shared = new Uint8Array(await subtle.deriveBits({ name: AGREE, public: ephemeral }, agreerPrivate, 256));
  const key = await sealingKey(shared, concat(ephemeralRaw, myRawAgreer));
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.nonce), additionalData: ephemeralRaw }, key, fromB64(box.ct)));
}

export const newSeatKey = () => random(32);
export const keyIdOf = async (rawKey) => hexOf(await sha256(rawKey)).slice(0, 16);

const aesKey = (rawKey) => subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export const aadOf = ({ seat, lane, seq, keyId }) => `${seat}|${lane}|${seq}|${keyId}`;

export async function encrypt(rawKey, aad, plain) {
  const key = await aesKey(rawKey);
  const nonce = random(12);
  const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: bytesOf(aad) }, key, plain));
  return { nonce: toB64(nonce), ct: toB64(sealed) };
}

export async function decrypt(rawKey, aad, box) {
  const key = await aesKey(rawKey);
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.nonce), additionalData: bytesOf(aad) }, key, fromB64(box.ct)));
}

export async function requestDigest({ method, path, body, at, nonce, audience }) {
  const bodyHash = hexOf(await sha256(bytesOf(body || "")));
  return framed([REQUEST_TAG, String(method).toUpperCase(), path, bodyHash, String(at), nonce, audience]);
}

export const signRequest = async (privateKey, fields) => toB64(await sign(privateKey, await requestDigest(fields)));
export const verifyRequest = async (publicKey, signature, fields) => verify(publicKey, fromB64(signature), await requestDigest(fields));

export const entryDigest = ({ seat, lane, seq, keyId, nonce, ct, by }) =>
  framed([ENTRY_TAG, seat, lane, String(seq), keyId, nonce, ct, by]);

export const signEntry = async (privateKey, entry) => toB64(await sign(privateKey, entryDigest(entry)));
export const verifyEntry = (publicKey, entry) => verify(publicKey, fromB64(entry.sig), entryDigest(entry));

const PEM_ARMOR = /-----(?:BEGIN|END) [A-Z ]+-----|\s+/g;

export const derOfPem = (pem) => fromStdB64(String(pem || "").replace(PEM_ARMOR, ""));

export function fromStdB64(text) {
  const binary = atob(String(text || ""));
  const out = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) out[at] = binary.charCodeAt(at);
  return out;
}

export const signerOfPem = (pem) => subtle.importKey("pkcs8", derOfPem(pem), { name: SIGN }, false, ["sign"]);

const SSH_TYPE = "ssh-ed25519";

export function rawOfSsh(line) {
  const parts = String(line || "").trim().split(/\s+/);
  const at = parts.indexOf(SSH_TYPE);
  if (at < 0 || !parts[at + 1]) return null;
  let blob;
  try { blob = fromStdB64(parts[at + 1]); } catch { return null; }
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const typeLength = view.getUint32(0);
  const keyAt = 4 + typeLength + 4;
  if (blob.length < keyAt || textOf(blob.subarray(4, 4 + typeLength)) !== SSH_TYPE) return null;
  const keyLength = view.getUint32(4 + typeLength);
  if (keyLength !== 32 || keyAt + keyLength !== blob.length) return null;
  return blob.subarray(keyAt, keyAt + keyLength);
}
