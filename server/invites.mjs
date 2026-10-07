import { randomBytes, timingSafeEqual } from "node:crypto";
import { fingerprintOf, rawFromSsh } from "./identity.mjs";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const TOKEN_BYTES = 24;
export const INVITES_KEPT = 32;

export function mintToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function sameToken(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function linkOf({ url, fingerprint, token }) {
  const home = new URL(String(url)).toString().replace(/\/$/, "");
  const at = new URL("hive://join");
  at.searchParams.set("at", home);
  at.searchParams.set("key", fingerprint);
  at.searchParams.set("token", token);
  return at.toString();
}

function homeOf(at) {
  if (at.protocol === "hive:") {
    let home = null;
    try { home = new URL(String(at.searchParams.get("at") || "")); } catch { return ""; }
    if (home.protocol !== "http:" && home.protocol !== "https:") return "";
    if (!home.hostname) return "";
    return home.toString().replace(/\/$/, "");
  }
  if (at.protocol !== "http:" && at.protocol !== "https:") return "";
  const home = new URL(at);
  home.pathname = "";
  home.search = "";
  return home.toString().replace(/\/$/, "");
}

export function readLink(link) {
  let at = null;
  try { at = new URL(String(link)); } catch { return { error: "that is not a link I can read" }; }
  const joining = at.protocol === "hive:"
    ? at.hostname === "join" && !at.pathname.replace(/\//g, "")
    : at.pathname === "/join";
  if (!joining) return { error: "that link does not point at a join" };
  const fingerprint = at.searchParams.get("key") || "";
  const token = at.searchParams.get("token") || "";
  if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) return { error: "that link carries no readable key" };
  if (!token) return { error: "that link carries no token" };
  const url = homeOf(at);
  if (!url) return { error: "that link carries no server to knock at" };
  return { url, fingerprint, token };
}

export function openInvite(held, { url, fingerprint, now = Date.now(), ttlMs = INVITE_TTL_MS, token = mintToken(), mine = false } = {}) {
  const invite = { token, at: now, expiresAt: now + ttlMs, usedAt: 0, by: "", mine: !!mine };
  const kept = [...held.filter((one) => !one.usedAt && one.expiresAt > now), invite].slice(-INVITES_KEPT);
  return { invites: kept, invite, link: linkOf({ url, fingerprint, token }) };
}

export function redeemInvite(held, { token, now = Date.now(), by = "" } = {}) {
  const found = held.find((one) => sameToken(one.token, token));
  if (!found) return { error: "no invite by that token" };
  if (found.usedAt) return { error: "that invite was already used" };
  if (found.expiresAt <= now) return { error: "that invite has expired" };
  return { invites: held.map((one) => (one === found ? { ...one, usedAt: now, by } : one)), invite: found };
}

export function peerOf({ url, publicSsh, name = "", now = Date.now() }) {
  const fingerprint = fingerprintOf(publicSsh);
  if (!fingerprint || !rawFromSsh(publicSsh)) return { error: "that is not an ed25519 public key" };
  let at = "";
  try { at = new URL(String(url)).toString().replace(/\/$/, ""); } catch { return { error: "that peer has no address I can read" }; }
  return { peer: { fingerprint, publicSsh: String(publicSsh).trim(), url: at, name: String(name || "").slice(0, 40), knownAt: now } };
}
