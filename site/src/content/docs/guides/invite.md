---
title: Invite someone
description: One link, one click, and two servers know each other.
sidebar:
  order: 3
---

A team is a set of servers that know each other. Adding a person means making
your server and theirs into peers, and that is one link.

## Sending an invite

`POST /api/invites` mints a single-use invite and returns the link:

```
hive://join?at=<address>&key=<fingerprint>&token=<token>
```

Three things travel in it, and the middle one is what makes it safe:

- `at` — the address of your server;
- `key` — **the fingerprint of your server's public key**;
- `token` — single-use, with an expiry.

The fingerprint is what lets whoever joins pin the right server and refuse a
different one later. There is no certificate authority in this design; the
fingerprint in the link is what a CA would otherwise be for.

## Receiving one

Clicking the link opens the recipient's Hive with the invite already on the door
screen. Going in stays a click of theirs, never the link's.

Redeeming generates nothing new. Their server sends its own public key and
receives yours. One link, one click, and the two know each other — mutually.

An invite minted in the older `https://<address>/join?...` shape is still read by
the door screen until it expires.

## After they are in

The token burns on first use. You see who came in, with name and fingerprint.
What remains in both rosters is the other's public key — nothing in the link
grants standing access, and there is nothing left to leak.

From then on the two servers keep outbound connections to each other and push
their panels across. `GET /api/peers` shows what your server knows and the state
of each connection.

## Undoing it

```
POST /api/peers/forget   { "fingerprint": "SHA256:…" }
```

That removes the peer in both directions.

## Why this is not the same as pairing a phone

Adding your own device and adding a person are different flows on purpose.

Pairing uses an eight-letter code, and works because you are holding both things
at once. That is a confirmation, not a credential — a code dictated over chat
proves nothing to the other person about which server is on the far end.

An invite carries a server fingerprint, which is exactly what a code read aloud
cannot carry. Use the code for your own devices and the link for people.
