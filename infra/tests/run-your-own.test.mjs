import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(REPO, path), "utf8");

const doc = read("docs/run-your-own.md");
const WHERE_THEY_LIVE = [
  "infra/docker/compose.yaml",
  "infra/docker/workspace-boot.sh",
  "infra/docker/workspace.Dockerfile",
  "server/engine/paths.mjs",
  "server/sessions.mjs",
  "server/server.mjs"
];

const settingsTable = () => {
  const start = doc.indexOf("## The settings that matter");
  const rows = doc.slice(start, doc.indexOf("\n## ", start + 1)).split("\n").filter((line) => line.startsWith("| `"));
  return rows.map((line) => line.split("|")[1].trim().replace(/`/g, ""));
};

test("every setting the guide promises is one the code actually reads", () => {
  const source = WHERE_THEY_LIVE.map(read).join("\n");
  const invented = settingsTable().filter((name) => !source.includes(name));
  assert.deepEqual(invented, [], `the guide documents settings nothing reads:\n${invented.join("\n")}`);
});

test("the table did not quietly empty itself", () => {
  assert.ok(settingsTable().length >= 6, "the settings table lost its rows, so the test above proves nothing");
});

test("the commands the guide gives name the service that exists", () => {
  const compose = read("infra/docker/compose.yaml");
  const services = new Set(
    (compose.slice(compose.indexOf("services:"), compose.indexOf("\nvolumes:")).match(/^ {2}([a-z][\w-]*):$/gm) || [])
      .map((line) => line.trim().replace(":", ""))
  );
  for (const hit of doc.matchAll(/docker compose exec (?:-it |-T )?(\S+)/g)) {
    assert.ok(services.has(hit[1]), `the guide says "docker compose exec ${hit[1]}", and no such service exists`);
  }
});

test("the guide does not send anyone to a path that moved", () => {
  for (const hit of doc.matchAll(/^cd (\S+)$/gm)) {
    assert.doesNotMatch(hit[1], /^arvore\//, "the guide points at the folder that does not come along");
  }
  assert.doesNotMatch(doc, /kubectl|arvore-prd|dkr\.ecr/, "the guide leaks how we happen to host it");
});
