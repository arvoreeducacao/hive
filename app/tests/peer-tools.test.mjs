import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PEER_MODULE_PROBE, peerToolsCommand } from "../lib/peer-tools.mjs";

const NODE = "/Applications/My Hive.app/Contents/MacOS/node";
const PEER = "/Applications/My Hive.app/Contents/Resources/server/peer/peer-mcp.mjs";

function machine(listed = "") {
  const root = mkdtempSync(join(tmpdir(), "hive-peer-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  const state = join(root, "listed");
  const calls = join(root, "calls");
  writeFileSync(state, listed);
  writeFileSync(calls, "");
  const fake = [
    "#!/bin/sh",
    `printf '%s\\n' "$*" >> ${JSON.stringify(calls)}`,
    'if [ "$1" = "mcp" ] && [ "$2" = "list" ]; then cat ' + JSON.stringify(state) + "; exit 0; fi",
    'if [ "$1" = "mcp" ] && [ "$2" = "remove" ]; then : > ' + JSON.stringify(state) + "; exit 0; fi",
    'if [ "$1" = "mcp" ] && [ "$2" = "add" ]; then',
    '  shift 6',
    `  printf 'hive: %s - connected\\n' "$*" > ${JSON.stringify(state)}`,
    "  exit 0",
    "fi",
    "exit 1"
  ].join("\n");
  writeFileSync(join(bin, "claude"), `${fake}\n`);
  chmodSync(join(bin, "claude"), 0o755);
  const run = () => execFileSync("bash", ["-c", peerToolsCommand({ node: NODE, peer: PEER })], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: "utf8"
  });
  return { run, listed: () => readFileSync(state, "utf8"), calls: () => readFileSync(calls, "utf8").split("\n").filter(Boolean) };
}

test("a machine with no hive entry gets one that runs the module the app carries", () => {
  const it = machine("");
  it.run();
  assert.match(it.listed(), /peer-mcp\.mjs/);
  assert.ok(it.listed().includes(`${NODE} ${PEER}`), `the entry does not name the app's own node: ${it.listed()}`);
  it.run();
  assert.equal(it.calls().filter((c) => c.startsWith("mcp add")).length, 1, "every boot writes the entry again");
});

test("the entry that went through the command line is replaced, path with spaces and all", () => {
  const it = machine("hive: hive mcp - connected\n");
  it.run();
  assert.doesNotMatch(it.listed(), /hive: hive mcp/, "a seat still reaches its tools through the command line");
  assert.ok(it.listed().includes(`${NODE} ${PEER}`));
});

test("a machine already pointed at the module is left alone", () => {
  const it = machine(`hive: ${NODE} ${PEER} - connected\n`);
  it.run();
  assert.deepEqual(it.calls(), ["mcp list"], "boot rewrites an entry that was already right");
});

function probe({ made = [], serverDir = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "hive-peer-where-"));
  for (const dir of made) {
    mkdirSync(join(root, dir, "peer"), { recursive: true });
    writeFileSync(join(root, dir, "peer", "peer-mcp.mjs"), "");
  }
  const script = PEER_MODULE_PROBE.replaceAll("/workspace/hive/server", `${root}/workspace/hive/server`);
  const env = { ...process.env, HIVE_SERVER_DIR: serverDir ? join(root, serverDir) : "" };
  return execFileSync("bash", ["-c", script], { encoding: "utf8", env }).replace(root, "");
}

test("the peer module is looked for where the image says the server is, and on the volume only as a fallback", () => {
  assert.equal(probe({ made: ["app/server", "workspace/hive/server"], serverDir: "app/server" }), "/app/server/peer/peer-mcp.mjs");
  assert.equal(probe({ made: ["workspace/hive/server"], serverDir: "app/server" }), "/workspace/hive/server/peer/peer-mcp.mjs");
  assert.equal(probe({ made: ["workspace/hive/server"] }), "/workspace/hive/server/peer/peer-mcp.mjs", "a box that names no server dir still has its volume read");
  assert.equal(probe({}), "", "a box with neither must be left alone, not pointed at a file that is not there");
});
