import { isAbsolute, join, normalize } from "node:path";

export const NOT_ABSOLUTE = "use the whole path, starting at / or ~";

export function hubPathFrom(text, home) {
  const typed = String(text || "").trim();
  if (!typed) return { path: "", why: "" };
  const expanded = typed === "~" ? home : /^~[\\/]/.test(typed) ? join(home, typed.slice(2)) : typed;
  if (!isAbsolute(expanded)) return { path: "", why: NOT_ABSOLUTE };
  return { path: normalize(expanded).replace(/(.)[\\/]+$/, "$1"), why: "" };
}
