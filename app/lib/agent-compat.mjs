export const AGENT_COMPAT = {
  codex: { recommended: ">=0.159.0", ranges: [{ below: "0.149.0", status: "broken" }] },
  opencode: { recommended: ">=1.14.19", ranges: [{ below: "1.14.19", status: "broken" }] },
  antigravity: { pattern: /^(?:agy_acp_server_)?(\d+\.\d+\.\d+)/, recommended: ">=1.5.12", ranges: [{ below: "1.5.0", status: "broken" }] }
};

const SEMVER = /(\d+)\.(\d+)\.(\d+)/;

function partsOf(version) {
  const m = String(version || "").match(SEMVER);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
  const x = partsOf(a);
  const y = partsOf(b);
  if (!x || !y) return null;
  for (let at = 0; at < 3; at++) if (x[at] !== y[at]) return x[at] < y[at] ? -1 : 1;
  return 0;
}

function stableOf(policy, version) {
  const raw = String(version || "").trim().replace(/^v/, "");
  const picked = policy.pattern ? raw.match(policy.pattern)?.[1] || raw : raw;
  return partsOf(picked) ? picked.match(SEMVER)[0] : "";
}

function rangeOf(policy, stable) {
  return policy.ranges.find((one) => compareVersions(stable, one.below) === -1) || null;
}

export function agentCompat(id, version, latest = "", policies = AGENT_COMPAT) {
  const policy = policies[id];
  if (!policy || !version) return null;
  const stable = stableOf(policy, version);
  if (!stable) return null;
  const range = rangeOf(policy, stable);
  if (!range) return null;
  const fresh = stableOf(policy, latest);
  const latestFixes = !!fresh && !rangeOf(policy, fresh);
  return { status: range.status, version: stable, recommended: policy.recommended, latestFixes };
}
