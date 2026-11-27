import { applyEdits, modify } from "jsonc-parser";
import { isPlainObject } from "./config.mjs";

const JSONC_FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

export const MERGED_SECTIONS = new Set(["threads"]);

export function editLeaves(text, patch, current, path = []) {
  let out = text;
  for (const [key, value] of Object.entries(patch)) {
    const here = [...path, key];
    if (!isPlainObject(value)) {
      out = applyEdits(out, modify(out, here, value, JSONC_FORMAT));
      continue;
    }
    const before = isPlainObject(current?.[key]) ? current[key] : {};
    out = editLeaves(out, value, before, here);
    if (MERGED_SECTIONS.has(here.join("."))) continue;
    for (const gone of Object.keys(before)) {
      if (!(gone in value)) out = applyEdits(out, modify(out, [...here, gone], undefined, JSONC_FORMAT));
    }
  }
  return out;
}
