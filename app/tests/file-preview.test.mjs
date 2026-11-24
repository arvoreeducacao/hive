import { test } from "node:test";
import assert from "node:assert/strict";
import { decodePreviewText, delimiterOf, filePreviewKind, highlightLanguageOf, parseDelimited, previewTable, rendersByDefault, withoutFrontMatter } from "../src/app/file-preview.js";

test("the kind comes from the type, and from the name when the type says nothing", () => {
  assert.equal(filePreviewKind("notas.md", "text/plain"), "markdown");
  assert.equal(filePreviewKind("README", ""), "text");
  assert.equal(filePreviewKind("pagina.html", "text/html"), "html");
  assert.equal(filePreviewKind("dados.csv", "text/csv"), "table");
  assert.equal(filePreviewKind("dados.tsv", "application/octet-stream"), "table");
  assert.equal(filePreviewKind("app.ts", "video/mp2t"), "video");
  assert.equal(filePreviewKind("app.ts", ""), "text");
  assert.equal(filePreviewKind("voz.m4a", ""), "audio");
  assert.equal(filePreviewKind("pacote.zip", "application/zip"), "archive");
  assert.equal(filePreviewKind("relatorio.pdf", ""), "pdf");
  assert.equal(filePreviewKind("config.json", "application/json"), "text");
  assert.equal(filePreviewKind("planilha.xlsx", ""), "unsupported");
});

test("markdown, html and tables open rendered; code opens as source", () => {
  assert.ok(rendersByDefault("markdown") && rendersByDefault("html") && rendersByDefault("table"));
  assert.ok(!rendersByDefault("text"));
  assert.equal(highlightLanguageOf("src/app.tsx"), "typescript");
  assert.equal(highlightLanguageOf("Dockerfile"), "dockerfile");
});

test("binary bytes and broken utf-8 are told apart from text", () => {
  assert.deepEqual(decodePreviewText(new Uint8Array([104, 105])), { text: "hi" });
  assert.equal(decodePreviewText(new Uint8Array([104, 0, 105])).error, "binary");
  assert.equal(decodePreviewText(new Uint8Array([0xff, 0xfe, 0x41])).error, "not-utf8");
  assert.deepEqual(decodePreviewText(new Uint8Array([104, 0xc3]), { cut: true }), { text: "h" });
});

test("a semicolon csv is read as one, a comma csv stays comma", () => {
  assert.equal(delimiterOf("a.csv", "text/csv", "a;b;c\n1;2;3"), ";");
  assert.equal(delimiterOf("a.csv", "text/csv", "a,b;c\n1,2;3"), ",");
  assert.equal(delimiterOf("a.tsv", "", "a\tb"), "\t");
});

test("quoted cells keep their commas and line breaks", () => {
  assert.deepEqual(parseDelimited('nome,nota\n"Silva, Ana","linha\num"\n', ","), [["nome", "nota"], ["Silva, Ana", "linha\num"]]);
  const table = previewTable("a,b\n1,2\n3,4", "x.csv", "text/csv");
  assert.equal(table.total, 3);
  assert.equal(table.columns, 2);
});

test("front matter is masked before markdown renders", () => {
  assert.equal(withoutFrontMatter("---\ntitle: x\n---\n# Oi"), "# Oi");
  assert.equal(withoutFrontMatter("# Oi\n---\n"), "# Oi\n---\n");
});
