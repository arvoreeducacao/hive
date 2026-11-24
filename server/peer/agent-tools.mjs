import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const agentToolsFile = (base) => join(base, "agent-tools.json");

export function readAgentTools(base) {
  try {
    const said = JSON.parse(readFileSync(agentToolsFile(base), "utf8"));
    return { devices: said?.devices !== false };
  } catch {
    return { devices: true };
  }
}

let shared = "";

export function shareAgentTools(base, config) {
  const devices = config?.devices !== false && config?.deviceAgents !== false;
  const body = `${JSON.stringify({ devices })}\n`;
  if (`${base}\n${body}` === shared) return false;
  try {
    const file = agentToolsFile(base);
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, body);
    renameSync(temp, file);
    shared = `${base}\n${body}`;
    return true;
  } catch {
    return false;
  }
}

export const isDeviceTool = (name) => String(name || "").startsWith("device_");
