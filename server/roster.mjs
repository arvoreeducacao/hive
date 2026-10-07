import { randomBytes, timingSafeEqual } from "node:crypto";
import { fingerprintOf, rawFromSsh } from "./identity.mjs";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const PAIRING_TTL_MS = 300000;
export const TRIES_BEFORE_CLOSING = 5;
export const NAME_CEILING = 40;
export const KINDS = new Set(["mac", "pod", "peer"]);

export function mintCode(entropy = randomBytes(CODE_LENGTH)) {
  let code = "";
  for (let at = 0; at < CODE_LENGTH; at += 1) code += CODE_ALPHABET[entropy[at] % CODE_ALPHABET.length];
  return code;
}

const typedCode = (code) => String(code || "").replace(/[\s-]+/g, "").toUpperCase();

export function sameCode(a, b) {
  const left = Buffer.from(typedCode(a), "utf8");
  const right = Buffer.from(typedCode(b), "utf8");
  if (left.length !== right.length || !left.length) return false;
  return timingSafeEqual(left, right);
}

export function emptyRoster() {
  return { version: 1, pairing: null, devices: [] };
}

export function readRoster(text) {
  let parsed = null;
  try { parsed = JSON.parse(String(text || "")); } catch { return emptyRoster(); }
  if (!parsed || typeof parsed !== "object") return emptyRoster();
  return {
    version: 1,
    pairing: parsed.pairing && typeof parsed.pairing === "object" ? parsed.pairing : null,
    devices: Array.isArray(parsed.devices)
      ? parsed.devices.filter((one) => one && typeof one.publicSsh === "string" && rawFromSsh(one.publicSsh) && KINDS.has(one.kind))
      : []
  };
}

const cleanName = (name) => String(name || "").replace(/\s+/g, " ").trim().slice(0, NAME_CEILING);

export function openPairing(roster, { now = Date.now(), ttlMs = PAIRING_TTL_MS, code = mintCode(), kind = "mac" } = {}) {
  const pairing = { code, kind: KINDS.has(kind) ? kind : "mac", expiresAt: now + ttlMs, tries: 0 };
  return { roster: { ...roster, pairing }, code, expiresAt: pairing.expiresAt };
}

export function redeemPairing(roster, { code, publicSsh, name, now = Date.now() } = {}) {
  const pairing = roster.pairing;
  if (!pairing) return { error: "nobody is pairing right now" };
  if (now > pairing.expiresAt) return { roster: { ...roster, pairing: null }, error: "that code has expired" };
  if (!sameCode(code, pairing.code)) {
    const tries = pairing.tries + 1;
    if (tries >= TRIES_BEFORE_CLOSING) return { roster: { ...roster, pairing: null }, error: "too many wrong codes — the pairing is closed" };
    return { roster: { ...roster, pairing: { ...pairing, tries } }, error: "that code is wrong" };
  }

  const fingerprint = fingerprintOf(publicSsh);
  if (!fingerprint) return { roster: { ...roster, pairing: null }, error: "that is not an ed25519 public key" };
  if (roster.devices.some((one) => one.fingerprint === fingerprint && !one.revokedAt)) {
    return { roster: { ...roster, pairing: null }, error: "that key is already on the roster" };
  }

  const device = {
    fingerprint,
    publicSsh: String(publicSsh).trim(),
    name: cleanName(name) || pairing.kind,
    kind: pairing.kind,
    pairedAt: now,
    lastSeen: now,
    revokedAt: 0
  };
  return { roster: { ...roster, pairing: null, devices: [...roster.devices, device] }, device };
}

export function revoke(roster, fingerprint, { now = Date.now() } = {}) {
  const found = roster.devices.find((one) => one.fingerprint === fingerprint && !one.revokedAt);
  if (!found) return { roster, error: "no live device with that key" };
  return {
    roster: { ...roster, devices: roster.devices.map((one) => (one.fingerprint === fingerprint ? { ...one, revokedAt: now } : one)) },
    device: { ...found, revokedAt: now }
  };
}

export function touch(roster, fingerprint, { now = Date.now(), every = 60000 } = {}) {
  const found = roster.devices.find((one) => one.fingerprint === fingerprint);
  if (!found || now - found.lastSeen < every) return { roster, touched: false };
  return {
    roster: { ...roster, devices: roster.devices.map((one) => (one.fingerprint === fingerprint ? { ...one, lastSeen: now } : one)) },
    touched: true
  };
}

export function fromAllowedSigners(text, { owners = [] } = {}) {
  const devices = [];
  const mine = new Set([owners].flat().map(cleanName).filter(Boolean));
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("ssh-ed25519");
    if (at < 0) continue;
    const publicSsh = trimmed.slice(at).trim();
    const fingerprint = fingerprintOf(publicSsh);
    if (!fingerprint) continue;
    const principal = cleanName(trimmed.slice(0, at));
    const comment = cleanName(publicSsh.split(/\s+/)[2] || "");
    const whose = principal || comment;
    devices.push({
      fingerprint,
      publicSsh,
      name: whose || fingerprint.slice(7, 19),
      kind: whose && mine.has(whose) ? "mac" : "peer",
      pairedAt: 0,
      lastSeen: 0,
      revokedAt: 0
    });
  }
  return devices;
}

export function withKind(roster, fingerprint, kind) {
  if (!KINDS.has(kind)) return { roster, kept: false };
  const found = roster.devices.find((one) => one.fingerprint === fingerprint);
  if (!found || found.kind === kind) return { roster, kept: !!found };
  return {
    roster: { ...roster, devices: roster.devices.map((one) => (one.fingerprint === fingerprint ? { ...one, kind } : one)) },
    kept: true
  };
}

export function withName(roster, fingerprint, name) {
  const said = cleanName(name);
  const found = roster.devices.find((one) => one.fingerprint === fingerprint);
  if (!found || !said || found.name === said) return { roster, kept: !!found };
  return {
    roster: { ...roster, devices: roster.devices.map((one) => (one.fingerprint === fingerprint ? { ...one, name: said } : one)) },
    kept: true
  };
}

export function ownersOf(roster) {
  return (roster.devices || []).filter((one) => !one.revokedAt && (one.kind === "mac" || one.kind === "pod"));
}

export function publicView(roster) {
  return roster.devices.map(({ fingerprint, name, kind, pairedAt, lastSeen, revokedAt }) =>
    ({ fingerprint, name, kind, pairedAt, lastSeen, revoked: !!revokedAt }));
}

export function createRosterStore({ read, write, now = () => Date.now() }) {
  let held = readRoster(read());
  const save = (next) => { held = next; write(JSON.stringify(next, null, 2)); return next; };
  return {
    get all() { return held; },
    find(fingerprint) {
      const found = held.devices.find((one) => one.fingerprint === fingerprint) || null;
      if (found && !found.revokedAt) {
        const { roster, touched } = touch(held, fingerprint, { now: now() });
        if (touched) save(roster);
      }
      return found;
    },
    open(options) { const r = openPairing(held, { ...options, now: now() }); save(r.roster); return r; },
    redeem(options) { const r = redeemPairing(held, { ...options, now: now() }); if (r.roster) save(r.roster); return r; },
    revoke(fingerprint) { const r = revoke(held, fingerprint, { now: now() }); if (r.roster !== held) save(r.roster); return r; },
    owners() { return ownersOf(held); },

    keepName(fingerprint, name) {
      const done = withName(held, fingerprint, name);
      if (done.kept && done.roster !== held) save(done.roster);
      return done;
    },

    keepKind(fingerprint, kind) {
      const done = withKind(held, fingerprint, kind);
      if (done.kept && done.roster !== held) save(done.roster);
      return done;
    },

    adopt(devices) {
      const fresh = devices.filter((one) => !held.devices.some((mine) => mine.fingerprint === one.fingerprint));
      if (!fresh.length) return { added: 0 };
      save({ ...held, devices: [...held.devices, ...fresh] });
      return { added: fresh.length };
    }
  };
}
