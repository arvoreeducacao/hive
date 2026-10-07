import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** @typedef {"elixir"|"python"|"nextjs"|"nestjs"|"react-native"|"react"|"node"|"unknown"} Stack */

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
};

/**
 * que escrever a mesma coisa duas vezes.
 *
 * @param {string} dir
 * @returns {Stack}
 */
export function stackOf(dir) {
  if (existsSync(join(dir, "mix.exs"))) return "elixir";
  if (existsSync(join(dir, "pyproject.toml")) || existsSync(join(dir, "requirements.txt"))) {
    return "python";
  }

  const pkg = join(dir, "package.json");
  if (!existsSync(pkg)) return "unknown";

  const manifest = readJson(pkg);
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };

  if (deps.next) return "nextjs";
  if (deps["@nestjs/core"]) return "nestjs";
  if (deps["react-native"] || deps.expo) return "react-native";
  if (deps.react) return "react";
  return "node";
}

/**
 *
 * @param {string} root
 * @returns {{ name: string, stack: Stack }[]}
 */
export function scan(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, ".git")))
    .map((entry) => ({ name: entry.name, stack: stackOf(join(root, entry.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
