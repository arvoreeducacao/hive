import { $, every, phrase, solidMounts, st, stopBeat } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { closePortaria, portariaOnScreen } from "./pod.js";
import { closeProviders, providersOnScreen } from "./providers.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

const EX_BEAT = 30000;

const ORIGIN_ORDER = ["built-in", "hub", "personal"];

const ORIGIN_COLOR = { "built-in": "var(--accent)", hub: "var(--violet)", personal: "var(--yellow)" };

st.extensions = [];

st.extensionsAsked = false;

st.extensionsTrouble = "";

st.extensionOpen = "";

st.extensionTab = "overview";

st.extensionsView = "installed";

st.catalog = null;

st.catalogTrouble = "";

st.catalogOpen = "";

st.catalogQuery = "";

st.extensionBusy = {};

st.extensionConfirm = null;

const HOOK_CAN = {
  "seat.title": "change the title the rail shows for a chat",
  "seat.opening": "change what goes into a new chat before it opens",
  routes: "answer at its own addresses inside the hive",
  "tasks.read": "read and write your own tasks when you open them",
  "tasks.changed": "hear about every task you write in the hive"
};

const HOOK_TAG = { "seat.title": "chat title", "seat.opening": "new chat", routes: "routes", "tasks.read": "tasks", "tasks.changed": "tasks" };

let extensionsSolid = null;

function extensionsOnScreen() {
  return !$("extensions").hidden;
}

const keyOf = (one) => `${one.origin}/${one.name}`;

function extensionOf(key) {
  return (st.extensions || []).find((one) => keyOf(one) === key) || null;
}

function markOf(name) {
  const words = String(name || "").split("-").filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : String(name || "").slice(0, 2)).toLowerCase();
}

function iconOf(one) {
  const icon = String(one.icon || "");
  return icon && document.getElementById(icon) ? icon : "";
}

function originSay(origin) {
  if (origin === "built-in") return phrase("built-in");
  if (origin === "hub") return "hub";
  return phrase("personal · ~/.hive");
}

function chipOf(one) {
  if (one.origin === "built-in") return phrase("public");
  if (one.store) return phrase("catalog");
  return phrase("private");
}

function statusOf(one) {
  const hooks = (one.hooks || []).join(", ");
  if (one.reserved) return { status: phrase("reserved name — not loaded"), tone: "warn", trouble: true };
  if (one.shadowed) return { status: phrase("shadowed by your copy — not loaded"), tone: "dim", trouble: false };
  if (one.changed) return { status: phrase("changed on disk — turn it on again"), tone: "warn", trouble: true };
  if (!one.hooks?.length || (one.enabled && !one.loaded)) return { status: phrase("problem — not loaded"), tone: "warn", trouble: true };
  if (one.missing?.length) return { status: phrase("needs {keys} before it runs", { keys: one.missing.join(", ") }), tone: "warn", trouble: false };
  if (one.on && one.stale) return { status: phrase("on · reopen the app for the new code"), tone: "warn", trouble: false };
  if (one.on && one.skipped?.length) return { status: phrase("on · {hook} skipped after an error", { hook: one.skipped.join(", ") }), tone: "warn", trouble: false };
  if (one.on) return { status: phrase("on · {hooks}", { hooks }), tone: "ok", trouble: false };
  return { status: phrase("off · {hooks}", { hooks }), tone: "dim", trouble: false };
}

function toggleShape(one) {
  const can = !one.reserved && !one.shadowed && !!one.hooks?.length;
  const shown = one.title || one.name;
  return {
    toggleOn: !!one.enabled,
    canToggle: can,
    toggleSay: one.enabled ? phrase("turn {name} off", { name: shown }) : phrase("turn {name} on", { name: shown }),
    toggleTitle: can ? (one.enabled ? phrase("off: nothing of it runs until it is on again") : phrase("on: the app records the module as it is now, and runs it from the next poll")) : phrase("this copy cannot be turned on — read the problems")
  };
}

function rowOf(one) {
  const { status, tone, trouble } = statusOf(one);
  return { key: keyOf(one), name: one.name, title: one.title || one.name, origin: one.origin, mark: markOf(one.name), icon: iconOf(one), logo: one.logo || "", color: ORIGIN_COLOR[one.origin] || "var(--txt-2)", chip: chipOf(one), status, tone, trouble, here: keyOf(one) === st.extensionOpen, on: !!one.on, ...toggleShape(one) };
}

function overviewOf(one) {
  const state = statusOf(one).status;
  return {
    description: one.description || phrase("this extension says nothing about itself"),
    rows: [
      { label: phrase("name"), value: one.name, mono: true },
      { label: phrase("origin"), value: one.dir || originSay(one.origin), mono: true },
      { label: phrase("version"), value: one.version || "—", mono: false },
      { label: "hooks", value: (one.hooks || []).join(", ") || "—", mono: true },
      ...((one.routes || []).length ? [{ label: "routes", value: one.routes.join(" · "), mono: true }] : []),
      { label: phrase("files"), value: "extension.json · index.mjs", mono: true },
      { label: phrase("state"), value: state, mono: false }
    ]
  };
}

function fieldOf(one, key, def) {
  const secret = def.type === "password";
  const set = secret ? !!one.secrets?.[key] : false;
  return {
    key, label: def.label || key, type: def.type, required: !!def.required, description: def.description || "",
    placeholder: secret ? (set ? phrase("set — type to replace") : def.placeholder || phrase("not set")) : def.placeholder || "",
    value: secret ? "" : one.values?.[key] ?? def.default,
    set,
    data: def.type === "dropdown" ? (def.data || []) : [],
    missing: (one.missing || []).includes(key),
    requiredSay: phrase("required")
  };
}

function uninstallOf(one) {
  if (!one.store) return null;
  const shown = one.title || one.name;
  const asked = st.extensionConfirm?.name === one.name;
  return {
    name: one.name,
    cap: phrase("uninstall"),
    say: phrase("takes the extension off this machine. what it already did stays where it is."),
    button: phrase("uninstall {name}", { name: shown }),
    busy: st.extensionBusy[one.name] === "uninstalling",
    busySay: phrase("uninstalling…"),
    confirm: asked ? {
      title: phrase("uninstall {name}?", { name: shown }),
      body: phrase("the folder leaves this machine and the extension stops right away."),
      forget: !!st.extensionConfirm.forget,
      forgetSay: phrase("also delete its key and what it kept"),
      keepSay: phrase("left unticked, installing it again picks up where it stopped."),
      cancel: phrase("cancel"),
      go: phrase("uninstall")
    } : null
  };
}

function settingsOf(one) {
  const fields = Object.entries(one.settings || {}).map(([key, def]) => fieldOf(one, key, def));
  return {
    uninstall: uninstallOf(one),
    sub: phrase("from the manifest's settings. what changes here goes to ~/.hive/config.jsonc, under extensions.{name}.settings; a password goes to ~/.hive/extension-secrets.json instead.", { name: one.name }),
    none: phrase("this extension exposes no settings"),
    fields
  };
}

function problemsOf(one) {
  return {
    rows: one.problems || [],
    none: phrase("no problem since the app came up"),
    sub: phrase("fix the file and turn the extension on again; the app never turns one back on by itself")
  };
}

function detailOf(one) {
  const { status, tone } = statusOf(one);
  const tabs = [
    { key: "overview", label: phrase("overview"), count: "" },
    { key: "settings", label: phrase("settings"), count: Object.keys(one.settings || {}).length || "" },
    { key: "problems", label: phrase("problems"), count: (one.problems || []).length || "" }
  ].map((tab) => ({ ...tab, on: tab.key === st.extensionTab }));
  return {
    name: one.name, title: one.title || one.name, mark: markOf(one.name), icon: iconOf(one), logo: one.logo || "", color: ORIGIN_COLOR[one.origin] || "var(--txt-2)", chip: chipOf(one), version: one.version,
    who: status, tone,
    checkSay: phrase("check again"), checkTitle: phrase("reads the folders again — a module that changed still needs the app reopened"),
    tabs, tab: st.extensionTab,
    overview: overviewOf(one), settings: settingsOf(one), problems: problemsOf(one),
    ...toggleShape(one)
  };
}

function canOf(entry) {
  const lines = [...new Set((entry.hooks || []).map((hook) => HOOK_CAN[hook]).filter(Boolean))].map((said) => phrase(said));
  if (Object.values(entry.settings || {}).some((def) => def.type === "password")) lines.push(phrase("asks for a key, kept out of the config file"));
  return lines;
}

function tagsOf(entry) {
  const tags = [...new Set((entry.hooks || []).map((hook) => HOOK_TAG[hook]).filter(Boolean))].map((said) => phrase(said));
  if (Object.values(entry.settings || {}).some((def) => def.type === "password")) tags.push(phrase("key"));
  return tags;
}

function cardOf(entry) {
  const busy = st.extensionBusy[entry.name] === "installing";
  const state = busy ? "installing" : entry.newerHive ? "newer" : entry.update ? "update" : entry.installed ? (entry.installed.store ? "installed" : "here") : "install";
  const action = {
    installing: phrase("installing…"),
    newer: phrase("needs a newer hive"),
    update: phrase("update"),
    installed: phrase("open"),
    here: phrase("open"),
    install: phrase("install")
  }[state];
  const chip = state === "installed" || state === "update" ? phrase("installed") : state === "here" ? phrase("copied by hand") : "";
  return {
    key: entry.name, name: entry.name, title: entry.title || entry.name, description: entry.description || phrase("this extension says nothing about itself"),
    version: entry.version || "", logo: entry.logo || "", mark: markOf(entry.name), tags: tagsOf(entry), state, action, chip,
    primary: state === "install" || state === "update", disabled: state === "installing" || state === "newer",
    newerSay: entry.newerHive ? phrase("asks for {hooks}, which this hive does not know yet", { hooks: (entry.unknownHooks || []).join(", ") }) : ""
  };
}

function catalogDetailOf(entry) {
  const card = cardOf(entry);
  return {
    ...card,
    back: phrase("‹ explore"),
    where: entry.installed ? (entry.installed.store ? phrase("installed from the catalog") : phrase("already on this machine, copied by hand")) : phrase("from the catalog · not on this machine yet"),
    canCap: phrase("what it can do in your hive"),
    can: canOf(entry),
    trust: phrase("an extension runs inside the hive, with the same reach the hive has on your machine. the hive keeps the version you installed and asks again if its code changes.")
  };
}

function storeOf() {
  const all = st.catalog?.extensions || [];
  const query = String(st.catalogQuery || "").trim().toLowerCase();
  const shown = query ? all.filter((one) => `${one.name} ${one.title} ${one.description}`.toLowerCase().includes(query)) : all;
  const open = all.find((one) => one.name === st.catalogOpen);
  const loading = !st.catalog && !st.catalogTrouble;
  const everything = all.length > 0 && all.every((one) => one.installed);
  return {
    query: st.catalogQuery,
    searchSay: phrase("search extensions"),
    loading, loadingSay: phrase("reading the catalog…"),
    trouble: st.catalogTrouble, retry: phrase("try again"),
    warning: st.catalog?.warning ? phrase("showing the catalog as it was — {why}", { why: st.catalog.warning }) : "",
    cards: shown.map(cardOf),
    none: query ? phrase("no extension matches {query}", { query: st.catalogQuery }) : everything ? phrase("you already have every extension in the catalog.") : phrase("the catalog is empty."),
    foot: phrase("missing one? the extensions live in their own repository, and anyone can propose one by pull request."),
    all: everything,
    detail: open ? catalogDetailOf(open) : null
  };
}

function viewTabsOf() {
  return [
    { key: "installed", label: phrase("installed · {n}", { n: (st.extensions || []).length }), on: st.extensionsView !== "explore" },
    { key: "explore", label: phrase("explore"), on: st.extensionsView === "explore" }
  ];
}

function extensionsViewModel() {
  if (st.extensionsTrouble && !(st.extensions || []).length) return { trouble: st.extensionsTrouble, title: phrase("Extensions"), sub: "", foot: "", none: "", groups: [], detail: null, view: "installed", tabs: viewTabsOf(), store: null };
  const groups = ORIGIN_ORDER.map((origin) => ({
    key: origin,
    label: originSay(origin),
    none: origin === "built-in" ? phrase("none ships with this build") : phrase("nothing here yet"),
    rows: (st.extensions || []).filter((one) => one.origin === origin).map(rowOf)
  }));
  const open = extensionOf(st.extensionOpen);
  return {
    trouble: "",
    title: phrase("Extensions"),
    sub: phrase("what this hive runs on top of the hive"),
    foot: phrase("an extension is a folder with extension.json and index.mjs: in ~/.hive/extensions, in the hub's extensions folder, or shipped with the app. The hub's and yours start off; a built-in starts on."),
    none: phrase("pick an extension on the left"),
    groups,
    detail: open ? detailOf(open) : null,
    view: st.extensionsView === "explore" ? "explore" : "installed",
    tabs: viewTabsOf(),
    store: st.extensionsView === "explore" ? storeOf() : null
  };
}

function paintExtensions() {
  if (!extensionsSolid) return;
  extensionsSolid.show(extensionsViewModel());
}

async function pullExtensions() {
  st.extensionsAsked = true;
  let d;
  try {
    d = await (await fetch("/api/extensions")).json();
  } catch {
    st.extensionsTrouble = phrase("the app could not read which extensions this machine holds");
    if (extensionsOnScreen()) paintExtensions();
    return false;
  }
  st.extensionsTrouble = d.error || "";
  st.extensions = Array.isArray(d.extensions) ? d.extensions : [];
  if (!st.extensionOpen || !extensionOf(st.extensionOpen)) st.extensionOpen = st.extensions[0] ? keyOf(st.extensions[0]) : "";
  if (extensionsOnScreen()) paintExtensions();
  return true;
}

function adoptExtension(said) {
  if (!said?.extension) return;
  const key = keyOf(said.extension);
  st.extensions = (st.extensions || []).map((one) => (keyOf(one) === key ? said.extension : one));
}

async function post(path, body) {
  let r;
  try { r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }
  catch { return { error: phrase("the app did not answer") }; }
  const said = await r.json().catch(() => ({}));
  if (!r.ok) return { error: said.error || phrase("the app refused it") };
  return said;
}

function selectExtension(key) {
  st.extensionOpen = key;
  st.extensionTab = "overview";
  paintExtensions();
}

function pickExtensionTab(key) {
  st.extensionTab = key;
  paintExtensions();
}

async function toggleExtension(name, enabled) {
  const before = (st.extensions || []).find((one) => one.name === name);
  if (!before) return;
  st.extensions = st.extensions.map((one) => (one.name === name ? { ...one, enabled } : one));
  paintExtensions();
  const said = await post("/api/extensions/toggle", { name, enabled });
  if (said.error) {
    st.extensions = st.extensions.map((one) => (one.name === name ? { ...before, problems: [said.error, ...(before.problems || []).filter((p) => p !== said.error)] } : one));
    if (keyOf(before) === st.extensionOpen) st.extensionTab = "problems";
  } else adoptExtension(said);
  paintExtensions();
}

async function setExtensionSetting(name, key, value) {
  const one = (st.extensions || []).find((x) => x.name === name);
  if (!one) return;
  const secret = one.settings?.[key]?.type === "password";
  const settings = secret ? { [key]: value } : { ...(one.values || {}), [key]: value };
  const said = await post("/api/extensions/settings", { name, settings });
  if (said.error) {
    st.extensions = st.extensions.map((x) => (x.name === name ? { ...x, problems: [said.error, ...(x.problems || []).filter((p) => p !== said.error)] } : x));
    if (keyOf(one) === st.extensionOpen) st.extensionTab = "problems";
  } else adoptExtension(said);
  paintExtensions();
}

async function pullCatalog(fresh = false) {
  let d;
  try {
    d = await (await fetch(`/api/extensions/catalog${fresh ? "?fresh=1" : ""}`)).json();
  } catch {
    st.catalogTrouble = phrase("the app could not read the catalog");
    paintExtensions();
    return false;
  }
  st.catalogTrouble = d.error || "";
  st.catalog = d.error ? null : d;
  paintExtensions();
  return !d.error;
}

function pickView(key) {
  st.extensionsView = key === "explore" ? "explore" : "installed";
  st.extensionConfirm = null;
  paintExtensions();
  if (st.extensionsView === "explore") pullCatalog();
}

function searchCatalog(text) {
  st.catalogQuery = String(text || "");
  paintExtensions();
}

function openCard(name) {
  const entry = (st.catalog?.extensions || []).find((one) => one.name === name);
  if (entry?.installed && !entry.update) {
    showInstalled(name);
    return;
  }
  st.catalogOpen = name;
  paintExtensions();
}

function closeCard() {
  st.catalogOpen = "";
  paintExtensions();
}

function showInstalled(name, tab = "overview") {
  const one = (st.extensions || []).find((x) => x.name === name && !x.reserved && !x.shadowed) || (st.extensions || []).find((x) => x.name === name);
  st.extensionsView = "installed";
  st.catalogOpen = "";
  if (one) st.extensionOpen = keyOf(one);
  st.extensionTab = tab;
  paintExtensions();
}

async function installExtension(name) {
  if (st.extensionBusy[name]) return;
  st.extensionBusy = { ...st.extensionBusy, [name]: "installing" };
  st.catalogTrouble = "";
  paintExtensions();
  const said = await post("/api/extensions/install", { name });
  const { [name]: _, ...rest } = st.extensionBusy;
  st.extensionBusy = rest;
  if (said.error) {
    st.catalogTrouble = said.error;
    paintExtensions();
    return;
  }
  await pullExtensions();
  pullCatalog(true);
  showInstalled(name, said.extension?.missing?.length ? "settings" : "overview");
}

function askUninstall(name) {
  st.extensionConfirm = { name, forget: false };
  paintExtensions();
}

function setUninstallForget(forget) {
  if (!st.extensionConfirm) return;
  st.extensionConfirm = { ...st.extensionConfirm, forget: !!forget };
  paintExtensions();
}

function cancelUninstall() {
  st.extensionConfirm = null;
  paintExtensions();
}

async function uninstallExtension() {
  const asked = st.extensionConfirm;
  if (!asked || st.extensionBusy[asked.name]) return;
  st.extensionBusy = { ...st.extensionBusy, [asked.name]: "uninstalling" };
  st.extensionConfirm = null;
  paintExtensions();
  const said = await post("/api/extensions/uninstall", { name: asked.name, forget: asked.forget });
  const { [asked.name]: _, ...rest } = st.extensionBusy;
  st.extensionBusy = rest;
  if (said.error) {
    st.extensions = (st.extensions || []).map((x) => (x.name === asked.name ? { ...x, problems: [said.error, ...(x.problems || []).filter((p) => p !== said.error)] } : x));
    st.extensionTab = "problems";
    paintExtensions();
    return;
  }
  st.extensionOpen = "";
  await pullExtensions();
  pullCatalog(true);
}

function openExtensions(key = "") {
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  if (portariaOnScreen()) closePortaria();
  if (providersOnScreen()) closeProviders();
  if (key) st.extensionOpen = key;
  $("extensions").hidden = false;
  paintExtensions();
  pullExtensions();
  every("extensions", EX_BEAT, () => pullExtensions());
}

function closeExtensions() {
  $("extensions").hidden = true;
  stopBeat("extensions");
}

solidMounts.push((hive) => {
  extensionsSolid = hive.mountExtensions($("extensions"), {
    actions: {
      select: selectExtension,
      toggle: toggleExtension,
      tab: pickExtensionTab,
      check: () => pullExtensions(),
      setting: setExtensionSetting,
      view: pickView,
      search: searchCatalog,
      card: openCard,
      back: closeCard,
      install: installExtension,
      retry: () => pullCatalog(true),
      uninstall: askUninstall,
      forget: setUninstallForget,
      cancel: cancelUninstall,
      confirm: uninstallExtension
    }
  });
});

export { cardOf as extensionCardOf, catalogDetailOf, closeExtensions, extensionOf, extensionsOnScreen, extensionsViewModel, fieldOf, markOf, openExtensions, paintExtensions, pullExtensions, statusOf as extensionStatusOf };
