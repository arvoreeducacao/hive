# The hub

The folder of repositories every chat opens in: creating it, what goes in it, how the Hive reads it, worktrees and sharing.

## What the hub is

The hub is one folder on your machine. It holds your repositories side by side, plus a few files that tell every chat how you work.

- A local chat opens with the hub as its working folder. The provider reads the instructions files it finds there (`AGENTS.md`, `CLAUDE.md`).
- The Hive keeps its own notes about the hub in `<hub>/.hive/`.
- The hub's `.env`, `.mcp.json`, `extensions/` and `hive.json` feed the Hive's tools, the MCP gateway and the workspace panel.
- Only the folder is required. Everything else makes the chats better.

The Hive stores the path as `HIVE_HUB` in `~/.hive/config`. The environment variable `HIVE_HUB` wins over the file.

## Create a hub from zero

1. Make the folder: `mkdir -p ~/work`. The Hive does not create it for you.
2. Clone each repository at the top of the folder, one folder per repository: `cd ~/work && gh repo clone your-org/api && gh repo clone your-org/web`.
3. Write `~/work/AGENTS.md` with what a new teammate needs on day one: what each repository is, how to install, run and test it, the team's rules, and what an agent must never do alone.
4. Write `~/work/CLAUDE.md` with the single line `@AGENTS.md`, so Claude reads the same file. A symbolic link also works.
5. Optional: write `~/work/hive.json` with `{"repos": ["your-org/api", "your-org/web"]}` to turn on the workspace panel's add and fix buttons.
6. Optional: add `.env` and `.mcp.json` for tools (see the "mcp" topic), and `.gitignore` lines for `.env` and `.hive/`.
7. Point the Hive at the folder: type its path in the welcome field "where your workspace lives on this machine" (see "Point the Hive at the hub").

## Point the Hive at the hub

On the first run, the welcome screen asks for it in the field "where your workspace lives on this machine".

- Type the whole path, starting at `/` or `~`. A relative path answers "use the whole path, starting at / or ~".
- The folder must exist. Otherwise the field says "that folder does not exist".
- "found it — chats open here and read the instructions it holds": the folder has `AGENTS.md`, `CLAUDE.md` or `hub.yaml`.
- "found it — chats open here, next to your repositories": the folder exists but has none of those files. It still works.
- On a cluster-hosted server, the hint is "found it, with a .env" or "found it — no .env yet, the server will need one".

If this machine is not set up yet, the welcome step "your key" has a "Create my key" button. It runs `setup.sh <name> <hub>`, which writes `HIVE_DEV`, `HIVE_HUB` and `HIVE_REPO` into `~/.hive/config` (mode 600) and makes the signing key `~/.hive/key-<name>`. On a machine that is already set up, the welcome skips that step, so typing a new path there does not move the hub.

To change the hub later:

- Edit the `HIVE_HUB=` line in `~/.hive/config`. This is the safe way when you use a server.
- Or run setup again with the new path. If `HIVE_HUB` points at a folder that does not exist, the doctor shows the exact command as "run setup again, so this machine learns where things are". On Windows, run it in Git Bash. Setup rewrites `HIVE_DEV`, `HIVE_HUB` and `HIVE_REPO`, and drops `HIVE_POD` and `HIVE_SERVER_URL` unless the deployment's own setup writes them back; check those lines afterwards.
- Then reopen the app. Many paths under the hub are read once, when the app starts.

On Windows, the Hive rewrites a path like `/c/work` as `C:/work`.

## How the Hive recognizes a hub

- A folder with `hub.yaml`, `CLAUDE.md` or `AGENTS.md` at its top counts as a hub with instructions. These files only change the welcome hint and the first guess.
- The first guess for the welcome field is `HIVE_HUB`, if that folder exists. Otherwise, when the Hive runs from a source checkout, it is the folder that holds that checkout, if that folder has one of the marker files.
- A repository is a folder at the top of the hub with a `.git` inside. Clone repositories directly there: the workspace panel and the file finder look for `<hub>/<name>/.git`.

## What goes in the hub

```
~/work/
├── AGENTS.md            instructions most providers read
├── CLAUDE.md            @AGENTS.md, so Claude reads the same file
├── hive.json            optional: the hub manifest (repos, skills, mcps)
├── .env                 optional: secrets the tools read; keep out of git
├── .mcp.json            optional: MCP servers for every chat
├── .mcp-servers/        optional: servers.json for the MCP gateway
├── .claude/settings.json  optional: Claude settings for chats in the hub
├── .claude/skills/      optional: skills (see the "skills" topic)
├── .hiveignore          optional: paths left out of the file finder
├── extensions/          optional: hub extensions (see the "extensions" topic)
├── .hive/               written by the Hive; per person; keep out of git
├── .worktrees/          optional: where local worktrees go
├── api/                 a repository
└── web/                 another repository
```

## AGENTS.md and CLAUDE.md

The Hive does not paste these files into the chat. Each provider reads its own instructions file from the folder the chat opens in. Claude reads `CLAUDE.md`. The workspace panel counts on Codex, Kimi and Kiro reading `AGENTS.md`.

The workspace panel writes into these two files only between its markers:

```
<!-- >>> hive -->
- **./api** — nestjs
- **./web** — nextjs
<!-- <<< hive -->
```

- One line per repository: `- **./<folder>** — <stack>`. The stack is detected after the clone: `elixir`, `python`, `nextjs`, `nestjs`, `react-native`, `react` or `node`. An unknown stack leaves the line bare.
- If a file has no block, the panel asks "the hive block is missing from {file}: where does it go?" with "at the top", "at the end" or "leave it without the block". "at the top" puts it under a heading that starts with `## Repositor`, if there is one.
- If `CLAUDE.md` only holds `@AGENTS.md`, pick "leave it without the block" for it.
- `AGENTS.md` can also hold a skills block (see the "skills" topic).
- Everything outside the markers stays yours. Nothing is committed.

## hive.json, the hub manifest

`<hub>/hive.json` declares which repositories make up the hub and where each skill and MCP server applies. It does not define skills or servers; it points at them.

```json
{
  "repos": ["your-org/api", "your-org/web"],
  "skills": { "release": "*", "web-forms": ["web"], "migrations": { "repo": "api", "path": "db/**" } },
  "mcps": { "sentry": "*", "postgres": ["api"] },
  "env": { "web": ".env.local" },
  "integrations": { "branch": "{task}-{slug}" }
}
```

- `repos` (required): a list of `org/name`. The folder is the part after the slash.
- `skills` and `mcps`: a name mapped to a scope. A scope is `"*"` (every repository), one repository name, a list of names, or `{ "repo": ..., "path": <glob> }`.
- `env` and `integrations` are accepted, but no part of the app acts on them today.
- `$schema` is allowed. Any other key is reported as "not a key hive.json knows".
- Other errors the panel lists under "what the hive.json says wrong": "a repository is written as org/name", `"x" is declared twice`, `points at "x", which is not in repos`, and `an empty list applies nowhere; use "*" or name the repositories`.
- The hub MCP's `mcp_list` puts first the servers whose `mcps` scope covers the repository a chat asks about (see the "mcp" topic).

## The workspace panel

Open it from the "⋯" menu ("everything else") with "workspace", or from the command palette with "workspace". Its title is "The workspace", with the hub path beside it and a "refresh" button.

- No `hive.json`: "No hive.json here — the hive is listing what it found on disk." Only the repositories show, and the add buttons are hidden.
- `hive.json` does not parse: "the hive.json did not load", with the reason.
- `hive.json` read: three cards, "repositories", "skills" and "mcp servers", each with a "+ add" button.
- A repository row can say "not cloned", "no line in hive.json", "cloning…", "queued" or "clone failed" (with "try again").
- Skill and MCP chips drawn dashed apply only in some repositories ("dashed: only in some repositories").
- The panel keeps what it read for 30 seconds. "refresh" reads the hub again at once.

## Add a repository from the workspace panel

1. Open the workspace panel and click "+ add" on "repositories".
2. Type the repository in the "org/name" field. A GitHub URL also works.
3. Click "see what changes". The plan shows each file: `hive.json` (+1 line, kept sorted), `CLAUDE.md`, `AGENTS.md`, and `<name>/` ("git clone").
4. If a file has no hive block, choose where it goes.
5. Click "write and clone" (or "write" when it is already cloned).

The clone runs `gh repo clone <org/name> <hub>/<name>` (up to 10 minutes), so `gh` must be logged in. The panel needs a `hive.json` with a `repos` list to write into; otherwise it answers "there is no hive.json in the hub to write into".

## Fix what is out of step

When `hive.json` and the disk disagree, the panel shows "needs attention" with one row per mismatch:

- "{name} is on disk, but not in hive.json" → "write it into hive.json". The Hive reads `git remote get-url origin`; the remote must be on GitHub and its name must match the folder.
- "{n} in hive.json, but not on disk: {names}" → "clone them all". It clones one at a time. "stop" empties the queue; the clone under way finishes.
- "{n} folder(s) in .claude/skills, but not in hive.json" and "{name} is in hive.json, but .claude/skills/{name}/SKILL.md does not exist" (see the "skills" topic).
- MCP rows (see the "mcp" topic).
- "adjust everything" applies every fix that needs no input. Nothing is committed.

## The .env file

`<hub>/.env` holds the secrets the hub's tools read. The Hive keeps no secret of its own for them.

- Write one `NAME=value` per line. `export NAME=value` and quoted values also work.
- `.mcp.json` names a variable as `${NAME}`. The Hive passes exactly those variables from the hub `.env` to local chats. The MCP gateway reads its variables from the same file (see the "mcp" topic).
- The workspace panel lists a variable an MCP server needs and the `.env` lacks: "set {names} in the .env of the hub; until then the gateway answers Connection closed".
- Some features read their own keys from this file; their topics name them.
- Keep `.env` out of git.

## .claude/settings.json

Claude chats load the user, project and local Claude settings; the Hive does not filter them, except in anonymous chats. A chat in the hub reads `<hub>/.claude/settings.json` and `<hub>/.claude/settings.local.json`.

The Hive reads `effortLevel` from `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`), then the hub's `settings.json`, then `settings.local.json`; the last one set wins. It shows that level for a chat where nobody picked one.

## .hiveignore

`<hub>/.hiveignore` hides paths from the file finder ("open a file — any repo, this machine or the server").

- One pattern per line. Blank lines and lines starting with `#` are skipped.
- `*` matches inside one path segment; `**` matches across segments.
- A pattern starting with `/` matches from the start of the path. Any other pattern matches from the start of any segment.
- A pattern has no end anchor: `dist` also hides `distance.txt`. Write `dist/` to hide only the folder.
- A pattern is tried against the path inside the repository and against `<repo>/<path>`.
- The same file also filters the server's file list.
- It does not change code search ("search the code of every repo") or what the chats can read.

The file finder lists the tracked and untracked (not git-ignored) files of each repository at the top of the hub and in `<hub>/.worktrees/`, up to 20,000 files per repository.

## .hive/, the Hive's notes

The Hive writes per-person state about the hub in `<hub>/.hive/`. Keep it out of git.

- `status/<seat>.md`: the status file a chat writes and its tile reads (see the "seats" topic).
- `prompts/<seat>.md`: the first message of a chat.
- `assets/`: pictures attached to chats.
- `titles.json`, `fleet.json`, `archive.json`, `archive-index.json`, `archived-seats.json`, `prs.json`, `pr-notes.json`, `threads.json`.

## extensions/

`<hub>/extensions/<name>/` holds extensions that everyone who uses this hub can turn on. They start off for each person. A personal copy with the same name in `~/.hive/extensions/` shadows the hub's copy. See the "extensions" topic.

## The deployment folder

A deployment folder is any folder with a `hive.defaults` file in it. It names how a team hosts its servers. In this build, `setup.sh` looks for it at the top of the Hive's own source checkout (`HIVE_REPO`), not in the hub; the build also ships a copy of each one inside the app. Setup records the folder name as `HIVE_DEPLOYMENT_DIR` in `~/.hive/config`. See the "team-and-cloud" topic.

## What the Hive adds to a chat

The Hive adds one short preamble to each native chat. It names the seat, says whether it runs locally or in the cloud, points at the peer tools (`peers`, `message`, `ask`, `peek`), and says to call the `guide` tool for questions about the Hive.

- Claude: appended to the system prompt.
- Codex: sent as the thread's developer instructions.
- Kimi, Kiro, Cursor, Gemini, OpenCode and Antigravity: put in front of the first message.
- A chat that opens as the TUI gets no preamble.
- An anonymous chat gets no preamble.

The hub's instructions, skills and settings reach the chat only because the provider reads them from the folder it opens in.

## Where a chat opens

- Local chat: the hub itself. The Hive does not make a worktree for it.
- Cloud chat with "repo" filled in: a worktree on the server (see "Worktrees on the server").
- Cloud chat with no repo: if the local hub is a git repository, a worktree of the hub's own repository; otherwise the server's hub folder.
- Anonymous chat (always a local Claude chat): a fresh temporary folder named `hive-anon-…`, with "No hub rules, skills or memories". Closing it erases it.

## Worktrees on this machine

The Hive does not create worktrees for local chats; a chat or a person makes them with `git worktree add`. Put them under `<hub>/.worktrees/` (for example `<hub>/.worktrees/api/fix-login`). The file finder and autopush look there, and in no other place outside the repositories at the top of the hub.

The panel "the worktrees on this machine" (command palette) lists every worktree of every repository at the top of the hub, wherever the worktree lives.

- "idle after" 1, 3, 6 or 24 hours (1 hour by default): a worktree nobody touched for that long and no seat uses is idle.
- A worktree is never swept while it has a seat in it, "{n} files nobody committed", "{n} commits nobody pushed", or a lock ("locked on purpose").
- "sweep the {n} idle ones · frees {size}" removes only the folders. "Only the folder goes — the branch and its commits stay where they are."
- "delete" removes one worktree with `git worktree remove --force`. A worktree that still holds work asks again ("delete anyway").

## Worktrees on the server

A cloud chat opened with a repository gets a worktree at `/workspace/worktrees/<repo>/<seat>`.

- The repository must already be cloned at `/workspace/repos/<repo>`. Otherwise the error is "there is no {repo} on this server — clone it into /workspace/repos first".
- The server fetches `origin`, then makes branch `<owner>/-/<seat>` from `origin/main`.
- With the "branch" field, the worktree uses that branch: an existing branch is checked out, a new name is made from `origin/main`.
- A seat that opens again with the same name reuses its worktree.
- The worktree's Claude memory folder links to the hub's (when the hub has one), so the worktrees share one memory.
- The server expects the hub's repository at `/workspace/repos/<hub folder>`. The folder name is the hub's name on your machine, or `HIVE_HUB_FOLDER`.

## Autopush

The Hive pushes branches for you, both on this machine and on the server.

- Every 120 seconds (`HIVE_AUTOPUSH_EVERY`, in seconds, on this machine), it walks each git checkout at the top of the hub and one level below, and the same under `<hub>/.worktrees/`.
- On the server it walks `/workspace/repos` and `/workspace/worktrees`.
- For each checkout on a branch other than `main`, `master` or `develop`, whose commit changed since the last pass, it runs `git push --set-upstream origin <branch>`.
- It keeps what it pushed in `~/.hive/autopush-state`.
- On macOS and Linux it runs in a tmux session named `autopush`, which keeps running after the app quits. `tmux kill-session -t autopush` stops it until the app starts again. On Windows it is a child process of the app.
- No setting turns it off. A branch named `main`, `master` or `develop` is never pushed by it.

## The hub on the server

The server container uses `HIVE_HUB` (default `/workspace/repos`). At boot it:

- writes `<hub>/.claude/settings.local.json` with `{"enableAllProjectMcpServers": true}`, if the hub is a git repository and the file is missing;
- copies `/workspace/secrets/env` to `<hub>/.env`, if the hub has no `.env` yet;
- installs `<hub>/.mcp-servers` with `npm ci` and starts the MCP gateway on port 4671, if `.mcp-servers/package-lock.json` exists.

See the "team-and-cloud" topic for hosting.

## Sharing a hub with a team

Keep the hub in a private git repository. Then every person and every server starts from the same instructions, tools and extensions.

- Commit `AGENTS.md`, `CLAUDE.md`, `hive.json`, `.mcp.json`, `.mcp-servers/servers.json`, `.claude/settings.json`, `.claude/skills/`, `.hiveignore` and `extensions/`.
- Keep `.env`, `.mcp-servers/.token`, `.hive/`, `.worktrees/` and the repository folders out of git.
- A teammate clones the hub, points the Hive at it, opens the workspace panel and clicks "clone them all".
- Hub extensions start off for each person; each one turns them on.
- A new cloud chat on the hub's repository starts from `origin/main` on the server, so push a change before you expect a new cloud chat to see it.

## In the code

- `app/lib/hub-path.mjs`
- `app/lib/env.mjs`
- `app/lib/hub-workspace.mjs`
- `app/routes/workspace.mjs`
- `app/src/app/pod.js`
- `app/manifest/schema.mjs`
- `app/manifest/scan.mjs`
- `app/routes/worktrees.mjs`
- `app/src/app/worktrees.js`
- `app/server.mjs`
- `app/src/app/avatars.js`
- `infra/scripts/setup.sh`
- `infra/docker/workspace-boot.sh`
- `server/worktree.mjs`
- `server/seats.mjs`
- `server/autopush.mjs`
- `server/engine/protocol.mjs`
- `server/gateway/hub-facade.mjs`
