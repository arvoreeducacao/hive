const PROBLEM_MARK = "#hive:bad ";

export function searchOptions(asked = {}) {
  const on = (value) => value === true || value === "1" || value === "true";
  return { matchCase: on(asked.matchCase), wholeWord: on(asked.wholeWord), regex: on(asked.regex) };
}

export function searchFlags({ matchCase = false, wholeWord = false, regex = false } = {}) {
  return { fold: matchCase ? "" : "-i", word: wholeWord ? "-w" : "", mode: regex ? "-P" : "-F" };
}

export function patternProblem(q, { regex = false } = {}) {
  if (!regex) return "";
  try {
    new RegExp(String(q));
    return "";
  } catch (wrong) {
    return String(wrong?.message || wrong).replace(/^Invalid regular expression: /, "").replace(/^\/[\s\S]*\/[a-z]*: /, "").slice(0, 200);
  }
}

export function readSearchProblem(raw) {
  for (const line of String(raw || "").split("\n")) {
    if (line.startsWith(PROBLEM_MARK)) return line.slice(PROBLEM_MARK.length).replace(/^fatal:\s*/, "").trim().slice(0, 200);
  }
  return "";
}

export function hitMatcher(q, { matchCase = false, wholeWord = false, regex = false } = {}) {
  const needle = String(q || "");
  if (!needle) return null;
  let source = regex ? needle : needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (wholeWord) source = `(?<![\\w])(?:${source})(?![\\w])`;
  try {
    return new RegExp(source, matchCase ? "g" : "gi");
  } catch {
    return null;
  }
}
