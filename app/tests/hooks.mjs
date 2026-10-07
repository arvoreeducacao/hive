import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const APP = fileURLToPath(new URL("..", import.meta.url));
const VENDOR = {
  "/vendor/xterm.mjs": "node_modules/@xterm/xterm/lib/xterm.mjs",
  "/vendor/addon-fit.mjs": "node_modules/@xterm/addon-fit/lib/addon-fit.mjs",
  "/vendor/addon-web-links.mjs": "node_modules/@xterm/addon-web-links/lib/addon-web-links.mjs"
};

const SOLID = {
  "solid-js": "node_modules/solid-js/dist/solid.js",
  "solid-js/web": "node_modules/solid-js/web/dist/web.js",
  "solid-js/store": "node_modules/solid-js/store/dist/store.js"
};

export function resolve(specifier, context, next) {
  const bare = specifier.replace(/\?.*$/, "");
  if (SOLID[bare]) return { url: pathToFileURL(join(APP, SOLID[bare])).href, shortCircuit: true };
  if (VENDOR[bare]) return { url: pathToFileURL(join(APP, VENDOR[bare])).href, shortCircuit: true };
  if (bare.startsWith("/assets/")) return { url: pathToFileURL(join(APP, bare.slice(1))).href, shortCircuit: true };
  return next(specifier, context);
}

let babel = null;
let solidPreset = null;
export function load(url, context, next) {
  if (!url.endsWith(".jsx")) return next(url, context);
  babel ||= require("@babel/core");
  solidPreset ||= require("babel-preset-solid");
  const source = readFileSync(fileURLToPath(url), "utf8");
  const { code } = babel.transformSync(source, { filename: fileURLToPath(url), presets: [[solidPreset, { generate: "dom", hydratable: false }]], babelrc: false, configFile: false, cwd: APP });
  return { format: "module", source: code, shortCircuit: true };
}
