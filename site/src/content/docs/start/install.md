---
title: Install
description: Where the builds are, and what to take for each platform.
sidebar:
  order: 2
---

Builds are attached to each entry in
[Releases](https://github.com/arvoreeducacao/hive/releases).

| Where | What to take |
| --- | --- |
| macOS, Apple silicon | `Hive-arm64.dmg` |
| Linux, x86_64 | `Hive-x86_64.AppImage` or `Hive-x86_64.rpm` |
| iPhone | built here and handed out to registered devices — not a public download |
| Android | `Hive.apk` — signed with the key the build template ships, so your phone will ask you to allow it |

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

The iPhone app never goes through the App Store or TestFlight, and Apple has to
know a phone before the app will install on it. [Connect your
phone](/guides/phone/) covers registering a device, getting the build, and
pairing.

Android takes the `.apk` from the release directly.

## Updating

The desktop app updates itself from the releases of this repository. A merge to
`main` does not change the app that is running — only a release does. If you are
chasing behaviour that you believe was just fixed, check which release you are
on before you go looking for the bug.
