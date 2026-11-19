import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOCKET_CEILING = 92;
const CARRIED = ["TMUX_TMPDIR", "TMUX", "TMUX_PANE"];

export const haveTmux = spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;

export function tmuxOfItsOwn() {
  if (!haveTmux) return null;
  const under = existsSync("/tmp") ? "/tmp" : tmpdir();
  const dir = mkdtempSync(join(under, "hive-tmux-"));
  const socket = join(dir, `tmux-${typeof process.getuid === "function" ? process.getuid() : 0}`, "default");
  if (socket.length > SOCKET_CEILING) {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  const held = Object.fromEntries(CARRIED.map((key) => [key, process.env[key]]));
  process.env.TMUX_TMPDIR = dir;
  delete process.env.TMUX;
  delete process.env.TMUX_PANE;
  execFileSync("tmux", ["start-server", ";", "set-option", "-s", "exit-empty", "off"], { stdio: "ignore" });
  return {
    dir,
    socket,
    close() {
      spawnSync("tmux", ["-S", socket, "kill-server"], { stdio: "ignore" });
      for (const key of CARRIED) {
        if (held[key] === undefined) delete process.env[key];
        else process.env[key] = held[key];
      }
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
