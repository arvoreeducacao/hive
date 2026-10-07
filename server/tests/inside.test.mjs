import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { agentsOf, credentialOf, diskOf, insideOf, readDisk, remoteControlUp, reposOf, worktreesOf } from "../inside.mjs";

test("the disk reading comes out in bytes and a whole percent", () => {
  assert.deepEqual(readDisk({ blocks: 100, bsize: 1024, bavail: 25 }), { total: 102400, used: 76800, free: 25600, percent: 75 });
  assert.equal(readDisk({ blocks: 0, bsize: 1024, bavail: 0 }), null);
  assert.equal(readDisk(null), null);
});

test("the disk of a path nobody has is not a crash", async () => {
  assert.equal(await diskOf("/no/such/place"), null);
});

test("the credential is read for its plan and its age, and a missing one is not a crash", async () => {
  const dir = await mkdtemp(join(tmpdir(), "inside-"));
  try {
    const file = join(dir, "creds.json");
    await writeFile(file, JSON.stringify({ claudeAiOauth: { subscriptionType: "max", expiresAt: 99 } }));
    const read = await credentialOf(file);
    assert.equal(read.plan, "max");
    assert.equal(read.expires, 99);
    assert.ok(read.at > 0);

    assert.deepEqual(await credentialOf(join(dir, "nada.json")), { at: 0, plan: "", expires: 0 });
    await writeFile(file, "{ not json");
    assert.deepEqual(await credentialOf(file), { at: 0, plan: "", expires: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("repos come out sorted, and a folder that is not there is empty", async () => {
  const dir = await mkdtemp(join(tmpdir(), "inside-"));
  try {
    for (const one of ["criar", "arvore", "api-arvore"]) await mkdir(join(dir, one));
    assert.deepEqual(await reposOf(dir), ["api-arvore", "arvore", "criar"]);
    assert.deepEqual(await reposOf(join(dir, "nao-existe")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("worktrees are counted one level down, per owner", async () => {
  const dir = await mkdtemp(join(tmpdir(), "inside-"));
  try {
    await mkdir(join(dir, "joao", "limpeza"), { recursive: true });
    await mkdir(join(dir, "joao", "porta"), { recursive: true });
    await mkdir(join(dir, "vitor", "crm"), { recursive: true });
    await writeFile(join(dir, "solto.txt"), "");
    assert.equal(await worktreesOf(dir), 3);
    assert.equal(await worktreesOf(join(dir, "nao-existe")), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("remote control is up only when tmux says the session is there", async () => {
  assert.equal(await remoteControlUp((cmd, args, opts, done) => done(null)), true);
  assert.equal(await remoteControlUp((cmd, args, opts, done) => done(new Error("no server"))), false);
});

test("what the pod answers about itself has every field the screen paints", async () => {
  const said = await insideOf({
    disk: async () => ({ total: 10, used: 4, free: 6, percent: 40 }),
    claude: async () => ({ at: 5, plan: "max", expires: 9 }),
    repos: async () => ["arvore"],
    worktrees: async () => 2,
    remoteControl: async () => true,
    agents: async () => ({ codex: "/workspace/npm-global/bin/codex" })
  });
  assert.deepEqual(said, {
    disk: { total: 10, used: 4, free: 6, percent: 40 },
    claude: { loggedIn: true, plan: "max", credentialAt: 5 },
    agents: { codex: "/workspace/npm-global/bin/codex" },
    repos: ["arvore"],
    worktrees: 2,
    remoteControl: true
  });
});

test("a pod with no credential says it is not logged in", async () => {
  const said = await insideOf({
    disk: async () => null,
    claude: async () => ({ at: 0, plan: "", expires: 0 }),
    repos: async () => [],
    worktrees: async () => 0,
    remoteControl: async () => false
  });
  assert.equal(said.claude.loggedIn, false);
  assert.equal(said.disk, null);
});

test("the box says which of the other agents it carries, by the binary on its path", async () => {
  const found = await agentsOf((cmd, args, opts, done) => {
    const binary = args[1].replace("command -v ", "");
    if (binary === "codex") return done(null, "/workspace/npm-global/bin/codex\n");
    if (binary === "kiro-cli") return done(null, "/usr/local/bin/kiro-cli\n");
    done(new Error("not found"), "");
  });
  assert.deepEqual(found, { codex: "/workspace/npm-global/bin/codex", kiro: "/usr/local/bin/kiro-cli" });
  const inside = await insideOf({
    disk: async () => null, claude: async () => ({ at: 0 }), repos: async () => [], worktrees: async () => [], remoteControl: async () => false,
    agents: async () => ({ kimi: "/usr/local/bin/kimi" })
  });
  assert.deepEqual(inside.agents, { kimi: "/usr/local/bin/kimi" });
  assert.equal(inside.claude.loggedIn, false);
});
