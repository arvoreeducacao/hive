export const NO_FLEET_YET = /no server running|can'?t find session|no current session|session not found|failed to connect to server/i;

export function readNames(text) {
  return String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

export function namesRead({ ok, out, error }) {
  const names = readNames(out);
  if (ok || names.length) return { names, blind: false, why: "" };
  const said = String(error || "").trim();
  if (!said || NO_FLEET_YET.test(said)) return { names: [], blind: false, why: "" };
  return { names: [], blind: true, why: said.split("\n").pop().slice(0, 160) };
}

export function blindNamingError(where, why) {
  return new Error(
    `this hive could not read which seats already run on the ${where} side, and a new one would risk taking a name that is already live — ` +
    `two seats with one name share a mailbox, and what you type reaches the older one. Nothing was started: ${why}`
  );
}
