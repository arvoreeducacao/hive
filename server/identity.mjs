import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as signRaw, verify as verifyRaw } from "node:crypto";

export const SSH_TYPE = "ssh-ed25519";
export const SKEW_MS = 60000;
export const NONCE_KEPT = 8192;
export const RAW_KEY_BYTES = 32;

const b64u = (buffer) => buffer.toString("base64url");
const asBuffer = (value) => (Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8"));

function sshString(text) {
  const body = asBuffer(text);
  const head = Buffer.allocUnsafe(4);
  head.writeUInt32BE(body.length, 0);
  return Buffer.concat([head, body]);
}

function readSshString(blob, at) {
  if (at + 4 > blob.length) return null;
  const length = blob.readUInt32BE(at);
  const from = at + 4;
  if (length > blob.length - from) return null;
  return { body: blob.subarray(from, from + length), next: from + length };
}

export function rawFromSsh(line) {
  const parts = String(line || "").trim().split(/\s+/);
  const at = parts.indexOf(SSH_TYPE);
  if (at < 0 || !parts[at + 1]) return null;
  let blob;
  try { blob = Buffer.from(parts[at + 1], "base64"); } catch { return null; }
  const kind = readSshString(blob, 0);
  if (!kind || kind.body.toString("utf8") !== SSH_TYPE) return null;
  const key = readSshString(blob, kind.next);
  if (!key || key.body.length !== RAW_KEY_BYTES || key.next !== blob.length) return null;
  return key.body;
}

export function sshFromRaw(raw, comment = "") {
  const blob = Buffer.concat([sshString(SSH_TYPE), sshString(raw)]);
  return [SSH_TYPE, blob.toString("base64"), comment].filter(Boolean).join(" ");
}

export function publicKeyOf(line) {
  const raw = rawFromSsh(line);
  if (!raw) return null;
  try {
    return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64u(raw) }, format: "jwk" });
  } catch {
    return null;
  }
}

export function fingerprintOf(line) {
  const raw = rawFromSsh(line);
  if (!raw) return "";
  const blob = Buffer.concat([sshString(SSH_TYPE), sshString(raw)]);
  return `SHA256:${createHash("sha256").update(blob).digest("base64").replace(/=+$/, "")}`;
}

export function newIdentity(comment = "") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const publicSsh = sshFromRaw(raw, comment);
  return {
    secret: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicSsh,
    fingerprint: fingerprintOf(publicSsh)
  };
}

export function bodyHashOf(body) {
  return createHash("sha256").update(body === undefined || body === null ? Buffer.alloc(0) : asBuffer(body)).digest("hex");
}

export function newNonce() {
  return randomBytes(16).toString("hex");
}

export function canonical({ method, path, bodyHash, at, nonce, audience }) {
  return Buffer.concat([
    sshString("hive-request-v1"),
    sshString(String(method || "").toUpperCase()),
    sshString(String(path || "")),
    sshString(String(bodyHash || "")),
    sshString(String(at || "")),
    sshString(String(nonce || "")),
    sshString(String(audience || ""))
  ]);
}

export function signRequest(secret, fields) {
  const key = createPrivateKey(secret);
  return signRaw(null, canonical(fields), key).toString("base64");
}

export function verifyRequest(publicSsh, signature, fields) {
  const key = publicKeyOf(publicSsh);
  if (!key) return false;
  let bytes;
  try { bytes = Buffer.from(String(signature || ""), "base64"); } catch { return false; }
  if (!bytes.length) return false;
  try { return verifyRaw(null, canonical(fields), key, bytes); } catch { return false; }
}

export function createGuard({ roster, audience, skewMs = SKEW_MS, nonceKept = NONCE_KEPT, now = () => Date.now() } = {}) {
  const seen = new Map();

  const sweep = (at) => {
    for (const [nonce, when] of seen) {
      if (at - when > skewMs * 2) seen.delete(nonce);
    }
    while (seen.size > nonceKept) seen.delete(seen.keys().next().value);
  };

  return {
    get nonces() { return seen.size; },
    check({ method, path, body, signature, fingerprint, at, nonce }) {
      const stamped = String(at ?? "").trim();
      const when = stamped ? Number(stamped) : NaN;
      if (!stamped || !Number.isFinite(when)) return { ok: false, status: 401, error: "that request has no readable time on it" };
      const drift = Math.abs(now() - when);
      if (drift > skewMs) return { ok: false, status: 401, error: `that request is ${Math.round(drift / 1000)}s off the clock` };
      if (!nonce || typeof nonce !== "string") return { ok: false, status: 401, error: "that request has no nonce" };
      if (seen.has(nonce)) return { ok: false, status: 401, error: "that request was already used once" };

      const known = roster.find(fingerprint);
      if (!known) return { ok: false, status: 401, error: "that key is not on the roster" };
      if (known.revokedAt) return { ok: false, status: 403, error: "that key was revoked" };

      const fields = { method, path, bodyHash: bodyHashOf(body), at: String(when), nonce, audience };
      if (!verifyRequest(known.publicSsh, signature, fields)) return { ok: false, status: 401, error: "that signature does not match the request" };

      seen.set(nonce, now());
      sweep(now());
      return { ok: true, device: known };
    }
  };
}
