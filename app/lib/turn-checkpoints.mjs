import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const CHECKPOINT_ROOT = "refs/hive/checkpoints";
export const CHECKPOINTS_KEPT = 60;
export const DIFF_CEILING = 2 * 1024 * 1024;
const SEAT_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BUSY = new Set(["working", "stalled", "spawning"]);
const DURABLE = ["-c", "core.fsync=objects,reference", "-c", "core.fsyncMethod=fsync"];
const AUTHOR = { GIT_AUTHOR_NAME: "Hive", GIT_AUTHOR_EMAIL: "hive@localhost", GIT_COMMITTER_NAME: "Hive", GIT_COMMITTER_EMAIL: "hive@localhost" };

export function gitRunner({ timeout = 60000, maxBuffer = 64 * 1024 * 1024 } = {}) {
  return (args, { cwd, env = {} } = {}) => new Promise((resolve) => {
    execFile("git", args, { cwd, env: { ...process.env, ...env, GIT_TERMINAL_PROMPT: "0" }, timeout, maxBuffer }, (wrong, stdout, stderr) => {
      resolve({ ok: !wrong, out: String(stdout || ""), error: String(stderr || wrong?.message || "") });
    });
  });
}

const refOf = (seat, ordinal) => `${CHECKPOINT_ROOT}/${seat}/${ordinal}`;

export function createTurnCheckpoints({ run = gitRunner(), now = () => Date.now(), log = () => {} } = {}) {
  const lastState = new Map();
  const locks = new Map();

  function locked(key, job) {
    const before = locks.get(key) || Promise.resolve();
    const next = before.catch(() => {}).then(job);
    locks.set(key, next.finally(() => { if (locks.get(key) === next) locks.delete(key); }));
    return next;
  }

  async function list(seat, path) {
    if (!SEAT_NAME.test(String(seat || "")) || !path) return [];
    const said = await run(["for-each-ref", "--format=%(refname:lstrip=4) %(objectname) %(creatordate:unix)", `${CHECKPOINT_ROOT}/${seat}/`], { cwd: path });
    if (!said.ok) return [];
    return said.out.split("\n").map((line) => line.trim().split(" ")).filter((parts) => parts.length === 3 && /^\d+$/.test(parts[0]))
      .map(([ordinal, commit, at]) => ({ ordinal: Number(ordinal), commit, at: Number(at) * 1000 }))
      .sort((a, b) => a.ordinal - b.ordinal);
  }

  async function treeOf(path, commit) {
    const said = await run(["rev-parse", `${commit}^{tree}`], { cwd: path });
    return said.ok ? said.out.trim() : "";
  }

  async function capture(seat, path, { why = "turn" } = {}) {
    if (!SEAT_NAME.test(String(seat || "")) || !path) return { error: "no seat or no path" };
    return locked(path, async () => {
      const common = await run(["rev-parse", "--git-common-dir"], { cwd: path });
      if (!common.ok) return { error: "not a git checkout" };
      const dir = common.out.trim();
      const index = join(isAbsolute(dir) ? dir : join(path, dir), `hive-checkpoint-index-${randomBytes(6).toString("hex")}`);
      const env = { GIT_INDEX_FILE: index, ...AUTHOR };
      try {
        const head = await run(["rev-parse", "--verify", "-q", "HEAD"], { cwd: path });
        const seeded = await run(head.ok ? ["read-tree", "HEAD"] : ["read-tree", "--empty"], { cwd: path, env });
        if (!seeded.ok) return { error: seeded.error.trim() || "could not seed the index" };
        const added = await run([...DURABLE, "add", "-A", "--", "."], { cwd: path, env });
        if (!added.ok) return { error: added.error.trim() || "could not stage the snapshot" };
        const tree = await run([...DURABLE, "write-tree"], { cwd: path, env });
        if (!tree.ok) return { error: tree.error.trim() || "could not write the tree" };
        const wrote = tree.out.trim();
        const kept = await list(seat, path);
        const last = kept.at(-1);
        if (last && (await treeOf(path, last.commit)) === wrote) return { same: true, ordinal: last.ordinal };
        const ordinal = (last?.ordinal || 0) + 1;
        const commit = await run([...DURABLE, "commit-tree", wrote, "-m", `hive checkpoint ${seat} #${ordinal} (${why})`], { cwd: path, env });
        if (!commit.ok) return { error: commit.error.trim() || "could not write the commit" };
        const sha = commit.out.trim();
        const ref = await run([...DURABLE, "update-ref", refOf(seat, ordinal), sha], { cwd: path });
        if (!ref.ok) return { error: ref.error.trim() || "could not keep the ref" };
        for (const old of kept.slice(0, Math.max(0, kept.length + 1 - CHECKPOINTS_KEPT))) await run(["update-ref", "-d", refOf(seat, old.ordinal)], { cwd: path });
        return { ordinal, commit: sha };
      } finally {
        rmSync(index, { force: true });
        rmSync(`${index}.lock`, { force: true });
      }
    });
  }

  async function turns(seat, path) {
    const kept = await list(seat, path);
    const out = [];
    for (let at = 0; at < kept.length; at++) {
      const one = kept[at];
      if (!at) { out.push({ ...one, added: 0, removed: 0, files: 0, baseline: true }); continue; }
      const stat = await run(["diff", "--numstat", "-z", kept[at - 1].commit, one.commit], { cwd: path });
      let added = 0, removed = 0, files = 0;
      for (const row of stat.out.split("\0")) {
        const m = row.match(/^(\d+|-)\t(\d+|-)\t/);
        if (!m) continue;
        files += 1;
        added += m[1] === "-" ? 0 : Number(m[1]);
        removed += m[2] === "-" ? 0 : Number(m[2]);
      }
      out.push({ ...one, added, removed, files });
    }
    return out;
  }

  async function diff(seat, path, ordinal) {
    const kept = await list(seat, path);
    const at = kept.findIndex((one) => one.ordinal === Number(ordinal));
    if (at <= 0) return { error: "no turn to compare" };
    const said = await run(["diff", "--patch", "--no-color", "--no-ext-diff", "--no-textconv", kept[at - 1].commit, kept[at].commit], { cwd: path });
    if (!said.ok) return { error: said.error.trim() || "git would not diff" };
    const cut = said.out.length > DIFF_CEILING;
    return { patch: cut ? said.out.slice(0, DIFF_CEILING) : said.out, cut };
  }

  async function restore(seat, path, ordinal) {
    const kept = await list(seat, path);
    const to = kept.find((one) => one.ordinal === Number(ordinal));
    if (!to) return { error: "that checkpoint is gone" };
    const before = await capture(seat, path, { why: "before going back" });
    if (before.error) return { error: `could not keep what is there now: ${before.error}` };
    return locked(path, async () => {
      const back = await run(["restore", `--source=${to.commit}`, "--worktree", "--staged", "--", "."], { cwd: path });
      if (!back.ok) return { error: back.error.trim() || "git would not restore" };
      await run(["clean", "-fd", "--", "."], { cwd: path });
      await run(["reset", "--quiet", "--", "."], { cwd: path });
      return { ok: true, ordinal: to.ordinal, kept: before.ordinal };
    });
  }

  function observe(sessions = []) {
    const jobs = [];
    for (const s of sessions) {
      if (s.where !== "local" || !SEAT_NAME.test(String(s.name || ""))) continue;
      const busy = BUSY.has(s.state);
      const was = lastState.get(s.name);
      lastState.set(s.name, busy);
      const ended = was === true && !busy;
      const first = was === undefined;
      if (!ended && !first) continue;
      for (const tree of s.trees || []) {
        if (!tree?.path || tree.main) continue;
        jobs.push(capture(s.name, tree.path, { why: ended ? "turn" : "baseline" }).then((said) => {
          if (said.error && ended) log(`checkpoint ${s.name}: ${said.error}`);
          return said;
        }));
      }
    }
    return Promise.all(jobs);
  }

  return { capture, list, turns, diff, restore, observe, at: now };
}
