import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEPLOYMENT_KEYS, deploymentDefaults, withDeploymentDefaults } from "../lib/env.mjs";
import { shipDeployments } from "../build.mjs";

const ENV = fileURLToPath(new URL("../lib/env.mjs", import.meta.url));

function place(root, folder, text) {
  mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(root, folder, "hive.defaults"), text);
}

function scene() {
  const root = mkdtempSync(join(tmpdir(), "hive-defaults-"));
  const checkout = join(root, "checkout");
  const shipped = join(root, "shipped");
  place(checkout, "acme", "# where acme hosts it\nHIVE_NAMESPACE=acme-ns\nHIVE_LEAF_URL=https://leaf.acme.example\n");
  place(shipped, "acme", "HIVE_NAMESPACE=acme-ns\nHIVE_MEMORY_URL=https://memory.acme.example\n");
  return { root, checkout, shipped };
}

test("a config written before a new default learns it from the deployment, and what the config says still wins", () => {
  const { checkout, shipped } = scene();
  const config = { HIVE_DEV: "ana", HIVE_REPO: checkout, HIVE_DEPLOYMENT_DIR: "acme", HIVE_NAMESPACE: "ana-own-ns" };
  const filled = withDeploymentDefaults(config, { shipped });
  assert.equal(filled.HIVE_MEMORY_URL, "https://memory.acme.example");
  assert.equal(filled.HIVE_LEAF_URL, undefined, "with a copy shipped with the app, the checkout is not read at all");
  assert.equal(filled.HIVE_NAMESPACE, "ana-own-ns");
  assert.equal(filled.HIVE_DEV, "ana");
});

test("without a shipped copy the checkout fills the gaps", () => {
  const { checkout, root } = scene();
  const filled = withDeploymentDefaults({ HIVE_REPO: checkout, HIVE_DEPLOYMENT_DIR: "acme" }, { shipped: join(root, "none") });
  assert.equal(filled.HIVE_LEAF_URL, "https://leaf.acme.example");
});

test("a deployment file only fills the deployment's addresses and names, never who this machine is or where it points", () => {
  const { checkout, shipped } = scene();
  place(shipped, "acme", [
    "HIVE_MEMORY_URL=https://memory.acme.example",
    "HIVE_POD=someone-0", "HIVE_HUB=/tmp/elsewhere", "HIVE_DEV=mallory", "HIVE_HUB_FOLDER=x", "HIVE_REPO=/tmp/x", "HIVE_REPO_FOLDER=x",
    "HIVE_EXTENSIONS_REPO=someone/else", "HIVE_SERVER_URL=https://evil.example", "HIVE_SERVER_KEY=k"
  ].join("\n"));
  const filled = deploymentDefaults({ HIVE_REPO: checkout, HIVE_DEPLOYMENT_DIR: "acme" }, { shipped });
  assert.deepEqual(Object.keys(filled), ["HIVE_MEMORY_URL"]);
  assert.ok(DEPLOYMENT_KEYS.every((key) => !/^HIVE_(POD|HUB|DEV|HUB_FOLDER|REPO|REPO_FOLDER|SERVER_URL|SERVER_KEY|EXTENSIONS_REPO)$/.test(key)));
});

test("the copy shipped with the app wins over a checkout that was never pulled", () => {
  const { checkout, shipped } = scene();
  place(checkout, "acme", "HIVE_MEMORY_URL=https://old.acme.example\n");
  assert.equal(deploymentDefaults({ HIVE_REPO: checkout, HIVE_DEPLOYMENT_DIR: "acme" }, { shipped }).HIVE_MEMORY_URL, "https://memory.acme.example");
});

test("with no deployment named, or one that climbs out of its folder, nothing is filled in", () => {
  const { checkout, shipped } = scene();
  assert.deepEqual(deploymentDefaults({ HIVE_REPO: checkout }, { shipped }), {});
  for (const folder of ["..", "../acme", "acme/../acme", "/etc", ".hidden"]) {
    assert.deepEqual(deploymentDefaults({ HIVE_REPO: checkout, HIVE_DEPLOYMENT_DIR: folder }, { shipped }), {}, folder);
  }
  assert.deepEqual(deploymentDefaults({ HIVE_REPO: join(checkout, "nowhere"), HIVE_DEPLOYMENT_DIR: "nobody" }, { shipped }), {});
});

test("the build ships every deployment's defaults next to the bundle, and only those", () => {
  const { root } = scene();
  const repo = join(root, "repo");
  place(repo, "acme", "HIVE_MEMORY_URL=https://memory.acme.example\n");
  mkdirSync(join(repo, "app"), { recursive: true });
  const outdir = join(root, "dist");
  assert.deepEqual(shipDeployments({ repo, outdir }), ["acme"]);
  assert.match(readFileSync(join(outdir, "deployments", "acme", "hive.defaults"), "utf8"), /memory\.acme\.example/);
});

test("the Hive boots with the memory address of a config that never had it", () => {
  const { root, checkout } = scene();
  const home = join(root, "home");
  mkdirSync(home);
  writeFileSync(join(home, "config"), `HIVE_DEV=ana\nHIVE_REPO=${checkout}\nHIVE_DEPLOYMENT_DIR=acme\n`);
  place(checkout, "acme", "HIVE_MEMORY_URL=https://memory.acme.example/\n");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("HIVE_") && key !== "KUBERNETES_SERVICE_HOST"));
  const said = execFileSync(process.execPath, ["--input-type=module", "-e", `const e = await import(${JSON.stringify(ENV)}); console.log(e.MEMORY_SERVER_URL);`], { env: { ...env, HIVE_HOME: home }, encoding: "utf8" }).trim();
  assert.equal(said, "https://memory.acme.example");
});

test("a stale bundle rebuilt at boot ships the deployment files too", async () => {
  const { root } = scene();
  const app = join(root, "app");
  mkdirSync(app, { recursive: true });
  writeFileSync(join(app, "build.mjs"), `export async function buildApp() { throw new Error("only the shipping build may run"); }\nexport async function buildAndShip() { (await import("node:fs")).writeFileSync(${JSON.stringify(join(root, "shipped.txt"))}, "yes"); }\n`);
  const { rebuildWhenStale } = await import("../lib/fresh-bundle.mjs");
  assert.equal(await rebuildWhenStale(app, { stale: () => true, log: (line) => assert.fail(line) }), true);
  assert.equal(readFileSync(join(root, "shipped.txt"), "utf8"), "yes");
});
