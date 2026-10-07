import { existsSync } from "node:fs";
import { win32 } from "node:path";

const { join } = win32;

export const NATIVE = "native";

const GIT_BASH = ["Git", "bin", "bash.exe"];
const SYSTEM32 = /[\\/]system32[\\/]?$/i;

export const asPosixPath = (path) => String(path || "").replace(/\\/g, "/");

export function windowsRoot(env = process.env) {
  return env.SystemRoot || env.windir || "C:\\Windows";
}

/* System32\bash.exe is the launcher of the linux on the side, and a fix sent
   there runs in another operating system: no winget, no gh, none of the
   folders the person set up here. The bash a fix wants is the one Git for
   Windows ships. */
export function gitBashOf(env = process.env, exists = existsSync) {
  const named = env.HIVE_BASH;
  if (named && exists(named)) return named;
  const roots = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs") : ""];
  for (const root of roots) {
    if (!root) continue;
    const found = join(root, ...GIT_BASH);
    if (exists(found)) return found;
  }
  for (const dir of String(env.PATH || env.Path || "").split(";").filter(Boolean)) {
    if (SYSTEM32.test(dir)) continue;
    const found = join(dir, "bash.exe");
    if (exists(found)) return found;
  }
  return "";
}

const MSYS2_BASH = "C:\\msys64\\usr\\bin\\bash.exe";

/* the one bash the whole app agrees on: Git's, wherever the installer put it,
   and only then an MSYS2 left over from before the port. Every "bash" the
   server runs on Windows goes through here, so a machine the doctor can fix is
   a machine the server can run scripts on, with the same shell. */
export function bashOnWindows(env = process.env, exists = existsSync) {
  return gitBashOf(env, exists) || (exists(MSYS2_BASH) ? MSYS2_BASH : "");
}

export const NO_BASH = "this fix is a shell script and this machine has no Git Bash — install Git for Windows and run the check again";

export function fixArgv(fix, { platform = process.platform, env = process.env, exists = existsSync } = {}) {
  const command = String(fix?.command || "");
  if (platform !== "win32") return { exe: "bash", args: ["-c", command] };
  if (fix?.shell === NATIVE) return { exe: join(windowsRoot(env), "System32", "cmd.exe"), args: ["/d", "/s", "/c", command] };
  const bash = gitBashOf(env, exists);
  if (!bash) return { error: NO_BASH };
  return { exe: bash, args: ["-c", `PATH="/usr/bin:/bin:$PATH"; ${command}`] };
}
