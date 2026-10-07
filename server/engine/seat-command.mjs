import { readFileSync } from "node:fs";

import { hiveShellExec } from "./hive-shell.mjs";
import { providerEnv } from "./providers.mjs";

const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function quoteForShell(word) {
  const one = String(word ?? "");
  return one && SHELL_SAFE.test(one) ? one : `'${one.replace(/'/g, "'\\''")}'`;
}

export const HELD_BY_EVERY_ACCOUNT = ["CLAUDE.md", "settings.json", "plugins", "projects", "commands", "agents", "skills"];

export function accountDirOf(accounts, name) {
  return !name || name === "default" ? "" : `${accounts}/${name}`;
}

export function carriedEnv(carry) {
  const words = [];
  for (const [key, value] of Object.entries(carry || {})) {
    if (!ENV_NAME.test(key)) throw new Error(`${key} is not a name an environment variable can have`);
    if (value === undefined || value === null || value === "") continue;
    words.push(`${key}=${quoteForShell(value)}`);
  }
  return words.length ? `${words.join(" ")} ` : "";
}

function readPrompt(file) {
  return `"$(cat ${quoteForShell(file)})"`;
}

/* the line runs in a POSIX shell wherever it was built, so a folder in it is spelled
   with / even when the machine writing it is a Windows runner */
const posixValues = (env) => Object.fromEntries(Object.entries(env).map(([key, value]) => [key, String(value).replace(/\\/g, "/")]));

function arrivalAt(hub, fallback) {
  if (!hub && !fallback) return { go: 'cd "$HOME"', then: " && " };
  const there = quoteForShell(hub || fallback);
  if (!fallback) return { go: `cd ${there}`, then: " && " };
  return { go: `cd ${there} 2>/dev/null || cd ${quoteForShell(fallback)}`, then: "; " };
}

export function seatCommand({
  hub,
  name,
  agent = "claude",
  model = "",
  effort = "",
  sessionId = "",
  resumeId = "",
  structured = false,
  kind = "",
  compactAt = "",
  promptFile = "",
  driver = "",
  stateDir = "",
  accountDir = "",
  remoteControl = true,
  side = "local",
  carry = {},
  addDir = "",
  shell = "bash",
  fallback = "",
  continueLast = false
}) {
  const arrival = arrivalAt(hub, fallback);
  if (kind === "shell") return `${arrival.go}${arrival.then}${hiveShellExec(shell, stateDir)}`;

  const carried = carriedEnv(carry);
  const held = carriedEnv(posixValues(providerEnv(agent, accountDir)));
  const mine = `HIVE_SEAT=${quoteForShell(name)} HIVE_SIDE=${quoteForShell(side)} HIVE_STATE_DIR=${quoteForShell(stateDir)}`;
  const model_ = model ? ` --model ${quoteForShell(model)}` : "";
  const reach = addDir ? ` --add-dir ${quoteForShell(addDir)}` : "";
  const words = [];

  if (structured) {
    if (!driver) throw new Error("a structured seat needs a driver");
    const asAgent = agent === "claude" ? "" : ` --agent ${quoteForShell(agent)}`;
    const resumed = resumeId ? ` --resume-id ${quoteForShell(resumeId)}` : "";
    const session = agent === "claude" && !resumed && sessionId ? ` --session-id ${quoteForShell(sessionId)}` : "";
    const compact = compactAt ? ` --autocompact ${quoteForShell(compactAt)}` : "";
    words.push(`${carried}${held}${mine} node ${quoteForShell(driver)}${asAgent} --name ${quoteForShell(name)} --cwd ${quoteForShell(hub)}${model_}${resumed}${session}${compact}`);
    if (["claude", "codex", "kimi"].includes(agent) && effort) words.push(` --effort ${quoteForShell(effort)}`);
    if (promptFile) words.push(` --prompt-file ${quoteForShell(promptFile)}`);
  } else if (agent === "opencode") {
    const back = resumeId ? ` -s ${quoteForShell(resumeId)}` : continueLast ? " -c" : "";
    words.push(`${carried}${held}${mine} opencode --agent build${model_}${back}`);
    if (promptFile && !back) words.push(` --prompt ${readPrompt(promptFile)}`);
  } else if (agent === "codex") {
    const back = resumeId ? ` resume ${quoteForShell(resumeId)}` : continueLast ? " resume --last" : "";
    words.push(`${carried}${held}${mine} codex${back} --dangerously-bypass-approvals-and-sandbox${model_}`);
    if (effort) words.push(` -c ${quoteForShell(`model_reasoning_effort=${JSON.stringify(effort)}`)}`);
    if (promptFile && !back) words.push(` ${readPrompt(promptFile)}`);
  } else if (agent === "kimi") {
    const back = resumeId ? ` -S ${quoteForShell(resumeId)}` : continueLast ? " -c" : "";
    words.push(`${carried}${held}${mine} kimi --yolo${model_}${back}`);
  } else if (agent === "kiro") {
    const back = resumeId ? ` --resume-id ${quoteForShell(resumeId)}` : continueLast ? " --resume" : "";
    words.push(`${carried}${held}${mine} kiro-cli chat --trust-all-tools${model_}${back}`);
    if (promptFile && !back) words.push(` ${readPrompt(promptFile)}`);
  } else if (agent === "cursor") {
    const back = resumeId ? ` --resume ${quoteForShell(resumeId)}` : continueLast ? " --continue" : "";
    words.push(`${carried}${held}${mine} cursor-agent --force --trust${model_}${back}`);
    if (promptFile && !back) words.push(` ${readPrompt(promptFile)}`);
  } else {
    const seen = remoteControl ? ` --remote-control ${quoteForShell(name)}` : "";
    const resumed = resumeId ? ` --resume ${quoteForShell(resumeId)}` : "";
    const session = !resumed && sessionId ? ` --session-id ${quoteForShell(sessionId)}` : "";
    const compact = compactAt ? ` --autocompact ${quoteForShell(compactAt)}` : "";
    words.push(`${carried}${held}${mine} FORCE_HYPERLINK=1 claude${resumed} --dangerously-skip-permissions${reach}${seen}${model_}${session}${compact}`);
    if (promptFile) words.push(` ${readPrompt(promptFile)}`);
  }

  return `${arrival.go}${arrival.then}${words.join("")}`;
}

export const SHELL_PROGRAM = "shell";

function carriedEnvMap(carry) {
  const held = {};
  for (const [key, value] of Object.entries(carry || {})) {
    if (!ENV_NAME.test(key)) throw new Error(`${key} is not a name an environment variable can have`);
    if (value === undefined || value === null || value === "") continue;
    held[key] = String(value);
  }
  return held;
}

const promptText = (file, read) => String(read(file)).replace(/\n+$/, "");

/* the same seat as seatCommand, spelled as a program and its argv for a machine that
   opens the pty itself and passes no shell in between */
export function seatArgv({
  hub,
  name,
  agent = "claude",
  model = "",
  effort = "",
  sessionId = "",
  resumeId = "",
  structured = false,
  kind = "",
  compactAt = "",
  promptFile = "",
  driver = "",
  stateDir = "",
  accountDir = "",
  remoteControl = true,
  side = "local",
  carry = {},
  addDir = "",
  fallback = "",
  continueLast = false,
  readPrompt = (file) => readFileSync(file, "utf8")
}) {
  const cwd = hub || fallback;
  if (kind === "shell") return { program: SHELL_PROGRAM, args: [], env: {}, cwd, fallback };

  const env = { ...carriedEnvMap(carry), ...providerEnv(agent, accountDir), HIVE_SEAT: name, HIVE_SIDE: side, HIVE_STATE_DIR: stateDir };
  const withModel = model ? ["--model", model] : [];
  const args = [];

  if (structured) {
    if (!driver) throw new Error("a structured seat needs a driver");
    args.push(driver);
    if (agent !== "claude") args.push("--agent", agent);
    args.push("--name", name, "--cwd", hub, ...withModel);
    if (resumeId) args.push("--resume-id", resumeId);
    else if (agent === "claude" && sessionId) args.push("--session-id", sessionId);
    if (compactAt) args.push("--autocompact", compactAt);
    if (["claude", "codex", "kimi"].includes(agent) && effort) args.push("--effort", effort);
    if (promptFile) args.push("--prompt-file", promptFile);
    return { program: "node", args, env, cwd, fallback };
  }
  if (agent === "opencode") {
    const back = resumeId ? ["-s", resumeId] : continueLast ? ["-c"] : [];
    args.push("--agent", "build", ...withModel, ...back);
    if (promptFile && !back.length) args.push("--prompt", promptText(promptFile, readPrompt));
    return { program: "opencode", args, env, cwd, fallback };
  }
  if (agent === "codex") {
    const back = resumeId ? ["resume", resumeId] : continueLast ? ["resume", "--last"] : [];
    args.push(...back, "--dangerously-bypass-approvals-and-sandbox", ...withModel);
    if (effort) args.push("-c", `model_reasoning_effort=${JSON.stringify(effort)}`);
    if (promptFile && !back.length) args.push(promptText(promptFile, readPrompt));
    return { program: "codex", args, env, cwd, fallback };
  }
  if (agent === "kimi") {
    const back = resumeId ? ["-S", resumeId] : continueLast ? ["-c"] : [];
    args.push("--yolo", ...withModel, ...back);
    return { program: "kimi", args, env, cwd, fallback };
  }
  if (agent === "kiro") {
    const back = resumeId ? ["--resume-id", resumeId] : continueLast ? ["--resume"] : [];
    args.push("chat", "--trust-all-tools", ...withModel, ...back);
    if (promptFile && !back.length) args.push(promptText(promptFile, readPrompt));
    return { program: "kiro-cli", args, env, cwd, fallback };
  }
  if (agent === "cursor") {
    const back = resumeId ? ["--resume", resumeId] : continueLast ? ["--continue"] : [];
    args.push("--force", "--trust", ...withModel, ...back);
    if (promptFile && !back.length) args.push(promptText(promptFile, readPrompt));
    return { program: "cursor-agent", args, env, cwd, fallback };
  }
  if (resumeId) args.push("--resume", resumeId);
  args.push("--dangerously-skip-permissions");
  if (addDir) args.push("--add-dir", addDir);
  if (remoteControl) args.push("--remote-control", name);
  args.push(...withModel);
  if (!resumeId && sessionId) args.push("--session-id", sessionId);
  if (compactAt) args.push("--autocompact", compactAt);
  if (promptFile) args.push(promptText(promptFile, readPrompt));
  return { program: "claude", args, env: { ...env, FORCE_HYPERLINK: "1" }, cwd, fallback };
}
