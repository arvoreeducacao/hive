export const HELPER_MARK = "--strict-mcp-config";
export const PANEL_MARK = "server.mjs";

export function strandedHelpers(psOutput) {
  const rows = [];
  for (const line of String(psOutput || "").split("\n")) {
    const seen = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (seen) rows.push({ pid: seen[1], ppid: seen[2], args: seen[3] });
  }
  const panels = new Set(rows.filter((r) => r.args.includes(PANEL_MARK)).map((r) => r.pid));
  return rows
    .filter((r) => r.args.includes(HELPER_MARK) && !panels.has(r.ppid))
    .map((r) => Number(r.pid));
}

export const BROKER_MARK = /(^|\/)server\/server\.mjs(\s|$)/;
export const ORPHAN_PPID = "1";

export function strandedServers(psOutput) {
  const stranded = [];
  for (const line of String(psOutput || "").split("\n")) {
    const seen = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!seen) continue;
    const [, pid, ppid, args] = seen;
    if (ppid !== ORPHAN_PPID) continue;
    if (!BROKER_MARK.test(args)) continue;
    stranded.push(Number(pid));
  }
  return stranded;
}
