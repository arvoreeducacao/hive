---
title: The stream
description: WS /stream — everything the server has to say, without anyone asking.
sidebar:
  order: 2
banner:
  content: Hive is alpha software. Things change and break between releases.
---

`WS /stream` is the way back. It is signed in the query string, with the same
four fields the HTTP headers carry.

Down it comes everything the server has to say, without anyone asking:

```json
{ "v": 1, "kind": "...", "from": "SHA256:…", "to": "SHA256:…", "body": null, "at": 0 }
```

## Kinds

| `kind` | When |
| --- | --- |
| `welcome` | on connect, with how many envelopes were held |
| `event` | a new event from a session this client follows |
| `panel` | someone on the team published a panel |
| `say` | an envelope addressed to this key |
| `revoked` | this key has just been revoked |

## Envelopes for someone offline

An envelope for a key that is not connected is held — up to 200 per recipient —
and delivered the instant that key connects. The `welcome` message says how many
were waiting.

## Nobody polls anything

That is the design rule, and it is worth stating plainly because it is the thing
most easily broken by a well-meaning change. Clients do not poll for events,
panels or messages. The server pushes, and a client that finds itself on a timer
is a client that has drifted from the contract.
