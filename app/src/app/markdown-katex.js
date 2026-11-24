import katex from "katex";

export function typeset(tex, display) {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      output: "htmlAndMathml",
      throwOnError: true,
      trust: false,
      strict: "ignore",
      maxSize: 20,
      maxExpand: 1000
    });
  } catch {
    return "";
  }
}
