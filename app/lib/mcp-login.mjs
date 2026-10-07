const TERMINAL_NOISE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[\[(][0-9;?]*[A-Za-z]|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export const plain = (text) => String(text).replace(TERMINAL_NOISE, "");

export function loginUrlIn(text) {
  return plain(text).match(/https?:\/\/[^\s"')\]]+/)?.[0] || "";
}

export function loginVerdict(code, tail) {
  const screen = plain(tail);
  const said = screen.split("\n").map((line) => line.trim()).filter(Boolean).pop() || "";
  const httpFail = screen.match(/HTTP [45]\d\d[^\n]*/);
  const gaveUp = screen.match(/Couldn't[^\n]*/);
  if (code === 0 && !httpFail && !gaveUp && !/error|failed|No MCP server/i.test(said)) return { state: "done", error: "" };
  return {
    state: "failed",
    error: (httpFail?.[0] || gaveUp?.[0] || said).slice(0, 200) || `login exited with code ${code}`
  };
}
