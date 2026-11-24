import { test } from "node:test";
import assert from "node:assert/strict";
import { zipOf } from "./zip-fixture.mjs";
import { ArchiveError, folderListing, readArchive, readEntry } from "../src/app/zip-preview.js";

const sample = () => zipOf([
  { path: "README.md", text: "# oi" },
  { path: "src/", text: "" },
  { path: "src/app.js", text: "console.log('olá');\n".repeat(20), deflate: true },
  { path: "src/lib/util.js", text: "export const x = 1;" }
]);

test("the archive opens as a folder: folders first, then files, by path", () => {
  const archive = readArchive(sample());
  assert.deepEqual(folderListing(archive.entries, "").map((row) => [row.name, row.folder]), [["src", true], ["README.md", false]]);
  assert.deepEqual(folderListing(archive.entries, "src").map((row) => row.name), ["lib", "app.js"]);
  assert.ok(folderListing(archive.entries, "")[1].modified instanceof Date);
});

test("a stored entry and a deflated one both open as their text", async () => {
  const archive = readArchive(sample());
  assert.equal(new TextDecoder().decode(await readEntry(archive, "README.md")), "# oi");
  assert.equal(new TextDecoder().decode(await readEntry(archive, "src/app.js")), "console.log('olá');\n".repeat(20));
});

test("bytes that are not a zip, or a zip with nothing in it, say why", () => {
  assert.throws(() => readArchive(new Uint8Array([1, 2, 3])), (wrong) => wrong instanceof ArchiveError && wrong.code === "not-zip");
  assert.throws(() => readArchive(zipOf([])), (wrong) => wrong.code === "empty");
});
