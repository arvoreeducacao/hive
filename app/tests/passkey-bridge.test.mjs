import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, writeFileSync, readlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { BROWSERS, originOf, signingScript, bundleIdOf, pickBrowser, linkOnePassword, devtoolsAddress, bridge } = createRequire(import.meta.url)("../main/passkey.js");
const main = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const preload = readFileSync(new URL("../main/seat-preload.js", import.meta.url), "utf8");

test("a passkey is bridged only for the https origin of the page that asked", () => {
  assert.equal(originOf("https://accounts.google.com/v3/signin/challenge/pk?x=1"), "https://accounts.google.com");
  assert.equal(originOf("http://localhost:3000/login"), "");
  assert.equal(originOf("hive://shelf/x"), "");
  assert.equal(originOf("not a url"), "");
});

test("the script run in Chrome is one expression that parses", () => {
  const script = signingScript("get", { challenge: "abc", rpId: "google.com", allowCredentials: [{ type: "public-key", id: "AQID" }] });
  assert.doesNotThrow(() => new Function(`return ${script}`));
  assert.match(script, /"rpId":"google.com"/);
});

test("the request text cannot break out of the script", () => {
  const hostile = "x\"});alert(1);({\" </script>";
  const script = signingScript("get", { challenge: "abc", rpId: hostile });
  assert.doesNotThrow(() => new Function(`return ${script}`));
  const asked = /const asked = ([^\n]*);\n/.exec(script);
  assert.equal(JSON.parse(asked[1]).rpId, hostile);
});

test("the passkey Chrome reaches the 1Password app through the manifest the app installed", () => {
  const home = mkdtempSync(join(tmpdir(), "passkey-home-"));
  const hosts = join(home, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts");
  mkdirSync(hosts, { recursive: true });
  writeFileSync(join(hosts, "com.1password.1password.json"), "{}");
  const dir = join(home, "passkey-chrome");
  linkOnePassword(dir, home);
  assert.equal(readlinkSync(join(dir, "NativeMessagingHosts", "com.1password.1password.json")), join(hosts, "com.1password.1password.json"));
  assert.doesNotThrow(() => linkOnePassword(dir, home));
});

test("the devtools address is read from the file Chrome writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "passkey-chrome-"));
  assert.equal(devtoolsAddress(dir), "");
  writeFileSync(join(dir, "DevToolsActivePort"), "51403\n/devtools/browser/abc\n");
  assert.equal(devtoolsAddress(dir), "ws://127.0.0.1:51403/devtools/browser/abc");
});

test("a request the bridge cannot serve is refused before Chrome is touched", async () => {
  let launched = 0;
  const chrome = bridge({ dir: mkdtempSync(join(tmpdir(), "passkey-chrome-")), home: tmpdir(), pick: () => null, launch: () => { launched++; } });
  assert.equal((await chrome.sign({ kind: "store", origin: "https://a.com", options: { challenge: "x" } })).error.name, "NotSupportedError");
  assert.equal((await chrome.sign({ kind: "get", origin: "http://a.com", options: { challenge: "x" } })).error.name, "SecurityError");
  assert.equal((await chrome.sign({ kind: "get", origin: "https://a.com/path", options: { challenge: "x" } })).error.name, "SecurityError");
  assert.equal((await chrome.sign({ kind: "get", origin: "https://a.com", options: {} })).error.name, "TypeError");
  assert.equal((await chrome.sign({ kind: "get", origin: "https://a.com", options: { challenge: "x" } })).error.name, "NotSupportedError");
  assert.equal(launched, 0);
});

test("main takes the origin from the frame that asked, and only from a seat browser tab", () => {
  const handler = /ipcMain\.handle\("seat-browser:passkey"[\s\S]*?\n  \}\);/.exec(main);
  assert.ok(handler, "main.js lost the passkey handler");
  assert.match(handler[0], /seatWc\.has\(event\.sender\.id\)/);
  assert.match(handler[0], /originOf\(event\.senderFrame/);
  assert.doesNotMatch(handler[0], /ask\.origin|ask && ask\.origin/);
});

test("the seat page swaps navigator.credentials only on https, and leaves conditional requests alone", () => {
  assert.match(preload, /location\.protocol === "https:"[\s\S]*executeInMainWorld/);
  assert.match(preload, /options\.mediation === "conditional"\) return native\[kind\]/);
  assert.match(preload, /ipcRenderer\.invoke\("seat-browser:passkey"/);
});

test("the browser that asks is the first real Chrome or Edge on the machine, never Chrome for Testing", () => {
  const ids = { "/Applications/Google Chrome.app": "com.google.chrome.for.testing", "/Applications/Microsoft Edge.app": "com.microsoft.edgemac" };
  assert.equal(pickBrowser(BROWSERS, (app) => ids[app], () => true).name, "edge", "Chrome for Testing cannot reach iCloud passkeys");
  ids["/Applications/Google Chrome.app"] = "com.google.Chrome";
  assert.equal(pickBrowser(BROWSERS, (app) => ids[app], () => true).name, "chrome");
  assert.equal(pickBrowser(BROWSERS, (app) => ids[app], (bin) => bin.includes("Edge")).name, "edge", "a Chrome that is not there is skipped");
  assert.equal(pickBrowser(BROWSERS, () => "", () => true), null);
});

test("the bundle id is read from the app's own Info.plist", () => {
  const app = mkdtempSync(join(tmpdir(), "passkey-app-"));
  mkdirSync(join(app, "Contents"));
  writeFileSync(join(app, "Contents", "Info.plist"), "<plist><dict>\n\t<key>CFBundleIdentifier</key>\n\t<string>com.microsoft.edgemac</string>\n</dict></plist>");
  assert.equal(bundleIdOf(app), "com.microsoft.edgemac");
  assert.equal(bundleIdOf(join(app, "nowhere")), "");
});

test("Edge reaches 1Password through the manifest Edge was given", () => {
  const home = mkdtempSync(join(tmpdir(), "passkey-home-"));
  const hosts = join(home, "Library", "Application Support", "Microsoft Edge", "NativeMessagingHosts");
  mkdirSync(hosts, { recursive: true });
  writeFileSync(join(hosts, "com.1password.1password.json"), "{}");
  const dir = join(home, "edge");
  linkOnePassword(dir, home, BROWSERS.find((one) => one.name === "edge").hosts);
  assert.equal(readlinkSync(join(dir, "NativeMessagingHosts", "com.1password.1password.json")), join(hosts, "com.1password.1password.json"));
});

test("each browser gets a profile of its own, opened with the browser that was picked", async () => {
  const dir = mkdtempSync(join(tmpdir(), "passkey-"));
  const edge = BROWSERS.find((one) => one.name === "edge");
  const runs = [];
  const asker = bridge({ dir, home: tmpdir(), pick: () => edge, launch: (bin, args) => { runs.push({ bin, args }); throw new Error("not in a test"); } });
  const said = await asker.sign({ kind: "get", origin: "https://github.com", options: { challenge: "x" } });
  assert.equal(said.error.name, "NotAllowedError");
  assert.equal(runs[0].bin, "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  assert.ok(runs[0].args.includes(`--user-data-dir=${join(dir, "edge")}`));
});

test("with neither browser the refusal says what to install", async () => {
  const asker = bridge({ dir: mkdtempSync(join(tmpdir(), "passkey-")), home: tmpdir(), pick: () => null });
  const said = await asker.sign({ kind: "get", origin: "https://github.com", options: { challenge: "x" } });
  assert.match(said.error.message, /Google Chrome or Microsoft Edge/);
});

test("the bridged credential lets the page polyfill toJSON over it, as GitHub does", async () => {
  const source = preload.slice(preload.indexOf("function bridgePasskeys"), preload.indexOf("\nif (location.protocol"));
  class PublicKeyCredential {}
  class AuthenticatorAssertionResponse {}
  class AuthenticatorAttestationResponse {}
  const container = { get: async () => null, create: async () => null };
  const sandbox = { navigator: { credentials: container }, PublicKeyCredential, AuthenticatorAssertionResponse, AuthenticatorAttestationResponse, DOMException: Error, btoa, atob, Uint8Array, ArrayBuffer, JSON, Object, Array, Promise, String };
  const bytes = Buffer.from("x").toString("base64url");
  const answer = { credential: { id: bytes, rawId: bytes, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {}, response: { clientDataJSON: bytes, authenticatorData: bytes, signature: bytes, userHandle: bytes } } };
  vm.runInNewContext(`${source}; bridgePasskeys(ask)`, { ...sandbox, ask: async () => answer });
  const made = await container.get({ publicKey: { challenge: new Uint8Array([1]), allowCredentials: [] } });
  assert.ok(made instanceof PublicKeyCredential);
  made.toJSON = () => "polyfilled";
  made.response.clientDataJSON = made.response.clientDataJSON;
  assert.equal(made.toJSON(), "polyfilled");
});
