import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(HERE, "src", "app");
const html = readFileSync(join(HERE, "app.html"), "utf8");
const modules = readdirSync(SRC).filter((name) => name.endsWith(".js")).sort();

function checks(source, label) {
  const file = join(tmpdir(), `hive-syntax-${label}-${process.pid}.mjs`);
  writeFileSync(file, source);
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (e) {
    throw new Error(`${label} does not parse: ${String(e.stderr || e.message).split("\n").slice(0, 4).join(" ")}`);
  } finally {
    rmSync(file, { force: true });
  }
}

test("the app source parses", () => {
  assert.ok(modules.length, "src/app has no module");
  for (const name of modules) checks(readFileSync(join(SRC, name), "utf8"), name.replace(/\.js$/, ""));
});

test("boot.js parses", () => {
  checks(readFileSync(join(HERE, "main", "boot.js"), "utf8"), "boot");
});

test("the app source only wires top-level listeners to elements the page has", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const gone = [];
  for (const name of modules) {
    readFileSync(join(SRC, name), "utf8").split("\n").forEach((line, i) => {
      const m = line.match(/^\$\("([^"]+)"\)/);
      if (m && !ids.has(m[1])) gone.push(`${name} ${m[1]}: line ${i + 1}`);
    });
  }
  assert.deepEqual(gone, [], `a top-level $("id") on an element the html no longer has throws at load and kills the rest of the module — ${gone.join(" · ")}`);
});

test("each module declares each top-level name once", () => {
  const declaration = /^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/;
  const clashes = [];
  for (const name of modules) {
    const seen = new Map();
    readFileSync(join(SRC, name), "utf8").split("\n").forEach((line, i) => {
      const m = line.match(declaration);
      if (!m) return;
      if (seen.has(m[1])) clashes.push(`${name} ${m[1]}: lines ${seen.get(m[1])} and ${i + 1}`);
      else seen.set(m[1], i + 1);
    });
  }
  assert.deepEqual(clashes, [], `a second top-level declaration silently kills the whole module — ${clashes.join(" · ")}`);
});
