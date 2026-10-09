import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTAINER, DEFAULT_CONTAINER, releaseRepoOfBuild, repoOfManifest } from "../lib/env.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(REPO, path), "utf8");

const tracked = () =>
  execFileSync("git", ["-C", REPO, "ls-files"], { encoding: "utf8", maxBuffer: 1 << 24 })
    .split("\n")
    .filter(Boolean);

const BINARY = /\.(png|jpg|jpeg|gif|webp|icns|ico|woff2?|ttf|otf|mp3|mp4|zip|ipa|apk|keystore|jks|p12|pdf)$/i;

const SKIP = [
  /^arvore\//,
  /(^|\/)package-lock\.json$/,
  /(^|\/)node_modules\//,
  /^app\/tests\/our-names\.test\.mjs$/
];

const WHERE_A_FORK_WRITES_ITS_OWN_IDENTITY = [/^app\/package\.json$/, /^raycast\/package\.json$/];

const REACH_INTO_THE_DEPLOYMENT_FOLDER_BY_PATH = [
  /^\.github\/workflows\/(arvore|deploy|register-phone|release|release-ios|release-linux)\.yml$/,
  /^\.dockerignore$/,
  /^README\.md$/,
  /^CONTRIBUTING\.md$/
];

const PROSE_THAT_MAY_NAME_WHO_HOSTS_IT = [/^site\//, /^docs\//];

const source = () =>
  tracked().filter((path) =>
    !BINARY.test(path) &&
    !SKIP.some((one) => one.test(path)) &&
    !WHERE_A_FORK_WRITES_ITS_OWN_IDENTITY.some((one) => one.test(path)) &&
    !REACH_INTO_THE_DEPLOYMENT_FOLDER_BY_PATH.some((one) => one.test(path))
  );

const code = () => source().filter((path) => !PROSE_THAT_MAY_NAME_WHO_HOSTS_IT.some((one) => one.test(path)));

const runtime = () => code().filter((path) =>
  !/(^|\/)tests?\//.test(path) && !/\.test\.(mjs|js)$/.test(path));

const lines = (path) => read(path).split("\n").entries();

test("no runtime file writes a company's name by hand", () => {
  const loose = [];
  for (const path of runtime()) {
    for (const [at, line] of lines(path)) {
      if (line.includes("@arvoretech/")) continue;
      if (/arvore/i.test(line)) loose.push(`${path}:${at + 1} names one company — it belongs in a deployment's hive.defaults or a build`);
    }
  }
  assert.deepEqual(loose, [], `\n${loose.join("\n")}\n`);
});

test("the guard reaches the places the leaks were actually found", () => {
  const covered = runtime();
  for (const path of ["app/server.mjs", "app/lib/env.mjs", "app/lib/device.mjs",
    "app/usage/scan-secrets.mjs", "server/peer/peer-mcp.mjs", "server/sync/broker.mjs", "server/phone/app.js", "infra/scripts/setup.sh"]) {
    assert.ok(covered.includes(path), `${path} is not being checked, and it is one of the files that leaked`);
  }
});

const NEVER_ANYWHERE = [
  [/\d{12}\.dkr\.ecr\./, "an AWS account number"],
  [/arn:aws:[a-z]+:[a-z0-9-]*:\d{12}:/, "an AWS ARN with an account in it"],
  [/[a-z0-9-]+\.arvore\.(com\.br|dev)/i, "a real hostname of one company"],
  [/\barvore\.slack\.com\b/i, "a real Slack workspace"],
  [/@arvore\.com\.br\b/i, "a real person's email"]
];

test("nobody's address, account or identity is written down anywhere, tests included", () => {
  const loose = [];
  for (const path of source()) {
    for (const [at, line] of lines(path)) {
      if (line.includes("${{")) continue;
      for (const [shape, what] of NEVER_ANYWHERE) {
        if (shape.test(line)) loose.push(`${path}:${at + 1} carries ${what}`);
      }
    }
  }
  assert.deepEqual(loose, [], `\n${loose.join("\n")}\n`);
});

test("the installer picks a deployment file up without naming whose it is", () => {
  const setup = read("infra/scripts/setup.sh");
  assert.match(setup, /for candidate in "\$DIR"\/\*\/hive\.defaults/, "setup.sh stopped looking for a deployment file");
  assert.doesNotMatch(setup, /arvore/i, "setup.sh names the deployment it is supposed to find by glob");
});

test("the only default the app keeps is one that means the same everywhere", () => {
  assert.equal(DEFAULT_CONTAINER, "workspace");
  assert.equal(CONTAINER, "workspace");
});

test("which releases the app looks at comes from how it was built", () => {
  const built = repoOfManifest(JSON.parse(read("app/package.json")));
  assert.match(built, /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "app/package.json names no repository to publish to");
  assert.equal(releaseRepoOfBuild(resolve(REPO, "app", "lib")), built);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("HIVE_")));
  const home = mkdtempSync(join(tmpdir(), "hive-release-"));
  const ENV = resolve(REPO, "app", "lib", "env.mjs");
  const said = execFileSync(process.execPath, ["--input-type=module", "-e", `const e = await import(${JSON.stringify(ENV)}); console.log(e.RELEASE_REPO);`], { env: { ...env, HIVE_HOME: home }, encoding: "utf8" }).trim();
  assert.equal(said, built, "with nothing configured, the app must look at the releases of the repository it was built from");
  assert.equal(releaseRepoOfBuild("/nowhere-at-all"), "", "a build with no publish block must not fall back to somebody else's releases");
});

const REVIEWED_PIXELS = {
  "app/assets/icon.icns": "3b5921acf50718589c9e71414090ddee1ff83685859f415690fff87fa0310c10",
  "app/assets/icon.png": "f2f843dc968bc0a122d57360666e42de3ee7ac632cfd0e5a654797291ef9cd45",
  "app/assets/meet-captions/extension/icons/icon-128.png": "db1d9c04f9994759b60667354bf110e0716b201cecb10b6c6e1820fba1a13dea",
  "app/assets/meet-captions/extension/icons/icon-16.png": "b9aa35cbaa1fde9ee032dbd8b865d0ce8c0c293d4d71ed1d90660de18fb56b61",
  "app/assets/meet-captions/extension/icons/icon-32.png": "3073889a1af55eeaa348e06011e2263593900bf9e534b8d7d555e553d0eadd13",
  "app/assets/meet-captions/extension/icons/icon-48.png": "4da51d18af3a0872b265929c03eacc6993f43db8547cafa2190da6e5159a31cb",
  "docs/assets/screenshots/asks.png": "90ba7c06ac54db25738ad7a09aa61b06f22033640312fc54ba16fe420854aa68",
  "docs/assets/screenshots/chat.png": "a382b5b9cf67ef6235cd3ace489625701aafdd4a0c1fcb60d6d6b3ee414ff9d1",
  "docs/assets/screenshots/composer.png": "c46e0717aae4e628de470b822de375569381c7aeeca17ddb6ccab97ead4179bf",
  "docs/assets/screenshots/wall.png": "39faf17396e15c97d864259859278571d1fc320ad27bb0e17447ce79a689f62b",
  "docs/composer-picker/fechado.png": "13484bf7e490497bac789e631f7e0274c3cf40535271f393517ae9f89881a364",
  "docs/composer-picker/modelos.png": "8b6f25cd041f0350c0fa8d681fd99f36301fb42d54e34631ae14a8c3ad2f4ebc",
  "docs/composer-picker/raciocinio.png": "16be8232a231009271315b966ddd58fe1eb568ad092f359bc31fc7fc8952fe1e",
  "docs/composer-picker/travado.png": "1904a966ce7762dbfb604a5c421c2846a41411311bee42fd97f015a2885320a1",
  "raycast/assets/icon.png": "ed26e314776c1f1e435bb854b3d7215fb78a834f191845770a3556dcc0daa8b8",
  "server/phone/icon-180.png": "db50b58722f7c1ba4dd6973b9927cd554c95cb65514f8da292c05b3e1d0f3b34",
  "server/phone/icon-512.png": "deb689a1874c245a6d73ebe2ca920069a513cfb7595fd58ce108d8807dda3fc7",
  "site/src/assets/composer/footer-pills.png": "13484bf7e490497bac789e631f7e0274c3cf40535271f393517ae9f89881a364",
  "site/src/assets/composer/model-picker.png": "8b6f25cd041f0350c0fa8d681fd99f36301fb42d54e34631ae14a8c3ad2f4ebc",
  "site/src/assets/composer/other-agent.png": "1904a966ce7762dbfb604a5c421c2846a41411311bee42fd97f015a2885320a1",
  "site/src/assets/composer/reasoning-picker.png": "16be8232a231009271315b966ddd58fe1eb568ad092f359bc31fc7fc8952fe1e"
};

const HOW_TO_DECLARE_A_PICTURE =
  "open it, read every string in it — seat names, repository names, branch names, people, ticket ids, " +
  "chat content, host names in a browser pane — re-shoot it with invented names if any of that is real, " +
  "then put its sha256 in REVIEWED_PIXELS";

const PICTURES = /\.(png|jpg|jpeg|gif|webp|icns|ico)$/i;

const shaOf = (path) => createHash("sha256").update(readFileSync(resolve(REPO, path))).digest("hex");

test("every picture that ships has been read by a person", () => {
  const shipped = tracked().filter((path) => PICTURES.test(path));
  const undeclared = shipped.filter((path) => !REVIEWED_PIXELS[path]);
  assert.deepEqual(undeclared, [],
    `\na picture nobody has declared reviewed: ${undeclared.join(", ")}\n${HOW_TO_DECLARE_A_PICTURE}\n`);

  const reshot = shipped.filter((path) => shaOf(path) !== REVIEWED_PIXELS[path]);
  assert.deepEqual(reshot, [],
    `\nthis picture changed since it was reviewed: ${reshot.join(", ")}\n${HOW_TO_DECLARE_A_PICTURE}\n`);

  const gone = Object.keys(REVIEWED_PIXELS).filter((path) => !shipped.includes(path));
  assert.deepEqual(gone, [], `\nREVIEWED_PIXELS still declares a picture the repo no longer tracks: ${gone.join(", ")}\n`);
});
