# Your hub

The **hub** is the folder your chats open in. It holds the repositories you work
on, side by side, and a few files that tell every chat how your team works.

The first run asks for it. Point it at the folder that already holds your
repositories, or type a new path and click **create it**: the hive makes the
folder with a starter `AGENTS.md`, a `CLAUDE.md` that points at it, and a
`.gitignore`.

## What goes in it

```
~/work/
├── AGENTS.md          what every chat reads first
├── CLAUDE.md          @AGENTS.md, so Claude Code reads the same file
├── .mcp.json          optional: the tools every chat gets
├── .env               optional: the secrets those tools read
├── .gitignore
├── api/               a repository
├── web/               another repository
└── hive-acme/         optional: how your team hosts the hive
```

Only the folder is required. Everything else makes the chats better.

### The repositories

Clone each repository at the top of the hub, one folder each. When you open a
chat, you pick one of them, and the chat works in its own git worktree of that
repository, so two chats never step on each other's files. A chat with no
repository works in the hub itself.

### `AGENTS.md` and `CLAUDE.md`

Every agent reads its instructions file before it starts. Codex, Kimi, Kiro,
Cursor and OpenCode read `AGENTS.md`; Claude Code reads `CLAUDE.md`. Keep one
file and point the other at it: a `CLAUDE.md` with the single line `@AGENTS.md`
does that, and so does a symbolic link.

Write in it what a new teammate would need on the first day:

- what each repository is, and how to install, run and test it;
- the rules your team works by: branch names, commit style, what needs a review;
- what an agent must never do on its own.

The hive also takes a folder with `AGENTS.md`, `CLAUDE.md` or `hub.yaml` at its
top as the sign that it is a hub, and says so on the first screen.

### `.mcp.json` and `.env`

`.mcp.json` lists the MCP servers that every chat gets: your issue tracker, your
database, your docs. A value written as `${NAME}` comes from the `.env` next to
it, so the file itself has no secrets and can go in git. Keep `.env` out of git.

### `.claude/settings.json`

Claude Code settings for every chat that opens in the hub, next to the ones in
your own home folder.

### `extensions/`

Extensions that turn on for everyone who uses this hub. The contract is in
[arvoreeducacao/hive-extensions](https://github.com/arvoreeducacao/hive-extensions).

### `.hiveignore`

One pattern per line, like `.gitignore`. The files it matches stay out of the
hive's file search.

### `.hive/`

The hive writes its own notes about this hub here: the status files the tiles
read, saved prompts, the archive. It is per person. Keep it out of git.

### The deployment folder

A team that hosts one server per person keeps how it does that in a folder of
the hub with a `hive.defaults` in it. See
[hosting for a team](hosting-for-a-team.md).

## Sharing a hub with a team

A team usually keeps the hub in a private git repository, with the repositories
themselves ignored or added as they are cloned. Then every person, and every
server, starts from the same `AGENTS.md`, the same tools and the same
deployment folder, and a change to how the team works is one pull request.
