---
title: Run your own server
description: One container, one volume, one key — where state lives and how the server learns to trust you.
sidebar:
  order: 1
banner:
  content: Hive is alpha software. Things change and break between releases.
---


A hive is one server. It holds the sessions, it holds the state, and clients — a
desktop app, a phone — talk to it over HTTP. Nothing listens on a client.

You do not need Kubernetes and you do not need an AWS account. Those are how one
team happens to host a server; they are not what a server is.

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
HIVE_OWNER_KEY="$(cat ~/.hive/identity.pub)" docker compose up
```

`~/.hive/identity.pub` is the key the desktop app signs every request with. The
app writes it the first time it opens, and its welcome screen shows the same line
ready to copy.

The server adopts that key on boot, once — a restart with the same key changes nothing.
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

## Reaching it from somewhere else

Put the box on a machine that has an address — an EC2 instance, a VPS, a server
in a cupboard — and set:

```
HIVE_SERVER_URL=https://hive.example.com
```

That is what the server tells clients about itself, so it has to be the address
they can actually reach. Put TLS in front of it; the server speaks plain HTTP and
expects something else to terminate.

Pairing does not change with distance: the client asks for a code, the code lasts
five minutes, and the private half of every key never leaves the device that made
it.

## The settings that matter

| Variable | Default | What it decides |
|---|---|---|
| `PORT` | `8791` | where the server listens |
| `HIVE_PORT` | `8791` | which port on the host maps to it, in compose |
| `HIVE_SERVER_URL` | `http://127.0.0.1:8791` | the address the server hands to clients |
| `HIVE_SERVER_NAME` | `hive` | how this server introduces itself |
| `HIVE_WORKSPACE` | `/workspace` | the root of everything it keeps |
| `HIVE_HUB` | `<workspace>/repos` | where your repositories are, inside the box |
| `HIVE_SEAT_WINDOWS` | `1` | open each session in a tmux window, so you can attach from a terminal |
| `HIVE_TMUX_SESSION` | from the workspace | which tmux session holds those windows — set it when two servers share a machine |
| `HIVE_OWNER_KEY` | none | the key the server trusts from the start — yours |
| `HIVE_SSH_PUBKEY` | none | when set, sshd starts and accepts this key; when empty, sshd never starts |

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

## Where to go from here

- [Settings](/reference/settings/) is the full table of environment variables,
  including the ones this page did not need.
- [Connect your phone](/guides/phone/) pairs a device with the server you just
  started.
- [Invite someone](/guides/invite/) makes two servers into peers.
