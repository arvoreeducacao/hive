import { basename } from "node:path";

const quoted = (word) => `'${String(word).replace(/'/g, "'\\''")}'`;

export function peerEntryName(stateDir = "") {
  const folder = basename(stateDir).replace(/^\./, "").replace(/[^A-Za-z0-9_-]/g, "-");
  if (!folder || folder === "hive") return "hive";
  return folder.startsWith("hive") ? folder : `hive-${folder}`;
}

export function peerToolsCommand({ node, peer, home = "" }) {
  const name = peerEntryName(home);
  const env = name === "hive" ? "" : ` -e ${quoted(`HIVE_STATE_DIR=${home}`)}`;
  return [
    `claude mcp list 2>/dev/null | grep -qF ${quoted(`${name}: ${node} ${peer}`)}`,
    `{ claude mcp remove --scope user ${name} >/dev/null 2>&1; claude mcp add --scope user ${name}${env} -- ${quoted(node)} ${quoted(peer)}; }`
  ].join(" || ");
}

export const PEER_MODULE_PROBE = 'for d in "${HIVE_SERVER_DIR:-}" /workspace/hive/server; do [ -n "$d" ] && [ -f "$d/peer/peer-mcp.mjs" ] && { printf %s "$d/peer/peer-mcp.mjs"; break; }; done; true';
