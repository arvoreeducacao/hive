import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const IS_WINDOWS = process.platform === "win32";

export function asTheSystemWritesIt(p) {
  if (!IS_WINDOWS || !p) return p;
  const unix = p.match(/^\/([A-Za-z])\/(.*)$/);
  return unix ? `${unix[1].toUpperCase()}:/${unix[2]}` : p;
}

export const HOME = homedir();
export const HIVE_HOME = process.env.HIVE_HOME || join(HOME, ".hive");
export const SANDBOX = !!process.env.HIVE_SANDBOX;
export const HIVE_ENV_CONFIG = join(HIVE_HOME, "config");

export const DEFAULT_CONTAINER = "workspace";

const GITHUB_REPO_HOME = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;

export function repoOfManifest(manifest) {
  const publish = manifest?.build?.publish;
  if (publish?.owner && publish?.repo) return `${publish.owner}/${publish.repo}`;
  const found = GITHUB_REPO_HOME.exec(String(manifest?.homepage || ""));
  return found ? `${found[1]}/${found[2]}` : "";
}

export function releaseRepoOfBuild(here = dirname(fileURLToPath(import.meta.url))) {
  try {
    return repoOfManifest(JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")));
  } catch {
    return "";
  }
}

export let NS, CONTAINER, AWS_PROFILE, CLUSTER, RELEASE_REPO, DOOR_DOMAIN, HUB_FOLDER, REPO_FOLDER, LEAF_URL, LEAF_PARENT, MEMORY_SERVER_URL, AVEIA_URL;
export let DEPLOYMENT_DIR, EXPECTED_REPOS, MEMORY_PLUGIN, REPOS_OWNER, POKERS, EXTENSIONS_REPO;
export let HUB, DEV, POD, STS, SECRET_NAME, ENV_FILE, POD_HUB;

export function serverIsWanted(env = process.env, config = {}) {
  const asked = env.HIVE_WANTS_SERVER ?? config.HIVE_WANTS_SERVER;
  if (asked === "0" || asked === "false") return false;
  if (asked === "1" || asked === "true") return true;
  return !!(env.HIVE_SERVER_URL || config.HIVE_SERVER_URL);
}

export function clusterIsWanted(env = process.env, config = {}) {
  const asked = env.HIVE_WANTS_CLUSTER ?? config.HIVE_WANTS_CLUSTER;
  if (asked === "0" || asked === "false") return false;
  if (asked === "1" || asked === "true") return true;
  return !!(env.HIVE_POD || config.HIVE_POD);
}

export function hiveLines(text) {
  const env = {};
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^\s*(HIVE_[A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

export function readHiveEnvConfig() {
  if (!existsSync(HIVE_ENV_CONFIG)) return {};
  return hiveLines(readFileSync(HIVE_ENV_CONFIG, "utf8"));
}

export const SHIPPED_DEPLOYMENTS = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "dist", "deployments");

const DEPLOYMENT_FOLDER = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

export const DEPLOYMENT_KEYS = Object.freeze([
  "HIVE_MEMORY_URL", "HIVE_LEAF_URL", "HIVE_LEAF_PARENT", "HIVE_AVEIA_URL", "HIVE_DOOR_DOMAIN", "HIVE_NAMESPACE", "HIVE_POD_CONTAINER",
  "HIVE_AWS_PROFILE", "HIVE_CLUSTER", "HIVE_RELEASE_REPO", "HIVE_REPOS_OWNER", "HIVE_EXPECTED_REPOS", "HIVE_MEMORY_PLUGIN",
  "HIVE_POKERS", "HIVE_INTERNAL_DOMAINS", "HIVE_APP_PACKAGES"
]);

function readDefaults(file) {
  try { return existsSync(file) ? hiveLines(readFileSync(file, "utf8")) : null; } catch { return null; }
}

export function deploymentDefaults(config = {}, { shipped = SHIPPED_DEPLOYMENTS } = {}) {
  const folder = String(config.HIVE_DEPLOYMENT_DIR || "");
  if (!DEPLOYMENT_FOLDER.test(folder)) return {};
  const found = readDefaults(join(shipped, folder, "hive.defaults"))
    || (config.HIVE_REPO ? readDefaults(join(config.HIVE_REPO, folder, "hive.defaults")) : null)
    || (config.HIVE_HUB ? readDefaults(join(config.HIVE_HUB, folder, "hive.defaults")) : null)
    || {};
  return Object.fromEntries(DEPLOYMENT_KEYS.filter((key) => found[key]).map((key) => [key, found[key]]));
}

export function deploymentScriptIn({ repo = "", hub = "", dir = "", name = "", exists = existsSync } = {}) {
  if (!dir || !name) return "";
  const places = [repo, hub].filter(Boolean).map((root) => join(root, dir, "scripts", name));
  return places.find((place) => exists(place)) || places[0] || "";
}

export const withDeploymentDefaults = (config = {}, options) => ({ ...deploymentDefaults(config, options), ...config });

export function loadConfig() {
  const file = withDeploymentDefaults(readHiveEnvConfig());
  const pick = (k) => (SANDBOX && k !== "HIVE_HUB" ? "" : process.env[k]) || file[k] || "";
  NS = pick("HIVE_NAMESPACE");
  CONTAINER = pick("HIVE_POD_CONTAINER") || DEFAULT_CONTAINER;
  AWS_PROFILE = pick("HIVE_AWS_PROFILE");
  CLUSTER = pick("HIVE_CLUSTER");
  RELEASE_REPO = pick("HIVE_RELEASE_REPO") || releaseRepoOfBuild();
  DOOR_DOMAIN = pick("HIVE_DOOR_DOMAIN");
  LEAF_URL = pick("HIVE_LEAF_URL").replace(/\/+$/, "");
  MEMORY_SERVER_URL = pick("HIVE_MEMORY_URL").replace(/\/+$/, "");
  AVEIA_URL = pick("HIVE_AVEIA_URL").replace(/\/+$/, "");
  LEAF_PARENT = pick("HIVE_LEAF_PARENT");
  DEPLOYMENT_DIR = pick("HIVE_DEPLOYMENT_DIR");
  MEMORY_PLUGIN = pick("HIVE_MEMORY_PLUGIN");
  REPOS_OWNER = pick("HIVE_REPOS_OWNER");
  EXTENSIONS_REPO = pick("HIVE_EXTENSIONS_REPO") || (REPOS_OWNER ? `${REPOS_OWNER}/hive-extensions` : "");
  EXPECTED_REPOS = pick("HIVE_EXPECTED_REPOS").split(",").map((one) => one.trim()).filter(Boolean);
  POKERS = pick("HIVE_POKERS").split(",").map((one) => one.trim()).filter(Boolean);
  DEV = pick("HIVE_DEV");
  HUB = asTheSystemWritesIt(pick("HIVE_HUB"));
  HUB_FOLDER = pick("HIVE_HUB_FOLDER") || (HUB ? basename(HUB) : "");
  REPO_FOLDER = pick("HIVE_REPO_FOLDER") || basename(pick("HIVE_REPO") || "");
  POD = pick("HIVE_POD");
  STS = POD ? POD.replace(/-\d+$/, "") : "";
  SECRET_NAME = STS ? `${STS}-env` : "";
  ENV_FILE = HUB ? join(HUB, ".env") : "";
  POD_HUB = HUB_FOLDER ? `/workspace/repos/${HUB_FOLDER}` : "/workspace/repos";
}
loadConfig();
