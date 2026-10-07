---
title: Repository layout
description: What each folder is, and which one is not part of Hive.
sidebar:
  order: 4
---

| Folder | What |
| --- | --- |
| `app/` | the desktop app, Electron, and the client behind it |
| `server/` | the server: sessions, identity, roster, peers, invites, push |
| `infra/docker/` | the image, the boot script, the compose file |
| `docs/` | the server contract, running your own, the phone build |
| `site/` | this documentation site |

## What is deliberately absent

There is no test framework and no build step in the product code. The suite is
`node --test` and nothing else. This documentation site is the exception, and it
is fenced off in `site/` with its own dependencies for that reason.
