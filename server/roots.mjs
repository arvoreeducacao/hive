import { realpathSync } from "node:fs";

export function grounded(path) {
  if (!path) return "";
  try { return realpathSync(path); } catch { return ""; }
}

export function withinRoots(file, roots) {
  const real = grounded(file);
  if (!real) return false;
  return roots.some((root) => {
    const ground = grounded(root);
    return ground && (real === ground || real.startsWith(`${ground}/`));
  });
}
