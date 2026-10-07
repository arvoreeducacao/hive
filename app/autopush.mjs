import { homedir } from "node:os";
import { join } from "node:path";
import { onePass, rootsOf } from "../server/autopush.mjs";

const asked = process.argv.indexOf("--hub");
const hub = asked > 0 ? process.argv[asked + 1] || "" : process.env.HIVE_HUB || "";
const state = join(homedir(), ".hive", "autopush-state");
const roots = rootsOf({ hub });
const every = Number(process.env.HIVE_AUTOPUSH_EVERY || 120) * 1000;
const say = (line) => process.stdout.write(`${line}\n`);

if (!roots.length) {
  say("nothing to push: no hub was named");
  process.exit(0);
}

if (process.argv.includes("--daemon")) {
  for (;;) {
    onePass({ roots, state, say });
    await new Promise((done) => setTimeout(done, every));
  }
} else {
  onePass({ roots, state, say });
}
