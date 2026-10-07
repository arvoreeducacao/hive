import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureGateway, gatewayPaths, hubOf, hubFor } from "../gateway/mcp-gateway.mjs";

function bancada({ declaraFerramentas = true, instalado = true, comGateway = true, comToken = "" } = {}) {
  const hub = mkdtempSync(join(tmpdir(), "hub-"));
  const hive = mkdtempSync(join(tmpdir(), "hive-"));
  mkdirSync(join(hub, ".mcp-servers"), { recursive: true });
  if (declaraFerramentas) writeFileSync(join(hub, ".mcp-servers", "servers.json"), '{"servers":{}}');
  if (instalado) mkdirSync(join(hub, ".mcp-servers", "node_modules"), { recursive: true });
  if (comGateway) writeFileSync(join(hive, "gateway.mjs"), "");
  if (comToken) writeFileSync(join(hub, ".mcp-servers", ".token"), comToken + "\n");
  const script = join(hive, "gateway.mjs");
  const vivo = async () => ({
    ok: true,
    json: async () => ({ ok: true, hub: "/mcp/hub", pid: 1, script, scriptMtimeMs: comGateway ? statSync(script).mtimeMs : 0 }),
  });
  return {
    hub,
    hive,
    vivo,
    limpar: () => {
      rmSync(hub, { recursive: true, force: true });
      rmSync(hive, { recursive: true, force: true });
    },
  };
}

const vivo = async () => ({ ok: true, json: async () => ({ ok: true, hub: "/mcp/hub" }) });
const morto = async () => {
  throw new Error("ECONNREFUSED");
};

test("hub que nao declara ferramentas locais e no-op — o hive serve hub nenhum tambem", async () => {
  const b = bancada({ declaraFerramentas: false });
  let subiu = false;
  const r = await ensureGateway({ hub: b.hub, driverDir: b.hive, fetchImpl: morto, spawnImpl: () => (subiu = true) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nao declara ferramentas/);
  assert.equal(subiu, false);
  b.limpar();
});

test("instalacao do hive sem o gateway falha nomeando o hive, nao o hub", async () => {
  const b = bancada({ comGateway: false });
  const r = await ensureGateway({ hub: b.hub, driverDir: b.hive, fetchImpl: morto, spawnImpl: () => {} });
  assert.equal(r.ok, false);
  assert.match(r.reason, /hive/);
  b.limpar();
});

test("gateway ja de pe: nao sobe outro e injeta a credencial no ambiente", async () => {
  const b = bancada({ comToken: "segredo123" });
  const env = {};
  let subiu = false;
  const r = await ensureGateway({ hub: b.hub, driverDir: b.hive, env, fetchImpl: b.vivo, spawnImpl: () => (subiu = true) });
  assert.deepEqual({ ok: r.ok, started: r.started }, { ok: true, started: false });
  assert.equal(subiu, false);
  assert.equal(env.HIVE_MCP_GATEWAY_TOKEN, "segredo123");
  b.limpar();
});

test("gateway parado: sobe uma vez, espera ficar de pe e le a credencial que ele criou", async () => {
  const b = bancada();
  const env = {};
  let subidas = 0;
  let acordado = false;
  let ambienteDoFilho = null;
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env,
    fetchImpl: async () => {
      if (!acordado) throw new Error("ECONNREFUSED");
      return { ok: true, json: async () => ({ ok: true }) };
    },
    spawnImpl: (_cmd, _args, opts) => {
      subidas++;
      ambienteDoFilho = opts.env;
      writeFileSync(join(b.hub, ".mcp-servers", ".token"), "recem-criado\n");
      acordado = true;
      return { unref() {} };
    },
    everyMs: 5,
  });
  assert.deepEqual({ ok: r.ok, started: r.started }, { ok: true, started: true });
  assert.equal(subidas, 1, "nao pode subir mais de um gateway");
  assert.equal(env.HIVE_MCP_GATEWAY_TOKEN, "recem-criado");
  assert.equal(ambienteDoFilho.HIVE_MCP_HUB, b.hub, "o gateway precisa saber de que hub ele serve");
  b.limpar();
});

test("the shared gateway does not carry the tag of the seat that spawned it", async () => {
  const b = bancada();
  let childEnv = null;
  let awake = false;
  await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: { HIVE_SEAT: "spawning-seat", HIVE_SIDE: "local" },
    fetchImpl: async () => {
      if (!awake) throw new Error("ECONNREFUSED");
      return { ok: true, json: async () => ({ ok: true }) };
    },
    spawnImpl: (_cmd, _args, opts) => {
      childEnv = opts.env;
      awake = true;
      return { unref() {} };
    },
    everyMs: 5,
  });
  assert.equal(childEnv.HIVE_SEAT, undefined);
  assert.equal(childEnv.HIVE_SIDE, "local");
  assert.equal(childEnv.HIVE_MCP_HUB, b.hub);
  b.limpar();
});

test("sem as ferramentas instaladas, falha na hora e diz o que rodar", async () => {
  const b = bancada({ instalado: false });
  let subiu = false;
  const inicio = Date.now();
  const r = await ensureGateway({ hub: b.hub, driverDir: b.hive, env: {}, fetchImpl: morto, spawnImpl: () => (subiu = true) });
  assert.equal(r.ok, false);
  assert.equal(r.missingInstall, true);
  assert.match(r.reason, /npm install/);
  assert.equal(subiu, false, "nao adianta subir gateway sem as dependencias");
  assert.ok(Date.now() - inicio < 500, "tem que desistir na hora, nao esperar o gateway que nunca vem");
  b.limpar();
});

test("gateway que nunca responde desiste sem travar o assento", async () => {
  const b = bancada();
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: {},
    fetchImpl: morto,
    spawnImpl: () => ({ unref() {} }),
    steps: 3,
    everyMs: 2,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nao respondeu/);
  b.limpar();
});

test("o gateway mora no hive; a lista de ferramentas e a instalacao moram no hub", () => {
  const p = gatewayPaths("/hub", "/hive/server/gateway");
  assert.equal(p.script, "/hive/server/gateway/gateway.mjs");
  assert.equal(p.servers, "/hub/.mcp-servers/servers.json");
  assert.equal(p.modules, "/hub/.mcp-servers/node_modules");
  assert.equal(hubOf("/a/b/dev-workspaces", {}), "/a/b");
  assert.equal(hubOf("/qualquer", { HIVE_MCP_HUB: "/outro/hub" }), "/outro/hub");
});

test("gateway subido por outro (o boot do pod) e adotado mesmo com o hub resolvido errado", async () => {
  const b = bancada({ declaraFerramentas: false, instalado: false, comGateway: false, comToken: "do-boot" });
  const env = {};
  let subiu = false;
  const r = await ensureGateway({ hub: b.hub, driverDir: b.hive, env, fetchImpl: b.vivo, spawnImpl: () => (subiu = true) });
  assert.deepEqual({ ok: r.ok, adopted: r.adopted, started: r.started }, { ok: true, adopted: true, started: false });
  assert.equal(env.HIVE_MCP_GATEWAY_TOKEN, "do-boot", "sem injetar a credencial, as 14 ferramentas tomam 401 em silencio");
  assert.equal(subiu, false);
  b.limpar();
});

test("gateway de pe mas credencial em outro lugar: falha dizendo onde procurou", async () => {
  const b = bancada({ declaraFerramentas: false, instalado: false, comGateway: false });
  const env = {};
  const r = await ensureGateway({ hub: b.hub, driverDir: b.hive, env, fetchImpl: b.vivo, spawnImpl: () => {} });
  assert.equal(r.ok, false);
  assert.equal(r.adopted, true);
  assert.match(r.reason, /HIVE_HUB/);
  assert.equal(env.HIVE_MCP_GATEWAY_TOKEN, undefined);
  b.limpar();
});

test("credencial vinda do ambiente vence o arquivo — senao gateway e assento usariam segredos diferentes", async () => {
  const b = bancada({ comToken: "do-arquivo" });
  const env = { HIVE_MCP_GATEWAY_TOKEN: "do-secret-do-pod" };
  const r = await ensureGateway({ hub: b.hub, driverDir: b.hive, env, fetchImpl: b.vivo, spawnImpl: () => {} });
  assert.equal(r.ok, true);
  assert.equal(env.HIVE_MCP_GATEWAY_TOKEN, "do-secret-do-pod", "o gateway prefere o ambiente; o assento tem que preferir tambem");
  b.limpar();
});

test("o assento acha o hub subindo do proprio cwd ate as ferramentas declaradas", () => {
  const hub = mkdtempSync(join(tmpdir(), "hub-"));
  mkdirSync(join(hub, ".mcp-servers"), { recursive: true });
  writeFileSync(join(hub, ".mcp-servers", "servers.json"), '{"servers":{}}');
  writeFileSync(join(hub, ".mcp-servers", ".token"), "segredo\n");
  const cwd = join(hub, "dev-workspaces", ".worktrees", "fundo");
  mkdirSync(cwd, { recursive: true });
  assert.equal(hubFor(cwd, {}), hub);
  rmSync(hub, { recursive: true, force: true });
});

test("hub que nunca subiu o gateway tambem e achado — senao a credencial nunca nasce", () => {
  const hub = mkdtempSync(join(tmpdir(), "hub-"));
  mkdirSync(join(hub, ".mcp-servers"), { recursive: true });
  writeFileSync(join(hub, ".mcp-servers", "servers.json"), '{"servers":{}}');
  const cwd = join(hub, "dev-workspaces");
  mkdirSync(cwd, { recursive: true });
  assert.equal(hubFor(cwd, {}), hub, "procurar pelo .token e ovo antes da galinha: quem escreve o .token e o gateway");
  rmSync(hub, { recursive: true, force: true });
});

test("HIVE_MCP_HUB e HIVE_HUB falam mais alto que a caminhada", () => {
  assert.equal(hubFor("/qualquer/lugar", { HIVE_MCP_HUB: "/explicito" }), "/explicito");
  assert.equal(hubFor("/qualquer/lugar", { HIVE_HUB: "/do-app" }), "/do-app");
  assert.equal(hubOf("/qualquer", { HIVE_HUB: "/do-app" }), "/do-app", "o nome canonico tambem vale para hubOf");
});

test("the installed app does not point inside itself when there is no credential anywhere", () => {
  const packaged = mkdtempSync(join(tmpdir(), "app-"));
  const repoDir = join(packaged, "Contents", "Resources");
  mkdirSync(join(repoDir, "server", "gateway"), { recursive: true });
  const cwd = mkdtempSync(join(tmpdir(), "seat-"));
  assert.equal(hubFor(cwd, {}, () => false, repoDir), join(packaged, "Contents"));
  rmSync(packaged, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

test("a instalacao sem gateway.mjs adota o que estiver de pe, mesmo sem a rota hub — nao ha o que subir no lugar", async () => {
  const b = bancada({ comToken: "test", comGateway: false });
  try {
    const opts = { hub: b.hub, driverDir: b.hive, env: {}, killImpl: () => { throw new Error("must not kill"); }, spawnImpl: () => { throw new Error("must adopt"); } };
    const r = await ensureGateway({ ...opts, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true }) }) });
    assert.deepEqual({ ok: r.ok, adopted: r.adopted, hub: r.hub }, { ok: true, adopted: true, hub: false });
    assert.equal((await ensureGateway({ ...opts, fetchImpl: vivo })).hub, true);
  } finally { b.limpar(); }
});

function saudeDe(extra) {
  return async () => ({ ok: true, json: async () => ({ ok: true, hub: "/mcp/hub", ...extra }) });
}

test("gateway de pe sem a rota hub e de uma versao velha: derruba pelo pid e sobe o instalado", async () => {
  const b = bancada({ comToken: "t" });
  let vivoAinda = true;
  let morto = 0;
  let subiu = 0;
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: {},
    fetchImpl: async () => {
      if (!vivoAinda && !subiu) throw new Error("ECONNREFUSED");
      return { ok: true, json: async () => (subiu ? { ok: true, hub: "/mcp/hub" } : { ok: true, pid: 4242 }) };
    },
    killImpl: (pid) => { morto = pid; vivoAinda = false; },
    spawnImpl: () => { subiu++; return { unref() {} }; },
    everyMs: 5,
  });
  assert.equal(morto, 4242);
  assert.equal(subiu, 1);
  assert.deepEqual({ ok: r.ok, started: r.started, replaced: r.replaced }, { ok: true, started: true, replaced: "sem a rota hub" });
  b.limpar();
});

test("gateway com a rota hub que nao diz que versao roda e trocado: depois de um update nao da para confiar nele", async () => {
  const b = bancada({ comToken: "t" });
  let vivoAinda = true;
  let subiu = 0;
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: {},
    fetchImpl: async () => {
      if (!vivoAinda && !subiu) throw new Error("ECONNREFUSED");
      return { ok: true, json: async () => (subiu ? { ok: true, hub: "/mcp/hub" } : { ok: true, hub: "/mcp/hub", pid: 7 }) };
    },
    killImpl: () => { vivoAinda = false; },
    spawnImpl: () => { subiu++; return { unref() {} }; },
    everyMs: 5,
  });
  assert.deepEqual({ subiu, replaced: r.replaced }, { subiu: 1, replaced: "nao diz que gateway.mjs roda" });
  b.limpar();
});

test("gateway com a rota hub mas rodando um gateway.mjs mais antigo que o instalado tambem e trocado", async () => {
  const b = bancada({ comToken: "t" });
  const script = join(b.hive, "gateway.mjs");
  let vivoAinda = true;
  let subiu = 0;
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: {},
    fetchImpl: async () => {
      if (!vivoAinda && !subiu) throw new Error("ECONNREFUSED");
      return { ok: true, json: async () => (subiu ? { ok: true, hub: "/mcp/hub" } : { ok: true, hub: "/mcp/hub", pid: 7, script, scriptMtimeMs: 1 }) };
    },
    statImpl: () => ({ mtimeMs: 2 }),
    killImpl: () => { vivoAinda = false; },
    spawnImpl: () => { subiu++; return { unref() {} }; },
    everyMs: 5,
  });
  assert.equal(subiu, 1);
  assert.equal(r.replaced, "roda um gateway.mjs anterior ao instalado");
  b.limpar();
});

test("gateway com a rota hub e o mesmo gateway.mjs do instalado e adotado sem derrubar", async () => {
  const b = bancada({ comToken: "t" });
  const script = join(b.hive, "gateway.mjs");
  let morto = false;
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: {},
    fetchImpl: saudeDe({ pid: 7, script, scriptMtimeMs: 5 }),
    statImpl: () => ({ mtimeMs: 5 }),
    killImpl: () => { morto = true; },
    spawnImpl: () => { throw new Error("nao devia subir"); },
  });
  assert.deepEqual({ ok: r.ok, adopted: r.adopted, morto }, { ok: true, adopted: true, morto: false });
  b.limpar();
});

test("gateway velho que nao diz o pid: acha quem escuta a porta e derruba", async () => {
  const b = bancada({ comToken: "t" });
  let vivoAinda = true;
  let morto = 0;
  let subiu = 0;
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: {},
    fetchImpl: async () => {
      if (!vivoAinda && !subiu) throw new Error("ECONNREFUSED");
      return { ok: true, json: async () => (subiu ? { ok: true, hub: "/mcp/hub" } : { ok: true }) };
    },
    pidOfPortImpl: () => 999,
    killImpl: (pid) => { morto = pid; vivoAinda = false; },
    spawnImpl: () => { subiu++; return { unref() {} }; },
    everyMs: 5,
  });
  assert.equal(morto, 999);
  assert.equal(r.started, true);
  b.limpar();
});

test("gateway velho que ignora o SIGTERM nao e adotado: o assento fica sabendo em vez de usar a versao errada", async () => {
  const b = bancada({ comToken: "t" });
  const r = await ensureGateway({
    hub: b.hub,
    driverDir: b.hive,
    env: {},
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, pid: 4242 }) }),
    killImpl: () => {},
    spawnImpl: () => { throw new Error("nao devia subir"); },
    steps: 2,
    everyMs: 1,
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nao saiu depois do SIGTERM no pid 4242/);
  b.limpar();
});

test("the driver learns from the health page whether the gateway serves the peer, and an older gateway says no", async () => {
  const b = bancada({ comToken: "segredo" });
  try {
    const script = join(b.hive, "gateway.mjs");
    const comPeer = async () => ({ ok: true, json: async () => ({ ok: true, hub: "/mcp/hub", peer: "/mcp/hive", pid: 1, script, scriptMtimeMs: statSync(script).mtimeMs }) });
    const novo = await ensureGateway({ hub: b.hub, driverDir: b.hive, env: {}, fetchImpl: comPeer, spawnImpl: () => {} });
    assert.equal(novo.ok, true);
    assert.equal(novo.peer, true);
    const velho = await ensureGateway({ hub: b.hub, driverDir: b.hive, env: {}, fetchImpl: b.vivo, spawnImpl: () => {} });
    assert.equal(velho.ok, true);
    assert.equal(velho.peer, false, "a gateway without the route must not be handed the peer");
  } finally {
    b.limpar();
  }
});
