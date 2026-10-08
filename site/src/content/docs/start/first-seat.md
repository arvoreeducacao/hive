---
title: Your first seat
description: Open a seat, give it a mission, and watch it work.
sidebar:
  order: 3
banner:
  content: Hive is alpha software. Things change and break between commits, and there are no releases yet.
---

A **seat** is one agent session: a tile on the wall with a real terminal behind
it. This page opens one.

## Before you start

You need a server to hold the session. Either:

- the desktop app on its own, which runs seats on your machine in tmux; or
- a server you started, which [run your own server](/guides/run-your-own/)
  covers in one command.

You also need the agent signed in. The server can start a session, but Claude
needs your account — once per machine or per volume:

```sh
docker compose exec -it hive claude
```

Sign in there. The credential lands where the server can pick it up.

## Opening a seat

A seat is opened with four things, and only the first is required:

| What | Meaning |
| --- | --- |
| `name` | what the seat is called — this is also its mailbox, so it has to be unique |
| `mission` | the first message: what you want done |
| `repo` | the repository it opens in |
| `model` | which model the agent runs on |

That is the new-seat form, in the app or on the phone. Only the name is
required: the repository defaults to the hub and the branch to
`<your-name>/-/<seat-name>`.

The name is not decoration. Two windows with the same name share a mailbox, and
what you send reaches the older one, so Hive refuses a name that is already
taken rather than letting the message go somewhere surprising.

## Watching it

The wall shows every seat at once, each tile carrying its state and what it is
doing. Three things you will use constantly:

- **peek** — read the last lines of a seat's screen without attaching to it;
- **say** — send it a message mid-flight;
- **interrupt** — cut the current turn without ending the session.

A seat that stops and needs an answer says so on its tile, and pushes to your
phone if one is paired.

## When it stops

A seat waiting on you is the normal end of a turn, not a failure. Answer it from
the app, from the phone, or from the command line — they are the same mailbox.

Ending a seat is deliberate: the session is deleted and its window closes. The
event log for that session is append-only and stays where it was written, so
ending a seat does not erase what it did.

## Next

- [Seats](/concepts/seats/) — what a seat actually is, and how they talk to each
  other.
- [Connect your phone](/guides/phone/) — so a stopped seat can find you.
- [Invite someone](/guides/invite/) — so a teammate's wall and yours can see each
  other.
