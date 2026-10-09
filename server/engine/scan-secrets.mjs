import { createHash } from "node:crypto";

const CREDENTIAL = "credential";
const PERSONAL = "personal";

const PATTERNS = [
  { name: "aws-access-key", class: CREDENTIAL, re: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  {
    name: "aws-secret-key",
    class: CREDENTIAL,
    re: /\baws_secret_access_key["'\s]*[=:]\s*["']?([A-Za-z0-9/+=]{40})\b/gi,
    group: 1,
  },
  { name: "aws-session-token", class: CREDENTIAL, re: /\baws_session_token["'\s]*[=:]\s*["']?([A-Za-z0-9/+=]{100,})/gi, group: 1 },
  { name: "github-token", class: CREDENTIAL, re: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { name: "github-pat", class: CREDENTIAL, re: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
  { name: "anthropic-key", class: CREDENTIAL, re: /\bsk-ant-[A-Za-z0-9_-]{24,}/g },
  { name: "openai-key", class: CREDENTIAL, re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { name: "slack-token", class: CREDENTIAL, re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g },
  { name: "slack-webhook", class: CREDENTIAL, re: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/+]{20,}/g },
  { name: "google-api-key", class: CREDENTIAL, re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "stripe-key", class: CREDENTIAL, re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g },
  { name: "twilio-sid", class: CREDENTIAL, re: /\bAC[0-9a-f]{32}\b/g },
  { name: "sendgrid-key", class: CREDENTIAL, re: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
  { name: "private-key", class: CREDENTIAL, re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----(?:[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----)?/g },
  { name: "jwt", class: CREDENTIAL, re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  {
    name: "url-with-password",
    class: CREDENTIAL,
    re: /\b(?:mysql|mysql2|postgres|postgresql|mongodb(?:\+srv)?|redis|rediss|amqp|amqps|clickhouse|https?):\/\/[^:@/\s"']{1,64}:([^@/\s"']{3,})@/gi,
    group: 1,
  },
  { name: "bearer", class: CREDENTIAL, re: /\b[Aa]uthorization["'\s]*[=:]\s*["']?(?:Bearer|Basic|token)\s+([A-Za-z0-9._~+/=-]{16,})/g, group: 1 },
  {
    name: "sensitive-env",
    class: CREDENTIAL,
    re: /\b[A-Z][A-Z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL|DSN)[A-Z0-9_]*\s*[=:]\s*["']?([^\s"'{},;]{8,})/g,
    group: 1,
  },
  { name: "cpf", class: PERSONAL, re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, valid: validCpf },
  { name: "email", class: PERSONAL, re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, valid: externalEmail },
  { name: "phone-br", class: PERSONAL, re: /(?:\+55[\s-]?)?\(?\d{2}\)?[\s-]?9\d{4}[\s-]?\d{4}\b/g },
];

const CONFIGURED_DOMAINS = String(process.env.HIVE_INTERNAL_DOMAINS || "")
  .split(",").map((one) => one.trim().toLowerCase()).filter(Boolean);

const INTERNAL_DOMAINS = [
  ...CONFIGURED_DOMAINS,
  "example.com",
  "example.org",
  "sentry.io",
  "noreply.github.com",
  "users.noreply.github.com",
];

const HARMLESS_VALUES = new Set(
  [
    "AKIAIOSFODNN7EXAMPLE",
    "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "REDACTED",
    "REDIGIDO",
    "CHANGEME",
    "PLACEHOLDER",
    "EXAMPLE",
    "SEUTOKEN",
    "undefined",
    "null",
    "true",
    "false",
  ].map((v) => v.toLowerCase()),
);

const NOISE = /^(?:x{3,}|\*{3,}|\.{3,}|-{3,}|_{3,}|0{6,}|\$\{[^}]*\}|<[^>]*>|%[A-Za-z_]+%)$/;

function externalEmail(value) {
  const domain = value.split("@")[1]?.toLowerCase() ?? "";
  return !INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function validCpf(value) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  for (const cut of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < cut; i += 1) sum += Number(digits[i]) * (cut + 1 - i);
    const rest = (sum * 10) % 11;
    const expected = rest === 10 ? 0 : rest;
    if (expected !== Number(digits[cut])) return false;
  }
  return true;
}

export function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function harmless(value) {
  const clean = value.trim();
  if (clean.length < 6) return true;
  if (NOISE.test(clean)) return true;
  if (HARMLESS_VALUES.has(clean.toLowerCase())) return true;
  if (/example|placeholder|redacted|redigido|dummy|sample/i.test(clean)) return true;
  return false;
}

export function scan(text, { allowlist = new Set() } = {}) {
  if (!text) return [];
  const findings = [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let m = pattern.re.exec(text);
    while (m !== null) {
      const value = pattern.group ? m[pattern.group] : m[0];
      if (value && !harmless(value) && !(pattern.valid && !pattern.valid(value))) {
        const mark = fingerprint(value);
        if (!allowlist.has(mark)) {
          findings.push({
            pattern: pattern.name,
            class: pattern.class,
            mark,
            length: value.length,
            start: pattern.group ? m.index + m[0].indexOf(value) : m.index,
            value,
          });
        }
      }
      if (pattern.re.lastIndex === m.index) pattern.re.lastIndex += 1;
      m = pattern.re.exec(text);
    }
  }
  return findings;
}

export function redact(text, { allowlist = new Set() } = {}) {
  const findings = scan(text, { allowlist });
  if (findings.length === 0) return { text, findings: [] };
  const ordered = [...findings].sort((a, b) => b.start - a.start);
  let out = text;
  const applied = [];
  for (const f of ordered) {
    const end = f.start + f.value.length;
    if (out.slice(f.start, end) !== f.value) continue;
    out = `${out.slice(0, f.start)}[${f.class === CREDENTIAL ? "SECRET" : "PERSONAL"}:${f.pattern}:${f.mark}]${out.slice(end)}`;
    applied.push(f);
  }
  return { text: out, findings: findings.map(({ value, ...rest }) => rest), applied: applied.length };
}

export function summarize(findings) {
  const byPattern = new Map();
  let credentials = 0;
  let personal = 0;
  for (const f of findings) {
    byPattern.set(f.pattern, (byPattern.get(f.pattern) ?? 0) + 1);
    if (f.class === CREDENTIAL) credentials += 1;
    else personal += 1;
  }
  return {
    total: findings.length,
    credentials,
    personal,
    by_pattern: Object.fromEntries([...byPattern.entries()].sort((a, b) => b[1] - a[1])),
    distinct_marks: new Set(findings.map((f) => f.mark)).size,
  };
}

export const CLASSES = { CREDENTIAL, PERSONAL };
