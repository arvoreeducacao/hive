# Working tools

The seat's browser and phone, tasks, routines, secrets, PRs and the other working tools of a chat and a person, with needs and limits.

## Who may call these tools

Every tool in this topic is a tool of the `hive` MCP server that each seat gets. Each tool needs a ceiling, and a chat only sees the tools its ceiling allows (see the "seats" topic for how a ceiling is set).

- `read`: `browser_screenshot`, `browser_snapshot`, `browser_cookies`, `browser_console`, `browser_network`, `device_screenshot`, `device_tree`, `device_logs`, `html_preview`, `html_render`, `pull_request_read`, `pull_request_list`, `ci_logs`.
- `operate`: everything that acts: `browser_navigate`, `browser_profile`, `browser_resize`, `browser_eval`, `browser_click`, `browser_hover`, `browser_type`, `browser_select_option`, `browser_press_key`, `browser_wait_for`, `browser_tabs`, `browser_back`, `browser_forward`, `browser_reload`, `browser_upload`, all other `device_*` tools, `park`, `task`, `buzz`, `reply_on_slack`, `ask_person`, `request_secret`, `pull_request_create`, `pull_request_update`, `pull_request_respond`, `ci_rerun`.
- `full`: `browser_set_cookie`, `pull_request_merge` and `theme_set` (plus `spawn` and `publish`). `theme_read` needs only `read`.

A call above the ceiling fails with "this chat runs with a "<ceiling>" ceiling". The browser, device, task, secret, buzz, Slack and pull request tools also need a chat with a seat name; an agent outside the Hive (a plain terminal) gets an error that it has no seat. They talk to the Hive app on the same machine, so the app must be open there: otherwise the error is "no hive answering on this machine".

## The seat's browser: what it is

Each seat has its own browser inside the Hive app, shown in the browser pane of its card.

- The seat drives its own tab. `browser_navigate` loads the page whether or not the pane is open, and never takes over the tab the person is reading. Navigating again reuses the same tab.
- A seat has at most 5 web tabs. `browser_tabs` lists, opens, selects and closes them.
- An address like `localhost:3000` becomes `http://localhost:3000`; a bare host becomes `https://`. A shelf address opens the shelf page itself, with its tab rail (see the "team-and-cloud" topic).
- The pages live in the Hive desktop window. The pane does not have to be open, but the app must run. A Hive opened outside the desktop app has no browser pane ("driving a page needs the desktop app").
- A page that is off screen and untouched for 30 minutes is unloaded, and the card chip says "asleep". The next browser tool loads it again (a reload).

How it differs from the person's own browser:

- A file the page downloads is saved in the person's Downloads folder, with " (2)" added when the name is taken.
- It has its own persistent cookie and storage area, shared by the tabs of every seat in this app and kept across restarts. It never carries the person's personal logins from their normal browser.
- Page requests for camera, microphone, location, notifications and other permissions are refused.
- A popup that opens a new window (a sign-in popup, for example) shows as an overlay over the Hive window; Escape closes it. A link that opens a new tab opens a new tab in the pane.
- Passkeys: on a Mac, a passkey request from an https page is passed to an installed Google Chrome or Microsoft Edge, where the person approves it (up to 3 minutes). With neither installed, or on Linux and Windows, there is no passkey bridge.

## Browser tools for a chat

All of these act on the tab the seat drives. Navigate first: with no page, the error is "this seat has no page open — browser_navigate first".

- `browser_navigate(url)`: open a page in the seat's own tab.
- `browser_screenshot()`: an image of the page. The pane does not have to be open.
- `browser_snapshot()`: the page as a list of elements (role, name, value, state), each with a ref like `e12`. Use it to find fields and buttons. Refs go stale when the page redraws; take a new snapshot. A clickable card or row also shows the buttons and fields inside it, without repeating its text.
- `browser_click(ref)` or `browser_click(x, y)`: a real mouse click at the element's place, not a JavaScript call. x and y are pixels of the last `browser_screenshot`, for what is on the screen but not in the snapshot.
- `browser_hover(ref)` or `browser_hover(x, y)`: rest the mouse there without clicking, for buttons a page only shows under the mouse. Take the snapshot again after.
- `browser_type(ref, text, submit?)`: click the field, replace its content and type, with a key press, the letter and the key release for each character, so search fields that react to the keyboard open their list; `submit:true` presses Enter. Up to 4000 characters.
- `browser_select_option(ref, option)`: pick a dropdown option by its visible text; the error lists the options there are.
- `browser_press_key(key)`: Enter, Tab, Escape, Backspace, Delete, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageUp, PageDown, Home, End.
- `browser_wait_for(text, gone?, seconds?)`: wait for a text to show (or to go with `gone:true`), 1 to 60 seconds, default 10.
- `browser_back`, `browser_forward`, `browser_reload`: step in the tab's history or reload.
- `browser_tabs(act, url?, index?)`: `list` marks "← yours" and "← the person is looking at this one"; `open` adds a tab; `select` moves the tools to another tab without moving what the person sees; `close` ends one. If the person closes the seat's tab, the next tool says so.
- `browser_eval(code)`: run JavaScript in the page; the last expression comes back JSON-encoded. It can replay an API call with the page's cookies. On a page whose security policy forbids `eval` (Slack, for example), the code still runs, and the value must be plain data such as text, numbers or objects of them.
- `browser_resize(width, height, mobile?, reset?)`: emulate a viewport, 200 to 3840 CSS pixels each way (for example 390 phone, 834 tablet, 1440 desktop). `mobile:true` adds touch and a mobile layout; `reset:true` goes back to the window size.
- `browser_network(about?, failed_only?)`: the calls the page made, newest last: status or failure, method, URL, kind, time, size. It keeps the last 300 calls of the tab and starts again on each new page load.
- `browser_console()`: the last 200 console messages (level, text, source and line) of the tab in front in the pane. The list clears when a page starts loading.
- `browser_upload(ref, files)`: give up to 5 files, by full path, to a file field. Each file must be 25 MB or less. Paths that look like secrets are refused: anything under `.ssh`, `.aws`, `.gnupg`, `.hive`, `.config/gh` or an agent's config folder (`.claude`, `.codex`, `.kimi`, `.kiro`, `.cursor`, `.gemini`, `.opencode` and similar), `.env` files, names with "credentials", and `.pem`, `.key`, `.p12`, `.pfx`, `.keychain`, `.kdbx` files.
- `browser_cookies()`: the cookies of the page's origin: name, HttpOnly flag and a masked hint of the value, never the value.
- `browser_set_cookie(name, value)`: needs the `full` ceiling. Ask the person first and call it only after a yes. The name is letters, digits, `_` or `-`; the value is up to 4096 characters. The cookie is not HttpOnly, and it is Secure on https pages. For a test-user login, use `browser_profile` instead.

Timeouts: a screenshot, eval, cookie, profile, viewport or console call gives up after 12 seconds; snapshot, click, type, key, select, tabs, upload and network after 20 seconds; back, forward and reload after 30 seconds. The error names the call that timed out; the 12-second ones suggest opening the browser pane on that seat and trying again.

## Logging the browser in as a test user

`browser_profile(profile)` logs the seat's browser in as a test user, without the token ever passing through the chat.

- The profiles and the `.env` key each one reads:
  - `teacher`: `DESIGN_REVIEW_TOKEN`
  - `principal`: `DESIGN_REVIEW_TOKEN_PRINCIPAL`
  - `teacher2`: `DESIGN_REVIEW_TOKEN_TEACHER2`
  - `student`: `DESIGN_REVIEW_TOKEN_STUDENT`
- The keys are read from the `.env` file in the hub folder, the folder the app knows as `HIVE_HUB` (see the "hub" topic). `KEY=value`, `export KEY=value` and quoted values all work.
- The Hive writes the token as an HttpOnly cookie named `access_token` on the origin of the page the seat has open (Secure on https), then reloads the tab. So it only logs in to an app that reads an `access_token` cookie.
- Navigate to the app first. With no http or https page open, the error is "no page origin to set the cookie on".
- All seats share one cookie store, so the login holds for every seat's tabs on that origin.
- Errors name what is missing: "<KEY> is not in the hub .env", "<KEY> is empty in the hub .env", or "the hub path is not set, so there is no .env to read the token from".

## What the person sees and does in the browser pane

- Open it from the seat's menu with "open the browser here", or click the page chip on the card ("the page this seat has open — open the pane to watch it"). The chip shows the host, "asleep" or the tab count.
- The pane shows the seat's tabs, an address field ("address — localhost:3000 or any page"), back, forward and "reload this page".
- While the seat acts on the tab the person is looking at, the page shows "the AI is using this page".
- The camera button ("send a screenshot of this screen to the chat") attaches a picture of the page and its address to the chat's message box.
- "review" ("ask the AI to review this screen") puts a review request into the message box: the screen at widths 390 and 1440, against Nielsen's 10 heuristics, plus a copy check.
- "reference" ("point at an element to talk about it right there") lets the person click one element. A small card takes a comment, and the chat gets the element's selector, text, main styles and a cropped picture. Escape cancels.
- Selecting text on the page shows a "quote" button that adds the quote to the message box.
- The first "browser" button opens the page in the person's default browser.
- The close button only hides the pane: "the pages stay open and the seat keeps using them".
- On a shelf page, the pane adds "copy link" and "ask for a change" (see the "team-and-cloud" topic).

## Canopy: browser tabs driven outside the Hive

Canopy is a separate browser-automation tool with a local daemon and a cockpit page. The Hive does not start it or drive it; it only watches it and shows its tabs on the seats' cards.

- The Hive reads the daemon at `CANOPY_URL`, or at 127.0.0.1 on `CANOPY_PORT` (default 4664). It sends the bearer token from `~/.canopy/token`.
- It polls every 5 seconds while a seat has Canopy tabs and every 20 seconds otherwise. After 3 failed polls it treats Canopy as down, and the menu says "canopy is not running".
- Canopy tabs belong to a seat when their Canopy session label is the seat's name. The card then shows a chip with the tab count and a small picture of the newest tab.
- When a seat opens its first Canopy tab, a notice says "<seat> is testing in the browser", with "see it beside".
- The seat menu item "its browser cockpit" opens the Canopy cockpit for that seat in a pane ("browser cockpit"); its "browser" button opens the cockpit in the person's default browser.
- When the person takes over one of the seat's tabs in Canopy, the Hive tells the seat to wait until the tab is handed back. It tells the seat again when the tab comes back.
- When the seat closes, the Hive ends the Canopy session that has the seat's name.

## The phone: what must be installed

The `device_*` tools boot an Android emulator or an iOS simulator on the machine where the Hive app runs. They never run from the server pod.

Android (the default platform):

- The Android SDK, found at `ANDROID_HOME` or `ANDROID_SDK_ROOT`, else `~/Library/Android/sdk` on macOS and `~/Android/Sdk` elsewhere. Install Android Studio or the command-line tools.
- `platform-tools/adb` and `emulator/emulator` inside the SDK. If the emulator is missing, install it with `sdkmanager "emulator"`.
- At least one AVD, in `ANDROID_AVD_HOME` or `~/.android/avd`. The default name is `hive-pixel`. With no AVD, the error gives a one-line recipe that creates `hive-pixel` from `system-images;android-35;google_apis_playstore;<x86_64 or arm64-v8a>` on a `pixel_7` and tunes its config.
- Do not use android-36.1 images: screenshots are broken on them.
- The emulator runs headless (no window, no audio). It uses the host GPU on macOS, Windows, or when `DISPLAY` is set, and software rendering otherwise.

iOS (`platform: "ios"`):

- A Mac with Xcode, so that `/usr/bin/xcrun` exists, and at least one simulator runtime ("open Xcode once so it installs a runtime").
- `/usr/bin/clang`, which builds a small screen helper for the live picture into `~/.hive/native/`.
- `baguette` 0.1.96 for taps, swipes, typing and keys, because iOS has no built-in way to tap a simulator. The Hive looks at `HIVE_BAGUETTE`, then `~/.hive/native/`, then `/opt/homebrew/bin/baguette` and `/usr/local/bin/baguette`. On Apple silicon it downloads the release itself and checks a pinned SHA-256. On an Intel Mac, build baguette from source and point `HIVE_BAGUETTE` at it.

Apps:

- Install the app on the phone first. On iOS: `xcrun simctl install <udid> <App.app>`.
- `HIVE_APP_PACKAGES` gives apps nicknames, as `name=package.id,other=bundle.id`. `device_open` then accepts the nickname as `app`.

## Device tools for a chat

- `device_open(platform?, avd?, app?, window?)`: boot a phone and put its screen in this seat's device pane. `platform` is `android` (default) or `ios`. On Android, `avd` is the AVD name; with none given, the only AVD, else `hive-pixel`. On iOS, `avd` is a simulator name or udid; with none given, a booted one, else the first iPhone. `app` opens an app after boot (package name, bundle id or nickname). `window:true` (Android only) also shows the emulator's own window. A phone already up is reused in a second; a cold boot takes about 30 seconds, and the Hive gives up after 150 seconds.
- `device_screenshot()`: a PNG of the whole screen in device pixels, the same coordinates `device_tap` takes. Take one after every action.
- `device_tap(x, y)` and `device_swipe(x1, y1, x2, y2, ms?)`: in device pixels; a swipe takes 50 to 5000 ms, default 300.
- `device_type(text)`: type into the focused field; tap the field first. ASCII, up to 500 characters.
- `device_key(key)`: on Android HOME, BACK, ENTER, TAB, DEL, MENU, RECENTS, POWER, VOLUME_UP, VOLUME_DOWN, any `KEYCODE_*` name or a keycode number. On iOS HOME, LOCK, SIRI, VOLUME_UP, VOLUME_DOWN, ENTER, TAB, DEL, ESC, SPACE or a HID usage number. iOS has no BACK.
- `device_tree()`: Android only. Every node with a text, a description or an id, with bounds and a clickable mark. A WebView shows as one node, so read web content from the screenshot.
- `device_logs(lines?)`: default 200 lines, at most 2000. On Android, logcat filtered to the app `device_open` launched; on iOS, the last 5 minutes of the simulator log, unfiltered.
- `device_close()`: shut the phone and empty the pane. A running phone holds a few GB of memory.

Limits:

- One phone per seat. Two seats that open the same AVD or simulator share one phone, and `device_close` from either shuts it for both.
- If the phone dies, the next tool says "the device is gone" or "is not answering any more". Call `device_open` again.

## What the person sees in the device pane

- When a seat boots a phone, its card shows a phone chip ("<name> · live" or "off") and the device pane opens on that seat.
- The person can open it with "open the phone here" in the seat's menu. If no phone is up, the Hive boots one ("waking the phone up — the first time takes about half a minute"). When both an AVD and a simulator exist, it asks "which phone?" with "Android" and "iPhone".
- The screen is live video when the window supports it, else a picture that refreshes. A click on the screen is a tap.
- The bar has BACK and HOME buttons, a field ("type here — Enter sends it to the device") and a camera button that sends a screenshot to the chat.
- With no phone, the pane says "no device on this seat — press the phone above, or ask the seat for device_open".

## park: a chat that waits for a date

A chat calls `park` when its work has to wait for time to pass: logs to pile up, a deploy to land, a pull request to merge. Only a chat on this machine can park, and the app must be open.

- **Arguments:** `until` (an ISO 8601 date and time with its offset, at least 5 minutes and at most 30 days away), `task` (what the chat does when it wakes, up to 600 characters), `why` (optional, one line for the person, up to 300) and `check` (optional, a shell line up to 600 characters).
- **While parked:** the chat leaves the grid and sits under "off screen" on the rail as "parked till <when>". It sleeps like any idle chat, comes back after a restart, and the quiet sweep never closes it.
- **Waking:** every 30 seconds the app looks at `~/.hive/parked.json`. At `until`, it sends the chat a message with its task and the reason it waited. If the app was closed at that time, the chat wakes when the app opens. A `check` runs every hour in the hub folder, with a 60-second limit; exit 0 wakes the chat early.
- **After waking:** the chat works off screen and comes back to the grid when its turn ends, like "hide until it finishes".
- **The person:** the seat menu of a parked chat has "wake it now" and "cancel parking". Opening the chat from the rail brings it to the grid; it stays parked until its date.
- A second `park` call moves the date. A chat that is closed for good loses its parking.

## Tasks: the person's task list

The task list is the person's own to-do list inside the Hive. It opens from the "<n> tasks" button in the top bar ("your tasks") or from the ⋯ menu ("tasks", ⌥F by default).

The `task(text)` tool writes one line into it, private to the person and marked with the chat it came from. Call it only when the person asks to note, remember or keep something. Never call it on your own to record leftovers at the end of a turn.

- The person's name in the Hive must be set (`HIVE_DEV`). Without it: "this hive has no name for you yet — set HIVE_DEV before writing tasks".
- A task is one line of up to 300 characters; a comment is up to 2000 characters.
- "Who sees it": "just me" ("stays on this machine", in `~/.hive/tasks.json`), "team" ("everyone who uses the hive"), "people" ("only the people you pick") or "a group" ("everyone in the group"). Shared tasks and groups live in the team's shelf repo (see the "team-and-cloud" topic); if it is unreachable, sharing fails.
- Only the author edits, marks done or removes a task; others can comment.
- "Start a chat" opens a new chat whose mission is the task, with its last six comments; the task's text is the chat's errand. "or hand it to an open chat…" sends the task to a chat that is already open.
- In a comment on your own task, `@<chat name>` sends that comment to the open chat with that name.
- Done tasks drop off the list after 14 days.
- Extensions can read and change the person's private tasks (see the "extensions" topic).

## Routines: chats that open on a schedule

A routine is a chat that opens itself on a schedule, with the same mission every time. Open the panel from the ⋯ menu: "routines" (⌥I by default). "new routine" opens the form.

- "name — also the name of the chat": up to 60 characters. Each run's chat is named after it plus the clock, like `weekday-triage-0900`, and carries the routine name as its errand, so the day view groups the runs.
- "when": `hourly` (on the hour), `daily`, `weekdays`, `weekly` (with "day of the week"), `cron` (five fields: minute hour day month weekday) or `webhook`. "time" is HH:MM, default 09:00.
- "where it runs": "local · your machine" or "remote · server"; a remote routine takes "repo (remote)", the repo the remote chat clones.
- "agent": any agent the person has ready (claude, codex, kimi, kiro, cursor, gemini, antigravity, opencode).
- "the mission, the same every time": up to 8000 characters.
- "precheck": a shell line of up to 600 characters. It runs first, in a login bash in the hub folder, for up to 60 seconds. A non-zero exit skips the round, and no chat opens.
- Each routine keeps its last 20 rounds: "opened" (with a link to the chat), "skipped" (the precheck's last line), "missed" or "failed".
- Actions: "Run now" (it still runs the precheck when there is one), "Turn off" / "Turn on", "Edit", "Remove". Removing stops the routine; the chats it opened stay.
- Routines are stored in `~/.hive/routines.json`.

Limits: a routine fires only while the Hive is open on this machine, checked every 30 seconds. A round more than 30 minutes late is marked missed and is not run.

## Routine webhooks

A routine with the `webhook` trigger opens its chat when something calls it, instead of on a clock.

- Saving it creates a secret token. The panel shows the call to copy: a `curl` POST over the Hive's socket (`~/.hive/hive.sock`) to `/api/hooks?routine=<id>&token=<token>`, with a JSON body.
- The mission can quote the call with `{{body.field}}`, `{{query.field}}` and `{{headers.name}}`. Headers and query keys that look like credentials (authorization, cookie, token, secret, signature, password, api key) are replaced with `[redacted]`.
- The body is at most 64 KB. A body that is not JSON arrives as `{{body.text}}`.
- At most 60 calls per minute per routine; above that the answer is 429.
- A repeated `X-Hive-Delivery` or `X-GitHub-Delivery` header (of the last 50) is ignored as a duplicate.
- Answers: 202 when the chat opened, 409 when it did not, 404 for a wrong token or a routine that is off.

## Errands: the request a chat came from

An errand is the person's request that a chat came from, in their words, up to 60 characters. Every chat opened for the same request carries the same line.

- A chat sets it with the `errand` argument of `spawn` (see the "seats" topic). Routines use the routine name; "Start a chat" on a task uses the task's text.
- "Your day" (⋯ menu, ⌥D by default) groups chats by errand: "waiting on you", "came back" (every chat at rest and a PR to look at), "on the way", and the chats "you opened by hand".
- "I saw this" clears a request from "came back". Clicking a request's name renames it for all its chats.
- In a race (one mission in several chats), "keep this one" archives the other chats of the request; they can come back from the archive.
- Errands live in `~/.hive/errands.json`. A request whose chats all closed stays there for 14 days, so its PRs can still come back.

## Secrets: request_secret

`request_secret(label, why?, url?, env_key?, wait_seconds?)` asks the person for a token, password or key without the value passing through the conversation.

- A card opens on the person's screen: "<seat> needs a secret", the label, the reason, a password field ("Paste the secret"), "Decline" and "Save secret".
- With `url`, the card also shows a button "Open <site>" that opens that page in the person's browser. Use it for the page where the value is created or copied. Only `http` and `https` addresses are accepted.
- The tool blocks: default 600 seconds, at least 30, at most 1800. It ends as saved, declined or timeout; on timeout the card closes.
- Limits: label up to 80 characters, reason up to 400, value up to 16384.
- Only chats on this machine can ask: a cloud chat gets "a secret is only kept on this machine — ask for it from a local chat".
- Open requests live in the app's memory. If the app restarts, the request is gone, and the tool returns an error.

The value reaches its place in one of two ways.

**A credential of the hub: `env_key`.** Use this when an MCP server reads the key from `<hub>/.env`.

- The card says the value will be written as that key, and warns when the key already has a value.
- The Hive writes `KEY=value` in `<hub>/.env` (it replaces the line if the key is there) and reloads the gateway. The chat gets the key name and nothing else: no path, no value.
- When the `.env` already holds a 1Password reference, the card offers "Keep the value in 1Password", checked. The value then goes to the item `hub-env` of the person's vault, and the `.env` gets only the `op://` reference. If the person clears the box, the value goes to the `.env` as plain text.
- The person can also paste an `op://` reference in place of the value. The `.env` then holds that reference, and the gateway reads the value from 1Password.
- The value must be a single line. A key that starts with `HIVE_` is refused.
- A chat that gets the key through `<hub>/.mcp.json` sees it only after it is reopened.

**Anything else: a private file.** Without `env_key`:

- The value is written to `~/.hive/secrets/<seat>-<id>`, readable only by the person's user (file 600, folder 700). The chat gets the path, never the value.
- Use it without printing it: `export TOKEN=$(cat <path>)` inside the command that needs it. Never `cat`, `echo` or log it, and never ask for a secret in plain chat when this tool exists.
- The file is deleted after 24 hours (the Hive sweeps every hour).

Other ways a key reaches a chat: when a chat opens, the Hive reads the hub `.env` and passes, as environment variables, each key that the hub `.mcp.json` names as `${KEY}` (see the "mcp" topic). Extensions keep their own keys (see the "extensions" topic).

## buzz: ring the person's phone

`buzz(line)` sends one line to the person's phone through their own Hive phone app. The setup is in the "team-and-cloud" topic.

- Use it only for what the person would want to leave a meeting for: something broke where people can see it, or a decision that stops the work. Never for progress, finishing, or a waiting question: a seat that stops with a question already notifies them.
- The line is cut to 140 characters. Say what happened, not "take a look".
- It reaches the phone only if a phone is paired and this chat travels to it from this machine; otherwise the error is "that chat is not travelling to the phone from this machine".
- The tool's rule: one buzz per seat per five minutes, and never twice about the same thing.

## ask_person: a question to someone else on the team

`ask_person(person, question)` puts a question on another person's screen. They approve it and choose which of their chats answers. The answer arrives in the asking chat as a message from them.

- `person` is their lowercase name in the Hive, as the people menu shows it.
- The question is up to 1200 characters and must stand alone: a person reads it before any agent does.
- The asking chat must have a seat name, so the answer has somewhere to come back to.
- The team connection that carries it is described in the "team-and-cloud" topic.

## reply_on_slack: answer the Slack thread a chat came from

`reply_on_slack(text)` posts in the Slack thread the chat was opened from. Nothing else the chat writes reaches the person there.

- It works only in a chat born from a Slack thread. Call it when the work is done, when only they can answer something, and before a long wait.
- The text is up to 12000 characters. Plain sentences, markdown links and code fences are fine.
- It needs the Hive app open where the chat runs and the Slack connection running on that machine; otherwise the error is "no slack bridge on this machine". The setup is in the "team-and-cloud" topic.
- In the Hive, the seat menu item "its Slack thread" opens the thread beside the chat.

## The PR panel

The PR panel follows the pull requests of the Hive's chats, with CI, diff, review and merge, without leaving the app.

- Requirement: the GitHub CLI `gh`, installed and logged in. Everything goes through `gh`; without a login the panel cannot read PRs, and changed images fail with "gh is not logged in on this machine".
- The top-bar button ("the pull requests the hive is watching") shows only when there is a PR: "<n> PRs", "<n> failing" or "<n> ready". The seat menu has "review its PR" when a chat has one.
- A PR lands on the list on its own when a chat opens or links it. "Add PR" takes a URL or `owner/repo#number`. "Take off the list" drops one.
- A merged or closed PR drops off 24 hours after its last update. A PR by someone else that a chat only mentioned drops off unless it was added by hand.
- Checks: each check with its state and time. A GitHub Actions job shows its log, "Rerun the failed ones" and "Rerun every check".
- Diff: file by file, with noise (lock files, minified, build output) at the end, and "<n> of <m> added lines by <seat>" when the owning chat's transcript is on this machine.
- Changed images show "was" and "now" side by side (png, jpg, gif, webp, avif, bmp, ico, svg; up to 12 MB each).
- Review notes: "leave a note on this line", then "send the notes" to a chat you pick ("which chat gets the notes"), or "copy the batch". "Review in the chat" opens the review inside the chat.
- "Comment, approve or ask for changes" posts a GitHub review. GitHub does not let you approve your own PR.
- Merge: "Merge" (a merge commit), "merge when CI passes" (auto-merge) or "Force merge" (admin, over red or running CI). After the PR closes, "Delete the branch" removes it, except for a branch in a fork.
- Views: "Views" in the panel's top bar keeps the filter and the search of the list under a name. "Save current view…" asks for the name (up to 80 characters, one name per view). Choosing a saved view brings back its filter and search. After a change the button shows `*` and the menu adds "Update saved view"; "Rename view…" and "Delete view" act on the chosen view. Enter or Space opens the menu, the arrows move in it, and Esc or Tab closes it and puts the focus back on the button.
- The views live in the settings file under `prViews`, so every window of the Hive on this machine sees them.
- The list is kept in `<hub>/.hive/prs.json` and the notes in `<hub>/.hive/pr-notes.json`.

## Pull request and CI tools for a chat

A chat reads, opens, updates, answers and merges GitHub pull requests, reads failing CI logs and re-runs checks with these `hive` tools. They run `gh` in the Hive app with the person's own GitHub login, so `gh` must be installed and logged in on this machine and the app must be open. GitLab is not supported.

Which PR a tool acts on:

- With `number` and `repository` (`owner/name`): that PR. With `number` only: that number in the repository of the chat's checkout.
- With neither: the chat's PR. That is the PR of the branch checked out in the chat's latest worktree, else the one PR the PR list links to this chat. With several linked PRs the tool asks for `number`; with none it says "This chat's branch has no known PR".
- The chat's worktree is the last repository folder it worked in (its working directory if it never left it). A chat on the server has no local checkout here, so it must pass `number` and `repository`.

The tools:

- `pull_request_read(number?, repository?, include?, includeResolved?, cursor?)`: title, state, draft, author, branches, `headSha`, mergeability, how far behind the base it is, auto-merge, check counts (passed, pending, failed names) and the count of unresolved review threads. `include` adds `body`, `checks` (every check run), `threads` (unresolved review threads with their comments and ids; `includeResolved:true` adds the resolved ones), `comments` (comments and reviews) and `diff`. Long conversations and diffs come in pages of about 32,000 characters; pass `nextCursor` as `cursor` for the next page of the same section.
- `pull_request_list(repository?, state?, involvement?, query?, limit?, cursor?)`: the repository's PRs, recently updated first. `state` is `open` (default), `closed`, `merged` or `all`; `involvement` is `all`, `reviewing` (asks for your review) or `authored` (yours); `query` takes GitHub search words; `limit` is 1 to 100 (30). The rows carry no PR link, so listing does not add PRs to the PR list.
- `pull_request_create(title, body, base?, draft?)`: pushes the chat's branch to `origin`, then opens its PR, or returns the PR already open for that branch (`created:false`). The PR is linked to the chat on the PR list. It refuses a detached HEAD and the repository's default branch. `private:true` fails: GitHub has no private PRs.
- `pull_request_update(number?, repository?, title?, body?, ready?, state?, addLabels?, removeLabels?, requestReviewers?)`: edits the title, body, labels and reviewers (`org/team` for a team), `ready:false` turns it back into a draft, `state` closes or reopens it.
- `pull_request_respond(number?, repository?, reviewThreadId?, body?, resolved?)`: without `reviewThreadId`, a comment on the PR. With it, a reply in that review thread and, with `resolved`, resolving or reopening the thread. If the reply lands and the resolve fails, the error says so: retry without `body`.
- `pull_request_merge(number?, repository?, expectedHeadSha, method?, auto?)`: merges (`merge` by default, or `squash`, `rebase`). It refuses when the PR's head is no longer `expectedHeadSha` (the `headSha` from `pull_request_read`), and GitHub checks the same head again at the merge. `auto:true` turns on auto-merge, so the answer says `state: "open"` until GitHub merges it. It never uses admin rights, so branch protection and required checks hold; a blocked merge comes back as an error.
- `ci_logs(number?, repository?, check?, tailLines?)`: the last `tailLines` lines (200 by default, at most 2000) of each failing or cancelled check's log, timestamps and colours removed. Only the first 5 failing checks are read; the rest say "Ask for this check by name". `check` reads that one check by name, failed or not. A check that is not a GitHub Actions job has no log here.
- `ci_rerun(number?, repository?, check?)`: re-runs the failing jobs of each workflow run, or the one named check. Each check comes back with `rerun` true or false and the reason.

The answers are JSON. In the conversation each call shows as one line, such as "Read PR #12", "Merged PR #12" or "Re-ran CI on PR #12".

## Usage and plan limits

- The usage panel (⋯ menu, "usage", ⌥U by default) shows "Usage and concurrency": active minutes by day and hour, and how many chats ran at once. It reads the Claude Code transcripts on this machine: about ten seconds the first time, then cached for 10 minutes; "Recompute" reads again.
- "Plan limits" come straight from each signed-in Claude, Codex, Kimi and Kiro account: the whole account on every machine, with the reset time. They refresh at most every 5 minutes.
- The limit chip in the top bar ("how much of each plan is spent") shows the same numbers. An account found spent is recorded until its reset (see the "providers" topic).

## The doctor: the environment panel

The doctor checks this machine's setup and suggests fixes.

- The environment line under the top bar, or the "environment · <n>" button ("open the environment panel"), opens the "Environment" panel. The palette also has "check the environment again".
- Each finding has "fix it" (runs the fix, up to 3 minutes), "Solve in a chat" (opens a local chat with the finding as its mission) and "check again". A fix that needs the person at the keyboard shows a command to copy instead.
- "ignore it for 7 days" hides a failure for a week; "ignore it for good" hides a warning for good. Ignored checks are kept in `~/.hive/doctor-ignored.json`. "don't warn me until this changes" silences a finding until its state changes.
- Some warnings heal themselves: the Hive runs their fix on its own and tries again after 30 minutes.

## Pages in the chat: html_render and html_preview

A chat can show a finished HTML page (a chart, a diagram, a mockup, a table) inside the conversation, above its final reply.

- `html_render(title, height, html | path)` keeps the page under `~/.hive/renders/<seat>/<id>.html` (on the pod, under `/workspace/hive/renders/`) and the chat draws it in a sandboxed frame. The frame fits its height to the page, up to 20000 px. The button in the top right corner opens it full screen; Esc or "Close" leaves.
- `html_preview(html | path, width, appearance)` draws the page off screen in the Hive app and returns a PNG, the content height and the console messages, so the chat can check the page before it shows it. It needs the Hive app open and on screen on the same machine. A cloud chat cannot preview: the error says so, and `html_render` still works there.
- The page must be self-contained: inline `<style>` and `<script>`, at most 512000 bytes. Local images given as absolute paths in `src` are inlined (up to 5 MB each, 8 MB for the whole page once inlined); remote `https` addresses load as they are.
- The page cannot reach the Hive, this machine or its network: only public `https` and `wss` addresses load; `http`, `hive:`, `localhost`, private and link-local addresses are cancelled before the request leaves. It cannot navigate, open windows, submit forms or embed other pages, so a link inside it does nothing. Any frame the page adds (`iframe`, `frame`, `object`, `embed`) is removed at once, the page has no WebRTC, and `document.write`, `setHTMLUnsafe`, `Document.parseHTMLUnsafe` and declarative shadow roots (`shadowrootmode`) are switched off.
- The Hive gives the page the theme variables of the chat (`--background`, `--foreground`, `--muted`, `--card`, `--border`, `--primary`, `--accent`, `--destructive`, `--warning`, `--success`, `--info`, `--code-background`, `--chart-1` to `--chart-6`, `--radius`, `--font-sans`, `--font-mono`) and an 8 px gutter on `html`.
- A page that sizes with `vh` units or sets `height:100%` on `html` or `body` (in a style sheet or in their `style`) is refused, because the frame grows with the page. A page that still keeps growing with its frame is held at its height.
- On the phone the page arrives sealed with the chat's key, like a picture, up to 4 MB; a bigger one shows a note to open it on the computer. The phone draws it at the phone's width in the phone's colours, in a sandboxed frame with an opaque origin, so it cannot reach the phone's keys, open windows or submit forms. On the phone the page reaches no network at all: no `https` scripts, styles, images, fonts or requests and no WebRTC, only what is inline or in `data:` and `blob:` addresses, so a page for the phone inlines its libraries and pictures. A page that navigates away is closed. "full screen" opens it on a screen of its own.

## MCP apps in a Claude chat

An MCP tool can come with an app: a `ui://` page its server declares in the tool's `_meta.ui.resourceUri` (the MCP Apps standard). When a Claude chat calls such a tool, the Hive reads the page from the server and shows it in the conversation right below the call.

- The app runs in a sandboxed frame with no origin of its own, under the same frame shield as `html_render`. It reaches only the `https` and `wss` domains its server declared, and none of this machine or its network.
- The app can call tools of its own server and read its resources. A tool not marked read-only waits for the person to allow it ("Allow <server> to run <tool>?"), and so does a message the app wants to post in the chat. Links open only from a click inside the app.
- The button in the corner, or a request from the app after a click inside it, opens the app full screen; the same button or Esc brings it back.
- Using the app needs the chat's agent running: a chat that went to sleep wakes when the app calls a tool. Other agents show these calls as ordinary tool calls. An MCP server reached only through the hub's `mcp_call` shows no app.
- Do not describe the app in the reply; the person sees it.

## Attachments and pictures in a chat

- The person drops or pastes files into a chat's message box. At most 6 files per drop, 24 MB per file and 32 MB per drop. Programs and installers (exe, dmg, pkg, deb, rpm, apk, jar, iso and similar) are refused, and so are empty files: drop a folder as the files inside it.
- Files are saved under `~/.hive/shots/<seat>/`, and the chat gets their paths.
- Saved files older than 7 days are swept. `HIVE_SHOTS_DAYS` changes the number of days; `0` keeps them.

## Other panels: memories, chat marks, files, terminals

- Memories (⋯ menu, "memories", ⌥⇧M by default) shows your Claude Code memories, the open proposals to the team memory and what the team memory holds on `main`. Proposing and approving go through `gh`. See the "team-and-cloud" topic.
- Chat marks: a chat can be "Pinned", "Snoozed" or "Settled" from its menu. The marks are kept in `~/.hive/inbox-marks.json`.
- The files editor opens a file of the seat's worktree and saves it where it lives (see the "seats" topic).
- Terminals: ⋯ menu, "new terminal" (⌥T by default) or "new terminal on the server" (see the "seats" topic).

## In the code

- `server/peer/peer-tools.mjs`
- `server/peer/peer.mjs`
- `app/lib/pr-tools.mjs`
- `app/src/app/pr-views.js`
- `app/assets/pr-views.mjs`
- `app/lib/pr-checks.mjs`
- `app/routes/prs.mjs`
- `app/routes/browser.mjs`
- `server/peer/html-pages.mjs`
- `app/routes/render.mjs`
- `app/src/app/html-pages.js`
- `app/main/page-guard.js`
- `app/src/app/chat-and-panes.js`
- `app/main/seat-preload.js`
- `app/main.js`
- `app/routes/canopy.mjs`
- `app/lib/canopy-watch.mjs`
- `app/routes/device.mjs`
- `app/lib/device.mjs`
- `app/lib/device-ios.mjs`
- `app/routes/tasks.mjs`
- `app/lib/tasks.mjs`
- `app/src/app/tasks.js`
- `app/routes/routines.mjs`
- `app/lib/routines.mjs`
- `app/src/app/routines.js`
- `app/routes/errands.mjs`
- `app/lib/errands.mjs`
- `app/lib/inbox-marks.mjs`
- `app/routes/secrets.mjs`
- `app/lib/secret-asks.mjs`
- `app/src/app/secret-asks.js`
- `app/lib/phone-bridge.mjs`
- `app/routes/slack.mjs`
- `app/routes/prs.mjs`
- `app/lib/prs.mjs`
- `app/routes/usage.mjs`
- `app/src/app/usage.js`
- `app/usage/extract-metrics.mjs`
- `app/routes/doctor.mjs`
- `app/lib/doctor-client.mjs`
- `app/assets/drops.mjs`
- `app/lib/shots-sweep.mjs`
- `app/routes/memories.mjs`
