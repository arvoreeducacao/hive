# Interface and settings

Where things are on the Hive screen, every default key and how to rebind it, dictation, and every setting in the config file.

## The two looks: default and New Hive

The Hive has two looks, set by the `experience` setting.

- **Default look** (`"experience": "raycast"`, the default). It has the Settings window with a search field, the structures (see "Structures"), seat notice cards, rail search with `/`, and the "Raycast" palette as the default theme.
- **New Hive** (`"experience": "experimental"`). An experiment: charcoal surfaces, orange selection, square controls, sage message bubbles and pixel icons. It has its own rail (see "The rail"), no message bar, no structures, and Esc closes an open chat. Its Settings window has no search field, and themes open in their own window.

To switch, open Settings, go to the "Experiments" pane, and press "Try new Hive" or "Leave New Hive". The choice is saved for this installation and all its windows. It does not change anyone else's settings.

If New Hive fails, open the Hive with `?experience=raycast` in its address, or remove `experience` from the config file. The pane also has the link "Open Hive without New Hive". Recovery does not close any chat.

`experienceOff` turns off single behaviors: `resizeInfo` (the drag handles of an open chat), and in New Hive `imageZoom` (zoom tools in the picture preview) and `titleClick` (click a chat title to rename it). It has no UI.

## The screen at a glance

- **Top bar**: your face (click it to change it), the leader/hold indicator, the block chips, "waiting on you" (seats that need you; click goes to one), tasks, "plane", pull requests, the environment warning, "update ready", the search button (opens the palette), a clock and `⋯` ("everything else").
- **The `⋯` menu**: "dim the others", "message bar", "share my fleet", "my phone", "my other machines", "this machine", then "your day", "shelf", "memories", "tasks", "history", "usage", "routines", "who gets in", "workspace", "new terminal", "new terminal on the server", "providers and accounts", "themes" and "shortcuts and settings". In the default look a "structure" button sits just before "shortcuts and settings".
- **The status strip**: one environment line under the top bar. Toggle it with the `alerts` key or the palette row "hide the environment line".
- **The strip**: the block number, the block label ("what this block is about", click to rewrite), the seats, "plane", and the full-screen button. In the default look the strip sits inside the top bar.
- **The canvas**: the seats of the block you are on.
- **The message bar**: docked under the canvas. It messages the focused seat (see the "seats" topic). Toggle it with "message bar" in `⋯`. New Hive has none.
- **The footer**: the plan-limits chip (see the "providers" topic).
- **Settings**: open it with ⌘, (macOS) or Ctrl+, (Linux/Windows), or `⋯`, "shortcuts and settings". Its panes are "Keyboard", "Appearance" ("Look" in New Hive), "Performance", "Experiments", "Dictation", "Your character", "Notices", "The screen", "The conversation" and "Slack". In the default look, type in "Search a setting — theme, font, shortcut, sound…" to filter the panes, and ⌘K / Ctrl+K lists the pane's actions.

The app menu has "View" (zoom, reload, dev tools, full screen) and "Hive": "Bring to front", "Open in the browser", "Config file" (opens the config file), "Data folder", and "Quit" on Linux and Windows.

## The rail

The rail on the left lists every session. In the default look it groups seats by block, shows the key that jumps to each block and what each seat is doing, has a local/cloud filter at the top, and `/` searches it (↑ ↓ move, Enter opens, Esc closes the search). The team sits below your seats (see the "team-and-cloud" topic).

The rail button collapses and expands it ("collapse the sidebar" / "expand the sidebar"). The app window remembers this.

In New Hive the rail shows "New chat", "Groups" (your blocks with a dot per seat), "Shortcuts" ("Tasks" with the open count, "Shelf"), "Team", the worktree count, the environment health and "Collapse". Hovering an item shows a card with details. On first use it starts collapsed.

## Blocks, seats and workspaces

The screen works in blocks. A block holds 2 to 6 seats; the default is 4. A new chat takes a free seat in the block you are on; when the block is full, the next chat opens a new block. The Hive never moves a chat out of its block, except that a block that fits whole into the one before it joins it. A block you arranged by hand is never touched.

Blocks live in workspaces. A workspace is a subject with its own colour and as many blocks as it needs. A chat you open lands in the workspace you look at. Closing a workspace hands its blocks to the one before it and never closes a chat.

- To change the block size, open Settings, "The screen", and set "seats in a block" (`blockSize`).
- To see every workspace and block at once, open the floors with the `arrange` key or the workspace name at the top left. In the floors: ← → move between seats, Shift+↑ ↓ change floor, Space picks a seat up and drops it, Enter goes to it, Esc closes.
- The palette has "new workspace", "rename this workspace" and "close the workspace you are on".
- Drag a seat by its title onto another seat to swap them.
- Hold the modifier of the seat, block or workspace keys for one second to see their numbers on screen (only when there are two or more).

## Layouts, focus mode and full screen

To change how seats sit, open Settings, "The screen", "how the seats sit" (`layout`):

- "in a grid" (`grid`, default).
- "side by side, in one row" (`row`): the whole block in one row.
- "every chat in one strip, scrolling sideways" (`strip`).

On a narrow window, grid and row both settle into one column. Outside New Hive the status of a chat starts folded; the minus on the card brings it back.

**Focus mode** keeps the chat in focus in the middle and the rest of the block beside it. Turn it on with the palette row "focus mode" (it then reads "leave focus mode") or the `focusMode` key, which has no default. The app window remembers it. Structures, except Cockpit, pause in focus mode.

**Open a chat full screen** with the `fullscreen` key (⌘Enter on macOS, Ctrl+Enter on Linux/Windows); Esc leaves. Inside a message box the same keys stop the turn and send instead, so press it with the box out of focus. The full-screen button in the strip ("full screen — the chat alone on the screen") takes the whole monitor; Esc or "leave" exits.

**Resize an open chat**: drag the thin handle between its info side and the conversation (also the thread, pane and info height handles). Double-click restores the default. With the handle focused, the arrows move it 10 px and Shift+arrows 40 px. The sizes go to `infoWidth`, `threadWidth`, `paneWidth` and `infoHeight`.

**A chat in its own window**: the `detach` key (no default; leader chord `o`). Drag it out of that window to put it back in the grid.

## Structures (default look only)

A structure is the shape of the whole screen. Chats, focus and drafts stay where they are when it changes.

- To change it, open Settings, "Appearance", "structure"; or press "structure" in `⋯`; or use the palette rows "Structure: <name>".
- ⌥⌘S (macOS) or Ctrl+Alt+S (Linux/Windows) steps to the next one; add Shift to go back. This key cannot be rebound.
- After a change, a notice offers "Undo" (⌘Z / Ctrl+Z).

| `structure` | Name | What it is |
| --- | --- | --- |
| `classic` | Classic | the bar, the rail and the wall of seats (default) |
| `launcher` | Launcher | one centred window where everything starts by typing |
| `inbox` | Inbox | every seat is a row in a queue ordered by who needs you, one conversation at a time |
| `atmosphere` | Atmosphere | seats as glass windows over a full-screen atmosphere |
| `cockpit` | Cockpit | a tmux-style grid of panes, six seats in view, a status line at the foot |
| `stage` | Stage | one seat on stage, the others as live thumbnails |
| `map` | Map | the fleet on one field, grouped by project |
| `ember` | Ember | one seat as a reading page, the rest as cards queued by urgency |
| `island` | Island | one conversation; the fleet fits in a pill at the top |

If a structure fails to start, the classic one stands in and the top bar says so.

**Inbox keys** (outside a text field): j/↓ and k/↑ move, `/` searches, Enter goes to the reply box, `e` archives, `s` settles or unsettles, `p` pins, `u` marks unread. ⌘1–9 (Ctrl+1–9) jumps to a row, ⌘⇧T (Ctrl+Shift+T) reopens the last one closed, and ⌘Enter (Ctrl+Enter) in the reply box sends and moves on. Pins, snoozes and marks are kept in `~/.hive/inbox-marks.json`.

**Cockpit keys** come after the leader key, so turn the leader on first. `s` opens the seat layer (`n` new chat, `t` terminal, `r` rename, `a` archive, `k` kill, `d` a window of its own). `w` opens the window layer (`2` split below, `3` split right, `0` close this window, `1` only this window, `o` the other window, `=` same sizes). `g` is PRs, `z` zooms in and back, `/` searches every seat, `?` is help. Esc or Ctrl+G quits a key chain.

## The plane

The plane puts every seat on one field that you arrange yourself. Toggle it with the `plane` key (⌥L on macOS, Ctrl+Shift+L on Linux/Windows; leader `y`) or the "plane" button.

- The bar at the bottom has −, +, "fit", "tidy", "+ area", "+ note" and "undo".
- ⌘ or Ctrl plus the wheel zooms; ⌘Z / Ctrl+Z undoes, with Shift it redoes.
- Backspace or Delete removes what is picked. In the default look, Esc leaves the plane.
- Positions, areas and notes are kept by the app window, not in the config file.

## The command palette

Open it with the `palette` key (⌘K on macOS, Ctrl+Shift+K on Linux/Windows; leader Space) or the search button. It searches sessions ("go to"), blocks, workspaces, pull requests, archived chats and actions. The actions include new chat, terminals, dim, focus mode, the message bar, every panel, notices, rename, reconnect, themes, structures, language and the little you.

- ↑ ↓ move, Enter runs, Shift+Enter opens beside, Esc closes.
- The `openFile` key (⌘P / Ctrl+Shift+P) opens it in file mode, and `searchCode` (⌘⇧F / Ctrl+Shift+F) in code search. Tab switches between the two; Esc goes back.
- In the default look, pressing the palette key again opens the actions of the selected row.

## Notices, chimes and the HUD

Settings, "Notices", has three moments:

- "when a seat needs you": a sound and a switch (`sound`, off by default; key `sound`, ⌥V on macOS, Ctrl+M on Linux/Windows).
- "when a seat answers": a desktop notice plus a sound (`answered`, off by default; key `answered`, ⌥⇧V / Ctrl+Shift+V). Turning it on asks the system for notification permission.
- "when someone asks for a keyboard": always on, always the "nudge" sound, and the window shakes. "the team can knock" (`knocks`) decides whether the team can reach you at all (see the "team-and-cloud" topic).

Each sound list has a play button. "how loud" (`volume`, 0 to 100, default 70, 0 is mute) sets the level. Desktop notices go out silent; the Hive plays its own sound.

The sounds are `chime` (needs-you default), `settle` (answered default), `coin`, `power-up`, `ladder`, `blip`, `bubble`, `marimba`, `doorbell`, `pulse` and `nudge`.

In the default look a seat that needs you also pins a card in the corner with "Answer" and "Later"; an answered card ("Open") goes after 14 seconds. The `calls` key (⌥P on macOS, Ctrl+P on Linux/Windows) opens the newest card or jumps to the next seat that needs you. A card also appears when a seat starts testing in the browser, with "see it beside", which opens the seat's browser cockpit.

**The HUD** is the short message at the bottom after an action, such as "Copied" or a change with "Undo". ⌘Z / Ctrl+Z runs its Undo, F6 focuses its button, Esc closes it when focused. Pointing at it keeps it on screen.

## Who owns the keyboard

By default the keyboard belongs to the Hive, so shortcuts work. To type in a seat, click inside it or press Enter (`type`) on the focused seat; the tile turns blue and the top bar says so. To take the keyboard back, click outside or press `release` (⌘Esc on macOS, Ctrl+. on Linux/Windows).

While you type in a seat, only these still work: `release`, `copy` with a selection, `talk`, the leader key, the palette, file and code search, and focus moves, scroll and full screen when bound with a modifier. A shortcut without Ctrl, Alt or ⌘ works only while the keyboard belongs to the Hive.

`"move": "type"` in `keys` hands the keyboard to the seat each time a focus key moves to it.

## Default shortcuts

On macOS ⌘ is Command, ⌥ Option, ⌃ Control. "Leader" is the key after the leader (see the next section); a dash means none.

| Action (`keys` name) | macOS | Linux / Windows | Leader |
| --- | --- | --- | --- |
| new chat (`new`) | ⌘N | Ctrl+N | n |
| new terminal (`term`) | ⌘T | Ctrl+T | t |
| next that needs you (`calls`) | ⌥P | Ctrl+P | p |
| PR panel (`prs`) | ⌘G | Ctrl+G | g |
| Slack thread of the chat (`threads`) | ⌘S | Ctrl+S | s |
| providers and accounts (`accounts`) | ⌥A | Ctrl+Shift+A | a |
| usage (`usage`) | ⌘U | Ctrl+U | u |
| routines (`routines`) | ⌥I | Alt+I | i |
| shelf (`shelf`) | ⌥E | Ctrl+Shift+E | e |
| memories (`memories`) | ⌥⇧M | Ctrl+Alt+M | shift+m |
| your day (`day`) | ⌥D | Ctrl+Shift+Y | d |
| tasks (`tasks`) | ⌥F | Ctrl+Alt+F | shift+f |
| past sessions (`history`) | ⌥H | Ctrl+H | h |
| environment alerts (`alerts`) | ⌥W | Ctrl+W | w |
| kill the chat (`kill`) | ⌥⇧W | Ctrl+Shift+W | x |
| seat 1…N (`seat`) | ⌘1…N | Ctrl+1…N | 1…N |
| block 1…9 (`block`) | ⌥1…9 | Alt+1…9 | — |
| workspace 1…9 (`space`) | ⌘⌥1…9 | Ctrl+Alt+1…9 | — |
| the floors (`arrange`) | ⌘⌥0 | Ctrl+Alt+0 | l |
| previous / next block (`prevBlock`, `nextBlock`) | ⌘[ / ⌘] | Ctrl+[ / Ctrl+] | [ / ] |
| full screen (`fullscreen`) | ⌘Enter | Ctrl+Enter | f |
| type in the seat (`type`) | Enter | Enter | enter |
| release the keyboard (`release`) | ⌘Esc | Ctrl+. | — |
| reconnect (`reconnect`) | ⌥R | Ctrl+E | r |
| needs-you chime (`sound`) | ⌥V | Ctrl+M | v |
| answered notice (`answered`) | ⌥⇧V | Ctrl+Shift+V | j |
| copy terminal selection (`copy`) | ⌥C | Ctrl+Shift+C | c |
| shortcuts and settings (`help`) | ⌘, | Ctrl+, | , |
| palette (`palette`) | ⌘K | Ctrl+Shift+K | space |
| open a file (`openFile`) | ⌘P | Ctrl+Shift+P | — |
| search code (`searchCode`) | ⌘⇧F | Ctrl+Shift+F | — |
| write in the message bar (`compose`) | ⌥M | Ctrl+Shift+M | m |
| talk (`talk`) | ⌘D | Ctrl+Shift+Space | — |
| dim the others (`dim`) | ⌥Q | Ctrl+Shift+D | q |
| message bar (`bar`) | ⌘B | Ctrl+Shift+B | b |
| the plane (`plane`) | ⌥L | Ctrl+Shift+L | y |

No direct key by default, leader chord in brackets: `detach` (o), `rename` (shift+r), `worktrees` (k), `themes` (shift+t), `doctor` (shift+d), `extensions` (shift+e), `focusLeft`/`focusRight`/`focusUp`/`focusDown` (arrows), `sendPrevBlock` (shift+[), `sendNextBlock` (shift+]), `sendBlock` (alt+1…9). With neither: `archive`, `focusMode`, `moveLeft`/`moveRight`/`moveUp`/`moveDown`, `scrollUp`, `scrollDown`.

Keys you cannot change: ⌘V / Ctrl+V pastes a screenshot into the focused session; Shift+Enter breaks a line; drop a file on a session or the new-chat box; drag a seat title to swap seats; Esc leaves full screen. While the keyboard belongs to the Hive, Ctrl+C on a focused native chat with nothing selected stops its turn.

## The leader key and its layers

The leader key is one prefix, then one key, tmux style. It is off by default; its default key is Ctrl+B. It works even while you type in a terminal.

- To turn it on, open Settings, "Keyboard", and press "turn the leader key on". Click the key shown to press a new one; it needs Ctrl, Alt or ⌘.
- After the leader, a band lists what each next key does; a `+` marks a layer. Esc gives up. Pressing the leader twice sends it to the terminal.
- "turn them off" stops the direct shortcuts that a terminal could also read (Ctrl or ⌥ combinations, not ⌘) for every action that has a leader chord, so those combinations reach the agent. "bring them back" undoes it. In the file this is `"direct": "off"`.

A chord can be a sequence. `"leader.new": "s n"` makes `s` a layer and `n` inside it runs new chat. A default chord on that first key steps aside; two sequences you wrote yourself that collide are reported, not settled for you.

## Rebinding keys

**In the app**: open Settings, "Keyboard", press "show them all", and filter with "find an action…". Click a shortcut (or its leader column), press the new combination, Esc cancels. Taking a key another action holds by default removes it from that action; a key you set yourself for another action is not taken. "restore default shortcuts" resets every key and turns the leader off. The app writes only what differs from the defaults into `keys`.

**In the file**: `keys` is an object of action name to key.

```jsonc
"keys": {
  "leader": "on",
  "direct": "off",
  "move": "type",
  "palette": "ctrl+space",
  "dim": "off",
  "seat": "alt+digit",
  "leader.new": "s n"
}
```

- `leader`: `"on"` (Ctrl+B), a key with ctrl, alt or meta, or `"off"`.
- `direct`: `"keep"` (default) or `"off"`. `move`: `"navigate"` (default) or `"type"`.
- `<action>`: a direct key. `leader.<action>`: the key or sequence after the leader.
- `off`, `none`, `no` or `-` unbinds.
- Syntax: modifiers joined by `+` (`ctrl`/`control`, `alt`/`option`/`opt`, `shift`, `meta`/`cmd`/`command`/`super`/`win`), then a letter, digit, `f1`–`f24`, `enter`, `esc`, `space`, `tab`, `backspace`, `up`, `down`, `left`, `right`, the symbols `` / \ [ ] , . ; ' ` - = ``, `pageup`, `home`, `numpad0`–`numpad9`, and so on.
- `seat`, `block`, `space` and `sendBlock` take `digit` as the key (they cover 1…9).
- A key you write for one action is taken away from an action that only had it by default. A key or chord the app cannot read is skipped and the default stays.

If the config has no `keys`, the Hive reads the old `~/.hive/keybindings.jsonc` (or `HIVE_KEYBINDINGS`). The first save from the app moves it to `keybindings.jsonc.migrated`.

## Dictation (speech to text)

Dictation turns speech into text in the composer. The model runs on this machine; sound never leaves it. Nothing downloads until you ask.

1. Open Settings, "Dictation", and turn on "talk instead of typing" (`stt`).
2. Pick "the model that listens" (`sttModel`): `whisper-medium` (Whisper Medium Q8_0, about 793 MB, default, detects the language) or `parakeet-v3` (Parakeet TDT 0.6B v3 Q8_0, about 705 MB, no language detection).
3. Press "download the model". It also fetches a small engine. "stop the download" stops it; "delete it from this machine" removes it. If the same model is already in the Hugging Face cache (`~/.cache/huggingface/hub` or `$HF_HOME/hub`), the button reads "set dictation up" and the model is not downloaded again.
4. Pick "the microphone dictation listens to" (`sttMic`, empty is the system default) and "the language you talk in" (`sttLanguage`: empty to work it out, or `pt`, `en`, `es`, `fr`, `de`, `it`). With Parakeet, empty means the app language.

To talk, press the microphone button in a composer, or hold the `talk` key (⌘D on macOS, Ctrl+Shift+Space on Linux/Windows) and let go to transcribe. A tap shorter than 0.4 s keeps it listening until you press again. Esc cancels. The system must allow the Hive to use the microphone.

Files live in `~/.hive/stt/`. Dictation runs on macOS (Apple silicon and Intel), Linux (x64, arm64) and Windows (x64). When the Hive app server itself runs on the cloud server, dictation is not available there; turn it on in the Hive on your machine.

## Themes

A theme paints the whole app and every terminal. The choice is `theme` (a name); your own palettes are `themes`.

- **Default look**: open Settings, "Appearance". Pick a theme from the list and press "Wear" (Enter). "Share" (⌘⇧C / Ctrl+Shift+C) copies it as JSON, "Paste a theme" (⌘V / Ctrl+V) takes one in, "New theme from this one" (⌥N / Alt+N) opens the editor, and your own themes have "Edit" and "Delete". ⌘K / Ctrl+K lists the actions.
- **New Hive**: open `⋯`, "themes". Click a theme to wear it; "share", "new theme from this one" and "paste a theme" are below.
- The editor has "name", "The app" and "The terminal" colours; changes show live. "save theme" keeps it; "cancel (esc)" restores.

There are nine built-in themes, among them Hive (default), Solarized Light, Tokyo Night, Gruvbox Dark, Nord, Dracula and Rosé Pine. The default look adds "Hive Classic" (the older Hive palette) and shows Hive as "Raycast". The `themes` key (no direct default; leader shift+t) opens them.

A shared theme is JSON: `{ "hive-theme": 1, "name": "…", "ui": { … }, "terminal": { … } }`. In `themes`, each name (up to 60 characters, up to 40 themes) maps to `ui` and `terminal` colours as hex (`#RGB`, `#RRGGBB` or `#RRGGBBAA`). `ui` keys: `bg`, `panel`, `panel2`, `panel3`, `well`, `line`, `line2`, `line3`, `txt`, `txt2`, `txt3`, `accent`, `accentD`, `accentHi`, `accentBg`, `green`, `yellow`, `blue`, `violet`. `terminal` keys: `background`, `foreground`, `cursor`, `selectionBackground` and the 16 ANSI names (`black` … `brightWhite`).

## Fonts, language, performance and dim

Settings, "Appearance" ("Look" in New Hive), holds `font`; leave a field empty for the default.

- "interface font" (`font.sans`) and "monospace and terminal font" (`font.mono`): font stacks. The default look uses Inter and Geist Mono while these are at their defaults.
- "terminal size" (`font.terminalSize`, 8–32, default 12).
- "chat line height" (`font.chatLineHeight`, 1–2.5, default 1.55) and "chat spacing" (`font.chatSpacing`, 0–40 px, default 10).
- "language" (`language`): `en` (default) or `pt-BR`. It is the language of menus, notices and empty screens. The palette also lists both.
- "look" (`look`): "classic, as it was" (`classic`, default) or "dimension, the new one" (`dimension`). It changes the fallback fonts and, on macOS, where the window buttons sit.

Settings, "Performance", "how the screen is drawn" (`visual`): `lean` (default: nothing moves, no blur) or `full` (motion and blur, which cost memory and battery). Motion pauses when nobody looks at the window, and the system's reduced-motion setting also counts.

"dim the others" in `⋯` (`dim`, on by default; key `dim`) fades the other seats while the keyboard is in one.

## Your character: face, the little you, the eyes

Settings, "Your character", or a click on your face in the title bar.

- Your face (`avatar`) is a body, a screen and a colour; the body and colour are yours alone on the team. "another" rolls a new one; "take it all off" removes what it wears (`wear`). On first run the Hive asks once: "Pick the face the team will know you by", then "This one is me".
- "the little you in the corner" (`pet`): "the little you" (`blob`) or "none, thanks" (`off`, default). It lives at the foot of the rail.
- "the face in the title bar" (`brandFace`): "always", "not when the rail wears it" (`auto`, default: hidden while the little you is on) or "never".
- "its eyes follow the cursor" (`gaze`): "no, let it be" (`off`), "inside this window" (`window`) or "anywhere on the screen" (`screen`, default). It needs the little you on, and stops while the Hive is minimised or hidden.

## Zoom

Use the "View" menu, which acts on the focused window:

- "Actual Size": ⌘0 / Ctrl+0.
- "Zoom In": ⌘+ or ⌘= / Ctrl++ or Ctrl+=.
- "Zoom Out": ⌘- / Ctrl+-.

Each step is half a zoom level, from −3 to +4.

## The tour, setup and "what's new"

- **Setup and tour**: open Settings and press "setup and tour" ("Setup and tour" in the default look). The tour points at the rail, blocks, new chat, the next seat that needs you, the keyboard owner, PRs and settings. Enter or → goes on, ← goes back, Esc ends.
- **What's new**: after an update with release notes, a card lists what changed. Enter or Esc closes it.
- **Updates**: "update ready" in the top bar opens the notes, with "Update and restart" (or "Update") and "not now".

## The settings file

All settings live in `~/.hive/config.jsonc` (`$HIVE_HOME/config.jsonc` when `HIVE_HOME` is set, or the path in `HIVE_CONFIG`). The menu "Hive", "Config file" opens it.

- It is JSON with comments. A save from the app keeps your comments and formatting.
- The app follows the file while it runs; edit it by hand and the screen changes.
- A value that fails its check is ignored and its default is used; the reason shows at the top of the "Appearance" ("Look") pane. A save from the app with a bad value is refused whole.
- Some view state is kept by the app window, not the file: focus mode, the plane, the collapsed rail and folded cards.

## Settings reference: screen and look

| Key | Values (default) | UI |
| --- | --- | --- |
| `experience` | `raycast`, `experimental` (`raycast`) | Experiments, "Try new Hive" |
| `experienceOff` | list of `resizeInfo`, `imageZoom`, `titleClick` (`[]`) | none |
| `look` | `classic`, `dimension` (`classic`) | Appearance, "look" |
| `structure` | see "Structures" (`classic`) | Appearance, "structure" (default look) |
| `layout` | `grid`, `row`, `strip` (`grid`) | The screen, "how the seats sit" |
| `blockSize` | 2–6 (4) | The screen, "seats in a block" |
| `theme` | a theme name (`""` = Hive) | Appearance or Themes |
| `themes` | name → `{ ui, terminal }` (`{}`) | the theme editor |
| `font` | `sans`, `mono`, `terminalSize`, `chatLineHeight`, `chatSpacing` | Appearance fields |
| `language` | `en`, `pt-BR` (`en`) | Appearance, "language" |
| `visual` | `lean`, `full` (`lean`) | Performance |
| `dim` | true/false (true) | `⋯`, "dim the others" |
| `composer` | true/false (true) | `⋯`, "message bar" |
| `terminal` | `ghostty`, `xterm` (`ghostty`) | none; the engine that draws terminal seats |
| `infoWidth` | 240–1200 px (380) | drag the open chat's side handle |
| `infoHeight` | `null` or 60–2000 px (`null`) | drag the height handle |
| `threadWidth` | 240–1200 px (392) | drag the thread handle |
| `paneWidth` | `null` or 320–2400 px (`null`) | drag the pane handle |
| `splitsLearned` | true/false (false) | set after your first resize |

## Settings reference: notices, keys, character, dictation, updates

| Key | Values (default) | UI |
| --- | --- | --- |
| `sound` | true/false (false) | Notices, "when a seat needs you" |
| `answered` | true/false (false) | Notices, "when a seat answers" |
| `sounds` | `needs`, `answered`, `asked` → sound name (chime, settle, nudge) | Notices sound lists; `asked` always plays nudge |
| `volume` | 0–100 (70) | Notices, "how loud" |
| `keys` | see "Rebinding keys" (`{}`) | Keyboard |
| `avatar` | `body/screen/colour` or `blobatar` (from your name) | Your character |
| `wear` | `"glasses:round hat:cap"` (`""`) | Your character |
| `pet` | `blob`, `off` (`off`) | Your character |
| `brandFace` | `always`, `auto`, `never` (`auto`) | Your character |
| `gaze` | `off`, `window`, `screen` (`screen`) | Your character |
| `stt` | true/false (false) | Dictation switch |
| `sttModel` | `whisper-medium`, `parakeet-v3` (`whisper-medium`) | Dictation, model |
| `sttLanguage` | `""` or a 2–3 letter code (`""`) | Dictation, language |
| `sttMic` | a microphone id, `""` = system default | Dictation, microphone |

`avatar` bodies: `ball`, `tall`, `wide`, `triangle`, `capsule`, `tv`, `crawler`, `cocoon`, `bee`; screen: `dark`; colours: `red`, `orange`, `amber`, `green`, `turquoise`, `blue`, `purple`, `pink`. `wear` slots: `glasses` (`round`, `square`), `hat` (`cap`, `beanie`, `bucket`, `headband`, `tophat`, `crown`, `party`, `wizard`, `fedora`, `cowboy`), `extra` (`bowtie`, `bow`, `scarf`, `tie`, `moustache`).

## Settings reference: keys covered in other topics

| Key | Values (default) | UI | Topic |
| --- | --- | --- | --- |
| `autocompact` | `auto` or `100k`–`1000k` (`auto`) | The conversation, "sum up the conversation at" | "seats" |
| `closeQuietAfterDays` | 0 (never) or 1–90 (2) | The conversation, "close a chat after it sits quiet for" | "seats" |
| `pruneDiariesAfterDays` | 0 (never) or 1–365 (30) | The conversation, "clear a closed chat's screen history after" | "seats" |
| `share` | true/false (true) | `⋯`, "share my fleet" | "team-and-cloud" |
| `knocks` | true/false (true) | Notices, "the team can knock" | "team-and-cloud" |
| `phone` | true/false (false) | `⋯`, "my phone" | "team-and-cloud" |
| `machines` | true/false (false) | `⋯`, "my other machines" | "team-and-cloud" |
| `machine` | up to 32 characters (`""` = the computer's name) | `⋯`, "this machine" | "team-and-cloud" |
| `shelf` | https URL of a private GitHub repo (`""`) | none | "team-and-cloud" |
| `providers` | agent → `{ enabled, name, color, binary, args, env }` | providers and accounts | "providers" |
| `extensions` | name → `{ enabled, settings }` | extensions | "extensions" |

The Settings "Slack" pane connects this Hive to a Slack bot (see the "team-and-cloud" topic).

## In the code

- `app/lib/config.mjs`
- `app/server.mjs`
- `app/routes/config.mjs`
- `app/app.html`
- `app/src/app/core.js`
- `app/src/app/shared.js`
- `app/src/app/brand-face.js`
- `app/src/app/leader-key.js`
- `app/src/app/hold-numbers.js`
- `app/src/app/themes.js`
- `app/src/app/preferences.js`
- `app/src/app/palette.js`
- `app/src/app/seat-layout.js`
- `app/src/app/structure.js`
- `app/src/structures/index.js`
- `app/src/app/experience-controller.js`
- `app/src/app/experience-behaviors.js`
- `app/src/app/next-rail.js`
- `app/src/app/plane.js`
- `app/src/app/chimes-and-notices.js`
- `app/src/app/hud.js`
- `app/src/app/tour.js`
- `app/src/app/whats-new.js`
- `app/src/app/stt.js`
- `app/src/app/stt-prefs.js`
- `app/lib/stt-download.mjs`
- `app/routes/stt.mjs`
- `app/main/zoom.js`
- `app/assets/themes.mjs`
- `app/assets/avatar/avatar.mjs`
- `app/assets/i18n.mjs`
