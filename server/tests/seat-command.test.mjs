import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accountDirOf, carriedEnv, seatCommand, quoteForShell } from "../engine/seat-command.mjs";

const seat = { hub: "/hub", name: "orca", stateDir: "/home/.hive" };

test("a plain chat carries the seat, the side and the state dir, and answers to its own remote control", () => {
  const line = seatCommand(seat);
  assert.match(line, /^cd \/hub && HIVE_SEAT=orca HIVE_SIDE=local HIVE_STATE_DIR=\/home\/\.hive FORCE_HYPERLINK=1 claude --dangerously-skip-permissions --remote-control orca$/);
  assert.doesNotMatch(seatCommand({ ...seat, remoteControl: false }), /--remote-control/);
});

test("a seat with no hub folder starts from home, never from wherever tmux happens to be", () => {
  assert.match(seatCommand({ ...seat, hub: "" }), /^cd "\$HOME" && HIVE_SEAT=orca /);
  assert.match(seatCommand({ ...seat, hub: "", kind: "shell" }), /^cd "\$HOME" && /);
});

test("an account reaches the agent as its config dir, and only where it belongs", () => {
  const held = accountDirOf("/home/.hive/accounts", "second");
  assert.equal(held, "/home/.hive/accounts/second");
  assert.equal(accountDirOf("/home/.hive/accounts", "default"), "");
  assert.match(seatCommand({ ...seat, accountDir: held }), /&& CLAUDE_CONFIG_DIR=\/home\/\.hive\/accounts\/second HIVE_SEAT=/);
  assert.doesNotMatch(seatCommand({ ...seat, agent: "codex", accountDir: held }), /CLAUDE_CONFIG_DIR/);
  assert.match(seatCommand({ ...seat, agent: "codex", accountDir: held }), /&& CODEX_HOME=\/home\/\.hive\/accounts\/second HIVE_SEAT=/);
});

test("the other agents run their own binary, and a session id is only claude's", () => {
  assert.match(seatCommand({ ...seat, agent: "opencode", model: "sonnet" }), /opencode --agent build --model sonnet$/);
  assert.match(seatCommand({ ...seat, agent: "codex" }), /codex --dangerously-bypass-approvals-and-sandbox$/);
  assert.match(seatCommand({ ...seat, agent: "kimi" }), /kimi --yolo$/);
  assert.match(seatCommand({ ...seat, agent: "kimi", model: "kimi-code/k3" }), /kimi --yolo --model kimi-code\/k3$/);
  assert.doesNotMatch(seatCommand({ ...seat, agent: "kimi", accountDir: "/home/.hive/accounts/second" }), /CLAUDE_CONFIG_DIR/);
  assert.match(seatCommand({ ...seat, agent: "kimi", accountDir: "/home/.hive/accounts/second" }), /KIMI_CODE_HOME=\/home\/\.hive\/accounts\/second HIVE_SEAT=/);
  assert.match(seatCommand({ ...seat, agent: "kiro" }), /kiro-cli chat --trust-all-tools$/);
  assert.match(seatCommand({ ...seat, agent: "kiro", model: "claude-sonnet-5" }), /kiro-cli chat --trust-all-tools --model claude-sonnet-5$/);
  assert.doesNotMatch(seatCommand({ ...seat, agent: "kiro", accountDir: "/home/.hive/accounts/second" }), /CLAUDE_CONFIG_DIR/);
  assert.match(seatCommand({ ...seat, agent: "kiro", accountDir: "/home/.hive/accounts/second" }), /XDG_DATA_HOME=\/home\/\.hive\/accounts\/second\/share HIVE_SEAT=/);
  assert.match(seatCommand({ ...seat, agent: "opencode", accountDir: "/home/.hive/accounts/second" }), /XDG_DATA_HOME=\/home\/\.hive\/accounts\/second\/share HIVE_SEAT=/);
  assert.match(seatCommand({ ...seat, agent: "cursor" }), /cursor-agent --force --trust$/);
  assert.match(seatCommand({ ...seat, agent: "cursor", model: "gpt-5" }), /cursor-agent --force --trust --model gpt-5$/);
  assert.match(seatCommand({ ...seat, agent: "cursor", accountDir: "/home/.hive/accounts/second" }), /XDG_CONFIG_HOME=\/home\/\.hive\/accounts\/second\/config HIVE_SEAT=/);
  assert.match(seatCommand({ ...seat, agent: "opencode", structured: true, driver: "/d/opencode-driver.mjs", accountDir: "/home/.hive/accounts/second" }), /XDG_DATA_HOME=\/home\/\.hive\/accounts\/second\/share HIVE_SEAT=[^\n]* node \/d\/opencode-driver\.mjs --agent opencode/);
  assert.match(seatCommand({ ...seat, structured: true, driver: "/d.mjs", sessionId: "abc" }), /--session-id abc/);
  for (const agent of ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]) {
    assert.match(seatCommand({ ...seat, agent, structured: true, driver: "/d.mjs", compactAt: "150k" }), /--autocompact 150k/, `${agent} takes the hive's autocompact ceiling`);
    assert.doesNotMatch(seatCommand({ ...seat, agent, structured: true, driver: "/d.mjs" }), /--autocompact/);
  }
  assert.doesNotMatch(seatCommand({ ...seat, agent: "codex", structured: true, driver: "/d.mjs", sessionId: "abc" }), /--session-id/);
});

test("the first message travels as a file the shell reads, never as an argument", () => {
  const withPrompt = seatCommand({ ...seat, promptFile: "/hub/.hive/prompts/orca.md" });
  assert.match(withPrompt, /"\$\(cat \/hub\/\.hive\/prompts\/orca\.md\)"$/);
  assert.match(seatCommand({ ...seat, structured: true, driver: "/d.mjs", promptFile: "/p.md" }), /--prompt-file \/p\.md$/);
  assert.match(seatCommand({ ...seat, agent: "opencode", promptFile: "/p.md" }), /--prompt "\$\(cat \/p\.md\)"$/);
});

test("a folder with a space or a quote in it is still one word to the shell", () => {
  const line = seatCommand({ ...seat, hub: "/Users/o'brien/my hub", stateDir: "/Users/o'brien/.hive" });
  assert.match(line, /^cd '\/Users\/o'\\''brien\/my hub' &&/);
  assert.equal(quoteForShell(""), "''");
});

test("a seat opened inside a box carries the box's home and path, and reaches the state dir", () => {
  const line = seatCommand({
    ...seat,
    hub: "/workspace/worktrees/hub/orca",
    side: "cloud",
    stateDir: "/workspace/hive",
    addDir: "/workspace/hive",
    carry: { HOME: "/workspace/home", PATH: "/workspace/npm-global/bin:/usr/bin" }
  });
  assert.match(line, /^cd \/workspace\/worktrees\/hub\/orca && HOME=\/workspace\/home PATH=\/workspace\/npm-global\/bin:\/usr\/bin HIVE_SEAT=orca HIVE_SIDE=cloud /);
  assert.match(line, / claude --dangerously-skip-permissions --add-dir \/workspace\/hive --remote-control orca$/);
});

test("a structured seat inside a box runs the driver its agent needs, with the box's environment", () => {
  const inABox = {
    hub: "/workspace/worktrees/hub/shipping",
    name: "shipping",
    stateDir: "/workspace/hive",
    side: "cloud",
    structured: true,
    carry: { HOME: "/workspace/home", IS_SANDBOX: "1" }
  };
  const claude = seatCommand({ ...inABox, driver: "/app/server/engine/driver.mjs", resumeId: "abcd1234" });
  assert.match(claude, /HOME=\/workspace\/home IS_SANDBOX=1 HIVE_SEAT=shipping HIVE_SIDE=cloud/);
  assert.match(claude, /node \/app\/server\/engine\/driver\.mjs --name shipping --cwd \/workspace\/worktrees\/hub\/shipping --resume-id abcd1234$/);

  const codex = seatCommand({ ...inABox, agent: "codex", driver: "/app/server/engine/codex-driver.mjs", resumeId: "abcd1234" });
  assert.match(codex, /node \/app\/server\/engine\/codex-driver\.mjs --agent codex --name shipping/);
  assert.match(codex, /--resume-id abcd1234/, "the driver resumes the session its agent named, and lost it");
  const kimi = seatCommand({ ...inABox, agent: "kimi", driver: "/app/server/engine/kimi-driver.mjs", resumeId: "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9", sessionId: "abc" });
  assert.match(kimi, /kimi-driver\.mjs --agent kimi --name shipping .*--resume-id session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9$/);
  assert.doesNotMatch(kimi, /--session-id/, "only claude takes a session id picked in advance");
});

test("a terminal on another agent resumes by id, or continues the last conversation of its folder", () => {
  assert.match(seatCommand({ ...seat, agent: "codex", resumeId: "0199abcd-1" }), /codex resume 0199abcd-1 --dangerously-bypass-approvals-and-sandbox$/);
  assert.match(seatCommand({ ...seat, agent: "codex", continueLast: true, model: "gpt-5.6-luna" }), /codex resume --last --dangerously-bypass-approvals-and-sandbox --model gpt-5.6-luna$/);
  assert.match(seatCommand({ ...seat, agent: "kimi", resumeId: "session_1234abcd" }), /kimi --yolo -S session_1234abcd$/);
  assert.match(seatCommand({ ...seat, agent: "kimi", continueLast: true }), /kimi --yolo -c$/);
  assert.match(seatCommand({ ...seat, agent: "kiro", resumeId: "3eb09843-2a35" }), /kiro-cli chat --trust-all-tools --resume-id 3eb09843-2a35$/);
  assert.match(seatCommand({ ...seat, agent: "kiro", continueLast: true }), /kiro-cli chat --trust-all-tools --resume$/);
  assert.match(seatCommand({ ...seat, agent: "opencode", resumeId: "ses_1234abcd" }), /opencode --agent build -s ses_1234abcd$/);
  assert.match(seatCommand({ ...seat, agent: "opencode", continueLast: true }), /opencode --agent build -c$/);
  assert.match(seatCommand({ ...seat, agent: "cursor", resumeId: "3eb09843-2a35" }), /cursor-agent --force --trust --resume 3eb09843-2a35$/);
  assert.match(seatCommand({ ...seat, agent: "cursor", continueLast: true }), /cursor-agent --force --trust --continue$/);
  for (const agent of ["codex", "kiro", "cursor", "opencode"]) {
    assert.doesNotMatch(seatCommand({ ...seat, agent, continueLast: true, promptFile: "/p.md" }), /cat \/p\.md/, `${agent} got a first message on a conversation that already had one`);
  }
  assert.match(seatCommand({ ...seat, agent: "codex", resumeId: "a b" }), /codex resume 'a b'/);
});

test("a carried variable is one word however strange its value, and a bad name is refused", () => {
  assert.equal(carriedEnv({ PATH: "/a b:$PATH" }), `PATH='/a b:$PATH' `);
  assert.equal(carriedEnv({ HOME: "" }), "");
  assert.equal(carriedEnv({}), "");
  assert.throws(() => carriedEnv({ "PATH; rm -rf /": "x" }), /not a name an environment variable can have/);
});

test("bringing a seat back resumes a transcript instead of starting a new one", () => {
  const line = seatCommand({ ...seat, resumeId: "9f1c", sessionId: "ignored", fallback: "/workspace" });
  assert.match(line, /^cd \/hub 2>\/dev\/null \|\| cd \/workspace; /);
  assert.match(line, / claude --resume 9f1c --dangerously-skip-permissions/);
  assert.doesNotMatch(line, /--session-id/);
  assert.match(seatCommand({ ...seat, structured: true, driver: "/d.mjs", resumeId: "9f1c", sessionId: "ignored" }), /--resume-id 9f1c(?!.*--session-id)/);
});

test("a shell seat is a login shell in the seat's folder, and falls back when the folder is gone", () => {
  assert.equal(seatCommand({ ...seat, kind: "shell", hub: "/gone", fallback: "/workspace" }),
    "cd /gone 2>/dev/null || cd /workspace; [ -f /home/.hive/shell/rc.bash ] && exec bash --rcfile /home/.hive/shell/rc.bash -i || exec bash -l");
  assert.equal(seatCommand({ ...seat, kind: "shell", hub: "", fallback: "/workspace", shell: "zsh" }),
    "cd /workspace 2>/dev/null || cd /workspace; [ -d /home/.hive/shell/zsh ] && ZDOTDIR=/home/.hive/shell/zsh exec zsh -l || exec zsh -l");
});

test("a shell seat without a state dir keeps the plain login shell", () => {
  assert.equal(seatCommand({ hub: "/hub", name: "term", kind: "shell" }), "cd /hub && exec bash -l");
});

const hasTmux = !spawnSync("tmux", ["-V"], { stdio: "ignore" }).error;

test("tmux opens the window with the command as one piece, path with a space and all", { skip: !hasTmux }, () => {
  const root = mkdtempSync(join(tmpdir(), "hive-seat-"));
  const hub = join(root, "my hub");
  mkdirSync(hub, { recursive: true });
  const driver = join(root, "driver.mjs");
  const seen = join(root, "seen.json");
  writeFileSync(driver, `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv.slice(2)));\nsetTimeout(() => {}, 30000);\n`);
  const prompt = join(hub, "first.md");
  writeFileSync(prompt, "open the door");

  const session = `hive-test-${process.pid}`;
  const command = seatCommand({
    hub, name: "orca", stateDir: join(root, ".hive"), structured: true, driver, promptFile: prompt, model: "opus"
  });
  try {
    execFileSync("tmux", ["new-session", "-d", "-s", session, "-n", "hub", "sleep 30"], { stdio: "ignore" });
    execFileSync("tmux", ["new-window", "-t", `${session}:`, "-n", "orca", command], { stdio: "ignore" });
    const until = Date.now() + 8000;
    while (!existsSync(seen) && Date.now() < until) execFileSync("sleep", ["0.2"]);
    assert.ok(existsSync(seen), "the driver never started — the shell could not read the command tmux was handed");
    const argv = JSON.parse(readFileSync(seen, "utf8"));
    assert.deepEqual(argv, ["--name", "orca", "--cwd", hub, "--model", "opus", "--prompt-file", prompt]);
    const windows = execFileSync("tmux", ["list-windows", "-t", session, "-F", "#{window_name}"], { encoding: "utf8" });
    assert.match(windows, /^orca$/m, "the window died as soon as it opened");
  } finally {
    spawnSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
  }
});

test("a carried environment survives the trip through tmux into the shell", { skip: !hasTmux }, () => {
  const root = mkdtempSync(join(tmpdir(), "hive-carry-"));
  const seen = join(root, "carried.txt");
  const session = `hive-carry-${process.pid}`;
  const command = `${carriedEnv({ HIVE_HOME_FOR_TEST: "/a b/home" })}sh -c 'printf %s "$HIVE_HOME_FOR_TEST" > ${quoteForShell(seen)}; sleep 30'`;
  try {
    execFileSync("tmux", ["new-session", "-d", "-s", session, "-n", "hub", "sleep 30"], { stdio: "ignore" });
    execFileSync("tmux", ["new-window", "-t", `${session}:`, "-n", "carry", command], { stdio: "ignore" });
    const until = Date.now() + 8000;
    while (!existsSync(seen) && Date.now() < until) execFileSync("sleep", ["0.2"]);
    assert.equal(readFileSync(seen, "utf8"), "/a b/home");
  } finally {
    spawnSync("tmux", ["kill-session", "-t", session], { stdio: "ignore" });
  }
});

import { seatArgv, SHELL_PROGRAM } from "../engine/seat-command.mjs";

test("the argv form of a chat carries the same flags and the same environment, with no shell in between", () => {
  const spec = seatArgv(seat);
  assert.equal(spec.program, "claude");
  assert.deepEqual(spec.args, ["--dangerously-skip-permissions", "--remote-control", "orca"]);
  assert.deepEqual(spec.env, { HIVE_SEAT: "orca", HIVE_SIDE: "local", HIVE_STATE_DIR: "/home/.hive", FORCE_HYPERLINK: "1" });
  assert.equal(spec.cwd, "/hub");
  assert.deepEqual(seatArgv({ ...seat, remoteControl: false, model: "opus[1m]", resumeId: "9f1c", accountDir: "/a/second" }).args,
    ["--resume", "9f1c", "--dangerously-skip-permissions", "--model", "opus[1m]"]);
  assert.equal(seatArgv({ ...seat, accountDir: "/a/second" }).env.CLAUDE_CONFIG_DIR, "/a/second");
  assert.equal(seatArgv({ ...seat, agent: "codex", accountDir: "/a/second" }).env.CLAUDE_CONFIG_DIR, undefined);
});

test("the argv form reads the first message from its file and hands it over whole", () => {
  const read = (file) => (file === "/p.md" ? "first line\nsecond\n\n" : "");
  assert.deepEqual(seatArgv({ ...seat, promptFile: "/p.md", readPrompt: read }).args.slice(-1), ["first line\nsecond"]);
  assert.deepEqual(seatArgv({ ...seat, agent: "opencode", promptFile: "/p.md", readPrompt: read }).args, ["--agent", "build", "--prompt", "first line\nsecond"]);
  assert.deepEqual(seatArgv({ ...seat, agent: "codex", model: "o3", promptFile: "/p.md", readPrompt: read }).args,
    ["--dangerously-bypass-approvals-and-sandbox", "--model", "o3", "first line\nsecond"]);
});

test("a structured seat in argv form runs the driver under node, and a shell names no program of its own", () => {
  const spec = seatArgv({ ...seat, structured: true, driver: "/d.mjs", sessionId: "abc", compactAt: "80", promptFile: "/p.md" });
  assert.equal(spec.program, "node");
  assert.deepEqual(spec.args, ["/d.mjs", "--name", "orca", "--cwd", "/hub", "--session-id", "abc", "--autocompact", "80", "--prompt-file", "/p.md"]);
  assert.deepEqual(seatArgv({ ...seat, structured: true, driver: "/d.mjs", agent: "opencode", sessionId: "abc" }).args,
    ["/d.mjs", "--agent", "opencode", "--name", "orca", "--cwd", "/hub"]);
  const shell = seatArgv({ ...seat, kind: "shell", hub: "", fallback: "/hub" });
  assert.equal(shell.program, SHELL_PROGRAM);
  assert.equal(shell.cwd, "/hub");
  assert.throws(() => seatArgv({ ...seat, structured: true }), /needs a driver/);
  assert.throws(() => seatArgv({ ...seat, carry: { "BAD NAME": "x" } }), /not a name an environment variable/);
});

test("Codex thinking reaches native and terminal sessions on POSIX and Windows", () => {
  const spec = { ...seat, agent: "codex", model: "gpt-6-astra", effort: "ultra", structured: true, driver: "/codex-driver.mjs" };
  assert.match(seatCommand(spec), /--effort ultra/);
  assert.ok(seatArgv(spec).args.includes("--effort"));
  assert.equal(seatArgv(spec).args[seatArgv(spec).args.indexOf("--effort") + 1], "ultra");
  const terminal = { ...seat, agent: "codex", effort: "max", resumeId: "abcd1234" };
  assert.match(seatCommand(terminal), /codex resume abcd1234/);
  assert.ok(seatCommand(terminal).includes('model_reasoning_effort="max"'));
  assert.ok(seatArgv(terminal).args.includes('model_reasoning_effort="max"'));
});
