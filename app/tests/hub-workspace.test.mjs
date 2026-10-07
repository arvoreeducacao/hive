import { test } from "node:test";
import assert from "node:assert";
import { linePlanOf, mcpsOf, readManifest, reposOf, skillDescriptionOf, skillsOf, workspaceOf } from "../lib/hub-workspace.mjs";

const manifest = {
  repos: ["arvoreeducacao/api-arvore", "arvoreeducacao/arvore", "arvoreeducacao/offboarding"],
  skills: { delivery: "*", "backend-nestjs": ["api-arvore"], "mobile-app": [{ repo: "arvore", path: "apps/mobile/**" }] },
  mcps: { linear: "*", "arvore-mysql": ["arvore", "api-arvore"], "criar-postgresql": ["arvore"] },
};

const onDisk = [
  { name: "api-arvore", branch: "main", loose: 2, ahead: 0, top: true },
  { name: "arvore", branch: "main", loose: 0, ahead: 0, top: true },
  { name: "dev-workspaces", branch: "main", loose: 0, ahead: 1, top: true },
  { name: "alguma-worktree", branch: "wip", loose: 1, ahead: 0, top: false },
];

const wired = {
  linear: { type: "http", url: "https://mcp.linear.app/mcp" },
  "arvore-mysql": { type: "http", url: "http://127.0.0.1:4671/mcp/arvore-mysql" },
  sentry: { type: "http", url: "http://127.0.0.1:4671/mcp/sentry" },
};

test("a manifest reads when repos is a list of org/name, and carries what is off", () => {
  const read = readManifest(JSON.stringify(manifest));
  assert.equal(read.state, "read");
  assert.deepEqual(read.issues, []);
});

test("a manifest that is not json, or has no repos list, is unreadable and says why", () => {
  assert.equal(readManifest("{ nope").state, "unreadable");
  assert.match(readManifest("{ nope").said, /not valid JSON/);
  assert.match(readManifest(JSON.stringify({ repos: "x" })).said, /"repos" must be an array/);
  assert.match(readManifest("[]").said, /must be an object/);
});

test("a repository written without its org, a scope pointing nowhere and a stray key are issues, not a crash", () => {
  const read = readManifest(JSON.stringify({
    repos: ["arvoreeducacao/api-arvore", "arvore", "arvoreeducacao/api-arvore"],
    mcps: { signoz: ["arvore-eink-old"], broken: [] },
    skills: { odd: { repo: "api-arvore" } },
    typo: 1,
  }));
  assert.equal(read.state, "read");
  assert.deepEqual(read.issues.map((i) => i.path), ["/repos/1", "/repos/2", "/skills/odd", "/mcps/signoz", "/mcps/broken", "/typo"]);
  assert.match(read.issues[3].message, /not in repos/);
});

test("repos marry what the manifest declares with what is on disk, by basename", () => {
  const repos = reposOf(manifest, onDisk, { "api-arvore": "nestjs", arvore: "elixir", "dev-workspaces": "unknown" });
  const byName = Object.fromEntries(repos.map((r) => [r.name, r]));

  assert.equal(byName["api-arvore"].declared, true);
  assert.equal(byName["api-arvore"].cloned, true);
  assert.equal(byName["api-arvore"].tech, "nestjs");
  assert.equal(byName["api-arvore"].loose, 2);
  assert.deepEqual(byName["api-arvore"].skills, ["backend-nestjs"]);
  assert.deepEqual(byName["arvore"].skills, ["mobile-app"]);

  assert.equal(byName["offboarding"].declared, true);
  assert.equal(byName["offboarding"].cloned, false);

  assert.equal(byName["dev-workspaces"].declared, false);
  assert.equal(byName["dev-workspaces"].cloned, true);
  assert.equal(byName["dev-workspaces"].tech, "");
});

test("a repo inside .worktrees never counts as an undeclared repo", () => {
  assert.equal(reposOf(manifest, onDisk).some((r) => r.name === "alguma-worktree"), false);
});

test("a nested repo the walk only knows by basename still counts as cloned", () => {
  const repos = reposOf({ repos: ["arvoreeducacao/brand"] }, [{ name: "brand", branch: "main", loose: 0, ahead: 0, top: false }]);
  assert.equal(repos.length, 1);
  assert.equal(repos[0].cloned, true);
  assert.equal(repos[0].branch, "main");
});

test("skills are the union of the manifest and the folders, each saying which side it is on", () => {
  const skills = skillsOf(manifest, ["delivery", "backend-nestjs", "pr-lens"]);
  const byName = Object.fromEntries(skills.map((s) => [s.name, s]));
  assert.deepEqual(Object.keys(byName).sort(), ["backend-nestjs", "delivery", "mobile-app", "pr-lens"]);
  assert.deepEqual(byName.delivery, { name: "delivery", declared: true, onDisk: true, scoped: false, repos: [] });
  assert.equal(byName["backend-nestjs"].scoped, true);
  assert.deepEqual(byName["backend-nestjs"].repos, ["api-arvore"]);
  assert.equal(byName["mobile-app"].onDisk, false);
  assert.equal(byName["pr-lens"].declared, false);
});

test("mcps are the union of the manifest, the .mcp.json and the gateway, and say how each one reaches the seat", () => {
  const mcps = mcpsOf(manifest, wired, ["arvore-mysql", "sentry"]);
  const byName = Object.fromEntries(mcps.map((m) => [m.name, m]));
  assert.deepEqual(Object.keys(byName).sort(), ["arvore-mysql", "criar-postgresql", "linear", "sentry"]);
  assert.equal(byName.linear.remote, true);
  assert.equal(byName.linear.gateway, false);
  assert.equal(byName["arvore-mysql"].gateway, true);
  assert.equal(byName["arvore-mysql"].remote, false);
  assert.equal(byName["arvore-mysql"].scoped, true);
  assert.equal(byName["criar-postgresql"].wired, false);
  assert.equal(byName.sentry.declared, false);
  assert.equal(byName.sentry.wired, true);
});

test("a name that differs only in spelling is two entries, never one", () => {
  const mcps = mcpsOf({ repos: [], mcps: { "360-dialog": "*" } }, { "360dialog": { type: "http", url: "https://mcp.360dialog.com/mcp" } });
  assert.deepEqual(mcps.map((m) => [m.name, m.declared, m.wired]), [["360-dialog", true, false], ["360dialog", false, true]]);
});

test("a workspace with no hive.json still lists what is on disk", () => {
  const state = workspaceOf({ state: "none" }, onDisk);
  assert.equal(state.state, "none");
  assert.equal(state.repos.length, 3);
  assert.equal(state.repos.every((r) => !r.declared), true);
});

test("an unreadable manifest keeps the disk view and carries what went wrong", () => {
  const state = workspaceOf({ state: "unreadable", said: "boom" }, onDisk);
  assert.equal(state.state, "unreadable");
  assert.equal(state.said, "boom");
  assert.equal(state.path, "hive.json");
  assert.equal(state.repos.length, 3);
});

test("a read manifest counts what is declared, cloned, missing and unlisted on every side", () => {
  const state = workspaceOf(
    { state: "read", manifest, issues: [{ path: "/typo", message: "not a key hive.json knows" }] },
    onDisk,
    { name: "arvore-hub", mcpJson: { mcpServers: wired }, gateway: ["arvore-mysql", "sentry"], skillDirs: ["delivery", "pr-lens"] },
  );

  assert.equal(state.state, "read");
  assert.equal(state.name, "arvore-hub");
  assert.equal(state.path, "hive.json");
  assert.deepEqual(state.issues, [{ path: "/typo", message: "not a key hive.json knows" }]);
  assert.deepEqual(state.counts, {
    declared: 3,
    cloned: 3,
    missing: 1,
    undeclared: 1,
    skills: { declared: 3, onDisk: 2, onlyDeclared: 2, onlyOnDisk: 1 },
    mcps: { declared: 3, wired: 3, onlyDeclared: 1, onlyWired: 1, gateway: 2 },
  });
});

import { MANAGED_BEGIN, MANAGED_END, manifestWithRepo, repoEntryOf, repoPlanOf, withRepoLine } from "../lib/hub-workspace.mjs";

const manifestText = `{
  "$schema": "./schemas/hive.v1.json",
  "repos": [
    "org/alpha",
    "org/gamma"
  ],
  "skills": { "delivery": ["alpha", "gamma"] }
}
`;

test("a repository can be typed as org/name or pasted as a GitHub url, and anything else is refused", () => {
  assert.deepEqual(repoEntryOf(" org/edital-review "), { entry: "org/edital-review", org: "org", name: "edital-review" });
  assert.equal(repoEntryOf("https://github.com/org/edital-review.git").entry, "org/edital-review");
  assert.equal(repoEntryOf("git@github.com:org/edital-review.git").entry, "org/edital-review");
  assert.match(repoEntryOf("").error, /org\/name/);
  assert.match(repoEntryOf("edital-review").error, /org\/name/);
  assert.match(repoEntryOf("org/a/b").error, /org\/name/);
  assert.match(repoEntryOf("org/../etc").error, /org\/name/);
  assert.match(repoEntryOf("org/-etc").error, /cannot be right/);
});

test("a repository lands in hive.json in order, one per line, without touching the rest of the file", () => {
  const middle = manifestWithRepo(manifestText, "org/beta");
  assert.equal(middle.line, 5);
  assert.match(middle.text, /"org\/alpha",\n    "org\/beta",\n    "org\/gamma"\n  \]/);
  assert.match(middle.text, /"skills": \{ "delivery": \["alpha", "gamma"\] \}/);
  const last = manifestWithRepo(manifestText, "org/zeta");
  assert.match(last.text, /"org\/gamma",\n    "org\/zeta"\n  \]/);
  assert.doesNotThrow(() => JSON.parse(last.text));
  const empty = manifestWithRepo('{\n  "repos": []\n}\n', "org/one");
  assert.deepEqual(JSON.parse(empty.text).repos, ["org/one"]);
});

test("a repository that is already declared, under any org, is not written twice", () => {
  const twice = manifestWithRepo(manifestText, "other/alpha");
  assert.equal(twice.present, true);
  assert.match(twice.error, /alpha is already in hive.json/);
  assert.match(manifestWithRepo('{ "name": "x" }', "org/a").error, /no "repos" list/);
});

const claude = `# hub

## Repositories

- **./dev-workspaces**
${MANAGED_BEGIN}
- **./alpha** — nestjs (skills: backend-nestjs)
- **./gamma**
${MANAGED_END}

## Rest
`;

test("the line goes at the end of the hive block and the rest of the file stays as the person wrote it", () => {
  const added = withRepoLine(claude, "beta", "", "");
  assert.equal(added.state, "added");
  assert.match(added.text, /- \*\*\.\/gamma\*\*\n- \*\*\.\/beta\*\*\n<!-- <<< hive -->/);
  assert.match(added.text, /- \*\*\.\/dev-workspaces\*\*\n<!-- >>> hive -->/);
  assert.match(added.text, /## Rest\n$/);
});

test("a bare line inside the block gains its stack once known, and a line the person annotated is left alone", () => {
  assert.equal(withRepoLine(claude, "gamma", "react").state, "updated");
  assert.match(withRepoLine(claude, "gamma", "react").text, /- \*\*\.\/gamma\*\* — react/);
  assert.equal(withRepoLine(claude, "alpha", "react").state, "present");
  assert.equal(withRepoLine(claude, "dev-workspaces", "node").state, "present");
  assert.equal(withRepoLine(claude, "gamma", "unknown").state, "present");
});

test("without the block the hive does not guess: it says so, and only writes where the person chose", () => {
  const plain = "# hub\n\n## Repositories\n\n- **./alpha**\n\n## Rest\n";
  assert.equal(withRepoLine(plain, "beta").state, "no-block");
  const top = withRepoLine(plain, "beta", "", "top");
  assert.equal(top.state, "added");
  assert.match(top.text, /## Repositories\n\n<!-- >>> hive -->\n- \*\*\.\/beta\*\*\n<!-- <<< hive -->\n\n- \*\*\.\/alpha\*\*/);
  const end = withRepoLine(plain, "beta", "", "end");
  assert.match(end.text, /## Rest\n\n<!-- >>> hive -->\n- \*\*\.\/beta\*\*\n<!-- <<< hive -->\n$/);
});

test("the plan says what changes in each file, and only writes what changes", () => {
  const plan = repoPlanOf({ entry: "org/beta", manifestText, files: { "CLAUDE.md": claude, "AGENTS.md": null }, cloned: false });
  assert.deepEqual(plan.files.map((f) => [f.file, f.verdict]), [["hive.json", "changes"], ["CLAUDE.md", "changes"], ["AGENTS.md", "missing"], ["beta/", "new"]]);
  assert.match(plan.files[0].excerpt, /\+     "org\/beta",/);
  assert.match(plan.files[1].excerpt, /\+ - \*\*\.\/beta\*\*/);
  assert.deepEqual(Object.keys(plan.writes), ["hive.json", "CLAUDE.md"]);
  assert.equal(plan.clone, true);
  assert.equal(plan.asks, false);
});

test("a repository already declared but never cloned only clones, and one cloned by hand only gains its lines", () => {
  const onlyClone = repoPlanOf({ entry: "org/gamma", manifestText, files: { "CLAUDE.md": claude, "AGENTS.md": claude }, cloned: false });
  assert.deepEqual(onlyClone.files.map((f) => f.verdict), ["same", "same", "same", "new"]);
  assert.deepEqual(onlyClone.writes, {});
  const onlyLines = repoPlanOf({ entry: "org/beta", manifestText, files: { "CLAUDE.md": claude, "AGENTS.md": claude }, cloned: true });
  assert.equal(onlyLines.clone, false);
  assert.equal(onlyLines.files.at(-1).say, "already cloned");
  assert.match(repoPlanOf({ entry: "org/alpha", manifestText, files: {}, cloned: true }).error, /already in hive.json and cloned in \.\/alpha/);
});

test("a file without the block asks where it goes, and the person's answer settles it", () => {
  const plain = "## Repositories\n\n- **./alpha**\n";
  const asking = repoPlanOf({ entry: "org/beta", manifestText, files: { "CLAUDE.md": plain, "AGENTS.md": claude }, cloned: false });
  assert.equal(asking.asks, true);
  assert.equal(asking.files[1].verdict, "no-block");
  assert.equal("CLAUDE.md" in asking.writes, false);
  const settled = repoPlanOf({ entry: "org/beta", manifestText, files: { "CLAUDE.md": plain, "AGENTS.md": claude }, cloned: false, choices: { "CLAUDE.md": "top" } });
  assert.equal(settled.asks, false);
  assert.match(settled.files[1].say, /new hive block/);
  assert.match(settled.writes["CLAUDE.md"], /<!-- >>> hive -->\n- \*\*\.\/beta\*\*/);
  const skipped = repoPlanOf({ entry: "org/beta", manifestText, files: { "CLAUDE.md": plain, "AGENTS.md": claude }, cloned: false, choices: { "CLAUDE.md": "skip" } });
  assert.equal(skipped.asks, false);
  assert.equal(skipped.files[1].say, "left without the block");
});

import { envKeysOf, manifestWithScope, mcpEntryOf, mcpJsonWith, mcpPlanOf, scopeOfTyped, skillEntryOf, skillFileOf, skillPlanOf, withSkillIndexLine } from "../lib/hub-workspace.mjs";

const scopedManifest = `{
  "repos": [
    "org/alpha",
    "org/gamma"
  ],
  "skills": {
    "delivery": "*",
    "backend": ["alpha", "gamma"]
  },
  "mcps": {
    "linear": "*"
  }
}
`;

test("a scope is every repository when empty, and only declared repositories when named", () => {
  assert.deepEqual(scopeOfTyped("", ["alpha"]), { scope: "*", repos: [] });
  assert.deepEqual(scopeOfTyped("alpha, gamma alpha", ["alpha", "gamma"]), { scope: ["alpha", "gamma"], repos: ["alpha", "gamma"] });
  assert.match(scopeOfTyped("alpha, zeta", ["alpha"]).error, /zeta is not in hive.json/);
});

test("a scope lands at the end of its map in hive.json, keeping the file as it was written", () => {
  const added = manifestWithScope(scopedManifest, "mcps", "sentry", ["alpha", "gamma"]);
  assert.match(added.text, /"linear": "\*",\n    "sentry": \["alpha", "gamma"\]\n  \}/);
  assert.doesNotThrow(() => JSON.parse(added.text));
  assert.equal(manifestWithScope(scopedManifest, "skills", "delivery", "*").present, true);
  const noMap = manifestWithScope('{\n  "repos": ["org/alpha"]\n}\n', "mcps", "sentry", "*");
  assert.deepEqual(JSON.parse(noMap.text).mcps, { sentry: "*" });
});

test("an mcp is remote with a url or stdio with a command, and the stdio one goes through the gateway", () => {
  const remote = mcpEntryOf({ name: "linear", url: "https://mcp.linear.app/mcp" }, { declared: ["alpha"] });
  assert.deepEqual(remote.wired, { type: "http", url: "https://mcp.linear.app/mcp" });
  assert.equal(remote.hosted, null);
  const stdio = mcpEntryOf({ name: "sentry", kind: "stdio", command: "npx -y @sentry/mcp-server@latest --host=sentry.io", env: "SENTRY_ACCESS_TOKEN", scope: "alpha" }, { declared: ["alpha"], gatewayPort: 4671 });
  assert.deepEqual(stdio.hosted, { command: "npx", args: ["-y", "@sentry/mcp-server@latest", "--host=sentry.io"], env: { SENTRY_ACCESS_TOKEN: "${SENTRY_ACCESS_TOKEN}" } });
  assert.equal(stdio.wired.url, "http://127.0.0.1:4671/mcp/hub", "a command is reached through the one hub entry, never an entry of its own");
  assert.equal(stdio.wired.headers.Authorization, "Bearer ${HIVE_MCP_GATEWAY_TOKEN}");
  assert.deepEqual(stdio.scope, ["alpha"]);
  assert.match(mcpEntryOf({ name: "Bad Name" }).error, /lower-case/);
  assert.match(mcpEntryOf({ name: "x", url: "ftp://nope" }).error, /http\(s\) url/);
  assert.match(mcpEntryOf({ name: "x", kind: "stdio", command: "" }).error, /command/);
  assert.match(mcpEntryOf({ name: "x", url: "https://a", env: "lower" }).error, /UPPER_CASE/);
});

test("the .env is read for names only, and an empty value counts as missing", () => {
  const keys = envKeysOf("A=1\nexport B='x'\nC=\n# D=2\nE=\"\"\n");
  assert.deepEqual([...keys], ["A", "B"]);
});

test("the mcp plan writes hive.json, .mcp.json and servers.json, and says which variable the .env lacks", () => {
  const entry = mcpEntryOf({ name: "sentry", kind: "stdio", command: "node .mcp-servers/node_modules/.bin/sentry-mcp", env: "SENTRY_ACCESS_TOKEN", scope: "alpha" }, { declared: ["alpha", "gamma"] });
  const plan = mcpPlanOf({ entry, manifestText: scopedManifest, mcpJsonText: '{\n  "mcpServers": {\n    "linear": { "type": "http", "url": "https://mcp.linear.app/mcp" }\n  }\n}\n', serversText: '{ "servers": {} }', envText: "OTHER=1\n" });
  assert.deepEqual(plan.files.map((f) => [f.file, f.verdict]), [["hive.json", "changes"], [".mcp.json", "changes"], [".mcp-servers/servers.json", "changes"], [".env", "missing"]]);
  assert.deepEqual(plan.missing, ["SENTRY_ACCESS_TOKEN"]);
  assert.deepEqual(JSON.parse(plan.writes[".mcp.json"]).mcpServers.hub.url, "http://127.0.0.1:4671/mcp/hub");
  assert.deepEqual(JSON.parse(plan.writes[".mcp-servers/servers.json"]).servers.sentry.env, { SENTRY_ACCESS_TOKEN: "${SENTRY_ACCESS_TOKEN}" });
  assert.match(plan.writes["hive.json"], /"sentry": \["alpha"\]/);
  const remote = mcpPlanOf({ entry: mcpEntryOf({ name: "notion", url: "https://mcp.notion.com/mcp" }), manifestText: scopedManifest, mcpJsonText: null, serversText: null, envText: "" });
  assert.deepEqual(remote.files.map((f) => f.file), ["hive.json", ".mcp.json", ".env"]);
  assert.equal(remote.files[2].verdict, "same");
  assert.match(mcpPlanOf({ entry: mcpEntryOf({ name: "linear", url: "https://x" }), manifestText: scopedManifest, mcpJsonText: '{"mcpServers":{"linear":{}}}', serversText: null, envText: "" }).error, /already in hive.json and in .mcp.json/);
});

test("a skill is a name, one line saying when it applies, and where it is worth", () => {
  const entry = skillEntryOf({ name: "copy-check-mobile", description: "Copy de UI no app.  Use quando…", scope: "alpha" }, { declared: ["alpha"] });
  assert.equal(entry.description, "Copy de UI no app. Use quando…");
  assert.match(skillFileOf(entry), /^---\nname: copy-check-mobile\ndescription: Copy de UI no app\. Use quando…\n---\n/);
  assert.match(skillEntryOf({ name: "Copy Check" }).error, /lower-case/);
  assert.match(skillEntryOf({ name: "x", description: "  " }).error, /one line/);
});

test("the skills index line goes into its own block of AGENTS.md, and without the block the hive asks", () => {
  const entry = skillEntryOf({ name: "copy-check-mobile", description: "Copy no app.", scope: "alpha" }, { declared: ["alpha"] });
  const agents = "# hub\n\n## Repositories\n\n<!-- >>> hive -->\n- **./alpha**\n<!-- <<< hive -->\n\n## Skills\n\n<!-- >>> hive:skills -->\n- **delivery** — Delivery. · vale em: todos os repositórios · `.claude/skills/delivery/SKILL.md`\n<!-- <<< hive:skills -->\n\n## Rest\n";
  const added = withSkillIndexLine(agents, entry);
  assert.equal(added.state, "added");
  assert.match(added.text, /delivery\/SKILL\.md`\n- \*\*copy-check-mobile\*\* — Copy no app\. · vale em: alpha · `\.claude\/skills\/copy-check-mobile\/SKILL\.md`\n<!-- <<< hive:skills -->/);
  assert.equal(withSkillIndexLine(agents, { ...entry, name: "delivery" }).state, "present");
  const plain = "# hub\n\n<!-- >>> hive -->\n- **./alpha**\n<!-- <<< hive -->\n\n## Rest\n";
  assert.equal(withSkillIndexLine(plain, entry).state, "no-block");
  const top = withSkillIndexLine(plain, entry, "top");
  assert.match(top.text, /<!-- <<< hive -->\n\n## Skills\n\n[^\n]+\n\n<!-- >>> hive:skills -->\n- \*\*copy-check-mobile\*\*[^\n]+\n<!-- <<< hive:skills -->\n\n## Rest/);
  const end = withSkillIndexLine(plain, entry, "end");
  assert.match(end.text, /## Rest\n\n## Skills\n[\s\S]+<!-- <<< hive:skills -->\n$/);
});

test("the skill plan writes the scope, the SKILL.md and the index line, and only holds for the block", () => {
  const entry = skillEntryOf({ name: "copy-check-mobile", description: "Copy no app.", scope: "" }, { declared: ["alpha"] });
  const plain = "# hub\n\n## Rest\n";
  const held = skillPlanOf({ entry, manifestText: scopedManifest, agentsText: plain, exists: false });
  assert.equal(held.asks, true);
  assert.deepEqual(held.files.map((f) => [f.file, f.verdict]), [["hive.json", "changes"], [".claude/skills/copy-check-mobile/SKILL.md", "new"], ["AGENTS.md", "no-block"]]);
  const settled = skillPlanOf({ entry, manifestText: scopedManifest, agentsText: plain, exists: false, choices: { "AGENTS.md": "end" } });
  assert.equal(settled.asks, false);
  assert.deepEqual(Object.keys(settled.writes), ["hive.json", ".claude/skills/copy-check-mobile/SKILL.md", "AGENTS.md"]);
  assert.match(settled.writes["hive.json"], /"copy-check-mobile": "\*"/);
  assert.match(skillPlanOf({ entry: { ...entry, name: "delivery" }, manifestText: scopedManifest, agentsText: plain, exists: true }).error, /already in hive.json and has its folder/);
  const folderOnly = skillPlanOf({ entry: { ...entry, name: "delivery" }, manifestText: scopedManifest, agentsText: plain, exists: false, choices: { "AGENTS.md": "skip" } });
  assert.deepEqual(folderOnly.files.map((f) => f.verdict), ["same", "new", "no-block"]);
  assert.equal(folderOnly.asks, false);
});

test("a scope map whose last entry is a multi-line {repo, path} target still gets the line at the end of the map", () => {
  const text = `{
  "repos": ["org/alpha"],
  "skills": {
    "delivery": "*",
    "writing": [
      {
        "repo": "alpha",
        "path": "src/app/writing/**"
      }
    ]
  },
  "mcps": {}
}
`;
  const added = manifestWithScope(text, "skills", "copy-check-mobile", ["alpha"]);
  assert.deepEqual(JSON.parse(added.text).skills["copy-check-mobile"], ["alpha"]);
  assert.match(added.text, /\}\n    \],\n    "copy-check-mobile": \["alpha"\]\n  \},\n  "mcps"/);
  const empty = manifestWithScope(text, "mcps", "sentry", "*");
  assert.deepEqual(JSON.parse(empty.text).mcps, { sentry: "*" });
});

test("the one hub entry wires hosted MCPs without becoming a phantom MCP", () => {
  const rows = mcpsOf({ mcps: { first: "*", second: "alpha", absent: "*" } }, { hub: { type: "http", url: "http://127.0.0.1:4671/mcp/hub" }, remote: { url: "https://remote.test/mcp" } }, ["first", "second"]);
  assert.deepEqual(rows.map((r) => [r.name, r.wired, r.gateway]), [["absent", false, false], ["first", true, true], ["remote", true, false], ["second", true, true]]);
});

test("adding a second command reuses hub wiring and rejects a colliding remote", () => {
  const entry = mcpEntryOf({ name: "fresh", kind: "stdio", command: "node fresh.mjs" });
  const inputs = { entry, manifestText: scopedManifest, mcpJsonText: JSON.stringify({ mcpServers: { hub: entry.wired } }), serversText: '{"servers":{}}', envText: "" };
  const plan = mcpPlanOf(inputs);
  assert.equal(plan.writes[".mcp.json"], undefined);
  assert.equal(JSON.parse(plan.writes[".mcp-servers/servers.json"]).servers.fresh.command, "node");
  assert.equal(plan.files.find((f) => f.file === ".mcp.json").verdict, "same");
  assert.match(mcpPlanOf({ ...inputs, mcpJsonText: '{"mcpServers":{"hub":{"url":"https://remote.test"}}}' }).error, /reserved/);
  assert.match(mcpEntryOf({ name: "hub", url: "https://remote.test" }).error, /reserved/);
});

test("a line plan writes only the hive.json entry of a map, and refuses a name already in it", () => {
  const manifestText = JSON.stringify({ repos: ["o/alpha"], mcps: { linear: "*" } }, null, 2);
  const plan = linePlanOf({ root: "mcps", name: "sentry", scope: "*", manifestText });
  assert.deepEqual(Object.keys(plan.writes), ["hive.json"]);
  assert.deepEqual(plan.files.map((f) => [f.file, f.verdict, f.say]), [["hive.json", "changes", "+1 line"]]);
  assert.deepEqual(JSON.parse(plan.writes["hive.json"]).mcps, { linear: "*", sentry: "*" });
  assert.match(plan.files[0].excerpt, /"sentry": "\*"/);
  assert.match(linePlanOf({ root: "mcps", name: "linear", scope: "*", manifestText }).error, /already in hive.json/);
  assert.match(linePlanOf({ root: "mcps", name: "x", scope: "*", manifestText: "{" }).error, /not valid JSON/);
});

test("the description of a skill comes from its front matter, then from the first paragraph, and is empty when there is neither", () => {
  assert.equal(skillDescriptionOf("---\nname: brah\ndescription: \"Abre a página do brah.\"\n---\n\n# brah\n"), "Abre a página do brah.");
  assert.equal(skillDescriptionOf("# thermos\n\n<!-- nota -->\nGuarda o café quente.\n\nMais texto.\n"), "Guarda o café quente.");
  assert.equal(skillDescriptionOf("---\nname: x\n---\n"), "");
  assert.equal(skillDescriptionOf(null), "");
});
