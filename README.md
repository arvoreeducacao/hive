# Hive

[![ci](https://github.com/arvoreeducacao/hive/actions/workflows/ci.yml/badge.svg)](https://github.com/arvoreeducacao/hive/actions/workflows/ci.yml)
![status: alpha](https://img.shields.io/badge/status-alpha-orange)

Run a fleet of coding agents and watch all of them at once.

> [!WARNING]
> **Hive is alpha software.** It is open so people can try it and tell us what
> breaks, not because it is finished.
>
> - There are no releases yet: you build the app from source, as below, on
>   Linux, macOS or Windows.
> - Anything can change between commits: settings, the files under `~/.hive`,
>   the HTTP routes, the extension hooks. There is no migration promise yet.
> - Seats run coding agents with a shell and no approval prompts. Point them only
>   at code and machines you are willing to let an agent change. Read
>   [SECURITY.md](SECURITY.md) before you run a server anyone else can reach.
> - It is used every day by the team that builds it, on Linux and macOS. Windows
>   has had the least use.
>
> Bugs and rough edges go in [issues](https://github.com/arvoreeducacao/hive/issues).

Every session is a **seat**: a tile on a wall, with a real terminal behind it. You
open a seat on a repository and a branch, tell it what you want, and it works.
Seats read each other's screens and ask each other questions. When one stops and
needs you, its tile says so, and with a server of your own the phone shows it
too and you can answer from there.

The agent is the Claude Code CLI by default. Codex runs as a first-class seat too, through its app-server, with the same tile: streamed text, tool cards, questions you answer from the app, interrupt and resume. OpenCode works one turn at a time. Kimi Code CLI runs the same way through `kimi acp` (Agent Client Protocol): streamed text and thinking, tool cards, stop, resume, `/model`, `/compact` and `/context`. Kiro CLI too, through `kiro-cli acp`, with `/effort` and a real `/mcp` on top. Cursor CLI as well, through `cursor-agent acp`, signed in with the CLI's own login. Whatever the agent, the seat comes back after a restart, sits in the archives, revives on the same agent and takes the hive's autocompact ceiling (see [the same hive, whatever the provider](docs/run-your-own.md#the-same-hive-whatever-the-provider)).

## Two ways to run it

**The app on its own.** Install it, point it at your code, and seats run on your
machine in tmux, or in native ptys on Windows. Nothing to host, nothing to configure, nothing of yours
reachable from outside.

**The app and a server.** One container holds the sessions and the state; your
laptop becomes a client, and so does your phone, and so do the people you invite.
Close the laptop and the work carries on.

**What a seat actually is, before you start one.** A seat runs a coding agent with
a shell and no approval prompts, by design — it edits, installs, commits and runs
whatever it decides to, on everything you mount. The container holds it in, but it
is not a sandbox: [SECURITY.md](SECURITY.md) says exactly what it does and does not
hold back. Compose publishes the port on `127.0.0.1` only, so the box is reachable
from your machine and nowhere else until you say otherwise.

```
cd infra/docker
docker compose up
```

That is the whole thing: one image with node, git, tmux and the agent inside,
answering on `http://127.0.0.1:8791`. [docs/run-your-own.md](docs/run-your-own.md)
is the guide — where state lives, how the server learns to trust your key, and how
to put it on a machine that has an address.

## Getting the app

There are no prebuilt downloads yet, so the app comes from this checkout.

**What the machine needs**

| Tool | Why |
|---|---|
| Node.js 22 or newer, with npm | builds and runs the app |
| git | the seats work on repositories |
| tmux | every local seat lives in a tmux window (not needed on Windows) |
| the GitHub CLI, `gh`, signed in (`gh auth login`) | the pull request panel, reviews and merges |
| at least one agent CLI, signed in | the seats themselves: the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) by default, or Codex, Kimi, Kiro, Cursor or OpenCode |

**Build and open it**

```
cd app
npm ci
npm run deps:server
npm run app
```

The second install is the server's, which the app starts on its own. Skip it and
the app opens, but a chat has no agent to talk to.

**The first run** walks you through four steps, about five minutes:

1. **hello**: your name, and the folder your work lives in. Point it at a folder
   that holds your repositories; a seat opens on one of them.
2. **your machine**: it checks the tools above and, for anything missing, gives
   the install command for your system.
3. **your key**: it makes the Ed25519 key that identifies this machine.
4. **first flight**: opens your first chat, which introduces itself and asks you
   a question. Answer it, and you are in.

Everything the app keeps sits in `~/.hive`. Your agent's own login stays where
that agent keeps it; the hive never asks for it.

**What you will not find here.** The phone, a server in the cloud and inviting
other people all need a server you host yourself (above, and
[docs/run-your-own.md](docs/run-your-own.md)). On the app alone, everything runs on
your machine and nothing is reachable from outside.

**Meetings and Aveia.** The hive records Meet calls from their captions, on your
machine. Sending them to Aveia, a separate meetings service, is optional and
needs an Aveia you host yourself: [docs/meetings.md](docs/meetings.md).

## What holds it together

Three pieces, and only one of them keeps state: a desktop app, a server, a phone
page the server itself serves. **Nothing listens on anybody's machine**: clients
only dial out.

The phone never reads a conversation off the server in the clear. Each chat has a
key of its own, made on the machine that runs it; every line, picture and answer
travels sealed with that key, in a numbered log the server keeps but cannot open.
The key reaches your phone wrapped for its own public key, so a new device sees the
whole chat and a revoked one sees nothing new. The server stores, orders and
delivers; it reads nothing.

Identity is an Ed25519 key in `ssh-keygen` format. There is no bearer token
anywhere — every request carries its own signature, bound to the fingerprint of
the server it is addressed to. Pairing never transmits a secret: the device sends
its public half, and the private half never leaves it.

The protocol is HTTP and the routes live in `server/`. There is one door and one
way in: what the phone can do, the desktop app can do, over the same routes.

## The layout

| Folder | What |
|---|---|
| `app/` | the desktop app, Electron, and the client behind it |
| `server/` | the server: sessions, identity, roster, peers, invites |
| `server/sync/` | the sealed log the phone reads: keys, broker, client, runner |
| `server/phone/` | the phone page, served by the server at `/phone/` |
| `infra/docker/` | the image, the boot script, the compose file |
| `docs/` | running your own |
| `site/` | the documentation site |
| `raycast/` | a Raycast extension that opens and answers chats without switching to the app |

## Extensions

What runs on top of the hive without being part of it: folders anyone copies
into a hub or a machine and turns on in the app. The contract is in
[`app/extensions/README.md`](app/extensions/README.md); the ones anyone can
install, Linear first, live in
[arvoreeducacao/hive-extensions](https://github.com/arvoreeducacao/hive-extensions).

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Found something that looks like a hole?
[SECURITY.md](SECURITY.md) first, please, not an issue.

## License

[Apache-2.0](LICENSE).
