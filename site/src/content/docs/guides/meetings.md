---
title: Meetings and Aveia
description: Record Meet calls from their captions in the hive, and send them to an Aveia you host, if you want.
sidebar:
  order: 4
banner:
  content: Hive is alpha software. Things change and break between commits, and there are no releases yet.
---

The hive writes down a meeting from your microphone, and from the computer's
sound if you turn that on. The words are transcribed on this machine. Only the
text goes to the model that writes the notes.

## Captions from Google Meet

A Meet call already knows who said what. A browser extension hands those
captions to the hive, with the name of each speaker. While the captions arrive,
they are what gets written down. The microphone and the computer's sound are
still captured, and take over if the captions stop.

To set it up:

1. Open the hive's settings and go to **Meetings**.
2. Press **set up the browser extension**. The hive writes the extension to a
   folder on this machine and shows the steps for Chrome, Edge, Brave, Firefox
   and Zen.
3. Load the folder in the browser, as the steps say.
4. Open a Meet call. A **Record** button shows up beside the call's own buttons.

Without anything else, the extension is called **Hive · Meet captions** and
talks only to the hive on this computer. Nothing leaves the machine.

## Aveia, optional

Aveia is a separate meetings service: it keeps the recordings of a whole team
in one place. The extension can send the captions to an Aveia as well as to the
hive. This is optional, and it is off unless you configure it.

There is no shared Aveia to sign up for. To use it, you host your own instance
and point the hive at it. An Aveia that someone else hosts accepts the captions
only with a sign-in to that Aveia, so pointing the hive at it does nothing
without an account there.

To turn it on:

1. Add the address of your Aveia to `~/.hive/config`. It must be `https`:

   ```
   HIVE_AVEIA_URL=https://aveia.example.com
   ```

2. Restart the hive.
3. Open **Meetings** in the settings and press **set it up again**. The hive
   writes the extension again, now with your Aveia's address in it.
4. Reload the extension in the browser.
5. Open the extension's popup and press **Sign in to Aveia to connect**. Sign
   in on the page that opens. Your Aveia hands the extension a token, and the
   popup says who it is connected as.

From then on, a recorded call goes to both: the hive on this computer and your
Aveia. The **Meetings** screen says which Aveia the extension sends to.

To turn it off, remove the line from `~/.hive/config`, restart the hive and set
the extension up again.

### What the extension sends to Aveia

| Route | What |
|---|---|
| `GET /api/ext/me` | checks the token and reads who it belongs to |
| `POST /api/ext/captions` | the captions of the call, as they arrive |

Both carry the token your Aveia handed to the extension. The extension sends
nothing to an address you did not configure, and never sends the token
anywhere but that address.
