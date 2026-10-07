import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function stateDir() {
  const asked = process.env.HIVE_STATE_DIR;
  if (asked) return resolve(asked);
  return existsSync("/workspace/hive") ? "/workspace/hive" : join(homedir(), ".hive");
}

function serverModule(name) {
  const tries = [
    process.env.HIVE_SERVER_DIR ? join(process.env.HIVE_SERVER_DIR, name) : "",
    join(HERE, "..", "..", "server", name),
    join(HERE, "..", "server", name),
    join(stateDir(), "server", name),
    "/Applications/Hive.app/Contents/Resources/server/" + name,
    process.env.HIVE_REPO ? join(process.env.HIVE_REPO, "server", name) : ""
  ].filter(Boolean);
  const found = tries.find((one) => existsSync(one));
  if (found) return pathToFileURL(found).href;
  console.error(`pair: ${name} is in none of these places:`);
  for (const one of tries) console.error(`  ${one}`);
  process.exit(1);
}

const { Device } = await import(serverModule("sync/device.mjs"));
const { fileStore } = await import(serverModule("sync/store.mjs"));

function readConfigLines() {
  const file = join(homedir(), ".hive", "config");
  const held = {};
  if (!existsSync(file)) return held;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const hit = line.match(/^\s*(HIVE_[A-Z_]+)=(.*)$/);
    if (hit) held[hit[1]] = hit[2].replace(/^["']|["']$/g, "").trim();
  }
  return held;
}

function identity() {
  const file = join(stateDir(), "identity.json");
  if (!existsSync(file)) {
    console.error(`pair: this machine has no hive key yet — looked in ${file}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function whereTheServerIs() {
  if (process.env.HIVE_SERVER_URL) return process.env.HIVE_SERVER_URL;
  const env = readConfigLines();
  if (env.HIVE_SERVER_URL) return env.HIVE_SERVER_URL;
  console.error("pair: no address written down for the server the phone will talk to");
  console.error("      open the app once so it finds the door, or set HIVE_SERVER_URL in ~/.hive/config");
  process.exit(1);
}

const url = whereTheServerIs().replace(/\/+$/, "");
const me = identity();
const device = await Device.fromIdentity({ name: "this machine", secret: me.secret, publicSsh: me.publicSsh, store: fileStore(join(stateDir(), "phone")), lean: true });
try {
  await device.enroll(`${url}/sync`, { kind: "mac" });
} catch (wrong) {
  console.error(`pair: the server at ${url} did not take this machine — ${wrong.message}`);
  process.exit(1);
}

const [command, argument] = process.argv.slice(2);

const ago = (ms) => {
  if (!ms) return "never";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
};

const refuse = (wrong) => {
  console.error(`pair: ${wrong?.message || wrong || "the server did not answer"}`);
  process.exit(1);
};

if (command === "open") {
  const said = await device.openCode().catch(refuse);
  const left = Math.round((Number(said.expiresAt) - Date.now()) / 60000);
  console.log(said.code);
  console.log(`open ${url}/phone/ on the phone and type it — lasts ${left} minutes, works once, and five wrong tries close it`);
} else if (command === "list") {
  const said = await device.call("GET", "/roster").catch(refuse);
  const devices = said.devices || [];
  if (!devices.length) console.log("no device is paired");
  for (const one of devices) {
    const state = one.revokedAt ? "revoked" : one.online ? "reading now" : `seen ${ago(one.lastSeen)}`;
    console.log(`${one.fingerprint}\t${one.name}\t${one.kind}\t${state}`);
  }
} else if (command === "revoke") {
  const said = await device.call("GET", "/roster").catch(refuse);
  const target = (said.devices || []).find((one) => !one.revokedAt && (one.fingerprint === argument || one.name === argument));
  if (!target) {
    console.error(`pair: no device called "${argument}" — pair.mjs list shows the ones that exist`);
    process.exit(1);
  }
  await device.call("POST", "/roster/revoke", { fingerprint: target.fingerprint }).catch(refuse);
  console.log(`${target.name} does not come in any more`);
} else {
  console.error("usage: pair.mjs open | list | revoke <key|name>");
  process.exit(1);
}
