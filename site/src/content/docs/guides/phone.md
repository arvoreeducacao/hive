---
title: Connect your phone
description: Nothing to install — open the page your server serves and type an eight-letter code.
sidebar:
  order: 2
---

The phone is not a companion app. It is a client that reads the same chats the
desktop reads and types into them, and the seat cannot tell which one spoke.
There is no store, no build and no certificate: the server serves the phone page
itself, at `/phone/`, and the phone keeps it like an app.

## Open the page

On the phone, open `https://<your server>/phone/` — the same address the
desktop app talks to. On iPhone, share → **Add to Home Screen**; on Android,
the browser offers to install it. From then on it opens full screen, with its
own icon, and works from what it already has when the network is gone.

## Pair it

In the desktop app, open **who gets in** and press **pair a device**. It shows
an eight-letter code. Type it on the phone.

The code lasts five minutes, works once, and closes after five wrong attempts.
It transmits no secret: the phone sends the public half of two keys it just
made, and the private halves never leave it. From then on every request the
phone makes is signed with the first key, bound to your server's fingerprint,
and every chat key it receives is wrapped for the second.

Pairing turns the **my phone** switch on. The switch is what lets the chats of
that machine travel; turn it off and they stop.

## What the phone sees

Every chat you have open on your machines, grouped by what they want from you:
the ones waiting on an answer first, then the ones working, then the ones that
finished while you were away. Open one and the conversation is there, with the
agent's answers in full, the tools it ran folded into one line, and the
questions it asked as cards you answer with a tap. You can type, send up to six
pictures in one message (from the camera roll or pasted), or stop the turn. A
`/` at the start of a word offers the chat's own commands and a `#` the names
of your other chats, as on the desktop. Swipe in from the left edge to go back,
the way the phone's own apps do.

The **+** opens a new, empty chat with the usual message box: the first thing
you write is the mission, and computer or cloud is a switch in the header. The mission
travels to the computer sealed for its key alone, the computer opens the chat and names it
as it does from the desktop, and the empty screen becomes that chat as soon as
it starts. This needs the Hive open on the computer; the page says so when it is not.

Above the message box, three pills say what the chat runs on — model, effort
and, for a chat on the computer, the login — and tapping one changes it, the same
way the desktop does: the phone asks the chat for its catalogue, the chat
applies the choice and says so in the thread. A new chat has the same pills
before it starts, with model and login (or the repository, in the cloud)
offered by the computer.

The `@` and `!` menus, and a link to a page on the shelf, work the same way:
the phone asks the computer — for the files in the chat's directory, for who is on
the team, for the page — in an envelope sealed for the computer, and the computer answers
in one sealed for the phone. A shelf page opens inside the app, in a frame that
cannot reach the phone's keys.

The desktop has more; the phone has what a pocket needs.

## What the server sees

Nothing readable. Each chat has a key of its own, made on the machine that runs
it. Every line, picture and answer goes to the server sealed with that key, in
a numbered log the server keeps, orders and delivers but cannot open. The key
travels to your phone wrapped for the phone's own public key. A phone that was
offline resumes from the last number it had and misses nothing; two phones read
the same log.

## Revoking a phone

The same **who gets in** screen lists the phones and takes one out. Revocation
takes effect immediately: the stream it was reading is closed, its key stops
opening the doors, and every chat it could read is re-keyed so nothing new is
readable with what it held.

This is the whole answer to a lost phone. There is no token to expire and no
password to change.
