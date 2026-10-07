const { spawn } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, symlinkSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const BROWSERS = [
  { name: "chrome", say: "Google Chrome", app: "/Applications/Google Chrome.app", bin: "Contents/MacOS/Google Chrome", id: "com.google.Chrome", hosts: ["Google", "Chrome"] },
  { name: "edge", say: "Microsoft Edge", app: "/Applications/Microsoft Edge.app", bin: "Contents/MacOS/Microsoft Edge", id: "com.microsoft.edgemac", hosts: ["Microsoft Edge"] }
];
const ONEPASSWORD_HOST = "com.1password.1password.json";
const LANDING = "/.well-known/hive-passkey";
const CHROME_WAIT = 15000;
const PAGE_WAIT = 15000;
const PERSON_WAIT = 180000;
const KINDS = ["get", "create"];

function originOf(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.protocol === "https:" ? parsed.origin : "";
  } catch {
    return "";
  }
}

function refusal(name, message) {
  return { error: { name, message } };
}

function signingScript(kind, options) {
  return `(async () => {
  const toBytes = (text) => {
    const plain = text.replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(plain + "===".slice((plain.length + 3) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
  };
  const toText = (buffer) => {
    if (!buffer) return null;
    let raw = "";
    for (const byte of new Uint8Array(buffer)) raw += String.fromCharCode(byte);
    return btoa(raw).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  };
  const kind = ${JSON.stringify(kind)};
  const asked = ${JSON.stringify(options)};
  const listed = (list) => (list || []).map((one) => ({ ...one, id: toBytes(one.id) }));
  const publicKey = { ...asked, challenge: toBytes(asked.challenge) };
  if (kind === "create") {
    publicKey.user = { ...asked.user, id: toBytes(asked.user.id) };
    publicKey.excludeCredentials = listed(asked.excludeCredentials);
  } else {
    publicKey.allowCredentials = listed(asked.allowCredentials);
  }
  try {
    const made = await navigator.credentials[kind]({ publicKey });
    const answer = made.response;
    const extensions = made.getClientExtensionResults ? made.getClientExtensionResults() : {};
    const response = kind === "get"
      ? {
          clientDataJSON: toText(answer.clientDataJSON),
          authenticatorData: toText(answer.authenticatorData),
          signature: toText(answer.signature),
          userHandle: toText(answer.userHandle)
        }
      : {
          clientDataJSON: toText(answer.clientDataJSON),
          attestationObject: toText(answer.attestationObject),
          authenticatorData: answer.getAuthenticatorData ? toText(answer.getAuthenticatorData()) : null,
          publicKey: answer.getPublicKey ? toText(answer.getPublicKey()) : null,
          publicKeyAlgorithm: answer.getPublicKeyAlgorithm ? answer.getPublicKeyAlgorithm() : null,
          transports: answer.getTransports ? answer.getTransports() : []
        };
    return JSON.stringify({
      credential: {
        id: made.id,
        rawId: toText(made.rawId),
        type: made.type,
        authenticatorAttachment: made.authenticatorAttachment || null,
        clientExtensionResults: "credProps" in extensions ? { credProps: extensions.credProps } : {},
        response
      }
    });
  } catch (err) {
    return JSON.stringify({ error: { name: err && err.name || "NotAllowedError", message: String(err && err.message || err) } });
  }
})()`;
}

function bundleIdOf(app) {
  try {
    const plist = readFileSync(join(app, "Contents", "Info.plist"), "utf8");
    return (/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/.exec(plist) || [])[1] || "";
  } catch {
    return "";
  }
}

function pickBrowser(list = BROWSERS, idOf = bundleIdOf, present = existsSync) {
  return list.find((one) => present(join(one.app, one.bin)) && idOf(one.app) === one.id) || null;
}

function linkOnePassword(dir, home, hosts = BROWSERS[0].hosts) {
  const own = join(dir, "NativeMessagingHosts");
  const target = join(own, ONEPASSWORD_HOST);
  const installed = join(home, "Library", "Application Support", ...hosts, "NativeMessagingHosts", ONEPASSWORD_HOST);
  if (existsSync(target) || !existsSync(installed)) return;
  mkdirSync(own, { recursive: true });
  symlinkSync(installed, target);
}

function devtoolsAddress(dir) {
  try {
    const [port, path] = readFileSync(join(dir, "DevToolsActivePort"), "utf8").split("\n");
    return port && path ? `ws://127.0.0.1:${port.trim()}${path.trim()}` : "";
  } catch {
    return "";
  }
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function within(ms, promise, why) {
  let timer = null;
  const late = new Promise((_, fail) => { timer = setTimeout(() => fail(new Error(why)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

function connect(address) {
  return new Promise((ready, fail) => {
    const socket = new WebSocket(address);
    const waiting = new Map();
    let next = 0;
    const link = {
      send(method, params = {}, sessionId) {
        const id = ++next;
        socket.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
        return new Promise((done, broke) => waiting.set(id, { done, broke }));
      },
      alive: () => socket.readyState === WebSocket.OPEN,
      close: () => { try { socket.close(); } catch {} }
    };
    socket.addEventListener("open", () => ready(link));
    socket.addEventListener("error", () => fail(new Error("could not reach the passkey Chrome")));
    socket.addEventListener("close", () => {
      for (const { broke } of waiting.values()) broke(new Error("the passkey Chrome closed"));
      waiting.clear();
    });
    socket.addEventListener("message", (event) => {
      let said = null;
      try { said = JSON.parse(String(event.data)); } catch { return; }
      const asked = said && waiting.get(said.id);
      if (!asked) return;
      waiting.delete(said.id);
      if (said.error) asked.broke(new Error(said.error.message || "devtools error"));
      else asked.done(said.result);
    });
  });
}

function bridge({ dir, home, pick = pickBrowser, launch = spawn }) {
  let link = null;
  let linked = "";
  let queue = Promise.resolve();

  async function reach(browser) {
    if (link && link.alive() && linked === browser.name) return link;
    if (link) link.close();
    link = null;
    linked = browser.name;
    const own = join(dir, browser.name);
    const known = devtoolsAddress(own);
    if (known) {
      try { link = await within(3000, connect(known), "stale address"); return link; } catch {}
    }
    mkdirSync(own, { recursive: true });
    linkOnePassword(own, home, browser.hosts);
    rmSync(join(own, "DevToolsActivePort"), { force: true });
    const child = launch(join(browser.app, browser.bin), [`--user-data-dir=${own}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check"], { detached: true, stdio: "ignore" });
    child.unref();
    const started = Date.now();
    while (Date.now() - started < CHROME_WAIT) {
      const address = devtoolsAddress(own);
      if (address) {
        try { link = await connect(address); return link; } catch {}
      }
      await pause(250);
    }
    throw new Error(`${browser.say} did not start to ask for the passkey`);
  }

  async function settle(cdp, sessionId, origin) {
    const started = Date.now();
    while (Date.now() - started < PAGE_WAIT) {
      const read = await cdp.send("Runtime.evaluate", { expression: "JSON.stringify([document.readyState, location.origin])", returnByValue: true }, sessionId).catch(() => null);
      const [state, at] = read && read.result ? JSON.parse(read.result.value) : [];
      if (state === "complete" && at === origin) return;
      if (state === "complete" && /^https?:/.test(at || "") && at !== origin) throw new Error(`the page moved to ${at}`);
      await pause(200);
    }
    throw new Error("the page did not load");
  }

  async function sign({ kind, origin, options }) {
    if (!KINDS.includes(kind)) return refusal("NotSupportedError", "only get and create are bridged");
    if (!originOf(origin) || originOf(origin) !== origin) return refusal("SecurityError", "a passkey is only bridged for an https page");
    if (!options || typeof options.challenge !== "string") return refusal("TypeError", "the request has no challenge");
    const browser = pick();
    if (!browser) return refusal("NotSupportedError", "a passkey is asked through Google Chrome or Microsoft Edge, and neither is installed (Chrome for Testing cannot read iCloud passkeys)");
    let cdp = null;
    let targetId = "";
    try {
      cdp = await reach(browser);
      ({ targetId } = await cdp.send("Target.createTarget", { url: origin + LANDING }));
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
      await settle(cdp, sessionId, origin);
      await pause(400);
      await cdp.send("Page.bringToFront", {}, sessionId).catch(() => {});
      const ran = await within(PERSON_WAIT, cdp.send("Runtime.evaluate", {
        expression: signingScript(kind, options),
        awaitPromise: true,
        userGesture: true,
        returnByValue: true
      }, sessionId), "nobody confirmed the passkey in time");
      const said = JSON.parse(ran && ran.result && ran.result.value || "{}");
      return said.credential ? { credential: said.credential } : refusal(said.error && said.error.name || "NotAllowedError", said.error && said.error.message || "the passkey was not given");
    } catch (err) {
      return refusal("NotAllowedError", String(err && err.message || err));
    } finally {
      if (cdp && targetId) cdp.send("Target.closeTarget", { targetId }).catch(() => {});
    }
  }

  return {
    sign(ask) {
      const turn = queue.then(() => sign(ask));
      queue = turn.catch(() => {});
      return turn;
    }
  };
}

module.exports = { BROWSERS, LANDING, originOf, signingScript, bundleIdOf, pickBrowser, linkOnePassword, devtoolsAddress, bridge };
