import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(REPO, path), "utf8");

const WHY = "behind this port is a coding agent with a shell and no approval prompts";

test("a server nobody configured listens to its own machine only", () => {
  assert.match(read("server/server.mjs"), /env\.HIVE_BROKER_BIND \|\| "127\.0\.0\.1"/,
    `the default bind left loopback, and ${WHY}`);
});

test("compose publishes on loopback, and opening it is a variable somebody sets", () => {
  const compose = read("infra/docker/compose.yaml");
  assert.match(compose, /- "\$\{HIVE_BIND:-127\.0\.0\.1\}:\$\{HIVE_PORT:-8791\}:8791"/,
    `compose stopped publishing on loopback, and ${WHY}`);
});

test("the container opens its own bind, because there the box is the boundary", () => {
  assert.match(read("infra/docker/workspace-boot.sh"), /HIVE_BROKER_BIND="\$\{HIVE_BROKER_BIND:-0\.0\.0\.0\}"/,
    "a server bound to loopback inside a container cannot be published at all");
});

test("the quickstart says what it runs before it tells anyone to run it", () => {
  for (const [path, fence] of [["README.md", "cd infra/docker"], ["docs/run-your-own.md", "cd infra/docker"]]) {
    const doc = read(path);
    const before = doc.slice(0, doc.indexOf(fence));
    assert.match(before, /no approval prompts/,
      `${path} tells a stranger to start a container before saying what is inside it`);
    assert.match(before, /not a sandbox|without being a sandbox/,
      `${path} does not say the container is not a sandbox, and SECURITY.md is read by nobody in a hurry`);
  }
});
