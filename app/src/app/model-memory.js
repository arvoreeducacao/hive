const KEPT_KEY = "hive.draft";

const PROJECT_MODELS_KEY = "hive.projectModels";

const CUSTOM_MODELS_KEY = "hive.customModels";

const CUSTOM_MODEL_MAX = 256;

const CUSTOM_MODEL_SHAPE = /^[A-Za-z0-9._/:[\]-]+$/;

const DEFAULT_OPTIONS_KEY = "default";

const CUSTOM_MODEL_ERRORS = {
  empty: "Enter a model slug.",
  builtIn: "That model is already built in.",
  tooLong: "Model slugs must be 256 characters or less.",
  saved: "That custom model is already saved.",
  shape: "A model slug takes only letters, digits and . _ - / : [ ]"
};

const PLACEHOLDER_SLUGS = { codex: "gpt-6.7-codex-ultra-preview", claude: "claude-sonnet-5", cursor: "claude-sonnet-4-6", opencode: "openai/gpt-5" };

const browserStore = () => (typeof localStorage === "undefined" ? null : localStorage);

function readJson(key, store = browserStore()) {
  try {
    const said = JSON.parse(store?.getItem(key) || "null");
    return said && typeof said === "object" && !Array.isArray(said) ? said : {};
  } catch {
    return {};
  }
}

function writeJson(key, value, store = browserStore()) {
  try { store?.setItem(key, JSON.stringify(value)); } catch {}
}

const plainObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

const optionsKey = (model) => String(model || "") || DEFAULT_OPTIONS_KEY;

function traitsOf(pick) {
  const traits = {};
  if (typeof pick.effort === "string") traits.effort = pick.effort;
  if (typeof pick.fast === "boolean") traits.fast = pick.fast;
  return traits;
}

function rememberPick(pick, store = browserStore()) {
  const agent = String(pick?.agent || "");
  if (!agent) return;
  const kept = readJson(KEPT_KEY, store);
  const model = String(pick.model || "");
  kept.agent = agent;
  kept.model = model;
  kept.models = { ...plainObject(kept.models), [agent]: model };
  const traits = traitsOf(pick);
  if (Object.keys(traits).length) {
    const options = plainObject(kept.options);
    const mine = plainObject(options[agent]);
    const merged = { ...plainObject(mine[optionsKey(model)]), ...traits };
    kept.options = { ...options, [agent]: { ...mine, [optionsKey(model)]: merged } };
  }
  writeJson(KEPT_KEY, kept, store);
}

function rememberedOptions(agent, model, store = browserStore()) {
  const found = plainObject(plainObject(plainObject(readJson(KEPT_KEY, store).options)[agent])[optionsKey(model)]);
  return Object.keys(found).length ? found : null;
}

function rememberedModel(agent, store = browserStore()) {
  const kept = readJson(KEPT_KEY, store);
  const models = plainObject(kept.models);
  if (typeof models[agent] === "string") return models[agent];
  return kept.agent === agent && typeof kept.model === "string" ? kept.model : "";
}

const projectKey = (project) => String(project || "").trim().toLowerCase();

function projectPinOf(project, store = browserStore()) {
  const key = projectKey(project);
  if (!key) return null;
  const pin = plainObject(readJson(PROJECT_MODELS_KEY, store)[key]);
  return pin.agent ? { agent: String(pin.agent), model: String(pin.model || ""), ...traitsOf(pin) } : null;
}

function pinProject(project, pick, store = browserStore()) {
  const key = projectKey(project);
  if (!key || !pick?.agent) return;
  const pins = readJson(PROJECT_MODELS_KEY, store);
  pins[key] = { agent: String(pick.agent), model: String(pick.model || ""), ...traitsOf(pick) };
  writeJson(PROJECT_MODELS_KEY, pins, store);
}

function unpinProject(project, store = browserStore()) {
  const key = projectKey(project);
  const pins = readJson(PROJECT_MODELS_KEY, store);
  if (!key || !(key in pins)) return;
  delete pins[key];
  writeJson(PROJECT_MODELS_KEY, pins, store);
}

function samePick(one, other) {
  return !!one && !!other && one.agent === other.agent && String(one.model || "") === String(other.model || "");
}

function newChatSelection({ kept = {}, pin = null, link = null, ready = () => true, fallback = "claude" } = {}) {
  if (link?.agent && ready(link.agent)) return { agent: link.agent, model: String(link.model || ""), from: "link" };
  if (pin?.agent && ready(pin.agent)) return { agent: pin.agent, model: pin.model, ...traitsOf(pin), from: "project" };
  const agent = kept.agent && ready(kept.agent) ? kept.agent : fallback;
  const models = plainObject(kept.models);
  const model = typeof models[agent] === "string" ? models[agent] : kept.agent === agent && typeof kept.model === "string" ? kept.model : "";
  return { agent, model, from: kept.agent === agent ? "remembered" : "" };
}

function customModelsOf(agent, store = browserStore()) {
  const list = readJson(CUSTOM_MODELS_KEY, store)[agent];
  return Array.isArray(list) ? list.filter((one) => one && typeof one.slug === "string" && one.slug).map((one) => ({ slug: one.slug, name: String(one.name || "") })) : [];
}

function builtInRow(rows, slug) {
  return (rows || []).find((row) => !row.custom && (row.value === slug || row.resolved === slug)) || null;
}

function customRow(entry) {
  return {
    value: entry.slug,
    label: entry.name || entry.slug,
    description: "",
    context: "",
    group: "",
    resolved: "",
    isDefault: false,
    efforts: [],
    defaultEffort: "",
    badges: ["custom"],
    custom: true
  };
}

function withCustomModels(rows, customs) {
  const list = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
  for (const entry of customs || []) {
    const builtIn = builtInRow(list, entry.slug);
    if (builtIn) {
      if (entry.name) {
        builtIn.label = entry.name;
        builtIn.renamed = true;
      }
      continue;
    }
    if (!list.some((row) => row.value === entry.slug)) list.push(customRow(entry));
  }
  return list;
}

function checkCustomModel({ slug, name = "", rows = [], customs = [] }) {
  const clean = String(slug ?? "").trim();
  const label = String(name ?? "").trim();
  if (!clean) return { error: "empty" };
  if (clean.length > CUSTOM_MODEL_MAX) return { error: "tooLong" };
  if (!CUSTOM_MODEL_SHAPE.test(clean)) return { error: "shape" };
  const builtIn = builtInRow(rows, clean);
  if (builtIn) {
    const builtInLabel = customs.some((one) => one.slug === clean) ? "" : String(builtIn.label || "");
    if (!label || label === builtInLabel) return { error: "builtIn" };
    return { error: "", entry: { slug: clean, name: label }, rename: true };
  }
  if (customs.some((one) => one.slug === clean)) return { error: "saved" };
  return { error: "", entry: { slug: clean, name: label }, rename: false };
}

function saveCustomModel(agent, entry, store = browserStore()) {
  if (!agent || !entry?.slug) return;
  const all = readJson(CUSTOM_MODELS_KEY, store);
  const list = customModelsOf(agent, store).filter((one) => one.slug !== entry.slug);
  all[agent] = [...list, { slug: entry.slug, name: entry.name || "" }];
  writeJson(CUSTOM_MODELS_KEY, all, store);
}

function removeCustomModel(agent, slug, store = browserStore()) {
  const all = readJson(CUSTOM_MODELS_KEY, store);
  const list = customModelsOf(agent, store);
  if (!list.some((one) => one.slug === slug)) return false;
  all[agent] = list.filter((one) => one.slug !== slug);
  writeJson(CUSTOM_MODELS_KEY, all, store);
  return true;
}

const customModelErrorText = (code) => CUSTOM_MODEL_ERRORS[code] || "";

const customModelPlaceholder = (agent) => PLACEHOLDER_SLUGS[agent] || "model-slug";

const offersFastMode = (row) => !!row && (row.badges || []).includes("fast mode");

export {
  CUSTOM_MODELS_KEY, CUSTOM_MODEL_MAX, KEPT_KEY, PROJECT_MODELS_KEY,
  checkCustomModel, customModelErrorText, customModelPlaceholder, customModelsOf, newChatSelection, offersFastMode, pinProject, projectPinOf,
  rememberPick, rememberedModel, rememberedOptions, removeCustomModel, samePick, saveCustomModel, unpinProject, withCustomModels
};
