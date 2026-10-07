import { build } from "esbuild";
import { solidPlugin } from "esbuild-plugin-solid";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const HERE = fileURLToPath(new URL(".", import.meta.url));

export const ENTRIES = { hive: "src/index.jsx" };

export async function buildApp({ outdir = join(HERE, "assets/dist"), minify = true } = {}) {
  const result = await build({
    entryPoints: Object.fromEntries(Object.entries(ENTRIES).map(([name, file]) => [name, join(HERE, file)])),
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    format: "esm",
    target: ["chrome130"],
    minify,
    sourcemap: true,
    logLevel: "silent",
    external: ["/assets/*", "/vendor/*"],
    plugins: [solidPlugin()]
  });
  return { outdir, errors: result.errors, warnings: result.warnings };
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
