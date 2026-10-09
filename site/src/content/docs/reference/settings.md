---
title: Settings
description: The environment variables the server and the CLI read.
sidebar:
  order: 3
banner:
  content: Hive is alpha software. Things change and break between releases.
---

## The server

| Variable | Default | What it decides |
| --- | --- | --- |
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

`HIVE_SERVER_URL` is what the server tells clients about itself, so it has to be
an address they can actually reach. The server speaks plain HTTP and expects
something else to terminate TLS.

Everything under `HIVE_WORKSPACE` is worked out from it — the server's own
directory, the file of keys it trusts, the folder repositories sit in. You set
the root; you do not set the rest. Each has an override, and none of them is
something you should need.

## What lives under the workspace

| Path | What |
| --- | --- |
| `/workspace/hive` | sessions, events, sockets, the server's own state and key |
| `/workspace/repos` | the repositories you work in |
| `/workspace/home` | the home directory of the user inside the box |

The volume is what survives a rebuild. Delete it and you start over: new key, no
sessions, no login.

## The command line

| Variable | Default | What it decides |
| --- | --- | --- |
| `HIVE_HOME` | `~/.hive` | where the CLI keeps config and state |
| `HIVE_HUB` | the folder above your checkout | where your repositories are — written by `infra/scripts/setup.sh` |
| `HIVE_DEV` | none | which server is yours — written by `infra/scripts/setup.sh` |
| `HIVE_POD` | `ws-<HIVE_DEV>-0` | the specific server, when the name is not enough |
| `HIVE_TIMEOUT` | `45` | seconds a command waits before giving up; `0` disables |
| `HIVE_STATE_DIR` | `$HIVE_HOME` | where the MCP and pairing helpers keep state |

`~/.hive/config` is read on every invocation, and an environment variable set in
the shell wins over what the file says.

Without `HIVE_DEV` or `HIVE_POD`, the CLI refuses to run — there is no way to
tell which server is yours, and guessing would be worse than stopping.
