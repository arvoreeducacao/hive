import { test } from "node:test";
import assert from "node:assert/strict";
import { MINTED, mintedFile, readMinted, secretsForSeats, valueFor } from "../lib/secrets.mjs";

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
