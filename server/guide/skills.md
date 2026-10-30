# Skills

How skills reach chats: where they live, how the Hive indexes them, how each provider sees them, and adding or debugging one.

## What the Hive does with skills

A skill is a folder with a `SKILL.md` that tells an agent how to do one kind of task. Claude loads skills on its own; the Hive does not read, copy or inject them.

What the Hive does:

- It opens each local chat in the hub, so the hub's `.claude/skills/` is in the chat's folder.
- It starts Claude chats with every Claude setting source on (user, project, local), except in anonymous chats.
- It links your user skills into every extra Claude account.
- Its workspace panel creates skills, records where they apply in `hive.json`, and writes an index of them into `AGENTS.md` for providers that do not load skills natively.
- It keeps no copy of any skill under `~/.hive`.

## Where skills live

- Hub skills: `<hub>/.claude/skills/<name>/SKILL.md`. Commit them with the hub to share them with the team.
- User skills: `~/.claude/skills/<name>/SKILL.md`. Claude loads them in every chat on this machine.
- Plugin skills: come with Claude plugins under `~/.claude/plugins`. Their names have a colon, `plugin:skill`.
- Repository skills: a repository's own `.claude/skills/`. A chat whose folder is that repository (a cloud chat on it) loads them as project skills.
- On the server, `HOME` is `/workspace/home`, so user skills there live in `/workspace/home/.claude/skills/`.

The workspace panel counts a folder (or a symbolic link to one) in `<hub>/.claude/skills/` as a skill only if it holds a file named exactly `SKILL.md`.

## Which chats see which skills

- Local chat: opens in the hub. A Claude chat sees the hub's skills, your user skills and your plugin skills.
- Cloud chat with a repository: opens in a worktree at `/workspace/worktrees/<repo>/<seat>`. The hub's `.claude/skills/` is not in that folder or above it, so the chat does not get the hub's skills. It gets the repository's own skills and the server's user skills.
- Cloud chat on the hub's own repository (no repository typed, local hub is a git repository): a worktree of the hub made from `origin/main`. It sees only skills that are committed and pushed.
- Anonymous chat: "No hub rules, skills or memories". Claude starts with no setting sources.
- Extra Claude account: sees `~/.claude/skills` through a link (see "Extra accounts share your skills").

## How each provider sees skills

- Claude: loads skills natively, in the native chat and in the TUI. In a native chat, skills also appear in the `/` menu.
- Codex, Kimi, Kiro, Cursor, Gemini, OpenCode and Antigravity: the Hive passes them no skill list. The workspace panel writes the skills index into `AGENTS.md`; its note says this is "how Codex, Kimi and Kiro see it". The agent reads the index and opens the `SKILL.md` it needs.
- Whether a provider reads `AGENTS.md` at all is that provider's own behavior. A provider that does not read it does not see the index.

## Declare a skill in hive.json

`<hub>/hive.json` maps each skill name to the repositories it applies to:

```json
{
  "repos": ["your-org/api", "your-org/web"],
  "skills": {
    "release": "*",
    "web-forms": ["web"],
    "migrations": { "repo": "api", "path": "db/**" }
  }
}
```

- `"*"`: every repository. A name or a list: only those repositories, which must be in `repos`. `{ "repo", "path" }`: a glob inside one repository.
- The scope is a declaration. The workspace panel shows it (chips drawn dashed apply only in some repositories) and writes it into the index line. The Hive does not hide a skill from a chat because of it.
- See the "hub" topic for the rest of `hive.json`.

## The skills index in AGENTS.md

The panel keeps one line per skill in `<hub>/AGENTS.md`, between these markers:

```
<!-- >>> hive:skills -->
- **release** — Use when cutting a release. · vale em: todos os repositórios · `.claude/skills/release/SKILL.md`
- **web-forms** — Use when building a form. · vale em: web · `.claude/skills/web-forms/SKILL.md`
<!-- <<< hive:skills -->
```

- The line is `- **<name>** — <description> · vale em: <repositories> · \`.claude/skills/<name>/SKILL.md\``. The Hive writes `vale em` and `todos os repositórios` (every repository) exactly like this.
- If `AGENTS.md` has no skills block, the panel asks where it goes: "at the top" (right after the hive repositories block, or at the start of the file), "at the end", or "leave it without the block". A new block comes with a `## Skills` heading and one line that explains it.
- The panel writes the skills index only into `AGENTS.md`, never into `CLAUDE.md`.
- The Hive adds a line only when the name is missing. It never rewrites an existing line.

## Add a skill from the workspace panel

1. Make sure `<hub>/hive.json` exists with a `repos` list (see the "hub" topic).
2. Open the workspace panel: "⋯" menu, then "workspace", or "workspace" in the command palette.
3. On the "skills" card, click "+ add".
4. Fill in "name" (lowercase letters, digits and dashes), "when it applies, in one line" (start with "Use when…"), and "applies to (empty: every repository)" (repository names, separated by commas).
5. Click "see what changes". The plan lists `hive.json` (+1 line), `.claude/skills/<name>/SKILL.md` ("a SKILL.md to write") and `AGENTS.md` (+1 line in the skills block).
6. If `AGENTS.md` has no skills block, choose where it goes.
7. Click "write". The panel answers "{name} created: write {file}".
8. Write the body of the new `SKILL.md`. It starts with the frontmatter (`name`, `description`), a title and two empty sections.
9. Commit and push the three files if the team or cloud chats should get the skill. The Hive commits nothing.

## Add a skill by hand

1. Create `<hub>/.claude/skills/<name>/SKILL.md`:

   ```markdown
   ---
   name: <name>
   description: Use when <the situation>, in one line.
   ---

   # <name>

   What to do, step by step.
   ```

2. Open the workspace panel. It shows "{n} folder(s) in .claude/skills, but not in hive.json: {names}".
3. Click "write it into hive.json". The panel adds the name to `hive.json` with scope `"*"` and adds the index line to `AGENTS.md`. It takes the description from the `description:` line of `SKILL.md`, else from the first plain line of its body, else it writes a placeholder to replace.
4. To narrow the scope, edit the entry in `hive.json` and the index line by hand.

The panel cannot write a folder whose name has characters other than lowercase letters, digits and dashes; it reports "could not adjust" for it.

The opposite row, "{name} is in hive.json, but .claude/skills/{name}/SKILL.md does not exist", has "create the SKILL.md", which writes the starter file.

## Update or remove a skill

- Edit `SKILL.md` in place. A new chat reads the new version.
- A changed description does not reach the `AGENTS.md` index by itself: edit that line by hand.
- A changed scope: edit `hive.json` and the `vale em:` part of the index line by hand.
- To remove a skill: delete the folder, its entry in `hive.json` and its line in `AGENTS.md`. The panel has no remove button.
- Then commit and push, if the hub is shared.

## Extra accounts share your skills

Each extra Claude account lives in `~/.hive/accounts/<name>/`. When the account is made, and again each time a local chat opens on it, the Hive links these items from `~/.claude/` into it: `CLAUDE.md`, `settings.json`, `plugins`, `projects`, `commands`, `agents` and `skills`.

- A link is made only when `~/.claude/<item>` exists and the account has nothing by that name yet.
- If `~/.hive/accounts/<name>/skills` is a real folder and not a link, that account sees its own folder instead of `~/.claude/skills`.
- Other providers keep accounts in `~/.hive/providers/<provider>/accounts/<name>/`. Their whole home folder is linked in the same way, except the login files.
- A cloud chat uses the server's own login, not these accounts.

## The server's hub context

The Hive keeps no skill copy in its state folder. On a server hosted on a cluster, the doctor checks a "canonical hub context on the server": a git checkout at `/workspace/hive/context`, stamped by `/workspace/hive/context-version.json`.

- That checkout comes from the hub, not from the Hive. The doctor's fix, "sync the canonical hub context", runs `git -C <server hub> pull --ff-only && node <server hub>/scripts/hive/context.mjs`. A hub without that script has nothing to sync.
- "hub contract in the seats" compares the server hub's `CLAUDE.md` with that checkout.
- On a server that is not on a cluster, both checks are skipped.

## Debug: a chat does not see a skill

1. Find where the chat runs. If it is anonymous, it has no skills by design. If it is a cloud chat on a repository, it does not get the hub's skills.
2. Check the file: `ls <hub>/.claude/skills/<name>/SKILL.md`. The name must be exactly `SKILL.md`, with `name` and `description` in the frontmatter.
3. Open the workspace panel. The skill should be a chip on the "skills" card, with no row about it under "needs attention".
4. For a Claude native chat, click the context meter ("context window used — click for the breakdown and to compact"). When Claude reports skills, the breakdown lists each one with its tokens.
5. For a Claude native chat, type `/` in the composer. Hub and user skills are under "from this repository"; `plugin:skill` names are under "from plugins and skills".
6. For any other provider, open `<hub>/AGENTS.md` and look for the skill's line between `<!-- >>> hive:skills -->` and `<!-- <<< hive:skills -->`.
7. For an extra account, run `ls -la ~/.hive/accounts/<name>/skills`. It should be a link to `~/.claude/skills`.
8. For a cloud chat on the hub, push the skill to `origin/main`, then open a new chat. A reopened chat keeps its old worktree.
9. Open a new chat after you add a skill. A running chat may have read its skills when it started.

When Claude uses a skill in a native chat, the conversation shows the skill's text folded as a skill note.

## In the code

- `app/lib/hub-workspace.mjs`
- `app/routes/workspace.mjs`
- `app/src/app/pod.js`
- `app/manifest/schema.mjs`
- `app/lib/accounts.mjs`
- `app/lib/providers.mjs`
- `server/engine/seat-command.mjs`
- `server/engine/providers.mjs`
- `server/engine/accounts.mjs`
- `server/engine/driver.mjs`
- `server/engine/protocol.mjs`
- `server/worktree.mjs`
- `app/src/app/structured-seats.js`
- `app/src/app/context-window.js`
- `app/src/app/chat-and-panes.js`
- `app/doctor/doctor-readings.mjs`
- `app/doctor/doctor-runner.mjs`
- `infra/docker/workspace-boot.sh`
