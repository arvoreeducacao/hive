---
title: What Hive is
description: A fleet of coding agents, a wall of seats, and one server that holds the state.
sidebar:
  order: 1
---

Hive runs a fleet of coding agents and lets you watch all of them at once.

Every session is a **seat**: a tile on a wall, with a real terminal behind it.
You open a seat on a repository and a branch, tell it what you want, and it
works. Seats read each other's screens and ask each other questions. When one
stops and needs you, your phone buzzes, and you can answer from there.

The agent is the Claude Code CLI by default. OpenCode and Codex work too.

## Two ways to run it

**The app on its own.** Install it, point it at your code, and seats run on your
machine in tmux. Nothing to host, nothing to configure, nothing of yours
reachable from outside.

**The app and a server.** One container holds the sessions and the state; your
laptop becomes a client, and so does your phone, and so do the people you
invite. Close the laptop and the work carries on.

```sh
cd infra/docker
docker compose up
```

That is the whole thing: one image with node, git, tmux and the agent inside,
answering on `http://127.0.0.1:8791`. [Run your own
server](/guides/run-your-own/) is the guide — where state lives, how the server
learns to trust your key, and how to put it on a machine that has an address.

## What holds it together

Three pieces, and only one of them keeps state: a desktop app, a server, a phone
app. Desktop and phone are equals before the server — what separates them is the
screen, not the power.

Identity is an Ed25519 key in `ssh-keygen` format. There is no bearer token
anywhere — every request carries its own signature, bound to the fingerprint of
the server it is addressed to. Pairing never transmits a secret: the device
sends its public half, and the private half never leaves it.

[The three pieces](/concepts/three-pieces/) goes into the shape;
[identity](/concepts/identity/) goes into the keys.

## The rule that organises everything

**Nothing listens on anybody's machine.** Desktop and phone only dial out. The
server is the only thing that listens, and the only thing that keeps state. A
client is a screen and a keyboard.

That one rule is why there is no inbound port to open on a laptop, and why a
lost phone is not a way into your machine — revoking its key at the server is
the whole of the response.

## What Hive is not

It is not a hosted service. There is no central server and no account to sign up
for: a team is a set of servers that know each other, one per person. That
preserves the isolation — your sessions run on your own server — and it charges
a price, which is that each person needs a server they can reach.

It is not a replacement for the agent. Claude Code, Codex and OpenCode do the
work. Hive gives them somewhere to run, a wall to be watched on, and a way to
reach you when they are stuck.
