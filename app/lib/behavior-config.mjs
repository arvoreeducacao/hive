import { BACKGROUND_DEFAULT, BACKGROUND_MODES, CONFIRM_DEFAULTS, EFFORT_STYLE_DEFAULT, EFFORT_STYLES, PROVIDER_CHECK_DEFAULT, PROVIDER_CHECKS, TEXT_WRITER_DEFAULT, TEXT_WRITERS } from "../assets/behavior-defaults.mjs";

export { BACKGROUND_DEFAULT, BACKGROUND_MODES, CONFIRM_DEFAULTS, EFFORT_STYLE_DEFAULT, EFFORT_STYLES, PROVIDER_CHECK_DEFAULT, PROVIDER_CHECKS, TEXT_WRITER_DEFAULT, TEXT_WRITERS };

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

const BEHAVIOR_DEFAULTS = {
  effortStyle: EFFORT_STYLE_DEFAULT,
  confirm: {},
  slashSkills: true,
  devices: true,
  deviceAgents: true,
  background: BACKGROUND_DEFAULT,
  providerCheck: PROVIDER_CHECK_DEFAULT,
  textWriter: TEXT_WRITER_DEFAULT
};

export const BEHAVIOR_KEYS = Object.keys(BEHAVIOR_DEFAULTS);

function oneOf(raw, name, choices, fallback, where, problems) {
  if (raw === undefined) return fallback;
  if (typeof raw === "string" && choices.includes(raw.trim())) return raw.trim();
  problems.push(`${where}: ${name} should be ${choices.filter(Boolean).join(", ")}${choices.includes("") ? " or empty" : ""}`);
  return fallback;
}

function flag(raw, name, fallback, where, problems) {
  if (raw === undefined) return fallback;
  if (typeof raw === "boolean") return raw;
  problems.push(`${where}: ${name} should be true or false`);
  return fallback;
}

export function cleanConfirm(raw, where, problems) {
  if (raw === undefined) return {};
  if (!isPlainObject(raw)) {
    problems.push(`${where}: confirm should be an object of ${Object.keys(CONFIRM_DEFAULTS).join(" / ")} -> true or false`);
    return {};
  }
  const clean = {};
  for (const [action, value] of Object.entries(raw)) {
    if (!(action in CONFIRM_DEFAULTS)) { problems.push(`${where}: confirm.${action} is not an action — ${Object.keys(CONFIRM_DEFAULTS).join(", ")}`); continue; }
    if (typeof value !== "boolean") { problems.push(`${where}: confirm.${action} should be true or false`); continue; }
    clean[action] = value;
  }
  return clean;
}

const CLEANERS = {
  effortStyle: (raw, where, problems) => oneOf(raw, "effortStyle", EFFORT_STYLES, EFFORT_STYLE_DEFAULT, where, problems),
  confirm: cleanConfirm,
  slashSkills: (raw, where, problems) => flag(raw, "slashSkills", true, where, problems),
  devices: (raw, where, problems) => flag(raw, "devices", true, where, problems),
  deviceAgents: (raw, where, problems) => flag(raw, "deviceAgents", true, where, problems),
  background: (raw, where, problems) => oneOf(raw, "background", BACKGROUND_MODES, BACKGROUND_DEFAULT, where, problems),
  providerCheck: (raw, where, problems) => oneOf(raw, "providerCheck", PROVIDER_CHECKS, PROVIDER_CHECK_DEFAULT, where, problems),
  textWriter: (raw, where, problems) => oneOf(raw, "textWriter", TEXT_WRITERS, TEXT_WRITER_DEFAULT, where, problems)
};

export function cleanBehavior(raw, where, problems) {
  const source = isPlainObject(raw) ? raw : {};
  return Object.fromEntries(BEHAVIOR_KEYS.map((key) => [key, CLEANERS[key](source[key], where, problems)]));
}

export function cleanBehaviorPatch(patch, problems) {
  const clean = {};
  for (const key of BEHAVIOR_KEYS) if (patch[key] !== undefined) clean[key] = CLEANERS[key](patch[key], "patch", problems);
  return clean;
}

export const behaviorHas = (raw) => Object.fromEntries(BEHAVIOR_KEYS.map((key) => [key, isPlainObject(raw) && raw[key] !== undefined]));

export const devicesForAgents = (config) => config?.devices !== false && config?.deviceAgents !== false;
