---
title: The three pieces
description: A desktop app, a server, a phone app — and only one of them keeps state.
sidebar:
  order: 2
---

Three pieces, and only one of them keeps state.

| Piece | What it does |
| --- | --- |
| Desktop app | Electron. The wall, the composer, the terminal. A client. |
| Server | Sessions, identity, roster, peers, invites, push. The only thing that keeps state. |
| Phone app | Expo. The same wall, smaller. Also a client. |

Desktop and phone are **equals** before the server. What separates them is the
screen, not the power: anything you can do from the laptop you can do from the
phone, because both are doing the same thing — signing a request and sending it
to the server.

## The rule

**Nothing listens on anybody's machine.** Clients only dial out. The server is
the only thing that listens.

That has consequences worth naming:

- There is no inbound port to open on a laptop, and no certificate to install on
  one.
- A laptop can close mid-session. The work is the server's, not the terminal's.
- A lost phone is not a way into your machine. Revoking its key at the server is
  the entire response.

## One server per person

There is no central server. A team is a set of servers that know each other, one
per person.

This preserves isolation — your sessions run on your server, in your checkout,
with your credentials — and it charges a price, which is that each person needs
a server they can reach. [Run your own server](/guides/run-your-own/) is that
price paid in one command.

## Servers push; nobody polls

Each server keeps an outbound connection to every peer it knows, and holds the
last panel it received from each. When the local panel changes, it pushes to the
peers. Reading the board answers from what is already in memory.

The N×N happens on the write, which is rare, not on the read, which is constant.
Going back to asking N servers on every read is the specific defect this design
exists to avoid.

## Where the state lives

Everything the server keeps sits under one root — sessions, events, sockets, its
own key, the file of keys it trusts, and the folder your repositories sit in.
You set the root; everything else is worked out from it.

Delete that root and you start over: new key, no sessions, no login. It is the
one thing worth backing up and the one thing worth being careful with.

## The contract

The server's routes and the shape of everything on the wire are written down in
one place, and code that disagrees with it is a bug in the code until somebody
changes the document on purpose. See the [HTTP API](/reference/http-api/) and
[the stream](/reference/stream/).
