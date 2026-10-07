import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const HOOKS = ["seat.title", "seat.opening", "routes", "tasks.read", "tasks.changed"];
export const ROUTE_PREFIX = "/api/ext/";
export const ROUTE_METHODS = ["GET", "POST"];
const ROUTE_PATH = /^\/api\/ext\/[a-z0-9-]+\/[A-Za-z0-9._/-]{1,120}$/;
const ROUTES_MAX = 40;
export const ORIGINS = ["built-in", "hub", "personal"];
export const MANIFEST_FILE = "extension.json";
export const MODULE_FILE = "index.mjs";
export const STORE_FILE = ".store.json";
export const LOGO_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}\.svg$/;
export const LOGO_MAX = 64 * 1024;
export const OPENING_BUDGET_MS = 1500;
export const TASKS_READ_BUDGET_MS = 4000;
export const EXTENSION_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const NAME_MAX = 40;
export const SETTING_TYPES = ["string", "boolean", "number", "password", "dropdown"];
export const SECRET_TYPES = ["password"];
export const ICON = /^i-[a-z0-9-]{1,30}$/;
const TITLE_MAX_CHARS = 60;
const PLACEHOLDER_MAX = 80;
const SETTING_DESCRIPTION_MAX = 200;
const DROPDOWN_MAX = 40;
const STORAGE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const STORAGE_MAX_BYTES = 256 * 1024;
const DESCRIPTION_MAX = 200;
const VERSION = /^[\w.+-]{1,40}$/;
const SETTINGS_MAX = 20;
const TITLE_MAX = 80;
const HASH_CHARS = 16;

export const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export function logoDataUrl(text) {
  const said = String(text || "");
  if (!said || Buffer.byteLength(said) > LOGO_MAX || !/^\s*<svg[\s>]/.test(said)) return "";
  return `data:image/svg+xml;base64,${Buffer.from(said).toString("base64")}`;
}

export function readStoreMark(dir, read = (path) => readFileSync(path, "utf8")) {
  try {
    const held = JSON.parse(read(join(dir, STORE_FILE)));
    return isPlainObject(held) && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(String(held.repo || "")) ? { repo: held.repo, commit: String(held.commit || ""), version: String(held.version || ""), at: Number(held.at) || 0 } : null;
  } catch { return null; }
}

export function isExtensionName(name) {
  return typeof name === "string" && name.length <= NAME_MAX && EXTENSION_NAME.test(name);
}

export function moduleHash(text) {
  return createHash("sha256").update(String(text ?? "")).digest("hex").slice(0, HASH_CHARS);
}

const isScalar = (value) => (typeof value === "number" ? Number.isFinite(value) : typeof value === "string" || typeof value === "boolean");

export const valueTypeOf = (type) => (type === "number" || type === "boolean" ? type : "string");

function cleanDropdownData(raw, where, problems) {
  if (!Array.isArray(raw) || !raw.length) { problems.push(`${where}.data should list the choices as { title, value }`); return null; }
  const data = [];
  for (const one of raw.slice(0, DROPDOWN_MAX)) {
    const value = typeof one?.value === "string" ? one.value : typeof one === "string" ? one : "";
    if (!value) { problems.push(`${where}.data should list the choices as { title, value }`); return null; }
    if (data.some((row) => row.value === value)) continue;
    data.push({ title: typeof one?.title === "string" && one.title.trim() ? one.title.trim().slice(0, 60) : value, value });
  }
  return data;
}

function cleanSettingSchema(raw, where, problems) {
  const settings = {};
  if (raw === undefined) return settings;
  if (!isPlainObject(raw)) { problems.push(`${where}: settings should be an object of key -> { type, default, label }`); return settings; }
  for (const [key, def] of Object.entries(raw)) {
    if (Object.keys(settings).length >= SETTINGS_MAX) { problems.push(`${where}: settings keeps at most ${SETTINGS_MAX} keys — the rest were ignored`); break; }
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)) { problems.push(`${where}: settings.${key} is not a key a setting can have`); continue; }
    if (!isPlainObject(def) || !SETTING_TYPES.includes(def.type)) { problems.push(`${where}: settings.${key}.type should be ${SETTING_TYPES.join(", ")}`); continue; }
    const valueType = valueTypeOf(def.type);
    if (def.default !== undefined && typeof def.default !== valueType) { problems.push(`${where}: settings.${key}.default should be a ${valueType}`); continue; }
    if (def.type === "password" && def.default !== undefined) { problems.push(`${where}: settings.${key} is a password and cannot have a default`); continue; }
    const data = def.type === "dropdown" ? cleanDropdownData(def.data, `${where}: settings.${key}`, problems) : undefined;
    if (def.type === "dropdown" && !data) continue;
    if (data && def.default !== undefined && !data.some((row) => row.value === def.default)) { problems.push(`${where}: settings.${key}.default should be one of its choices`); continue; }
    const fallback = def.default !== undefined ? def.default : valueType === "string" ? (data ? data[0].value : "") : valueType === "number" ? 0 : false;
    const label = typeof def.label === "string" && def.label.trim() ? def.label.trim().slice(0, 60) : key;
    const description = typeof def.description === "string" ? def.description.trim().slice(0, SETTING_DESCRIPTION_MAX) : "";
    const placeholder = typeof def.placeholder === "string" ? def.placeholder.trim().slice(0, PLACEHOLDER_MAX) : "";
    const required = def.required === true;
    settings[key] = { type: def.type, default: fallback, label, description, placeholder, required, ...(data ? { data } : {}) };
  }
  return settings;
}

export function readManifest(text, where) {
  const problems = [];
  let raw;
  try { raw = JSON.parse(String(text ?? "")); } catch (wrong) {
    return { manifest: null, problems: [`${where}: ${MANIFEST_FILE} is not valid JSON — ${String(wrong?.message || wrong).split("\n")[0]}`] };
  }
  if (!isPlainObject(raw)) return { manifest: null, problems: [`${where}: ${MANIFEST_FILE} should be an object`] };
  if (!isExtensionName(raw.name)) problems.push(`${where}: name should be lowercase words joined by hyphens, at most ${NAME_MAX} characters`);
  let title = "";
  if (raw.title !== undefined) {
    if (typeof raw.title === "string" && raw.title.trim()) title = raw.title.trim().slice(0, TITLE_MAX_CHARS);
    else problems.push(`${where}: title should be a short line of text`);
  }
  let icon = "";
  if (raw.icon !== undefined) {
    if (typeof raw.icon === "string" && ICON.test(raw.icon)) icon = raw.icon;
    else problems.push(`${where}: icon should be the id of one of the app's symbols, like i-plug`);
  }
  const version = typeof raw.version === "string" && VERSION.test(raw.version) ? raw.version : "";
  if (!version) problems.push(`${where}: version should be a short string like 1.0.0`);
  const description = typeof raw.description === "string" ? raw.description.trim().slice(0, DESCRIPTION_MAX) : "";
  const hooks = [];
  if (!Array.isArray(raw.hooks) || !raw.hooks.length) problems.push(`${where}: hooks should list at least one of ${HOOKS.join(", ")}`);
  else for (const hook of raw.hooks) {
    if (HOOKS.includes(hook)) { if (!hooks.includes(hook)) hooks.push(hook); }
    else problems.push(`${where}: ${String(hook)} is not a hook this hive knows (${HOOKS.join(", ")})`);
  }
  const settings = cleanSettingSchema(raw.settings, where, problems);
  const logo = typeof raw.logo === "string" && LOGO_FILE.test(raw.logo) ? raw.logo : "";
  if (problems.length) return { manifest: null, problems };
  return { manifest: { name: raw.name, title: title || raw.name, icon, logo, version, description, hooks, settings }, problems };
}

export const isSecretSetting = (def) => SECRET_TYPES.includes(def?.type);

function missingOf(schema, settings) {
  return Object.entries(schema).filter(([key, def]) => def.required && (settings[key] === "" || settings[key] === undefined)).map(([key]) => key);
}

export function cleanSettingValues(raw, manifest, where, secrets = {}) {
  const problems = [];
  const schema = manifest?.settings || {};
  const settings = Object.fromEntries(Object.entries(schema).map(([key, def]) => [key, def.default]));
  for (const [key, def] of Object.entries(schema)) {
    if (!isSecretSetting(def)) continue;
    const held = isPlainObject(secrets) ? secrets[key] : undefined;
    settings[key] = typeof held === "string" ? held : "";
  }
  const done = () => ({ settings, problems, missing: missingOf(schema, settings) });
  if (raw === undefined || raw === null) return done();
  if (!isPlainObject(raw)) { problems.push(`${where}: settings should be an object`); return done(); }
  for (const [key, value] of Object.entries(raw)) {
    const def = schema[key];
    if (!def) { problems.push(`${where}: ${key} is not a setting this extension declares`); continue; }
    if (isSecretSetting(def)) { problems.push(`${where}: ${key} is a password and does not live in config.jsonc — set it from the panel`); continue; }
    const valueType = valueTypeOf(def.type);
    if (typeof value !== valueType || !isScalar(value)) { problems.push(`${where}: ${key} should be a ${valueType}`); continue; }
    if (def.data && !def.data.some((row) => row.value === value)) { problems.push(`${where}: ${key} should be one of ${def.data.map((row) => row.value).join(", ")}`); continue; }
    settings[key] = value;
  }
  return done();
}

export function splitSettingValues(raw, manifest) {
  const schema = manifest?.settings || {};
  const plain = {};
  const secrets = {};
  if (!isPlainObject(raw)) return { plain, secrets };
  for (const [key, value] of Object.entries(raw)) {
    if (isSecretSetting(schema[key])) secrets[key] = value;
    else plain[key] = value;
  }
  return { plain, secrets };
}

function readJsonFile(file) {
  try {
    const held = JSON.parse(readFileSync(file, "utf8"));
    return isPlainObject(held) ? held : {};
  } catch { return {}; }
}

function writePrivateJson(file, value) {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch {}
}

export function createStorage(file) {
  let held = null;
  const load = () => { if (!held) held = file ? readJsonFile(file) : {}; return held; };
  const save = () => { if (file) writePrivateJson(file, held); };
  const checkKey = (key) => { if (!STORAGE_KEY.test(String(key))) throw new Error(`a storage key is a short word like last-run, not ${JSON.stringify(key)}`); };
  return {
    get: (key) => { checkKey(key); const value = load()[key]; return value === undefined ? undefined : structuredClone(value); },
    set: (key, value) => {
      checkKey(key);
      if (value === undefined || typeof value === "function") throw new Error(`storage keeps json — ${key} got ${typeof value}`);
      const text = JSON.stringify(value);
      if (text === undefined) throw new Error(`storage keeps json — ${key} could not be serialised`);
      const next = { ...load(), [key]: JSON.parse(text) };
      if (JSON.stringify(next).length > STORAGE_MAX_BYTES) throw new Error(`storage keeps at most ${STORAGE_MAX_BYTES / 1024} KB — use hive.paths.support for more`);
      held = next;
      save();
    },
    remove: (key) => { checkKey(key); const next = { ...load() }; delete next[key]; held = next; save(); },
    all: () => structuredClone(load()),
    clear: () => { held = {}; save(); }
  };
}

function foldersOf(dir, fs) {
  if (!fs.exists(dir)) return [];
  let names = [];
  try { names = fs.list(dir); } catch { return []; }
  return names.filter((name) => {
    try { return fs.isDir(join(dir, name)); } catch { return false; }
  }).sort();
}

export function discover(roots, fs = {}) {
  const at = {
    exists: fs.exists || existsSync,
    list: fs.list || readdirSync,
    isDir: fs.isDir || ((path) => statSync(path).isDirectory()),
    read: fs.read || ((path) => readFileSync(path, "utf8"))
  };
  const found = [];
  for (const origin of ORIGINS) {
    const root = (roots || []).find((one) => one.origin === origin);
    if (!root?.dir) continue;
    for (const folder of foldersOf(root.dir, at)) {
      const dir = join(root.dir, folder);
      const where = `${origin}/${folder}`;
      const problems = [];
      let manifest = null;
      if (!isExtensionName(folder)) problems.push(`${where}: the folder should be lowercase words joined by hyphens, at most ${NAME_MAX} characters`);
      const manifestFile = join(dir, MANIFEST_FILE);
      if (!at.exists(manifestFile)) problems.push(`${where}: no ${MANIFEST_FILE} in the folder`);
      else {
        let text = "";
        try { text = at.read(manifestFile); } catch (wrong) { problems.push(`${where}: ${MANIFEST_FILE} could not be read — ${String(wrong?.message || wrong)}`); }
        const read = readManifest(text, where);
        problems.push(...read.problems);
        manifest = read.manifest;
        if (manifest && manifest.name !== folder) {
          problems.push(`${where}: the folder is called ${folder} but the manifest says ${manifest.name} — the folder wins`);
          manifest = { ...manifest, name: folder };
        }
      }
      const moduleFile = join(dir, MODULE_FILE);
      let hash = "";
      if (!at.exists(moduleFile)) problems.push(`${where}: no ${MODULE_FILE} in the folder`);
      else {
        try { hash = moduleHash(at.read(moduleFile)); } catch (wrong) { problems.push(`${where}: ${MODULE_FILE} could not be read — ${String(wrong?.message || wrong)}`); }
      }
      let logo = "";
      if (manifest?.logo && at.exists(join(dir, manifest.logo))) {
        try { logo = logoDataUrl(at.read(join(dir, manifest.logo))); } catch {}
      }
      const store = origin === "personal" && at.exists(join(dir, STORE_FILE)) ? readStoreMark(dir, at.read) : null;
      found.push({ name: folder, origin, dir, moduleFile, manifest, hash, logo, store, problems, reserved: false, shadowed: false });
    }
  }
  const builtIn = new Set(found.filter((one) => one.origin === "built-in").map((one) => one.name));
  const personal = new Set(found.filter((one) => one.origin === "personal").map((one) => one.name));
  for (const one of found) {
    if (one.origin !== "built-in" && builtIn.has(one.name)) {
      one.reserved = true;
      one.problems.push(`${one.origin}/${one.name}: the name ${one.name} belongs to a built-in extension — this copy is not loaded`);
    } else if (one.origin === "hub" && personal.has(one.name)) {
      one.shadowed = true;
      one.problems.push(`hub/${one.name}: shadowed by the personal copy in ~/.hive/extensions — this one is not loaded`);
    }
  }
  return found;
}

export function loadable(row) {
  return !!row?.manifest && !!row.hash && !row.reserved && !row.shadowed;
}

export function enabledByConfig(row, config) {
  const cfg = isPlainObject(config?.[row.name]) ? config[row.name] : null;
  if (row.origin === "built-in") return { enabled: cfg?.enabled !== false, changed: false };
  if (cfg?.enabled !== true) return { enabled: false, changed: false };
  if (cfg.hash && cfg.hash !== row.hash) return { enabled: false, changed: true };
  return { enabled: true, changed: false };
}

const defaultImport = (file, hash = "") => import(`${pathToFileURL(file).href}${hash ? `?v=${hash}` : ""}`);
const firstLine = (text) => String(text || "").split("\n").map((l) => l.trim()).find(Boolean) || "";
const short = (wrong) => String(wrong?.message || wrong).split("\n")[0].slice(0, 200);

class Timeout extends Error {}

export class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function refuse(status, message) {
  const code = Number(status);
  return new Refusal(code >= 400 && code <= 599 ? code : 400, String(message || "refused"));
}

export function routePathOf(name, path) {
  const said = String(path || "");
  if (!said.startsWith(`${ROUTE_PREFIX}${name}/`)) return { error: `a route of ${name} lives under ${ROUTE_PREFIX}${name}/ — ${said || "(empty)"} is outside` };
  if (!ROUTE_PATH.test(said) || said.includes("..") || said.includes("//")) return { error: `${said} is not a path a route can have` };
  return { path: said };
}

export function collectRoutes(name, register, problems) {
  const routes = [];
  const on = (method, path, fn) => {
    const verb = method === null || method === undefined ? null : String(method).toUpperCase();
    if (verb !== null && !ROUTE_METHODS.includes(verb)) { problems.push(`route ${path}: method should be ${ROUTE_METHODS.join(", ")} or null for any`); return; }
    const where = routePathOf(name, path);
    if (where.error) { problems.push(`route: ${where.error}`); return; }
    if (typeof fn !== "function") { problems.push(`route ${where.path}: needs a function`); return; }
    if (routes.length >= ROUTES_MAX) { problems.push(`route ${where.path}: an extension keeps at most ${ROUTES_MAX} routes`); return; }
    if (routes.some((one) => one.path === where.path && (one.method === null || verb === null || one.method === verb))) { problems.push(`route ${where.path}: registered twice`); return; }
    routes.push({ method: verb, path: where.path, fn });
  };
  try { register(on); } catch (wrong) { problems.push(`routes threw while registering: ${short(wrong)}`); }
  return routes;
}

function withBudget(promise, ms) {
  let timer;
  const clock = new Promise((_, reject) => { timer = setTimeout(() => reject(new Timeout(`took longer than ${ms} ms`)), ms); });
  return Promise.race([Promise.resolve(promise), clock]).finally(() => clearTimeout(timer));
}

export function createRegistry({ roots = [], config = {}, log = () => {}, importModule = defaultImport, openingBudgetMs = OPENING_BUDGET_MS, tasksReadBudgetMs = TASKS_READ_BUDGET_MS, fs, stateDir = "", secretsFile = "", bodyOf = async () => ({}), hubDir = "" } = {}) {
  let rows = [];
  const byName = new Map();
  const index = () => {
    byName.clear();
    for (const row of rows) {
      const held = byName.get(row.name);
      if (!held || (!row.reserved && !row.shadowed)) byName.set(row.name, row);
    }
  };
  rows = discover(roots, fs);
  index();
  const loaded = new Map();
  const loaderProblems = new Map();
  const skippedHooks = new Set();
  const titleCache = new Map();
  let extensionsConfig = isPlainObject(config) ? config : {};

  const problemsOf = (name) => loaderProblems.get(name) || [];
  const note = (name, line) => {
    const held = problemsOf(name);
    if (!held.includes(line)) loaderProblems.set(name, [...held, line]);
    log(`hive: extension ${name}: ${line}`);
  };

  let secrets = secretsFile ? readJsonFile(secretsFile) : {};
  const storages = new Map();
  const routesByName = new Map();

  const settingsOf = (row) => cleanSettingValues(extensionsConfig[row.name]?.settings, row.manifest, `${row.origin}/${row.name}`, secrets[row.name]);

  const supportDirOf = (row) => (stateDir ? join(stateDir, row.name) : "");

  const storageOf = (row) => {
    if (!storages.has(row.name)) storages.set(row.name, createStorage(stateDir ? join(stateDir, `${row.name}.json`) : ""));
    return storages.get(row.name);
  };

  function setSecrets(name, values) {
    const row = byName.get(name);
    if (!row?.manifest) return { ok: false, error: `no extension called ${name}` };
    const next = { ...(isPlainObject(secrets[name]) ? secrets[name] : {}) };
    for (const [key, value] of Object.entries(values || {})) {
      if (!isSecretSetting(row.manifest.settings[key])) continue;
      if (typeof value !== "string" || !value) delete next[key];
      else next[key] = value;
    }
    secrets = { ...secrets, [name]: next };
    if (secretsFile) writePrivateJson(secretsFile, secrets);
    titleCache.clear();
    return { ok: true };
  }

  async function importOne(row) {
    if (loaded.has(row.name) || !loadable(row)) return;
    let module;
    try { module = await importModule(row.moduleFile, row.hash); } catch (wrong) {
      note(row.name, `could not load ${MODULE_FILE}: ${short(wrong)}`);
      return;
    }
    const register = module?.default;
    if (typeof register !== "function") { note(row.name, `${MODULE_FILE} should export a default function that receives the hive`); return; }
    const handlers = {};
    const support = supportDirOf(row);
    if (support) { try { mkdirSync(support, { recursive: true }); } catch {} }
    const hive = {
      name: row.name,
      log: (line) => log(`hive: extension ${row.name}: ${String(line)}`),
      storage: storageOf(row),
      paths: { dir: row.dir, support, hub: hubDir || "" },
      refuse,
      on(hook, fn) {
        if (!HOOKS.includes(hook)) return note(row.name, `${String(hook)} is not a hook this hive knows (${HOOKS.join(", ")})`);
        if (!row.manifest.hooks.includes(hook)) return note(row.name, `${hook} is not declared in ${MANIFEST_FILE}, so it is ignored`);
        if (typeof fn !== "function") return note(row.name, `${hook} needs a function`);
        handlers[hook] = fn;
      }
    };
    try { register(hive); } catch (wrong) {
      note(row.name, `${MODULE_FILE} threw while registering: ${short(wrong)}`);
      return;
    }
    if (handlers.routes) {
      const problems = [];
      routesByName.set(row.name, collectRoutes(row.name, handlers.routes, problems));
      for (const line of problems) note(row.name, line);
    }
    loaded.set(row.name, { handlers, hash: row.hash });
  }

  const isOn = (row) => loaded.has(row.name) && loadable(row) && enabledByConfig(row, extensionsConfig).enabled && !settingsOf(row).missing.length;

  const active = (hook) => rows.filter((row) => isOn(row) && loaded.get(row.name).handlers[hook] && !skippedHooks.has(`${row.name}/${hook}`));

  function skip(row, hook, wrong) {
    skippedHooks.add(`${row.name}/${hook}`);
    note(row.name, `${hook} threw (${short(wrong)}) — skipped until the extension is turned on again`);
  }

  async function load() {
    for (const row of rows) if (loadable(row) && enabledByConfig(row, extensionsConfig).enabled) await importOne(row);
    return api;
  }

  function title(seats, { missionOf = () => "", statusOf = () => "" } = {}) {
    const acts = active("seat.title");
    if (!acts.length) return seats;
    return (seats || []).map((seat) => {
      const key = `${seat.where}:${seat.name}`;
      const mission = missionOf(seat);
      const input = [seat.title, seat.errand || "", firstLine(mission)].join(" ");
      const held = titleCache.get(key);
      if (held && held.input === input) return held.title === seat.title ? seat : { ...seat, title: held.title };
      let shown = String(seat.title || "");
      for (const row of acts) {
        if (skippedHooks.has(`${row.name}/seat.title`)) continue;
        try {
          const out = loaded.get(row.name).handlers["seat.title"]({
            name: seat.name, where: seat.where, title: shown, mission, status: statusOf(seat), errand: seat.errand || "", settings: settingsOf(row).settings
          });
          if (typeof out === "string" && out.trim()) shown = out.trim().replace(/\s+/g, " ").slice(0, TITLE_MAX);
        } catch (wrong) { skip(row, "seat.title", wrong); }
      }
      titleCache.set(key, { input, title: shown });
      return shown === seat.title ? seat : { ...seat, title: shown };
    });
  }

  async function opening({ body, prompt } = {}) {
    const next = { body: { ...(body || {}) }, prompt: String(prompt || ""), name: "", changed: false };
    for (const row of active("seat.opening")) {
      try {
        const out = await withBudget(loaded.get(row.name).handlers["seat.opening"]({ body: { ...next.body }, prompt: next.prompt, settings: settingsOf(row).settings }), openingBudgetMs);
        if (!isPlainObject(out)) continue;
        if (isPlainObject(out.body)) next.body = { ...next.body, ...out.body };
        if (typeof out.prompt === "string" && out.prompt.trim()) next.prompt = out.prompt;
        if (typeof out.name === "string" && out.name.trim()) next.name = out.name.trim();
        next.changed = true;
      } catch (wrong) {
        if (wrong instanceof Timeout) note(row.name, `seat.opening ${wrong.message} — the seat opened without it`);
        else skip(row, "seat.opening", wrong);
      }
    }
    return next;
  }

  async function tasksRead({ tasks } = {}) {
    for (const row of active("tasks.read")) {
      try {
        await withBudget(loaded.get(row.name).handlers["tasks.read"]({ tasks, settings: settingsOf(row).settings }), tasksReadBudgetMs);
      } catch (wrong) {
        if (wrong instanceof Timeout) note(row.name, `tasks.read ${wrong.message} — the list was shown without waiting for it`);
        else skip(row, "tasks.read", wrong);
      }
    }
  }

  async function tasksChanged({ change, task, before = null } = {}) {
    for (const row of active("tasks.changed")) {
      try {
        await loaded.get(row.name).handlers["tasks.changed"]({ change, task, before, settings: settingsOf(row).settings });
      } catch (wrong) { skip(row, "tasks.changed", wrong); }
    }
  }

  function routeOf(name, method, path) {
    return (routesByName.get(name) || []).find((one) => one.path === path && (one.method === null || one.method === method)) || null;
  }

  async function serve(req, res, url, json) {
    const path = String(url?.pathname || "");
    if (!path.startsWith(ROUTE_PREFIX)) return false;
    const name = path.slice(ROUTE_PREFIX.length).split("/")[0];
    const row = byName.get(name);
    if (!row || !loaded.has(name)) { json({ error: `no extension called ${name} is loaded` }, 404); return true; }
    if (!isOn(row)) { json({ error: `${name} is off` }, 404); return true; }
    const method = String(req?.method || "GET").toUpperCase();
    const route = routeOf(name, method, path);
    if (!route) { json({ error: `${name} has no ${method} ${path}` }, 404); return true; }
    let body = {};
    if (method === "POST") {
      body = await bodyOf(req);
      if (body?.oversized) { json({ error: "that is more than this door carries in one go" }, 413); return true; }
    }
    try {
      const out = await route.fn({ method, url, body, settings: settingsOf(row).settings, storage: storageOf(row) });
      json(out === undefined ? { ok: true } : out);
    } catch (wrong) {
      if (wrong instanceof Refusal) { json({ error: wrong.message }, wrong.status); return true; }
      note(name, `${method} ${path} threw: ${short(wrong)}`);
      json({ error: `${name} could not answer ${path}` }, 500);
    }
    return true;
  }

  function unload(name) {
    loaded.delete(name);
    routesByName.delete(name);
    loaderProblems.delete(name);
    for (const hook of HOOKS) skippedHooks.delete(`${name}/${hook}`);
    titleCache.clear();
  }

  function rediscover() {
    const before = new Map(rows.map((row) => [`${row.origin}/${row.name}`, row]));
    rows = discover(roots, fs);
    index();
    const now = new Set(rows.map((row) => `${row.origin}/${row.name}`));
    for (const [key, row] of before) {
      const fresh = byName.get(row.name);
      if (!now.has(key) || (fresh && loaded.has(row.name) && loaded.get(row.name).hash !== fresh.hash)) unload(row.name);
    }
    return api;
  }

  function forget(name) {
    const next = { ...secrets };
    delete next[name];
    secrets = next;
    if (secretsFile) writePrivateJson(secretsFile, secrets);
    storageOf({ name }).clear();
    if (stateDir) {
      try { rmSync(join(stateDir, `${name}.json`), { force: true }); } catch {}
      try { rmSync(join(stateDir, name), { recursive: true, force: true }); } catch {}
    }
    storages.delete(name);
    return { ok: true };
  }

  function reconfigure(next) {
    extensionsConfig = isPlainObject(next) ? next : {};
    titleCache.clear();
  }

  async function setEnabled(name, enabled, next) {
    const row = byName.get(name);
    if (!row) return { ok: false, error: `no extension called ${name}` };
    if (row.reserved || row.shadowed || !row.manifest) return { ok: false, error: row.problems[0] || `${name} cannot be turned on` };
    reconfigure(next !== undefined ? next : { ...extensionsConfig, [name]: { ...(extensionsConfig[name] || {}), enabled, ...(enabled && row.origin !== "built-in" ? { hash: row.hash } : {}) } });
    for (const hook of HOOKS) skippedHooks.delete(`${name}/${hook}`);
    loaderProblems.delete(name);
    if (enabled) await importOne(row);
    return { ok: true, problems: problemsOf(name) };
  }

  function currentHash(row) {
    try { return moduleHash((fs?.read || ((path) => readFileSync(path, "utf8")))(row.moduleFile)); } catch { return ""; }
  }

  function describe(row) {
    const state = enabledByConfig(row, extensionsConfig);
    const held = loaded.get(row.name);
    const values = settingsOf(row);
    const onDisk = held ? currentHash(row) : row.hash;
    const schema = row.manifest?.settings || {};
    const shown = Object.fromEntries(Object.entries(values.settings).filter(([key]) => !isSecretSetting(schema[key])));
    const kept = Object.fromEntries(Object.entries(schema).filter(([, def]) => isSecretSetting(def)).map(([key]) => [key, !!values.settings[key]]));
    return {
      name: row.name,
      title: row.manifest?.title || row.name,
      icon: row.manifest?.icon || "",
      origin: row.origin,
      dir: row.dir,
      version: row.manifest?.version || "",
      description: row.manifest?.description || "",
      hooks: row.manifest?.hooks || [],
      logo: row.logo || "",
      store: row.store || null,
      settings: schema,
      values: shown,
      secrets: kept,
      missing: values.missing,
      enabled: state.enabled,
      loaded: !!held,
      on: isOn(row),
      changed: state.changed,
      stale: !!held && onDisk !== held.hash,
      reserved: row.reserved,
      shadowed: row.shadowed,
      hash: row.hash,
      routes: (routesByName.get(row.name) || []).map((one) => `${one.method || "ANY"} ${one.path}`),
      skipped: HOOKS.filter((hook) => skippedHooks.has(`${row.name}/${hook}`)),
      problems: [...row.problems, ...values.problems, ...values.missing.map((key) => `${row.origin}/${row.name}: needs ${key} before it runs`), ...problemsOf(row.name)]
    };
  }

  const api = {
    roots,
    rows: () => rows,
    rowOf: (name) => byName.get(name) || null,
    hashOf: (name) => byName.get(name)?.hash || "",
    cleanSettings: (name, values) => {
      const row = byName.get(name);
      if (!row?.manifest) return { settings: {}, secrets: {}, problems: [`no extension called ${name}`] };
      const { plain, secrets: given } = splitSettingValues(values, row.manifest);
      const read = cleanSettingValues(plain, row.manifest, `${row.origin}/${row.name}`, secrets[row.name]);
      const problems = [...read.problems];
      const kept = {};
      for (const [key, value] of Object.entries(given)) {
        if (typeof value !== "string") { problems.push(`${row.origin}/${row.name}: ${key} should be a string`); continue; }
        kept[key] = value;
      }
      const plainOnly = Object.fromEntries(Object.entries(read.settings).filter(([key]) => !isSecretSetting(row.manifest.settings[key])));
      return { settings: plainOnly, secrets: kept, problems };
    },
    setSecrets,
    list: () => rows.map(describe),
    routesOf: (name) => (routesByName.get(name) || []).map((one) => ({ method: one.method, path: one.path })),
    serve,
    load,
    title,
    opening,
    tasksRead,
    tasksChanged,
    reconfigure,
    rediscover,
    forget,
    unload,
    setEnabled,
    config: () => extensionsConfig
  };
  return api;
}
