import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";
import { speak } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const source = (name) => readFileSync(join(HERE, "src/app", `${name}.js`), "utf8");

const st = await state();
await views();
const { extensionsViewModel, fieldOf, markOf, extensionStatusOf, extensionCardOf } = await app("extensions");
const plain = (value) => JSON.parse(JSON.stringify(value));

const one = (over = {}) => ({
  name: "pedtec-title", origin: "hub", dir: "/hub/extensions/pedtec-title", version: "1.0.0", description: "Prefixes the title with the request.",
  hooks: ["seat.title"], settings: { prefix: { type: "string", default: "p.t.", label: "prefix" } }, values: { prefix: "p.t." },
  enabled: true, loaded: true, on: true, changed: false, stale: false, reserved: false, shadowed: false, skipped: [], problems: [], ...over
});

function model(extensions, over = {}) {
  st.extensionsTrouble = "";
  st.extensions = extensions;
  st.extensionOpen = over.open ?? (extensions[0] ? `${extensions[0].origin}/${extensions[0].name}` : "");
  st.extensionTab = over.tab || "overview";
  return extensionsViewModel();
}

test("the list groups extensions by origin in the order the app discovers them, and says when a group is empty", () => {
  const m = model([one(), one({ name: "linear", origin: "built-in", dir: "/app/extensions/linear" }), one({ name: "rail-emoji", origin: "personal", hooks: [], loaded: false, on: false, problems: ["rail.icon is not a hook"] })]);
  assert.deepEqual(m.groups.map((g) => g.key), ["built-in", "hub", "personal"]);
  assert.deepEqual(m.groups.map((g) => g.rows.map((r) => r.name)), [["linear"], ["pedtec-title"], ["rail-emoji"]]);
  assert.equal(model([]).groups[0].none, "none ships with this build");
  assert.equal(model([]).groups[1].none, "nothing here yet");
  assert.equal(model([]).detail, null);
});

test("a row says in one line whether the extension runs, and why not when it does not", () => {
  assert.deepEqual(plain(extensionStatusOf(one())), { status: "on · seat.title", tone: "ok", trouble: false });
  assert.deepEqual(plain(extensionStatusOf(one({ enabled: false, on: false }))), { status: "off · seat.title", tone: "dim", trouble: false });
  assert.equal(extensionStatusOf(one({ reserved: true, on: false })).status, "reserved name — not loaded");
  assert.equal(extensionStatusOf(one({ shadowed: true, on: false })).tone, "dim");
  assert.equal(extensionStatusOf(one({ changed: true, enabled: false, loaded: false, on: false })).status, "changed on disk — turn it on again");
  assert.equal(extensionStatusOf(one({ loaded: false, on: false, problems: ["could not load index.mjs: boom"] })).status, "problem — not loaded");
  assert.equal(extensionStatusOf(one({ stale: true })).status, "on · reopen the app for the new code");
  assert.equal(extensionStatusOf(one({ skipped: ["seat.title"] })).status, "on · seat.title skipped after an error");
});

test("the switch on a row can only turn on a copy that could load; a reserved or shadowed one explains itself in the title", () => {
  const rows = model([one(), one({ name: "linear", origin: "hub", reserved: true, on: false, enabled: false })]).groups[1].rows;
  assert.equal(rows[0].canToggle, true);
  assert.equal(rows[0].toggleOn, true);
  assert.equal(rows[0].toggleSay, "turn pedtec-title off");
  assert.equal(model([one({ title: "Pedido tech no título" })]).groups[1].rows[0].toggleSay, "turn Pedido tech no título off", "the switch is named after what the screen shows");
  assert.equal(rows[1].canToggle, false);
  assert.match(rows[1].toggleTitle, /cannot be turned on/);
  assert.equal(rows[1].chip, "private");
  assert.equal(model([one({ origin: "built-in" })]).groups[0].rows[0].chip, "public");
});

test("the detail has three tabs, the settings tab builds its fields from the manifest, and the problems tab lists what the loader said", () => {
  const m = model([one({ problems: ["hub/pedtec-title: prefix should be a string"] })]);
  assert.deepEqual(plain(m.detail.tabs.map((t) => [t.key, t.count])), [["overview", ""], ["settings", 1], ["problems", 1]]);
  assert.equal(m.detail.tab, "overview");
  assert.equal(m.detail.overview.rows.find((r) => r.label === "origin").value, "/hub/extensions/pedtec-title");
  assert.deepEqual(plain(m.detail.settings.fields).map((f) => [f.key, f.label, f.type, f.value]), [["prefix", "prefix", "string", "p.t."]]);
  assert.deepEqual(plain(m.detail.problems.rows), ["hub/pedtec-title: prefix should be a string"]);
  const on = model([one()], { tab: "settings" });
  assert.equal(on.detail.tabs.find((t) => t.key === "settings").on, true);
  assert.equal(model([one({ settings: {}, values: {} })]).detail.settings.none, "this extension exposes no settings");
  assert.equal(model([one()]).detail.problems.none, "no problem since the app came up");
});

test("a title and an icon from the manifest reach the list and the head; the name stays in the overview", () => {
  const m = model([one({ title: "Pedido tech no título", icon: "i-hash" }), one({ name: "plain", icon: "i-does-not-exist" })]);
  const rows = m.groups[1].rows;
  assert.equal(rows[0].title, "Pedido tech no título");
  assert.equal(rows[0].icon, "i-hash", "a symbol the page has is used");
  assert.equal(rows[1].title, "plain");
  assert.equal(rows[1].icon, "", "a symbol the page does not have falls back on the letters");
  assert.equal(m.detail.title, "Pedido tech no título");
  assert.equal(m.detail.icon, "i-hash");
  assert.equal(m.detail.overview.rows[0].label, "name");
  assert.equal(m.detail.overview.rows[0].value, "pedtec-title");
  assert.equal(m.detail.overview.rows.find((r) => r.label === "routes"), undefined, "no routes, no row");
  const withRoutes = model([one({ hooks: ["routes"], routes: ["GET /api/ext/pedtec-title/mine", "POST /api/ext/pedtec-title/link"] })]);
  assert.equal(withRoutes.detail.overview.rows.find((r) => r.label === "routes").value, "GET /api/ext/pedtec-title/mine · POST /api/ext/pedtec-title/link");
});

test("a field carries description, placeholder and required from the manifest; a password never carries its value, only whether it is set; a dropdown carries its choices", () => {
  const ext = one({
    settings: {
      prefix: { type: "string", default: "p.t.", label: "prefix", description: "goes before the number", placeholder: "p.t.", required: false },
      token: { type: "password", default: "", label: "API token", description: "", placeholder: "lin_api_…", required: true },
      team: { type: "dropdown", default: "PED", label: "team", description: "", placeholder: "", required: false, data: [{ title: "Pedidos", value: "PED" }, { title: "Experiência", value: "EXP" }] }
    },
    values: { prefix: "pt-", team: "EXP" }, secrets: { token: false }, missing: ["token"], on: false
  });
  const prefix = plain(fieldOf(ext, "prefix", ext.settings.prefix));
  assert.equal(prefix.value, "pt-");
  assert.equal(prefix.description, "goes before the number");
  assert.equal(prefix.placeholder, "p.t.");
  assert.equal(prefix.required, false);
  const token = plain(fieldOf(ext, "token", ext.settings.token));
  assert.equal(token.value, "");
  assert.equal(token.set, false);
  assert.equal(token.required, true);
  assert.equal(token.missing, true);
  assert.equal(token.placeholder, "lin_api_…");
  assert.equal(plain(fieldOf(one({ secrets: { token: true } }), "token", ext.settings.token)).placeholder, "set — type to replace");
  const team = plain(fieldOf(ext, "team", ext.settings.team));
  assert.equal(team.value, "EXP");
  assert.deepEqual(team.data.map((row) => row.value), ["PED", "EXP"]);
  assert.deepEqual(plain(extensionStatusOf(ext)), { status: "needs token before it runs", tone: "warn", trouble: false });
});

test("a mark is two letters from the name, and an origin has its colour", () => {
  assert.equal(markOf("pedtec-title"), "pt");
  assert.equal(markOf("linear"), "li");
  const m = model([one(), one({ name: "linear", origin: "built-in" }), one({ name: "mine", origin: "personal" })]);
  assert.equal(m.groups[0].rows[0].color, "var(--accent)");
  assert.equal(m.groups[1].rows[0].color, "var(--violet)");
  assert.equal(m.groups[2].rows[0].color, "var(--yellow)");
});

test("when the app could not read the extensions and holds none, the screen says so instead of an empty list", () => {
  st.extensions = [];
  st.extensionsTrouble = "the app could not read which extensions this machine holds";
  const m = extensionsViewModel();
  assert.equal(m.trouble, "the app could not read which extensions this machine holds");
  assert.deepEqual(m.groups, []);
});

test("the screen speaks portuguese where the person does", () => {
  speak("pt-BR");
  try {
    const m = model([one({ enabled: false, on: false })]);
    assert.equal(m.title, "Extensões");
    assert.equal(m.groups[1].label, "hub");
    assert.equal(m.groups[2].label, "pessoal · ~/.hive");
    assert.equal(m.groups[1].rows[0].status, "desligada · seat.title");
    assert.equal(m.detail.tabs[0].label, "visão geral");
  } finally { speak("en"); }
});

test("the panel is wired where every other panel is: the page, the palette, the actions, a chord and the run switch", () => {
  assert.match(page, /<section id="extensions" data-t hidden aria-label="Extensions/);
  assert.match(page, /#usage, #pod, #prs, #worktrees, #routines, #providers, #extensions \{ background: var\(--bg\); \}/);
  assert.match(page, /body\.look-dimension #extensions/);
  assert.match(source("palette"), /go: \(\) => run\("extensions"\)/);
  assert.match(source("palette"), /one\.name === "linear" && one\.on/, "the Linear section of the palette shows only while the linear extension is on");
  assert.match(source("palette"), /if \(!st\.extensionsAsked\) pullExtensions\(\)/, "opening the palette asks the app which extensions are on");
  assert.match(source("core"), /"accounts", "extensions", "usage"/);
  assert.match(source("core"), /extensions: "extensions — what this hive runs on top of the hive"/);
  assert.match(source("core"), /extensions: "shift\+e"/);
  assert.match(source("themes"), /case "extensions": return extensionsOnScreen\(\) \? closeExtensions\(\) : openExtensions\(\);/);
  assert.match(source("index"), /import "\.\/extensions\.js";/);
  assert.match(source("hold-numbers"), /if \(extensionsOnScreen\(\)\) \{\n\s+const m = whichAction\(e\);\n\s+if \(e\.key === "Escape" \|\| m\?\.action === "extensions"\)/, "Escape closes the panel and single keys do not leak while it is open");
  assert.match(page, /#extensions \.pv-item\.off \.pv-item-body \{ opacity: 1; \}/, "an extension that is off still reads at AA contrast");
  assert.match(readFileSync(join(HERE, "src/views.js"), "utf8"), /mountExtensions/);
});

const entry = (over = {}) => ({ name: "todoist", title: "Todoist", description: "your own tasks in Todoist", version: "1.0.0", hooks: ["tasks.read", "tasks.changed"], settings: { token: { type: "password", required: true } }, logo: "data:image/svg+xml;base64,AA==", newerHive: false, unknownHooks: [], installed: null, update: false, ...over });

function explore(extensions, over = {}) {
  st.extensionsView = "explore";
  st.catalog = { extensions };
  st.catalogTrouble = over.trouble || "";
  st.catalogOpen = over.open || "";
  st.catalogQuery = over.query || "";
  st.extensionBusy = over.busy || {};
  const m = model([]);
  st.extensionsView = "installed";
  return m;
}

test("the explore tab shows the catalog as cards whose button says what a click does", () => {
  assert.deepEqual(plain(explore([entry()]).tabs.map((t) => [t.key, t.on])), [["installed", false], ["explore", true]]);
  assert.deepEqual([extensionCardOf(entry()).state, extensionCardOf(entry()).action, extensionCardOf(entry()).primary], ["install", "install", true]);
  assert.deepEqual(plain(extensionCardOf(entry()).tags), ["tasks", "key"]);
  assert.equal(extensionCardOf(entry({ installed: { store: true } })).action, "open");
  assert.equal(extensionCardOf(entry({ installed: { store: true } })).chip, "installed");
  assert.equal(extensionCardOf(entry({ installed: { store: false } })).chip, "copied by hand");
  assert.equal(extensionCardOf(entry({ installed: { store: true }, update: true })).action, "update");
  const newer = extensionCardOf(entry({ newerHive: true, unknownHooks: ["calendar.read"] }));
  assert.equal(newer.disabled, true);
  assert.match(newer.newerSay, /calendar\.read/);
  st.extensionBusy = { todoist: "installing" };
  assert.equal(extensionCardOf(entry()).action, "installing…");
  st.extensionBusy = {};
});

test("the search narrows the cards, an empty search says so, and a catalog that failed offers to try again", () => {
  const two = [entry(), entry({ name: "linear", title: "Linear", description: "issues" })];
  assert.deepEqual(explore(two, { query: "lin" }).store.cards.map((c) => c.name), ["linear"]);
  assert.equal(explore(two, { query: "zzz" }).store.none, "no extension matches zzz");
  assert.equal(explore([entry({ installed: { store: true } })]).store.all, true);
  const down = explore([], { trouble: "could not read the catalog: 503" });
  assert.equal(down.store.trouble, "could not read the catalog: 503");
  assert.equal(down.store.retry, "try again");
});

test("a card opens a detail that says in plain words what the extension can do, and warns before installing", () => {
  const d = explore([entry()], { open: "todoist" }).store.detail;
  assert.deepEqual(plain(d.can), ["read and write your own tasks when you open them", "hear about every task you write in the hive", "asks for a key, kept out of the config file"]);
  assert.match(d.trust, /same reach the hive has on your machine/);
  assert.equal(d.where, "from the catalog · not on this machine yet");
});

test("only an extension installed from the catalog can be uninstalled, and the confirmation keeps the key unless asked", () => {
  assert.equal(model([one()]).detail.settings.uninstall, null);
  const store = { repo: "team/hive-extensions", commit: "c", version: "1.0.0" };
  const u = model([one({ origin: "personal", store, title: "Todoist" })]).detail.settings.uninstall;
  assert.equal(u.button, "uninstall Todoist");
  assert.equal(u.confirm, null);
  assert.equal(model([one({ origin: "personal", store })]).groups[2].rows[0].chip, "catalog");
  st.extensionConfirm = { name: "pedtec-title", forget: false };
  const asked = model([one({ origin: "personal", store, title: "Todoist" })]).detail.settings.uninstall.confirm;
  assert.equal(asked.title, "uninstall Todoist?");
  assert.equal(asked.forget, false);
  assert.match(asked.keepSay, /picks up where it stopped/);
  st.extensionConfirm = null;
});

test("the store reads the catalog and installs through the app's own routes", () => {
  const code = source("extensions");
  assert.match(code, /\/api\/extensions\/catalog/);
  assert.match(code, /\/api\/extensions\/install/);
  assert.match(code, /\/api\/extensions\/uninstall/);
});
