---
title: Install
description: Where the builds are, and what to take for each platform.
sidebar:
  order: 2
banner:
  content: Hive is alpha software. Things change and break between releases.
---

Take the file for your system from the
[latest release](https://github.com/arvoreeducacao/hive/releases/latest):

| Where | What to take |
| --- | --- |
| macOS, Apple silicon | `Hive-arm64.dmg` |
| Linux, x86_64 | `Hive-x86_64.AppImage` or `Hive-x86_64.rpm` |
| Windows, x64 | `Hive-x64.exe` |

The builds are not signed yet. On macOS, allow the app once in **System
Settings → Privacy & Security**. On Windows, SmartScreen warns once.

## Building the desktop app yourself

```sh
cd app
npm ci
npm run deps:server
npm run app
```

The second install is the server's, which the app starts on its own; without it
a chat has no agent to talk to. That is the same app the release ships, running
from your checkout. Note that
only the Electron shell is covered by the release signature — see
[working on Hive](/contributing/development/) before you rely on a local build
for anything but development.

## The phone

There is nothing to install on the phone. The server serves the phone page at
`/phone/`, and the phone keeps it like an app. [Connect your phone](/guides/phone/)
covers opening it and pairing.

## Updating

The desktop app updates itself from the releases of this repository. A merge to
`main` does not change the app that is running — only a release does. If you are
chasing behaviour that you believe was just fixed, check which release you are
on before you go looking for the bug.
