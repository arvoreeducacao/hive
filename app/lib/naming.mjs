import { join } from "node:path";

const NAME_SHAPE = /^[a-z0-9]+(-[a-z0-9]+){0,4}$/;
const LINK = /https?:\/\/\S+/gi;
const SLACK_THREAD = /slack\.com\/archives\/([a-z0-9]+)\/p(\d{10})\d{6}/i;
const GITHUB_PULL = /github\.com\/[\w.-]+\/([\w.-]+)\/pull\/(\d+)/i;

export function slug(text) {
  return String(text || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
}

function nameFromLink(link) {
  const thread = SLACK_THREAD.exec(link);
  if (thread) return slug(`slack ${thread[1]} ${thread[2]}`);
  const pull = GITHUB_PULL.exec(link);
  if (pull) return slug(`${pull[1]} pr ${pull[2]}`);
  try {
    const where = new URL(link);
    const host = where.hostname.replace(/^www\./, "").split(".")[0];
    const tail = where.pathname.split("/").filter(Boolean).slice(-2).join(" ");
    return slug(`${host} ${tail}`);
  } catch { return ""; }
}

export function pastHandles(text) {
  const lines = String(text || "").split("\n");
  let cut = 0;
  while (cut < lines.length && lines[cut].startsWith("[hive] ")) cut += 1;
  return lines.slice(cut).join("\n").replace(/^\n+/, "");
}

export const NAME_TRIES_FREE = 60;

export function freeNameAmong(name, taken) {
  if (!name || !taken.has(name)) return name;
  for (let i = 2; i < NAME_TRIES_FREE; i++) if (!taken.has(`${name}-${i}`)) return `${name}-${i}`;
  return `${name}-${Date.now().toString().slice(-4)}`;
}

export function nameFromMission(prompt) {
  const mission = pastHandles(prompt);
  const said = mission.replace(LINK, " ").trim();
  if (said) return slug(said.split(/\s+/).slice(0, 4).join("-"));
  const named = nameFromLink((mission.match(LINK) || [])[0] || "");
  return named || slug(mission.split(/\s+/).slice(0, 4).join("-"));
}

export function nameFromAnswer(line, prompt) {
  const named = slug(line);
  if (NAME_SHAPE.test(named)) return named;
  return nameFromMission(prompt);
}

export const NAMER_MODELS = { claude: "haiku", codex: "gpt-5.6-luna", kimi: "", kiro: "claude-haiku-4.5", cursor: "" };

export function kimiAnswer(out) {
  const said = [];
  for (const line of String(out || "").split("\n")) {
    try {
      const row = JSON.parse(line);
      if (row?.role === "assistant" && typeof row.content === "string") said.push(row.content);
    } catch {}
  }
  return said.join("\n").split("\n").map((l) => l.trim()).filter(Boolean).pop() || "";
}

export function namerCommand({ agent, prompt, outFile, claude, engineDir = "", schema = "" }) {
  if (agent === "codex") {
    return {
      exe: "codex",
      args: ["exec", "--ephemeral", "--skip-git-repo-check", "-m", NAMER_MODELS.codex, "-c", 'model_reasoning_effort="low"', "-o", outFile, prompt],
      answerIn: outFile
    };
  }
  if (agent === "kimi") {
    return { exe: "kimi", args: ["-p", prompt, "--output-format", "stream-json"], answerIn: "", pick: kimiAnswer };
  }
  if (agent === "kiro") {
    return { exe: process.execPath, args: [join(engineDir, "kiro-namer.mjs"), prompt], answerIn: "" };
  }
  if (agent === "cursor") {
    return { exe: "cursor-agent", args: ["-p", prompt, "--output-format", "text", "--mode", "ask", "--trust"], answerIn: "" };
  }
  const shaped = schema
    ? ["--output-format", "json", "--json-schema", schema, "--tools", "", "--disable-slash-commands", "--settings", '{"disableAllHooks":true}', "--permission-mode", "dontAsk"]
    : [];
  return {
    exe: claude,
    args: ["-p", prompt, "--model", NAMER_MODELS.claude, "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', ...shaped],
    answerIn: ""
  };
}
