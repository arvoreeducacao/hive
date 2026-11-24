import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const rich = readFileSync(join(HERE, "src/app/markdown-rich.js"), "utf8");

test("the folder the bundle splits its lazy chunks into is the one the server hands out", async () => {
  const { LAZY_DIR } = await import("../build.mjs");
  assert.match(server, new RegExp(`const LAZY_PREFIX = "/assets/dist/${LAZY_DIR}/";`));
  assert.match(server, new RegExp(`join\\(HERE, "assets/dist/${LAZY_DIR}", rel\\)`));
  assert.ok(server.indexOf("url.pathname.startsWith(LAZY_PREFIX)") < server.indexOf("if (STATIC[url.pathname])"), "the lazy folder is answered before the page falls back to app.html");
  assert.ok(rich.includes(`"/assets/dist/${LAZY_DIR}/katex/katex.min.css"`));
});

test("the highlighter, KaTeX and mermaid are imported on demand, never with the page", () => {
  for (const lazy of ["highlight", "katex", "mermaid"]) {
    assert.ok(rich.includes(`import("./markdown-${lazy}.js")`), `${lazy} is not loaded on demand`);
    assert.ok(!new RegExp(`^import .*markdown-${lazy}`, "m").test(rich), `${lazy} is imported with the page`);
  }
});

const canBuild = existsSync(join(HERE, "node_modules/esbuild")) && existsSync(join(HERE, "node_modules/mermaid")) && existsSync(join(HERE, "node_modules/katex"));

test("the build splits the lazy pieces off the page and ships the faces KaTeX draws with", { skip: !canBuild && "esbuild, mermaid and katex are dev dependencies — not installed here" }, async () => {
  const { buildApp } = await import("../build.mjs");
  const outdir = await mkdtemp(join(tmpdir(), "hive-lazy-"));
  try {
    const { errors } = await buildApp({ outdir, minify: false });
    assert.deepEqual(errors, []);
    const page = await readFile(join(outdir, "hive.mjs"), "utf8");
    const chunks = readdirSync(join(outdir, "lazy"));
    for (const lazy of ["highlight", "katex", "mermaid"]) {
      assert.ok(page.includes(`import(${JSON.stringify(`./lazy/markdown-${lazy}.mjs`)})`), `the page does not reach ${lazy} on demand`);
      assert.ok(chunks.includes(`markdown-${lazy}.mjs`), `markdown-${lazy}.mjs is asked for and not built`);
    }
    assert.doesNotMatch(page, /from\s*"\.\/lazy\//, "the page must boot without the lazy folder — a static import there would blank it on a server that does not hand the folder out");
    assert.ok(!page.includes("KaTeX parse error"), "KaTeX leaked into the page bundle");
    assert.ok(existsSync(join(outdir, "lazy/katex/katex.min.css")));
    assert.ok(readdirSync(join(outdir, "lazy/katex/fonts")).some((one) => one.endsWith(".woff2")));
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});
