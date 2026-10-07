---
title: HTTP API
description: The routes the server answers, and what each one is for.
sidebar:
  order: 1
---

:::note[This page is the source]
Whoever builds a client reads from here and does not guess, and whoever builds a
server implements this and does not invent a route. Code that disagrees with this
page is a bug in the code until somebody changes the page on purpose.
:::

## Authentication

Every route except two requires a signature. See [identity](/concepts/identity/)
for the scheme; in short, four headers on every request:

```
x-hive-key        SHA256:…  who is signing
x-hive-at         epoch in ms
x-hive-nonce      16 bytes hex, once only
x-hive-signature  base64
```

The signature covers, each field length-prefixed: `hive-request-v1`, the method,
the path, the SHA-256 of the body, the timestamp, the nonce and **the
fingerprint of the destination server**.

Refused when: older than 60 seconds, nonce already seen, key not in the roster,
or key revoked.

### The open routes

Two, and neither returns anything about anybody:

| Route | What |
| --- | --- |
| `GET /health` | liveness |
| `GET /api/broker` | the server's public key, to pin at pairing |

## Sessions

A session is an agent running.

| Route | What |
| --- | --- |
| `GET /api/sessions` | the sessions that exist, with state, title and what they are doing |
| `POST /api/sessions` | open one: `{ name, mission, repo, model, errand }` |
| `GET /api/sessions/:name` | one session, with the `seq` of its last event |
| `POST /api/sessions/:name/say` | `{ text, images }` — talk to it |
| `POST /api/sessions/:name/answer` | `{ text }` — answer the question that stopped it |
| `POST /api/sessions/:name/interrupt` | cut the turn |
| `DELETE /api/sessions/:name` | end it |
| `GET /api/sessions/:name/events?from=<seq>` | history from a point |

The event log is **append-only per session, one JSON line per event, with an
increasing `seq`**. Nothing reads that file over the running process's shoulder:
the server owns it and serves it.

## Team

| Route | What |
| --- | --- |
| `POST /api/panel` | publish your panel — tells your clients and pushes to peers |
| `GET /api/board` | everyone's panel, from the local cache, with who is online and what is stale |
| `POST /api/say` | `{ to, kind, body }` — an envelope for another key, local or on a peer |
| `POST /api/invites` | mint a single-use invite and return the link |
| `POST /api/invites/redeem` | `{ link }` — join the team of whoever invited you |
| `GET /api/peers` | the servers this one knows, with connection state |
| `POST /api/peers/forget` | `{ fingerprint }` — undo the pairing, in both directions |

`GET /api/board` answers **from what is already in memory**. The N×N happens on
the write, which is rare, not on the read, which is constant. Going back to
asking N servers on every read is the specific defect this design exists to
avoid.

## Desktop and phone

There is no separate API for this. A phone and a desktop are keys in the same
roster, and an envelope does not know the difference — a request from the phone
that needs the desktop is a `POST /api/say` addressed to its key, delivered
immediately over the stream.

## Naming

Identifiers, function names, route names and JSON fields are in **English**.
