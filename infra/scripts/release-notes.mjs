import { execFileSync } from "node:child_process";
import { mergedPr, prOf, writeNotes } from "../../app/main/update.js";

function git(args) {
  try { return execFileSync("git", args, { encoding: "utf8" }); } catch { return ""; }
}

function entriesInRange(range) {
  const walk = range ? ["--first-parent", range] : ["--first-parent", "-12"];
  const heads = git(["log", ...walk, "--format=%H%x1f%s"]).split("\n").filter(Boolean);
  const entries = [];
  for (const line of heads) {
    const [sha, subject] = line.split("\x1f");
    const pr = mergedPr(subject);
    if (!pr) {
      entries.push({ subject, pr: prOf(subject) });
      continue;
    }
    const branch = git(["log", `${sha}^1..${sha}^2`, "--no-merges", "--format=%s"]).split("\n").filter(Boolean);
    if (!branch.length) entries.push({ subject, pr });
    for (const carried of branch) entries.push({ subject: carried, pr });
  }
  return entries;
}

function main() {
  const since = process.argv[2] || "";
  const known = since ? git(["rev-parse", "--verify", "--quiet", `${since}^{commit}`]).trim() : "";
  process.stdout.write(writeNotes(entriesInRange(known ? `${since}..HEAD` : "")));
}

if (process.argv[1] && process.argv[1].endsWith("release-notes.mjs")) main();

export { entriesInRange };
