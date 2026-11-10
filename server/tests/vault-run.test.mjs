import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { text } from "node:stream/consumers";
import { createGateway, vaultRequestOf } from "../gateway/gateway.mjs";
import { CONCEALED, concealStream, parseArgs, refsByKey } from "../gateway/vault-run.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "gateway", "vault-run.mjs");
const TOKEN = "token-de-teste";

function startGateway(t, { env, vaultRead, dotEnv }) {
  const dir = mkdtempSync(join(tmpdir(), "vault-run-"));
  const envFile = join(dir, dotEnv ? ".env" : ".env-inexistente");
  if (dotEnv) writeFileSync(envFile, dotEnv);
  const gateway = createGateway({
    hub: dir,
    envFile,
    definitions: {},
    manifestDir: join(dir, ".manifest"),
    token: TOKEN,
    env,
    vaultRead,
    log: () => {},
  });
  t.after(async () => {
    await gateway.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, gateway };
}

const readVault = (port, refs, token = TOKEN) =>
  fetch(`http://127.0.0.1:${port}/vault/read`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ refs }),
  });

const runCli = (args, env, cwd = tmpdir()) =>
  new Promise((done) => {
    execFile(process.execPath, [CLI, ...args], { cwd, env: { PATH: process.env.PATH, ...env } }, (error, stdout, stderr) => {
      done({ code: error ? error.code : 0, stdout, stderr });
    });
  });

test("parseArgs separa as opcoes do comando", () => {
  assert.deepEqual(parseArgs(["--env-file=x.env", "--no-masking", "--", "curl", "-s"]), { envFile: "x.env", masking: false, command: ["curl", "-s"] });
  assert.match(parseArgs(["curl"]).error, /uso:/);
  assert.match(parseArgs(["--outra", "--", "ls"]).error, /opcao desconhecida: --outra/);
});

test("refsByKey pega so as referencias, e o arquivo vence o ambiente", () => {
  const out = refsByKey({ A: "op://c/i/A", B: "cru" }, { A: "op://c/i/velho", C: " op://c/i/C ", D: "cru" });
  assert.deepEqual(out, { A: "op://c/i/A", C: "op://c/i/C" });
});

test("vaultRequestOf so aceita referencia que esta no .env do hub", () => {
  const source = { A: "op://c/i/A", B: "cru" };
  assert.deepEqual(vaultRequestOf({ refs: ["op://c/i/A", " op://c/i/A "] }, source), { refs: ["op://c/i/A"] });
  assert.deepEqual(vaultRequestOf({ refs: ["op://c/i/A", "op://outro/x/y"] }, source).unknown, ["op://outro/x/y"]);
  assert.match(vaultRequestOf({}, source).error, /refs/);
});

test("concealStream esconde o segredo mesmo partido entre dois pedacos", async () => {
  const source = Readable.from([Buffer.from("antes segre"), Buffer.from("do-longo depois e segredo-longo")]);
  const out = await text(source.pipe(concealStream(["segredo-longo", "abc"])));
  assert.equal(out, `antes ${CONCEALED} depois e ${CONCEALED}`);
});

test("a rota /vault/read devolve o valor, le o cofre uma vez e recusa o resto", async (t) => {
  const lidas = [];
  const { gateway } = startGateway(t, {
    env: { SEGREDO: "op://Privado/falso/credencial" },
    vaultRead: async (ref) => { lidas.push(ref); return "do-cofre"; },
  });
  const { port } = await gateway.listen(0);

  const primeira = await readVault(port, ["op://Privado/falso/credencial"]);
  assert.equal(primeira.status, 200);
  assert.deepEqual((await primeira.json()).values, { "op://Privado/falso/credencial": "do-cofre" });
  await readVault(port, ["op://Privado/falso/credencial"]);
  assert.deepEqual(lidas, ["op://Privado/falso/credencial"]);

  const estranha = await readVault(port, ["op://Privado/outro/credencial"]);
  assert.equal(estranha.status, 403);
  assert.deepEqual((await estranha.json()).unknown, ["op://Privado/outro/credencial"]);

  assert.equal((await readVault(port, ["op://Privado/falso/credencial"], "errado")).status, 401);
  assert.deepEqual(lidas, ["op://Privado/falso/credencial"]);
});

test("a rota /vault/read devolve 502 quando o 1Password recusa, e tenta de novo depois", async (t) => {
  let tentativas = 0;
  const { gateway } = startGateway(t, {
    env: { SEGREDO: "op://Privado/falso/credencial" },
    vaultRead: async () => {
      tentativas += 1;
      if (tentativas === 1) throw new Error("authorization prompt dismissed");
      return "do-cofre";
    },
  });
  const { port } = await gateway.listen(0);
  const falha = await readVault(port, ["op://Privado/falso/credencial"]);
  assert.equal(falha.status, 502);
  assert.match((await falha.json()).error, /dismissed/);
  assert.equal((await readVault(port, ["op://Privado/falso/credencial"])).status, 200);
});

test("o vault-run roda o comando com o valor do gateway e esconde o valor na saida", async (t) => {
  const { dir, gateway } = startGateway(t, {
    env: { SEGREDO: "op://Privado/falso/credencial" },
    vaultRead: async () => "valor-do-cofre",
  });
  const { port } = await gateway.listen(0);
  const envFile = join(dir, "hub.env");
  writeFileSync(envFile, "SEGREDO=op://Privado/falso/credencial\nCRU=aberto\n");
  const env = { HIVE_MCP_GATEWAY_TOKEN: TOKEN, HIVE_MCP_GATEWAY_PORT: String(port), HIVE_HUB: dir };
  const script = "process.stdout.write([process.env.SEGREDO, process.env.SEGREDO.length, process.env.CRU].join(' '))";

  const mascarado = await runCli([`--env-file=${envFile}`, "--", process.execPath, "-e", script], env);
  assert.equal(mascarado.code, 0, mascarado.stderr);
  assert.equal(mascarado.stdout, `${CONCEALED} 14 aberto`);

  const aberto = await runCli([`--env-file=${envFile}`, "--no-masking", "--", process.execPath, "-e", script], env);
  assert.equal(aberto.stdout, "valor-do-cofre 14 aberto");
});

test("o vault-run devolve o codigo de saida do comando", async (t) => {
  const { dir, gateway } = startGateway(t, { env: {}, vaultRead: async () => "x" });
  const { port } = await gateway.listen(0);
  const envFile = join(dir, "hub.env");
  writeFileSync(envFile, "CRU=aberto\n");
  const env = { HIVE_MCP_GATEWAY_TOKEN: TOKEN, HIVE_MCP_GATEWAY_PORT: String(port), HIVE_HUB: dir };
  const saida = await runCli([`--env-file=${envFile}`, "--", process.execPath, "-e", "process.exit(7)"], env);
  assert.equal(saida.code, 7);
});

test("o vault-run recusa referencia que o gateway nao conhece", async (t) => {
  const { dir, gateway } = startGateway(t, { env: {}, vaultRead: async () => "x" });
  const { port } = await gateway.listen(0);
  const envFile = join(dir, "hub.env");
  writeFileSync(envFile, "OUTRO=op://Privado/outro/credencial\n");
  const env = { HIVE_MCP_GATEWAY_TOKEN: TOKEN, HIVE_MCP_GATEWAY_PORT: String(port), HIVE_HUB: dir };
  const saida = await runCli([`--env-file=${envFile}`, "--", process.execPath, "-e", "1"], env);
  assert.equal(saida.code, 2);
  assert.match(saida.stderr, /so le referencias que estao no \.env do hub: op:\/\/Privado\/outro\/credencial/);
});

test("sem --env-file, o vault-run usa o .env do gateway, de qualquer pasta", async (t) => {
  const { gateway } = startGateway(t, {
    env: {},
    dotEnv: "SEGREDO=op://Privado/falso/credencial\n",
    vaultRead: async () => "valor-do-cofre",
  });
  const { port } = await gateway.listen(0);
  const env = { HIVE_MCP_GATEWAY_TOKEN: TOKEN, HIVE_MCP_GATEWAY_PORT: String(port) };
  const saida = await runCli(["--no-masking", "--", process.execPath, "-e", "process.stdout.write(process.env.SEGREDO)"], env);
  assert.equal(saida.code, 0, saida.stderr);
  assert.equal(saida.stdout, "valor-do-cofre");
});

test("sem gateway e sem .env, o vault-run para e diz o que fazer", async () => {
  const saida = await runCli(["--", process.execPath, "-e", "1"], { HIVE_MCP_GATEWAY_PORT: "1", HIVE_HUB: join(tmpdir(), "hub-que-nao-existe") });
  assert.equal(saida.code, 2);
  assert.match(saida.stderr, /nao achei .*\.env\. Rode da raiz do hub/);
});
