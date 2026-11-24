import { phrase, st } from "./core.js";

const runningTerminalsOf = (chat) => (st.data?.sessions || []).filter((one) => one.of === chat && one.kind === "shell" && one.foreground && !one.dropping);

function runningTerminalSay(chat) {
  const running = runningTerminalsOf(chat);
  if (!running.length) return "";
  const what = [...new Set(running.map((one) => one.foreground))].join(", ");
  return running.length === 1 ? phrase("{what} running in the terminal", { what }) : phrase("{n} terminals running: {what}", { n: running.length, what });
}

export { runningTerminalSay, runningTerminalsOf };
