import { test } from "node:test";
import assert from "node:assert/strict";
import { applies, pathFor, repoName, resolve, reconcile } from "../resolve.mjs";

const manifest = {
  repos: ["acme/api", "acme/web", "acme/design-system"],
  skills: {
    delivery: "*",
    "backend-nestjs": "api",
    "design-system": ["web", "design-system"],
    "writing-tokens": [{ repo: "web", path: "src/app/writing/**" }],
  },
  mcps: { context7: "*", postgres: "api" },
  env: { web: ".env.local" },
  integrations: { branch: "{task}-{slug}", slack: "C123" },
};

const names = (list) => list.map((i) => i.name);

test("* vale para qualquer repositório", () => {
  assert.equal(applies("*", "anything"), true);
});

test("um nome solto casa só com ele", () => {
  assert.equal(applies("api", "api"), true);
  assert.equal(applies("api", "web"), false);
});

test("lista casa com qualquer item", () => {
  assert.equal(applies(["web", "design-system"], "design-system"), true);
  assert.equal(applies(["web", "design-system"], "api"), false);
});

test("alvo restrito por pasta casa pelo repositório", () => {
  const scope = [{ repo: "web", path: "src/**" }];
  assert.equal(applies(scope, "web"), true);
  assert.equal(applies(scope, "api"), false);
});

test("pathFor devolve o glob quando o alvo restringe", () => {
  assert.equal(pathFor([{ repo: "web", path: "src/app/writing/**" }], "web"), "src/app/writing/**");
});

test("pathFor devolve undefined para alvo de repositório inteiro", () => {
  assert.equal(pathFor("web", "web"), undefined);
  assert.equal(pathFor("*", "web"), undefined);
});

test("pathFor devolve undefined para repositório fora do escopo", () => {
  assert.equal(pathFor([{ repo: "web", path: "src/**" }], "api"), undefined);
});

test("repoName tira a organização", () => {
  assert.equal(repoName("acme/api"), "api");
  assert.equal(repoName("api"), "api");
});

test("resolve junta o que o repositório carrega", () => {
  const r = resolve(manifest, "api");
  assert.deepEqual(names(r.skills), ["delivery", "backend-nestjs"]);
  assert.deepEqual(names(r.mcps), ["context7", "postgres"]);
  assert.equal(r.declared, true);
});

test("resolve preserva a restrição de pasta", () => {
  const r = resolve(manifest, "web");
  assert.deepEqual(
    r.skills.find((s) => s.name === "writing-tokens"),
    { name: "writing-tokens", path: "src/app/writing/**" },
  );
  assert.deepEqual(
    r.skills.find((s) => s.name === "design-system"),
    { name: "design-system" },
  );
});

test("env cai em .env quando ninguém declara", () => {
  assert.equal(resolve(manifest, "api").envFile, ".env");
  assert.equal(resolve(manifest, "web").envFile, ".env.local");
});

test("repositório fora do manifesto ainda resolve, e avisa", () => {
  const r = resolve(manifest, "stranger");
  assert.equal(r.declared, false);
  assert.deepEqual(names(r.skills), ["delivery"]);
});

test("integrations cai em objeto vazio", () => {
  assert.deepEqual(resolve({ repos: [] }, "api").integrations, {});
});

test("reconcile separa nas três direções", () => {
  const r = reconcile(manifest, ["api", "web", "extra"]);
  assert.deepEqual(r.matched, ["api", "web"]);
  assert.deepEqual(r.missing, ["design-system"]);
  assert.deepEqual(r.undeclared, ["extra"]);
});

test("disco vazio deixa tudo faltando e nada sobrando", () => {
  const r = reconcile(manifest, []);
  assert.equal(r.missing.length, 3);
  assert.deepEqual(r.undeclared, []);
});
