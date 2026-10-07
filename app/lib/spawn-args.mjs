export const SPAWN_ARG_PATTERN = /^[A-Za-z0-9._/-]*$/;

/* real model ids carry two shapes the general pattern has no room for: the
   bracket variants claude reports (`opus[1m]`) and the colon in a bedrock id
   (`amazon.nova-2-lite-v1:0`). Neither is a shell metacharacter inside the
   double-quoted tmux command the seat is launched with, and quote, dollar,
   backslash and backtick stay out. */
export const MODEL_ARG_PATTERN = /^[A-Za-z0-9._/:[\]-]*$/;

function patternFor(name) {
  return name === "model" ? MODEL_ARG_PATTERN : SPAWN_ARG_PATTERN;
}

export function unsafeSpawnArg(value, name = "") {
  if (value === undefined || value === null || value === "") return false;
  return !patternFor(name).test(String(value));
}

export function assertSpawnArgs(fields) {
  for (const [name, value] of Object.entries(fields)) {
    if (unsafeSpawnArg(value, name)) {
      throw new Error(name === "model"
        ? `hive spawn: refusing ${name} — only letters, digits and . _ - / : [ ] are allowed`
        : `hive spawn: refusing ${name} — only letters, digits and . _ - / are allowed`);
    }
  }
}
