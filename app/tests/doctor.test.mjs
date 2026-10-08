import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  actionOf, actionable, bySeverity, countByState, exitCode, fixOutcome, fixable, formatHuman, normalizeItem, readReport, shortTime, worstState
} from "../doctor/doctor-core.mjs";
import * as readings from "../doctor/doctor-readings.mjs";
import { parseRows } from "../../server/engine/leftovers.mjs";
import { TIMEOUTS, buildContext, contractBlobShell, depsWanted, probeScript, runChecks, timedOut, windowsOf, withTimeout } from "../doctor/doctor-runner.mjs";
import { AVD_RECIPE } from "../lib/device.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const POWER_SWITCH = join(mkdtempSync(join(tmpdir(), "hive-doctor-deployment-")), "acme", "scripts", "pod-power.sh");
mkdirSync(dirname(POWER_SWITCH), { recursive: true });
writeFileSync(POWER_SWITCH, "#!/usr/bin/env bash\n");

const ctx = {
  dev: "ada",
  pod: "ws-ada-0",
  sts: "ws-ada",
  ns: "dev-workspaces",
  onACluster: true,
  serverUrl: "https://hive-ada.example.com",
  serverKey: "SHA256:key",
  powerSwitch: POWER_SWITCH,
  deploymentDir: "acme",
  podHub: "/workspace/repos/acme-hub",
  hubFolder: "acme-hub",
  reposOwner: "acme",
  expectedRepos: ["acme-hub", "dev-workspaces"],
  memoryPlugin: "claude-memory@acme",
  trustedDirs: ["/workspace/repos/acme-hub", "/workspace/repos/dev-workspaces", "/workspace/hive"],
  repo: "/Users/ada/repos/dev-workspaces",
  bin: "/Users/ada/.local/bin",
  key: "/Users/ada/.hive/key-ada",
  publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIExample",
  packageManager: "brew install",
  paths: ["/usr/bin"],
  podAsleep: false
};

const CONFIG = "HIVE_DEV=ada\nHIVE_POD=ws-ada-0\nHIVE_HUB=/hub\n";
const DOOR_ANSWERS = async () => ({ ok: true, fingerprint: `SHA256:${"a".repeat(43)}` });
const DOOR_IS_NOT_THERE = async () => ({ ok: false, error: "getaddrinfo ENOTFOUND hive-ada.hive.example" });
const node = (status, since = "2026-08-19T12:00:00Z") => JSON.stringify({
  metadata: { name: "ip-10-0-0-1" },
  status: { conditions: [{ type: "MemoryPressure", status: "False" }, { type: "Ready", status, lastTransitionTime: since }] }
});
const READY_NODE = node("True");
const running = (over = {}) => JSON.stringify({
  metadata: { name: "ws-ada-0", ...(over.metadata || {}) },
  status: { phase: "Running", containerStatuses: [{ ready: true }] },
  spec: { nodeName: "ip-10-0-0-1" }
});
const alive = { verdict: JSON.stringify({ state: "ok", detail: "up and answering on ip-10-0-0-1" }) };
const verdict = (one) => ({ verdict: JSON.stringify(one) });
const item = (state, id = "x") => ({ id, title: id, state, detail: "", fix: null });

test("the worst state wins", () => {
  assert.equal(worstState([item("ok"), item("ok")]), "ok");
  assert.equal(worstState([item("ok"), item("warn")]), "warn");
  assert.equal(worstState([item("warn"), item("fail"), item("ok")]), "fail");
  assert.equal(worstState([]), "fail");
  assert.equal(worstState(null), "fail");
});

test("exit code is 1 only when something failed", () => {
  assert.equal(exitCode({ items: [item("ok"), item("warn")] }), 0);
  assert.equal(exitCode({ items: [item("fail")] }), 1);
  assert.equal(exitCode({ items: [] }), 1);
});

test("the clock recipe speaks the platform's ntp, not one platform's", () => {
  assert.equal(readings.fixes.syncClock({ ...ctx, platform: "darwin" }).command, "sudo sntp -sS time.apple.com");
  assert.equal(readings.fixes.syncClock({ ...ctx, platform: "linux" }).command, "sudo timedatectl set-ntp true");
});

test("counting by state", () => {
  assert.deepEqual(countByState([item("ok"), item("ok"), item("fail"), item("skip")]), { ok: 2, warn: 0, fail: 1, skip: 1 });
});

test("a fix that needs a keyboard is not applied on its own", () => {
  assert.equal(fixable({ fix: { label: "a", command: "kubectl scale --replicas=1" } }), true);
  assert.equal(fixable({ fix: { label: "a", command: "setup.sh <your-name>" } }), false);
  assert.equal(fixable({ fix: { label: "a", command: "sudo sntp -sS time.apple.com" } }), false);
  assert.equal(fixable({ fix: { label: "a", command: "kubectl exec -it -n x pod -- gh auth login" } }), false);
  assert.equal(fixable({ fix: { label: "a", command: "/repo/acme/scripts/pod-login.sh ada" } }), false);
  assert.equal(fixable({ fix: null }), false);
  assert.equal(fixable({}), false);
});

test("a shell redirect is not a placeholder", () => {
  assert.equal(fixable({ fix: { label: "a", command: "echo x >> ~/.zshrc 2>/dev/null" } }), true);
});

test("the json parser takes noise around it and returns the contract", () => {
  const raw = `warning: something\n${JSON.stringify({
    dev: "ada", pod: "ws-ada-0", generatedAt: "2026-08-17T12:00:00.000Z",
    items: [{ id: "pod", title: "server up", state: "warn", detail: "it is scaled down to nothing (replicas=0)", fix: { label: "bring the server back up", command: "kubectl scale" } }]
  })}\n`;
  const report = readReport(raw);
  assert.equal(report.dev, "ada");
  assert.equal(report.items.length, 1);
  assert.deepEqual(report.items[0].fix, { label: "bring the server back up", command: "kubectl scale" });
});

test("the json parser refuses anything that is not the contract", () => {
  assert.throws(() => readReport("no json in here"), /returned no json/);
  assert.throws(() => readReport("{broken"), /returned no json|broken json/);
  assert.throws(() => readReport('{"dev":"x"}'), /without the items list/);
  assert.throws(() => readReport('{"items":[{"id":"a","state":"almost"}]}'), /invalid state/);
  assert.throws(() => readReport('{"items":[{"state":"ok"}]}'), /without an id/);
  assert.throws(() => readReport('{"items":[{"id":"a","state":"ok","fix":{"label":"x"}}]}'), /incomplete fix/);
});

test("normalizing an item fills in title and detail", () => {
  assert.deepEqual(normalizeItem({ id: "a", state: "ok" }), { id: "a", title: "a", state: "ok", detail: "", fix: null });
});

test("the human format shows state, fix and a summary", () => {
  const text = formatHuman({
    dev: "ada", pod: "ws-ada-0", generatedAt: "2026-08-17T12:00:00.000Z",
    items: [
      { id: "config", title: "config", state: "ok", detail: "all set", fix: null },
      { id: "pod", title: "server up", state: "warn", detail: "it is scaled down to nothing (replicas=0)", fix: { label: "bring the server back up", command: "kubectl scale" } }
    ]
  });
  assert.match(text, /hive doctor · ada · ws-ada-0/);
  assert.match(text, /OK {2}\s+config\s+all set/);
  assert.match(text, /WARN\s+server up\s+it is scaled down to nothing/);
  assert.match(text, /bring the server back up: kubectl scale/);
  assert.match(text, /2 checks · 1 ok · 1 warn · 0 fail/);
  assert.equal(text.includes("\u001b["), false);
});

test("the same fix is written once", () => {
  const fix = { label: "bring the server back up", command: "kubectl scale" };
  const text = formatHuman({
    dev: "r", pod: "p", generatedAt: "",
    items: [
      { id: "a", title: "a", state: "warn", detail: "d", fix },
      { id: "b", title: "b", state: "warn", detail: "d", fix }
    ]
  });
  assert.equal(text.split("bring the server back up: kubectl scale").length - 1, 1);
});

test("colour only when asked for", () => {
  const report = { dev: "r", pod: "p", generatedAt: "", items: [{ id: "a", title: "a", state: "fail", detail: "d", fix: null }] };
  assert.equal(formatHuman(report).includes("\u001b["), false);
  assert.equal(formatHuman(report, { color: true }).includes("\u001b[31m"), true);
});

test("short time survives a bad iso", () => {
  assert.equal(shortTime("not-a-date"), "not-a-date");
  assert.match(shortTime("2026-08-17T12:00:00.000Z"), /^\d\d\/\d\d \d\d:\d\d:\d\d$/);
});

test("no config with HIVE_DEV in the environment is a warning, without it a failure", () => {
  const withDev = readings.checkConfig({ exists: false, path: "/x/config" }, ctx);
  assert.equal(withDev.state, "warn");
  assert.match(withDev.detail, /HIVE_DEV from the environment/);
  assert.equal(readings.checkConfig({ exists: false, path: "/x/config" }, { ...ctx, dev: "" }).state, "fail");
});

test("config missing keys, and a HIVE_HUB that points nowhere", () => {
  const missing = readings.checkConfig({ exists: true, text: "HIVE_DEV=ada\n", hubExists: false }, ctx);
  assert.equal(missing.state, "fail");
  assert.match(missing.detail, /HIVE_POD, HIVE_HUB/);
  assert.equal(readings.checkConfig({ exists: true, text: CONFIG, hubExists: false }, ctx).state, "warn");
  assert.equal(readings.checkConfig({ exists: true, text: CONFIG, hubExists: true }, ctx).state, "ok");
});

test("a machine with no cluster is not asked for HIVE_POD, and its config reads without an empty one", () => {
  const local = { ...ctx, pod: "", onACluster: false };
  const seen = readings.checkConfig({ exists: true, text: "HIVE_DEV=ada\nHIVE_HUB=/hub\n", hubExists: true }, local);
  assert.equal(seen.state, "ok", "every local-only machine was told its config is unreadable");
  assert.equal(seen.detail, "HIVE_DEV=ada HIVE_HUB=/hub");
  const short = readings.checkConfig({ exists: true, text: "HIVE_DEV=ada\n", hubExists: false }, local);
  assert.equal(short.state, "fail");
  assert.match(short.detail, /missing from the config: HIVE_HUB$/);
  assert.match(readings.checkConfig({ exists: true, text: CONFIG, hubExists: true }, ctx).detail, /HIVE_POD=ws-ada-0/);
});

test("the config reader takes export and quotes", () => {
  assert.deepEqual(readings.readConfig('export HIVE_DEV="ada"\n# a comment\nHIVE_HUB=/a/b\n'), { HIVE_DEV: "ada", HIVE_HUB: "/a/b" });
});

test("the key check asks for the key and nothing on PATH, since the app carries what it runs", () => {
  assert.equal(readings.checkKey({ keyExists: false, path: ctx.key }, ctx).state, "fail");
  const seen = readings.checkKey({ keyExists: true, path: ctx.key }, ctx);
  assert.equal(seen.state, "ok", "a machine with the key was still sent to put ~/.local/bin on PATH");
  assert.equal(seen.fix, null);
  assert.equal(readings.fixes.fixPath, undefined);
});

test("missing dependencies turn into an install command", () => {
  const r = readings.checkDeps(["kubectl", "aws"], ctx);
  assert.equal(r.state, "fail");
  assert.equal(r.fix.command, "brew install kubectl awscli");
  assert.equal(readings.checkDeps([], ctx).state, "ok");
});

test("the cluster tools are only wanted where there is a cluster", () => {
  assert.deepEqual(depsWanted({ pod: "ws-ada-0" }), ["tmux", "gh", "kubectl", "aws"]);
  assert.deepEqual(depsWanted({ pod: "" }), ["tmux", "gh"],
    "a machine with no pod must never be told to install kubectl or aws");
  assert.deepEqual(depsWanted({}), ["tmux", "gh"]);
});

test("the all-clear names the tools it actually looked for, not a list from one deployment", () => {
  assert.match(readings.checkDeps([], ctx, depsWanted({})).detail, /^tmux and gh are all here$/);
  assert.match(readings.checkDeps([], ctx, depsWanted({ pod: "ws-ada-0" })).detail, /kubectl and aws/);
});

test("the android emulator is optional: absent is a quiet skip, half-installed is a warn, an AVD makes it ok", () => {
  const skipped = readings.checkAndroid({ sdk: "", adb: false, emulator: false, avds: [] }, ctx);
  assert.equal(skipped.state, "skip");
  assert.equal(skipped.detail, readings.ANDROID_NOT_CONFIGURED);
  assert.equal(skipped.fix, null);
  assert.equal(readings.checkAndroid({ sdk: "/Users/ada/Android/Sdk", adb: false, emulator: false, avds: [] }, ctx).state, "skip", "a default path that holds nothing is not a finding");
  const half = readings.checkAndroid({ sdk: "/Users/ada/Android/Sdk", adb: true, emulator: false, avds: [] }, { ...ctx, home: "/Users/ada" });
  assert.equal(half.state, "warn");
  assert.match(half.detail, /the emulator is missing from ~\/Android\/Sdk/);
  assert.match(half.fix.command, /sdkmanager "platform-tools" "emulator"/);
  const noAvd = readings.checkAndroid({ sdk: "/Users/ada/Android/Sdk", adb: true, emulator: true, avds: [] }, { ...ctx, home: "/Users/ada" });
  assert.equal(noAvd.state, "warn");
  assert.match(noAvd.detail, /no AVD to boot/);
  assert.equal(noAvd.fix.command, AVD_RECIPE);
  assert.equal(noAvd.fix.label, "create the hive-pixel AVD");
  assert.equal(actionOf(noAvd), "fix");
  const ok = readings.checkAndroid({ sdk: "/Users/ada/Android/Sdk", adb: true, emulator: true, avds: ["hive-pixel", "pixel_7"] }, { ...ctx, home: "/Users/ada" });
  assert.equal(ok.state, "ok");
  assert.equal(ok.detail, "adb and emulator at ~/Android/Sdk · AVDs: hive-pixel, pixel_7");
  assert.equal(ok.fix, null);
});

test("the doctor reads the sdk from the env, or from the home, and never from the machine running the tests", async () => {
  const told = await buildContext({ env: { HOME: "/Users/ada", ANDROID_HOME: "/opt/sdk", PATH: "/usr/bin" }, home: "/Users/ada", repo: "/r" });
  assert.equal(told.androidSdk, "/opt/sdk");
  assert.equal(told.avdHome, "/Users/ada/.android/avd");
  const home = await buildContext({ env: { HOME: "/Users/ada", PATH: "/usr/bin" }, home: "/Users/ada", repo: "/r" });
  assert.match(home.androidSdk, /^\/Users\/ada\/(Android\/Sdk|Library\/Android\/sdk)$/);
  const exec = () => new Promise(() => {});
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true }, { exec, ask: DOOR_ANSWERS, timeouts: { local: 40, cluster: 60, node: 40, probe: 80, podCheck: 90, door: 40 } });
  const android = items.find((i) => i.id === "android");
  assert.equal(android.state, "skip", "a context without an sdk is a skip, whatever this machine has installed");
  assert.equal(android.detail, readings.ANDROID_NOT_CONFIGURED);
});

test("clock: inside the window, close to the edge and past it", () => {
  assert.equal(readings.checkClock({ measured: true, delta: 3 }, ctx).state, "ok");
  const close = readings.checkClock({ measured: true, delta: 40 }, ctx);
  assert.equal(close.state, "warn");
  assert.match(close.detail, /90s/);
  const far = readings.checkClock({ measured: true, delta: -120 }, ctx);
  assert.equal(far.state, "fail");
  assert.match(far.detail, /behind/);
  assert.match(far.detail, /signature invalid/);
});

test("no clock reading with the pod down is a warning that brings it back", () => {
  const r = readings.checkClock({ measured: false }, { ...ctx, podAsleep: true });
  assert.equal(r.state, "warn");
  assert.equal(r.fix.command, `bash ${POWER_SWITCH} up`);
});

const stampedWith = (image) => JSON.stringify({ spec: { replicas: 1, template: { spec: { containers: [{ name: "workspace", image: "node:22-bookworm" }, { name: "server", image: image }] } } } });
const carrying = (image) => JSON.stringify({
  metadata: { name: "ws-ada-0" },
  status: { phase: "Running", containerStatuses: [{ ready: true }] },
  spec: { nodeName: "ip-10-0-0-1", containers: [{ name: "workspace", image: "node:22-bookworm" }, { name: "server", image: image }] }
});
const REGISTRY = "registry.example/hive-broker";

test("one root cause, and the checks that hang off it say so once", () => {
  const items = readings.collapseRootCause([
    { id: "config", title: "c", state: "ok", detail: "fine", fix: null },
    readings.checkPod(verdict({ state: "fail", detail: "it has been going away for 15 min — stuck terminating on a dead machine", fix: "why" }), ctx),
    readings.checkSigners(null, ctx),
    readings.checkCredential(null, ctx),
    readings.checkGh(null, ctx)
  ]);
  const dependents = items.filter((i) => ["allowed-signers", "credential", "gh"].includes(i.id));
  assert.equal(dependents.length, 3);
  for (const entry of dependents) {
    assert.equal(entry.state, "skip");
    assert.equal(entry.detail, "skipped — the server is not up (see the server check)");
    assert.equal(entry.fix, null);
    assert.deepEqual(normalizeItem(entry), entry);
  }
  const root = items.find((i) => i.id === "pod");
  assert.equal(root.state, "fail");
  assert.match(root.detail, /stuck terminating/);
  assert.equal(items.find((i) => i.id === "config").state, "ok");
  assert.equal(worstState(items), "fail");
  assert.equal(items.some((i) => "dependsOn" in i), false);
});

test("an asleep pod collapses its dependents into a single warning", () => {
  const asleep = { ...ctx, podAsleep: true };
  const items = readings.collapseRootCause([
    { id: "config", title: "c", state: "ok", detail: "fine", fix: null },
    readings.checkPod(verdict({ state: "warn", detail: "it is scaled down to nothing (replicas=0)", fix: "up", asleep: true }), asleep),
    readings.checkSigners(null, asleep),
    readings.checkCredential(null, asleep),
    readings.checkGh(null, asleep)
  ]);
  const dependents = items.filter((i) => ["allowed-signers", "credential", "gh"].includes(i.id));
  assert.equal(dependents.length, 3);
  for (const entry of dependents) {
    assert.equal(entry.state, "skip");
    assert.equal(entry.detail, readings.SKIPPED_DOWN_POD);
    assert.equal(entry.fix, null);
    assert.deepEqual(normalizeItem(entry), entry);
  }
  const root = items.find((i) => i.id === "pod");
  assert.equal(root.state, "warn");
  assert.equal(root.detail, "it is scaled down to nothing (replicas=0)");
  assert.equal(root.fix.label, "bring the server back up");
  assert.equal(worstState(items), "warn");
  assert.equal(items.some((i) => "dependsOn" in i || "asleep" in i), false);
});

test("nothing is skipped while the pod check itself is not a failure", () => {
  const items = readings.collapseRootCause([
    readings.checkPod(alive, ctx),
    readings.checkSigners(null, ctx)
  ]);
  assert.equal(items[1].state, "fail");
  assert.match(items[1].detail, /the server did not answer/);
});

test("a skipped check is discreet and counted apart", () => {
  const text = formatHuman({
    dev: "r", pod: "p", generatedAt: "",
    items: [
      { id: "pod", title: "server up", state: "fail", detail: "pod is being removed since 15 min", fix: null },
      { id: "gh", title: "gh", state: "skip", detail: readings.SKIPPED, fix: null }
    ]
  });
  assert.match(text, /SKIP\s+gh\s+skipped — the server is not up/);
  assert.match(text, /2 checks · 0 ok · 0 warn · 1 fail · 1 skipped/);
});

test("the black box keeps a detail that carries spaces whole", () => {
  const [entry] = readings.readBootLog("2026-08-20T02:33:41Z boot-error step=apt-base detail=failed after 3 attempts");
  assert.deepEqual(entry, { at: "2026-08-20T02:33:41Z", kind: "boot-error", fields: { step: "apt-base", detail: "failed after 3 attempts" } });
});

test("the black box reports the steps the last boot stumbled on", () => {
  const broken = readings.checkLastBoot([
    "2026-08-19T09:00:00Z boot",
    "2026-08-20T09:00:00Z boot",
    "2026-08-20T09:00:04Z boot-error step=repos detail=clone-failed",
    "2026-08-20T09:00:09Z boot-error step=gh detail=logged-out"
  ].join("\n"), ctx);
  assert.equal(broken.state, "warn");
  assert.match(broken.detail, /the last boot failed on repos, gh/);
  assert.match(broken.fix.command, /tail -40 \/workspace\/hive\/boot\.log/);
  const healed = readings.checkLastBoot([
    "2026-08-19T09:00:00Z boot-error step=repos detail=clone-failed",
    "2026-08-20T09:00:00Z boot"
  ].join("\n"), ctx);
  assert.equal(healed.state, "ok");
});

test("no boot.log is a quiet ok, and a pod that is down is not a failed boot", () => {
  const empty = readings.checkLastBoot("", ctx);
  assert.equal(empty.state, "ok");
  assert.match(empty.detail, /no black box yet/);
  assert.equal(empty.fix, null);
  assert.equal(readings.checkLastBoot("garbage without a date", ctx).state, "ok");
  const booted = readings.checkLastBoot("2026-08-20T09:00:00Z boot", ctx);
  assert.equal(booted.state, "ok");
  assert.match(booted.detail, /booted at 2026-08-20T09:00:00Z, with nothing failing since/);
  const down = readings.checkLastBoot(null, { ...ctx, podAsleep: true });
  assert.equal(down.state, "warn");
  assert.equal(down.fix.label, "bring the server back up");
});

test("the cluster is read once, through the deployment's own script, and never by the app", async () => {
  const seen = [];
  const exec = (cmd, args) => {
    seen.push([cmd, ...args]);
    return Promise.resolve({ ok: true, out: JSON.stringify({ state: "ok", detail: "up" }), err: "" });
  };
  await runChecks(
    { ...ctx, hasConfig: true, configText: CONFIG, hubExists: true },
    { exec, probe: () => Promise.resolve({ ok: true, out: "", err: "" }), platform: "linux" }
  );
  assert.deepEqual(seen, [["bash", ctx.powerSwitch, "verdict"]],
    "the doctor read the cluster itself instead of asking the deployment that owns it for a verdict");
});

test("on Windows, the cluster's script is read with Git's bash, not whatever \"bash\" resolves to first", async () => {
  const seen = [];
  const exec = (cmd, args) => {
    seen.push([cmd, ...args]);
    return Promise.resolve({ ok: true, out: JSON.stringify({ state: "ok", detail: "up" }), err: "" });
  };
  await runChecks(
    { ...ctx, hasConfig: true, configText: CONFIG, hubExists: true },
    {
      exec,
      probe: () => Promise.resolve({ ok: true, out: "", err: "" }),
      platform: "win32",
      gitBashOf: () => "C:\\Program Files\\Git\\bin\\bash.exe"
    }
  );
  assert.deepEqual(seen, [["C:\\Program Files\\Git\\bin\\bash.exe", ctx.powerSwitch, "verdict"]],
    "on win32, plain \"bash\" can resolve to the WSL launcher in System32 before it ever reaches Git's — the doctor has to ask for Git's bash by name, the same way a fix already does");
});

test("the pod check shows what whoever hosts the server said, and turns its word into the right fix", () => {
  const asked = (verdict) => readings.checkPod({ verdict: JSON.stringify(verdict) }, ctx);

  const asleep = asked({ state: "warn", detail: "it is scaled down to nothing (replicas=0)", fix: "up", asleep: true });
  assert.equal(asleep.state, "warn");
  assert.equal(asleep.detail, "it is scaled down to nothing (replicas=0)");
  assert.equal(asleep.asleep, true);
  assert.equal(asleep.fix.command, `bash ${POWER_SWITCH} up`);

  const stuck = asked({ state: "fail", detail: "it has been going away for 15 min", fix: "force-remove" });
  assert.equal(stuck.fix.command, `bash ${POWER_SWITCH} force-remove`);
  assert.equal(fixable(stuck), false, "force-remove is not something --fix may do on its own");

  const deadNode = asked({ state: "fail", detail: "the machine is NotReady", fix: "why-node", node: "ip-10-0-0-1" });
  assert.match(deadNode.fix.command, /why-node ip-10-0-0-1/);

  const fine = asked({ state: "ok", detail: "up and answering on ip-10-0-0-1" });
  assert.equal(fine.state, "ok");
  assert.equal(fine.fix, null);

  const noFix = asked({ state: "fail", detail: "the cluster would not say what ws-ada is doing" });
  assert.equal(noFix.fix, null, "a reading nobody can act on was given a button anyway");
});

test("a host that cannot answer at all is a failure that names its silence, not an invented diagnosis", () => {
  const mute = readings.checkPod({ verdict: "", verdictErr: "bash: no such file" }, ctx);
  assert.equal(mute.state, "fail");
  assert.match(mute.detail, /could not say whether it is up/);
  assert.match(mute.detail, /no such file/);
  assert.equal(mute.fix, null);

  const nonsense = readings.checkPod({ verdict: "isso nao e json" }, ctx);
  assert.equal(nonsense.state, "fail");
  assert.match(nonsense.detail, /could not say whether it is up/);
});

test("a cluster too slow to describe the box never contradicts a script that just ran inside it", () => {
  const late = { verdict: "", verdictErr: "no answer in 13s while reading the cluster" };

  const probed = readings.checkPod(late, ctx, true);
  assert.equal(probed.state, "ok", "the probe entered the pod, so the pod is up");
  assert.match(probed.detail, /up and answering/);
  assert.match(probed.detail, /too slow to describe it/, "the slowness is kept visible, not swallowed");
  assert.equal(probed.fix, null);

  const blind = readings.checkPod(late, ctx, false);
  assert.equal(blind.state, "fail", "with nothing reaching the pod, silence is still a failure");
  assert.match(blind.detail, /could not say whether it is up/);
});

test("a cluster nobody can reach is not a box that is down", () => {
  const unreachable = {
    verdict: JSON.stringify({ detail: "the cluster would not say what ws-ada-0 is doing: localhost:8080 was refused" }),
    verdictErr: ""
  };

  const probed = readings.checkPod(unreachable, ctx, true);
  assert.equal(probed.state, "ok", "a machine with no kubectl still reached the box through its door");
  assert.match(probed.detail, /could not describe it/);
  assert.doesNotMatch(probed.detail, /too slow/, "it answered at once; it just had nothing to say");

  const blind = readings.checkPod(unreachable, ctx, false);
  assert.equal(blind.state, "fail", "nothing reached the box, so nobody can vouch for it");
  assert.match(blind.detail, /localhost:8080 was refused/, "the reason the cluster gave is what the reader needs");
});

test("a fix that works inside the box carries the script the door can run", () => {
  const fix = readings.fixes.syncHubContext(ctx);
  assert.match(fix.command, /pod-power\.sh exec/, "the printed command still goes through the power switch");
  assert.ok(fix.podScript, "without the bare script a machine with no kubectl cannot apply this fix");
  assert.doesNotMatch(fix.podScript, /kubectl|pod-power/, "the door runs the work, not the way in");
});

test("a verdict that did arrive still outranks the probe", () => {
  const dying = { verdict: JSON.stringify({ state: "fail", detail: "it has been going away for 15 min", fix: "force-remove" }) };
  const said = readings.checkPod(dying, ctx, true);
  assert.equal(said.state, "fail", "a pod answering while it terminates is still on its way out");
  assert.match(said.detail, /going away/);
});

test("the contract blob follows CLAUDE.md when it is a symlink, and reads it plainly when it is not", () => {
  const tmp = mkdtempSync(join(tmpdir(), "hive-contract-"));
  const git = (...args) => spawnSync("git", ["-C", tmp, ...args], { encoding: "utf8" });
  const blobOf = (ref) => spawnSync("bash", ["-c", `${contractBlobShell(tmp)}\ncontract_blob ${ref}`], { encoding: "utf8" }).stdout.trim();

  git("init", "-q", "-b", "main");
  git("config", "user.email", "doctor@example.com");
  git("config", "user.name", "doctor");

  writeFileSync(join(tmp, "CLAUDE.md"), "o contrato inteiro\n");
  git("add", "-A");
  git("commit", "-qm", "a plain file");
  assert.equal(blobOf("main"), git("rev-parse", "main:CLAUDE.md").stdout.trim(), "a real file is read as itself");

  rmSync(join(tmp, "CLAUDE.md"));
  writeFileSync(join(tmp, "AGENTS.md"), "o contrato inteiro\n");
  symlinkSync("AGENTS.md", join(tmp, "CLAUDE.md"));
  git("add", "-A");
  git("commit", "-qm", "CLAUDE.md follows AGENTS.md");

  const link = git("rev-parse", "main:CLAUDE.md").stdout.trim();
  const target = git("rev-parse", "main:AGENTS.md").stdout.trim();
  assert.notEqual(link, target, "the link and what it points at are different blobs, which is the whole bug");
  assert.equal(blobOf("main"), target, "the comparison must land on the contract, not on the nine bytes naming it");

  rmSync(tmp, { recursive: true, force: true });
});

test("a hive that is not on a cluster is not asked about one at all", () => {
  const off = readings.checkPod({ verdict: "" }, { ...ctx, onACluster: false });
  assert.equal(off.state, "skip");
  assert.equal(off.detail, readings.NOT_ON_A_CLUSTER);
});

test("a check cut short says what it was waiting for", () => {
  const r = timedOut({ id: "disk", title: "space on /workspace", timeout: 9000 });
  assert.match(r.detail, /no answer in 9s while checking space on \/workspace/);
});

test("a missing allowed_signers is a security failure with a fix that authorizes the key", () => {
  const r = readings.checkSigners("absent", ctx);
  assert.equal(r.state, "fail");
  assert.match(r.detail, /trusts nobody but the owner key/);
  assert.match(r.fix.command, /\/workspace\/hive\/allowed_signers/);
  assert.match(r.fix.command, /AAAAC3NzaC1lZDI1NTE5AAAAIExample/);
});

test("allowed_signers without your key is a failure too", () => {
  const r = readings.checkSigners("missing-key\njonas vini", ctx);
  assert.equal(r.state, "fail");
  assert.match(r.detail, /jonas vini/);
  assert.equal(readings.checkSigners("has\nada", ctx).state, "ok");
});

const credential = (over = {}) => JSON.stringify({ token: true, expires: Date.now() + 3600000, refresh: true, plan: "max", ...over });

test("the Claude credential", () => {
  assert.equal(readings.checkCredential("{}", ctx).state, "fail");
  assert.match(readings.checkCredential("{}", ctx).fix.command, /pod-login\.sh ada/);
  assert.equal(readings.checkCredential(credential(), ctx).state, "ok");
});

test("a credential that expired with no refresh token cannot be renewed, so it fails", () => {
  const dead = readings.checkCredential(credential({ expires: 0, refresh: false }), ctx);
  assert.equal(dead.state, "fail");
  assert.match(dead.detail, /no refresh token/);
  assert.match(dead.fix.command, /pod-login\.sh ada/);
  assert.equal(readings.checkCredential(credential({ expires: 0 }), ctx).state, "warn");
});

test("remote control blames the credential when restarting it cannot help", () => {
  const blocked = readings.checkRemoteControl("down", ctx, credential({ expires: 0, refresh: false }));
  assert.equal(blocked.state, "fail");
  assert.match(blocked.detail, /needs a login/);
  assert.match(blocked.fix.command, /pod-login\.sh ada/);
  const plain = readings.checkRemoteControl("down", ctx, credential());
  assert.match(plain.detail, /no tmux session rc/);
});

test("flags: a missing bypass fails, trust and cross only warn", () => {
  const trusted = Object.fromEntries(ctx.trustedDirs.map((d) => [d, true]));
  const serious = readings.checkFlags(JSON.stringify({ onboarding: true, bypass: false, trusted, cross: "accept" }), ctx);
  assert.equal(serious.state, "fail");
  assert.match(serious.detail, /stalls on a dialog/);
  const minor = readings.checkFlags(JSON.stringify({ onboarding: true, bypass: true, trusted, cross: "" }), ctx);
  assert.equal(minor.state, "warn");
  assert.match(minor.detail, /crossSessionInbound/);
  assert.equal(readings.checkFlags(JSON.stringify({ onboarding: true, bypass: true, trusted, cross: "accept" }), ctx).state, "ok");
  assert.equal(readings.checkFlags("nothing", ctx).state, "fail");
});

test("remote control: no session, not connected, alive", () => {
  assert.equal(readings.checkRemoteControl("down", ctx).state, "fail");
  assert.equal(readings.checkRemoteControl("Loading...", ctx).state, "warn");
  assert.equal(readings.checkRemoteControl("Remote control Ready", ctx).state, "ok");
  assert.equal(readings.checkRemoteControl("[15:06:10] Reconnected after 3s\n[15:06:44] Reconnected after 6s", ctx).state, "ok");
  assert.equal(
    readings.checkRemoteControl(
      "Continue coding in the Claude mobile app or https://claude.ai/code?environment=env_018QhQ\nspace to show QR code · w to toggle spawn mode",
      ctx
    ).state,
    "ok"
  );
});

test("repos: absent, no .git, complete", () => {
  const absent = readings.checkRepos("ok acme-hub", ctx);
  assert.equal(absent.state, "fail");
  assert.match(absent.detail, /not cloned: dev-workspaces/);
  assert.match(absent.fix.command, /git clone/);
  const noGit = readings.checkRepos("ok acme-hub\nno-git dev-workspaces", ctx);
  assert.equal(noGit.state, "fail");
  assert.match(noGit.detail, /no \.git: dev-workspaces/);
  assert.equal(readings.checkRepos("ok acme-hub\nok dev-workspaces\nok other", ctx).state, "ok");
});

test("canonical hub context", () => {
  const frozen = { ...ctx, now: () => new Date("2026-08-20T18:00:00Z").getTime() };
  assert.equal(readings.checkHubContext(null, { ...frozen, podAsleep: true }).state, "warn");
  const missing = readings.checkHubContext("absent", frozen);
  assert.equal(missing.state, "warn");
  assert.match(missing.fix.command, /context\.mjs/);
  const dirty = readings.checkHubContext("present tip=abc123 behind=0 dirty=2 at=2026-08-20T17:00:00Z\nseat:ok\nstale:", frozen);
  assert.equal(dirty.state, "fail");
  assert.match(dirty.detail, /2 local change/);
  const behind = readings.checkHubContext("present tip=abc123 behind=3 dirty=0 at=2026-08-20T17:30:00Z\nseat:ok\nstale:", frozen);
  assert.equal(behind.state, "warn");
  assert.match(behind.detail, /3 commit\(s\) behind origin\/main/);
  const old = readings.checkHubContext("present tip=abc123 behind=0 dirty=0 at=2026-08-18T17:00:00Z\nseat:ok\nstale:", frozen);
  assert.equal(old.state, "warn");
  assert.match(old.detail, /older than 24h/);
  const fine = readings.checkHubContext("present tip=abc123 behind=0 dirty=0 at=2026-08-20T17:30:00Z\nseat:ok\nstale: oi", frozen);
  assert.equal(fine.state, "ok");
});

test("hub contract in the seats", () => {
  assert.equal(readings.checkHubContract("absent", ctx).state, "skip");
  const clean = readings.checkHubContract("present tip=abc behind=0 dirty=0 at=x\nseat:ok\nstale:", ctx);
  assert.equal(clean.state, "ok");

  const onlyWorktrees = readings.checkHubContract("present tip=abc behind=0 dirty=0 at=x\nseat:ok\nstale: oi colecoes-acme-professor", ctx);
  assert.equal(onlyWorktrees.state, "ok");
  assert.match(onlyWorktrees.detail, /2 worktree\(s\) on an older contract/);

  const seatStale = readings.checkHubContract("present tip=abc behind=0 dirty=0 at=x\nseat:stale\nstale: oi", ctx);
  assert.equal(seatStale.state, "warn");
  assert.match(seatStale.detail, /older CLAUDE\.md than origin\/main/);
  assert.match(seatStale.fix.command, /pull --ff-only/);

  const noSeat = readings.checkHubContract("present tip=abc behind=0 dirty=0 at=x\nseat:absent\nstale:", ctx);
  assert.equal(noSeat.state, "warn");
  assert.match(noSeat.fix.command, /pod-mirror\.sh/);
});

test("gh on the pod", () => {
  assert.equal(readings.checkGh("logged-out", ctx).state, "fail");
  const logged = readings.checkGh("logged-in adaandrade", ctx);
  assert.equal(logged.state, "ok");
  assert.match(logged.detail, /adaandrade/);
});

test("memory: no plugin, no credential and a live session each read differently", () => {
  const absent = readings.checkMemory(JSON.stringify({ installed: false, enabled: false, user: "", refresh: false, expiresIn: 0 }), ctx);
  assert.equal(absent.state, "fail");
  assert.match(absent.fix.command, /pod-memory\.sh ada/);
  const disabled = readings.checkMemory(JSON.stringify({ installed: true, enabled: false, user: "ada", refresh: true, expiresIn: 600 }), ctx);
  assert.equal(disabled.state, "fail");
  assert.match(disabled.detail, /disabled/);
  const anonymous = readings.checkMemory(JSON.stringify({ installed: true, enabled: true, user: "", refresh: false, expiresIn: 0 }), ctx);
  assert.equal(anonymous.state, "fail");
  assert.match(anonymous.detail, /Not authenticated/);
  const stale = readings.checkMemory(JSON.stringify({ installed: true, enabled: true, user: "ada", refresh: false, expiresIn: -60 }), ctx);
  assert.equal(stale.state, "warn");
  const live = readings.checkMemory(JSON.stringify({ installed: true, enabled: true, user: "ada", refresh: true, expiresIn: 1800 }), ctx);
  assert.equal(live.state, "ok");
  assert.match(live.detail, /ada/);
  const refreshable = readings.checkMemory(JSON.stringify({ installed: true, enabled: true, user: "ada", refresh: true, expiresIn: -60 }), ctx);
  assert.equal(refreshable.state, "ok");
  assert.match(refreshable.detail, /refreshes on the next session/);
  assert.equal(readings.checkMemory("garbage", ctx).state, "fail");
});

test("cloud sessions: unconfigured, broken, stale and healthy each read differently", () => {
  const state = (data) => readings.checkCloudSessions(JSON.stringify(data), ctx);
  const absent = state({ repo: "", script: false, lastSync: 0, lastLog: "", now: Date.now() });
  assert.equal(absent.state, "warn");
  assert.match(absent.fix.command, /pod-cloud-sessions\.sh ada/);
  assert.equal(fixable(absent), false);
  const noScript = state({ repo: "https://github.com/ada/claude-sessions.git", script: false, lastSync: 0, lastLog: "", now: Date.now() });
  assert.equal(noScript.state, "fail");
  assert.match(noScript.detail, /cloud-sessions\.mjs/);
  const never = state({ repo: "https://github.com/ada/claude-sessions.git", script: true, lastSync: 0, lastLog: "", now: Date.now() });
  assert.equal(never.state, "warn");
  assert.match(never.fix.command, /cloud-sessions\.mjs sync/);
  assert.equal(fixable(never), true);
  const broken = state({ repo: "https://github.com/ada/claude-sessions.git", script: true, lastSync: Date.now() - 60000, lastLog: "2026-08-19T12:00:00.000Z error: git push died", now: Date.now() });
  assert.equal(broken.state, "warn");
  assert.match(broken.detail, /git push died/);
  const healthy = state({ repo: "https://github.com/ada/claude-sessions.git", script: true, lastSync: Date.now() - 300000, lastLog: "2026-08-19T12:00:00.000Z pulled=1 pushed=2 unchanged=40", now: Date.now() });
  assert.equal(healthy.state, "ok");
  assert.match(healthy.detail, /5 min ago/);
  assert.equal(readings.checkCloudSessions("garbage", ctx).state, "warn");
});

test("the memory probe reports the credential without carrying it", () => {
  const script = probeScript(ctx);
  assert.match(script, /==memory/);
  assert.equal(/cred\.token|creds\.token|refreshToken:cred\.refreshToken/.test(script), false);
  assert.match(script, /refresh:!!cred\.refreshToken/);
});

test("disk: reads df -k and scales the state", () => {
  assert.equal(readings.checkDisk("/dev/nvme1n1 104857600 52428800 52428800 50% /workspace", ctx).state, "ok");
  assert.equal(readings.checkDisk("/dev/nvme1n1 104857600 94371840 10485760 90% /workspace", ctx).state, "warn");
  const full = readings.checkDisk("/dev/nvme1n1 104857600 102760448 2097152 98% /workspace", ctx);
  assert.equal(full.state, "fail");
  assert.match(full.detail, /98% used/);
  assert.equal(readings.checkDisk("garbage", ctx).state, "warn");
});

test("a pod check does not invent a failure while the pod sleeps", () => {
  const asleep = { ...ctx, podAsleep: true };
  for (const check of [
    readings.checkSigners(null, asleep),
    readings.checkCredential(null, asleep),
    readings.checkFlags(null, asleep),
    readings.checkMemory(null, asleep),
    readings.checkCloudSessions(null, asleep),
    readings.checkRemoteControl(null, asleep),
    readings.checkRepos(null, asleep),
    readings.checkGh(null, asleep),
    readings.checkDisk(null, asleep)
  ]) {
    assert.equal(check.state, "warn");
    assert.equal(check.fix.label, "bring the server back up");
  }
});

test("without HIVE_POD the pod checks point at setup", () => {
  const r = readings.checkSigners(null, { ...ctx, pod: "", dev: "" });
  assert.equal(r.state, "fail");
  assert.match(r.fix.command, /setup\.sh/);
});

test("the probe output is sliced by section", () => {
  const map = readings.sliceProbe("==clock\n1755432000\n==disk\nthe df line\n");
  assert.equal(map.clock, "1755432000");
  assert.equal(map.disk, "the df line");
});

test("every section marker opens its own line, even after output with no trailing newline", () => {
  const script = probeScript(ctx);
  const markers = [...script.matchAll(/^printf '\\n==(\w+)\\n'/gm)].map((m) => m[1]);
  for (const section of ["clock", "signers", "credential", "flags", "memory", "boot", "cloudsessions", "control", "repos", "context", "gh", "mcpenv", "disk"]) {
    assert.ok(markers.includes(section), `${section} must open its own line`);
  }
  assert.equal(/^echo "==/m.test(script), false);
});

test("a section whose command prints no trailing newline does not swallow the next marker", () => {
  const glued = "\n==mcpenv\n" + JSON.stringify({ ok: true, configurados: 15 }) + "\n==disk\n/dev/nvme4n1 102626232 3267988 99341860 4% /workspace\n";
  const map = readings.sliceProbe(glued);
  assert.equal(map.mcpenv, JSON.stringify({ ok: true, configurados: 15 }));
  assert.equal(readings.checkDisk(map.disk, ctx).state, "ok");
});

test("the probe neither asks for nor prints a secret", () => {
  const script = probeScript(ctx);
  assert.match(script, /grep -qF '.*' \/workspace\/hive\/allowed_signers/);
  assert.equal(/cat \/workspace\/hive\/allowed_signers/.test(script), false);
  assert.equal(/cat .*credentials\.json/.test(script), false);
  assert.equal(/\/\.env\b/.test(script), false);
  assert.equal(/printenv|env \|/.test(script), false);
  assert.match(probeScript({ ...ctx, publicKey: "" }), /if false; then/);
});

test("withTimeout falls back when the promise is late", async () => {
  const slow = new Promise((r) => setTimeout(() => r("late"), 200));
  assert.equal(await withTimeout(slow, 20, "fallback"), "fallback");
  assert.equal(await withTimeout(Promise.resolve("early"), 50, "fallback"), "early");
  assert.equal(await withTimeout(Promise.reject(new Error("x")), 50, "fallback"), "fallback");
});

test("a cut short check is still a valid item", () => {
  const r = timedOut({ id: "disk", title: "space", timeout: 9000 });
  assert.deepEqual(normalizeItem(r), r);
  assert.match(r.detail, /9s/);
});

test("the 15s ceiling holds for the whole doctor", () => {
  const slowest = Math.max(TIMEOUTS.local, TIMEOUTS.cluster + TIMEOUTS.node + 1000, TIMEOUTS.probe, TIMEOUTS.podCheck);
  assert.ok(slowest < 15000, `the slowest check can take ${slowest}ms`);
});

test("a dead cluster does not hold the local checks and still returns 21 items", async () => {
  const started = Date.now();
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true }, {
    exec: () => new Promise(() => {}),
    ask: DOOR_ANSWERS,
    timeouts: { local: 40, cluster: 60, node: 40, probe: 80, podCheck: 90, door: 40 }
  });
  const spent = Date.now() - started;
  assert.equal(items.length, 21);
  assert.equal(new Set(items.map((i) => i.id)).size, 21);
  for (const check of items) normalizeItem(check);
  assert.ok(spent < 800, `it took ${spent}ms`);
  assert.equal(items.find((i) => i.id === "config").state, "ok");
});

test("with the probe answering, the 21 items come from one snapshot", async () => {
  const probe = [
    "==clock", String(Math.floor(Date.now() / 1000)),
    "==cli", "a".repeat(64),
    "==signers", "has", "ada",
    "==credential", JSON.stringify({ token: true, expires: Date.now() + 3600000, refresh: true, plan: "max" }),
    "==flags", JSON.stringify({ onboarding: true, bypass: true, trusted: Object.fromEntries(ctx.trustedDirs.map((d) => [d, true])), cross: "accept" }),
    "==memory", JSON.stringify({ installed: true, enabled: true, user: "ada", refresh: true, expiresIn: 1800 }),
    "==boot", "2026-08-19T09:00:00Z boot", "2026-08-20T09:00:00Z boot",
    "==cloudsessions", JSON.stringify({ repo: "https://github.com/ada/claude-sessions.git", script: true, lastSync: Date.now() - 120000, lastLog: "2026-08-19T12:00:00.000Z pulled=0 pushed=2 unchanged=40", now: Date.now() }),
    "==control", "Ready",
    "==repos", "ok acme-hub", "ok dev-workspaces",
    "==gh", "logged-in adaandrade",
    "==context", `present tip=abc123 behind=0 dirty=0 at=${new Date().toISOString()}`, "seat:ok", "stale:",
    "==mcpenv", JSON.stringify({ ok: true, configurados: 14, envFile: "/workspace/repos/acme-hub/.env", faltando: {} }),
    "==disk", "/dev/nvme1n1 104857600 52428800 52428800 50% /workspace"
  ].join("\n");
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true }, {
    exec: describing(),
    probe: () => Promise.resolve({ ok: true, out: probe, err: "" }),
    ask: DOOR_ANSWERS
  });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(items.length, 21);
  assert.equal(byId["cloud-door"].state, "ok");
  assert.equal(byId["last-boot"].state, "ok");
  assert.match(byId["last-boot"].detail, /booted at 2026-08-20T09:00:00Z, with nothing failing since/);
  assert.equal(byId.clock.state, "ok");
  assert.equal(byId.pod.state, "ok");
  assert.equal(byId["allowed-signers"].state, "ok");
  assert.equal(byId.disk.state, "ok");
  assert.equal(byId["mcp-env"].state, "ok");
  assert.equal(byId.gh.state, "ok");
  assert.equal(byId.memory.state, "ok");
  assert.equal(byId["cloud-sessions"].state, "ok");
  assert.equal(byId["hub-context"].state, "ok");
  assert.equal(byId["hub-contract"].state, "ok");
  assert.equal(worstState(items.filter((i) => !["key", "deps"].includes(i.id))), "ok");
});

test("a kubelet that died gives one rich failure and fifteen quiet skips", async () => {
  const dead = JSON.stringify({
    metadata: { name: "ws-ada-0", deletionTimestamp: "2026-08-19T15:05:00Z" },
    status: { phase: "Running", containerStatuses: [{ ready: true }] },
    spec: { nodeName: "ip-10-0-0-1" }
  });
  const exec = describing({ state: "fail", detail: "it has been going away for 15 min — stuck terminating on the machine ip-10-0-0-1, which is NotReady", fix: "force-remove" });
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true }, {
    exec,
    processes: async () => ({ rows: [], windows: [] }),
    ask: DOOR_IS_NOT_THERE,
    now: () => Date.parse("2026-08-19T15:20:00Z"),
    timeouts: { local: 40, cluster: 60, node: 40, probe: 80, podCheck: 90, door: 40 }
  });
  const root = items.find((i) => i.id === "pod");
  assert.equal(root.state, "fail");
  assert.match(root.detail, /going away for 15 min — stuck terminating on the machine ip-10-0-0-1, which is NotReady/);
  assert.equal(items.find((i) => i.id === "android").detail, readings.ANDROID_NOT_CONFIGURED, "the local skip keeps its own reason");
  const skipped = items.filter((i) => i.state === "skip" && i.id !== "android");
  assert.equal(skipped.length, 15);
  assert.equal(new Set(skipped.map((i) => i.detail)).size, 1);
  assert.equal(skipped.filter((i) => i.fix).length, 0);
  assert.deepEqual(skipped.map((i) => i.id).sort(), [
    "allowed-signers", "clock", "cloud-door", "cloud-sessions", "credential", "disk", "flags", "gh", "hub-context", "hub-contract", "last-boot", "mcp-env", "memory", "remote-control", "repos"
  ]);
});

test("every node script a fix carries is something node can parse", () => {
  const commands = [readings.fixes.preAcceptFlags(ctx).command, probeScript(ctx)];
  const scripts = commands.flatMap((command) => [...String(command).matchAll(/node -e '(?:\\'')?([\s\S]*?)(?:'\\'')?'/g)].map((m) => m[1]));
  assert.ok(scripts.length >= 2, `found ${scripts.length} node scripts`);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script), `broken script: ${script.slice(0, 80)}`);
});

test("the trusted dirs reach the pod as plain json, with no stray escapes", () => {
  const command = readings.fixes.preAcceptFlags(ctx).command;
  assert.ok(command.includes(JSON.stringify(ctx.trustedDirs)), command);
  assert.ok(!command.includes('\\"'), "the fix is escaping quotes for a wrapper that does not exist");
});

test("chained fix steps stop at the first failure and carry its exit code", () => {
  const failing = spawnSync("bash", ["-c", readings.chain("exit 3", "true")]);
  assert.equal(failing.status, 3);
  const passing = spawnSync("bash", ["-c", readings.chain("true", "true")]);
  assert.equal(passing.status, 0);
});

test("a fix is only reported as done when the check itself turned ok", () => {
  const before = { items: [{ id: "flags", state: "warn", detail: "missing trust" }] };
  const after = { items: [{ id: "flags", state: "ok", detail: "all in place" }] };
  assert.equal(fixOutcome("flags", after).ok, true);
  assert.equal(fixOutcome("flags", before).ok, false);
  assert.match(fixOutcome("flags", before).note, /still warn/);
  assert.equal(fixOutcome("flags", { items: [] }).ok, false);
});

const ALIVE_POD = JSON.stringify({ status: { phase: "Running", containerStatuses: [{ ready: true }] }, spec: { nodeName: "node-1" } });

const describing = (said = { state: "ok", detail: "up and answering on ip-10-0-0-1" }) =>
  (cmd, args) => (args.includes("verdict")
    ? Promise.resolve({ ok: true, out: JSON.stringify(said), err: "" })
    : Promise.resolve({ ok: true, out: "", err: "" }));

function podUp(onProbe) {
  return { exec: describing(), probe: (_ctx, _script, _timeout) => onProbe() };
}

test("the check inside the server goes over its own door, never by shelling into a container", async () => {
  const runner = readFileSync(join(REPO, "app/doctor/doctor-runner.mjs"), "utf8");
  assert.match(runner, /client\.post\("\/api\/run"/, "the doctor stopped asking the server to run its own check");
  assert.doesNotMatch(runner, /"exec"/, "the doctor shells into a container again");
  assert.doesNotMatch(runner, /withWorkspaceContainer/, "the doctor still knows what a container is");
});

test("an exec that fails outright says why, instead of blaming a clock it never ran out", async () => {
  const err = 'error: Internal error occurred: Internal error occurred: OCI runtime exec failed: exec: "bash": executable file not found in $PATH';
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true },
    podUp(() => Promise.resolve({ ok: false, out: "", err })));
  const gh = items.find((i) => i.id === "gh");
  assert.equal(gh.state, "fail");
  assert.match(gh.detail, /would not run the check/);
  assert.match(gh.detail, /executable file not found in \$PATH/);
  assert.doesNotMatch(gh.detail, /did not answer/);
  assert.doesNotMatch(gh.detail, /Internal error occurred/);
});

test("an exec that truly hangs is still reported as a wait that ran out", async () => {
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true }, {
    ...podUp(() => new Promise(() => {})),
    timeouts: { local: 40, cluster: 60, node: 40, probe: 600, podCheck: 900 }
  });
  const gh = items.find((i) => i.id === "gh");
  assert.equal(gh.state, "fail");
  assert.match(gh.detail, /the server did not answer within 1s/);
});

test("every fix that reaches into the pod names the container", () => {
  for (const [name, make] of Object.entries(readings.fixes)) {
    const fix = make(ctx, ["acme-hub"]);
    if (!/kubectl (exec|cp)/.test(fix.command)) continue;
    assert.match(fix.command, /-c workspace/, `the fix ${name} reaches the pod without naming the container`);
  }
});

test("the door check tells a door that was never opened from one that stopped answering", () => {
  const absent = readings.checkCloudDoor({ url: "https://hive-ada.hive.example", ok: false, error: "getaddrinfo ENOTFOUND hive-ada.hive.example" }, ctx);
  assert.equal(absent.state, "fail");
  assert.match(absent.detail, /no door was ever opened for ada/);
  assert.match(absent.detail, /this hive has no server for that side yet/);
  assert.equal(absent.fix.command, `${ctx.repo}/acme/scripts/pod-door.sh ada open`);
  assert.equal(absent.dependsOn, "pod");

  const quiet = readings.checkCloudDoor({ url: "https://hive-ada.hive.example", ok: false, error: "the door answered 502" }, ctx);
  assert.equal(quiet.state, "warn");
  assert.match(quiet.detail, /did not answer: the door answered 502/);

  const open = readings.checkCloudDoor({ url: "https://hive-ada.hive.example", ok: true, fingerprint: "SHA256:x" }, ctx);
  assert.equal(open.state, "ok");
  assert.equal(open.fix, null);
  assert.equal(open.dependsOn, undefined);

  const nameless = readings.checkCloudDoor({ url: "", ok: false, error: "" }, { ...ctx, dev: "" });
  assert.equal(nameless.state, "fail");
  assert.match(nameless.detail, /no HIVE_DEV/);
});

test("a hive with no server address is not warned about a door it never had", () => {
  const local = { ...ctx, serverUrl: "", onACluster: false };
  const seen = readings.checkCloudDoor({ url: "", ok: false, error: "this hive has no server address — put one in HIVE_SERVER_URL" }, local);
  assert.equal(seen.state, "skip");
  assert.equal(seen.fix, null);
});

test("opening a door is never applied unattended — it changes a shared production balancer", () => {
  const fix = readings.fixes.openDoor(ctx);
  assert.equal(fixable({ fix }), false, "doctor --fix would open the door on its own");
  assert.equal(fixable({ fix: readings.fixes.wakePod(ctx) }), true, "the guard now blocks fixes that were safe to apply");
});

test("the six investigations say so, and every other recipe stays a fix", () => {
  const investigations = ["describePod", "describeNode", "readBootLog", "inspectHubContext", "seeDisk", "seeGateway"];
  for (const name of investigations) {
    assert.equal(readings.fixes[name](ctx).kind, "investigate", `${name} still passes for a fix`);
  }
  for (const [name, recipe] of Object.entries(readings.fixes)) {
    if (investigations.includes(name)) continue;
    assert.equal(recipe(ctx, ["git"]).kind, undefined, `${name} claims to be an investigation`);
  }
});

test("an investigation is an action of its own, and the keyboard still wins over it", () => {
  assert.equal(actionOf({ fix: readings.fixes.seeDisk(ctx) }), "investigate");
  assert.equal(actionOf({ fix: readings.fixes.readBootLog(ctx) }), "investigate");
  assert.equal(actionOf({ fix: readings.fixes.syncHubContext(ctx) }), "fix");
  assert.equal(actionOf({ fix: readings.fixes.openDoor(ctx) }), "copy");
  assert.equal(actionOf({ state: "warn" }), null);

  assert.equal(actionOf({ fix: readings.fixes.describeNode("") }), "copy", "<node> would be typed into a shell as it is");
  assert.equal(actionOf({ fix: readings.fixes.describeNode("ip-10-0-0-1") }), "investigate");
  assert.equal(actionOf({ fix: { label: "l", command: "sudo du -sh /workspace", kind: "investigate" } }), "copy");
  assert.equal(actionOf({ fix: { label: "l", command: "kubectl exec -it pod -- ls", kind: "investigate" } }), "copy");
});

test("the two checks that share the hub checkout say so, and only where they do", () => {
  const fresh = new Date().toISOString();
  const behind = readings.checkHubContext(`present tip=abc behind=3 dirty=0 at=${fresh}`, ctx);
  assert.equal(behind.state, "warn");
  assert.equal(behind.group, readings.HUB_CHECKOUT);
  assert.deepEqual(normalizeItem(behind), behind);

  const stale = readings.checkHubContract(`present tip=abc behind=0 dirty=0 at=${fresh}\nseat:stale\nstale:`, ctx);
  assert.equal(stale.state, "warn");
  assert.equal(stale.group, readings.HUB_CHECKOUT);
  assert.equal(stale.group, behind.group, "the same root cause has to carry the same name");

  const clean = readings.checkHubContext(`present tip=abc behind=0 dirty=0 at=${fresh}`, ctx);
  assert.equal(clean.state, "ok");
  assert.equal(clean.group, undefined);
  assert.equal(readings.checkHubContext(`present tip=abc behind=0 dirty=2 at=${fresh}`, ctx).group, undefined);
  assert.equal(readings.checkHubContext("absent", ctx).group, undefined);
  assert.equal(readings.checkHubContract(`present tip=abc behind=0 dirty=0 at=${fresh}\nseat:ok\nstale:`, ctx).group, undefined);
  assert.equal(readings.checkHubContract(`present tip=abc behind=0 dirty=0 at=${fresh}\nseat:absent\nstale:`, ctx).group, undefined);
});

test("normalizing carries kind and group through, and invents neither", () => {
  const bare = normalizeItem({ id: "a", state: "ok", fix: { label: "l", command: "c" } });
  assert.deepEqual(bare.fix, { label: "l", command: "c" });
  assert.equal("group" in bare, false);

  const rich = normalizeItem({ id: "a", state: "warn", detail: "d", group: "hub-checkout", fix: { label: "l", command: "c", kind: "investigate" } });
  assert.deepEqual(rich.fix, { label: "l", command: "c", kind: "investigate" });
  assert.equal(rich.group, "hub-checkout");

  const report = readReport(JSON.stringify({
    items: [{ id: "disk", state: "warn", detail: "89% used", group: "hub-checkout", fix: { label: "see", command: "du", kind: "investigate" } }]
  }));
  assert.equal(report.items[0].fix.kind, "investigate");
  assert.equal(report.items[0].group, "hub-checkout");
});

test("severity sorts the worst first without shuffling the ties", () => {
  const items = [
    { id: "a", state: "ok" }, { id: "b", state: "warn" }, { id: "c", state: "skip" },
    { id: "d", state: "fail" }, { id: "e", state: "warn" }, { id: "f", state: "ok" }, { id: "g", state: "fail" }
  ];
  assert.deepEqual(bySeverity(items).map((i) => i.id), ["d", "g", "b", "e", "a", "c", "f"]);
  assert.deepEqual(items.map((i) => i.id), ["a", "b", "c", "d", "e", "f", "g"], "the caller's list was reordered under it");
  assert.deepEqual(bySeverity([]), []);
  assert.deepEqual(bySeverity(null), []);
});

test("--fix reaches for the fixes and leaves the investigations to be read", async () => {
  const probe = [
    "==clock", String(Math.floor(Date.now() / 1000)),
    "==cli", "a".repeat(64),
    "==signers", "has", "ada",
    "==credential", JSON.stringify({ token: true, expires: Date.now() + 3600000, refresh: true, plan: "max" }),
    "==flags", JSON.stringify({ onboarding: false, bypass: false, trusted: {}, cross: "ask" }),
    "==memory", JSON.stringify({ installed: true, enabled: true, user: "ada", refresh: true, expiresIn: 1800 }),
    "==boot", "2026-08-19T09:00:00Z boot", "2026-08-19T09:01:00Z boot-error step=repos detail=clone-failed",
    "==cloudsessions", JSON.stringify({ repo: "https://github.com/ada/claude-sessions.git", script: true, lastSync: Date.now() - 120000, lastLog: "2026-08-19T12:00:00.000Z pulled=0 pushed=2 unchanged=40", now: Date.now() }),
    "==control", "Ready",
    "==repos", "ok acme-hub", "ok dev-workspaces",
    "==gh", "logged-in adaandrade",
    "==context", `present tip=abc behind=3 dirty=0 at=${new Date().toISOString()}`, "seat:stale", "stale:",
    "==mcpenv", JSON.stringify({ ok: true, configurados: 14, envFile: "/workspace/repos/acme-hub/.env", faltando: {} }),
    "==disk", "/dev/nvme1n1 104857600 94371840 10485760 90% /workspace"
  ].join("\n");
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true }, {
    exec: describing(),
    probe: () => Promise.resolve({ ok: true, out: probe, err: "" }),
    ask: DOOR_ANSWERS
  });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.equal(items.length, 21);

  assert.equal(byId.disk.state, "warn");
  assert.equal(actionOf(byId.disk), "investigate");
  assert.equal(byId["last-boot"].state, "warn");
  assert.equal(actionOf(byId["last-boot"]), "investigate");
  assert.equal(byId["hub-context"].group, readings.HUB_CHECKOUT);
  assert.equal(byId["hub-contract"].group, readings.HUB_CHECKOUT);
  assert.equal(actionOf(byId["hub-context"]), "fix");
  assert.equal(actionOf(byId["hub-contract"]), "fix");
  assert.equal(actionOf(byId.flags), "fix");

  const targets = items.filter((item) => actionable(item) && actionOf(item) === "fix").map((i) => i.id);
  assert.equal(targets.includes("disk"), false, "--fix would run du and then call the disk still full");
  assert.equal(targets.includes("last-boot"), false, "--fix would tail the black box and then call the boot still broken");
  assert.ok(targets.includes("hub-context") && targets.includes("hub-contract") && targets.includes("flags"));
});

test("checkMcpEnv names the servers whose credential is missing, as a warning: the others still answer", () => {
  const cheio = JSON.stringify({ configurados: 14, envFile: "/workspace/repos/acme-hub/.env", faltando: {} });
  assert.equal(readings.checkMcpEnv(cheio, ctx).state, "ok");

  const vazio = JSON.stringify({
    configurados: 14,
    envFile: "/workspace/repos/acme-hub/.env",
    faltando: { "pedidos-tech": ["PEDIDOS_MCP_TOKEN"], metabase: ["METABASE_API_KEY"] },
  });
  const faltando = readings.checkMcpEnv(vazio, ctx);
  assert.equal(faltando.state, "warn");
  assert.match(faltando.detail, /pedidos-tech: PEDIDOS_MCP_TOKEN/);
  assert.match(faltando.detail, /metabase: METABASE_API_KEY/);
  assert.match(faltando.fix.command, /pod-env\.sh/);

  const semGateway = readings.checkMcpEnv("gateway-down", ctx);
  assert.equal(semGateway.state, "fail");
  assert.match(semGateway.detail, /4671/);
});

test("leftovers: a process tagged with a chat that has no window any more is a warning with the kill ready", () => {
  const rows = [{ pid: 80926, etime: "22:01:12", cpu: "564:02.10", command: "node tests/browser-navigate.test.mjs", seat: "aba-dirigida" }];
  const found = readings.checkLeftovers({ measured: true, rows }, ctx);
  assert.equal(found.state, "warn");
  assert.match(found.detail, /1 process left by chats that are closed/);
  assert.match(found.detail, /browser-navigate\.test\.mjs \(pid 80926, up 22:01:12, chat aba-dirigida\)/);
  assert.equal(found.fix.command, "kill 80926");
  assert.equal(readings.checkLeftovers({ measured: true, rows: [] }, ctx).state, "ok");
  assert.equal(readings.checkLeftovers({ measured: false, rows: [] }, { ...ctx, platform: "win32" }).state, "skip");
});

test("leftovers: the runner reads the process table against the tmux windows still open, and only the closed chats count", async () => {
  const table = [
    "  100 01:00 0:01.00 node dev-server HIVE_SEAT=alpha PATH=/usr/bin",
    "  150 01:00 0:01.00 node /x/server/engine/driver.mjs --name renamed --cwd /w HIVE_SEAT=renamed PATH=/usr/bin",
    "  151 01:00 0:01.00 node tests/z.test.mjs HIVE_SEAT=renamed PATH=/usr/bin",
    "  200 02:00 0:02.00 node tests/x.test.mjs HIVE_SEAT=gone PATH=/usr/bin",
    "  300 03:00 0:03.00 /usr/bin/something PATH=/usr/bin"
  ].join("\n");
  const asked = [];
  const processes = async ({ platform, session }) => {
    asked.push([platform, session]);
    return { rows: parseRows(table), windows: ["hub", "alpha"] };
  };
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true, platform: "darwin" }, {
    exec: describing(), processes, ask: DOOR_ANSWERS, platform: "darwin",
    timeouts: { local: 200, cluster: 60, node: 40, probe: 80, podCheck: 90, door: 40 }
  });
  assert.deepEqual(asked, [["darwin", "hive-local"]]);
  const found = items.find((i) => i.id === "leftovers");
  assert.equal(found.state, "warn");
  assert.match(found.detail, /pid 200, up 02:00, chat gone/);
  assert.doesNotMatch(found.detail, /pid 100/);
  assert.doesNotMatch(found.detail, /pid 151/, "a chat whose driver runs is alive even when no tmux window carries its name");
  assert.equal(found.fix.command, "kill 200");
});

test("leftovers: a chat of another hive on the same machine is never offered for killing", async () => {
  const table = [
    "  200 02:00 0:02.00 node tests/x.test.mjs HIVE_SEAT=gone HIVE_STATE_DIR=/Users/ada/.hive",
    "  400 00:11 0:00.10 node asker.mjs HIVE_SEAT=asker HIVE_STATE_DIR=/Users/ada/other-hive"
  ].join("\n");
  const processes = async () => ({ rows: parseRows(table), windows: ["hub"] });
  const items = await runChecks({ ...ctx, stateDir: "/Users/ada/.hive", hasConfig: true, configText: CONFIG, hubExists: true, platform: "darwin" }, {
    exec: describing(), processes, ask: DOOR_ANSWERS, platform: "darwin",
    timeouts: { local: 200, cluster: 60, node: 40, probe: 80, podCheck: 90, door: 40 }
  });
  const found = items.find((i) => i.id === "leftovers");
  assert.equal(found.fix.command, "kill 200");
  assert.doesNotMatch(found.detail, /pid 400/);
});

test("the doctor's hive is the state dir it was told about, or the .hive in the home", async () => {
  assert.equal((await buildContext({ env: { HOME: "/Users/ada", PATH: "/usr/bin" }, home: "/Users/ada", repo: "/r" })).stateDir, "/Users/ada/.hive");
  assert.equal((await buildContext({ env: { HOME: "/Users/ada", HIVE_STATE_DIR: "/tmp/trial/.hive", PATH: "/usr/bin" }, home: "/Users/ada", repo: "/r" })).stateDir, "/tmp/trial/.hive");
});

test("leftovers: when tmux does not list its windows, nothing is judged and no kill is offered", async () => {
  const processes = async () => ({ rows: parseRows("  200 02:00 0:02.00 node tests/x.test.mjs HIVE_SEAT=gone PATH=/usr/bin"), windows: null });
  const items = await runChecks({ ...ctx, hasConfig: true, configText: CONFIG, hubExists: true, platform: "darwin" }, {
    exec: describing(), processes, ask: DOOR_ANSWERS, platform: "darwin",
    timeouts: { local: 200, cluster: 60, node: 40, probe: 80, podCheck: 90, door: 40 }
  });
  const found = items.find((i) => i.id === "leftovers");
  assert.equal(found.state, "skip");
  assert.equal(found.fix, null);
  assert.match(found.detail, /tmux did not list its windows/);
});

test("leftovers: a tmux with no server or no session means no chat is open, while a tmux that did not answer means nothing was read", () => {
  assert.deepEqual(windowsOf({ ok: true, out: "hub\nalpha\n", err: "" }), ["hub", "alpha"]);
  assert.deepEqual(windowsOf({ ok: false, out: "", err: "no server running on /tmp/tmux-501/default" }), []);
  assert.deepEqual(windowsOf({ ok: false, out: "", err: "can't find session: hive-local" }), []);
  assert.deepEqual(windowsOf({ ok: false, out: "", err: "error connecting to /tmp/tmux-1001/default (No such file or directory)" }), [], "a socket that was never created is a tmux that never ran");
  assert.equal(windowsOf({ ok: false, out: "", err: "" }), null, "a timeout says nothing about the seats");
  assert.equal(windowsOf({ ok: false, out: "", err: "spawn tmux ENOENT" }), null);
});
