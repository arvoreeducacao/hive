import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, redact, fingerprint, CLASSES } from "../scan-secrets.mjs";

const fragment = (...parts) => parts.join("");

function matched(text, pattern) {
  return scan(text).some((f) => f.pattern === pattern);
}

test("catches an AWS access key id", () => {
  const key = fragment("AKIA", "3MJQ7XK2WLPZ9DRV");
  assert.ok(matched(`export AWS_ACCESS_KEY_ID=${key}`, "aws-access-key"));
});

test("catches a GitHub token", () => {
  const token = fragment("ghp_", "9Kq2LmZ", "8vTn4RwXbY", "6cJdH1sPfA0eQ", "gU7iVb");
  assert.ok(matched(`gh auth login --with-token ${token}`, "github-token"));
});

test("catches an Anthropic key", () => {
  const key = fragment("sk-ant-", "api03-", "7hK2mNpQ4rStUvWxYz", "8aBcDeFgHiJkLmNo");
  assert.ok(matched(`ANTHROPIC_API_KEY=${key}`, "anthropic-key"));
});

test("catches a Slack token", () => {
  const token = fragment("xoxb-", "28419376", "-4720", "-", "Kp8mQ2vLnZ7xTd4RwYbJhS");
  assert.ok(matched(`slack token: ${token}`, "slack-token"));
});

test("catches a database url that carries a password", () => {
  const url = fragment("mysql://", "arvore_ro", ":", "Tr0v4d0r-2026-xY", "@rds.internal:3306/arvore");
  const findings = scan(url);
  assert.ok(findings.some((f) => f.pattern === "url-with-password"));
});

test("catches a private key header", () => {
  assert.ok(matched("-----BEGIN OPENSSH PRIVATE KEY-----", "private-key"));
});

test("catches a JWT", () => {
  const jwt = fragment("eyJ", "hbGciOiJIUzI1NiJ9", ".", "eyJ", "zdWIiOiIxMjM0NSJ9", ".", "Kp8mQ2vLnZ7xTd4RwYbJhS");
  assert.ok(matched(jwt, "jwt"));
});

test("catches a labelled sensitive env var", () => {
  assert.ok(matched("DATABASE_PASSWORD=n4oMePonhaNoGit", "sensitive-env"));
});

test("ignores placeholder and example values", () => {
  const harmless = [
    "AWS_SECRET_ACCESS_KEY=REDACTED",
    "API_KEY=xxxxxxxxxx",
    "TOKEN=${MY_TOKEN}",
    "PASSWORD=<put-it-here>",
    fragment("AKIA", "IOSFODNN7EXAMPLE"),
    "SECRET_KEY=placeholder",
  ];
  for (const t of harmless) {
    assert.deepEqual(scan(t), [], `should ignore: ${t}`);
  }
});

test("validates CPF check digits instead of matching any 11 digits", () => {
  assert.ok(matched("CPF do responsavel: 529.982.247-25", "cpf"));
  assert.ok(!matched("protocolo 123.456.789-00", "cpf"));
  assert.ok(!matched("id 111.111.111-11", "cpf"));
});

test("flags external emails but not the domains a deployment calls its own", () => {
  assert.ok(matched("contact: someone@gmail.com", "email"));
  assert.ok(!matched("bot@noreply.github.com", "email"));
  assert.ok(matched("contact: someone@acme.test", "email"), "with no domains configured every address is external");
});

test("classifies credentials apart from personal data", () => {
  const key = fragment("AKIA", "3MJQ7XK2WLPZ9DRV");
  const findings = scan(`${key} and the cpf 529.982.247-25`);
  const classes = new Set(findings.map((f) => f.class));
  assert.ok(classes.has(CLASSES.CREDENTIAL));
  assert.ok(classes.has(CLASSES.PERSONAL));
});

test("redaction removes the raw value and leaves a stable marker", () => {
  const key = fragment("AKIA", "3MJQ7XK2WLPZ9DRV");
  const text = `used the key ${key} in the command`;
  const { text: clean, findings } = redact(text);
  assert.ok(!clean.includes(key));
  assert.match(clean, /\[SECRET:aws-access-key:[0-9a-f]{12}\]/);
  assert.equal(findings.length, 1);
  assert.equal(redact(text).text, clean);
});

test("redaction never leaks the value into the report", () => {
  const key = fragment("AKIA", "3MJQ7XK2WLPZ9DRV");
  const { findings } = redact(`key ${key}`);
  for (const f of findings) assert.equal(f.value, undefined);
});

test("the same secret always gets the same fingerprint", () => {
  const key = fragment("AKIA", "3MJQ7XK2WLPZ9DRV");
  assert.equal(fingerprint(key), fingerprint(key));
  assert.notEqual(fingerprint(key), fingerprint(`${key}X`));
});

test("an allowlisted fingerprint stops being reported", () => {
  const key = fragment("AKIA", "3MJQ7XK2WLPZ9DRV");
  const mark = scan(`key ${key}`)[0].mark;
  assert.deepEqual(scan(`key ${key}`, { allowlist: new Set([mark]) }), []);
});

test("handles several secrets in one text without corrupting offsets", () => {
  const a = fragment("AKIA", "3MJQ7XK2WLPZ9DRV");
  const b = fragment("ghp_", "9Kq2LmZ", "8vTn4RwXbY", "6cJdH1sPfA0eQ", "gU7iVb");
  const { text: clean } = redact(`first ${a} middle ${b} end`);
  assert.ok(!clean.includes(a));
  assert.ok(!clean.includes(b));
  assert.match(clean, /^first \[SECRET:.+\] middle \[SECRET:.+\] end$/);
});

test("empty and short inputs are safe", () => {
  assert.deepEqual(scan(""), []);
  assert.deepEqual(scan(null), []);
  assert.equal(redact("").text, "");
});
