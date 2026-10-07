import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function walk(dir, held = []) {
  for (const one of readdirSync(dir)) {
    if (one === "node_modules" || one === ".git" || one.startsWith(".")) continue;
    const full = join(dir, one);
    if (statSync(full).isDirectory()) walk(full, held);
    else if (/\.mjs$/.test(one)) held.push(full);
  }
  return held;
}

const RELATIVE = /(?:^|[\s;])(?:import|export)[^'"]*?from\s+"(\.[^"]+)"|import\(\s*"(\.[^"]+)"\s*\)/g;

const broken = (dirs) => {
  const missing = [];
  for (const dir of dirs) {
    for (const file of walk(join(REPO, dir))) {
      const text = readFileSync(file, "utf8");
      for (const hit of text.matchAll(RELATIVE)) {
        const asked = hit[1] || hit[2];
        if (!asked || !/\.mjs$/.test(asked)) continue;
        const target = resolve(dirname(file), asked);
        if (!existsSync(target)) missing.push(`${relative(REPO, file)} asks for ${asked}`);
      }
    }
  }
  return missing;
};

test("every relative import in the server resolves to a file that is here", () => {
  const missing = broken(["server"]);
  assert.deepEqual(missing, [], `these imports point at nothing:\n${missing.join("\n")}`);
});

test("every relative import in the app resolves too, including the ones that reach into server/", () => {
  const missing = broken(["app"]);
  assert.deepEqual(missing, [], `these imports point at nothing:\n${missing.join("\n")}`);
});

test("both drivers load their whole tree, not just parse", () => {
  for (const one of ["engine/driver.mjs", "engine/turn-driver.mjs", "engine/opencode-driver.mjs"]) {
    const ran = spawnSync(process.execPath, [join(REPO, "server", one)], { encoding: "utf8", timeout: 30000 });
    const said = `${ran.stdout || ""}${ran.stderr || ""}`;
    assert.doesNotMatch(said, /ERR_MODULE_NOT_FOUND|Cannot find module/, `${one} imports something that is not there: ${said.split("\n").find((l) => /Cannot find/.test(l)) || said.slice(0, 200)}`);
    assert.match(said, /usage:/, `${one} did not get far enough to complain about its arguments: ${said.slice(0, 200)}`);
  }
});
