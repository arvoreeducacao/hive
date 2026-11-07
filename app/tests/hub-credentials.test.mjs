import { test } from "node:test";
import assert from "node:assert";
import { credentialAnswerOf, credentialCheckOf, credentialKindOf, credentialsOf, envValuesOf } from "../lib/hub-workspace.mjs";

const servers = {
  servers: {
    "acme-mysql": { command: "node", env: { MYSQL_HOST: "${MYSQL_HOST}", MYSQL_PASSWORD: "${MYSQL_PASSWORD}" } },
    context7: { command: "npx", env: { CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}" } },
    sentry: { command: "npx", env: { SENTRY_ACCESS_TOKEN: "${SENTRY_ACCESS_TOKEN}" } },
    tracker: { url: "https://tracker.example/mcp", headers: { Authorization: "Basic ${TRACKER_MCP_AUTH}" } }
  }
};
const mcpJson = { mcpServers: { hub: { headers: { Authorization: "Bearer ${HIVE_MCP_GATEWAY_TOKEN}" } }, aveia: { headers: { Authorization: "Bearer ${AVEIA_MCP_TOKEN}" } } } };

test("envValuesOf le chave e valor, tirando aspas", () => {
  assert.deepEqual(envValuesOf('A=1\nB="dois"\n# C=3\nD=\n'), { A: "1", B: "dois", D: "" });
});

test("credentialKindOf separa arquivo, 1Password, SSO e vazio", () => {
  const values = { A_TOKEN: "cru", B_TOKEN: "op://Privado/b/credencial", MYSQL_PASSWORD: "", MYSQL_AUTH: "iam", C_TOKEN: "" };
  assert.equal(credentialKindOf("A_TOKEN", values), "file");
  assert.equal(credentialKindOf("B_TOKEN", values), "vault");
  assert.equal(credentialKindOf("MYSQL_PASSWORD", values), "sso");
  assert.equal(credentialKindOf("C_TOKEN", values), "empty");
});

test("credentialsOf lista so as credenciais, sem valor, com o arquivo primeiro", () => {
  const envText = [
    "MYSQL_HOST=banco.exemplo",
    "MYSQL_AUTH=iam",
    "MYSQL_PASSWORD=senha-antiga",
    "CONTEXT7_API_KEY=op://Privado/context7/credencial",
    "SENTRY_ACCESS_TOKEN=valor-cru",
    "AVEIA_MCP_TOKEN=outro-valor",
    "HIVE_MCP_GATEWAY_TOKEN=do-gateway"
  ].join("\n");
  const got = credentialsOf({ envText, servers, mcpJson });
  assert.deepEqual(got.items.map((item) => [item.key, item.kind]), [
    ["AVEIA_MCP_TOKEN", "file"],
    ["MYSQL_PASSWORD", "file"],
    ["SENTRY_ACCESS_TOKEN", "file"],
    ["TRACKER_MCP_AUTH", "empty"],
    ["CONTEXT7_API_KEY", "vault"]
  ]);
  assert.equal(got.items.find((item) => item.key === "MYSQL_PASSWORD").unused, true);
  assert.deepEqual(got.items.find((item) => item.key === "TRACKER_MCP_AUTH").servers, ["tracker"]);
  assert.deepEqual(got.counts, { total: 5, file: 3, empty: 1, vault: 1, sso: 0 });
  assert.doesNotMatch(JSON.stringify(got), /senha-antiga|valor-cru|outro-valor|do-gateway|op:\/\//);
});

test("credentialsOf sem .env nem servers.json devolve lista vazia", () => {
  assert.deepEqual(credentialsOf({}), { items: [], counts: { total: 0, file: 0, empty: 0, vault: 0, sso: 0 } });
});

test("credentialCheckOf manda o valor do 1Password pro /dev/null e confere o SSO pelo perfil", () => {
  const vault = credentialCheckOf("CONTEXT7_API_KEY", { CONTEXT7_API_KEY: "op://Privado/context7/credencial" });
  assert.deepEqual(vault.args, ["-c", 'op read --no-newline "$1" >/dev/null', "op-check", "op://Privado/context7/credencial"]);
  const sso = credentialCheckOf("MYSQL_PASSWORD", { MYSQL_AUTH: "iam", MYSQL_AWS_PROFILE: "acme-prd-sso" });
  assert.equal(sso.command, "aws");
  assert.equal(sso.profile, "acme-prd-sso");
  assert.deepEqual(credentialCheckOf("SENTRY_ACCESS_TOKEN", { SENTRY_ACCESS_TOKEN: "cru" }), { kind: "file" });
});

test("credentialAnswerOf traduz o resultado sem repassar a saida do comando", () => {
  const vault = { kind: "vault", command: "bash" };
  assert.deepEqual(credentialAnswerOf(vault, { ok: true, out: "" }), { kind: "vault", profile: "", ok: true, reason: "ok" });
  assert.equal(credentialAnswerOf(vault, { ok: false, error: "bash: line 1: op: command not found" }).reason, "no-op");
  const sso = { kind: "sso", command: "aws", profile: "acme-prd-sso" };
  assert.equal(credentialAnswerOf(sso, { ok: false, error: "Error when retrieving token from sso: Token has expired and refresh failed" }).reason, "sso-expired");
  assert.equal(credentialAnswerOf({ kind: "file" }, null).reason, "in-file");
  assert.equal(credentialAnswerOf({ kind: "empty" }, null).reason, "empty");
});
