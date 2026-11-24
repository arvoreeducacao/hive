import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const HERE = fileURLToPath(new URL(".", import.meta.url));

export const ENTRIES = { hive: "src/index.jsx" };

export const LAZY_DIR = "lazy";

export const LAZY_ENTRIES = {
  "markdown-highlight": "src/app/markdown-highlight.js",
  "markdown-katex": "src/app/markdown-katex.js",
  "markdown-mermaid": "src/app/markdown-mermaid.js"
};

const lazyImports = {
  name: "lazy-imports",
  setup(builder) {
    const names = Object.keys(LAZY_ENTRIES).join("|");
    builder.onResolve({ filter: new RegExp(`^\\./(${names})\\.js$`) }, (asked) => (asked.kind === "dynamic-import" ? { path: `./${LAZY_DIR}/${asked.path.slice(2, -3)}.mjs`, external: true } : undefined));
  }
};

function shipKatexFaces(outdir) {
  const dist = join(dirname(createRequire(import.meta.url).resolve("katex/package.json")), "dist");
  const into = join(outdir, LAZY_DIR, "katex");
  mkdirSync(join(into, "fonts"), { recursive: true });
  copyFileSync(join(dist, "katex.min.css"), join(into, "katex.min.css"));
  for (const face of readdirSync(join(dist, "fonts"))) if (face.endsWith(".woff2")) copyFileSync(join(dist, "fonts", face), join(into, "fonts", face));
}

export async function buildApp({ outdir = join(HERE, "assets/dist"), minify = true } = {}) {
  const shared = {
    outExtension: { ".js": ".mjs" },
    bundle: true,
    format: "esm",
    target: ["chrome130"],
    minify,
    sourcemap: true,
    logLevel: "silent",
    external: ["/assets/*", "/vendor/*"]
  };
  const page = await build({
    ...shared,
    entryPoints: Object.fromEntries(Object.entries(ENTRIES).map(([name, file]) => [name, join(HERE, file)])),
    outdir,
    plugins: [lazyImports, solidPlugin()]
  });
  rmSync(join(outdir, LAZY_DIR), { recursive: true, force: true });
  const lazy = await build({
    ...shared,
    entryPoints: Object.fromEntries(Object.entries(LAZY_ENTRIES).map(([name, file]) => [name, join(HERE, file)])),
    outdir: join(outdir, LAZY_DIR),
    splitting: true,
    chunkNames: "chunk-[hash]"
  });
  shipKatexFaces(outdir);
  return { outdir, errors: [...page.errors, ...lazy.errors], warnings: [...page.warnings, ...lazy.warnings] };
}

export function shipDeployments({ repo = join(HERE, ".."), outdir = join(HERE, "assets/dist") } = {}) {
  const into = join(outdir, "deployments");
  rmSync(into, { recursive: true, force: true });
  const shipped = [];
  for (const entry of readdirSync(repo, { withFileTypes: true })) {
    const defaults = join(repo, entry.name, "hive.defaults");
    if (!entry.isDirectory() || !existsSync(defaults)) continue;
    mkdirSync(join(into, entry.name), { recursive: true });
    copyFileSync(defaults, join(into, entry.name, "hive.defaults"));
    shipped.push(entry.name);
  }
  return shipped;
}

export async function buildAndShip(options) {
  const made = await buildApp(options);
  return { ...made, deployments: shipDeployments({ outdir: made.outdir }) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { outdir, warnings } = await buildAndShip();
  for (const w of warnings) console.warn(w.text);
  console.log(`built ${Object.keys(ENTRIES).join(", ")} into ${outdir}`);
}
