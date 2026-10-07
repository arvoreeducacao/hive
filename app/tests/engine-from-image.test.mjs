import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const REPO = join(APP, "..");
const SERVER_DIR = join(REPO, "server");
const app = readFileSync(join(APP, "server.mjs"), "utf8");
const dockerfile = readFileSync(join(REPO, "infra", "docker", "workspace.Dockerfile"), "utf8");
const boot = readFileSync(join(REPO, "infra", "docker", "workspace-boot.sh"), "utf8");

const ENTRYPOINTS = ["engine/driver.mjs", "engine/turn-driver.mjs", "engine/codex-driver.mjs", "engine/kimi-driver.mjs", "engine/kiro-driver.mjs", "engine/cursor-driver.mjs", "engine/opencode-driver.mjs", "engine/kiro-namer.mjs", "bridge.mjs", "peer/peer-cli.mjs", "peer/peer-mcp.mjs"];
const RELATIVE_IMPORT = /(?:^|[^\w$.])(?:from|import|require)\s*\(?\s*["'](\.[^"']*)["']/g;
const SPAWN_BY_PATH = /join\(\s*(?:driverDir|HERE|__dirname)\s*,\s*"([\w-]+\.mjs)"/g;

function resolveImport(from, spec) {
  const base = resolve(dirname(from), spec);
  return [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`].find((one) => existsSync(one) && statSync(one).isFile()) || "";
}

function reachedFrom(entrypoints) {
  const seen = new Set();
  const queue = entrypoints.map((name) => join(SERVER_DIR, name));
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const hit of source.matchAll(RELATIVE_IMPORT)) {
      const target = resolveImport(file, hit[1]);
      if (target) queue.push(target);
    }
    for (const hit of source.matchAll(SPAWN_BY_PATH)) {
      const target = join(SERVER_DIR, hit[1]);
      if (existsSync(target)) queue.push(target);
    }
  }
  return [...seen];
}

test("the image carries the whole server folder, and nothing else it has to run", () => {
  assert.match(dockerfile, /^COPY server \.\/server$/m, "the image stopped copying the server folder whole — cherry-picking it is how files got left behind");
  assert.doesNotMatch(dockerfile, /^COPY cli\//m, "the image is carrying a command line again");
  assert.match(dockerfile, /^ENV HIVE_SERVER_DIR=\/app\/server$/m, "the image stopped naming where the engine is");
});

test("every boot sweeps the command line older versions left on the volume", () => {
  assert.match(boot, /rm -f \/workspace\/npm-global\/bin\/hive/, "an old cli on the volume outlives the image that stopped shipping one");
  assert.match(boot, /rm -rf \/workspace\/hive\/cli/, "the helpers the old cli ran are still on the volume");
  assert.doesNotMatch(boot, /install -m \d+ \/app\/cli/, "the boot installs a command line again");
});

test("the boot starts the MCP gateway the image carries, and says so when it cannot", () => {
  assert.match(boot, /MCP_GATEWAY="\$\{HIVE_SERVER_DIR:-\/app\/server\}\/gateway\/gateway\.mjs"/, "the boot looks for the gateway somewhere other than the image's server folder");
  assert.doesNotMatch(boot, /\/workspace\/hive\/server\/gateway/, "the boot still reads a gateway left on the volume by an older layout");
  assert.match(boot, /boot_error mcp-gateway "no gateway at \$MCP_GATEWAY"/, "a missing gateway is skipped without a line in boot.log");
});

test("the desktop no longer pushes code into anybody's box", () => {
  for (const gone of ["POD_SERVER_FILES", "pushPodCli", "serverFingerprint"]) {
    assert.ok(!app.includes(gone), `${gone} is back in the app — the code a box runs has one delivery path, and it is the image`);
  }
  assert.ok(!/tar xf - -C \/workspace\/hive\/server/.test(app), "the app is tarring the server into a running box again");
  assert.ok(!/cat > \/workspace\/npm-global\/bin\/hive/.test(app), "the app is writing the cli into a running box again");
});

test("everything a box runs really lives under server/, so the image copy carries it", () => {
  const outside = reachedFrom(ENTRYPOINTS)
    .map((file) => relative(SERVER_DIR, file))
    .filter((one) => one.startsWith(".."));
  assert.deepEqual(outside, [], `the box reaches files outside server/, which the image never copies: ${outside.join(", ")}`);
});

test("no shell or script still points at the driver folder that is gone", () => {
  const guilty = [];
  for (const one of ["infra/scripts/setup.sh", "app/server.mjs"]) {
    for (const line of readFileSync(join(REPO, one), "utf8").split("\n")) {
      if (/(dev-workspaces|DIR|HIVE_DIR|hive)\/driver\//.test(line)) guilty.push(`${one}: ${line.trim()}`);
    }
  }
  assert.deepEqual(guilty, [], `the driver folder was deleted, and these still name it:\n${guilty.join("\n")}`);
});

test("setup copies nothing out of this repo any more", () => {
  const setup = readFileSync(join(REPO, "infra", "scripts", "setup.sh"), "utf8");
  const named = [...setup.matchAll(/install -m \d+ "\$DIR\/([^"]+)"/g)].map((hit) => hit[1]);
  assert.deepEqual(named, [], `setup.sh installs again — the app carries what it runs: ${named.join(", ")}`);
});

test("the app never names a path inside the image", () => {
  const named = [...app.matchAll(/"(\/app\/[^"]*)"/g)].map((hit) => hit[1]);
  assert.deepEqual(named, [], `the app hardcodes where the image keeps things (${named.join(", ")}) — a box laid out differently is then wrong, and only the image and the boot script may know that layout`);
});
