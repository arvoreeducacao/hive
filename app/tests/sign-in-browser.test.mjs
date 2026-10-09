import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { directSignInUrl, signInBrowserEnv, signInUrlFile } from "../lib/sign-in-browser.mjs";

const home = () => mkdtempSync(join(tmpdir(), "hive-sign-in-"));

test("the browser a CLI opens at sign-in hands its address to the hive instead, so the sign-in comes back on its own", { skip: process.platform === "win32" }, () => {
  const where = home();
  const env = signInBrowserEnv(where, "claude");
  const url = "https://claude.example/oauth/authorize?redirect_uri=http%3A%2F%2Flocalhost%3A34993%2Fcallback&state=abc";
  execFileSync(env.BROWSER, [url], { env: { ...process.env, ...env } });
  assert.equal(directSignInUrl(where, "claude"), url);
  assert.equal(statSync(env.BROWSER).mode & 0o777, 0o700);
});

test("an address that is not a plain https link is never handed to the browser", () => {
  const where = home();
  signInBrowserEnv(where, "codex");
  for (const bad of ["", "file:///etc/passwd", "javascript:alert(1)", "https://a b", "http://localhost:1/callback"]) {
    writeFileSync(signInUrlFile(where, "codex"), `${bad}\n`);
    assert.equal(directSignInUrl(where, "codex"), "", bad);
  }
});

test("with nothing opened yet, there is no address to follow", () => {
  assert.equal(directSignInUrl(home(), "claude"), "");
});

test("the opener is rewritten when it drifts, and each provider keeps its own address", () => {
  const where = home();
  const first = signInBrowserEnv(where, "claude");
  writeFileSync(first.BROWSER, "#!/bin/sh\nexit 1\n");
  const again = signInBrowserEnv(where, "kimi");
  assert.equal(again.BROWSER, first.BROWSER);
  assert.match(readFileSync(again.BROWSER, "utf8"), /HIVE_SIGNIN_URL_FILE/);
  assert.notEqual(again.HIVE_SIGNIN_URL_FILE, first.HIVE_SIGNIN_URL_FILE);
});

test("a forced read of the providers asks the CLI again, so a login that just landed turns green at the next look", () => {
  const source = readFileSync(fileURLToPath(new URL("../server.mjs", import.meta.url)), "utf8");
  assert.match(source, /async function readProviders\(force = false\) \{\n  if \(force\) accountCache = \{ at: 0, list: \[\] \};/,
    "a forced read kept the thirty-second answer about who is signed in, so a fresh login stayed red for half a minute");
});
