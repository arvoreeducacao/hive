const quoted = (word) => `'${String(word).replace(/'/g, "'\\''")}'`;

export function peerToolsCommand({ node, peer }) {
  const line = `${node} ${peer}`;
  return [
    `claude mcp list 2>/dev/null | grep -qF ${quoted(line)}`,
    `{ claude mcp remove --scope user hive >/dev/null 2>&1; claude mcp add --scope user hive -- ${quoted(node)} ${quoted(peer)}; }`
  ].join(" || ");
}

export const PEER_MODULE_PROBE = 'for d in "${HIVE_SERVER_DIR:-}" /workspace/hive/server; do [ -n "$d" ] && [ -f "$d/peer/peer-mcp.mjs" ] && { printf %s "$d/peer/peer-mcp.mjs"; break; }; done; true';
