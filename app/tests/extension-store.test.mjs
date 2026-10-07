import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStore, safePath } from "../lib/extension-store.mjs";
import { createRegistry } from "../lib/extensions.mjs";
import { registerExtensionRoutes } from "../routes/extensions.mjs";

const COMMIT = "c".repeat(40);
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
const MODULE = 'export default function (hive) { hive.on("tasks.read", async () => {}); hive.on("tasks.changed", async () => {}); }';

const manifest = (name, over = {}) => JSON.stringify({ name, title: name[0].toUpperCase() + name.slice(1), version: "1.0.0", description: `the ${name} one`, hooks: ["tasks.read", "tasks.changed"], settings: { token: { type: "password", required: true } }, ...over });

function fakeGithub(files) {
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url);
    const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => body });
    if (url.endsWith("/commits/HEAD")) return ok({ sha: COMMIT });
    if (url.includes("/git/trees/")) return ok({ tree: Object.keys(files).map((path) => ({ path, type: "blob", size: files[path].length })) });
    const path = url.split(`/${COMMIT}/`)[1];
    if (path in files) return ok(files[path]);
    return { ok: false, status: 404 };
  };
  return { fetchImpl, asked };
}

const CATALOG = {
  "todoist/extension.json": manifest("todoist", { logo: "logo.svg" }),
  "todoist/index.mjs": MODULE,
  "todoist/logo.svg": LOGO,
  "todoist/todoist.test.mjs": "test",
  "future/extension.json": manifest("future", { hooks: ["tasks.read", "calendar.read"] }),
  "future/index.mjs": MODULE,
  "half/extension.json": manifest("half"),
  ".github/workflows/ci.yml": "x",
  "README.md": "x"
};

test("the catalog lists the folders that hold a manifest and a module, with the logo inline and the tests left out", async () => {
  const github = fakeGithub(CATALOG);
  const store = createStore({ repo: "team/hive-extensions", fetchImpl: github.fetchImpl });
  const catalog = await store.catalog();
  assert.equal(catalog.commit, COMMIT);
  assert.deepEqual(catalog.extensions.map((one) => one.name), ["future", "todoist"]);
  const todoist = catalog.extensions.find((one) => one.name === "todoist");
  assert.match(todoist.logo, /^data:image\/svg\+xml;base64,/);
  assert.deepEqual(todoist.files.map((one) => one.path).sort(), ["extension.json", "index.mjs", "logo.svg"]);
  assert.equal(todoist.newerHive, false);
  const future = catalog.extensions.find((one) => one.name === "future");
  assert.equal(future.newerHive, true);
  assert.deepEqual(future.unknownHooks, ["calendar.read"]);
  assert.equal(future.title, "Future", "an extension this hive cannot run still shows its name");
  const before = github.asked.length;
  await store.catalog();
  assert.equal(github.asked.length, before, "a second look inside ten minutes asks nobody");
});

test("a catalog that cannot be read says so, and one read before keeps showing with a warning", async () => {
  let down = false;
  const github = fakeGithub(CATALOG);
  const store = createStore({ repo: "team/hive-extensions", fetchImpl: async (url) => (down ? { ok: false, status: 503 } : github.fetchImpl(url)) });
  down = true;
  assert.match((await store.catalog()).error, /could not read the catalog/);
  down = false;
  await store.catalog({ fresh: true });
  down = true;
  const stale = await store.catalog({ fresh: true });
  assert.equal(stale.extensions.length, 2);
  assert.match(stale.warning, /503/);
  assert.match((await createStore({ repo: "" }).catalog()).error, /HIVE_EXTENSIONS_REPO/);
});

test("installing writes the folder and its mark, uninstalling takes only a folder the catalog put there", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hive-store-"));
  const store = createStore({ repo: "team/hive-extensions", personalDir: dir, fetchImpl: fakeGithub(CATALOG).fetchImpl });
  const catalog = await store.catalog();
  const todoist = catalog.extensions.find((one) => one.name === "todoist");
  assert.equal((await store.install(todoist, { commit: catalog.commit })).ok, true);
  assert.equal(readFileSync(join(dir, "todoist", "index.mjs"), "utf8"), MODULE);
  assert.equal(existsSync(join(dir, "todoist", "todoist.test.mjs")), false);
  assert.equal(JSON.parse(readFileSync(join(dir, "todoist", ".store.json"), "utf8")).commit, COMMIT);
  assert.match((await store.install(catalog.extensions.find((one) => one.name === "future"), { commit: catalog.commit })).error, /calendar\.read/);
  assert.equal(store.uninstall("todoist").ok, true);
  assert.equal(existsSync(join(dir, "todoist")), false);
  mkdirSync(join(dir, "todoist"));
  writeFileSync(join(dir, "todoist", "index.mjs"), "mine");
  assert.match((await store.install(todoist, { commit: catalog.commit })).error, /did not come from the catalog/);
  assert.match(store.uninstall("todoist").error, /not installed from the catalog/);
  assert.equal(readFileSync(join(dir, "todoist", "index.mjs"), "utf8"), "mine", "a copy made by hand is never touched");
});

test("a path from the catalog never climbs out of the extension's folder", () => {
  assert.equal(safePath("todoist/index.mjs"), true);
  assert.equal(safePath("todoist/lib/a.mjs"), true);
  assert.equal(safePath("todoist/../../.ssh/id_rsa"), false);
  assert.equal(safePath("index.mjs"), false);
  assert.equal(safePath("todoist/a b.mjs"), false);
});

function routes() {
  const home = mkdtempSync(join(tmpdir(), "hive-store-routes-"));
  const personal = join(home, "extensions");
  mkdirSync(personal);
  let config = {};
  const handlers = new Map();
  const registry = createRegistry({ roots: [{ origin: "personal", dir: personal }], stateDir: join(home, "state"), secretsFile: join(home, "secrets.json"), importModule: async () => ({ default: (hive) => { hive.on("tasks.read", async () => {}); hive.on("tasks.changed", async () => {}); } }) });
  const store = createStore({ repo: "team/hive-extensions", personalDir: personal, fetchImpl: fakeGithub(CATALOG).fetchImpl });
  registerExtensionRoutes((method, path, fn) => handlers.set(`${method || "ANY"} ${path}`, fn), {
    bodyOf: async (req) => req.body || {},
    registry,
    store,
    readConfig: async () => ({ config: { extensions: config } }),
    writeConfig: async (patch) => { config = patch.extensions; return { config: { extensions: config } }; }
  });
  const call = async (method, path, body) => {
    let answer;
    const url = new URL(`http://hive${path}`);
    await handlers.get(`${method} ${url.pathname}`)({ body }, {}, url, (value, status = 200) => { answer = { value, status }; });
    return answer;
  };
  return { call, registry, personal, config: () => config, home };
}

test("installing from the catalog turns the extension on without reopening the hive, and the catalog then says it is installed", async () => {
  const h = routes();
  const done = await h.call("POST", "/api/extensions/install", { name: "todoist" });
  assert.equal(done.status, 200);
  assert.equal(done.value.extension.enabled, true);
  assert.equal(done.value.extension.loaded, true);
  assert.deepEqual(done.value.extension.missing, ["token"]);
  assert.equal(done.value.extension.store.commit, COMMIT);
  assert.match(done.value.extension.logo, /^data:image\/svg/);
  assert.equal(h.config().todoist.enabled, true);
  const listed = await h.call("GET", "/api/extensions/catalog");
  const todoist = listed.value.extensions.find((one) => one.name === "todoist");
  assert.equal(todoist.installed.store, true);
  assert.equal(todoist.update, false);
  assert.equal("files" in todoist, false);
  assert.equal((await h.call("POST", "/api/extensions/install", { name: "future" })).status, 409);
  assert.equal((await h.call("POST", "/api/extensions/install", { name: "nope" })).status, 404);
});

test("uninstalling keeps the key unless asked to forget it, and refuses a copy made by hand", async () => {
  const h = routes();
  await h.call("POST", "/api/extensions/install", { name: "todoist" });
  h.registry.setSecrets("todoist", { token: "tok" });
  const gone = await h.call("POST", "/api/extensions/uninstall", { name: "todoist" });
  assert.equal(gone.status, 200);
  assert.equal(existsSync(join(h.personal, "todoist")), false);
  assert.equal(h.config().todoist.enabled, false);
  assert.equal(JSON.parse(readFileSync(join(h.home, "secrets.json"), "utf8")).todoist.token, "tok");
  await h.call("POST", "/api/extensions/install", { name: "todoist" });
  assert.deepEqual(h.registry.list().find((one) => one.name === "todoist").missing, [], "installed again, the key it kept is still there");
  await h.call("POST", "/api/extensions/uninstall", { name: "todoist", forget: true });
  assert.equal(h.config().todoist, undefined);
  assert.equal(JSON.parse(readFileSync(join(h.home, "secrets.json"), "utf8")).todoist, undefined);
  mkdirSync(join(h.personal, "mine"));
  writeFileSync(join(h.personal, "mine", "extension.json"), manifest("mine"));
  writeFileSync(join(h.personal, "mine", "index.mjs"), MODULE);
  h.registry.rediscover();
  assert.equal((await h.call("POST", "/api/extensions/uninstall", { name: "mine" })).status, 409);
  assert.equal(existsSync(join(h.personal, "mine")), true);
});
