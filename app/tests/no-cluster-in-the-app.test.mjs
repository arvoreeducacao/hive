import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_MARK, powerSwitchIn } from "../doctor/doctor-runner.mjs";
import { deploymentScriptIn } from "../lib/env.mjs";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

test("the app spawns no kubectl of its own — a cluster is only ever reached by the deployment's script", () => {
  const source = readFileSync(join(REPO, "app/server.mjs"), "utf8");
  const spawned = [];
  source.split("\n").forEach((line, index) => {
    if (/(spawn|shr|sh|execFile|readBytes)\s*\(\s*["'`]kubectl/.test(line)) spawned.push(`app/server.mjs:${index + 1}: ${line.trim()}`);
    if (/onPod\./.test(line)) spawned.push(`app/server.mjs:${index + 1}: ${line.trim()}`);
  });
  assert.deepEqual(spawned, [],
    `the app reaches a cluster itself again — everything it needs from a running server goes over the port, and turning a stopped one on is the deployment's script:\n${spawned.join("\n")}`);
  assert.match(source, /deploymentScript\("pod-power\.sh"\)/, "the app lost the one way it had to turn a server back on");
});

test("the deployment's script is named by its whole path, so it runs from wherever the app was started", () => {
  assert.equal(powerSwitchIn("/somewhere/repo", "acme"), "/somewhere/repo/acme/scripts/pod-power.sh");
  assert.ok(isAbsolute(powerSwitchIn("/somewhere/repo", "acme")),
    "a relative path only works when the app happens to be sitting in the repo");
  assert.equal(powerSwitchIn("/somewhere/repo", ""), "", "a hive with no deployment was handed a script that cannot exist");
  assert.equal(powerSwitchIn("", "acme"), "", "a path was built before the repo was even found");

  const source = readFileSync(join(REPO, "app/server.mjs"), "utf8");
  assert.match(source, /const deploymentScript = \(name\) => deploymentScriptIn\(\{ repo: REPO, hub: HUB, dir: DEPLOYMENT_DIR, name \}\)/,
    "the app builds a deployment script path that only resolves from one working directory");
});

test("a deployment script is run by the path it was found at, never joined to the checkout a second time", () => {
  const source = readFileSync(join(REPO, "app/server.mjs"), "utf8");
  assert.doesNotMatch(source, /join\(REPO, (cloudScript|script)\)/,
    "a whole path joined to the checkout again points nowhere, so the script quietly never runs");
});

test("a deployment the hub carries has its scripts found there, and the checkout still wins when it has them", () => {
  const inHub = (place) => place.startsWith("/hub/");
  assert.equal(deploymentScriptIn({ repo: "/repo", hub: "/hub", dir: "acme", name: "pod-power.sh", exists: inHub }), "/hub/acme/scripts/pod-power.sh");
  assert.equal(deploymentScriptIn({ repo: "/repo", hub: "/hub", dir: "acme", name: "pod-power.sh", exists: () => true }), "/repo/acme/scripts/pod-power.sh");
  assert.equal(deploymentScriptIn({ hub: "/hub", dir: "acme", name: "pod-power.sh", exists: () => false }), "/hub/acme/scripts/pod-power.sh");
  assert.equal(deploymentScriptIn({ repo: "/repo", hub: "/hub", dir: "", name: "pod-power.sh" }), "");
});

test("the mark the doctor looks for is one the packaged app never carries, so it finds the checkout", () => {
  const build = JSON.parse(readFileSync(join(REPO, "app/package.json"), "utf8")).build;
  const shipped = [
    ...(build.files || []),
    ...(build.extraResources || []).map((one) => String(one.to || one.from || ""))
  ];
  const top = REPO_MARK.split("/")[0];
  const carried = shipped.filter((one) => one === top || one.startsWith(`${top}/`) || one.startsWith(`${top}**`));
  assert.deepEqual(carried, [],
    `the app packages ${top}, so the doctor would find the bundle instead of the checkout and look for the deployment inside it`);
  assert.equal(existsSync(join(REPO, REPO_MARK)), true, `${REPO_MARK} is not in this repo, so nothing would ever be found`);
});

test("the bundle still carries a setup for the wizard to run, under a name that is not that mark", () => {
  const build = JSON.parse(readFileSync(join(REPO, "app/package.json"), "utf8")).build;
  const shipped = (build.extraResources || []).find((one) => String(one.from || "").endsWith(REPO_MARK));
  assert.ok(shipped, "an app that was installed has no checkout, so the wizard's key button would have no script to run at all");
  const top = REPO_MARK.split("/")[0];
  assert.doesNotMatch(String(shipped.to), new RegExp(`^${top}(/|$)`),
    `shipped to ${shipped.to}, the doctor would read the bundle as the checkout — that is what the test above forbids`);
  const source = readFileSync(join(REPO, "app/server.mjs"), "utf8");
  assert.match(source, new RegExp(`SETUP_IN_A_BUNDLE = "\\.\\./${String(shipped.to).replace(/\./g, "\\.")}"`),
    "the server looks for the bundled setup somewhere else than where the build puts it");
});

test("a deployment script that is not there is said out loud, never as silence", () => {
  const runner = readFileSync(join(REPO, "app/doctor/doctor-runner.mjs"), "utf8");
  const cluster = runner.slice(runner.indexOf("const cluster = once("), runner.indexOf("const probe = once("));
  assert.match(cluster, /there is no \$\{ctx\.powerSwitch\}/,
    "a missing script comes back as an empty answer, and the doctor then says the host said nothing");
});
