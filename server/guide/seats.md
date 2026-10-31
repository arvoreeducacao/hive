# Chats (seats)

How a chat opens, runs, talks to other chats, compacts, changes provider, fails, closes and comes back, and where its files live.

## What a chat is

A chat is one agent session in the Hive. The code and the tools call it a seat. It has a name, a provider (claude, codex, kimi, kiro, cursor, gemini, antigravity or opencode), a model and a folder.

- A **native chat** is driven by the Hive: markdown, cards, instant commands, questions as buttons. Most features in this topic (queue, plan mode, provider change, sleep, context window) need a native chat.
- A **TUI chat** is the provider's own terminal program, shown as a live terminal in the tile.
- A **terminal** seat is a plain shell (see "The terminal and shell lines").

The name is the chat's address: other chats and the phone reach it by name. A name is lowercase letters, digits, `-` and `_`, starts with a letter or digit, and has at most 80 characters. `hub` is reserved. The Hive refuses a second chat under a name that already runs ("a second window with that name would share its mailbox"). When you open a chat from the app, a taken name gets `-2`, `-3` and so on.

On macOS and Linux, local chats run in the tmux session `hive-local` (env `HIVE_LOCAL_SESSION`), one window per chat, named after the chat. On Windows there is no tmux: the app runs the chats itself. Cloud chats run on the server in the tmux session `hive` (see the "team-and-cloud" topic). Every chat process carries the env vars `HIVE_SEAT=<name>`, `HIVE_SIDE=local|cloud` and `HIVE_STATE_DIR`.

## Opening a chat

1. Open the new-chat box with the new-chat key (see the "interface" topic). A tile "New chat" appears with "a chat with nothing in it yet".
2. Under "Where it runs", pick "local · your machine", "cloud · server" or "anonymous".
3. Under "How it opens", pick "native chat" or "the TUI".
4. Use the pills under the text box to pick the model, the effort and the account.
5. Write the first message. Enter opens the chat ("The seat opens on the first send"). Shift+Enter breaks the line. Esc on an empty box discards the draft.

The box remembers the provider, model, place and kind for the next new chat. While the chat starts, its tile says "opening the chat" or "naming the mission…". If it fails, the tile says "did not start" with the reason.

In the Classic layout, type `/new <mission>` in the composer: "the rest of the line becomes the mission, and the chat opens right away". That box also has a "name" field ("leave it empty and the AI names it from the mission"), a count for races, and repo and branch fields for cloud chats.

A chat can also open chats with the `spawn` tool (see "Opening chats from a chat").

On macOS and Linux a local chat needs tmux. Without it the Hive says "this machine has no tmux, and a local worker lives inside it — create it on the pod (cloud) or install tmux".

## Provider, model, effort and account

- **Provider**: only a provider that is installed, turned on and signed in can be picked. Install and login are in the "providers" topic.
- **Model**: "the account default", or a model the provider's CLI reports ("asking {agent} what it can run…"). The Hive keeps no model list of its own.
- **Effort**: the levels come from the model. A model with no levels drops the level. At birth the effort is passed to native Claude, native Kimi and Codex (native and TUI).
- **Account**: which login of that provider the chat uses. Only local chats pick one; "cloud seats use the server's sign-in".

In a running native chat, click the pills or type `/model <name>`, `/effort <level>` or `/account`. An unknown model name gets "no model here goes by …". A Claude chat refuses an account change mid-turn: "this chat is mid-turn — stop it or let it finish, and the login changes after that". A model of another provider in the picker moves the chat to that provider (see "Moving a chat to another provider").

## Which folder a chat opens in

- **Local chat**: the hub folder, `HIVE_HUB` in `~/.hive/config` (see the "hub" topic). The chat can go into worktrees on its own (see "Worktrees per chat").
- **Cloud chat**: the server makes a git worktree at `/workspace/worktrees/<repo>/<name>` from `/workspace/repos/<repo>`, on a new branch from `origin/main`. The repo field defaults to the hub's repo. An empty branch field gives `<owner>/-/<name>`. A repo that is not on the server gets "there is no <repo> on this server — clone it into /workspace/repos first". The root is `HIVE_WORKSPACE` (default `/workspace`).
- **Anonymous chat**: a new temporary folder.
- **Resumed chat**: its old folder. If that folder is gone, the hub.

## Races: one mission in several chats

A race opens the same mission in 2 to 4 chats. In the Classic `/new` box, set the count to "race · 2 chats", "race · 3 chats" or "race · 4 chats". A race needs a mission. The `spawn` tool takes `count` from 1 to 3.

Each chat gets this line before the mission: "[hive] race: you are chat i of n on the same mission. Work in a git worktree of your own (EnterWorktree), never on the shared checkout, and open a PR when you are done". With a name, the chats are `<name>-1`, `<name>-2`, and so on. All of them share one errand label. The person compares the results and keeps one.

## Anonymous chats

Pick "anonymous" under "Where it runs". The box says: "Runs on this mac and leaves nothing behind. No hub rules, skills or memories. The other chats, the phone and the summaries never see it, and closing it erases it."

- It is always a native Claude chat on this machine, in a new temporary folder, named `anon-<6 characters>`.
- It gets no preamble, no MCP servers, no settings files, and its session is not saved.
- It never sleeps and cannot be archived.
- Closing asks "Close and erase this chat?": the conversation and the files it made are deleted.

## The composer: images, files, drafts and the queue

- **Images and files**: paste a screenshot (Cmd+V or Ctrl+V) or drop files on the chat or on the new-chat box. One drop takes up to 6 files, 24 MB per file and 32 MB in total. Programs (exe, dmg, deb, apk, jar and similar), empty files and folders are refused. An image becomes an `[Image #n]` mark in the text; another file goes in as its path. Files land in `~/.hive/shots/<chat>/` (the new-chat box uses `<hub>/.hive/assets/`) and are deleted after 7 days (env `HIVE_SHOTS_DAYS`).
- **Prefixes**: `/` a command, `@` a file in the hub, `#` "the name of another chat, to hand it over to the one you are writing to", `~` "someone's name, to hand their hive over. They see any question before it lands", `!` a shell line (see "The terminal and shell lines").
- **Drafts**: text you typed and did not send is kept per chat in `~/.hive/drafts.json` (up to 20,000 characters, up to 300 chats). It comes back after a restart and on a paired phone.
- **Queue**: a message sent while the chat works waits as "queued". Its buttons are "push it into the turn now — no waiting" and "take it back into the box — it will not be sent (↑ in the empty box)". A message that already went into the turn "cannot be taken back". ⌘Enter (Ctrl+Enter) in the box stops the turn and sends right away, without the queue.
- **Edit a message**: hover one of your own messages in a native Claude chat and press the pencil beside "copy" ("edit and redo from here"). The message turns into a box in its place: Enter or "redo from here" sends the new words, Esc or "cancel" leaves it as it was. The chat forgets everything after that message and answers again from there; files on disk stay as they are. A chat that is working stops first ("stop and redo"). Messages from another chat, messages from before the conversation was compacted, anonymous chats and chats on other providers cannot be edited.
- **Questions**: a question from the chat shows as buttons. If you type a message instead, the question is dropped and your text is the answer ("dropped — you said it in the chat instead").

## Commands inside a native chat

| Command | What it does |
| --- | --- |
| `/model [name]` | changes the model, or opens the model picker |
| `/effort [level]` | changes the effort, or opens the effort picker |
| `/account` | opens the account picker |
| `/context` | shows what fills the context window |
| `/compact [focus]` | sums up the conversation now, or after the current turn |
| `/fresh` | starts the chat over in a new session of the same provider, with an extract of the old one |
| `/mcp` | lists the chat's MCP servers and their state |
| `/agents` | lists the subagents the session knows (Claude only) |
| `/config` | sets Claude options: autoCompact, thinking, verbose, recap, checkpoints, turnDuration, outputStyle, language (Claude only) |
| `/plane-mode [off]` | turns plan mode on, or off with `off` (Claude only) |

Other slash commands come from the provider itself. If a chat answers "this seat's driver is older than the native commands", close it and reopen it with the same name: resume keeps the conversation.

## Plan mode

Plan mode is for native Claude chats. Type `/plane-mode` to turn it on. The pill "plan mode" says "this chat plans before it does anything, and nothing runs until you approve; /plane-mode off turns it back".

In plan mode the chat writes a plan, and the plan becomes a card. The plan ends with a block of fronts, one line per chat to open: `name · agent/model · aqui|servidor · repo · one line of work`. The card shows each front with pickers for "which chat program runs this front", "the model this front runs on" and "where this front runs".

- "Approve and open" (or "Approve" when there are no fronts) approves. The chats open as you set them on the card. The card shows "{n} of 3 of the budget".
- "Change the plan" keeps planning.
- After approval the chat leaves plan mode on its own. The mode stays across sleep.

## Naming and renaming a chat

- With no name, the Hive takes the first four words of the mission as the name. A small model then writes a title in the background. Until it lands, the tile says "naming this chat in the background — the first words hold the seat until the name lands".
- If the model is unsure of the subject, the Hive asks once more after the first turn ends. It never writes over a name a person gave.
- To rename, double-click the chat's name, or use "rename…" in the seat menu. Enter saves, Esc cancels. An empty name gives the seat name back. A title has at most 60 characters.
- In the Inbox layout, "Regenerate title" asks the model again from the whole chat.
- A chat renames itself with the `rename` tool, with an optional `now` line for what it does at the moment.
- Titles live in `<hub>/.hive/titles.json`. For a native chat the title is also in `~/.hive/sessions/<name>.json`.

## Closing a chat

Use "close the seat" in the seat menu or the close button on the tile. The dialog says "The window closes and whatever runs in it stops. A chat keeps its transcript: <history key> brings it back with its whole context."

- **Leftover processes**: processes that carry `HIVE_SEAT=<name>` (dev servers, watchers) are listed ("It also stops the process the chat left running:"). They get SIGTERM, then SIGKILL after 3 seconds. This is not done on Windows or for cloud chats.
- **Worktrees** (local only): "Its worktree {tree} is clean and goes away with it." A worktree with uncommitted files, unpushed commits or a lock stays, unless you tick "delete it anyway". If git refuses, the Hive says "The seat closed, but a worktree stayed".
- A chat closes itself or a chat it opened with the `close` tool. Other chats are refused: "a chat closes only itself and the chats it opened".
- A closed chat goes to "Past sessions". Its event log stays on disk.

## Archiving a chat

"archive" in the seat menu (or the archive key, unbound by default) stops the chat and parks it. The "Archived chats" panel lists it: "archiving a chat frees its slot and parks it here".

- "revive" "brings the chat back with the same name, model and conversation". If the name is taken now, the chat gets a free name and keeps its title.
- The list is in `<hub>/.hive/archived-seats.json`.
- Anonymous chats cannot be archived.
- The Hive also archives a chat by itself when it cannot bring it back, with the reason: "it came back and died again within ten minutes", or "nothing here can resume it — no transcript id, or a name, path or model this hive will not run".

## Past sessions: resuming an old conversation

The "Past sessions" panel (the history key, see the "interface" topic) lists old conversations: Claude transcripts in `~/.claude/projects/`, and the Hive's own record of chats on the other providers.

1. Search by title, prompt or folder.
2. Click "preview" to "read the conversation before reviving it".
3. Click "revive". Pick "native chat" or "classic TUI" in "How should it come back?".

The chat opens in its old folder with the whole conversation. A native Claude chat shows "replayed the last {n} of {total} messages — the model remembers all of it". On a cloud Claude row, "continue here" copies the transcript off the server and continues on this machine. The panel can also sync transcripts to a private GitHub repo (see the "team-and-cloud" topic).

## Quiet chats and other cleanup

These sweeps run once an hour on local chats. Env `HIVE_NO_SWEEP` turns them off. Set them in Settings, "The conversation", or in `~/.hive/config.jsonc`.

- **`closeQuietAfterDays`** ("close a chat after it sits quiet for"): default 2, 1 to 90, `0` never closes. A chat closes when nobody wrote to it and it did nothing for that many days. A chat that is working or waiting for you is never closed. It closes the same as a close by hand: it goes to "Past sessions", not to the archive.
- **`pruneDiariesAfterDays`** ("clear a closed chat's screen history after"): default 30, 1 to 365, `0` off. It deletes the event log of a closed chat that can come back: a Claude chat whose conversation is already on GitHub through cloud-sessions, or a Codex chat. Kimi, Kiro, OpenCode and Cursor chats are never cleared.

Other tools:

- "hide until it works again" in the seat menu takes a chat off the screen. It comes back when it works or needs you.
- The doctor check "processes of chats that are gone" lists processes tagged with a chat that is closed, and offers to stop them.

## What a chat knows when it starts

A native chat gets a short preamble from its driver. On Claude it is added to the system prompt; on the other providers it comes before the first message. The preamble says:

- the chat's seat name and its side (`local` or `cloud`), and that other chats run beside it;
- that other seats can message it, and that it answers them by name with `peers`, `message`, `ask` and `peek`;
- to talk to a peer when the peer owns the thing it is about to guess at, and to report to the person otherwise;
- that the chat is named on its own, so it starts on the work at once and uses `rename` only when the subject turns;
- to call the `guide` tool for anything about the Hive itself before it reads the Hive's source or guesses.

It also gets the `hive` MCP server with the Hive's tools (peers, message, ask, peek, spawn, close, rename, guide and more; see the "tools" topic), and the hub's MCP servers (see the "mcp" topic). The first message is the mission. A TUI chat gets no preamble. An anonymous chat gets neither the preamble nor MCP servers.

A message from another chat arrives as a turn that starts with `[hive] message from seat <name> (<side>). Answer it by name with the hive tools — or say nothing to it if it does not need an answer.` A TUI chat gets it typed into its terminal as `[hive] from <name>: <text>`.

## Chats talking to each other: peers, message, ask, peek

These are tools of the `hive` MCP server. A seat is named whole or by an unambiguous prefix.

- **`peers`**: the other chats now, with name, place and what each works on.
- **`message`** (`seat`, `text`): sends a message. It lands in that chat as a turn and the person sees it. If the target is busy, it waits in the queue. The reply arrives later as a message.
- **`ask`** (`seat`, `question`, `timeout_seconds`): asks and waits for the answer. Default 180 seconds, 15 to 270. The answer comes back as the tool result and does not interrupt the conversation. With no answer in time, the tool returns. The answer arrives later as a normal message. A TUI chat cannot wait: its question goes as a message.
- **`peek`** (`seat`, `lines`): reads the last lines of a chat without writing to it. Default 30, 5 to 200.

How the answer hold works: while an `ask` waits, the asking chat holds the target's next message. The tool collects it within 30 seconds. If nobody collects it, it goes into the chat as a normal message.

## Opening chats from a chat: spawn, births, errand, ceiling

The `spawn` tool opens a chat with a mission. The new chat starts cold, so the mission must stand on its own. Its fields are `mission` (required), `name`, `title`, `errand`, `where` (`local` or `cloud`, default the caller's side), `repo` (for cloud chats), `model`, `agent`, `account` (local only), `ceiling` and `count`. Without `agent`, the child runs on the caller's provider.

- **Births**: a chat opens at most 3 chats per round. The budget comes back with the person's next message. A chat opened by a chat can open its own the same way. When it is spent: "this chat has opened 3 of 3 chats this round, and nothing was opened now".
- **Errand**: the person's request in their words, the same line on every chat opened for it. Without one, the child takes the errand of the chat that opened it. Errands live in `~/.hive/errands.json`, with the opener in `by`.
- **Ceiling**: what the child may do through the Hive's tools. `read` only looks (peers, peek, guide, screenshots). `operate` also messages, asks, browses and closes. `full` also spawns and publishes. The child gets the caller's ceiling or a narrower one, never a wider one. Ceilings live in `~/.hive/ceilings.json` (default `full`). A blocked tool says `this chat runs with a "read" ceiling, and spawn needs "full"`.

## Compaction and the context window

Compaction sums up a long conversation and carries on from the summary.

- **Ceiling**: the `autocompact` key in `~/.hive/config.jsonc`, or Settings, "The conversation", "sum up the conversation at". `auto` (empty) leaves it to the agent. `100k` to `1000k` sets your own ceiling. A chat takes a new ceiling when it comes back, not while it runs.
- **Which chats take it**: native chats on Claude, Codex, Kimi, Kiro, Cursor and OpenCode. Gemini and Antigravity compact by their own rules and post a warning. A TUI chat takes it only on Claude. On Kimi, Kiro and Cursor, if the summary is still above the ceiling, the chat says so and stops compacting on its own until it reopens.
- **By hand**: `/compact [focus]`, or "Compact conversation" in the context window. During a turn it waits as "queued", with "compact now, without waiting for the turn" and "do not compact".
- **Starting fresh**: `/fresh` starts the chat over in a new session instead of summing it up. It runs like a provider change to the same provider: "waiting for the current turn before starting fresh…", "saving the conversation for the fresh start…", "starting a new session…". The chat keeps its name, folder, model, effort and account. The chat says "started fresh", with the path of the saved conversation. Your next message carries an extract (the first request and the recent conversation) and the path of `conversation.md`, which the agent searches with `rg` when it needs more. If it fails, the old session comes back ("restoring the previous session…").
- **The chat sees how full it is**: the `contextUsage` key in `~/.hive/config.jsonc`, or Settings, "The conversation", "tell a Claude chat how full it is". Off by default. On, every Claude chat on this machine starts with `CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT=1` and reads `Token usage: <used>/<total>; <left> remaining`. The total is the ceiling minus what Claude keeps for the reply (200k gives 180000). A chat takes it when it comes back. Cloud chats do not take it. The setting is internal to Claude Code, so a CLI update can change it.
- **Context window**: the gauge in a native chat's composer opens "Context": "{used} of {max} used", split into "Conversation", "Setup", "Reserved", "Free" and "Outside the window". It turns hot at 90%. The chat details show "{pct} of {size} context" under "Last turn".

## Sleep and idle compaction on long silence

Both apply to native Claude chats only.

**Sleep**: an idle chat goes to sleep after 30 minutes while someone watches it, or after 15 minutes when nobody does. Asleep, it frees the agent and keeps its session. The next message wakes it on the same conversation. It never sleeps during a turn, with a queued message, an open question or a background task. Env vars: `HIVE_SLEEP_AFTER_MS` and `HIVE_SLEEP_UNWATCHED_MS` (`0` turns sleep off), and `HIVE_SLEEP_REBIRTH=0` keeps the same process while asleep.

**Idle compaction**: after an hour of silence, the prompt cache expires and the next message costs a full cache write. So the chat compacts a little before that, while the cache is still cheap. Rules:

- The conversation has at least 200k tokens (`HIVE_IDLE_COMPACT_MIN_TOKENS`) and uses the one-hour cache.
- It fires at 90% of the cache life after the last turn (54 minutes), or after `HIVE_IDLE_COMPACT_AFTER_MS`.
- It runs once per quiet stretch, and only if real work happened since the last compaction.
- A busy chat waits and tries again each minute, until the cache has gone cold.
- A sleeping chat wakes to compact and goes back to sleep.
- `HIVE_IDLE_COMPACT=0` turns it off.

## Moving a chat to another provider

A native chat can continue on another provider. Open the model picker and pick a model of another provider.

1. If the chat is working, it waits for the turn to end: "waiting for the current turn before changing providers…". Use "cancel provider change" to stop. After 10 minutes it gives up.
2. "preparing the conversation for {agent}…": the Hive stops the old driver and writes the history.
3. "connecting to {agent}…": the new provider starts in the same folder.
4. The chat says "continued with {agent} · {model}".

The new provider gets an extract: the first request, the recent conversation, and the path of the full saved history. Messages sent during the change are refused: "this chat is changing providers; send the message when it finishes". If the change fails, the Hive restores the old provider ("restoring the previous provider…") and offers "Try again". A Hive restart during a change also restores the old provider. The files are in `~/.hive/transfers/<name>/`: `current.json`, and per change `source.json`, `conversation.md` and `context.md`.

## Turns, checkpoints and file changes

**Turn checkpoints** are for local chats with a worktree (not the repo's main checkout).

- After each turn, the Hive saves a snapshot of the worktree as the git ref `refs/hive/checkpoints/<chat>/<n>`. The commits and branches stay as they are. The last 60 are kept. The first one is the baseline "start".
- In the Inbox layout, the chat's "Turns" section lists them with lines added and removed. "See what this turn changed" shows the diff.
- "Put the files back as they were here" restores a turn. What is there now is saved as a new turn, so you can come back. It is refused while the chat works: "the chat is working — stop it before going back".

**Chat details** (a chat open alone) show:

- "Where": repo, worktree or folder, and branch.
- "Changes · not committed": each file with its diff. "Accept" marks it reviewed ("only here, git does not change"). "Discard" puts the file back to the last commit; a new file is deleted. "Open in editor" opens the file.
- "Commits ahead of {base}", and "Last turn".

For a local chat, "Open in editor" uses the first editor found: cursor, code, windsurf, zed, then the system opener. For a cloud chat it uses the Hive's own editor, which saves the file on the server.

## Worktrees per chat

A local chat starts in the hub folder. To work on its own branch, it makes a git worktree (Claude's EnterWorktree, or `git worktree add`). A race tells each chat to do this. A cloud chat always opens in a worktree of its own (see "Which folder a chat opens in").

The Hive tracks the folders each chat works in and finds the worktrees in them. Closing a local chat removes its clean worktrees and asks about the others (see "Closing a chat"). The "Worktrees on this machine" panel lists every worktree. A worktree is idle after 1, 3, 6 or 24 hours. Sweeping deletes only the folder: "the branch and its commits stay where they are". A worktree with a chat in it, a file nobody committed, a commit nobody pushed or a lock is never swept.

## The terminal and shell lines

- **Shell line**: in a native chat, `!<command>` runs the line in the chat's folder. The output lands in the chat without going through the model. `!!<command>` runs it without keeping it in the chat's history. Limits: 4,000 characters, 120 seconds, 64 KB of output (the middle is cut).
- **Terminal seat**: the new-terminal key (see the "interface" topic) opens a plain shell in the hub folder, titled "Terminal". It closes when its shell ends ("the shell ended, so this seat closed").
- **TUI chat**: the tile is the real terminal of the provider's program. Seat menu items: "type in this session", "take the keyboard back", "kill session".
- **Driver output**: a native chat's driver runs in the chat's tmux window and prints one short line per event. To read it, run `tmux attach -t hive-local` and pick the window with the chat's name.

## When an account runs dry

If a provider refuses a turn because a limit is spent ("you've hit your … limit", "usage limit reached", "credit balance is too low"):

1. The Hive marks that login as spent for the whole machine, until its reset time (or 30 minutes if the message gives none).
2. The next login with room, in the provider's order, takes the turn over: "{gone} had no room left — {here} picked the turn up from here".
3. If every login is spent: "every login on this machine is out of room — {gone} comes back {when}". The chat plans to run the turn again at the earliest reset plus 30 seconds: "it picks the turn up again by itself at {when}".
4. When its own login has room again, the chat moves back to it: "{here} has room again, so this chat is back on it".

An expired login is read again once: "{gone} answered with an expired login — this chat reopened it and is trying once more". If it is still expired: "the login on {gone} expired — sign in again in Settings, then send the message again" (see the "providers" topic).

The spent list is `~/.hive/accounts/spent.json` for Claude and `~/.hive/providers/<provider>/spent.json` for the others. The login order is in `order.json` in the same folder.

## A chat that fails, stops answering or will not start

- **Will not start**: "{agent} closed the window as soon as it opened — the agent did not start: <last lines of its window>". A missing CLI says "<program> is not installed on this machine" (see the "providers" topic).
- **Turn error**: "what it left for you" in the seat menu shows the last turn. "the turn ended in an error", or "it stopped on {stop}, not on its own". Driver warnings and errors show as lines in the chat.
- **Stuck turn**: stop the turn (see the "interface" topic). A stop that waited more than 60 seconds is dropped: "press stop again if the turn still needs it".
- **The screen does not update**: "reconnect" in the seat menu connects the view to the chat again.
- **A crashed chat**: its window closes. Every 20 seconds the Hive brings back the local chats listed in `<hub>/.hive/fleet.json`, with their conversation. A chat that dies again within ten minutes of coming back goes to "Archived chats".
- **Lost conversation**: if the stored session id has no conversation, the chat says "there is no conversation stored under <id> to pick up, so this seat starts one".
- **Not recorded**: "the events file stopped taking writes — the transcript is no longer being recorded (<file>)". Fix the disk, then reopen the chat.
- **Restart by hand**: close the chat, then revive it from "Past sessions" or "Archived chats". The conversation comes back.

## Where a chat's files live on disk

`~/.hive` is `HIVE_HOME`. `<hub>` is the hub folder.

| Path | What it holds |
| --- | --- |
| `~/.hive/events/<name>.ndjson` | the event log: one JSON line per event, with `seq` and `ts` |
| `~/.hive/sessions/<name>.json` | session id, folder, model, effort, mode, title, account, births, sleep state |
| `~/.hive/sock/<name>.sock` | the native chat's control socket |
| `~/.hive/shots/<name>/` | images the chat received or produced |
| `~/.hive/transfers/<name>/` | provider changes and fresh starts |
| `~/.hive/drafts.json`, `errands.json`, `ceilings.json` | unsent text, errand labels, tool ceilings |
| `<hub>/.hive/prompts/<name>.md` | the first message of a local chat |
| `<hub>/.hive/fleet.json` | the chats the Hive brings back after a restart |
| `<hub>/.hive/archived-seats.json` | archived chats |
| `<hub>/.hive/titles.json` | chat titles |
| `~/.claude/projects/<folder>/<session-id>.jsonl` | the Claude transcript |
| `~/.hive/config.jsonc` | `autocompact`, `contextUsage`, `closeQuietAfterDays`, `pruneDiariesAfterDays` |

To watch a chat's events live, run `tail -f ~/.hive/events/<name>.ndjson`.

## In the code

- `server/seats.mjs`
- `server/sessions.mjs`
- `server/worktree.mjs`
- `server/idle-compact.mjs`
- `server/sleep.mjs`
- `server/provider-transfer.mjs`
- `server/shell-line.mjs`
- `server/terminal.mjs`
- `server/engine/protocol.mjs`
- `server/engine/seat-core.mjs`
- `server/engine/seat-command.mjs`
- `server/engine/driver.mjs`
- `server/engine/turn-driver.mjs`
- `server/engine/leftovers.mjs`
- `server/engine/failover.mjs`
- `server/engine/accounts.mjs`
- `server/engine/transfer-context.mjs`
- `server/peer/peer.mjs`
- `server/peer/peer-tools.mjs`
- `server/peer/ceilings.mjs`
- `app/routes/seats.mjs`
- `app/routes/archive.mjs`
- `app/routes/checkpoints.mjs`
- `app/routes/changes.mjs`
- `app/routes/drafts.mjs`
- `app/lib/naming.mjs`
- `app/lib/titling.mjs`
- `app/lib/quiet-seats.mjs`
- `app/lib/diary-prune.mjs`
- `app/lib/turn-checkpoints.mjs`
- `app/lib/fleet.mjs`
- `app/lib/race.mjs`
- `app/lib/errands.mjs`
- `app/lib/drafts.mjs`
- `app/lib/config.mjs`
- `app/src/app/draft-seat.js`
- `app/src/app/new-chat.js`
- `app/src/app/seat-menu.js`
- `app/src/app/context-window.js`
- `app/src/app/provider-transfer.js`
- `app/src/app/history.js`
- `app/src/app/archived.js`
- `app/src/app/seat-changes.js`
- `app/server.mjs`
