import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import { createBrokerClient } from "../../server/client.mjs";
import { clusterIsWanted, serverIsWanted, sshHostAsked, urlServerIsWanted } from "../lib/env.mjs";
import { loadIdentity } from "../lib/hive-identity.mjs";
import {
  LEFT_OUT, NODE_FLOOR, ROOT_FOLDER, createSshHost, execArgs, hostPathsIn, installScript, lookScript, readFacts, remoteLayout,
  serverFilesOf, serverStamp, sshReason, sshTargetOf, tunnelArgs, whatTheHostLacks
} from "../lib/ssh-host.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(HERE, "../../server");
const KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFakeFakeFakeFakeFakeFakeFakeFakeFakeFakeFake";

const junk = [];
const scratch = (prefix = "hive-ssh-") => { const dir = mkdtempSync(join(tmpdir(), prefix)); junk.push(dir); return dir; };
const cleanups = [];
after(async () => {
  for (const clean of cleanups) await clean();
  for (const dir of junk) rmSync(dir, { recursive: true, force: true });
});

test("a machine is named the way ssh names it, and nothing that could pass for an option gets through", () => {
  assert.deepEqual(sshTargetOf("rita@devbox"), { ok: true, user: "rita", host: "devbox", port: 0, target: "rita@devbox", label: "devbox" });
  assert.deepEqual(sshTargetOf(" ssh://rita@10.0.0.7:2222 "), { ok: true, user: "rita", host: "10.0.0.7", port: 2222, target: "rita@10.0.0.7", label: "10.0.0.7" });
  assert.equal(sshTargetOf("devbox").target, "devbox", "an alias from ~/.ssh/config is a whole target");
  for (const bad of ["", "-oProxyCommand=touch /tmp/x", "rita@-oProxyCommand=x", "-l@host", "rita@dev box", "rita@host:0", "rita@host:99999", "a@b@c", "host;rm -rf /", "$(id)@host"]) {
    const read = sshTargetOf(bad);
    assert.equal(read.ok, false, bad + " was taken for a machine");
    assert.ok(read.error, bad + " was refused without a reason");
  }
});

test("every call to ssh refuses to prompt, and the machine always comes after the options", () => {
  const host = sshTargetOf("rita@devbox:2222");
  const asked = execArgs(host, "sh -s");
  assert.deepEqual(asked.slice(-2), ["rita@devbox", "sh -s"]);
  assert.ok(asked.join(" ").includes("-o BatchMode=yes"), "a password prompt would hang the app with nobody to answer it");
  assert.ok(asked.join(" ").includes("-p 2222"));
  const tunnel = tunnelArgs(host, { localPort: 45001, socket: "/home/rita/.hive-host/server.sock" });
  assert.ok(tunnel.join(" ").includes("-L 127.0.0.1:45001:/home/rita/.hive-host/server.sock"), "the tunnel must end on this machine's loopback, never on every interface");
  assert.ok(tunnel.join(" ").includes("-o ExitOnForwardFailure=yes"));
  assert.deepEqual(tunnel.slice(-2), ["rita@devbox", "cat"], "the tunnel holds a command that ends when this app's pipe closes, so it never outlives the app");
});

test("everything the host keeps sits in one folder under its home", () => {
  assert.deepEqual(remoteLayout("/home/rita/"), {
    root: "/home/rita/.hive-host",
    server: "/home/rita/.hive-host/server",
    incoming: "/home/rita/.hive-host/server.new",
    socket: "/home/rita/.hive-host/server.sock",
    log: "/home/rita/.hive-host/server.log"
  });
  assert.equal(ROOT_FOLDER, ".hive-host");
});

test("the stamp of the server changes with its files, and neither dependencies nor tests travel", () => {
  const dir = scratch();
  mkdirSync(join(dir, "engine"));
  mkdirSync(join(dir, "node_modules/ws"), { recursive: true });
  mkdirSync(join(dir, "tests"));
  writeFileSync(join(dir, "server.mjs"), "one");
  writeFileSync(join(dir, "engine/driver.mjs"), "two");
  writeFileSync(join(dir, "node_modules/ws/index.js"), "heavy");
  writeFileSync(join(dir, "tests/a.test.mjs"), "test");
  assert.deepEqual(serverFilesOf(dir), ["engine/driver.mjs", "server.mjs"]);
  const first = serverStamp(dir);
  writeFileSync(join(dir, "node_modules/ws/index.js"), "heavier");
  assert.equal(serverStamp(dir), first, "a dependency the host installs for itself moved the stamp");
  writeFileSync(join(dir, "engine/driver.mjs"), "three");
  assert.notEqual(serverStamp(dir), first);
  assert.deepEqual([...LEFT_OUT].sort(), ["node_modules", "tests"]);
  assert.match(serverStamp(SERVER_DIR), /^[0-9a-f]{32}$/);
});

test("what ssh complains about becomes something the person can act on", () => {
  assert.match(sshReason("Host key verification failed.", "rita@devbox"), /run "ssh rita@devbox" once in a terminal/);
  assert.match(sshReason("rita@devbox: Permission denied (publickey,password).", "rita@devbox"), /cannot type a password.*ssh-copy-id rita@devbox/);
  assert.match(sshReason("ssh: Could not resolve hostname devbox: Name or service not known", "rita@devbox"), /no machine answers to the name/);
  assert.match(sshReason("\nssh: connect to host devbox port 22: Connection refused\n", "rita@devbox"), /refused the connection — ssh \(Remote Login\) has to be on there/);
  assert.match(sshReason("ssh: connect to host 192.168.0.90 port 22: Connection timed out", "rita@devbox"), /did not answer on the network — the machine may be asleep/);
  assert.match(sshReason("Timeout, server 192.168.0.90 not responding.", "rita@devbox"), /went quiet — the machine may have gone to sleep/);
  assert.equal(sshReason("something nobody has seen before", "rita@devbox"), "something nobody has seen before");
  assert.match(sshReason("bind [127.0.0.1]:45001: Address already in use", "rita@devbox"), /local end of the tunnel is taken/);
  assert.equal(sshReason("", "rita@devbox"), "");
});

test("the host's answers are read past whatever its shell prints first", () => {
  const facts = readFacts("Welcome to devbox!\nhive:home=/home/rita\nhive:node=22.11.0\nlast login: yesterday\nhive:log=a = b\n");
  assert.deepEqual(facts, { home: "/home/rita", node: "22.11.0", log: "a = b" });
});

test("a host that cannot run the server is told what it lacks before anything is copied", () => {
  const whole = { node: "22.3.0", npm: "1", tmux: "1", git: "1", tar: "1" };
  assert.equal(whatTheHostLacks(whole, { installing: true }), "");
  assert.match(whatTheHostLacks({ ...whole, node: "" }), new RegExp("needs node " + NODE_FLOOR));
  assert.match(whatTheHostLacks({ ...whole, node: "18.19.1" }), /has node 18\.19\.1/);
  assert.match(whatTheHostLacks({ ...whole, tmux: "0", git: "0" }), /missing tmux, git/);
  assert.equal(whatTheHostLacks({ ...whole, npm: "0" }), "", "npm is only needed the day the server is installed");
  assert.match(whatTheHostLacks({ ...whole, npm: "0" }, { installing: true }), /missing npm/);
});

test("the scripts sent to the host are plain sh, and a value never leaves its quotes", () => {
  const asked = { key: KEY, name: "rita", stamp: "abc123", hubFolder: "acme-hub" };
  for (const script of [lookScript(asked), installScript(asked)]) {
    const parsed = spawnSync("sh", ["-n"], { input: script });
    assert.equal(parsed.status, 0, String(parsed.stderr));
    assert.ok(script.startsWith("FOLDER='.hive-host'\nKEY='" + KEY + "'\nNAME='rita'\nSTAMP='abc123'\nRESTART='0'\nHUBNAME='acme-hub'\n"));
  }
  assert.ok(lookScript({ key: KEY, name: "rita", stamp: "s", restart: true }).includes("RESTART='1'"));
  for (const odd of ["it's; rm -rf /", "../up", "a b", "-rf", ""]) {
    assert.ok(lookScript({ ...asked, hubFolder: odd }).includes("\nHUBNAME=''\n"), odd + " was taken for the name of a folder");
  }
  assert.ok(!installScript(asked).includes("pkill") && !installScript(asked).includes("killall"), "a server on the host is stopped by its own pid, never by a name its neighbours share");
});

test("what the app wrote for the container lands in the host's own folders", () => {
  const home = "/home/rita";
  const ws = "/home/rita/.hive-host/workspace";
  assert.equal(hostPathsIn("/workspace/hive/assets/a.png", home), ws + "/hive/assets/a.png");
  assert.equal(hostPathsIn("/workspace/repos", home), ws + "/repos");
  assert.equal(hostPathsIn("/workspace/", home), ws + "/");
  assert.equal(hostPathsIn("export HOME=/workspace/home PATH=/workspace/npm-global/bin:$PATH", home), "export HOME=/home/rita PATH=" + ws + "/npm-global/bin:$PATH");
  assert.equal(hostPathsIn('f=$(ls /workspace/home/.claude/projects/*/x.jsonl); cd "/workspace" && cat \'/workspace/hive/a\'', home),
    'f=$(ls /home/rita/.claude/projects/*/x.jsonl); cd "' + ws + '" && cat \'' + ws + "/hive/a'");
  for (const kept of ["/srv/workspace/x", "~/workspace", "$HOME/workspace", "${HOME}/workspace/x", "$(pwd)/workspace", "/workspaces/x", "/workspace-old/x", "/workspace.bak", "a/workspace/b", ws + "/hive"]) {
    assert.equal(hostPathsIn(kept, home), kept, kept + " is not the container's folder and was rewritten");
  }
  assert.equal(hostPathsIn(hostPathsIn("/workspace/hive", home), home), ws + "/hive", "a path already on the host moved again");
  assert.equal(hostPathsIn("/workspace/hive", ""), "/workspace/hive", "with no home known yet nothing is guessed");
  assert.equal(hostPathsIn("/workspace/hive", "/home/rita maria"), "/workspace/hive");
  assert.equal(hostPathsIn("/workspace/hive", "/workspace/home"), "/workspace/hive", "a host that is itself the container keeps the container's paths");
  assert.equal(hostPathsIn(42, home), "42");
});

test("an address over ssh is a server, and leaves the cluster and the team's server alone", () => {
  assert.equal(sshHostAsked({}, {}), "");
  assert.equal(sshHostAsked({}, { HIVE_SERVER_SSH: " rita@devbox " }), "rita@devbox");
  assert.equal(sshHostAsked({ HIVE_SERVER_SSH: "a@b" }, { HIVE_SERVER_SSH: "c@d" }), "a@b");
  assert.equal(serverIsWanted({}, { HIVE_SERVER_SSH: "rita@devbox" }), true);
  assert.equal(serverIsWanted({ HIVE_SERVER_SSH: "rita@devbox", HIVE_WANTS_SERVER: "0" }), false);
  assert.equal(clusterIsWanted({}, { HIVE_POD: "ws-rita-0", HIVE_SERVER_SSH: "rita@devbox" }), true, "a host over ssh switched the pod off — the two live side by side");
  assert.equal(clusterIsWanted({}, { HIVE_SERVER_SSH: "rita@devbox" }), false, "a machine reached over ssh asked somebody for kubectl");
  assert.equal(urlServerIsWanted({}, { HIVE_SERVER_SSH: "rita@devbox" }), false, "an ssh host passed for a server with an address");
  assert.equal(urlServerIsWanted({}, { HIVE_SERVER_URL: "https://hive.example", HIVE_SERVER_SSH: "rita@devbox" }), true);
  assert.equal(clusterIsWanted({ HIVE_WANTS_CLUSTER: "1" }, { HIVE_SERVER_SSH: "rita@devbox" }), true);
});

function fakeChild() {
  const one = new EventEmitter();
  one.stdin = new PassThrough();
  one.stdin.resume();
  one.stdout = new PassThrough();
  one.stderr = new PassThrough();
  one.kill = () => { one.killed = true; setImmediate(() => one.emit("close", null)); };
  one.answer = ({ out = "", err = "", code = 0 } = {}) => {
    one.stdout.end(out);
    one.stderr.end(err);
    setTimeout(() => one.emit("close", code), 5);
  };
  return one;
}

function fakeHost({ look, install = () => ({ out: "" }), upload = () => ({}) } = {}) {
  const calls = [];
  const tunnels = [];
  const spawn = (bin, args) => {
    const child = fakeChild();
    if (bin === "tar") {
      calls.push("pack");
      setImmediate(() => child.answer({ out: "archive" }));
      return child;
    }
    const command = args[args.length - 1];
    if (args.includes("-L")) {
      calls.push("tunnel");
      tunnels.push(child);
      return child;
    }
    if (command.startsWith("rm -rf ")) {
      calls.push("upload");
      child.stdin.on("finish", () => child.answer(upload(command)));
      return child;
    }
    let script = "";
    child.stdin.on("data", (chunk) => { script += chunk; });
    child.stdin.on("finish", () => {
      const installing = script.includes("npm ci");
      calls.push(installing ? "install" : "look");
      child.answer(installing ? install(script) : look(script));
    });
    return child;
  };
  return { spawn, calls, tunnels };
}

const facts = (more = {}) => Object.entries({ home: "/home/rita", node: "22.11.0", npm: 1, tmux: 1, git: 1, tar: 1, claude: 1, ...more }).map(([k, v]) => "hive:" + k + "=" + v).join("\n") + "\n";
const quiet = { wait: async () => { await new Promise((r) => setImmediate(r)); }, pickPort: async () => 45123, serverDir: SERVER_DIR, publicKey: KEY + " a comment", name: "rita" };

test("a home folder the scripts cannot carry is refused, and paths wait for a home that is known", async () => {
  const odd = fakeHost({ look: () => ({ out: facts({ home: "/home/rita maria", ready: 1, started: 1 }) }) });
  const one = createSshHost({ ...quiet, asked: "devbox", spawn: odd.spawn, fetchImpl: async () => ({ ok: true }) });
  assert.equal(one.paths("/workspace/hive"), "/workspace/hive");
  assert.equal(await one.reach(5000), "");
  assert.match(one.status().error, /characters the Hive's scripts cannot carry/);
  assert.deepEqual(odd.calls, ["look"]);
  const plain = fakeHost({ look: () => ({ out: facts({ ready: 1, started: 1 }) }) });
  const two = createSshHost({ ...quiet, asked: "devbox", spawn: plain.spawn, fetchImpl: async () => ({ ok: true }) });
  await two.reach(5000);
  assert.equal(two.paths("/workspace/hive/assets"), "/home/rita/.hive-host/workspace/hive/assets");
  two.stop();
});

test("the first time, the server is copied and installed, and only then does the tunnel open", async () => {
  const host = fakeHost({
    look: (script) => { assert.ok(script.includes("KEY='" + KEY + "'"), "the comment of the key travelled with it"); return { out: facts({ ready: 0, stamp: "" }) }; },
    install: () => ({ out: "hive:installed=1\nhive:started=1\n" }),
    upload: (command) => { assert.match(command, /tar -xzf - -C '\/home\/rita\/\.hive-host\/server\.new'$/); return {}; }
  });
  const seen = [];
  const ups = [];
  const one = createSshHost({ ...quiet, asked: "rita@devbox", spawn: host.spawn, fetchImpl: async (url) => { seen.push(url); return { ok: true }; }, onUp: (url) => ups.push(url) });
  assert.equal(one.url(), "", "asking for the address must never wait for a host that is still being set up");
  assert.equal(await one.reach(5000), "http://127.0.0.1:45123");
  assert.deepEqual(host.calls, ["look", "pack", "upload", "install", "tunnel"]);
  assert.deepEqual(seen, ["http://127.0.0.1:45123/health"]);
  assert.deepEqual(ups, ["http://127.0.0.1:45123"]);
  assert.equal(one.url(), "http://127.0.0.1:45123");
  assert.deepEqual(one.status(), { asked: true, target: "rita@devbox", label: "devbox", phase: "up", error: "", away: false, hub: false, home: "/home/rita", url: "http://127.0.0.1:45123", node: "22.11.0", claude: true });
  one.stop();
  assert.equal(host.tunnels[0].killed, true);
});

test("a host that already runs this version is only looked at", async () => {
  const host = fakeHost({ look: () => ({ out: facts({ ready: 1, started: 1 }) }) });
  const one = createSshHost({ ...quiet, asked: "devbox", spawn: host.spawn, fetchImpl: async () => ({ ok: true }) });
  assert.equal(await one.reach(5000), "http://127.0.0.1:45123");
  assert.deepEqual(host.calls, ["look", "tunnel"]);
  one.stop();
});

test("a host with an old node is refused before a single file is copied", async () => {
  const host = fakeHost({ look: () => ({ out: facts({ node: "18.19.1", ready: 0 }) }) });
  const one = createSshHost({ ...quiet, asked: "devbox", spawn: host.spawn, fetchImpl: async () => ({ ok: true }) });
  assert.equal(await one.reach(5000), "");
  assert.deepEqual(host.calls, ["look"]);
  assert.match(one.status().error, /has node 18\.19\.1/);
  assert.equal(one.status().phase, "down");
});

test("a refusal is kept for a while, so a screen that asks every second does not dial every second", async () => {
  const host = fakeHost({ look: () => ({ err: "rita@devbox: Permission denied (publickey).\n", code: 255 }) });
  let clock = 1000;
  const one = createSshHost({ ...quiet, asked: "rita@devbox", spawn: host.spawn, now: () => clock, retryAfter: 10000 });
  assert.equal(await one.reach(5000), "");
  assert.match(one.status().error, /ssh-copy-id rita@devbox/);
  one.url();
  one.url();
  assert.equal(await one.reach(5000), "");
  assert.deepEqual(host.calls, ["look"], "the host was dialled again inside the wait");
  clock += 10001;
  assert.equal(await one.reach(5000), "");
  assert.deepEqual(host.calls, ["look", "look"]);
  clock += 1;
  await one.again();
  assert.deepEqual(host.calls, ["look", "look", "look"], "asking again on purpose still waited");
});

test("a tunnel that drops says why, and the next question opens another one on the same port", async () => {
  const host = fakeHost({ look: () => ({ out: facts({ ready: 1, started: 1 }) }) });
  const downs = [];
  let ports = 0;
  const one = createSshHost({ ...quiet, asked: "devbox", spawn: host.spawn, fetchImpl: async () => ({ ok: true }), pickPort: async () => 45200 + (ports++), onDown: (why) => downs.push(why) });
  assert.equal(await one.reach(5000), "http://127.0.0.1:45200");
  host.tunnels[0].stderr.write("Connection to devbox closed by remote host.\n");
  await new Promise((r) => setTimeout(r, 10));
  host.tunnels[0].emit("close", 255);
  assert.deepEqual(downs, ["Connection to devbox closed by remote host."]);
  assert.equal(one.status().phase, "down");
  assert.equal(await one.reach(5000), "http://127.0.0.1:45200", "the address moved, and every stream that follows it would be left behind");
  assert.deepEqual(host.calls, ["look", "tunnel", "look", "tunnel"]);
  one.stop();
});

test("a server that is said to run and answers nothing is restarted on the next try", async () => {
  const restarts = [];
  const host = fakeHost({ look: (script) => { restarts.push(script.includes("RESTART='1'")); return { out: facts({ ready: 1, started: 1 }) }; } });
  let clock = 0;
  let answers = false;
  const one = createSshHost({ ...quiet, asked: "devbox", spawn: host.spawn, now: () => (clock += 4000), tunnelPatience: 15000, retryAfter: 1, fetchImpl: async () => ({ ok: answers }) });
  assert.equal(await one.reach(5000), "");
  assert.match(one.status().error, /did not answer through the tunnel/);
  assert.equal(host.tunnels[0].killed, true);
  answers = true;
  assert.equal(await one.reach(5000), "http://127.0.0.1:45123");
  assert.deepEqual(restarts, [false, true]);
  one.stop();
});

test("a host that went to sleep is found out before a chat is sent into a dead tunnel", async () => {
  const host = fakeHost({ look: () => ({ out: facts({ ready: 1, started: 1 }) }) });
  let answers = true;
  const downs = [];
  const one = createSshHost({ ...quiet, asked: "rita@macbook", spawn: host.spawn, fetchImpl: async () => { if (!answers) throw new Error("timeout"); return { ok: true }; }, onDown: (why) => downs.push(why) });
  assert.ok(await one.reach(5000));
  assert.equal(await one.alive(), true);
  answers = false;
  assert.equal(await one.alive(), false, "a tunnel that carries nothing passed for a host that is up");
  assert.equal(one.status().phase, "down");
  assert.equal(one.status().away, true);
  assert.match(one.status().error, /stopped answering — the machine may have gone to sleep/);
  assert.equal(host.tunnels[0].killed, true, "the dead tunnel was left holding the port");
  assert.equal(downs.length, 1, "the fall was told twice, or not at all");
  answers = true;
  one.again();
  assert.ok(await one.reach(5000), "the host woke up and the next knock did not get in");
  assert.equal(await one.alive(), true);
  one.stop();
});

test("a host that does not answer the network is told apart from one that refuses the key", async () => {
  const asleep = fakeHost({ look: () => ({ err: "ssh: connect to host 192.168.0.90 port 22: Connection timed out\n", code: 255 }) });
  const one = createSshHost({ ...quiet, asked: "rita@macbook", spawn: asleep.spawn, fetchImpl: async () => ({ ok: true }) });
  assert.equal(await one.reach(5000), "");
  assert.equal(one.status().away, true, "only a host that is away is worth knocking on again");
  const locked = fakeHost({ look: () => ({ err: "rita@macbook: Permission denied (publickey).\n", code: 255 }) });
  const two = createSshHost({ ...quiet, asked: "rita@macbook", spawn: locked.spawn, fetchImpl: async () => ({ ok: true }) });
  assert.equal(await two.reach(5000), "");
  assert.equal(two.status().away, false);
});

test("the host says whether it holds the hub, so a chat with no repo is not sent to a folder that is not there", async () => {
  const bare = fakeHost({ look: () => ({ out: facts({ ready: 1, started: 1, hub: 0 }) }) });
  const one = createSshHost({ ...quiet, asked: "rita@devbox", spawn: bare.spawn, fetchImpl: async () => ({ ok: true }) });
  await one.reach(5000);
  assert.equal(one.status().hub, false);
  one.stop();
  const full = fakeHost({ look: () => ({ out: facts({ ready: 1, started: 1, hub: 1 }) }) });
  const two = createSshHost({ ...quiet, asked: "rita@devbox", spawn: full.spawn, fetchImpl: async () => ({ ok: true }) });
  await two.reach(5000);
  assert.equal(two.status().hub, true);
  two.stop();
});

test("a name that ssh would not take never reaches ssh", async () => {
  const host = fakeHost({ look: () => { throw new Error("ssh was called"); } });
  const one = createSshHost({ ...quiet, asked: "-oProxyCommand=evil", spawn: host.spawn });
  assert.equal(await one.reach(1000), "");
  assert.deepEqual(host.calls, []);
  assert.match(one.status().error, /not a host name ssh would take/);
});

const SHIM = String.raw`#!/usr/bin/env node
import { spawn } from "node:child_process";
import net from "node:net";
const args = process.argv.slice(2);
let forward = "";
const rest = [];
for (let i = 0; i < args.length; i += 1) {
  const word = args[i];
  if (word === "-o" || word === "-p") { i += 1; continue; }
  if (word === "-L") { forward = args[i + 1]; i += 1; continue; }
  if (word === "-T") continue;
  rest.push(word);
}
const command = rest.slice(1).join(" ");
if (forward) {
  const cut = forward.match(/^127\.0\.0\.1:(\d+):(.*)$/);
  const door = net.createServer((near) => {
    const far = net.connect(cut[2]);
    near.pipe(far).pipe(near);
    near.on("error", () => far.destroy());
    far.on("error", () => near.destroy());
  });
  door.listen(Number(cut[1]), "127.0.0.1");
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();
} else {
  const env = { HOME: process.env.FAKE_HOST_HOME, SHELL: process.env.FAKE_HOST_SHELL, PATH: "/usr/bin:/bin", FAKE_LOGIN_PATH: process.env.FAKE_LOGIN_PATH, FAKE_NODE_MODULES: process.env.FAKE_NODE_MODULES, HIVE_STATE_DIR: "/somewhere/else", HIVE_SEAT: "a-seat-of-the-host" };
  const child = spawn("/bin/sh", ["-c", command], { env, stdio: "inherit" });
  child.on("close", (code) => process.exit(code === null ? 1 : code));
}
`;

const LOGIN_SHELL = String.raw`#!/bin/sh
echo "a banner the profile prints"
if [ "$1" = "-lc" ]; then PATH="$FAKE_LOGIN_PATH"; export PATH; fi
exec /bin/sh -c "$2"
`;

const FAKE_NPM = String.raw`#!/bin/sh
echo run >> "$HOME/npm-runs"
ln -s "$FAKE_NODE_MODULES" node_modules
`;

const has = (tool) => spawnSync("sh", ["-c", "command -v " + tool], { stdio: "ignore" }).status === 0;
const canHost = process.platform !== "win32" && ["tmux", "git", "tar"].every(has) && existsSync(join(SERVER_DIR, "node_modules", "ws"));

test("end to end over a stand-in for ssh: the server lands on the host, starts, and answers a signed call through the tunnel", { skip: !canHost && "needs sh, tmux, git, tar and the server's dependencies" }, async () => {
  const bench = scratch("hive-ssh-e2e-");
  const home = join(bench, "home");
  const bin = join(bench, "bin");
  mkdirSync(home);
  mkdirSync(bin);
  const shim = join(bench, "ssh-stand-in.mjs");
  writeFileSync(shim, SHIM);
  writeFileSync(join(bin, "zsh"), LOGIN_SHELL);
  writeFileSync(join(bin, "npm"), FAKE_NPM);
  for (const file of [shim, join(bin, "zsh"), join(bin, "npm")]) chmodSync(file, 0o755);

  const hostEnv = {
    FAKE_HOST_HOME: home,
    FAKE_HOST_SHELL: join(bin, "zsh"),
    FAKE_LOGIN_PATH: [bin, dirname(process.execPath), process.env.PATH].join(":"),
    FAKE_NODE_MODULES: join(SERVER_DIR, "node_modules")
  };
  const spawn = (cmd, args, opts = {}) => nodeSpawn(cmd, args, { ...opts, env: { ...process.env, ...(opts.env || {}), ...hostEnv } });
  const root = join(home, ROOT_FOLDER);
  const pidOf = () => Number(readFileSync(join(root, "server.pid"), "utf8").trim());
  cleanups.push(async () => {
    try { process.kill(pidOf()); } catch {}
    await new Promise((r) => setTimeout(r, 300));
  });

  const mine = loadIdentity(join(bench, "desk"));
  const opening = (identity, log = []) => createSshHost({ asked: "rita@devbox", publicKey: identity.publicSsh, serverDir: SERVER_DIR, name: "rita", hubFolder: "acme-hub", bin: shim, spawn, log: (line) => log.push(line) });
  const onHost = async (host, client, script, args = []) => {
    const said = await client.post("/api/run", { script: host.paths(script), args: args.map((one) => host.paths(one)) });
    assert.equal(said.ok, true, said.error);
    return Buffer.from(String(said.body?.out || ""), "base64").toString("utf8").trim();
  };

  const said = [];
  const first = opening(mine, said);
  const url = await first.reach(90000);
  assert.ok(url, "the host never came up: " + first.status().error + "\n" + said.join("\n"));
  assert.equal(readFileSync(join(home, "npm-runs"), "utf8").trim(), "run", "the host installed its own dependencies once");
  assert.ok(existsSync(join(root, "server", "engine", "driver.mjs")), "the engine did not travel");
  assert.ok(!existsSync(join(root, "server", "tests")), "the tests travelled to the host");
  assert.ok(!existsSync(join(root, "server.new")) && !existsSync(join(root, "server.old")), "the install left its scaffolding behind");
  assert.equal(readFileSync(join(root, "server.stamp"), "utf8"), serverStamp(SERVER_DIR));
  assert.match(readFileSync(join(root, "workspace", "hive", "allowed_signers"), "utf8"), /^rita ssh-ed25519 /);
  assert.ok(existsSync(join(root, "workspace", "hive", "server", "identity.json")), "the server kept its state outside the folder it was given, in spite of what the host's own shell exported");
  assert.equal(first.status().node, process.versions.node, "the node the login shell knows was not the one that answered");

  const door = await (await fetch(url + "/api/broker")).json();
  assert.match(door.fingerprint, /^SHA256:/);
  const me = await createBrokerClient({ url, identity: mine, audience: door.fingerprint }).me();
  assert.equal(me.ok, true, "the host did not take the key of the machine that installed it: " + me.error);
  assert.equal(me.body?.device?.kind ?? me.body?.kind, "mac", "the machine that installed the server came in as a visitor: " + JSON.stringify(me.body));

  const client = createBrokerClient({ url, identity: mine, audience: door.fingerprint });
  const workspace = join(root, "workspace");
  assert.equal(await onHost(first, client, 'cd /workspace/hive && pwd -P && printf "%s\\n" "$HIVE_HUB" /workspace/home'), [join(workspace, "hive"), join(workspace, "repos"), home].join("\n"),
    "a script written for the container did not land in the host's folders");
  assert.equal(await onHost(first, client, 'PATH=/workspace/npm-global/bin:/usr/bin:/bin; node -p process.versions.node'), process.versions.node, "a line that resets the PATH lost the host's node");
  const wrote = await client.post("/api/file", { path: first.paths("/workspace/hive/assets/note.txt"), data: Buffer.from("hello").toString("base64") });
  assert.equal(wrote.ok, true, wrote.error);
  assert.equal(readFileSync(join(workspace, "hive", "assets", "note.txt"), "utf8"), "hello");
  const firstPid = pidOf();
  first.stop();

  const again = opening(mine);
  const sameUrl = await again.reach(60000);
  assert.ok(sameUrl, again.status().error);
  assert.equal(pidOf(), firstPid, "a server that was already running this version was restarted");
  assert.equal(readFileSync(join(home, "npm-runs"), "utf8").trim(), "run", "nothing was installed twice");
  again.stop();

  const laptop = loadIdentity(join(bench, "laptop"));
  const second = opening(laptop);
  const laptopUrl = await second.reach(60000);
  assert.ok(laptopUrl, second.status().error);
  assert.notEqual(pidOf(), firstPid, "a new key is only read when the server starts");
  const asLaptop = await createBrokerClient({ url: laptopUrl, identity: laptop, audience: door.fingerprint }).me();
  assert.equal(asLaptop.ok, true, "the second machine of the same person was turned away: " + asLaptop.error);
  const stillMine = await createBrokerClient({ url: laptopUrl, identity: mine, audience: door.fingerprint }).me();
  assert.equal(stillMine.ok, true, "the first machine lost its place when the second arrived");
  const secondPid = pidOf();
  second.stop();

  mkdirSync(join(root, "workspace", "repos", "acme-hub"));
  const withHub = opening(mine);
  const hubUrl = await withHub.reach(60000);
  assert.ok(hubUrl, withHub.status().error);
  assert.notEqual(pidOf(), secondPid, "the hub arrived on the host and the server kept running without it");
  const hubClient = createBrokerClient({ url: hubUrl, identity: mine, audience: door.fingerprint });
  assert.equal(await onHost(withHub, hubClient, 'printf %s "$HIVE_HUB"'), join(root, "workspace", "repos", "acme-hub"));
  withHub.stop();
});
