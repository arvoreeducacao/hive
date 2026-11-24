import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "../../server/engine/leftovers.mjs";

export const OPENERS = [
  { id: "cursor", name: "Cursor", app: "Cursor", cli: "cursor" },
  { id: "vscode", name: "VS Code", app: "Visual Studio Code", cli: "code" },
  { id: "windsurf", name: "Windsurf", app: "Windsurf", cli: "windsurf" },
  { id: "zed", name: "Zed", app: "Zed", cli: "zed" },
  { id: "sublime", name: "Sublime Text", app: "Sublime Text", cli: "subl" },
  { id: "webstorm", name: "WebStorm", app: "WebStorm", cli: "webstorm" },
  { id: "ghostty", name: "Ghostty", app: "Ghostty", cli: "" },
  { id: "iterm", name: "iTerm", app: "iTerm", cli: "" },
  { id: "warp", name: "Warp", app: "Warp", cli: "" },
  { id: "terminal", name: "Terminal", app: "Terminal", cli: "" },
  { id: "finder", name: "Finder", app: "", cli: "" }
];

const SEARCH_PATH = ["/usr/local/bin", "/opt/homebrew/bin", join(homedir(), ".local", "bin"), "/usr/bin", "/snap/bin"];

const appInstalled = (app, exists) => !!app && [join("/Applications", `${app}.app`), join(homedir(), "Applications", `${app}.app`), join("/System/Applications/Utilities", `${app}.app`)].some((path) => exists(path));

const cliInstalled = (cli, exists) => !!cli && SEARCH_PATH.some((dir) => exists(join(dir, cli)));

export function openersHere({ platform = process.platform, exists = existsSync } = {}) {
  if (platform === "darwin") return OPENERS.filter((one) => one.id === "finder" || appInstalled(one.app, exists)).map(({ id, name }) => ({ id, name }));
  const found = OPENERS.filter((one) => cliInstalled(one.cli, exists)).map(({ id, name }) => ({ id, name }));
  return [...found, { id: "files", name: platform === "win32" ? "Explorer" : "Files" }];
}

export function openCommand(id, dir, { platform = process.platform, exists = existsSync } = {}) {
  if (platform === "darwin") {
    if (id === "finder") return ["open", [dir]];
    const one = OPENERS.find((opener) => opener.id === id && opener.app);
    return one && appInstalled(one.app, exists) ? ["open", ["-a", one.app, dir]] : null;
  }
  if (id === "files") return platform === "win32" ? ["explorer", [dir]] : ["xdg-open", [dir]];
  const one = OPENERS.find((opener) => opener.id === id && opener.cli);
  const path = one && SEARCH_PATH.map((folder) => join(folder, one.cli)).find((candidate) => exists(candidate));
  return path ? [path, [dir]] : null;
}

export async function openIn(id, dir, { run = exec, ...options } = {}) {
  if (!dir) return { error: "this chat has no folder on this machine" };
  const command = openCommand(id, dir, options);
  if (!command) return { error: "that app is not on this machine" };
  const said = await run(command[0], command[1], { timeout: 8000 });
  return said.ok ? { ok: true } : { error: "the app did not open" };
}
