import { test } from "node:test";
import assert from "node:assert/strict";
import { schema, schemaWith } from "../schema.mjs";

test("repos é obrigatório e chave desconhecida no topo é recusada", () => {
  assert.deepEqual(schema.required, ["repos"]);
  assert.equal(schema.additionalProperties, false);
});

test("schemaWith restringe as chaves às skills instaladas", () => {
  const built = schemaWith({ skills: ["delivery", "qa"] });
  assert.deepEqual(built.properties.skills.propertyNames, { enum: ["delivery", "qa"] });
});

test("schemaWith deixa o mapa aberto quando não há nada instalado", () => {
  const built = schemaWith({ skills: [] });
  assert.equal(built.properties.skills.propertyNames, undefined);
});

test("schemaWith não muta o schema exportado", () => {
  schemaWith({ skills: ["delivery"], mcps: ["context7"] });
  assert.equal(schema.properties.skills.propertyNames, undefined);
});
