import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const main = readFileSync(join(HERE, "main.js"), "utf8");

const FLEET_WORK = [
  "sweepStrandedMirrors()",
  "await loadFleet();",
  "mirrorFleetToTheBox();",
  "await reconcileLocalFleet()",
  "keepAutopushAlive()",
  "fleetTick()"
];

test("the door is claimed before anything drives the fleet", () => {
  const boot = server.slice(server.indexOf('process.on("SIGINT"'));
  const claim = boot.indexOf("await claimDoor();");
  assert.ok(claim > 0, "server.mjs never claims the door on the way up");
  for (const work of FLEET_WORK) {
    const at = boot.indexOf(work);
    assert.ok(at > 0, `${work} vanished from the boot of server.mjs`);
    assert.ok(at > claim, `${work} runs before the door is claimed, so a second hive drives the same fleet`);
  }
});

test("a hive that loses the door leaves instead of throwing", () => {
  const leaving = server.slice(server.indexOf("function leaveTheDoorToTheOtherHive()"), server.indexOf("function tryTheDoor()"));
  assert.match(leaving, /process\.exit\(ANOTHER_HIVE_OWNS_THE_PORT\)/);
  const claim = server.slice(server.indexOf("async function claimDoor()"), server.indexOf("await claimDoor();"));
  assert.equal((claim.match(/leaveTheDoorToTheOtherHive\(\)/g) || []).length, 2, "a hive must leave both when the door is alive and when the retry still loses");
  assert.match(claim, /whoHasTheDoor/);
  assert.match(claim, /sweepStale/);
  const bind = server.slice(server.indexOf("function tryTheDoor()"), server.indexOf("async function claimDoor()"));
  assert.match(bind, /EADDRINUSE/, "the bind itself must be the arbiter, not a prior probe");
  assert.ok(claim.indexOf("await tryTheDoor()") < claim.indexOf("whoHasTheDoor"), "probing before binding reopens the race where two hives both unlink and both listen");
});

test("the hive opens no port at all", () => {
  assert.doesNotMatch(server, /server\.listen\(\s*PORT/, "server.mjs still listens on a TCP port");
  assert.match(server, /server\.listen\(SOCK/);
  assert.doesNotMatch(main, /http:\/\/127\.0\.0\.1:/, "the app still points the window at a port");
});

test("the app reads that exit as a reused server, not a death", () => {
  assert.match(main, /const ANOTHER_HIVE_OWNS_THE_PORT = 75;/);
  const onExit = main.slice(main.indexOf('server.on("exit"'), main.indexOf('if (await waitForServer())'));
  const bail = onExit.indexOf("if (code === ANOTHER_HIVE_OWNS_THE_PORT) return;");
  const dialog = onExit.indexOf("showErrorBox");
  assert.ok(bail > 0 && dialog > bail, "the death dialog fires before the reused-server check");
});

test("the exit code means the same thing on both sides", () => {
  const fromServer = server.match(/const ANOTHER_HIVE_OWNS_THE_PORT = (\d+);/);
  const fromApp = main.match(/const ANOTHER_HIVE_OWNS_THE_PORT = (\d+);/);
  assert.ok(fromServer && fromApp);
  assert.equal(fromServer[1], fromApp[1]);
});

const APP_DEPS = existsSync(join(HERE, "node_modules", "jsonc-parser"));

test("a hive whose predecessor was killed still opens the door",
  { skip: APP_DEPS ? false : "the app dependencies are not installed, so server.mjs cannot boot here" },
  async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-orphan-"));
  const sock = join(home, "hive.sock");
  const doomed = spawn(process.execPath, ["-e", `require("node:net").createServer().listen(${JSON.stringify(sock)}, () => console.log("up"))`], { stdio: ["ignore", "pipe", "ignore"] });
  await new Promise((up) => doomed.stdout.once("data", up));
  doomed.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(existsSync(sock), "the killed process should have left the socket file behind");
  try {
    const heir = spawn(process.execPath, ["server.mjs"], {
      cwd: HERE,
      env: { ...process.env, HIVE_DEV: "", HIVE_POD: "", HIVE_STATE_DIR: home, HIVE_HOME: home, HIVE_SANDBOX: "1", HIVE_NO_SWEEP: "1", HIVE_SOCK: sock },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let said = "";
    heir.stdout.on("data", (d) => { said += d; });
    heir.stderr.on("data", (d) => { said += d; });
    const up = await new Promise((done) => {
      const giveUp = setTimeout(() => done(false), 25000);
      heir.on("exit", () => { clearTimeout(giveUp); done(false); });
      const look = setInterval(() => {
        if (!/no port, nothing on the network/.test(said)) return;
        clearInterval(look); clearTimeout(giveUp); done(true);
      }, 100);
    });
    heir.kill("SIGKILL");
    assert.ok(up, `the heir never claimed the orphaned door: ${said}`);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a second hive on a taken door exits without touching the fleet",
  { skip: APP_DEPS ? false : "the app dependencies are not installed, so server.mjs cannot boot here" },
  async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-single-"));
  const sock = join(home, "hive.sock");
  const squatter = createServer((_, res) => res.end("busy"));
  await new Promise((up) => squatter.listen(sock, up));
  try {
    const second = spawn(process.execPath, ["server.mjs"], {
      cwd: HERE,
      env: {
        ...process.env,
        HIVE_DEV: "",
        HIVE_POD: "",
        HIVE_STATE_DIR: home,
        HIVE_HOME: home,
        HIVE_SANDBOX: "1",
        HIVE_NO_SWEEP: "1",
        HIVE_SOCK: sock
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let said = "";
    second.stdout.on("data", (d) => { said += d; });
    second.stderr.on("data", (d) => { said += d; });
    const code = await new Promise((done) => {
      const giveUp = setTimeout(() => { second.kill("SIGKILL"); done("hung"); }, 30000);
      second.on("exit", (c) => { clearTimeout(giveUp); done(c); });
    });
    assert.equal(code, 75, `expected the second hive to leave, got ${code}: ${said}`);
    assert.match(said, /another hive already answers/);
  } finally {
    await new Promise((down) => squatter.close(down));
    await rm(home, { recursive: true, force: true });
  }
});
