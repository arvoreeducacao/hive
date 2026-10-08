---
title: Security
description: How to report a hole, what counts as one, and what does not.
sidebar:
  order: 2
banner:
  content: Hive is alpha software. Things change and break between commits, and there are no releases yet.
---

## Reporting

Open a [private
advisory](https://github.com/arvoreeducacao/hive/security/advisories/new)
on the repository. That reaches the maintainers without the report becoming
public first.

Please do not open a public issue for anything that would let somebody reach a
session, a key, or a machine that is not theirs.

Tell us what you did, what happened, and what you expected instead. A proof of
concept helps and is never required.

## What is worth reporting

A hive is a fleet of agents with a shell, so the interesting boundaries are:

- **Identity.** Anything that gets a request accepted without a valid signature
  from a key in the roster: a replay, a signature that is not bound to the server
  it was sent to, a revoked key that still works, a pairing code that outlives
  its five minutes or survives a wrong guess.
- **Invites.** An invite is single use and it names the fingerprint of the server
  that issued it. Redeeming one twice, or being redirected to a different server
  than the link names, is a hole.
- **Reach.** A session is meant to touch the workspace it was opened on. Reading
  or writing outside it — through a path, a symlink, an argument that becomes a
  shell word — is a hole.
- **The client.** The desktop app and the phone are supposed to dial out and not
  listen. Anything reachable on a client from elsewhere on the network counts.

## What is not a finding

An agent with a shell can run commands: that is the product, not a bug. A person
who is inside a server — a paired device, a redeemed invite — is trusted with the
sessions on it by design. **The boundary is getting in, not what you can do once
you are.**

The container runs the agent without asking for approval on each command. It is
meant to hold work you would let an agent do unattended, and it is not a sandbox
for code you do not trust.

## Supported versions

The latest release. There is no long-term branch to backport to.
