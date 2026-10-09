import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLASSES, scan } from "./scan-secrets.mjs";

const NAME_BY_PATTERN = {
  "aws-access-key": "AWS_ACCESS_KEY_ID",
  "aws-secret-key": "AWS_SECRET_ACCESS_KEY",
  "aws-session-token": "AWS_SESSION_TOKEN",
  "github-token": "GITHUB_TOKEN",
  "github-pat": "GITHUB_TOKEN",
  "anthropic-key": "ANTHROPIC_KEY",
  "openai-key": "OPENAI_API_KEY",
  "slack-token": "SLACK_TOKEN",
  "slack-webhook": "SLACK_WEBHOOK_URL",
  "google-api-key": "GOOGLE_API_KEY",
  "stripe-key": "STRIPE_SECRET_KEY",
  "twilio-sid": "TWILIO_ACCOUNT_SID",
  "sendgrid-key": "SENDGRID_API_KEY",
  "private-key": "PRIVATE_KEY",
  "jwt": "JWT",
  "bearer": "BEARER_TOKEN",
  "url-with-password": "URL_PASSWORD",
  "sensitive-env": "SECRET",
  "high-entropy-env": "SECRET",
};

const NAMES_THE_SEAT_RELIES_ON = /^(?:PATH|HOME|SHELL|USER|PWD|TERM|LANG|TMPDIR|NODE_OPTIONS|ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|CLAUDE_[A-Z0-9_]*|HIVE_[A-Z0-9_]*)$/;

const ASSIGNED_TO = /\b(?:export\s+)?([A-Za-z_][A-Za-z0-9_]{1,63})["']?\s*[=:]\s*["']?$/;

const ASSIGNMENT = /\b([A-Z][A-Z0-9_]{2,63})\s*=\s*["']?([A-Za-z0-9_\-+/=.~]{20,})/g;

function entropy(value) {
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) || 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

function looksRandom(value) {
  if (value.startsWith("/") || value.startsWith(".") || value.includes("://")) return false;
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return false;
  return entropy(value) >= 3.5;
}

function assignedSecrets(text) {
  const found = [];
  ASSIGNMENT.lastIndex = 0;
  let m = ASSIGNMENT.exec(text);
  while (m !== null) {
    const value = m[2];
    if (looksRandom(value)) found.push({ pattern: "high-entropy-env", value, start: m.index + m[0].lastIndexOf(value) });
    m = ASSIGNMENT.exec(text);
  }
  return found;
}

const URL_ASSIGNED_TO = /\b([A-Za-z_][A-Za-z0-9_]{1,63})["']?\s*[=:]\s*["']?[a-z0-9+]+:\/\/\S*$/;

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

function nameBefore(text, start) {
  const line = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
  const named = URL_ASSIGNED_TO.exec(line) || ASSIGNED_TO.exec(line);
  return named && ENV_NAME.test(named[1]) ? named[1] : "";
}

function nameFor(finding, text) {
  const given = nameBefore(text, finding.start);
  if (finding.pattern === "url-with-password") return `${given || "DATABASE_URL"}_PASSWORD`.replace(/_URL_PASSWORD$/, "_PASSWORD");
  if (given && !NAMES_THE_SEAT_RELIES_ON.test(given)) return given;
  return NAME_BY_PATTERN[finding.pattern] || "SECRET";
}

function freeName(wanted, value, held) {
  let name = wanted;
  for (let n = 2; held.has(name) && held.get(name) !== value; n += 1) name = `${wanted}_${n}`;
  return name;
}

export function secretsIn(text) {
  if (typeof text !== "string" || !text) return [];
  const findings = [...scan(text).filter((f) => f.class === CLASSES.CREDENTIAL), ...assignedSecrets(text)];
  const byValue = new Map();
  for (const f of findings.sort((a, b) => b.value.length - a.value.length)) {
    if ([...byValue.keys()].some((kept) => kept !== f.value && kept.includes(f.value))) continue;
    const current = byValue.get(f.value);
    if (!current || current.name === "SECRET") byValue.set(f.value, { value: f.value, pattern: f.pattern, name: nameFor(f, text) });
  }
  return [...byValue.values()];
}

export function pullSecrets(text, held = new Map()) {
  const found = secretsIn(text);
  if (!found.length) return { text, moved: [], held };
  const kept = new Map(held);
  const moved = [];
  let out = text;
  for (const secret of found) {
    const already = [...kept.entries()].find(([, value]) => value === secret.value);
    const name = already ? already[0] : freeName(secret.name, secret.value, kept);
    kept.set(name, secret.value);
    out = out.split(secret.value).join(`$${name}`);
    moved.push({ name, pattern: secret.pattern });
  }
  return { text: out, moved, held: kept };
}

export function shellEnvNote(moved, file) {
  const names = moved.map((one) => `$${one.name}`).join(", ");
  const count = moved.length === 1 ? "1 secret was" : `${moved.length} secrets were`;
  return `[hive: ${count} taken out of this message before it reached you and kept in this chat's shell environment as ${names}. Use them by name in Bash, e.g. curl -H "Authorization: Bearer $${moved[0].name}". Every Bash command already has them; if one comes up empty, start the command with \`. '${file}' &&\`. Never print, echo, cat, log or write their values anywhere, and never read that file.]`;
}

export function shellEnvFileFor(base, name) {
  return join(base, "shell-env", `${name}.sh`);
}

function quoted(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function shellEnvScript(held) {
  return [...held.entries()].map(([name, value]) => `export ${name}=${quoted(value)}`).join("\n") + (held.size ? "\n" : "");
}

export function parseShellEnv(script) {
  const held = new Map();
  const line = /^export ([A-Za-z_][A-Za-z0-9_]*)='((?:[^']|'\\'')*)'$/gm;
  let m = line.exec(script);
  while (m !== null) {
    held.set(m[1], m[2].replace(/'\\''/g, "'"));
    m = line.exec(script);
  }
  return held;
}

export async function readShellEnv(file) {
  try { return parseShellEnv(await readFile(file, "utf8")); } catch { return new Map(); }
}

export async function writeShellEnv(file, held) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, shellEnvScript(held), { mode: 0o600 });
  await chmod(file, 0o600);
}

export function shellEnvLoader(file) {
  return `[ -r ${quoted(file)} ] && . ${quoted(file)}\n`;
}

export async function prepareShellEnv(file) {
  await writeShellEnv(file, await readShellEnv(file));
  const loader = file.replace(/\.sh$/, ".load.sh");
  await writeFile(loader, shellEnvLoader(file), { mode: 0o600 });
  return loader;
}

export function makeSecretKeeper(file, { read = readShellEnv, write = writeShellEnv } = {}) {
  let chain = Promise.resolve();
  const keep = (text) => {
    const run = chain.then(async () => {
      const { text: clean, moved, held } = pullSecrets(text, await read(file));
      if (moved.length) await write(file, held);
      return { text: moved.length ? `${clean}\n\n${shellEnvNote(moved, file)}` : text, shown: clean, moved };
    });
    chain = run.catch(() => {});
    return run;
  };
  return {
    file,
    async command(cmd) {
      if (cmd?.type === "say" && typeof cmd.text === "string") {
        const { text, shown, moved } = await keep(cmd.text);
        return moved.length ? { cmd: { ...cmd, text }, shown, moved } : { cmd, moved };
      }
      if (cmd?.type === "answer" && cmd.answers && typeof cmd.answers === "object" && !Array.isArray(cmd.answers)) {
        const answers = {};
        const moved = [];
        for (const [question, given] of Object.entries(cmd.answers)) {
          if (typeof given !== "string") { answers[question] = given; continue; }
          const kept = await keep(given);
          answers[question] = kept.text;
          moved.push(...kept.moved);
        }
        return { cmd: moved.length ? { ...cmd, answers } : cmd, moved };
      }
      return { cmd, moved: [] };
    },
  };
}
