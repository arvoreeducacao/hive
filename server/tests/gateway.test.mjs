import { searchTools, reachesRepo } from "../gateway/hub-facade.mjs";
import { HUB_SERVER } from "../gateway/mcp-gateway.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGateway, expandEnv, loadDotEnv, missingEnvKeys, authorize, manifestKey, seatEnvFrom } from "../gateway/gateway.mjs";

const FAKE_SERVER = `
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "falso", version: "9.9.9" } } });
    } else if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "eco", description: "devolve o texto", inputSchema: { type: "object", properties: { texto: { type: "string" } } } }] } });
    } else if (msg.method === "tools/call") {
      send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "eco:" + (msg.params?.arguments?.texto ?? "") + ":" + (process.env.SEGREDO || "sem-env") }] } });
    } else if (msg.id !== undefined) {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  }
});
function send(o) { process.stdout.write(JSON.stringify(o) + "\\n"); }
`;

function bancada() {
  const dir = mkdtempSync(join(tmpdir(), "gw-"));
  const fake = join(dir, "falso-mcp.mjs");
  writeFileSync(fake, FAKE_SERVER);
  const definitions = { falso: { command: process.execPath, args: [fake], env: { SEGREDO: "${VALOR_SECRETO}" } } };
  const gateway = createGateway({
    hub: dir,
    definitions,
    manifestDir: join(dir, ".manifest"),
    token: "token-de-teste",
    env: { VALOR_SECRETO: "abracadabra" },
    idleMs: 50,
    log: () => {},
  });
  return { dir, gateway, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

async function rpc(base, token, message, path = "/mcp/falso") {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(message),
  });
  const body = await res.text();
  if (!res.ok) return { status: res.status, body };
  const linha = body.split("\n").find((l) => l.startsWith("data:"));
  return { status: res.status, payload: JSON.parse(linha ? linha.slice(5).trim() : body) };
}

test("expandEnv troca ${VAR} pelo ambiente e mantem literal", () => {
  const out = expandEnv({ A: "${X}", B: "cru", C: "${NAO_EXISTE}" }, { X: "valor" });
  assert.deepEqual(out, { A: "valor", B: "cru", C: "" });
});

test("loadDotEnv nao sobrescreve o que ja existe no ambiente", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-"));
  writeFileSync(join(dir, ".env"), 'JA_TEM=do-arquivo\nNOVA="entre aspas"\n# comentario\nvazio\n');
  const into = loadDotEnv(join(dir, ".env"), { JA_TEM: "do-processo" });
  assert.equal(into.JA_TEM, "do-processo");
  assert.equal(into.NOVA, "entre aspas");
  rmSync(dir, { recursive: true, force: true });
});

test("authorize recusa navegador, token errado e ausencia de token", () => {
  assert.equal(authorize({ headers: { origin: "https://x.com", authorization: "Bearer t" } }, "t"), "origem de navegador recusada");
  assert.equal(authorize({ headers: { authorization: "Bearer errado" } }, "t"), "credencial invalida");
  assert.equal(authorize({ headers: {} }, "t"), "credencial invalida");
  assert.equal(authorize({ headers: { authorization: "Bearer t" } }, "t"), null);
});

test("manifestKey muda quando a definicao do servidor muda", () => {
  const a = manifestKey({ command: "node", args: ["um.js"] }, "/tmp");
  const b = manifestKey({ command: "node", args: ["dois.js"] }, "/tmp");
  assert.notEqual(a, b);
  assert.equal(a, manifestKey({ command: "node", args: ["um.js"] }, "/tmp"));
});

test("listar ferramentas nao acorda o servidor depois do primeiro catalogo", async (t) => {
  const { gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  const { port } = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;

  await gateway.harvest("falso");
  assert.equal(gateway.upstreams.size, 1, "the first catalogue must bring the server up once");
  await gateway.closeUpstream("falso");
  assert.equal(gateway.upstreams.size, 0);

  const lista = await rpc(base, "token-de-teste", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.equal(lista.status, 200);
  assert.deepEqual(
    lista.payload.result.tools.map((f) => f.name),
    ["eco"],
  );
  assert.equal(gateway.upstreams.size, 0, "listar ferramentas nao pode acordar o servidor");
});

test("chamar a ferramenta acorda o servidor, repassa e leva o env expandido", async (t) => {
  const { gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  const { port } = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;
  await gateway.harvest("falso");
  await gateway.closeUpstream("falso");

  const chamada = await rpc(base, "token-de-teste", {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "eco", arguments: { texto: "oi" } },
  });
  assert.equal(chamada.status, 200);
  assert.equal(chamada.payload.result.content[0].text, "eco:oi:abracadabra");
  assert.equal(gateway.upstreams.size, 1, "chamar a ferramenta precisa acordar o servidor");
});

test("sem servidor acordado o gateway nao arma temporizador nenhum", async (t) => {
  const { gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  await gateway.listen(0);
  assert.equal(gateway.reapArmed(), false, "a stopped gateway must hold no timer, so it never wakes the machine");
  await gateway.ensureUpstream("falso");
  assert.equal(gateway.reapArmed(), true, "com servidor acordado, o ceifador precisa estar armado");
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(gateway.upstreams.size, 0, "the reaper must have taken it down on its own");
  assert.equal(gateway.reapArmed(), false, "derrubado o ultimo servidor, o timer some de novo");
});

test("servidor ocioso e derrubado pelo ceifador", async (t) => {
  const { gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  await gateway.listen(0);
  await gateway.ensureUpstream("falso");
  assert.equal(gateway.upstreams.size, 1);
  await new Promise((r) => setTimeout(r, 80));
  await gateway.reap();
  assert.equal(gateway.upstreams.size, 0, "a server idle past the limit must fall");
});

test("credencial errada nao chega no servidor e rota desconhecida da 404", async (t) => {
  const { gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  const { port } = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;

  const negado = await rpc(base, "token-errado", { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
  assert.equal(negado.status, 401);

  const inexistente = await fetch(`${base}/mcp/nao-existe`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer token-de-teste" },
    body: "{}",
  });
  assert.equal(inexistente.status, 404);
  assert.equal(gateway.upstreams.size, 0);
});

test("health responde sem credencial e conta o que esta acordado", async (t) => {
  const { gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  const { port } = await gateway.listen(0);
  const vazio = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.equal(vazio.ok, true);
  assert.equal(vazio.configurados, 1);
  assert.deepEqual(vazio.acordados, []);

  await gateway.ensureUpstream("falso");
  const cheio = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
  assert.deepEqual(cheio.acordados, ["falso"]);
});

test("warmMissing cataloga so o que falta e nao deixa nada acordado", async (t) => {
  const { gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  const primeira = await gateway.warmMissing();
  assert.equal(primeira.catalogados, 1, "the first time, it catalogues the server that is missing");
  assert.equal(gateway.upstreams.size, 0, "aquecer nao pode deixar servidor de pe");

  const segunda = await gateway.warmMissing();
  assert.equal(segunda.catalogados, 0, "com o catalogo pronto, nao sobe nada de novo");
});

test("warmMissing engole servidor que nao cataloga e segue com os outros", async (t) => {
  const { dir, limpar } = (() => {
    const b = bancada();
    return { dir: b.dir, limpar: b.limpar, gateway: b.gateway };
  })();
  const { createGateway } = await import("../gateway/gateway.mjs");
  const g = createGateway({
    hub: dir,
    definitions: {
      quebrado: { command: process.execPath, args: ["/caminho/que/nao/existe.mjs"] },
      bom: { command: process.execPath, args: [join(dir, "falso-mcp.mjs")] },
    },
    manifestDir: join(dir, ".manifest2"),
    token: "t",
    log: () => {},
  });
  t.after(async () => {
    await g.close();
    limpar();
  });
  const r = await g.warmMissing();
  assert.equal(r.catalogados, 2, "tenta os dois");
  assert.equal(g.upstreams.size, 0, "none stays up, not even the one that worked");
});

function bancadaComEnv(conteudo) {
  const dir = mkdtempSync(join(tmpdir(), "gw-env-"));
  const fake = join(dir, "falso-mcp.mjs");
  writeFileSync(fake, FAKE_SERVER);
  writeFileSync(join(dir, ".env"), conteudo);
  const gateway = createGateway({
    hub: dir,
    definitions: { falso: { command: process.execPath, args: [fake], env: { SEGREDO: "${VALOR_SECRETO}" } } },
    manifestDir: join(dir, ".manifest"),
    token: "token-de-teste",
    env: { VALOR_SECRETO: "do-processo" },
    idleMs: 50,
    log: () => {},
  });
  return { dir, gateway, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

async function ecoDe(gateway) {
  const client = await gateway.ensureUpstream("falso");
  const out = await client.callTool({ name: "eco", arguments: { texto: "oi" } });
  return out.content[0].text;
}

test("expandEnv interpola ${VAR} no meio do texto", () => {
  const out = expandEnv({ A: "Bearer ${T}", B: "${U}@exemplo.invalido", C: "${SUMIU}x" }, { T: "abc", U: "pessoa" });
  assert.deepEqual(out, { A: "Bearer abc", B: "pessoa@exemplo.invalido", C: "x" });
});

test("missingEnvKeys aponta chave ausente e vazia, em env e em headers", () => {
  const definition = {
    env: { A: "${TEM}", B: "${VAZIA}" },
    headers: { Authorization: "Bearer ${SUMIU}", Fixo: "sem-var" },
  };
  assert.deepEqual(missingEnvKeys(definition, { TEM: "v", VAZIA: "   " }).sort(), ["SUMIU", "VAZIA"]);
  assert.deepEqual(missingEnvKeys(definition, { TEM: "v", VAZIA: "v", SUMIU: "v" }), []);
});

test("missingEnvKeys skips keys declared in optionalEnv", () => {
  const definition = {
    env: { A: "${HAS}", B: "${OPTIONAL}" },
    headers: { Authorization: "Basic ${GONE}" },
    optionalEnv: ["OPTIONAL", "GONE"],
  };
  assert.deepEqual(missingEnvKeys(definition, { HAS: "v" }), []);
  assert.deepEqual(missingEnvKeys({ ...definition, optionalEnv: ["OPTIONAL"] }, { HAS: "v" }), ["GONE"]);
});

test("loadDotEnv com override deixa o arquivo vencer o processo", () => {
  const dir = mkdtempSync(join(tmpdir(), "env-ov-"));
  writeFileSync(join(dir, ".env"), "CHAVE=do-arquivo\n");
  const into = loadDotEnv(join(dir, ".env"), { CHAVE: "do-processo" }, { override: true });
  assert.equal(into.CHAVE, "do-arquivo");
  rmSync(dir, { recursive: true, force: true });
});

test("o .env do hub vence o ambiente do processo e recarrega sem reiniciar", async () => {
  const { dir, gateway, limpar } = bancadaComEnv("VALOR_SECRETO=primeiro\n");
  try {
    assert.equal(await ecoDe(gateway), "eco:oi:primeiro");
    writeFileSync(join(dir, ".env"), "VALOR_SECRETO=segundo-valor-mais-longo\n");
    assert.equal(await gateway.reloadEnv(), true);
    assert.equal(gateway.upstreams.size, 0);
    assert.equal(await ecoDe(gateway), "eco:oi:segundo-valor-mais-longo");
    assert.equal(await gateway.reloadEnv(), false);
  } finally {
    await gateway.close();
    limpar();
  }
});

test("upstream http sem credencial falha nomeando a chave que falta", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gw-http-"));
  const gateway = createGateway({
    hub: dir,
    definitions: {
      remoto: { url: "https://exemplo.invalido/mcp", headers: { Authorization: "Bearer ${TOKEN_QUE_FALTA}" } },
    },
    manifestDir: join(dir, ".manifest"),
    token: "token-de-teste",
    env: {},
    log: () => {},
  });
  try {
    await assert.rejects(() => gateway.ensureUpstream("remoto"), /TOKEN_QUE_FALTA/);
    assert.deepEqual(gateway.missingByServer(), { remoto: ["TOKEN_QUE_FALTA"] });
  } finally {
    await gateway.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upstream http real: um gateway consome o outro com header vindo do .env", async () => {
  const baixo = bancada();
  const endereco = await baixo.gateway.listen(0);
  const dir = mkdtempSync(join(tmpdir(), "gw-cadeia-"));
  writeFileSync(join(dir, ".env"), "TOKEN_DO_VIZINHO=token-de-teste\n");
  const alto = createGateway({
    hub: dir,
    definitions: {
      vizinho: {
        url: `http://127.0.0.1:${endereco.port}/mcp/falso`,
        headers: { Authorization: "Bearer ${TOKEN_DO_VIZINHO}" },
      },
    },
    manifestDir: join(dir, ".manifest"),
    token: "token-do-alto",
    env: {},
    log: () => {},
  });
  try {
    const manifest = await alto.harvest("vizinho");
    assert.deepEqual(manifest.tools.map((t) => t.name), ["eco"]);
    const client = await alto.ensureUpstream("vizinho");
    const out = await client.callTool({ name: "eco", arguments: { texto: "pelo-http" } });
    assert.equal(out.content[0].text, "eco:pelo-http:abracadabra");
  } finally {
    await alto.close();
    await baixo.gateway.close();
    baixo.limpar();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("upstream http com token errado no .env falha em vez de fingir que subiu", async () => {
  const baixo = bancada();
  const endereco = await baixo.gateway.listen(0);
  const dir = mkdtempSync(join(tmpdir(), "gw-cadeia-ruim-"));
  writeFileSync(join(dir, ".env"), "TOKEN_DO_VIZINHO=token-errado\n");
  const alto = createGateway({
    hub: dir,
    definitions: {
      vizinho: {
        url: `http://127.0.0.1:${endereco.port}/mcp/falso`,
        headers: { Authorization: "Bearer ${TOKEN_DO_VIZINHO}" },
      },
    },
    manifestDir: join(dir, ".manifest"),
    token: "token-do-alto",
    env: {},
    log: () => {},
  });
  try {
    await assert.rejects(() => alto.ensureUpstream("vizinho"));
    assert.deepEqual(alto.missingByServer(), {});
  } finally {
    await alto.close();
    await baixo.gateway.close();
    baixo.limpar();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("o /reload relê o servers.json: servidor novo passa a existir, o que saiu dorme, e o que mudou é recatalogado", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gw-defs-"));
  const fake = join(dir, "falso-mcp.mjs");
  writeFileSync(fake, FAKE_SERVER);
  mkdirSync(join(dir, ".mcp-servers"), { recursive: true });
  const serversFile = join(dir, ".mcp-servers", "servers.json");
  const write = (servers) => writeFileSync(serversFile, JSON.stringify({ servers }, null, 2));
  write({ falso: { command: process.execPath, args: [fake] } });
  const { createGateway } = await import("../gateway/gateway.mjs");
  const gateway = createGateway({ hub: dir, serversFile, manifestDir: join(dir, ".manifest"), token: "t", idleMs: 50, log: () => {} });
  try {
    assert.deepEqual(gateway.names, ["falso"]);
    await gateway.ensureUpstream("falso");
    write({ falso: { command: process.execPath, args: [fake] }, outro: { command: process.execPath, args: [fake] } });
    assert.deepEqual(await gateway.reloadDefinitions(), { novos: ["outro"], removidos: [], mudados: [] });
    assert.deepEqual(gateway.names, ["falso", "outro"]);
    assert.equal(gateway.upstreams.has("falso"), true, "an untouched server keeps sleeping or running as it was");
    write({ outro: { command: process.execPath, args: [fake, "--x"] } });
    assert.deepEqual(await gateway.reloadDefinitions(), { novos: [], removidos: ["falso"], mudados: ["outro"] });
    assert.equal(gateway.upstreams.has("falso"), false, "a server that left the file is put to sleep");
    assert.deepEqual(gateway.names, ["outro"]);
  } finally {
    await gateway.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("searchTools casa toda palavra no servidor, no nome ou na descrição, e põe o nome que casou na frente", () => {
  const catalog = {
    sentry: { tools: [{ name: "find_issues", description: "procura issues por texto", inputSchema: { type: "object" } }, { name: "get_event", description: "um evento com stack" }] },
    metabase: { tools: [{ name: "run_query", description: "roda SQL e devolve linhas" }] },
  };
  assert.deepEqual(searchTools(catalog, "issues").tools.map((t) => `${t.server}/${t.tool}`), ["sentry/find_issues"]);
  assert.deepEqual(searchTools(catalog, "sentry").tools.map((t) => t.tool), ["find_issues", "get_event"]);
  assert.deepEqual(searchTools(catalog, "sentry event").tools.map((t) => t.tool), ["get_event"]);
  assert.equal(searchTools(catalog, "sql").tools[0].server, "metabase");
  assert.deepEqual(searchTools(catalog, "nada disso").tools, []);
  assert.equal(searchTools(catalog, "", 2).total, 3);
  assert.equal(searchTools(catalog, "", 2).tools.length, 2);
  assert.equal(reachesRepo("*", ""), true);
  assert.equal(reachesRepo(["acme", { repo: "api", path: "x" }], "api"), true);
  assert.equal(reachesRepo(["acme"], "leaf"), false);
  assert.equal(reachesRepo("acme", "acme"), true);
});

test("o /mcp/hub lista e procura sem acordar ninguém, e o mcp_call acorda só o servidor chamado", async (t) => {
  const { dir, gateway, limpar } = bancada();
  t.after(async () => {
    await gateway.close();
    limpar();
  });
  writeFileSync(join(dir, "hive.json"), JSON.stringify({ repos: [], mcps: { falso: ["alpha"] } }));
  const { port } = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;
  await gateway.harvest("falso");
  await gateway.closeUpstream("falso");

  const lista = await rpc(base, "token-de-teste", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, `/mcp/${HUB_SERVER}`);
  assert.deepEqual(lista.payload.result.tools.map((f) => f.name), ["mcp_list", "mcp_search", "mcp_call"]);
  const [listar, procurar, chamar] = lista.payload.result.tools.map((f) => f.description);
  assert.match(listar, /Servidores atrás do hub: falso\./, "a lista diz quem vive atrás do hub");
  assert.match(procurar, /^Antes de dizer que não tem ferramenta/, "a busca manda procurar antes de negar");
  assert.match(procurar, /Servidores atrás do hub: falso\./);
  assert.doesNotMatch(chamar, /Servidores atrás do hub/, "chamar não repete a lista");

  const call = (id, name, args) => rpc(base, "token-de-teste", { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, `/mcp/${HUB_SERVER}`);
  const listado = await call(2, "mcp_list", { repo: "alpha" });
  assert.equal(listado.payload.result.content[0].text, "falso · 1 ferramenta · vale em alpha · eco");
  const semRepo = await call(3, "mcp_list", {});
  assert.equal(semRepo.payload.result.content[0].text, "falso · 1 ferramenta · eco");
  const achado = await call(4, "mcp_search", { query: "texto" });
  const hits = JSON.parse(achado.payload.result.content[0].text);
  assert.equal(hits.total, 1);
  assert.deepEqual([hits.tools[0].server, hits.tools[0].tool], ["falso", "eco"]);
  assert.equal(hits.tools[0].inputSchema.properties.texto.type, "string");
  assert.equal(gateway.upstreams.size, 0, "listar e procurar nao acordam servidor nenhum");

  const chamado = await call(5, "mcp_call", { server: "falso", tool: "eco", arguments: { texto: "oi" } });
  assert.equal(chamado.payload.result.content[0].text, "eco:oi:abracadabra");
  assert.equal(gateway.upstreams.size, 1, "chamar acorda o servidor chamado");

  const errado = await call(6, "mcp_call", { server: "nao-existe", tool: "eco" });
  assert.equal(errado.payload.result.isError, true);
  assert.match(errado.payload.result.content[0].text, /nao existe no hub/);
  const semTool = await call(7, "mcp_call", { server: "falso", tool: "xyz" });
  assert.equal(semTool.payload.result.isError, true);
  assert.match(semTool.payload.result.content[0].text, /nao tem a ferramenta xyz/);
});

test("a cold hub authenticates discovery and catalogs only the requested server", async (t) => {
  const { dir, gateway, limpar } = bancada();
  t.after(async () => { await gateway.close(); limpar(); });
  const { port } = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const call = (name, args, token = "token-de-teste") => rpc(base, token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, "/mcp/hub");
  assert.equal((await call("mcp_list", {}, "wrong")).status, 401);
  assert.match((await call("mcp_list", {})).payload.result.content[0].text, /sem catálogo/);
  const cold = JSON.parse((await call("mcp_search", { query: "eco" })).payload.result.content[0].text);
  assert.deepEqual(cold.uncatalogued, ["falso"]);
  assert.equal(gateway.upstreams.size, 0);
  assert.equal((await call("mcp_search", { query: "", server: "toString" })).payload.result.isError, true);
  assert.equal((await call("mcp_call", { server: "__proto__", tool: "eco" })).payload.result.isError, true);
  const ready = JSON.parse((await call("mcp_search", { query: "", server: "falso" })).payload.result.content[0].text);
  assert.equal(ready.tools[0].tool, "eco");
  assert.deepEqual(ready.uncatalogued, []);
  assert.deepEqual([...gateway.upstreams.keys()], ["falso"]);
  await gateway.closeUpstream("falso");
  assert.equal((await call("mcp_call", { server: "falso", tool: "eco", arguments: [] })).payload.result.isError, true);
  assert.equal(gateway.upstreams.size, 0);
  writeFileSync(join(dir, "hive.json"), JSON.stringify({ mcps: { falso: "*" } }));
  assert.match((await call("mcp_list", { repo: "unrelated" })).payload.result.content[0].text, /todo repositório/);
});

test("a server added after startup is discoverable through the existing hub endpoint", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "gw-add-"));
  const fake = join(dir, "fake.mjs");
  const serversFile = join(dir, "servers.json");
  writeFileSync(fake, FAKE_SERVER);
  writeFileSync(serversFile, '{"servers":{}}');
  const gateway = createGateway({ hub: dir, serversFile, token: "t", log: () => {} });
  t.after(async () => { await gateway.close(); rmSync(dir, { recursive: true, force: true }); });
  const { port } = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;
  const call = (name, args) => rpc(base, "t", { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, "/mcp/hub");
  writeFileSync(serversFile, JSON.stringify({ servers: { fresh: { command: process.execPath, args: [fake] } } }));
  assert.equal((await fetch(`${base}/reload`, { method: "POST", headers: { authorization: "Bearer t" } })).status, 200);
  assert.match((await call("mcp_list", {})).payload.result.content[0].text, /fresh/);
  assert.equal(gateway.upstreams.size, 0);
  assert.equal(JSON.parse((await call("mcp_search", { server: "fresh", query: "" })).payload.result.content[0].text).tools[0].tool, "eco");
  assert.equal((await call("mcp_call", { server: "fresh", tool: "eco", arguments: { texto: "new" } })).payload.result.content[0].text, "eco:new:sem-env");
  writeFileSync(serversFile, '{"servers":{}}');
  await gateway.reloadDefinitions();
  assert.equal((await call("mcp_call", { server: "fresh", tool: "eco" })).payload.result.isError, true);
  assert.equal(JSON.parse((await call("mcp_search", { query: "eco" })).payload.result.content[0].text).total, 0);
});

function colmeia() {
  const base = mkdtempSync(join(tmpdir(), "hive-gw-"));
  for (const dir of ["sessions", "sock", "status", "events"]) mkdirSync(join(base, dir), { recursive: true });
  writeFileSync(join(base, "sessions", "asker.json"), JSON.stringify({ session_id: "s1", cwd: "/w/asker" }));
  writeFileSync(join(base, "sessions", "answerer.json"), JSON.stringify({ session_id: "s2", cwd: "/w/answerer" }));
  return base;
}

async function rpcAs(base, token, seat, message) {
  const res = await fetch(`${base}/mcp/hive`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
      ...(seat ? { "x-hive-seat": seat } : {}),
    },
    body: JSON.stringify(message),
  });
  const body = await res.text();
  if (!res.ok) return { status: res.status, body };
  const linha = body.split("\n").find((l) => l.startsWith("data:"));
  return { status: res.status, payload: JSON.parse(linha ? linha.slice(5).trim() : body) };
}

test("seatEnvFrom builds the seat's environment from the headers and refuses a request with no seat", () => {
  const env = { HIVE_STATE_DIR: "/state", PATH: "/bin" };
  assert.deepEqual(seatEnvFrom({ "x-hive-seat": "asker", "x-hive-side": "cloud" }, env).env, { HIVE_STATE_DIR: "/state", PATH: "/bin", HIVE_SEAT: "asker", HIVE_SIDE: "cloud" });
  assert.equal(seatEnvFrom({ "x-hive-seat": "asker", "x-hive-state-dir": "/other" }, env).env.HIVE_STATE_DIR, "/other");
  assert.equal(seatEnvFrom({ "x-hive-seat": "asker" }, env).env.HIVE_SIDE, "local");
  assert.match(seatEnvFrom({}, env).error, /X-Hive-Seat/);
  assert.match(seatEnvFrom({ "x-hive-seat": "asker" }, { PATH: "/bin" }).error, /X-Hive-State-Dir/);
});

test("the peer route serves whichever seat the header names, in process, with no child per chat", async (t) => {
  const { gateway: semEstado, limpar } = bancada();
  await semEstado.close();
  const state = colmeia();
  const dir = mkdtempSync(join(tmpdir(), "gw-peer-"));
  const gateway = createGateway({ hub: dir, definitions: {}, manifestDir: join(dir, ".manifest"), token: "token-de-teste", env: { HIVE_STATE_DIR: state, PATH: "" }, log: () => {} });
  t.after(async () => {
    await gateway.close();
    limpar();
    rmSync(dir, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  });
  const { port } = await gateway.listen(0);
  const base = `http://127.0.0.1:${port}`;

  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.peer, "/mcp/hive", "the driver reads the route off the health page before routing the peer here");

  const lista = await rpcAs(base, "token-de-teste", "asker", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert.equal(lista.status, 200);
  const names = lista.payload.result.tools.map((f) => f.name);
  assert.ok(names.includes("peers") && names.includes("message") && names.includes("publish"), names.join(","));

  const asAsker = await rpcAs(base, "token-de-teste", "asker", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "peers", arguments: {} } });
  assert.equal(asAsker.status, 200);
  assert.match(asAsker.payload.result.content[0].text, /^you are asker \(/);
  const asAnswerer = await rpcAs(base, "token-de-teste", "answerer", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "peers", arguments: {} } });
  assert.match(asAnswerer.payload.result.content[0].text, /^you are answerer \(/);
  assert.equal(gateway.upstreams.size, 0, "the peer runs inside the gateway, it never spawns");

  const nobody = await rpcAs(base, "token-de-teste", "", { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
  assert.equal(nobody.status, 400);
  assert.match(nobody.body, /X-Hive-Seat/);

  const semToken = await rpcAs(base, "token-errado", "asker", { jsonrpc: "2.0", id: 5, method: "tools/list", params: {} });
  assert.equal(semToken.status, 401);
});
