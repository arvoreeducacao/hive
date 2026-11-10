import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { constants } from "node:os";
import { join, resolve } from "node:path";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { isVaultRef, loadDotEnv } from "./gateway.mjs";
import { DEFAULT_PORT, hubFor } from "./mcp-gateway.mjs";

export const CONCEALED = "<concealed by 1Password>";
const MIN_SECRET_LENGTH = 4;
const GATEWAY_TIMEOUT_MS = 150 * 1000;
const HEALTH_TIMEOUT_MS = 1500;
const USAGE = 'uso: node "$HIVE_APP_SHIPPED/../server/gateway/vault-run.mjs" [--env-file=.env] [--no-masking] -- <comando> [args...]';

export function parseArgs(argv) {
  const at = argv.indexOf("--");
  const own = at < 0 ? argv : argv.slice(0, at);
  const command = at < 0 ? [] : argv.slice(at + 1);
  const options = { envFile: null, masking: true, command };
  for (const arg of own) {
    if (arg.startsWith("--env-file=")) options.envFile = arg.slice("--env-file=".length);
    else if (arg === "--no-masking") options.masking = false;
    else return { error: `opcao desconhecida: ${arg}\n${USAGE}` };
  }
  if (!command.length) return { error: USAGE };
  return options;
}

export function refsByKey(fileEnv, processEnv) {
  const out = {};
  for (const [key, value] of Object.entries({ ...processEnv, ...fileEnv })) {
    if (isVaultRef(value)) out[key] = String(value).trim();
  }
  return out;
}

export function concealStream(secrets) {
  const list = [...new Set(secrets.filter((secret) => secret && secret.length >= MIN_SECRET_LENGTH))].sort((a, b) => b.length - a.length);
  const hold = list.length ? list[0].length - 1 : 0;
  const decoder = new StringDecoder("utf8");
  const scrub = (text) => list.reduce((acc, secret) => acc.split(secret).join(CONCEALED), text);
  let tail = "";
  return new Transform({
    transform(chunk, _encoding, done) {
      const text = scrub(tail + decoder.write(chunk));
      let cut = Math.max(0, text.length - hold);
      const code = text.charCodeAt(cut - 1);
      if (cut > 0 && code >= 0xd800 && code <= 0xdbff) cut -= 1;
      tail = text.slice(cut);
      done(null, text.slice(0, cut));
    },
    flush(done) {
      done(null, scrub(tail + decoder.end()));
    },
  });
}

export function gatewayTokenOf(hub, env) {
  if (env.HIVE_MCP_GATEWAY_TOKEN) return env.HIVE_MCP_GATEWAY_TOKEN;
  const file = join(hub, ".mcp-servers", ".token");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "";
}

export async function gatewayEnvFile(port, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    const payload = await res.json();
    return typeof payload.envFile === "string" ? payload.envFile : "";
  } catch {
    return "";
  }
}

export async function readFromGateway(refs, { port, token, fetchImpl = fetch }) {
  const res = await fetchImpl(`http://127.0.0.1:${port}/vault/read`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ refs }),
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  });
  const payload = await res.json().catch(() => ({}));
  if (res.ok) return payload.values || {};
  const error = new Error(payload.error || `o gateway respondeu ${res.status}`);
  error.status = res.status;
  error.unknown = payload.unknown || [];
  throw error;
}

function exitCodeOf(code, signal) {
  if (code !== null) return code;
  return signal ? 128 + (constants.signals[signal] || 0) : 1;
}

export function runCommand(command, childEnv, secrets) {
  return new Promise((done) => {
    const masked = secrets.length > 0;
    const child = spawn(command[0], command.slice(1), {
      env: childEnv,
      stdio: ["inherit", masked ? "pipe" : "inherit", masked ? "pipe" : "inherit"],
    });
    if (masked) {
      child.stdout.pipe(concealStream(secrets)).pipe(process.stdout);
      child.stderr.pipe(concealStream(secrets)).pipe(process.stderr);
    }
    const forward = (signal) => child.kill(signal);
    const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
    for (const signal of signals) process.on(signal, forward);
    const finish = (code) => {
      for (const signal of signals) process.off(signal, forward);
      done(code);
    };
    child.on("error", (error) => {
      console.error(`vault-run: nao consegui rodar ${command[0]}: ${error.message}`);
      finish(127);
    });
    child.on("close", (code, signal) => finish(exitCodeOf(code, signal)));
  });
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const options = parseArgs(argv);
  if (options.error) {
    console.error(options.error);
    return 2;
  }
  const hub = hubFor(process.cwd(), env);
  const port = Number(env.HIVE_MCP_GATEWAY_PORT || DEFAULT_PORT);
  const envFile = options.envFile ? resolve(options.envFile) : (await gatewayEnvFile(port, fetchImpl)) || join(hub, ".env");
  if (!existsSync(envFile)) {
    console.error(`vault-run: nao achei ${envFile}. Rode da raiz do hub ou passe --env-file=<arquivo>.`);
    return 2;
  }
  const fileEnv = loadDotEnv(envFile, {});
  const wanted = refsByKey(fileEnv, env);
  const refs = [...new Set(Object.values(wanted))];
  let values = {};
  if (refs.length) {
    try {
      values = await readFromGateway(refs, { port, token: gatewayTokenOf(hub, env), fetchImpl });
    } catch (error) {
      if (error.status === 403) {
        console.error(`vault-run: ${error.message}: ${error.unknown.join(", ")}. Para outra referencia, use op run.`);
        return 2;
      }
      if (error.status === 502) {
        console.error(`vault-run: ${error.message}. Se o 1Password abriu uma janela, aprove e rode de novo.`);
        return 1;
      }
      console.error(`vault-run: o gateway do Hive nao entregou o cofre (${error.message}); usando op run, que pede autorizacao no 1Password`);
      const fallback = ["op", "run", `--env-file=${envFile}`, ...(options.masking ? [] : ["--no-masking"]), "--", ...options.command];
      return runCommand(fallback, env, []);
    }
  }
  const resolved = Object.fromEntries(Object.entries(wanted).map(([key, ref]) => [key, values[ref] ?? ""]));
  const secrets = options.masking ? Object.values(values) : [];
  return runCommand(options.command, { ...env, ...fileEnv, ...resolved }, secrets);
}

const invokedDirectly = (() => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  process.exitCode = await main();
}
