import { peerEntry } from "../../server/engine/peer-module.mjs";

export function externalMcpCommand({ entry, node = "node", stateDir = "", ceiling = "read", label = "terminal" }) {
  const env = [`-e HIVE_CLIENT=${label}`, `-e HIVE_CLIENT_CEILING=${ceiling}`, stateDir ? `-e HIVE_STATE_DIR=${stateDir}` : ""].filter(Boolean).join(" ");
  return `claude mcp add hive ${env} -- ${node} ${entry}`;
}

export function registerExternalMcpRoutes(on, { home, node = process.execPath }) {
  on("GET", "/api/mcp/external", async (req, res, url, json) => {
    const ceiling = url.searchParams.get("ceiling") === "operate" ? "operate" : "read";
    const entry = peerEntry();
    return json({ entry, ceiling, command: externalMcpCommand({ entry, node, stateDir: home, ceiling }) });
  });
}
