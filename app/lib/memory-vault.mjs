import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export const VAULT_SERVICE = "Hive memory";

const SECURITY = "/usr/bin/security";

export const vaultAccount = (hiveHome, origin = "") => `memory-${createHash("sha256").update(`${hiveHome || ""}\n${origin || ""}`).digest("hex").slice(0, 8)}`;

export function runWithInput(command, args, input = "") {
  return new Promise((done) => {
    let stdout = "";
    let child;
    try {
      child = spawn(command, args, { stdio: ["pipe", "pipe", "ignore"] });
    } catch (wrong) {
      done({ code: -1, stdout: "", missing: true, why: String(wrong?.message || wrong) });
      return;
    }
    const timer = setTimeout(() => child.kill(), 10000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.on("error", (wrong) => { clearTimeout(timer); done({ code: -1, stdout: "", missing: wrong?.code === "ENOENT", why: String(wrong?.message || wrong) }); });
    child.on("close", (code) => { clearTimeout(timer); done({ code, stdout }); });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

const pack = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

function unpack(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")); } catch { return null; }
}

const quoted = (text) => `"${String(text).replace(/[^A-Za-z0-9 ._-]/g, "")}"`;

function macVault({ service, account, run }) {
  return {
    kind: "keychain",
    async available() { return true; },
    async read() {
      const said = await run(SECURITY, ["find-generic-password", "-s", service, "-a", account, "-w"]);
      return said.code === 0 ? unpack(said.stdout) : null;
    },
    async write(value) {
      const line = `add-generic-password -U -s ${quoted(service)} -a ${quoted(account)} -w ${quoted(pack(value))}\n`;
      const said = await run(SECURITY, ["-i"], line);
      return said.code === 0;
    },
    async clear() {
      const said = await run(SECURITY, ["delete-generic-password", "-s", service, "-a", account]);
      return said.code === 0 || said.code === 44;
    }
  };
}

function secretToolVault({ service, account, run }) {
  const where = ["service", service, "account", account];
  let present = null;
  return {
    kind: "secret-service",
    async available() {
      if (present === null) present = !(await run("secret-tool", ["--version"])).missing;
      return present;
    },
    async read() {
      const said = await run("secret-tool", ["lookup", ...where]);
      return said.code === 0 ? unpack(said.stdout) : null;
    },
    async write(value) {
      const said = await run("secret-tool", ["store", "--label", service, ...where], pack(value));
      return said.code === 0;
    },
    async clear() {
      const said = await run("secret-tool", ["clear", ...where]);
      return !said.missing;
    }
  };
}

function noVault() {
  return {
    kind: "none",
    async available() { return false; },
    async read() { return null; },
    async write() { return false; },
    async clear() { return true; }
  };
}

export function createVault({ platform = process.platform, service = VAULT_SERVICE, account, run = runWithInput } = {}) {
  if (platform === "darwin") return macVault({ service, account, run });
  if (platform === "linux") return secretToolVault({ service, account, run });
  return noVault();
}

export function memoryVault(value = null) {
  let held = value;
  return {
    kind: "memory",
    async available() { return true; },
    async read() { return held; },
    async write(next) { held = next; return true; },
    async clear() { held = null; return true; },
    peek: () => held
  };
}

export function vaultFollowing(accountOf, make = (account) => createVault({ account })) {
  const made = new Map();
  const current = () => {
    const account = accountOf();
    if (!made.has(account)) made.set(account, make(account));
    return made.get(account);
  };
  return {
    pin: () => current(),
    get kind() { return current().kind; },
    available: () => current().available(),
    read: () => current().read(),
    write: (value) => current().write(value),
    clear: () => current().clear()
  };
}
