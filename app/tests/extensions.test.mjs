import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRegistry, createStorage, discover, readManifest, cleanSettingValues, splitSettingValues, moduleHash, enabledByConfig, routePathOf, HOOKS } from "../lib/extensions.mjs";
import { cleanExtensions, cleanPatch } from "../lib/config.mjs";
import { registerExtensionRoutes } from "../routes/extensions.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

const MANIFEST = (name, extra = {}) => JSON.stringify({ name, version: "1.0.0", description: `the ${name} extension`, hooks: ["seat.title"], ...extra });

async function plant(root, name, { manifest = MANIFEST(name), module = "" } = {}) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  if (manifest !== null) await writeFile(join(dir, "extension.json"), manifest);
  if (module !== null) await writeFile(join(dir, "index.mjs"), module);
  return dir;
}

async function roots() {
  const base = await mkdtemp(join(tmpdir(), "hive-ext-"));
  const dirs = { "built-in": join(base, "app"), hub: join(base, "hub"), personal: join(base, "home") };
  for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });
  return { base, dirs, list: Object.entries(dirs).map(([origin, dir]) => ({ origin, dir })), done: () => rm(base, { recursive: true, force: true }) };
}

const TITLE_MODULE = (mark) => `export default function (hive) { hive.on("seat.title", ({ title, settings }) => \`\${settings.prefix || "${mark}"}\${title}\`); }`;

const seats = () => [
  { name: "anular-liga", where: "local", title: "anular sessões da liga", errand: "PED-430 anular liga" },
  { name: "tema-branco", where: "local", title: "tema branco padrão", errand: "" }
];

test("a manifest reads when it has a name, a version and known hooks, and says what is off otherwise", () => {
  const good = readManifest(MANIFEST("pedtec-title", { settings: { prefix: { type: "string", default: "p.t.", label: "prefix" }, loud: { type: "boolean" } } }), "hub/pedtec-title");
  assert.deepEqual(good.problems, []);
  assert.equal(good.manifest.name, "pedtec-title");
  assert.deepEqual(good.manifest.hooks, ["seat.title"]);
  assert.deepEqual(good.manifest.settings.prefix, { type: "string", default: "p.t.", label: "prefix", description: "", placeholder: "", required: false });
  assert.deepEqual(good.manifest.settings.loud, { type: "boolean", default: false, label: "loud", description: "", placeholder: "", required: false });
  assert.equal(good.manifest.title, "pedtec-title", "the title falls back on the name");
  assert.equal(good.manifest.icon, "");

  const bad = readManifest(JSON.stringify({ name: "Rail Emoji", version: 1, hooks: ["seat.title", "rail.icon"], settings: { prefix: { type: "colour" } } }), "personal/rail-emoji");
  assert.equal(bad.manifest, null);
  assert.match(bad.problems.join("\n"), /name should be lowercase/);
  assert.match(bad.problems.join("\n"), /version should be/);
  assert.match(bad.problems.join("\n"), /rail\.icon is not a hook this hive knows/);
  assert.match(bad.problems.join("\n"), /settings\.prefix\.type should be/);
  assert.match(readManifest("{ nope", "x").problems[0], /not valid JSON/);
  assert.match(readManifest(JSON.stringify({ name: "a", version: "1", hooks: [] }), "x").problems.join("\n"), /at least one of/);
});

test("setting values come from the config on top of the manifest defaults, and a value of the wrong type or an unknown key is a problem, not a crash", () => {
  const manifest = readManifest(MANIFEST("p", { settings: { prefix: { type: "string", default: "p.t." }, max: { type: "number", default: 3 } } }), "x").manifest;
  assert.deepEqual(cleanSettingValues(undefined, manifest, "x"), { settings: { prefix: "p.t.", max: 3 }, problems: [], missing: [] });
  const read = cleanSettingValues({ prefix: 5, max: 7, other: true }, manifest, "hub/p");
  assert.deepEqual(read.settings, { prefix: "p.t.", max: 7 });
  assert.deepEqual(read.problems, ["hub/p: prefix should be a string", "hub/p: other is not a setting this extension declares"]);
});

test("a manifest can name a title and an icon, and describe each setting: description, placeholder, required, a dropdown with choices, a password without default", () => {
  const good = readManifest(MANIFEST("linear", { title: "Linear", icon: "i-plug", settings: {
    token: { type: "password", label: "API token", required: true, placeholder: "lin_api_…", description: "from linear.app settings" },
    team: { type: "dropdown", data: [{ title: "Pedidos", value: "PED" }, { title: "Experiência", value: "EXP" }], default: "EXP" },
    tag: { type: "dropdown", data: ["a", "b"] }
  } }), "x");
  assert.deepEqual(good.problems, []);
  assert.equal(good.manifest.title, "Linear");
  assert.equal(good.manifest.icon, "i-plug");
  assert.deepEqual(good.manifest.settings.token, { type: "password", default: "", label: "API token", description: "from linear.app settings", placeholder: "lin_api_…", required: true });
  assert.deepEqual(good.manifest.settings.team.data, [{ title: "Pedidos", value: "PED" }, { title: "Experiência", value: "EXP" }]);
  assert.equal(good.manifest.settings.team.default, "EXP");
  assert.equal(good.manifest.settings.tag.default, "a", "a dropdown without default takes its first choice");

  const bad = readManifest(MANIFEST("x", { title: 3, icon: "plug.png", settings: {
    token: { type: "password", default: "nope" }, team: { type: "dropdown", data: [] }, other: { type: "dropdown", data: [{ value: "a" }], default: "z" }
  } }), "hub/x");
  assert.equal(bad.manifest, null);
  assert.match(bad.problems.join("\n"), /title should be a short line/);
  assert.match(bad.problems.join("\n"), /icon should be the id of one of the app's symbols/);
  assert.match(bad.problems.join("\n"), /token is a password and cannot have a default/);
  assert.match(bad.problems.join("\n"), /team\.data should list the choices/);
  assert.match(bad.problems.join("\n"), /other\.default should be one of its choices/);
});

test("a password never lives in the config: its value comes from the secrets, and a required setting still empty is listed as missing", () => {
  const manifest = readManifest(MANIFEST("linear", { settings: { token: { type: "password", required: true }, team: { type: "dropdown", data: [{ value: "PED" }, { value: "EXP" }], required: true } } }), "x").manifest;
  const empty = cleanSettingValues(undefined, manifest, "hub/linear");
  assert.deepEqual(empty.settings, { token: "", team: "PED" });
  assert.deepEqual(empty.missing, ["token"], "the dropdown has a first choice; the password has nothing");
  const held = cleanSettingValues({ token: "in-the-config", team: "nope" }, manifest, "hub/linear", { token: "lin_api_1" });
  assert.equal(held.settings.token, "lin_api_1");
  assert.deepEqual(held.missing, []);
  assert.deepEqual(held.problems, ["hub/linear: token is a password and does not live in config.jsonc — set it from the panel", "hub/linear: team should be one of PED, EXP"]);
  assert.deepEqual(splitSettingValues({ token: "t", team: "EXP" }, manifest), { plain: { team: "EXP" }, secrets: { token: "t" } });
});

test("an extension whose required setting is empty is discovered and loaded, but does not run until it is set; the secrets file is written mode 0600", async () => {
  const at = await roots();
  const secretsFile = join(at.base, "secrets.json");
  await plant(at.dirs.hub, "needs-token", { manifest: MANIFEST("needs-token", { settings: { token: { type: "password", required: true }, prefix: { type: "string", default: "t:" } } }), module: `export default function (hive) { hive.on("seat.title", ({ title, settings }) => settings.prefix + settings.token.length + ":" + title); }` });
  const registry = await createRegistry({ roots: at.list, config: { "needs-token": { enabled: true } }, secretsFile }).load();
  let row = registry.list()[0];
  assert.equal(row.loaded, true);
  assert.equal(row.on, false);
  assert.deepEqual(row.missing, ["token"]);
  assert.deepEqual(row.secrets, { token: false });
  assert.deepEqual(row.values, { prefix: "t:" }, "the password is not in the values the panel receives");
  assert.match(row.problems[0], /needs token before it runs/);
  assert.equal(registry.title(seats())[0].title, "anular sessões da liga");

  const clean = registry.cleanSettings("needs-token", { token: "lin_api_12345", prefix: "p:" });
  assert.deepEqual(clean, { settings: { prefix: "p:" }, secrets: { token: "lin_api_12345" }, problems: [] });
  assert.deepEqual(registry.setSecrets("needs-token", clean.secrets), { ok: true });
  registry.reconfigure({ "needs-token": { enabled: true, settings: clean.settings } });
  row = registry.list()[0];
  assert.equal(row.on, true);
  assert.deepEqual(row.secrets, { token: true });
  assert.equal(registry.title(seats())[0].title, "p:13:anular sessões da liga");
  const { statSync } = await import("node:fs");
  assert.equal(statSync(secretsFile).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await readFile(secretsFile, "utf8")), { "needs-token": { token: "lin_api_12345" } });
  registry.setSecrets("needs-token", { token: "" });
  assert.deepEqual(registry.list()[0].secrets, { token: false }, "an empty password removes it");
  await at.done();
});

test("hive.storage is json private to one extension, kept on disk, and hive.paths.support is its own folder", async () => {
  const at = await roots();
  const stateDir = join(at.base, "state");
  const KEEP = (name) => `export default function (hive) { hive.on("seat.title", ({ title }) => { const n = (hive.storage.get("runs") || 0) + 1; hive.storage.set("runs", n); hive.storage.set("who", { name: hive.name, support: hive.paths.support }); return title + " ${name}" + n; }); }`;
  await plant(at.dirs.hub, "one", { module: KEEP("one") });
  await plant(at.dirs.hub, "two", { module: `export default function (hive) { hive.on("seat.title", ({ title }) => title + " two" + (hive.storage.get("runs") ?? "-")); }` });
  const registry = await createRegistry({ roots: at.list, config: { one: { enabled: true }, two: { enabled: true } }, stateDir }).load();
  assert.equal(registry.title([{ name: "a", where: "local", title: "t" }])[0].title, "t one1 two-", "two does not see what one stored");
  assert.deepEqual(JSON.parse(await readFile(join(stateDir, "one.json"), "utf8")), { runs: 1, who: { name: "one", support: join(stateDir, "one") } });
  assert.ok(existsSync(join(stateDir, "one")), "the support folder exists");
  const again = await createRegistry({ roots: at.list, config: { one: { enabled: true } }, stateDir }).load();
  assert.equal(again.title([{ name: "b", where: "local", title: "t" }])[0].title, "t one2", "storage survives a new app run");
  await at.done();
});

test("storage refuses what is not json, an odd key, and more than it should hold", () => {
  const storage = createStorage("");
  storage.set("last-run", { at: 1, list: [1, 2] });
  assert.deepEqual(storage.get("last-run"), { at: 1, list: [1, 2] });
  storage.get("last-run").list.push(3);
  assert.deepEqual(storage.get("last-run").list, [1, 2], "what comes out is a copy");
  assert.throws(() => storage.set("fn", () => {}), /storage keeps json/);
  assert.throws(() => storage.set("bad key!", 1), /a storage key is a short word/);
  assert.throws(() => storage.set("big", "x".repeat(300 * 1024)), /at most 256 KB/);
  storage.remove("last-run");
  assert.deepEqual(storage.all(), {});
});

test("discovery walks built-in, hub and personal in that order, reserves built-in names and lets a personal copy shadow the hub's", async () => {
  const at = await roots();
  await plant(at.dirs["built-in"], "linear", { module: "export default () => {}" });
  await plant(at.dirs.hub, "linear", { module: "export default () => {}" });
  await plant(at.dirs.hub, "pedtec-title", { module: TITLE_MODULE("hub:") });
  await plant(at.dirs.hub, "zeta", { module: "export default () => {}" });
  await plant(at.dirs.personal, "pedtec-title", { module: TITLE_MODULE("me:") });
  await plant(at.dirs.personal, "no-module", { module: null });
  await plant(at.dirs.personal, "Bad Name", { module: "export default () => {}" });
  const found = discover(at.list);
  assert.deepEqual(found.map((one) => `${one.origin}/${one.name}`), ["built-in/linear", "hub/linear", "hub/pedtec-title", "hub/zeta", "personal/Bad Name", "personal/no-module", "personal/pedtec-title"]);
  const hubLinear = found.find((one) => one.origin === "hub" && one.name === "linear");
  assert.ok(hubLinear.reserved);
  assert.match(hubLinear.problems[0], /belongs to a built-in extension/);
  const hubPed = found.find((one) => one.origin === "hub" && one.name === "pedtec-title");
  assert.ok(hubPed.shadowed);
  assert.match(hubPed.problems[0], /shadowed by the personal copy/);
  assert.ok(!found.find((one) => one.origin === "personal" && one.name === "pedtec-title").shadowed);
  assert.match(found.find((one) => one.name === "no-module").problems[0], /no index\.mjs/);
  assert.match(found.find((one) => one.name === "Bad Name").problems[0], /folder should be lowercase/);
  assert.equal(found.find((one) => one.name === "zeta").hash, moduleHash("export default () => {}"));
  await at.done();
});

test("built-in extensions are on unless turned off; hub and personal ones are off until turned on, and off again when the module changed since", () => {
  const builtIn = { name: "linear", origin: "built-in", hash: "aaaa" };
  const hub = { name: "pedtec-title", origin: "hub", hash: "bbbb" };
  assert.deepEqual(enabledByConfig(builtIn, {}), { enabled: true, changed: false });
  assert.deepEqual(enabledByConfig(builtIn, { linear: { enabled: false } }), { enabled: false, changed: false });
  assert.deepEqual(enabledByConfig(hub, {}), { enabled: false, changed: false });
  assert.deepEqual(enabledByConfig(hub, { "pedtec-title": { enabled: true } }), { enabled: true, changed: false });
  assert.deepEqual(enabledByConfig(hub, { "pedtec-title": { enabled: true, hash: "bbbb" } }), { enabled: true, changed: false });
  assert.deepEqual(enabledByConfig(hub, { "pedtec-title": { enabled: true, hash: "old1" } }), { enabled: false, changed: true });
});

test("the config keeps enabled, hash and scalar settings per extension, and reports the rest apart", () => {
  const problems = [];
  const clean = cleanExtensions({ "pedtec-title": { enabled: true, hash: "0123456789abcdef", settings: { prefix: "p.t.", max: 2, loud: false, deep: {} } }, "Bad Name": {}, linear: "off", zeta: { enabled: "yes" } }, "file", problems);
  assert.deepEqual(clean, { "pedtec-title": { enabled: true, hash: "0123456789abcdef", settings: { prefix: "p.t.", max: 2, loud: false } }, zeta: {} });
  assert.deepEqual(problems, [
    "file: extensions.pedtec-title.settings.deep should be a string, a number or true/false",
    "file: extensions.Bad Name is not a name an extension can have",
    "file: extensions.linear should be an object with enabled and settings",
    "file: extensions.zeta.enabled should be true or false"
  ]);
  assert.deepEqual(cleanPatch({ extensions: { linear: { enabled: false } } }).clean, { extensions: { linear: { enabled: false } } });
});

test("seat.title decorates what the desktop shows, in discovery order, each extension receiving what the one before returned", async () => {
  const at = await roots();
  await plant(at.dirs.hub, "a-first", { module: TITLE_MODULE("a:") });
  await plant(at.dirs.hub, "b-second", { module: TITLE_MODULE("b:") });
  await plant(at.dirs.personal, "c-third", { module: TITLE_MODULE("c:") });
  const registry = await createRegistry({ roots: at.list, config: { "a-first": { enabled: true }, "b-second": { enabled: true }, "c-third": { enabled: true } } }).load();
  const shown = registry.title(seats());
  assert.equal(shown[0].title, "c:b:a:anular sessões da liga");
  assert.equal(shown[1].title, "c:b:a:tema branco padrão");
  assert.ok(shown[0] !== seats()[0], "a decorated seat is a copy; the clean one is never written to");
  await at.done();
});

test("an extension that is off, reserved or shadowed never runs, and toggling on and off drops the cache so the rail follows at once", async () => {
  const at = await roots();
  await plant(at.dirs["built-in"], "core-mark", { module: TITLE_MODULE("core:") });
  await plant(at.dirs.hub, "core-mark", { module: TITLE_MODULE("hub-copy:") });
  await plant(at.dirs.hub, "pedtec-title", { module: TITLE_MODULE("p.t.") });
  const registry = await createRegistry({ roots: at.list, config: {} }).load();
  assert.equal(registry.title(seats())[0].title, "core:anular sessões da liga", "built-in is on by default; the hub copy of its name is reserved; the hub extension is off by default");

  const on = await registry.setEnabled("pedtec-title", true);
  assert.deepEqual(on, { ok: true, problems: [] });
  assert.equal(registry.title(seats())[0].title, "p.t.core:anular sessões da liga");
  assert.equal(registry.config()["pedtec-title"].hash, registry.hashOf("pedtec-title"), "turning it on records the module hash");

  await registry.setEnabled("pedtec-title", false);
  assert.equal(registry.title(seats())[0].title, "core:anular sessões da liga", "off again, the cached decoration is gone");

  const refused = await registry.setEnabled("core-mark", true);
  assert.equal(refused.ok, true, "the built-in one can be toggled");
  const rows = registry.list();
  assert.ok(rows.find((row) => row.origin === "hub" && row.name === "core-mark").reserved);
  await at.done();
});

test("an exception in a handler is isolated: the seat keeps its title, the problem is listed, and that hook is skipped until the extension is turned on again", async () => {
  const at = await roots();
  await plant(at.dirs.hub, "boom", { module: `let calls = 0; export default function (hive) { hive.on("seat.title", () => { calls += 1; globalThis.__boomCalls = calls; throw new Error("kaput"); }); }` });
  await plant(at.dirs.hub, "fine", { module: TITLE_MODULE("ok:") });
  const registry = await createRegistry({ roots: at.list, config: { boom: { enabled: true }, fine: { enabled: true } } }).load();
  const shown = registry.title(seats());
  assert.equal(shown[0].title, "ok:anular sessões da liga");
  assert.equal(shown[1].title, "ok:tema branco padrão");
  assert.equal(globalThis.__boomCalls, 1, "after the first throw the hook is not called again");
  const row = registry.list().find((one) => one.name === "boom");
  assert.deepEqual(row.skipped, ["seat.title"]);
  assert.match(row.problems[0], /seat\.title threw \(kaput\) — skipped until/);
  await registry.setEnabled("boom", true);
  registry.title(seats());
  assert.equal(globalThis.__boomCalls, 2, "turning it on again gives the hook another go");
  delete globalThis.__boomCalls;
  await at.done();
});

test("a module that throws on import, or exports no function, or registers a hook it did not declare, is a problem and not a crash", async () => {
  const at = await roots();
  await plant(at.dirs.hub, "throws", { module: `throw new Error("no good");` });
  await plant(at.dirs.hub, "no-default", { module: `export const x = 1;` });
  await plant(at.dirs.hub, "undeclared", { module: `export default function (hive) { hive.on("seat.opening", async () => ({})); hive.on("rail.icon", () => {}); }` });
  const registry = await createRegistry({ roots: at.list, config: { throws: { enabled: true }, "no-default": { enabled: true }, undeclared: { enabled: true } } }).load();
  const rows = Object.fromEntries(registry.list().map((row) => [row.name, row]));
  assert.match(rows.throws.problems[0], /could not load index\.mjs: no good/);
  assert.equal(rows.throws.loaded, false);
  assert.match(rows["no-default"].problems[0], /should export a default function/);
  assert.match(rows.undeclared.problems.join("\n"), /seat\.opening is not declared in extension\.json/);
  assert.match(rows.undeclared.problems.join("\n"), /rail\.icon is not a hook this hive knows/);
  assert.equal(rows.undeclared.loaded, true);
  assert.deepEqual(registry.title(seats()).map((s) => s.title), seats().map((s) => s.title));
  await at.done();
});

test("seat.opening enriches the request in order, within a budget, and a slow extension is left behind without stopping the seat", async () => {
  const at = await roots();
  const OPENING = (name, ms) => `export default function (hive) { hive.on("seat.opening", async ({ body, prompt, settings }) => { await new Promise((r) => setTimeout(r, ${ms})); return { body: { errand: (body.errand || "") + "+${name}" }, prompt: prompt + " ${name}", name: "${name}-seat" }; }); }`;
  const manifest = (name) => MANIFEST(name, { hooks: ["seat.opening"] });
  await plant(at.dirs.hub, "quick", { manifest: manifest("quick"), module: OPENING("quick", 0) });
  await plant(at.dirs.hub, "slow", { manifest: manifest("slow"), module: OPENING("slow", 200) });
  await plant(at.dirs.hub, "third", { manifest: manifest("third"), module: OPENING("third", 0) });
  const registry = await createRegistry({ roots: at.list, config: { quick: { enabled: true }, slow: { enabled: true }, third: { enabled: true } }, openingBudgetMs: 40 }).load();
  const opened = await registry.opening({ body: { errand: "PED-1", title: "" }, prompt: "do it" });
  assert.equal(opened.changed, true);
  assert.equal(opened.prompt, "do it quick third");
  assert.equal(opened.body.errand, "PED-1+quick+third");
  assert.equal(opened.body.title, "");
  assert.equal(opened.name, "third-seat");
  const slow = registry.list().find((row) => row.name === "slow");
  assert.match(slow.problems[0], /took longer than 40 ms — the seat opened without it/);
  assert.deepEqual(slow.skipped, [], "a timeout is not a throw: the next seat gets another try");
  await at.done();
});

test("a setting that does not match the manifest is a problem on the extension, and the default holds", async () => {
  const at = await roots();
  await plant(at.dirs.hub, "pedtec-title", { manifest: MANIFEST("pedtec-title", { settings: { prefix: { type: "string", default: "p.t." } } }), module: TITLE_MODULE("x") });
  const registry = await createRegistry({ roots: at.list, config: { "pedtec-title": { enabled: true, settings: { prefix: 7 } } } }).load();
  assert.equal(registry.title(seats())[0].title, "p.t.anular sessões da liga");
  const row = registry.list().find((one) => one.name === "pedtec-title");
  assert.deepEqual(row.values, { prefix: "p.t." });
  assert.match(row.problems[0], /prefix should be a string/);
  registry.reconfigure({ "pedtec-title": { enabled: true, settings: { prefix: "pt-" } } });
  assert.equal(registry.title(seats())[0].title, "pt-anular sessões da liga", "a new config drops the cache");
  await at.done();
});

test("a module that changed on disk since it was turned on is not loaded, and one that changed since it was loaded shows as stale", async () => {
  const at = await roots();
  const dir = await plant(at.dirs.hub, "pedtec-title", { module: TITLE_MODULE("v1:") });
  const first = moduleHash(TITLE_MODULE("v1:"));
  const off = await createRegistry({ roots: at.list, config: { "pedtec-title": { enabled: true, hash: "0000000000000000" } } }).load();
  const row = off.list()[0];
  assert.equal(row.enabled, false);
  assert.equal(row.changed, true);
  assert.equal(row.loaded, false);
  assert.equal(off.title(seats())[0].title, "anular sessões da liga");

  const on = await createRegistry({ roots: at.list, config: { "pedtec-title": { enabled: true, hash: first } } }).load();
  assert.equal(on.list()[0].stale, false);
  await writeFile(join(dir, "index.mjs"), TITLE_MODULE("v2:"));
  assert.equal(on.list()[0].stale, true, "the running code is still v1; the file is not");
  assert.equal(on.title(seats())[0].title, "v1:anular sessões da liga");
  await at.done();
});

const ROUTES_MODULE = `export default function (hive) {
  hive.on("routes", (on) => {
    on("GET", "/api/ext/api-one/mine", async ({ settings, storage }) => { storage.set("hits", (storage.get("hits") || 0) + 1); return { mine: [settings.prefix], hits: storage.get("hits") }; });
    on("POST", "/api/ext/api-one/echo", async ({ body }) => { if (!body.say) throw hive.refuse(400, "say something"); return { said: body.say }; });
    on(null, "/api/ext/api-one/any", async ({ method }) => ({ method }));
    on("GET", "/api/ext/api-one/boom", async () => { throw new Error("kaput"); });
    on("GET", "/api/ext/other/steal", async () => ({}));
    on("GET", "/api/linear/mine", async () => ({}));
    on("PUT", "/api/ext/api-one/put", async () => ({}));
    on("GET", "/api/ext/api-one/mine", async () => ({ twice: true }));
    on("GET", "/api/ext/api-one/../escape", async () => ({}));
    on("GET", "/api/ext/api-one/no-fn", "nope");
  });
}`;

function door(registry) {
  return async (method, path, body = {}) => {
    const answers = [];
    const url = new URL(`http://hive${path}`);
    const served = await registry.serve({ method, body }, {}, url, (value, status = 200) => answers.push({ value, status }));
    return { served, ...(answers[0] || {}) };
  };
}

test("a route path belongs to its extension under /api/ext/<name>/ and nowhere else", () => {
  assert.deepEqual(routePathOf("linear", "/api/ext/linear/mine"), { path: "/api/ext/linear/mine" });
  assert.match(routePathOf("linear", "/api/linear/mine").error, /lives under \/api\/ext\/linear\//);
  assert.match(routePathOf("linear", "/api/ext/other/mine").error, /lives under/);
  assert.match(routePathOf("linear", "/api/ext/linear/../x").error, /not a path a route can have/);
  assert.match(routePathOf("linear", "/api/ext/linear/").error, /not a path a route can have/);
});

test("routes register under the extension's prefix only, answer json, refuse with a status, survive an exception, and go dark while the extension is off", async () => {
  const at = await roots();
  await plant(at.dirs.hub, "api-one", { manifest: MANIFEST("api-one", { hooks: ["routes"], settings: { prefix: { type: "string", default: "p." } } }), module: ROUTES_MODULE });
  const registry = await createRegistry({ roots: at.list, config: { "api-one": { enabled: true, settings: { prefix: "x." } } }, stateDir: join(at.base, "state"), bodyOf: async (req) => req.body }).load();
  const row = registry.list()[0];
  assert.deepEqual(row.routes, ["GET /api/ext/api-one/mine", "POST /api/ext/api-one/echo", "ANY /api/ext/api-one/any", "GET /api/ext/api-one/boom"]);
  const said = row.problems.join("\n");
  assert.match(said, /\/api\/ext\/other\/steal is outside/);
  assert.match(said, /\/api\/linear\/mine is outside/);
  assert.match(said, /method should be GET, POST or null/);
  assert.match(said, /registered twice/);
  assert.match(said, /not a path a route can have/);
  assert.match(said, /needs a function/);
  assert.equal(row.on, true, "bad routes are problems, not a reason to stay off");

  const ask = door(registry);
  assert.deepEqual(await ask("GET", "/api/ext/api-one/mine"), { served: true, status: 200, value: { mine: ["x."], hits: 1 } });
  assert.deepEqual((await ask("GET", "/api/ext/api-one/mine")).value.hits, 2, "storage is the extension's own");
  assert.deepEqual(await ask("POST", "/api/ext/api-one/echo", { say: "hi" }), { served: true, status: 200, value: { said: "hi" } });
  assert.deepEqual(await ask("POST", "/api/ext/api-one/echo", {}), { served: true, status: 400, value: { error: "say something" } });
  assert.deepEqual((await ask("POST", "/api/ext/api-one/any")).value, { method: "POST" });
  assert.deepEqual((await ask("GET", "/api/ext/api-one/echo")).status, 404, "a POST route does not answer GET");
  assert.deepEqual((await ask("GET", "/api/ext/api-one/nope")).status, 404);
  assert.deepEqual((await ask("GET", "/api/ext/nobody/x")).status, 404);
  assert.equal((await ask("GET", "/api/linear/mine")).served, false, "outside the prefix the door belongs to the app");

  const boom = await ask("GET", "/api/ext/api-one/boom");
  assert.equal(boom.status, 500);
  assert.match(registry.list()[0].problems.join("\n"), /GET \/api\/ext\/api-one\/boom threw: kaput/);
  assert.equal((await ask("GET", "/api/ext/api-one/mine")).status, 200, "one bad request does not turn the extension off");
  assert.deepEqual(registry.list()[0].skipped, []);

  await registry.setEnabled("api-one", false);
  assert.deepEqual(await ask("GET", "/api/ext/api-one/mine"), { served: true, status: 404, value: { error: "api-one is off" } });
  await registry.setEnabled("api-one", true);
  assert.equal((await ask("GET", "/api/ext/api-one/mine")).status, 200);
  await at.done();
});

test("an extension that declares routes but does not register the hook, or throws while registering, is a problem and answers 404", async () => {
  const at = await roots();
  await plant(at.dirs.hub, "quiet", { manifest: MANIFEST("quiet", { hooks: ["routes"] }), module: "export default () => {}" });
  await plant(at.dirs.hub, "loud", { manifest: MANIFEST("loud", { hooks: ["routes"] }), module: `export default (hive) => hive.on("routes", () => { throw new Error("no routes for you"); })` });
  const registry = await createRegistry({ roots: at.list, config: { quiet: { enabled: true }, loud: { enabled: true } } }).load();
  const ask = door(registry);
  assert.equal((await ask("GET", "/api/ext/quiet/x")).status, 404);
  assert.match(registry.list().find((r) => r.name === "loud").problems.join("\n"), /routes threw while registering: no routes for you/);
  assert.deepEqual(registry.routesOf("loud"), []);
  await at.done();
});

function routeHarness(registry, held) {
  const routes = [];
  const writes = [];
  let config = { extensions: held };
  registerExtensionRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    bodyOf: async (req) => req.body,
    registry,
    readConfig: async () => ({ config }),
    writeConfig: async (patch) => { writes.push(patch); config = { ...config, ...cleanPatch(patch).clean }; return { config }; },
    invalidateFleetCache: () => { writes.push("invalidated"); }
  });
  const call = async (method, path, body = {}) => {
    const route = routes.find((one) => one.path === path && (one.method === null || one.method === method));
    const answers = [];
    await route.handler({ body }, {}, new URL(`http://hive${path}`), (value, status = 200) => answers.push({ value, status }));
    return answers[0];
  };
  return { routes, writes, call, config: () => config };
}

test("the toggle route writes the whole extensions map back, keeping the other extensions and the settings of this one", async () => {
  const at = await roots();
  await plant(at.dirs.hub, "pedtec-title", { manifest: MANIFEST("pedtec-title", { settings: { prefix: { type: "string", default: "p.t." } } }), module: TITLE_MODULE("x") });
  await plant(at.dirs.hub, "other", { manifest: MANIFEST("other", { settings: { token: { type: "password" } } }), module: TITLE_MODULE("o:") });
  await plant(at.dirs.hub, "two-plain", { manifest: MANIFEST("two-plain", { settings: { prefix: { type: "string", default: "p:" }, max: { type: "number", default: 3 } } }), module: TITLE_MODULE("t:") });
  const held = { other: { enabled: true, hash: "1111111111111111" }, "pedtec-title": { enabled: false, settings: { prefix: "pt-" } }, "two-plain": { enabled: false, settings: { prefix: "kept-" } } };
  const registry = await createRegistry({ roots: at.list, config: held }).load();
  const hive = routeHarness(registry, held);

  const on = await hive.call("POST", "/api/extensions/toggle", { name: "pedtec-title", enabled: true });
  assert.equal(on.status, 200);
  assert.equal(on.value.extension.on, true);
  assert.deepEqual(hive.config().extensions, {
    other: { enabled: true, hash: "1111111111111111" },
    "pedtec-title": { enabled: true, settings: { prefix: "pt-" }, hash: registry.hashOf("pedtec-title") },
    "two-plain": { enabled: false, settings: { prefix: "kept-" } }
  });
  assert.equal(registry.title(seats())[0].title, "pt-anular sessões da liga");

  const off = await hive.call("POST", "/api/extensions/toggle", { name: "pedtec-title", enabled: false });
  assert.equal(off.value.extension.on, false);
  assert.equal(registry.title(seats())[0].title, "anular sessões da liga");

  assert.equal((await hive.call("POST", "/api/extensions/toggle", { name: "nope", enabled: true })).status, 404);
  assert.equal((await hive.call("POST", "/api/extensions/toggle", { name: "other", enabled: "yes" })).status, 400);

  const settings = await hive.call("POST", "/api/extensions/settings", { name: "pedtec-title", settings: { prefix: "p.t." } });
  assert.equal(settings.status, 200);
  assert.deepEqual(hive.config().extensions["pedtec-title"], { enabled: false, settings: { prefix: "p.t." }, hash: registry.hashOf("pedtec-title") });
  const two = await hive.call("POST", "/api/extensions/settings", { name: "two-plain", settings: { max: 7 } });
  assert.equal(two.status, 200);
  assert.deepEqual(hive.config().extensions["two-plain"].settings, { prefix: "kept-", max: 7 }, "saving one setting keeps the other one as it was, not as the manifest default");
  const secret = await hive.call("POST", "/api/extensions/settings", { name: "other", settings: { token: "sh-123" } });
  assert.equal(secret.status, 200);
  assert.deepEqual(hive.config().extensions.other, { enabled: true, hash: "1111111111111111", settings: {} }, "the password did not go to the config");
  assert.deepEqual(secret.value.extension.secrets, { token: true });
  assert.deepEqual(secret.value.extension.values, {});
  const wrong = await hive.call("POST", "/api/extensions/settings", { name: "pedtec-title", settings: { prefix: 1 } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.value.error, /prefix should be a string/);

  const listed = await hive.call("GET", "/api/extensions");
  assert.deepEqual(listed.value.extensions.map((row) => row.name), ["other", "pedtec-title", "two-plain"]);
  assert.ok(hive.writes.includes("invalidated"));
  await at.done();
});

test("the server wires the registry where the RFC says: the seat list, the birth of a seat, and the routes", () => {
  const server = readFileSync(join(HERE, "server.mjs"), "utf8");
  assert.match(server, /registerExtensionRoutes\(on, \{/, "the routes are registered");
  const collect = server.slice(server.indexOf("async function collect()"), server.indexOf("const data = {", server.indexOf("async function collect()")));
  assert.match(collect, /extensions\.title\(withErrands\(sessions, errands\)/, "titles are decorated after errands are known, so the hook sees the errand");
  const runJob = server.slice(server.indexOf("async function runJob(job, body)"), server.indexOf("async function runJob(job, body)") + 2500);
  assert.match(runJob, /await extensions\.opening\(\{ body, prompt \}\)/, "the birth of a seat passes through seat.opening");
  assert.equal(server.includes("linear.enrich("), false, "the Linear enrichment is an extension now, not a line in the core");
  assert.equal(server.includes("routes/linear.mjs"), false);
  assert.ok(!existsSync(join(HERE, "lib/linear.mjs")) && !existsSync(join(HERE, "routes/linear.mjs")) && !existsSync(join(HERE, "extensions/linear")) && !existsSync(join(HERE, "../extensions")), "nothing of Linear stays in this repository — it lives in hive-extensions");
  assert.match(readFileSync(join(HERE, "extensions/README.md"), "utf8"), /README at the root\]\(\.\.\/\.\.\/README\.md#extensions\)/, "the contract points at where the public extensions are named, without naming a company itself");
  assert.match(readFileSync(join(HERE, "../README.md"), "utf8"), /hive-extensions/, "the root README names the public extensions repository");
  assert.match(server, /extensions: cleanExtensions\(raw\.extensions/, "readConfig reads the extensions key");
  const answer = server.slice(server.indexOf("const answer = async (req, res)"), server.indexOf("const hit = routes.find("));
  assert.match(answer, /url\.pathname\.startsWith\("\/api\/ext\/"\) && await extensions\.serve\(req, res, url, json\)/, "the door hands /api/ext/ to the extensions before the app's own routes");
  assert.match(server, /bodyOf: body,\n  hubDir: HUB,\n  log: console\.log\n\}\)\.load\(\)/, "the registry reads bodies with the app's own reader and knows the hub");
});

test("the README next to the built-in folder tells the same story the code does", () => {
  const readme = readFileSync(join(HERE, "extensions/README.md"), "utf8");
  for (const hook of HOOKS) assert.ok(readme.includes(`\`${hook}\``), `${hook} is documented`);
  assert.match(readme, /1500 ms/);
  assert.match(readme, /~\/\.hive\/extensions/);
  assert.match(readme, /<hub>\/extensions/);
});
