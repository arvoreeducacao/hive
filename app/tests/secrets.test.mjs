import { test } from "node:test";
import assert from "node:assert/strict";
import { MINTED, isVaultRef, mintedFile, readMinted, secretsForSeats, valueFor, vaultThroughGateway, withVaultValues } from "../lib/secrets.mjs";

const hub = "/hub";
const fake = (files) => ({
  read: (path) => files[path],
  there: (path) => Object.prototype.hasOwnProperty.call(files, path)
});

test("what a person wrote in .env wins over anything on disk", () => {
  const files = fake({ "/hub/.mcp-servers/.token": "do-arquivo" });
  const found = valueFor("HIVE_MCP_GATEWAY_TOKEN", { env: { HIVE_MCP_GATEWAY_TOKEN: "do-env" }, hub, ...files });
  assert.equal(found.value, "do-env");
  assert.equal(found.from, "env");
});

test("a token nobody wrote is read where the gateway left it", () => {
  const files = fake({ "/hub/.mcp-servers/.token": "  mintado-com-espaco\n" });
  const found = valueFor("HIVE_MCP_GATEWAY_TOKEN", { env: {}, hub, ...files });
  assert.equal(found.value, "mintado-com-espaco");
  assert.equal(found.from, "minted");
});

test("a secret with no file and no env comes back empty, never undefined", () => {
  const found = valueFor("QUALQUER_OUTRO", { env: {}, hub, ...fake({}) });
  assert.deepEqual(found, { value: "", from: "nowhere" });
  assert.equal(mintedFile("QUALQUER_OUTRO", hub), "");
});

test("an unreadable file is silence, not a crash", () => {
  const files = { read: () => { throw new Error("sem permissão"); }, there: () => true };
  assert.equal(readMinted("/hub/.mcp-servers/.token", files.read, files.there), "");
});

test("only what exists is handed to a seat", () => {
  const files = fake({ "/hub/.mcp-servers/.token": "tk" });
  const out = secretsForSeats(["HIVE_MCP_GATEWAY_TOKEN", "SEM_DONO"], { env: { OUTRO: "x" }, hub, ...files });
  assert.deepEqual(out, { HIVE_MCP_GATEWAY_TOKEN: "tk" });
});

test("the map says which secrets a program mints, so the list is auditable", () => {
  assert.deepEqual(Object.keys(MINTED), ["HIVE_MCP_GATEWAY_TOKEN"]);
  assert.equal(mintedFile("HIVE_MCP_GATEWAY_TOKEN", hub), "/hub/.mcp-servers/.token");
});

test("a 1Password reference reaches the chat as its value, so .mcp.json headers carry the real token", async () => {
  const asked = [];
  const read = async (ref) => { asked.push(ref); return `valor-de-${ref.split("/").pop()}`; };
  const { values, problems } = await withVaultValues({ NOTES: " op://Private/tokens/NOTES ", CRU: "texto" }, read);
  assert.deepEqual(values, { NOTES: "valor-de-NOTES", CRU: "texto" });
  assert.deepEqual(problems, []);
  assert.deepEqual(asked, ["op://Private/tokens/NOTES"]);
});

test("two keys with the same reference ask the vault once", async () => {
  let reads = 0;
  const { values } = await withVaultValues({ A: "op://c/i/x", B: "op://c/i/x" }, async () => { reads += 1; return "v"; });
  assert.deepEqual(values, { A: "v", B: "v" });
  assert.equal(reads, 1);
});

test("a reference the vault refuses is left out, never handed over as op:// text, and the others still pass", async () => {
  const read = async (ref) => {
    if (ref.endsWith("/ruim")) throw new Error(`o cofre recusou ${ref}`);
    return "bom";
  };
  const { values, problems } = await withVaultValues({ RUIM: "op://c/i/ruim", BOM: "op://c/i/bom", CRU: "x" }, read);
  assert.deepEqual(values, { BOM: "bom", CRU: "x" });
  assert.deepEqual(problems, ["o cofre recusou op://c/i/ruim"]);
});

test("with no reference in sight the vault is never asked", async () => {
  const { values } = await withVaultValues({ A: "x" }, async () => { throw new Error("nao devia ler"); });
  assert.deepEqual(values, { A: "x" });
});

test("only op:// values count as references", () => {
  assert.equal(isVaultRef("op://c/i/f"), true);
  assert.equal(isVaultRef("  op://c/i/f\n"), true);
  assert.equal(isVaultRef("Bearer op://c/i/f"), false);
  assert.equal(isVaultRef(undefined), false);
});

test("the gateway is asked one reference at a time with its own token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ values: { "op://c/i/f": "segredo" } }) };
  };
  const read = vaultThroughGateway({ port: 4671, token: "tk", fetchImpl });
  assert.equal(await read("op://c/i/f"), "segredo");
  assert.equal(calls[0].url, "http://127.0.0.1:4671/vault/read");
  assert.equal(calls[0].init.headers.authorization, "Bearer tk");
  assert.deepEqual(JSON.parse(calls[0].init.body), { refs: ["op://c/i/f"] });
});

test("a gateway that says no explains why", async () => {
  const fetchImpl = async () => ({ ok: false, status: 502, json: async () => ({ error: "o cofre ficou travado" }) });
  await assert.rejects(vaultThroughGateway({ port: 1, token: "tk", fetchImpl })("op://c/i/f"), /travado/);
  const empty = async () => ({ ok: true, status: 200, json: async () => ({ values: {} }) });
  await assert.rejects(vaultThroughGateway({ port: 1, token: "tk", fetchImpl: empty })("op://c/i/f"), /nao devolveu op:\/\/c\/i\/f/);
});
