import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeConfigPath, readClaudeConfig, hubServers, stdioServersFor, gatewayNameFor, peerServerFor, routedThroughGateway } from "../engine/mcp-routing.mjs";

const cwd = "/work/hub";

const config = {
  mcpServers: {
    hubspot: { command: "npx", args: ["-y", "@arvoretech/hubspot-mcp"] },
    playwright: { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
    "360dialog": { type: "http", url: "https://mcp.360dialog.com/mcp" },
    hive: { type: "stdio", command: "node", args: ["peer.mjs"] },
  },
  projects: {
    [cwd]: {
      mcpServers: {
        "arvore-mysql-direnv": { command: "direnv", args: ["exec", cwd, "npx", "-y", "@arvoretech/mysql-mcp"] },
        "super-postgresql-direnv": { command: "direnv", args: ["exec", cwd, "sh", "-c", "postgresql-mcp"] },
        refero: { type: "http", url: "https://refero.design/mcp" },
      },
    },
    "/work/other": {
      mcpServers: { "clickhouse-direnv": { command: "direnv", args: ["exec", "/work/other", "npx", "-y", "@arvoretech/clickhouse-mcp"] } },
    },
  },
};

const served = ["arvore-mysql", "super-postgresql", "identity-postgresql", "clickhouse", "hubspot", "slack-advanced"];

test("stdioServersFor takes the user scope and the project scope of this cwd, stdio only", () => {
  const names = Object.keys(stdioServersFor(config, cwd)).sort();
  assert.deepEqual(names, ["arvore-mysql-direnv", "hive", "hubspot", "playwright", "super-postgresql-direnv"]);
});

test("gatewayNameFor matches the exact name or the name without -direnv", () => {
  assert.equal(gatewayNameFor("hubspot", served), "hubspot");
  assert.equal(gatewayNameFor("arvore-mysql-direnv", served), "arvore-mysql");
  assert.equal(gatewayNameFor("playwright", served), "");
  assert.equal(gatewayNameFor("hive", served), "");
  assert.equal(gatewayNameFor("identity-direnv", served), "");
});

test("routedThroughGateway rewrites the served ones as http routes with the bearer and keeps the rest", () => {
  const { routed, kept } = routedThroughGateway({ config, cwd, served, port: 4671, token: "segredo" });
  assert.deepEqual(Object.keys(routed).sort(), ["arvore-mysql-direnv", "hubspot", "super-postgresql-direnv"]);
  assert.deepEqual(routed["arvore-mysql-direnv"], {
    type: "http",
    url: "http://127.0.0.1:4671/mcp/arvore-mysql",
    headers: { Authorization: "Bearer segredo" },
  });
  assert.equal(routed.hubspot.url, "http://127.0.0.1:4671/mcp/hubspot");
  assert.deepEqual(kept.sort(), ["hive", "playwright"]);
});

test("routedThroughGateway routes nothing when the gateway serves nothing", () => {
  const { routed, kept } = routedThroughGateway({ config, cwd, served: [], port: 4671, token: "segredo" });
  assert.deepEqual(routed, {});
  assert.equal(kept.length, 5);
});

test("claudeConfigPath follows the account dir when there is one", () => {
  assert.equal(claudeConfigPath("/accounts/b"), "/accounts/b/.claude.json");
  assert.ok(claudeConfigPath("").endsWith("/.claude.json"));
});

test("readClaudeConfig and hubServers answer empty for what is missing or broken", () => {
  const dir = mkdtempSync(join(tmpdir(), "routing-"));
  try {
    assert.deepEqual(readClaudeConfig(join(dir, "nope.json")), {});
    writeFileSync(join(dir, "broken.json"), "{");
    assert.deepEqual(readClaudeConfig(join(dir, "broken.json")), {});
    assert.deepEqual(hubServers(dir), []);
    mkdirSync(join(dir, ".mcp-servers"));
    writeFileSync(join(dir, ".mcp-servers", "servers.json"), JSON.stringify({ servers: { "arvore-mysql": {}, hubspot: {} } }));
    assert.deepEqual(hubServers(dir), ["arvore-mysql", "hubspot"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("peerServerFor rides the gateway when it is up and serves the peer, with the seat in the headers", () => {
  const served = peerServerFor({ seat: "asker", side: "local", home: "/state", entry: "/hive/peer/peer-mcp-live.mjs", execPath: "/bin/node", env: { PATH: "/bin" }, gateway: { ok: true, peer: true, token: "t0k", port: 4671 } });
  assert.deepEqual(served, {
    type: "http",
    url: "http://127.0.0.1:4671/mcp/hive",
    headers: { Authorization: "Bearer t0k", "X-Hive-Seat": "asker", "X-Hive-Side": "local", "X-Hive-State-Dir": "/state" },
  });
});

test("peerServerFor falls back to the stdio child when there is no gateway, or one without the route", () => {
  const stdio = { type: "stdio", command: "/bin/node", args: ["/hive/peer/peer-mcp-live.mjs"], env: { PATH: "/bin", HIVE_SEAT: "asker", HIVE_SIDE: "cloud", HIVE_STATE_DIR: "/state" } };
  const args = { seat: "asker", side: "cloud", home: "/state", entry: "/hive/peer/peer-mcp-live.mjs", execPath: "/bin/node", env: { PATH: "/bin" } };
  assert.deepEqual(peerServerFor({ ...args, gateway: null }), stdio);
  assert.deepEqual(peerServerFor({ ...args, gateway: { ok: false } }), stdio);
  assert.deepEqual(peerServerFor({ ...args, gateway: { ok: true, peer: false, token: "t0k", port: 4671 } }), stdio);
  assert.deepEqual(peerServerFor({ ...args, gateway: { ok: true, peer: true, token: "", port: 4671 } }), stdio);
});
