---
title: Working on Hive
description: Getting it running, the suite, and the rules that are not style.
sidebar:
  order: 1
banner:
  content: Hive is alpha software. Things change and break between releases.
---

## Getting it running

```sh
cd app && npm ci
cd ../server && npm ci --omit=dev
```

Then the whole suite, which is the same line CI runs:

```sh
node --test --test-timeout=120000 \
  app/usage/tests/*.test.mjs app/manifest/tests/*.test.mjs \
  app/tests/*.test.js app/tests/*.test.mjs \
  server/tests/*.test.mjs \
  mobile/src/tests/*.test.mjs infra/tests/*.test.mjs
```

No framework and no build step: `node --test` and nothing else.

To run a dev copy of the desktop app, read `AGENTS.md` first. It has the one rule
that matters — start your server on a port nobody else holds, and never kill one
by name.

## This site

The documentation site is the one part of the tree with a build step, and it is
fenced off for that reason:

```sh
cd site
npm install
npm run dev
```

## The rules that are not style

**The contract is the source.** The [HTTP API](/reference/http-api/) describes
what the server does and what the routes are. Code that disagrees with it is a
bug in the code until somebody changes the page on purpose. A pull request that
adds a route without touching it will be asked for one.

**One door.** Every client goes through those routes — the phone, the desktop
app, a seat talking to its neighbour. A change that reaches a session by any
other path is the thing this design exists to avoid.

**Nothing listens on a client.** The desktop app and the phone dial out. If a
change makes either of them accept a connection, it needs a very good reason.

**No bearer tokens.** Every request carries its own signature, bound to the
fingerprint of the server it is addressed to. A change that introduces a secret
that grants access by being held is the thing this design exists to avoid.

**English in the repo.** Identifiers, routes, JSON fields, tests, commits, pull
requests. The interface is translated at the edge, not in the code.

**The code carries no comments.** Names carry the meaning. Reasons go in the
commit message, where they can be read next to the change that needed them. The
exception is a pragma a tool demands.

## Pull requests

One change per pull request, with the tests that would have caught the bug.

A change to how something is run or hosted also changes the document that
describes it — that pairing is checked by tests in `infra/tests/`, so a mismatch
fails CI rather than waiting for review.

## Reporting a hole

[Security](/contributing/security/), not a public issue.
