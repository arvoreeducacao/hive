---
title: Teams and peers
description: A team is a set of servers that know each other, joined by a one-time link.
sidebar:
  order: 4
---

There is no central server, so a team is not a place you join. It is a set of
servers that know each other — one per person.

Two servers that know each other are **peers**. Each keeps an outbound
connection to the other and holds the last panel it received, so reading the
board is a read from local memory rather than a fan-out of requests.

## The board

Your board is everyone's panel, served from your own server's cache, with a mark
for who is online and what has gone stale.

Publishing works the other way round: when your panel changes, your server
pushes it to its peers. Writes are rare and reads are constant, so the cost sits
on the write.

## Invites

A person joins through a one-time link from someone already inside. What makes
the link safe is what it carries:

- the address of the inviting server,
- **the fingerprint of that server's public key**,
- a single-use token with an expiry.

The fingerprint is what lets whoever joins pin the right server and refuse a
different one afterwards — no CA, no certificate.

The link looks like this:

```
hive://join?at=<address>&key=<fingerprint>&token=<token>
```

Clicking it opens the Hive of whoever received it, with the invite already on
the door screen. Going in stays a click of the person's, never the link's.

Whoever redeems generates nothing new: they send their own server's public key
and receive the other's. One link, one click, and the two know each other —
mutually.

The token burns on first use. The inviter sees who came in, with name and
fingerprint, and can undo the pairing whenever they like. Nothing in the link
grants permanent access: what remains in both rosters is the other's public key.

## Devices versus people

Adding your own phone and adding a teammate are deliberately different flows.

| | How | Why |
| --- | --- | --- |
| Your own device | eight-letter code | you have both things in your hands |
| Another person | invite link | dictating a code over chat proves nothing about which server is on the other end |

The eight-letter code is a confirmation, not a credential. The invite link is
what carries a server fingerprint, and that is exactly what a code read aloud
cannot do.

## Undoing it

`POST /api/peers/forget` removes a peer, in both directions. As with device
revocation, there is nothing to expire and nothing to rotate — the entry leaves
the roster and the connection stops being accepted.
