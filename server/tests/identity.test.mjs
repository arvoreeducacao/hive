import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bodyHashOf, canonical, createGuard, fingerprintOf, newIdentity, newNonce,
  publicKeyOf, rawFromSsh, signRequest, sshFromRaw, verifyRequest
} from "../identity.mjs";

function roster(devices) {
  return { find: (fingerprint) => devices.find((d) => d.fingerprint === fingerprint) || null };
}

function ask(me, { method = "POST", path = "/api/say", body = "", audience = "SHA256:broker", at, nonce } = {}) {
  const when = at ?? Date.now();
  const once = nonce ?? newNonce();
  const fields = { method, path, bodyHash: bodyHashOf(body), at: String(when), nonce: once, audience };
  return { method, path, body, at: when, nonce: once, fingerprint: me.fingerprint, signature: signRequest(me.secret, fields) };
}

test("a fresh identity round-trips through the openssh format", () => {
  const me = newIdentity("jonas@mac");
  assert.match(me.publicSsh, /^ssh-ed25519 [A-Za-z0-9+/=]+ jonas@mac$/);
  assert.match(me.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
  const raw = rawFromSsh(me.publicSsh);
  assert.equal(raw.length, 32);
  assert.equal(sshFromRaw(raw, "jonas@mac"), me.publicSsh);
  assert.ok(publicKeyOf(me.publicSsh));
});

test("the fingerprint is the one ssh-keygen prints", () => {
  const me = newIdentity("prova");
  const dir = mkdtempSync(join(tmpdir(), "hive-fp-"));
  try {
    const file = join(dir, "k.pub");
    writeFileSync(file, me.publicSsh + "\n");
    const printed = execFileSync("ssh-keygen", ["-l", "-f", file], { encoding: "utf8" });
    assert.ok(printed.includes(me.fingerprint), `${printed.trim()} não contém ${me.fingerprint}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a public key we generated is one ssh-keygen accepts in allowed_signers", () => {
  const me = newIdentity("jonas@mac");
  const dir = mkdtempSync(join(tmpdir(), "hive-signers-"));
  try {
    const signers = join(dir, "allowed_signers");
    writeFileSync(signers, `jonas ${me.publicSsh.split(" ").slice(0, 2).join(" ")}\n`);
    const back = readFileSync(signers, "utf8");
    assert.ok(rawFromSsh(back.split(" ").slice(1).join(" ")));
    execFileSync("ssh-keygen", ["-l", "-f", signers], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a signature proves the exact request, not just the key", () => {
  const me = newIdentity();
  const fields = { method: "POST", path: "/api/say", bodyHash: bodyHashOf("oi"), at: "1", nonce: "n", audience: "a" };
  const signature = signRequest(me.secret, fields);
  assert.equal(verifyRequest(me.publicSsh, signature, fields), true);

  for (const changed of [
    { ...fields, method: "GET" },
    { ...fields, path: "/api/shell" },
    { ...fields, bodyHash: bodyHashOf("outro") },
    { ...fields, at: "2" },
    { ...fields, nonce: "n2" },
    { ...fields, audience: "outro-broker" }
  ]) {
    assert.equal(verifyRequest(me.publicSsh, signature, changed), false, `aceitou ${JSON.stringify(changed)}`);
  }
});

test("another key's signature does not pass", () => {
  const me = newIdentity();
  const other = newIdentity();
  const fields = { method: "GET", path: "/api/hive", bodyHash: bodyHashOf(""), at: "1", nonce: "n", audience: "a" };
  assert.equal(verifyRequest(me.publicSsh, signRequest(other.secret, fields), fields), false);
});

test("the fields cannot be shuffled into each other", () => {
  const a = canonical({ method: "GET", path: "/ab", bodyHash: "", at: "1", nonce: "n", audience: "x" });
  const b = canonical({ method: "GET", path: "/a", bodyHash: "b", at: "1", nonce: "n", audience: "x" });
  assert.notEqual(a.toString("hex"), b.toString("hex"));
});

test("the guard takes a good request once and never twice", () => {
  const me = newIdentity();
  const guard = createGuard({ roster: roster([{ ...me, name: "mac" }]), audience: "SHA256:broker" });
  const asked = ask(me);
  assert.equal(guard.check(asked).ok, true);
  const again = guard.check(asked);
  assert.equal(again.ok, false);
  assert.match(again.error, /already used once/);
});

test("the guard refuses a stale clock, an unknown key and a revoked one", () => {
  const me = newIdentity();
  const stranger = newIdentity();
  const gone = newIdentity();
  const guard = createGuard({
    roster: roster([{ ...me, name: "mac" }, { ...gone, name: "celular velho", revokedAt: 1 }]),
    audience: "SHA256:broker"
  });

  assert.match(guard.check(ask(me, { at: Date.now() - 300000 })).error, /off the clock/);
  assert.match(guard.check(ask(stranger)).error, /not on the roster/);
  const revoked = guard.check(ask(gone));
  assert.equal(revoked.status, 403);
  assert.match(revoked.error, /revoked/);
});

test("a signature for one broker does not work on another", () => {
  const me = newIdentity();
  const here = createGuard({ roster: roster([{ ...me }]), audience: "SHA256:aqui" });
  const there = createGuard({ roster: roster([{ ...me }]), audience: "SHA256:lá" });
  const asked = ask(me, { audience: "SHA256:aqui" });
  assert.equal(here.check(asked).ok, true);
  assert.equal(there.check({ ...asked, nonce: asked.nonce }).ok, false);
});

test("a tampered body is caught even with a good signature on the envelope", () => {
  const me = newIdentity();
  const guard = createGuard({ roster: roster([{ ...me }]), audience: "SHA256:broker" });
  const asked = ask(me, { body: JSON.stringify({ seat: "meu", text: "oi" }) });
  const tampered = { ...asked, body: JSON.stringify({ seat: "meu", text: "rm -rf /" }) };
  assert.equal(guard.check(tampered).ok, false);
});

test("the nonce memory does not grow without bound", () => {
  const me = newIdentity();
  const guard = createGuard({ roster: roster([{ ...me }]), audience: "a", nonceKept: 16 });
  for (let round = 0; round < 200; round += 1) assert.equal(guard.check(ask(me, { audience: "a" })).ok, true);
  assert.ok(guard.nonces <= 17, `guardou ${guard.nonces}`);
});

test("junk in the key column is refused instead of crashing", () => {
  for (const bad of ["", "ssh-rsa AAAA", "ssh-ed25519", "ssh-ed25519 !!!!", "ssh-ed25519 " + Buffer.from("curto").toString("base64")]) {
    assert.equal(publicKeyOf(bad), null, `aceitou ${JSON.stringify(bad)}`);
    assert.equal(fingerprintOf(bad), "");
  }
});
