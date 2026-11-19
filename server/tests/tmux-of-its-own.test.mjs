import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { haveTmux, tmuxOfItsOwn } from "./tmux-of-its-own.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

test("the server outlives its last session, so the next test never meets it on the way out", { skip: !haveTmux }, () => {
  const before = { TMUX_TMPDIR: process.env.TMUX_TMPDIR, TMUX: process.env.TMUX };
  const own = tmuxOfItsOwn();
  assert.ok(own, "the socket path would not fit under /tmp");
  try {
    assert.equal(process.env.TMUX, undefined, "a test inside a seat would still reach the tmux of the real hive");
    for (let round = 0; round < 20; round += 1) {
      execFileSync("tmux", ["new-session", "-d", "-s", `round-${round}`, "sh"], { stdio: "ignore" });
      execFileSync("tmux", ["kill-session", "-t", `round-${round}`], { stdio: "ignore" });
      assert.equal(spawnSync("tmux", ["-S", own.socket, "list-sessions"], { stdio: "ignore" }).status, 0,
        "the server went away with its last session");
    }
  } finally {
    own.close();
  }
  assert.equal(existsSync(own.dir), false, "the socket folder was left behind");
  assert.equal(process.env.TMUX_TMPDIR, before.TMUX_TMPDIR);
  assert.equal(process.env.TMUX, before.TMUX);
});

test("every test that opens or ends a tmux session does it on a server of its own", () => {
  const folders = ["server/tests", "app/tests", "infra/tests"];
  const shared = [];
  for (const folder of folders) {
    for (const name of readdirSync(join(root, folder))) {
      if (!/\.test\.m?js$/.test(name)) continue;
      const text = readFileSync(join(root, folder, name), "utf8");
      if (!/\[\s*"(new-session|kill-session)"/.test(text)) continue;
      if (text.includes("tmuxOfItsOwn(") || /process\.env\.TMUX_TMPDIR\s*=/.test(text)) continue;
      shared.push(`${folder}/${name}`);
    }
  }
  assert.deepEqual(shared, [], "these share the default tmux server with every other test file running beside them");
});
