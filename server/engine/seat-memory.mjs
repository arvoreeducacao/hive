export const READ_OPS = ["models", "catalog", "mcp", "context", "agents", "styles"];

export function readsOnly(cmd) {
  return cmd?.type === "control" && READ_OPS.includes(cmd.op);
}

export function wakesTheSeat(cmd) {
  return cmd?.type !== "state" && cmd?.type !== "presence" && !readsOnly(cmd);
}

export function answerWhileAsleep(cmd, remembered) {
  if (!readsOnly(cmd)) return null;
  if (remembered.has(cmd.op)) return { ok: true, data: remembered.get(cmd.op), remembered: true, asleep: true };
  return { ok: false, asleep: true, error: `this chat is asleep and has not remembered its ${cmd.op} yet; a message wakes it and it answers then` };
}
