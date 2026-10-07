import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BROKER = resolve(HERE, "..");
const REPO = resolve(BROKER, "..");
const DOCKERFILE = join(BROKER, "..", "infra", "docker", "workspace.Dockerfile");

const IMPORT = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s*['"](\.[^'"]+)['"]/g;

function relativeImportsOf(file) {
  const text = readFileSync(file, "utf8");
  const found = [];
  for (const hit of text.matchAll(IMPORT)) found.push(hit[1]);
  return found;
}

function sourcesOf(dir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".mjs"))
    .map((name) => join(dir, name));
}

function foldersCopiedByImage() {
  const text = readFileSync(DOCKERFILE, "utf8");
  const copied = [];
  for (const line of text.split("\n")) {
    const hit = line.match(/^\s*COPY\s+(\S+)\s+\.\/(\S+)\s*$/i);
    if (hit && !hit[1].includes("package")) copied.push(hit[1].replace(/\/$/, ""));
  }
  return copied;
}

test("everything the server imports lives in a folder the image copies", () => {
  const copied = foldersCopiedByImage();
  assert.ok(copied.length, "the Dockerfile copies no folder at all");

  const missing = [];
  for (const file of sourcesOf(BROKER)) {
    for (const asked of relativeImportsOf(file)) {
      const target = resolve(dirname(file), asked);
      const inside = relative(REPO, target);
      const folder = inside.split("/")[0];
      if (!copied.includes(folder)) {
        missing.push(`${relative(REPO, file)} importa ${asked} — fica em "${folder}", que a imagem não copia`);
      }
      if (!existsSync(target)) missing.push(`${relative(REPO, file)} importa ${asked}, que não existe`);
    }
  }
  assert.deepEqual(missing, [], missing.join("\n"));
});

test("the Dockerfile copies folders, not a list of files", () => {
  const text = readFileSync(DOCKERFILE, "utf8");
  const named = text.split("\n").filter((line) => /^\s*COPY\s+.*\.mjs/i.test(line));
  assert.deepEqual(named, [], "listar arquivo à mão é como sessions.mjs ficou fora da imagem");
});

test("the image's command points at a file the image actually copied in", () => {
  const text = readFileSync(DOCKERFILE, "utf8");
  const hit = text.match(/CMD\s+\[([^\]]+)\]/);
  assert.ok(hit, "the Dockerfile has no CMD");
  const words = hit[1].split(",").map((w) => w.trim().replace(/^"|"$/g, ""));
  const entry = words[words.length - 1];

  if (!entry.startsWith("/")) {
    assert.ok(existsSync(join(REPO, entry)), `o CMD roda ${entry}, que não existe no repo`);
    return;
  }

  const copies = [...text.matchAll(/^COPY\s+(?!--from)(\S+)\s+(\S+)\s*$/gm)].map((one) => ({ from: one[1], to: one[2] }));
  const brought = copies.find((one) => one.to === entry);
  assert.ok(brought, `o CMD roda ${entry}, e nenhum COPY leva nada para lá`);
  assert.ok(existsSync(join(REPO, brought.from)), `o CMD roda ${entry}, que vem de ${brought.from} — e esse arquivo não existe no repo`);
});

test("what the image runs is the file that knows how to start itself", () => {
  const text = readFileSync(join(BROKER, "server.mjs"), "utf8");
  assert.match(text, /basename\(process\.argv\[1\]\)\s*===\s*"server\.mjs"/,
    "a guarda de execução tem que olhar o nome do arquivo — comparar caminho quebrou dentro do container uma vez");
});
