---
title: Identity
description: One Ed25519 key per device, a signature on every request, and no bearer token anywhere.
sidebar:
  order: 3
banner:
  content: Hive is alpha software. Things change and break between commits, and there are no releases yet.
---

Identity in Hive is a key pair, and nothing else. There is no account, no
password and **no bearer token anywhere**.

One curve, **Ed25519**, in `ssh-keygen` format — the public half is the same
line you would put in an `allowed_signers` file, and the fingerprint is the one
`ssh-keygen -l` prints.

## Every request is signed

There is no session cookie to steal and no token to leak, because there is
nothing that grants access by being possessed. Each request carries its own
signature, in four headers:

| Header | What |
| --- | --- |
| `x-hive-key` | `SHA256:…` — who is signing |
| `x-hive-at` | epoch, in milliseconds |
| `x-hive-nonce` | 16 bytes of hex, usable once |
| `x-hive-signature` | base64 |

The signature covers, each field length-prefixed: the literal `hive-request-v1`,
the method, the path, the SHA-256 of the body, the timestamp, the nonce, and
**the fingerprint of the destination server**.

A request is refused when it is more than 60 seconds old, when the nonce has
been seen before, when the key is not in the roster, or when the key has been
revoked.

On the WebSocket the same four fields travel in the query string.

### Why the destination is in the signature

Because a signed request captured on the way to one server must not be
replayable against another. Binding the destination fingerprint into the
signature makes a request meaningful only to the server it was addressed to.

## Pairing transmits no secret

To pair a device you show it an eight-letter code. What that code does is *not*
carry a credential — the device sends its public half, and the private half
never leaves it.

The code exists so the human can confirm it is really them: it lasts five
minutes, works once, and closes after five wrong attempts.

The client pins the server's key at pairing and refuses a different one
afterwards. That pin is what replaces a certificate authority.

## Revocation

A key that is revoked stops working at the server, immediately, and any client
holding it is told so over the stream — a `revoked` message on the socket it is
already connected to. Nothing has to expire and nothing has to be rotated: the
roster is the truth.

This is the answer to a lost phone, a departed teammate, and a laptop left in a
taxi. It is one entry removed from one list.

## Servers have keys too

A server is not a special case. It has a key pair like any client, and a peer
server sits in the roster with `kind: "peer"` and is verified with the same
signature scheme as everything else.

`GET /api/broker` returns the server's public key, and it is one of only two
routes that answer without a signature — the other being `GET /health`. Neither
returns anything about anybody.

## Where your key lives

Your key sits in your Hive state directory, alongside the rest of what the
client keeps. Two things follow: it is a file you can lose, and it is a file
worth not copying around. A second device should be paired, not handed a copy —
pairing is cheap and gives you something you can revoke separately.
