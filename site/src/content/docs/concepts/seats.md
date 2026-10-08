---
title: Seats
description: A seat is one agent session — a tile on a wall with a real terminal behind it.
sidebar:
  order: 1
banner:
  content: Hive is alpha software. Things change and break between commits, and there are no releases yet.
---

A **seat** is one agent session. On screen it is a tile on a wall; behind the
tile is a real terminal, running a real agent CLI, in a real checkout.

That is the whole abstraction. There is no queue, no job, no orchestration layer
deciding what runs when. A seat is a process someone started, and it keeps
running until someone ends it.

## What a seat is made of

| Piece | What it is |
| --- | --- |
| name | what the seat is called, and its mailbox |
| mission | the first message — what you want done |
| repo | the repository it opens in |
| model | which model the agent runs on |
| errand | the label that groups seats opened by the same request |

The name doubles as the address. Two seats with the same name would share a
mailbox, and a message meant for the new one would reach the old one, so a
taken name is refused rather than reused.

## The errand

An **errand** is the label carried by every seat opened from the same request.
It is what turns fifteen seats into four things you asked for: the wall groups
by errand, and so does the day view.

The errand names the *request*, never the *task*. If the label does not fit on
one line that you would recognise later, the work was split along the wrong
seam.

## Talking to a seat

Three verbs cover almost everything:

- **peek** reads the last lines of a seat's screen without attaching to it. It
  is how you check on something without interrupting it.
- **say** sends a message into a running seat. The seat picks it up on its next
  turn.
- **interrupt** cuts the current turn. The session survives; only the turn dies.

Ending a seat is separate and deliberate. It deletes the session and closes its
window.

## Seats talk to each other

Seats can read each other's screens and ask each other questions. A seat that
owns a piece of the system is the right thing to ask about that piece, rather
than guessing — and a question from one seat to another is an ordinary envelope,
delivered the same way as a message from your phone.

This is why the address is a key and not a hostname: the sender does not need to
know where the other seat runs, only who it is.

## The event log

Every session has an append-only log: one JSON line per event, with a `seq` that
only increases. Clients ask for history from a point (`?from=<seq>`) and follow
along live from there.

Nothing reads that file over the running process's shoulder. The server owns the
log and serves it — which is what lets a phone, a laptop and a terminal all
watch the same seat without fighting over a file.

## When a seat stops

A seat waiting for you is the normal end of a turn. The tile says so, and if a
phone is paired it buzzes. Answering from the phone, the app or the terminal is
the same mailbox, and the seat cannot tell the difference.
