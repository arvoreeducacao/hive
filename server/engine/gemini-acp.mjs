import {
  GATEWAY_TOKEN_ENV, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, promptBlocks, promptParams, resumeFellThrough,
  newSessionContext, carryOver, translate as translateAcp, finishTurn, contextUsage, serverRequestReply, stderrTrouble as acpStderrTrouble, toolName,
} from "./kimi-acp.mjs";
import { parseGeminiModels } from "./agents.mjs";

export {
  GATEWAY_TOKEN_ENV, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, promptBlocks, promptParams, resumeFellThrough,
  newSessionContext, carryOver, finishTurn, contextUsage, serverRequestReply, toolName,
};

export const BINARY = "gemini";
export const SLASH_COMMANDS = ["model", "mcp", "context"];
export const YOLO_MODE = "yolo";
export const LOGIN_HINT = "nobody is signed in to Gemini on this login — run `gemini` in a terminal and pick a sign-in, then reopen the seat";

export function acpArgs() {
  return ["--acp", "--yolo", "--skip-trust"];
}

const NEEDS_LOGIN = /api key is missing|authentication required|login required|invalid_grant|UNAUTHENTICATED|unauthorized|\b401\b/i;

export function needsLogin(message) {
  return NEEDS_LOGIN.test(String(message || ""));
}

export function loginTrouble(message) {
  const said = String(message || "");
  return needsLogin(said) ? `${LOGIN_HINT} (${said})` : said;
}

export function setModelParams(sessionId, modelId) {
  return { sessionId, modelId };
}

export function setModeParams(sessionId, modeId = YOLO_MODE) {
  return { sessionId, modeId };
}

export function modelsFromSession(result) {
  return parseGeminiModels(result);
}

export function currentModel(result) {
  return result?.models?.currentModelId || "";
}

export function currentMode(result) {
  return result?.modes?.currentModeId || "";
}

export function canCompact() {
  return false;
}

export function toolInputOf(update) {
  const description = String(update?.title || "");
  const path = update?.locations?.[0]?.path;
  return typeof path === "string" && path ? { file_path: path, description } : { description };
}

export function translate(msg, ctx) {
  const update = msg?.params?.update;
  if (update?.sessionUpdate !== "tool_call" || !update.toolCallId || update.rawInput) return translateAcp(msg, ctx);
  return translateAcp({ ...msg, params: { ...msg.params, update: { ...update, rawInput: toolInputOf(update) } } }, ctx);
}

export function stderrTrouble(rawLine) {
  if (/^\s*Error handling (?:request|notification)\b/i.test(String(rawLine || ""))) return null;
  return acpStderrTrouble(rawLine);
}
