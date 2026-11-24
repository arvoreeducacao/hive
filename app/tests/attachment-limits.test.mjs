import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTACHMENT_BYTES, ATTACHMENT_LIMIT, IMAGES_TOTAL_BYTES, IMAGE_BYTES, admitAttachments, attachmentKind, formatAttachmentSize, isHeic } from "../assets/drops.mjs";

const file = (name, size = 1024, type = "") => ({ name, size, type });

test("photos the agent can read are images, everything else travels as a file", () => {
  assert.equal(attachmentKind(file("tela.png", 1, "image/png")), "image");
  assert.equal(attachmentKind(file("foto.HEIC")), "image");
  assert.equal(attachmentKind(file("sem-nome", 1, "image/heif")), "image");
  assert.equal(attachmentKind(file("logo.svg", 1, "image/svg+xml")), "file");
  assert.equal(attachmentKind(file("raw.dng")), "file");
  assert.equal(attachmentKind(file("icone.bmp", 1, "image/bmp")), "file");
  assert.equal(attachmentKind(file("scan.tiff", 1, "image/tiff")), "unsupported-image");
  assert.equal(attachmentKind(file("notas.pdf", 1, "application/pdf")), "file");
  assert.equal(attachmentKind(file("video.mov", 1, "video/quicktime")), "file");
  assert.ok(isHeic(file("IMG_0001.heif")));
});

test("sizes read in KB up to a megabyte and in MB with one decimal after", () => {
  assert.equal(formatAttachmentSize(1), "1 KB");
  assert.equal(formatAttachmentSize(12 * 1024), "12 KB");
  assert.equal(formatAttachmentSize(1023.5 * 1024), "1.0 MB");
  assert.equal(formatAttachmentSize(5.5 * 1048576), "5.5 MB");
});

test("one message takes up to a hundred attachments and says so past that", () => {
  const many = Array.from({ length: 3 }, (_, i) => file(`a-${i}.txt`));
  const { accepted, refused } = admitAttachments(many, { held: ATTACHMENT_LIMIT - 1 });
  assert.equal(accepted.length, 1);
  assert.equal(refused.length, 2);
  assert.match(refused[0], /up to 100 files per message/);
});

test("an empty file, a file over 50 MB and a photo format nobody reads are refused by name", () => {
  const { accepted, refused } = admitAttachments([
    file("vazio.txt", 0),
    file("grande.zip", ATTACHMENT_BYTES + 1),
    file("scan.tiff", 10, "image/tiff"),
    file("ok.csv", 10)
  ]);
  assert.deepEqual(accepted.map((one) => one.file.name), ["ok.csv"]);
  assert.match(refused[0], /'vazio\.txt' is empty/);
  assert.match(refused[1], /'grande\.zip' exceeds the 50 MB attachment limit/);
  assert.match(refused[2], /'scan\.tiff' is not a supported image type/);
});

test("images stop at 80 MiB together, counting what the box already holds", () => {
  const { accepted, refused } = admitAttachments([file("a.png", IMAGE_BYTES, "image/png"), file("b.png", IMAGE_BYTES, "image/png")], { heldImageBytes: IMAGES_TOTAL_BYTES - IMAGE_BYTES });
  assert.deepEqual(accepted.map((one) => one.kind), ["image"]);
  assert.match(refused[0], /80 MiB/);
});

test("what the machine runs stays out of the composer too", () => {
  assert.match(admitAttachments([file("setup.exe")]).refused[0], /runs/);
});
