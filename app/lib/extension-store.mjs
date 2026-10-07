import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOOKS, LOGO_FILE, MANIFEST_FILE, MODULE_FILE, STORE_FILE, isExtensionName, isPlainObject, logoDataUrl, readManifest, readStoreMark } from "./extensions.mjs";

export { STORE_FILE, logoDataUrl, readStoreMark };
export const CATALOG_FRESH_MS = 10 * 60 * 1000;
const FILE_MAX = 512 * 1024;
const FILES_MAX = 40;
const REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const SEGMENT = /^[A-Za-z0-9._-]{1,120}$/;
const SHA = /^[0-9a-f]{40}$/;
const TEST_FILE = /\.test\.m?js$/;

const short = (wrong) => String(wrong?.message || wrong).split("\n")[0].slice(0, 200);

export const isRepo = (repo) => REPO.test(String(repo || ""));

export const safePath = (path) => {
  const parts = String(path || "").split("/");
  return parts.length >= 2 && parts.every((part) => SEGMENT.test(part) && part !== "." && part !== "..");
};

function shownOf(text) {
  try {
    const raw = JSON.parse(String(text || ""));
    if (!isPlainObject(raw)) return {};
    const line = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    return {
      title: line(raw.title, 60),
      description: line(raw.description, 200),
      version: line(raw.version, 40),
      hooks: Array.isArray(raw.hooks) ? raw.hooks.filter((one) => typeof one === "string").slice(0, 10) : [],
      logo: typeof raw.logo === "string" && LOGO_FILE.test(raw.logo) ? raw.logo : ""
    };
  } catch { return {}; }
}

export function createStore({ repo = "", personalDir = "", fetchImpl = (...args) => fetch(...args), now = Date.now, freshMs = CATALOG_FRESH_MS } = {}) {
  let held = null;

  async function ask(url, { json = true } = {}) {
    const answer = await fetchImpl(url, { headers: { accept: json ? "application/vnd.github+json" : "*/*", "user-agent": "hive" } });
    if (!answer.ok) throw new Error(`${url.replace(/^https:\/\/[^/]+/, "")} answered ${answer.status}`);
    return json ? answer.json() : answer.text();
  }

  const raw = (commit, path) => ask(`https://raw.githubusercontent.com/${repo}/${commit}/${path}`, { json: false });

  async function read() {
    const head = await ask(`https://api.github.com/repos/${repo}/commits/HEAD`);
    const commit = String(head?.sha || "");
    if (!SHA.test(commit)) throw new Error("the catalog did not say which commit it is at");
    const tree = await ask(`https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`);
    const blobs = (tree?.tree || []).filter((one) => one?.type === "blob" && safePath(one.path));
    const folders = [...new Set(blobs.map((one) => one.path.split("/")[0]))].filter((name) => isExtensionName(name)).sort();
    const extensions = [];
    for (const name of folders) {
      const mine = blobs.filter((one) => one.path.startsWith(`${name}/`));
      const paths = new Set(mine.map((one) => one.path));
      if (!paths.has(`${name}/${MANIFEST_FILE}`) || !paths.has(`${name}/${MODULE_FILE}`)) continue;
      const text = await raw(commit, `${name}/${MANIFEST_FILE}`);
      const shown = shownOf(text);
      const checked = readManifest(text, `catalog/${name}`);
      const unknown = (shown.hooks || []).filter((hook) => !HOOKS.includes(hook));
      const files = mine.filter((one) => !TEST_FILE.test(one.path)).map((one) => ({ path: one.path.slice(name.length + 1), size: Number(one.size) || 0 }));
      let logo = "";
      if (shown.logo && paths.has(`${name}/${shown.logo}`)) {
        try { logo = logoDataUrl(await raw(commit, `${name}/${shown.logo}`)); } catch {}
      }
      extensions.push({
        name,
        title: checked.manifest?.title || shown.title || name,
        description: checked.manifest?.description || shown.description || "",
        version: checked.manifest?.version || shown.version || "",
        hooks: checked.manifest?.hooks || shown.hooks || [],
        settings: checked.manifest?.settings || {},
        logo,
        files,
        newerHive: unknown.length > 0,
        unknownHooks: unknown,
        problems: checked.manifest ? [] : checked.problems,
        tooBig: files.length > FILES_MAX || files.some((one) => one.size > FILE_MAX)
      });
    }
    return { repo, commit, at: now(), extensions };
  }

  async function catalog({ fresh = false } = {}) {
    if (!isRepo(repo)) return { repo: "", commit: "", at: now(), extensions: [], error: "this hive does not know where the catalog of extensions lives — set HIVE_EXTENSIONS_REPO in ~/.hive/config" };
    if (!fresh && held && now() - held.at < freshMs) return held;
    try { held = await read(); } catch (wrong) {
      if (held) return { ...held, warning: short(wrong) };
      return { repo, commit: "", at: now(), extensions: [], error: `could not read the catalog: ${short(wrong)}` };
    }
    return held;
  }

  async function install(entry, { commit } = {}) {
    if (!personalDir) return { error: "this hive has no folder for extensions" };
    if (!entry || !isExtensionName(entry.name)) return { error: "that is not an extension of the catalog" };
    if (entry.newerHive) return { error: `${entry.title || entry.name} asks for ${entry.unknownHooks.join(", ")}, which this hive does not know yet — update the hive first` };
    if (entry.tooBig) return { error: `${entry.name} is bigger than an extension may be` };
    if (!SHA.test(String(commit || ""))) return { error: "the catalog did not say which commit it is at" };
    const target = join(personalDir, entry.name);
    if (existsSync(target) && !readStoreMark(target)) return { error: `${target} already holds a copy that did not come from the catalog — remove it by hand first` };
    const staging = join(personalDir, `.installing-${entry.name}-${randomBytes(4).toString("hex")}`);
    try {
      mkdirSync(staging, { recursive: true });
      for (const file of entry.files) {
        if (!safePath(`${entry.name}/${file.path}`)) throw new Error(`${file.path} is not a path an extension may have`);
        const text = await raw(commit, `${entry.name}/${file.path}`);
        if (Buffer.byteLength(text) > FILE_MAX) throw new Error(`${file.path} is bigger than an extension file may be`);
        const where = join(staging, file.path);
        mkdirSync(dirname(where), { recursive: true });
        writeFileSync(where, text);
      }
      writeFileSync(join(staging, STORE_FILE), `${JSON.stringify({ repo, commit, version: entry.version, at: now() }, null, 2)}\n`);
      if (existsSync(target)) rmSync(target, { recursive: true, force: true });
      renameSync(staging, target);
    } catch (wrong) {
      rmSync(staging, { recursive: true, force: true });
      return { error: `could not install ${entry.name}: ${short(wrong)}` };
    }
    return { ok: true, dir: target };
  }

  function uninstall(name) {
    if (!personalDir || !isExtensionName(name)) return { error: "that is not an extension of this machine" };
    const target = join(personalDir, name);
    if (!existsSync(target)) return { error: `${name} is not installed here` };
    if (!readStoreMark(target)) return { error: `${name} was not installed from the catalog — its folder is left alone` };
    try { rmSync(target, { recursive: true, force: true }); } catch (wrong) { return { error: `could not remove ${target}: ${short(wrong)}` }; }
    return { ok: true };
  }

  return { repo, catalog, install, uninstall, held: () => held };
}
