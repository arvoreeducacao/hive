import test from "node:test";
import assert from "node:assert/strict";
import { posix as path } from "node:path";
import { registerUpdateRoutes } from "../routes/updates.mjs";

function updateHarness(overrides = {}) {
  const routes = [];
  const calls = [];
  const logs = [];
  let update = { behind: 0 };
  const dependencies = {
    checkUpdate: async (force) => { calls.push(["check", force]); return update; },
    getUpdatePhase: () => ({ step: "downloading", done: 4, total: 8 }),
    whatLanded: async () => ({ ready: true }),
    markReleaseSeen: async (sha) => { calls.push(["seen", sha]); },
    getLandedSha: () => "landed-sha",
    builtFrom: "built-sha",
    applyPublished: async (state) => { calls.push(["published", state]); return { ok: true }; },
    repo: "/repo",
    shr: async (command, args, options) => { calls.push(["shr", command, args, options]); return { ok: true, error: "" }; },
    viaBash: (command, args) => [command, args],
    appDir: "/repo/app",
    releaseTeam: "",
    resetUpdateCache: () => { calls.push(["reset"]); },
    packaged: false,
    platform: "linux",
    builtBundle: () => "",
    existsSync: () => false,
    readdirSync: () => [],
    join: path.join,
    appBundle: "",
    schedule: (fn, wait) => { calls.push(["schedule", wait]); fn(); },
    log: (line) => { logs.push(line); },
    ...overrides
  };
  registerUpdateRoutes((method, routePath, handler) => routes.push({ method, path: routePath, handler }), dependencies);
  const call = async (method, routePath, query = "") => {
    const route = routes.find((candidate) => candidate.method === method && candidate.path === routePath);
    const answers = [];
    await route.handler({}, {}, new URL(`http://hive${routePath}${query}`), (value, status = 200) => answers.push({ value, status }));
    return answers;
  };
  return { routes, calls, logs, call, setUpdate: (value) => { update = value; } };
}

test("update routes keep the five original method and path pairs", () => {
  const { routes } = updateHarness();
  assert.deepEqual(routes.map(({ method, path }) => [method, path]), [
    [null, "/api/update"],
    [null, "/api/update/phase"],
    [null, "/api/whatsnew"],
    ["POST", "/api/whatsnew/seen"],
    ["POST", "/api/update/apply"]
  ]);
});

test("update reads force, phase and what landed through their injected state", async () => {
  const hive = updateHarness();
  assert.deepEqual(await hive.call(null, "/api/update", "?force=1"), [{ value: { behind: 0 }, status: 200 }]);
  assert.deepEqual(await hive.call(null, "/api/update/phase"), [{ value: { step: "downloading", done: 4, total: 8 }, status: 200 }]);
  assert.deepEqual(await hive.call(null, "/api/whatsnew"), [{ value: { ready: true }, status: 200 }]);
  assert.deepEqual(await hive.call("POST", "/api/whatsnew/seen"), [{ value: { ok: true }, status: 200 }]);
  assert.deepEqual(hive.calls.slice(0, 2), [["check", true], ["seen", "landed-sha"]]);
});

test("published updates retain the apply result and conflict status", async () => {
  const hive = updateHarness({ applyPublished: async () => ({ error: "signature refused" }) });
  hive.setUpdate({ behind: 1, via: "release" });
  assert.deepEqual(await hive.call("POST", "/api/update/apply"), [{ value: { error: "signature refused" }, status: 409 }]);
});

test("checkout updates pull and install with the original arguments", async () => {
  const hive = updateHarness();
  hive.setUpdate({ behind: 2, via: "git", branch: "main" });
  assert.deepEqual(await hive.call("POST", "/api/update/apply"), [{ value: { ok: true }, status: 200 }]);
  assert.deepEqual(hive.calls.filter(([kind]) => kind === "shr"), [
    ["shr", "git", ["-C", "/repo", "pull", "--ff-only", "origin", "main"], { timeout: 40000 }],
    ["shr", "npm", ["install", "--no-audit", "--no-fund"], { timeout: 240000, cwd: "/repo/app" }]
  ]);
  assert.ok(hive.calls.some(([kind]) => kind === "reset"));
  assert.deepEqual(hive.logs, ["hive: update applied — restart me"]);
});

test("packaged checkout updates build the platform recipe and return the manual location", async () => {
  const hive = updateHarness({ packaged: true, existsSync: () => true, readdirSync: () => ["linux-x64"], builtBundle: () => "/repo/app/dist/linux-x64/Hive" });
  hive.setUpdate({ behind: 1, via: "git", branch: "main" });
  assert.deepEqual(await hive.call("POST", "/api/update/apply"), [{
    value: { ok: true, note: "the new version is built in /repo/app/dist — quit the app and put it in place of yours" },
    status: 200
  }]);
  assert.ok(hive.calls.some((call) => call[0] === "shr" && call[2].join(" ") === "run package-linux"));
});

test("a rebuild from the checkout carries the team of the app it replaces, or that app can never take a release again", async () => {
  const hive = updateHarness({ packaged: true, platform: "darwin", releaseTeam: "62BZJX9R58", existsSync: () => true, readdirSync: () => ["mac-arm64"], builtBundle: () => "/repo/app/dist/mac-arm64/Hive.app", appBundle: "/Applications/Hive.app" });
  hive.setUpdate({ behind: 1, via: "git", branch: "main" });
  await hive.call("POST", "/api/update/apply");
  const build = hive.calls.find((call) => call[0] === "shr" && call[2].join(" ") === "run package");
  assert.deepEqual(build[3].env, { HIVE_RELEASE_TEAM: "62BZJX9R58" });
});

test("a rebuild by an app that carries no team asks for no team, instead of blanking the stamp of the build", async () => {
  const hive = updateHarness({ packaged: true, platform: "darwin", releaseTeam: "", existsSync: () => true, readdirSync: () => ["mac-arm64"], builtBundle: () => "/repo/app/dist/mac-arm64/Hive.app", appBundle: "/Applications/Hive.app" });
  hive.setUpdate({ behind: 1, via: "git", branch: "main" });
  await hive.call("POST", "/api/update/apply");
  const build = hive.calls.find((call) => call[0] === "shr" && call[2].join(" ") === "run package");
  assert.equal("env" in build[3], false);
});

test("checkout refusal messages preserve their original status", async () => {
  const noRepo = updateHarness({ repo: "" });
  noRepo.setUpdate({ behind: 1, via: "git", branch: "main" });
  assert.equal((await noRepo.call("POST", "/api/update/apply"))[0].status, 409);

  const wrongBranch = updateHarness();
  wrongBranch.setUpdate({ behind: 1, via: "git", branch: "feature" });
  assert.deepEqual(await wrongBranch.call("POST", "/api/update/apply"), [{
    value: { error: "the checkout at /repo is on feature — the app updates from main, so put that checkout back on main or point HIVE_REPO at one that stays there" },
    status: 409
  }]);
});
