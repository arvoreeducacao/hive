import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinClaudePath, cacheRootOf, copyKeyOf, forgetUnusedCopies, heldKeys, keyOfHeldPath, nativeBinaryNames, prefersMusl, stableClaudePath, unmountable, unusedCopies, versionBeside, warmClaudeBinary, STAGING_GRACE_MS } from "../engine/claude-binary.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

function bench({ version = "0.3.241", bytes = "binary", mounted = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "claude-cache-"));
  const bundle = mounted ? mkdtempSync("/tmp/.mount_HiveTest-") : mkdtempSync(join(tmpdir(), "claude-bundle-"));
  const folder = join(bundle, "claude-agent-sdk-linux-x64");
  mkdirSync(folder, { recursive: true });
  const binary = join(folder, "claude");
  writeFileSync(binary, bytes);
  chmodSync(binary, 0o755);
  if (version) writeFileSync(join(folder, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-agent-sdk-linux-x64", version }));
  return {
    root,
    binary,
    folder,
    env: { HIVE_CLAUDE_CACHE: root },
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(bundle, { recursive: true, force: true });
    },
  };
}

test("a binary under an AppImage mount is the one that cannot outlive the app", () => {
  assert.equal(unmountable("/tmp/.mount_Hive-x5t62L0/resources/server/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude", {}), true);
  assert.equal(unmountable("/tmp/.mount_Hive-x5t62L0", {}), true);
  assert.equal(unmountable("/opt/Hive/resources/claude", {}), false);
  assert.equal(unmountable("/Applications/Hive.app/Contents/Resources/claude", {}), false);
  assert.equal(unmountable("/workspace/hive/server/node_modules/claude", {}), false);
  assert.equal(unmountable("", {}), false);
});

test("a bundle the environment names is unmountable wherever the runtime chose to mount it", () => {
  const env = { APPDIR: "/run/user/1000/appimage-Hive" };
  assert.equal(unmountable("/run/user/1000/appimage-Hive/resources/claude", env), true);
  assert.equal(unmountable("/run/user/1000/appimage-Hiveother/resources/claude", env), false);
  assert.equal(unmountable("/home/dev/claude", env), false);
  assert.equal(unmountable("/home/dev/claude", { APPDIR: "" }), false);
});

test("the seat keeps running claude after the mount it was born on is gone", () => {
  const b = bench();
  const copy = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  assert.notEqual(copy, b.binary);
  assert.equal(copy.startsWith(b.root), true);
  rmSync(b.folder, { recursive: true, force: true });
  assert.equal(existsSync(b.binary), false);
  assert.equal(existsSync(copy), true);
  assert.equal(readFileSync(copy, "utf8"), "binary");
  assert.equal(statSync(copy).mode & 0o111, 0o111);
  b.clean();
});

test("a binary nothing can pull out from under it is used where it lies", () => {
  const b = bench({ mounted: false });
  const stable = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  assert.equal(stable, b.binary);
  assert.equal(existsSync(join(b.root, copyKeyOf(b.binary, statSync(b.binary).size, "0.3.241"))), false);
  b.clean();
});

test("the second seat reuses the copy the first one made", () => {
  const b = bench();
  const first = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  const stamp = statSync(first).mtimeMs;
  const second = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  assert.equal(second, first);
  assert.equal(statSync(second).mtimeMs, stamp);
  b.clean();
});

test("a copy left half written is made again instead of handed over", () => {
  const b = bench();
  const copy = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  writeFileSync(copy, "cut");
  const again = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  assert.equal(again, copy);
  assert.equal(readFileSync(again, "utf8"), "binary");
  b.clean();
});

test("a new sdk lands beside the old copy rather than on top of it", () => {
  const b = bench();
  const old = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  writeFileSync(b.binary, "a longer binary");
  writeFileSync(join(b.folder, "package.json"), JSON.stringify({ version: "0.3.242" }));
  const fresh = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  assert.notEqual(fresh, old);
  assert.equal(existsSync(old), true);
  assert.equal(readFileSync(fresh, "utf8"), "a longer binary");
  b.clean();
});

test("the key carries the sdk version and the size, so an app update that leaves claude alone copies nothing", () => {
  assert.equal(copyKeyOf("/x/claude-agent-sdk-linux-x64/claude", 342636848, "0.3.241"), "claude-agent-sdk-linux-x64-0.3.241-342636848");
  assert.equal(copyKeyOf("/x/claude-agent-sdk-darwin-arm64/claude", 10, ""), "claude-agent-sdk-darwin-arm64-unversioned-10");
});

test("the version comes off the package beside the binary, and its absence is not a crash", () => {
  const b = bench();
  assert.equal(versionBeside(b.binary), "0.3.241");
  rmSync(join(b.folder, "package.json"), { force: true });
  assert.equal(versionBeside(b.binary), "");
  b.clean();
});

test("a copy still under a running seat is never dropped", () => {
  const held = new Set(["claude-agent-sdk-linux-x64-0.3.240-10"]);
  const entries = [
    { name: "claude-agent-sdk-linux-x64-0.3.241-20", mtimeMs: 0 },
    { name: "claude-agent-sdk-linux-x64-0.3.240-10", mtimeMs: 0 },
    { name: "claude-agent-sdk-linux-x64-0.3.239-5", mtimeMs: 0 },
  ];
  const gone = unusedCopies(entries, "claude-agent-sdk-linux-x64-0.3.241-20", held, 0);
  assert.deepEqual(gone, ["claude-agent-sdk-linux-x64-0.3.239-5"]);
});

test("a staging folder another process is filling right now is left alone until it goes stale", () => {
  const entries = [{ name: ".staging-4242-1", mtimeMs: 1000 }];
  assert.deepEqual(unusedCopies(entries, "keep", new Set(), 1000), []);
  assert.deepEqual(unusedCopies(entries, "keep", new Set(), 1000 + STAGING_GRACE_MS + 1), [".staging-4242-1"]);
});

test("the sweep clears what nothing runs from and keeps the rest", () => {
  const b = bench();
  const copy = stableClaudePath({ env: b.env, builtin: b.binary, root: b.root });
  const stale = join(b.root, "claude-agent-sdk-linux-x64-0.3.100-7");
  mkdirSync(stale, { recursive: true });
  writeFileSync(join(stale, "claude"), "old");
  const keep = copyKeyOf(b.binary, statSync(b.binary).size, "0.3.241");
  const forgotten = forgetUnusedCopies({ env: b.env, root: b.root, keep });
  assert.deepEqual(forgotten, ["claude-agent-sdk-linux-x64-0.3.100-7"]);
  assert.equal(existsSync(stale), false);
  assert.equal(existsSync(copy), true);
  b.clean();
});

test("a cache folder that was never made is not an error to sweep", () => {
  assert.deepEqual(forgetUnusedCopies({ env: { HIVE_CLAUDE_CACHE: join(tmpdir(), "hive-cache-that-is-not-there") } }), []);
});

test("a process running from a copy names the copy it holds", () => {
  assert.equal(keyOfHeldPath("/c", "/c/claude-agent-sdk-linux-x64-0.3.241-20/claude"), "claude-agent-sdk-linux-x64-0.3.241-20");
  assert.equal(keyOfHeldPath("/c", "/other/claude"), "");
  assert.equal(keyOfHeldPath("/c", "/claude"), "");
});

test("proc entries that are not processes, and links that will not read, are skipped", () => {
  const held = heldKeys("/c", {
    procRoot: "/proc",
    entries: () => ["1", "self", "cpuinfo", "2"],
    link: (path) => {
      if (path === "/proc/1/exe") return "/c/claude-agent-sdk-linux-x64-0.3.241-20/claude";
      throw new Error("EACCES");
    },
  });
  assert.deepEqual([...held], ["claude-agent-sdk-linux-x64-0.3.241-20"]);
});

test("a proc that cannot be listed leaves the sweep with nothing held rather than throwing", () => {
  const held = heldKeys("/c", { entries: () => { throw new Error("ENOENT"); } });
  assert.equal(held.size, 0);
});

test("a cache that cannot be written falls back to the binary in the bundle", () => {
  const b = bench();
  const blocker = join(b.root, "blocker");
  writeFileSync(blocker, "not a folder");
  const stable = stableClaudePath({ env: b.env, builtin: b.binary, root: join(blocker, "cache") });
  assert.equal(stable, b.binary);
  b.clean();
});

test("no binary resolved stays no binary, and the sdk keeps its own default", () => {
  assert.equal(stableClaudePath({ env: {}, builtin: "", root: "/tmp" }), "");
  assert.equal(builtinClaudePath({ resolve: () => { throw new Error("not installed"); } }), "");
  assert.equal(builtinClaudePath({ resolve: (name) => `/n/${name}`, names: ["a/claude"], exists: () => false }), "");
  assert.equal(builtinClaudePath({ resolve: (name) => `/n/${name}`, names: ["a/claude", "b/claude"], exists: (p) => p === "/n/b/claude" }), "/n/b/claude");
});

test("the binary is looked for under the same names the sdk itself would try", () => {
  assert.deepEqual(nativeBinaryNames({ platform: "linux", arch: "x64", musl: false }), [
    "@anthropic-ai/claude-agent-sdk-linux-x64/claude",
    "@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude",
  ]);
  assert.deepEqual(nativeBinaryNames({ platform: "linux", arch: "arm64", musl: true }), [
    "@anthropic-ai/claude-agent-sdk-linux-arm64-musl/claude",
    "@anthropic-ai/claude-agent-sdk-linux-arm64/claude",
  ]);
  assert.deepEqual(nativeBinaryNames({ platform: "darwin", arch: "arm64" }), ["@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"]);
  assert.deepEqual(nativeBinaryNames({ platform: "win32", arch: "x64" }), ["@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe"]);
  assert.deepEqual(nativeBinaryNames({ platform: "android", arch: "arm64" }), ["@anthropic-ai/claude-agent-sdk-linux-arm64-android/claude"]);
});

test("musl is only ever a question on linux", () => {
  assert.equal(prefersMusl("darwin", { getReport: () => ({ header: {} }) }), false);
  assert.equal(prefersMusl("linux", { getReport: () => ({ header: {} }) }), true);
  assert.equal(prefersMusl("linux", { getReport: () => ({ header: { glibcVersionRuntime: "2.43" } }) }), false);
  assert.equal(prefersMusl("linux", {}), false);
});

test("the cache lives beside the other caches, and the environment can move it", () => {
  assert.equal(cacheRootOf({}, "/home/dev"), "/home/dev/.cache/hive/claude");
  assert.equal(cacheRootOf({ XDG_CACHE_HOME: "/var/cache" }, "/home/dev"), "/var/cache/hive/claude");
  assert.equal(cacheRootOf({ HIVE_CLAUDE_CACHE: "/somewhere" }, "/home/dev"), "/somewhere");
});

test("warming reports the copy it made and sweeps behind it", () => {
  const b = bench();
  const stale = join(b.root, "claude-agent-sdk-linux-x64-0.1.0-3");
  mkdirSync(stale, { recursive: true });
  const warmed = warmClaudeBinary({ env: b.env });
  assert.equal(warmed.copied, false);
  assert.deepEqual(warmed.forgotten, []);
  b.clean();
});

test("the driver picks its claude before it opens the session", () => {
  const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");
  const asked = driver.indexOf("chosenClaude(");
  const opened = driver.indexOf("pathToClaudeCodeExecutable");
  const session = driver.indexOf("query({ prompt: input");
  assert.ok(asked > 0, "driver.mjs never picks between the machine claude and the bundled one");
  assert.ok(opened > asked, "driver.mjs never hands the binary to the sdk");
  assert.ok(session > opened, "driver.mjs opens the session before the binary is settled");
});

test("versions compare by number, not by text", async () => {
  const { compareVersions } = await import("../engine/claude-binary.mjs");
  assert.equal(compareVersions("2.1.282", "2.1.280"), 1);
  assert.equal(compareVersions("2.1.9", "2.1.10"), -1);
  assert.equal(compareVersions("v1.0.0", "1.0.0"), 0);
});

test("the claude the sdk carries is read from the sdk beside it", async () => {
  const { bundledClaudeVersion } = await import("../engine/claude-binary.mjs");
  const root = mkdtempSync(join(tmpdir(), "claude-sdk-"));
  mkdirSync(join(root, "claude-agent-sdk"), { recursive: true });
  mkdirSync(join(root, "claude-agent-sdk-linux-x64"), { recursive: true });
  writeFileSync(join(root, "claude-agent-sdk", "package.json"), JSON.stringify({ claudeCodeVersion: "2.1.280" }));
  assert.equal(bundledClaudeVersion(join(root, "claude-agent-sdk-linux-x64", "claude")), "2.1.280");
  assert.equal(bundledClaudeVersion(""), "");
  rmSync(root, { recursive: true, force: true });
});

test("a seat runs the machine's claude when it is at least as new as the one in the app", async () => {
  const { pickClaude } = await import("../engine/claude-binary.mjs");
  const bundled = "/app/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude";
  const machine = "/home/a/.local/bin/claude";
  assert.equal(pickClaude({ bundled, bundledVersion: "2.1.280", machine, machineVersion: "2.1.282" }).path, machine);
  assert.equal(pickClaude({ bundled, bundledVersion: "2.1.280", machine, machineVersion: "2.1.280" }).path, machine);
  assert.equal(pickClaude({ bundled, bundledVersion: "2.1.280", machine: "/usr/local/bin/claude", machineVersion: "2.1.258" }).path, bundled);
  assert.equal(pickClaude({ bundled, bundledVersion: "2.1.280", machine: "", machineVersion: "" }).path, bundled);
  assert.equal(pickClaude({ bundled, bundledVersion: "2.1.280", machine, machineVersion: "2.1.282", prefer: "bundled" }).path, bundled);
  assert.equal(pickClaude({ bundled: "", bundledVersion: "", machine, machineVersion: "2.1.100" }).path, machine);
});

test("claude on the path skips anything inside node_modules", async () => {
  const { claudeOnPath } = await import("../engine/claude-binary.mjs");
  const seen = [];
  const found = claudeOnPath({ env: { PATH: "/repo/node_modules/.bin:/usr/bin" }, platform: "linux", home: "/home/a", can: (p) => { seen.push(p); return p === "/home/a/.local/bin/claude"; } });
  assert.equal(found, "/home/a/.local/bin/claude");
  assert.ok(!seen.some((p) => p.includes("node_modules")));
});
