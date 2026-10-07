import {
  GATEWAY_TOKEN_ENV, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, promptBlocks, promptParams, resumeFellThrough,
  currentModel, newSessionContext, carryOver, translate, finishTurn, contextUsage, serverRequestReply, stderrTrouble, toolName,
} from "./kimi-acp.mjs";

export {
  GATEWAY_TOKEN_ENV, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, promptBlocks, promptParams, resumeFellThrough,
  currentModel, newSessionContext, carryOver, translate, finishTurn, contextUsage, serverRequestReply, stderrTrouble, toolName,
};

export const BINARY = "cursor-agent";
export const SLASH_COMMANDS = ["model", "compact", "mcp", "context"];
export const AUTH_METHOD = "cursor_login";
export const COMPACT_COMMAND = "compact";
export const LOGIN_HINT = "nobody is signed in to Cursor on this login — run `agent login` in a terminal, then reopen the seat";
export const AUTH_TIMEOUT_MS = 20000;

export function loginTrouble(message) {
  const said = String(message || "");
  return needsLogin(said) || /no answer/i.test(said) ? `${LOGIN_HINT} (${said})` : said;
}

export function acpArgs() {
  return ["acp"];
}

export function authenticateParams() {
  return { methodId: AUTH_METHOD };
}

const NEEDS_LOGIN = /authentication required|not logged in|agent login|login required|unauthorized|\b401\b|token.*expired/i;

export function needsLogin(message) {
  return NEEDS_LOGIN.test(String(message || ""));
}

const modelOption = (configOptions) => (configOptions || []).find((o) => o?.id === "model" || o?.category === "model") || null;

export function modelConfigId(configOptions) {
  return modelOption(configOptions)?.id || "model";
}

export function setModelParams(sessionId, model, configId = "model") {
  return { sessionId, configId, value: model };
}

export function modelsFromConfigOptions(configOptions) {
  const option = modelOption(configOptions);
  if (!option) return [];
  return (option.options || []).map((row) => ({
    value: row.value,
    label: row.name || row.value,
    description: row.description || "",
    group: "cursor",
    isDefault: row.value === option.currentValue,
    efforts: [],
    defaultEffort: "",
    badges: [],
  })).filter((row) => row.value);
}

export function canCompact(ctx) {
  return (ctx?.commands || []).includes(COMPACT_COMMAND);
}
