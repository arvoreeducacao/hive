import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan, stackOf } from "../scan.mjs";
import { load } from "../resolve.mjs";

let root;

const repo = (name, files = {}) => {
  const dir = join(root, name);
  mkdirSync(join(dir, ".git"), { recursive: true });
  for (const [file, body] of Object.entries(files)) writeFileSync(join(dir, file), body);
  return dir;
};

const pkg = (deps) => JSON.stringify({ dependencies: deps });

before(() => {
  root = mkdtempSync(join(tmpdir(), "manifest-"));
  repo("api", { "package.json": pkg({ "@nestjs/core": "10" }) });
  repo("web", { "package.json": pkg({ next: "16", react: "19" }) });
  repo("mobile", { "package.json": pkg({ "react-native": "0.76" }) });
  repo("ui", { "package.json": pkg({ react: "19" }) });
  repo("tool", { "package.json": pkg({}) });
  repo("legacy", { "mix.exs": "" });
  repo("etl", { "requirements.txt": "" });
  repo("mystery");
  repo("broken", { "package.json": "{ not json" });
  mkdirSync(join(root, "not-a-repo"), { recursive: true });
});

after(() => rmSync(root, { recursive: true, force: true }));

test("scan acha só diretório que é repositório git", () => {
  const found = scan(root).map((r) => r.name);
  assert.ok(found.includes("api"));
  assert.ok(!found.includes("not-a-repo"));
});

test("scan devolve em ordem de nome", () => {
  const found = scan(root).map((r) => r.name);
  assert.deepEqual(found, [...found].sort((a, b) => a.localeCompare(b)));
});

test("stackOf lê a stack do próprio repositório", () => {
  for (const [name, stack] of [
    ["api", "nestjs"],
    ["web", "nextjs"],
    ["mobile", "react-native"],
    ["ui", "react"],
    ["tool", "node"],
    ["legacy", "elixir"],
    ["etl", "python"],
    ["mystery", "unknown"],
  ]) {
    assert.equal(stackOf(join(root, name)), stack, name);
  }
});

test("package.json quebrado não derruba a varredura", () => {
  assert.equal(stackOf(join(root, "broken")), "node");
});

test("load reclama com o caminho quando o manifesto não existe", () => {
  assert.throws(() => load(root), /no hive\.json/);
});

test("load reclama quando repos não é lista", () => {
  writeFileSync(join(root, "hive.json"), JSON.stringify({ repos: "nope" }));
  assert.throws(() => load(root), /"repos" must be an array/);
});

test("load lê um manifesto válido", () => {
  writeFileSync(join(root, "hive.json"), JSON.stringify({ repos: ["acme/api"] }));
  assert.deepEqual(load(root).repos, ["acme/api"]);
});
