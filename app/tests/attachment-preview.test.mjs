import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, views } from "./dom.mjs";
import { zipOf } from "./zip-fixture.mjs";

await views();
const { closeAttachmentPreview, openAttachmentPreview, previewOpen } = await app("attachment-preview");

const settle = () => new Promise((go) => setTimeout(go, 30));

const blobOf = (text, type) => new dom.Blob([text], { type });

const scrim = () => document.querySelector(".cp-preview-scrim");

test("markdown opens rendered, flips to its source, and the header says where it came from", async () => {
  openAttachmentPreview({ fileName: "notas.md", size: 20, type: "text/markdown", blob: blobOf("# Título\n\num parágrafo", "text/markdown"), origin: "draft", remove: () => {} });
  await settle();
  assert.equal(scrim().querySelector(".cp-pv-origin").textContent, "Draft");
  assert.equal(scrim().querySelector(".cp-pv-name").textContent, "notas.md");
  assert.equal(scrim().querySelector(".cp-pv-md .md-h1")?.textContent.trim(), "Título");
  scrim().querySelector('[data-act="toggle"]').click();
  await settle();
  assert.match(scrim().querySelector(".cp-pv-code").textContent, /# Título/);
  assert.ok(scrim().querySelector('[data-act="wrap"]'));
  closeAttachmentPreview();
  assert.equal(previewOpen(), false);
});

test("a csv opens as a table with its rows and columns counted", async () => {
  openAttachmentPreview({ fileName: "dados.csv", type: "text/csv", blob: blobOf("nome;nota\nAna;9\nBia;8", "text/csv") });
  await settle();
  const cells = [...scrim().querySelectorAll(".cp-pv-table th")].map((one) => one.textContent);
  assert.deepEqual(cells, ["nome", "nota"]);
  assert.match(scrim().querySelector(".cp-pv-meta").textContent, /^3 rows · 2 columns/);
  closeAttachmentPreview();
});

test("html renders in a sandbox that cannot reach the app", async () => {
  openAttachmentPreview({ fileName: "pagina.html", type: "text/html", blob: blobOf("<h1>oi</h1>", "text/html") });
  await settle();
  const frame = scrim().querySelector("iframe");
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts allow-forms allow-popups allow-downloads");
  closeAttachmentPreview();
});

test("a binary file says it is not text, a file with no viewer says how to open it", async () => {
  openAttachmentPreview({ fileName: "a.txt", type: "text/plain", blob: new dom.Blob([new Uint8Array([97, 0, 98])], { type: "text/plain" }) });
  await settle();
  assert.match(scrim().querySelector(".cp-pv-none b").textContent, /binary data/);
  assert.ok(scrim().querySelector('[data-act="retry"]'));
  openAttachmentPreview({ fileName: "planilha.xlsx", blob: blobOf("x", "") });
  await settle();
  assert.equal(scrim().querySelector(".cp-pv-none b").textContent, "No preview for this file");
  assert.match(scrim().querySelector(".cp-pv-none span").textContent, /XLSX files/);
  closeAttachmentPreview();
});

test("remove from draft drops the file and closes; esc closes too", async () => {
  let removed = 0;
  openAttachmentPreview({ fileName: "a.txt", type: "text/plain", blob: blobOf("oi", "text/plain"), origin: "draft", remove: () => { removed += 1; } });
  await settle();
  scrim().querySelector('[data-act="remove"]').click();
  await settle();
  assert.equal(removed, 1);
  assert.equal(scrim(), null);
  openAttachmentPreview({ fileName: "a.txt", type: "text/plain", blob: blobOf("oi", "text/plain") });
  await settle();
  assert.equal(scrim().querySelector('[data-act="remove"]'), null);
  document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(scrim(), null);
});

test("a zip opens as a folder you can walk into and read a file from", async () => {
  const zip = zipOf([{ path: "docs/", text: "" }, { path: "docs/leia.txt", text: "olá de dentro", deflate: true }, { path: "raiz.md", text: "# r" }]);
  openAttachmentPreview({ fileName: "pacote.zip", type: "application/zip", blob: new dom.Blob([zip], { type: "application/zip" }) });
  await settle();
  const rows = () => [...scrim().querySelectorAll(".cp-zip-list tbody tr")].map((one) => one.dataset.path);
  assert.deepEqual(rows(), ["docs", "raiz.md"]);
  assert.equal(scrim().querySelector(".cp-zip-where").textContent, "Archive contents");
  scrim().querySelector('tr[data-path="docs"]').click();
  await settle();
  assert.deepEqual(rows(), ["docs/leia.txt"]);
  scrim().querySelector('tr[data-path="docs/leia.txt"]').click();
  await settle();
  assert.equal(scrim().querySelector(".cp-pv-code").textContent, "olá de dentro");
  scrim().querySelector('[data-act="zip-up"]').click();
  await settle();
  assert.deepEqual(rows(), ["docs/leia.txt"]);
  closeAttachmentPreview();
});
