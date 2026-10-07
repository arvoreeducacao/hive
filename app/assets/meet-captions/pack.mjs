import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { hiveLines } from "../../lib/env.mjs";
import { aveiaOriginOf, writeExtension } from "../../lib/meeting-captions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ADDRESS_KEY = "HIVE_AVEIA_URL";

export function deploymentAddress(repo = resolve(HERE, "..", "..", "..")) {
  let folders = [];
  try { folders = readdirSync(repo, { withFileTypes: true }).filter((one) => one.isDirectory()).map((one) => one.name).sort(); } catch {}
  for (const folder of folders) {
    const file = join(repo, folder, "hive.defaults");
    if (!existsSync(file)) continue;
    const found = hiveLines(readFileSync(file, "utf8"))[ADDRESS_KEY];
    if (found) return found;
  }
  return "";
}

const zipInto = (file, folder) => {
  rmSync(file, { force: true });
  execFileSync("zip", ["-r", "-q", "-X", file, "."], { cwd: folder, stdio: ["ignore", "ignore", "inherit"] });
};

export function pack({ address = "", out, assets = HERE, repo, env = process.env } = {}) {
  const asked = address || env[ADDRESS_KEY] || deploymentAddress(repo);
  const aveia = aveiaOriginOf(asked);
  if (!aveia) return { error: asked ? `${asked} is not an https address` : `no Aveia address: pass --aveia https://… or set ${ADDRESS_KEY}` };
  if (!out) return { error: "no output folder: pass --out <folder>" };
  const from = join(assets, "extension");
  const version = JSON.parse(readFileSync(join(from, "manifest.chrome.json"), "utf8")).version;
  const into = resolve(out);
  mkdirSync(into, { recursive: true });
  const chrome = join(into, `aveia-chrome-${version}.zip`);
  const firefox = join(into, `aveia-firefox-${version}.zip`);
  const firefoxDir = join(into, `firefox-${version}`);
  const bench = mkdtempSync(join(tmpdir(), "aveia-pack-"));
  try {
    writeExtension({ from, into: bench, manifest: "manifest.chrome.json", aveia, shape: ({ key, ...rest }) => rest });
    zipInto(chrome, bench);
  } finally { rmSync(bench, { recursive: true, force: true }); }
  rmSync(firefoxDir, { recursive: true, force: true });
  writeExtension({ from, into: firefoxDir, manifest: "manifest.firefox.json", aveia });
  zipInto(firefox, firefoxDir);
  return { ok: true, aveia, version, chrome, firefox, firefoxDir };
}

function asked(args) {
  const said = {};
  for (let at = 0; at < args.length; at++) {
    const [name, joined] = args[at].split("=", 2);
    if (name !== "--aveia" && name !== "--out") return { error: `unknown argument ${args[at]}` };
    const value = joined ?? args[++at];
    if (!value) return { error: `${name} needs a value` };
    said[name === "--aveia" ? "address" : "out"] = value;
  }
  return said;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const said = asked(process.argv.slice(2));
  const done = said.error ? said : pack(said);
  if (done.error) { process.stderr.write(`pack: ${done.error}\n`); process.exit(1); }
  process.stdout.write(`Aveia ${done.version} for ${done.aveia}\n${done.chrome}\n${done.firefox}\n${done.firefoxDir}\n`);
}
