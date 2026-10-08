import { test } from "node:test";
import assert from "node:assert";
import { refuseDrop, extensionOf, isImageName, FILE_CEILING, DROP_CEILING, DROP_LIMIT } from "../assets/drops.mjs";

const file = (name, size = 1024) => ({ name, size });
const many = (n) => Array.from({ length: n }, (_, i) => file(`shot-${i}.png`));

test("a plain drop of files goes through", () => {
  assert.strictEqual(refuseDrop([file("tela.png"), file("erro.log"), file("dados.csv")]), "");
});

test("the extension is lowercased and only counts when it is short", () => {
  assert.strictEqual(extensionOf("Tela.PNG"), "png");
  assert.strictEqual(extensionOf("relatorio.tar.gz"), "gz");
  assert.strictEqual(extensionOf("no-extension"), "");
  assert.strictEqual(extensionOf("a.verylongextension"), "");
});

test("an image is told apart from any other file", () => {
  assert.ok(isImageName("/workspace/hive/assets/tela-1.jpeg"));
  assert.ok(!isImageName("/workspace/hive/assets/saida.log"));
});

test("what the machine runs stays out", () => {
  for (const name of ["Hive.app", "setup.exe", "acme.dmg", "tool.jar", "install.pkg"]) {
    assert.match(refuseDrop([file(name)]), /runs/, name);
  }
});

test("a folder arrives with no bytes and is named as one", () => {
  assert.match(refuseDrop([file("Documentos", 0)]), /folder/);
});

test("one file over the ceiling is refused by name and size", () => {
  const said = refuseDrop([file("video.mov", FILE_CEILING + 1)]);
  assert.match(said, /video\.mov/);
  assert.match(said, /24 MB/);
});

test("files that pass one by one can still be too much together", () => {
  const half = Math.round(DROP_CEILING * 0.6);
  assert.strictEqual(refuseDrop([file("a.png", half)]), "");
  assert.match(refuseDrop([file("a.png", half), file("b.png", half)]), /in one drop/);
});

test("a drop carries only so many files", () => {
  assert.strictEqual(refuseDrop(many(DROP_LIMIT)), "");
  assert.match(refuseDrop(many(DROP_LIMIT + 1)), /at once/);
});

test("nothing readable is said out loud instead of passing silently", () => {
  assert.match(refuseDrop([]), /nothing readable/);
  assert.match(refuseDrop(undefined), /nothing readable/);
  assert.match(refuseDrop([file("", 10)]), /no name/);
});
