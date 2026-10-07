import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const core = readFileSync(join(HERE, "src", "app", "core.js"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

test("every /assets module the app imports is served by STATIC", () => {
  const imported = [...core.matchAll(/from\s+["'](\/assets\/[^"']+\.mjs)["']/g)].map((hit) => hit[1]);
  assert.ok(imported.length, "no /assets import found in src/app/core.js — this test lost its subject");
  const missing = imported.filter((path) => !server.includes(`"${path}":`));
  assert.deepEqual(missing, [], `the app imports these but server.mjs STATIC does not serve them: ${missing.join(", ")}`);
});

test("every /assets module any app module imports is served by STATIC — a miss breaks the whole bundle at boot", () => {
  const dir = join(HERE, "src", "app");
  const files = readdirSync(dir).filter((name) => name.endsWith(".js"));
  const imported = new Set();
  for (const name of files) {
    for (const hit of readFileSync(join(dir, name), "utf8").matchAll(/from\s+["'](\/assets\/[^"']+\.mjs)["']/g)) imported.add(hit[1]);
  }
  assert.ok(imported.size > 1, "expected more than one /assets import across src/app");
  const missing = [...imported].filter((path) => !server.includes(`"${path}":`));
  assert.deepEqual(missing, [], `the app imports these but server.mjs STATIC does not serve them: ${missing.join(", ")}`);
});

const rootsOfSrc = () => {
  const roots = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx|mjs)$/.test(entry.name)) continue;
      for (const hit of readFileSync(full, "utf8").matchAll(/["'](\/assets\/[^"']+\.mjs)["']/g)) roots.add(hit[1]);
    }
  };
  walk(join(HERE, "src"));
  return roots;
};

const specifiersOf = (text) =>
  [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+\.mjs)["']/g)].map((hit) => hit[1]);

test("every module those /assets modules import is served too — an unserved one answers html and kills the bundle", () => {
  const seen = new Set();
  const queue = [...rootsOfSrc()];
  const missing = [];
  assert.ok(queue.length, "no /assets import found under src — this test lost its subject");
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    if (!server.includes(`"${path}":`)) { missing.push(path); continue; }
    const text = readFileSync(join(HERE, path.slice(1)), "utf8");
    for (const spec of specifiersOf(text)) {
      const next = spec.startsWith("/") ? spec : spec.startsWith(".") ? join(dirname(path), spec) : "";
      if (next.startsWith("/assets/")) queue.push(next);
    }
  }
  assert.deepEqual(missing, [], `served modules import these, and server.mjs STATIC does not serve them: ${missing.join(", ")}`);
});

test("every font app.html declares with @font-face is served by STATIC — an unserved one answers html and the face falls through to the next family", () => {
  const page = readFileSync(join(HERE, "app.html"), "utf8");
  const declared = [...page.matchAll(/url\(["'](\/assets\/fonts\/[^"')]+)["']\)/g)].map((hit) => hit[1]);
  assert.ok(declared.length, "no @font-face url found in app.html — this test lost its subject");
  const missing = [...new Set(declared)].filter((path) => !server.includes(`"${path}":`));
  assert.deepEqual(missing, [], `app.html declares these faces and server.mjs STATIC does not serve them: ${missing.join(", ")}`);
});
