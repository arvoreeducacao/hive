import { execFile } from "node:child_process";

import { hubDir, workspaceRoot } from "./engine/paths.mjs";

export const OUTPUT_CEILING = 8 * 1024 * 1024;
export const DEFAULT_TIMEOUT = 60000;
export const TIMEOUT_CEILING = 300000;
export const SCRIPT_CEILING = 128 * 1024;
export const ARG_CEILING = 64;

export function timeoutAsked(raw) {
  const asked = Math.round(Number(raw) || 0);
  if (!Number.isFinite(asked) || asked <= 0) return DEFAULT_TIMEOUT;
  return Math.min(TIMEOUT_CEILING, asked);
}

export function refuse({ script, args }) {
  const one = String(script ?? "");
  if (!one.trim()) return "a run needs a script";
  if (one.length > SCRIPT_CEILING) return `that script is past the ${SCRIPT_CEILING} bytes a run carries`;
  if (args !== undefined && !Array.isArray(args)) return "the arguments have to be a list";
  if ((args || []).length > ARG_CEILING) return `a run takes at most ${ARG_CEILING} arguments`;
  if ((args || []).some((one_) => typeof one_ !== "string")) return "every argument has to be a string";
  return "";
}

export function createRun({
  run = execFile,
  workspace = workspaceRoot(),
  hub = hubDir(),
  env = process.env,
  ceiling = OUTPUT_CEILING
} = {}) {
  return {
    async run({ script, args = [], stdin = "", timeoutMs } = {}) {
      const wrong = refuse({ script, args });
      if (wrong) return { error: wrong };

      const body = stdin ? Buffer.from(String(stdin), "base64") : null;
      return new Promise((done) => {
        const child = run(
          "bash",
          ["-lc", String(script), "hive-run", ...args.map(String)],
          {
            cwd: workspace,
            env: { ...env, HIVE_WORKSPACE: workspace, HIVE_HUB: hub },
            timeout: timeoutAsked(timeoutMs),
            maxBuffer: ceiling,
            encoding: "buffer"
          },
          (failed, out, err) => done({
            ok: !failed,
            code: failed?.code ?? 0,
            out: Buffer.from(out || "").toString("base64"),
            err: String(err || "").slice(0, 4000),
            ...(failed && !out?.length ? { error: String(failed.message || failed).split("\n")[0].slice(0, 200) } : {})
          })
        );
        if (body) {
          try { child.stdin.end(body); } catch {}
        }
      });
    }
  };
}
