export const NO_ADDRESS = "this hive has no server address — put one in HIVE_SERVER_URL";

export function withServerLines(text, { url, key }) {
  const kept = String(text || "")
    .split("\n")
    .filter((line) => !/^\s*HIVE_SERVER_(URL|KEY)=/.test(line));
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  kept.push(`HIVE_SERVER_URL=${url}`, `HIVE_SERVER_KEY=${key}`, "");
  return kept.join("\n");
}

/* node's fetch says only "fetch failed" and hides the real trouble — the dns
   miss of a door nobody opened — one level down, in the cause. */
export function reasonOf(wrong) {
  const said = String(wrong?.message || wrong || "").trim();
  const cause = wrong?.cause;
  const under = cause ? String(cause.message || cause.code || cause).trim() : "";
  if (!under || under === said) return said;
  return `${said}: ${under}`;
}

export async function askTheDoor(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  if (!url) return { ok: false, error: NO_ADDRESS };
  const stop = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  try {
    const said = await fetchImpl(`${url}/api/broker`, { signal: stop });
    if (!said.ok) return { ok: false, error: `the door answered ${said.status}` };
    const held = await said.json();
    const fingerprint = String(held?.fingerprint || "");
    if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) return { ok: false, error: "the door named no key I can read" };
    return { ok: true, fingerprint, name: String(held?.name || "").slice(0, 40) };
  } catch (wrong) {
    return { ok: false, error: reasonOf(wrong) };
  }
}

export async function findCloudServer({ env, read, write, fetchImpl = fetch }) {
  const known = {
    url: String(env?.HIVE_SERVER_URL || ""),
    key: String(env?.HIVE_SERVER_KEY || ""),
    name: String(env?.HIVE_SERVER_NAME || "")
  };
  if (!known.url) return { url: "", key: "", name: "", error: NO_ADDRESS };

  const asked = await askTheDoor(known.url, { fetchImpl });
  if (!asked.ok) {
    if (known.key) return { ...known, found: "kept", stale: asked.error };
    return { url: "", key: "", name: "", error: asked.error };
  }

  const name = asked.name || known.name;
  if (asked.fingerprint === known.key) return { url: known.url, key: known.key, name, found: "kept" };

  if (write) {
    try { write(withServerLines(read ? read() : "", { url: known.url, key: asked.fingerprint })); } catch {}
  }
  return { url: known.url, key: asked.fingerprint, name, found: known.key ? "renewed" : "asked" };
}
