export const codexMcpName = (name) => String(name).replace(/[^A-Za-z0-9_]/g, "_");

export function codexServerToAdd(mcpJsonText, wanted, known = []) {
  if (known.includes(wanted)) return null;
  let parsed;
  try { parsed = JSON.parse(mcpJsonText || "{}"); } catch { return null; }
  for (const [name, server] of Object.entries(parsed?.mcpServers || {})) {
    if (codexMcpName(name) !== wanted) continue;
    if (!server || typeof server.url !== "string" || (server.type && server.type !== "http")) return null;
    return { name: wanted, url: server.url };
  }
  return null;
}

export function codexKnownServers(listJson) {
  try {
    const list = JSON.parse(listJson);
    return Array.isArray(list) ? list.map((s) => String(s.name || "")).filter(Boolean) : [];
  } catch { return []; }
}
