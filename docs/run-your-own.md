# Run your own hive

A hive is one server. It holds the sessions, it holds the state, and clients — a
desktop app, a phone — talk to it over HTTP. Nothing listens on a client.

You do not need Kubernetes and you do not need an AWS account. Those are how one
team happens to host a server; they are not what a server is.

## Before the first command

A seat runs a coding agent with a shell and no approval prompts, by design. It
edits, installs, commits and runs whatever it decides to, on everything you mount,
and the container holds it in without being a sandbox — `SECURITY.md` says what it
does and does not hold back. Read that before you point this at anything you care
about, and before you put it on an address.

The defaults are the careful ones: the server binds loopback, and compose publishes
the port on `127.0.0.1`. Opening it is a decision you make on purpose, below.

## One command

```
cd infra/docker
docker compose up
```

That builds one image and starts one container. Inside it: node, git, tmux, the
Claude Code CLI, and the server. It answers on `http://127.0.0.1:8791`.

It prints the fingerprint of the key it generated on first boot. That key is the
server's identity: a client pins it when it pairs and refuses a different one
afterwards. If you ever see it change without you wiping the volume, stop and
find out why.

## What it keeps, and where

Everything lives on one volume, mounted at `/workspace`:

| Path | What |
|---|---|
| `/workspace/hive` | sessions, events, sockets, the server's own state and key |
| `/workspace/hive/server/sync` | the sealed logs the phone reads: one per chat, ciphertext only, plus the phones on the roster |
| `/workspace/repos` | the repositories you work in |
| `/workspace/home` | the home directory of the user inside the box |

The volume is what survives a rebuild. Delete it and you start over: new key, no
sessions, no login.

Everything under that root is worked out from it — the server's own directory,
the file of keys it trusts, the folder your repositories sit in. You set the
root; you do not set the rest. Each has an environment variable that overrides
it, and none of them is something you should need.

## Making it trust you

A server only answers to keys it knows. Hand it yours when you start it:

```
HIVE_OWNER_KEY="$(cat ~/.hive/key-$USER.pub)" docker compose up
```

It adopts that key on boot, once — a restart with the same key changes nothing.
Without it, the server comes up answering only itself, and every client is turned
away with a signature it does not recognise.

Anyone else joins through an invite from someone already inside, so this is the
one key that has to arrive from outside.

## Signing in to Claude

The server can start a session, but Claude needs your account. Once per volume:

```
docker compose exec -it hive claude
```

Sign in there. The credential lands on the volume and the server picks it up.

## More than one login

Providers and accounts (⌥A in the app) lists every agent this hive can seat — Claude, Codex,
Kimi, Kiro, Cursor, OpenCode — with its version, a switch, the login it is authenticated as, and three
tabs: the logins, the configuration and the models. A model shows in the pickers only while its
provider is on, installed and signed in; an agent that is off, missing or signed out says why
instead of a list.

A second login of any agent is signed in from that screen. Claude's logins live under
`accounts/` in the state directory, as before; every other agent's under
`providers/<agent>/accounts/`. A login is the CLI's own home mirrored with links — skills,
settings, sessions and history are the same files — except what holds the sign-in, which is the
login's own. The CLI is pointed at that folder by its own variable (`CLAUDE_CONFIG_DIR`,
`CODEX_HOME`, `KIMI_CODE_HOME`, `XDG_DATA_HOME` for Kiro and OpenCode, `XDG_CONFIG_HOME` for Cursor,
whose login mirrors `~/.config` too so `gh` and `git` keep their files), so a chat reads the same
either way. The sign-in itself is the CLI's own command, run in a window the screen reads and
types into for you.

A chat whose login runs out of room does not stop, whichever agent it is on. It writes the login
down in that agent's `spent.json` — with the hour that login said it comes back — hands the turn
to the next login with room, and says the same thing again on it. The conversation is on disk, so
the fresh login picks it up where it stopped. Once the hour passes and nobody is waiting on an
answer, the chat walks back to the login it was opened on. With no login left, the message fails
and says so.

The order tried is the chat's own login first and the rest after it. The arrows on the accounts
tab change it; underneath, it is the agent's `order.json`:

```json
["work", "default", "spare"]
```

`default` is the login you had before you added any. A machine with one login per agent behaves
exactly as it did before any of this existed.

## Reaching it from somewhere else

Put the box on a machine that has an address — an EC2 instance, a VPS, a server in
a cupboard. Two things have to change, and neither happens by accident.

**Say who may reach the port.** Compose publishes on `127.0.0.1` and nothing else
until you say otherwise. Inside the container the server binds every interface,
because there the container is the boundary; what decides who gets in is the
address compose publishes on:

```
HIVE_BIND=0.0.0.0 HIVE_SERVER_URL=https://hive.example.com docker compose up
```

Running the server straight on a machine instead of in a box (see *Without
docker*) is the other case: there the bind is the boundary, and
`HIVE_BROKER_BIND=0.0.0.0` is what opens it.

**Say where it can be found.** `HIVE_SERVER_URL` is what the server tells clients
about itself, so it has to be the address they can actually reach.

Do it only behind something that terminates TLS — the server speaks plain HTTP and
expects something else in front. Anyone who reaches that port is talking to a
machine that runs commands for a living, so treat opening it the way you would
treat opening SSH.

Pairing does not change with distance: the client asks for a code, the code lasts
five minutes, and the private half of every key never leaves the device that made
it.

## The phone

The server serves the phone page itself, at `/phone/` under the same address.
Open it on the phone, add it to the home screen, and type the code the desktop
app shows under **who gets in**. Nothing is installed, nothing is signed, and
nothing about the phone lives on the server but its public keys.

What the phone reads is a sealed log, one per chat, under `/sync/`. The machine
that runs a chat seals every line with a key it made for that chat, wraps the
key for each of your devices, and appends to the log in order; the server keeps
the order and hands out what each device has not read yet, and cannot open any
of it. The desktop app's **my phone** switch is what makes a machine's chats
travel there. Pairing a phone turns it on.

A chat asked for from the phone goes the same way in reverse: the mission is
sealed for the Mac's key and left at `/sync/births`, the Mac opens the chat as
the desktop would and answers, sealed for the phone, with the chat's name. The
server holds the two envelopes for half an hour and reads neither.

The same envelope carries every question the phone has for the Mac: a page on
the shelf, the files in a chat's directory, who is on the team. They go through
`/sync/asks`; the answer can be as big as a page and is fetched, sealed, by the
device that asked. Nothing in it is readable on the server.

Put TLS in front of the server before pairing a phone: the page needs a secure
origin to hold its keys, and a browser gives that only to `https` and to
`localhost`.

## The settings that matter

| Variable | Default | What it decides |
|---|---|---|
| `PORT` | `8791` | where the server listens |
| `HIVE_PORT` | `8791` | which port on the host maps to it, in compose |
| `HIVE_BIND` | `127.0.0.1` | which address compose publishes that port on — `0.0.0.0` opens the box to the network |
| `HIVE_BROKER_BIND` | `127.0.0.1` | which address the server itself binds; the container sets `0.0.0.0`, because there the container is the boundary |
| `HIVE_SERVER_URL` | `http://127.0.0.1:8791` | the address the server hands to clients |
| `HIVE_SERVER_NAME` | `hive` | how this server introduces itself |
| `HIVE_WORKSPACE` | `/workspace` | the root of everything it keeps |
| `HIVE_HUB` | `<workspace>/repos` | where your repositories are, inside the box |
| `HIVE_SEAT_WINDOWS` | `1` | open each session in a tmux window, so you can attach from a terminal |
| `HIVE_TMUX_SESSION` | from the workspace | which tmux session holds those windows — set it when two servers share a machine |
| `HIVE_OWNER_KEY` | none | the key the server trusts from the start — yours |
| `HIVE_SSH_PUBKEY` | none | when set, sshd starts and accepts this key; when empty, sshd never starts |

## Seats on Codex

A structured Codex seat is driven by `server/engine/codex-driver.mjs`, which keeps one
`codex app-server` process per seat and talks JSON-RPC to it over stdio. That is what the
Codex desktop app and the VS Code extension use, so the seat gets what the Claude seat gets:
text streamed as it is written, a card per shell command and file change, a question card
when the model calls `request_user_input`, stop that actually stops the turn, `/model`,
`/effort`, `/compact`, `/context` (the last turn's usage against the model's window, from
`thread/tokenUsage/updated`), and a conversation that survives a restart of the driver. The app
renders the same events either way; nothing in the app knows which engine sits behind a tile.

The driver launches Codex as `codex app-server --enable default_mode_request_user_input -c
approval_policy="never" -c sandbox_mode="danger-full-access"`, so approvals never block the
seat and the question tool is on outside plan mode. The `--enable` flag only lives in that
process; `~/.codex/config.toml` is not touched. The hive tools (`peers`, `message`, `ask`,
`peek`) reach the seat as an MCP server passed on the same command line.

What stays different from a Claude seat: no slash commands of the CLI
beyond the four above, and the question card depends on a feature Codex still marks as
experimental. If a Codex release drops it, the model asks in plain text instead. The `codex`
binary has to be on the path of whoever runs the server; the container image does not ship it
yet.

The hub's own tools reach a Codex seat the same way they reach a Claude seat: the driver
starts (or adopts) the MCP gateway on port 4671 and hands every server declared in
`.mcp-servers/servers.json` to `codex app-server` as a streamable HTTP server behind the
gateway's bearer token. TOML keys cannot carry a hyphen, so `shop-mysql` becomes
`shop_mysql` on the Codex side and its tools read `mcp__shop_mysql__…`. `/mcp` asks the
app-server for `mcpServerStatus/list`, so the card shows what actually connected and how many
tools each server brought, the injected `hive` peer included.

The remote servers of the hub's `.mcp.json` (Figma, Linear, Notion, Signoz…) ride along as
well, under the same underscore names. A login made on the Claude side does not carry over:
the token lives in the client that logged in, so on a fresh Codex seat those servers show
as *needs login* on the `/mcp` card. The card's login button runs `codex mcp login <name>`,
after writing the server to `~/.codex/config.toml` with `codex mcp add` if it was not there,
because `codex mcp login` only knows servers declared in the config file. A remote server
that needs no login (360dialog here) connects at once.

The title the rail shows for a new seat is guessed by the seat's own provider, so a Codex
user needs no Claude subscription: a Claude seat asks `claude -p --model haiku`, a Codex seat
asks `codex exec --ephemeral -m gpt-5.6-luna` with low reasoning and reads the answer from
the `-o` file. Either call takes a few seconds off the critical path; when it fails or the
CLI is not logged in, the title falls back to the mission's own first words.

## Seats on Kimi

A structured Kimi seat is driven by `server/engine/kimi-driver.mjs`, which keeps one `kimi acp`
process per seat: Kimi Code CLI speaking the Agent Client Protocol (JSON-RPC over stdio, the
same thing Zed talks to). The seat gets text and thinking streamed as they are written, a card
per tool call with its arguments and output, stop that cancels the turn (`session/cancel`), a
conversation that survives a restart of the driver (`session/load`), `/model` from the models
Kimi lists in `session/new`, `/compact` and `/context`. The client announces no `fs` and no
`terminal` capability on purpose: with those on, Kimi asks the client to run the shell for it.

The seat opens in Kimi's `yolo` mode (`session/set_mode`), so nothing waits on an approval;
should Kimi still ask, the driver answers "allow". The hive peer MCP rides along as a stdio
server, the hub's gateway servers and the remote `http` servers of `.mcp.json` as http servers
with their headers, all through `mcpServers` on `session/new`. Kimi loads every tool schema
into the model's context up front, so a seat with the hub's full set starts around 110k tokens
in on a 262k window: `/context` shows it, and trimming the list is the lever if that hurts.

What Kimi does not have over ACP: a question card (`answer` is refused), a message in the
middle of a turn (`saynow` waits for the turn to end), reasoning effort (only thinking on),
and per-server MCP status (`/mcp` lists what was configured, not what connected). Token usage
only arrives when asked: `/context` sends Kimi's own `/usage` command quietly and reads the
`usage_update` it answers with. A new seat is titled by `kimi -p` in print mode, so a person
on Kimi alone needs no Claude subscription.

## Seats on Kiro

A structured Kiro seat is driven by `server/engine/kiro-driver.mjs`, which keeps one `kiro-cli acp`
process per seat: Kiro CLI speaking the Agent Client Protocol, the same protocol the Kimi seat
uses, so the translation shares its shape (`server/engine/kiro-acp.mjs`). The seat gets text and
thinking streamed as they are written, a card per tool call with its arguments and output (Kiro
announces a call twice, once by name and once with its input; the card appears with the input),
stop that cancels the turn (`session/cancel`), a conversation that survives a restart of the
driver (`session/load`, replayed silently), `/model` from the models Kiro lists in `session/new`
(`session/set_model` to switch), `/effort` (low, medium, high, xhigh, max), `/compact`, `/context`
and `/mcp`. The last four go through Kiro's own slash commands over ACP (`_kiro.dev/commands/execute`),
which answer with data: `/context` shows Kiro's breakdown (context files, tools, prompts, responses)
and `/mcp` shows the real state of every server (running, authenticating, failed) with its tools.

The process is started with `--trust-all-tools`, so nothing waits on an approval; should Kiro
still ask, the driver answers "allow". The hive peer MCP rides along as a stdio server, the hub's
gateway servers and the remote `http` servers of `.mcp.json` as http servers with their headers,
all through `mcpServers` on `session/new` (Kiro 2.x; the 1.x line took no http MCP). One server is left
out on purpose: a tool schema with `oneOf`/`allOf`/`anyOf` at the top level makes the model refuse the
whole tool list through Kiro (Bedrock rejects it), and the hub's `360dialog` carries one. The list is
`HIVE_KIRO_MCP_SKIP` (comma separated, default `360dialog`); the seat says what it left out when it opens,
and a turn that dies on this names the tool and the variable. Kiro needs
its own login (`kiro-cli login`, IAM Identity Center or Builder ID): the seat works with that
login alone, and a new seat is titled by the same `kiro-cli acp` on `claude-haiku-4.5`
(`server/engine/kiro-namer.mjs`), so a person on Kiro alone needs no Claude subscription.
Kiro's headless mode (`kiro-cli chat --no-interactive`) is not used: it requires an API key.

What Kiro does not have over ACP: a question card (`answer` is refused) and a message in the
middle of a turn (`saynow` waits for the turn to end). An MCP server that needs a login shows
`needs-auth` in `/mcp` and the login URL arrives as a warning in the chat; the card's login
button has no Kiro command behind it yet. Kiro updates itself; the driver targets 2.21 and up.

## Seats on Cursor

A structured Cursor seat is driven by `server/engine/cursor-driver.mjs`, which keeps one
`cursor-agent acp` process per seat: Cursor CLI speaking the Agent Client Protocol, the same protocol
the Kimi and Kiro seats use, so the translation is Kimi's (`server/engine/cursor-acp.mjs` only adds what
is Cursor's). The seat gets text and thinking streamed as they are written, a card per tool call with its
arguments and output, stop that cancels the turn (`session/cancel`), a conversation that survives a
restart of the driver (`session/load`, replayed silently), `/model` from the models Cursor lists in the
session's config options (`session/set_config_option` to switch), `/context` from the `usage_update`
Cursor sends on its own, and `/compact` whenever Cursor lists a `compact` command for the session —
when it does not, the seat says so instead of pretending.

Right after `initialize` the driver calls `authenticate` with Cursor's own login (`cursor_login`): a
login that is not signed in fails the seat with one sentence pointing at `agent login`. Cursor's modes
over ACP are agent, plan and ask — none is a permission mode — so the driver sets none and answers
"allow" should Cursor ask. The hive peer MCP rides along as a stdio server, the hub's gateway servers
and the remote `http` servers of `.mcp.json` as http servers with their headers, all through
`mcpServers` on `session/new`.

What Cursor does not have over ACP: a question card (`answer` is refused), a message in the middle of a
turn (`saynow` waits for the turn to end), reasoning effort, and per-server MCP status (`/mcp` lists what
was configured). MCP login from the card has no command behind it: `agent mcp login` only knows servers
in Cursor's own `mcp.json`. A new seat is titled by `cursor-agent -p` in ask mode. A terminal seat runs
`cursor-agent --force --trust`, and comes back with `--continue`. The plan limits of a Cursor login are
not on the footer yet: the CLI asks its own backend for them and the hive does not read that yet.

## One autocompact ceiling for every provider

The `autocompact` line of the hive config (`auto`, or `100k` to `1000k`) reaches every structured seat, not
only Claude. Each provider honours it its own way: Claude through `--autocompact`; Codex natively, as
`model_auto_compact_token_limit` on its app-server (Codex caps it at 90% of the model's window and compacts
by itself, the seat shows the boundary); Kimi and Kiro by the driver, which asks the provider for the
context size when a turn ends (`/usage` on Kimi, `/context` on Kiro) and, past the ceiling, runs the
provider's own compaction before the next message goes in. Both mark it in the chat as a compaction
with `trigger: auto`. Cursor by the driver too, off the `usage_update` it sends every turn, and only when
Cursor lists a `compact` command; otherwise the ceiling is noted once and left alone. A ceiling the seat cannot get under even after compacting (the tool schemas of a
big MCP list alone can weigh more than 100k) is reported once and automatic compaction stays off for that
seat until it reopens: raise the ceiling or trim the MCP list.

## The same hive, whatever the provider

Everything the hive does around a seat works the same on Claude, Codex, Kimi, Kiro, Cursor and OpenCode,
with these rules:

- **Restore.** After a restart every seat comes back through the driver of the agent it runs on, resuming
  the session that agent named (`sessions/<name>.json` keeps it; the fleet learns it from the driver's first
  init event) and carrying the autocompact ceiling. A terminal on Codex, Kimi, Kiro, Cursor or OpenCode never tells
  the hive which session it opened, so it comes back on that CLI's own "continue the last conversation of
  this folder" (`codex resume --last`, `kimi -c`, `kiro-cli chat --resume`, `cursor-agent --continue`, `opencode -c`). On the box the
  same rule holds; only a Claude seat still needs its transcript under `~/.claude/projects`.
- **History.** The archives list the seats of every agent: a Claude session comes off its transcript, the
  others off the record their driver keeps and their events file. Each row says its agent; revive reopens
  it on that agent, native or terminal. Bring-local exists only for Claude — a Codex or Kimi conversation
  lives in that CLI's own store on the box and nothing here can copy it. Reviving a Kimi or Kiro session
  into a fresh seat paints its history back from the agent's replay.
- **State.** A terminal seat reads working, idle and asking off the chrome of its own agent; Codex and
  Kiro also give up their model from the footer.
- **Config.** The model picked in the new-chat form, the autocompact field, routines and the usage panel
  follow the agent. `/config` and `/agents` are Claude Code's own and say so on any other seat. MCP login
  from the card works on Claude, Codex (its own login), Kiro (the seat hands over the OAuth page) and says
  plainly that Kimi and Cursor have no login command the hive can drive.
- **OpenCode** runs one process per turn, but a seat on it still has peers (message, ask, expect), the
  preamble and the hive's own MCP tools plus the hub's gateway, handed over through
  `OPENCODE_CONFIG_CONTENT`. Its ceiling is noted, not enforced: OpenCode compacts by its own rules.
- **The doctor** calls a machine ready when Codex, Kimi, Kiro, Cursor or OpenCode is installed, even with no
  Claude login, and the box reports which of them it carries. The file picker refuses every agent's
  credential folder, not only `~/.claude`.

What stays Claude's, by design: sleep/wake of an
idle seat, sub-agents and the background dock, hooks, skills and shared memory, the effort default from
`~/.claude/settings.json`, and the answer card on Kimi and Kiro (their protocol has no question).

## Attaching to a session from a terminal

With `HIVE_SEAT_WINDOWS` on, every session is a window in a tmux session:

```
docker compose exec -it hive tmux attach -t hive
```

Windows are named after the sessions. Detaching leaves everything running: the
server owns the process, not your terminal.

## Without docker

The box is a convenience; the server is a node process. On a machine that already
has node 22, tmux, git and the Claude Code CLI:

```
cd server && npm ci --omit=dev
HIVE_WORKSPACE=$HOME/hive node server.mjs
```

Same server, same layout on disk, no container.
