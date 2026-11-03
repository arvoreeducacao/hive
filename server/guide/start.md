# Getting started

Install the Hive, run its first-run setup, find its state on disk, take updates, run the doctor, read logs, reset or uninstall.

## What the Hive is

The Hive is a desktop app that runs many AI coding chats side by side. Each chat is a **seat**: a tile with a real terminal or a structured chat behind it, opened on a folder and a branch, running one agent CLI (Claude, Codex, Kimi, Kiro, Cursor, Gemini, Antigravity or OpenCode; see the "providers" topic).

- The app has two parts: an Electron window, and a Node server (the "app server") that the window starts on your machine. The window talks to the app server over a local socket. Nothing listens on a network port.
- Seats run on your machine (in tmux on macOS and Linux, in native terminals with PowerShell on Windows). Seats can also run on a server you host; see the "team-and-cloud" topic.
- A seat runs its agent with no approval prompts. It edits, installs, commits and runs commands on everything it can reach.
- Seats see each other and can message each other (see the "seats" and "tools" topics).

## What the machine needs

The app does not carry everything. Check these before the first run:

- **Node.js** on the machine. The app starts its server with the `node` it finds. It looks on the PATH of your login shell, then in the mise, asdf, nvm and volta install folders (on Windows: `where node`, `NVM_SYMLINK`, `NVM_HOME`, `Program Files\nodejs`). The release builds are made and tested with Node 22. The path it found is saved in `node.json` in the app's own folder (see "The app's own folder").
- **git** and the **GitHub CLI** (`gh`), signed in with `gh auth login`. The app uses `gh` for updates, the PR panel, reviews and merges.
- **tmux** on macOS and Linux. Every local seat lives in a tmux window. Windows needs no tmux.
- **Git for Windows** on Windows. Every shell script the app runs on Windows goes through its `bash.exe`. Set `HIVE_BASH` to a `bash.exe` path to choose another one.
- **At least one agent CLI**, signed in. The welcome suggests `npm install -g @anthropic-ai/claude-code` for Claude. Any of the other agents is enough (see the "providers" topic).
- `kubectl` and `aws` only when your server is hosted on a Kubernetes cluster.

The app reads the PATH (and a `GH_TOKEN` or `GITHUB_TOKEN`) from your login shell once, when it starts. If you install a CLI while the app is open, quit the app and open it again.

## Install on macOS

- Download `Hive-arm64.dmg` from the Releases page of the Hive's GitHub repository. The macOS build is for Apple silicon only.
- Open the disk image and drag **Hive** into Applications. Run it from there: the updater replaces the app in the place where it runs.
- The release marked "Latest" on GitHub carries a signed and notarized macOS build. Builds made between scheduled releases are signed but not notarized. A build made without the signing certificate is unsigned, and macOS asks before the first open.
- On macOS, closing the window hides it. The app keeps running until you quit it (⌘Q).
- The app asks for the microphone only when you press the microphone button in a chat. Speech is transcribed on the machine.

## Install on Linux

Two formats, both for x86_64:

- **AppImage**: download `Hive-x86_64.AppImage`, run `chmod +x Hive-x86_64.AppImage`, and start it. The updater replaces this same file, so keep it in one place.
- **rpm**: download `Hive-x86_64.rpm` and install it with your package manager (for example `sudo dnf install ./Hive-x86_64.rpm`). It installs under `/opt/Hive/`. An update runs `pkexec rpm -U`, so the system asks for your password.

There is no `.deb` build. On Linux, closing the last window quits the app.

## Install on Windows

- Download `Hive-x64.exe` and run it. It is a one-click installer for your user only, and it opens Hive when it finishes.
- Install Git for Windows, the GitHub CLI (`winget install --id GitHub.cli -e`) and an agent CLI. If you install one of them while Hive is open, close Hive and open it again.
- Seats run in PowerShell (`pwsh` when it is installed, else Windows PowerShell) in native terminals. There is no tmux and no WSL.
- The app server answers on a named pipe (`\\.\pipe\hive-<hash>`) instead of a socket file.

## Run from a checkout

To run the app from its source:

```
cd app && npm ci && npm run deps:server && npm run app
```

An app run this way updates by `git pull --ff-only origin main` in the checkout, then `npm install` (see "Updates: how they arrive").

## First run: the boot screen

When the app opens, the boot screen shows three steps: "looking for node", "starting server" and "connecting to the pod". It then loads the main window.

- "could not find node": install Node.js, or make it visible on your login shell PATH, then open the app again. The error box lists the PATH it used.
- "the server did not start" or "The server did not answer": the error box shows the last lines the server printed. The server has 12 seconds to answer.
- If the server is killed from outside (a signal, or a clean exit), the app starts it again, up to 3 times in a row. A `pkill -f "node server.mjs"` run in a seat also kills the Hive's own server. Stop a dev server by its port instead.
- If another Hive already answers on the same socket, the second one leaves.

## The welcome (setup) flow

On the first run the app opens the welcome. It has up to seven steps. The top shows them as numbered dots; the bottom right button moves on (Enter also works).

1. **hello**: type "your name in the hive" (2 to 30 characters: lowercase letters, digits and hyphens, starting with a letter) and "where your workspace lives on this machine" (a folder that must exist; see the "hub" topic). You can also pick your face here. Button: "Continue".
2. **your machine**: checks tmux, gh and claude, the GitHub login and the Claude login (and kubectl, aws and the cluster only when your server is on a cluster). Each red line has a "copy" button with the install command. The screen checks again every few seconds; "Check again" forces it. "continue anyway — the next steps will wait" skips ahead. The step passes with Claude signed in, or with any other agent CLI installed.
3. **your key**: "Create my key" runs the setup script. It makes an ed25519 key at `~/.hive/key-<name>` and writes `~/.hive/config` with `HIVE_DEV`, `HIVE_HUB` and `HIVE_REPO`. When git, gh or (on macOS and Linux) tmux is missing, it stops and shows the install command.
4. **your server**, 5. **key on it**, 6. **claude on it**: only when a server is wanted (`HIVE_SERVER_URL` or `HIVE_WANTS_SERVER=1` in `~/.hive/config`). Otherwise these steps are hidden and "Seats run on this machine." is shown. See the "team-and-cloud" topic.
7. **first flight**: "Open the first chat" opens a local chat named `first-flight` with a fixed mission. It introduces itself, writes its status file and asks you a question. It always runs on Claude. The model choice is the account default, Haiku, Sonnet or Opus. "skip — take me to the hive" ends the welcome without it. "Show me around" starts the tour.

Finishing writes `~/.hive/onboarded`, and the welcome does not open again. "skip for now" (top right) closes the welcome without that file, so it opens again on the next start. If every essential step is already done at start, the app marks the welcome finished by itself. To open it again: "shortcuts and settings" (⌘, on macOS, Ctrl+, elsewhere), then "setup and tour" at the bottom.

## Local only or with a server

- With nothing set, every chat runs on this machine and the app needs no server.
- To use a server, put `HIVE_SERVER_URL=https://…` in `~/.hive/config`, then follow the server steps of the welcome. Start, trust, pairing and the phone are in the "team-and-cloud" topic.

## Where the state lives

The state folder is `~/.hive` (`%USERPROFILE%\.hive` on Windows). Set `HIVE_HOME` to move it. The setup script makes it with mode 700. What matters in it:

| Path | What it holds |
|---|---|
| `config` | `HIVE_*` lines: your name, workspace, checkout, server address (see "The two config files") |
| `config.jsonc` | the app's settings, written by the settings screens |
| `key-<name>`, `key-<name>.pub` | the signing key the setup script made |
| `identity.json`, `identity.pub` | this app's own Ed25519 identity, made on the first open; the private half never leaves the file |
| `onboarded` | the mark that the welcome is finished |
| `hive.sock` | the app server's socket (macOS and Linux) |
| `sessions/<chat>.json` | each chat's record: agent, model, folder, the session id to resume |
| `events/<chat>.ndjson` | each chat's event log, append only |
| `sock/<chat>.sock` | the socket of each running chat |
| `shots/<chat>/` | pictures attached to a chat |
| `accounts/` | extra Claude logins, with `spent.json` and `order.json` |
| `providers/<agent>/` | extra logins of the other agents, with `spent.json` and `order.json` |
| `transfers/<chat>/` | the record of each change of provider |
| `js/` | JavaScript updates that were taken, and `current.json` (the one in use) |
| `updates/` | downloads of full releases, before they replace the app |
| `seen-release.json` | the last release whose notes you saw |
| `doctor-ignored.json` | the doctor checks you chose to ignore |
| `traces/` | `traces.ndjson`, rotated at 10 MB, 5 files kept |
| `stt/` | the speech-to-text model, after you turn dictation on |

Other folders (`shelf/`, `artifacts/`, `extensions/`, `secrets/`, `phone/`, `shell-env/`) belong to other topics. Inside your workspace folder, `.hive/prompts/` and `.hive/status/` hold each chat's mission and status file (see the "hub" topic).

## The two config files

- `~/.hive/config` is plain `KEY=value` lines; only lines that start with `HIVE_` count. The setup script writes `HIVE_DEV`, `HIVE_HUB` and `HIVE_REPO`, and keeps the other lines. An environment variable with the same name wins over the file.
- `~/.hive/config.jsonc` is JSON with comments. The settings screens write it and keep your comments. `HIVE_CONFIG` moves it. A value of the wrong shape is ignored, and the default is used. Keys that matter here: `providers` (see the "providers" topic), `autocompact` (`auto`, or `100k` to `1000k`), `contextUsage` (`true` tells Claude chats how full they are), `language` (`en` or `pt-BR`), `terminal` (`ghostty` or `xterm`). The other keys are in the "interface" topic.
- On macOS the **Hive** menu in the menu bar has "Config file" (opens `config.jsonc`) and "Data folder" (opens the app's own folder).

## The app's own folder

Electron keeps a second, smaller folder: `~/Library/Application Support/Hive` on macOS, `~/.config/Hive` on Linux, `%APPDATA%\Hive` on Windows. `HIVE_USER_DATA` moves it. It holds:

- `window.json` and `seat-window.json`: the size and place of the main window and of detached chat windows.
- `node.json`: the path of the `node` the app found. If that file stops being runnable, the app looks again.
- The browser data of the chats' built-in browser (cookies and logins of the pages a seat opens).

On a Linux AppImage the app copies its bundled Claude binary to `~/.cache/hive/claude` (or `$XDG_CACHE_HOME/hive/claude`; `HIVE_CLAUDE_CACHE` moves it), because the AppImage mount changes on every start.

## Environment variables for the app

| Variable | Default | What it does |
|---|---|---|
| `HIVE_HOME` | `~/.hive` | the state folder |
| `HIVE_CONFIG` | `<HIVE_HOME>/config.jsonc` | the settings file |
| `HIVE_USER_DATA` | the Electron folder above | the app's own folder; one app runs per folder |
| `HIVE_LOCAL_SESSION` | `hive-local` | the tmux session that holds local seats |
| `HIVE_SOCK` | `<HIVE_HOME>/hive.sock` | the app server's socket |
| `HIVE_SANDBOX` | off | sandbox mode (see "Start clean or try in a sandbox") |
| `HIVE_REPO` | none | a checkout of the Hive, used to update from git |
| `HIVE_RELEASE_REPO` | the repository named in the build | the GitHub `owner/repo` the updater reads releases from |
| `HIVE_CLAUDE` | none | `bundled` makes chats always use the Claude binary that ships with the Hive |
| `HIVE_BASH` | Git for Windows' bash | Windows only: the `bash.exe` for scripts |

You can put `HIVE_*` lines in `~/.hive/config` instead of the environment (except `HIVE_HOME`). The app passes its own environment to the server, plus the PATH and GitHub token from your login shell. A variable you export only in a shell profile reaches the Hive only when you start the app from that shell.

## Updates: how they arrive

The app checks for updates; it never applies one by itself. A check asks GitHub for the releases with `gh api`, so `gh` must be installed and signed in (or `GH_TOKEN`/`GITHUB_TOKEN` must be set in the login shell). Updates exist for macOS on Apple silicon, Linux x86_64 and Windows x64. There are three ways an update comes in:

- **JavaScript pack** (button "Update"): a `hive-js-<print>.tar.gz` with a `.sig` signature. It replaces only the app's JavaScript; "the app stays where it is and your seats keep running". The app checks the Ed25519 signature against the key built into the app, unpacks it to `~/.hive/js/<tag>/`, points `~/.hive/js/current.json` at it and restarts its server. A pack fits only an app whose shell is the same: the Electron main process, the boot screen, the package and lock files, and the icons. When a release changes the shell, the full release is the only way. If the new code does not start, the app goes back to the code it shipped with and writes the reason to `current.json` as `rejected`.
- **Full release** (button "Update and restart"): the app downloads the build for its platform to `~/.hive/updates/<tag>/`, checks it, replaces itself and opens again. macOS: `Hive-arm64.zip`, checked with `codesign` against the signing team stamped in the build. AppImage: the file must be a Linux executable, and it replaces the file you run. rpm: installed with `pkexec rpm -U`. Windows: the installer runs silently (`/S`). If the app cannot place the new build, it says where the download is and asks you to put it in place.
- **Git checkout** (button "Rebuild and restart", or "The checkout pulls and installs." when you run from source): only when no published update applies and a checkout exists (`HIVE_REPO`). The checkout must be on `main`.

The app picks the pack when the newest release that carries a pack for this shell is at least as new as the newest that carries the full build. After an update, the app shows once what landed since the release you saw last.

## Seeing and forcing an update

- The running version is at the bottom of the "everything else" menu (the ⋯ button), as `#<number>`. It links to that release on GitHub.
- When an update is ready, the top bar shows "update ready" with the number of changes. Click it to read the notes, then click "Update" or "Update and restart", or "not now". While it works, the button shows the step: downloading, checking the signature, unpacking, restarting.
- If an update stops, the button stays yellow and the notes say why. "try again" retries.
- The window asks every 15 seconds; the server keeps an answer for 5 minutes. To force a fresh check, restart the app, or on macOS and Linux run `curl -s --unix-socket ~/.hive/hive.sock 'http://app/api/update?force=1'`.
- Agent CLIs (claude, codex and the others) update apart from the app; see the "providers" topic.

## The doctor

The doctor checks the machine and, when there is one, your server. Each check is OK, WARN, FAIL or SKIP, and a check that is not OK can carry a fix.

Checks of this machine:

- `~/.hive/config`: the file exists, has `HIVE_DEV` and `HIVE_HUB` (and `HIVE_POD` on a cluster), and the workspace folder exists. Fix: run the setup script.
- signing key: `~/.hive/key-<HIVE_DEV>` exists.
- dependencies on PATH: `tmux` and `gh` (only `gh` on Windows; plus `kubectl` and `aws` on a cluster). Fix: the install command for your system (`brew`, `apt-get`, `dnf`, `pacman`, `zypper` or `winget`).
- processes of chats that are gone: processes tagged with a chat that is closed. Fix: `kill` them. Not read on Windows yet.
- android emulator: only checked when an Android SDK is configured.

Checks of the server (skipped when there is no server, or when it is down): clock in sync (a signature is valid for 90 seconds), server up, door to the server, the last boot, `allowed_signers`, the Claude credential and flags, team memory, session sync, remote control, repos cloned, hub context and contract, gh signed in, MCP credentials, and disk space on `/workspace`. See the "team-and-cloud" topic.

In the app:

- The top bar shows an "environment ·" button with the number of findings when something is wrong. ⌥W on macOS (Ctrl+W elsewhere) shows or hides the alerts.
- The panel lists the findings. "fix it" or "fix the {n}" runs the fixes that need no keyboard. A finding can be ignored: "ignore it for 7 days", "ignore it for good", or "don't warn me until this changes". The choice is kept in `~/.hive/doctor-ignored.json`.
- The doctor runs every 10 minutes and when the window comes back into focus. To run it now, pick "check the environment again" in the command palette.

## Running the doctor from a terminal

The doctor is a Node script inside the app: `doctor/doctor.mjs` in the app folder. The panel shows the exact command line it runs. Typical places:

- macOS: `node /Applications/Hive.app/Contents/Resources/app/doctor/doctor.mjs`
- rpm: `node /opt/Hive/resources/app/doctor/doctor.mjs`
- a checkout: `node app/doctor/doctor.mjs`

Options:

- no option: a report for people. It changes nothing, here or on the server.
- `--json`: the same report as JSON (a stable contract: `dev`, `pod`, `generatedAt`, `ranWith`, `items` with `id`, `title`, `state`, `detail`, `fix`).
- `--fix`: runs the fixes that need no keyboard, then checks again. Fixes that need `sudo`, an interactive terminal or a value you must fill in are only printed.

The exit code is 1 when any check fails, else 0.

## Logs and diagnostics

- The app server prints to the app's standard output. To read it live, start the app from a terminal: `/Applications/Hive.app/Contents/MacOS/Hive` on macOS, the AppImage file itself, or the `hive` program in `/opt/Hive/` for the rpm. When the server fails to start, the error box shows its last lines.
- Each chat's full history is `~/.hive/events/<chat>.ndjson`, and its record is `~/.hive/sessions/<chat>.json`.
- Timing traces are in `~/.hive/traces/traces.ndjson`.
- On macOS and Linux, local chats are windows of the tmux session `hive-local`. `tmux attach -t hive-local` shows them. Detaching leaves them running.
- The doctor (see "The doctor") is the first check when something on the machine is missing.

## When the app will not start

1. If the boot screen says "could not find node", install Node.js or put it on your login shell PATH, and open the app again.
2. If the server does not start, read the last lines in the error box. Start the app from a terminal to see all of its output.
3. If an update broke the start, the app falls back to the code it shipped with by itself. To force that, delete `~/.hive/js/current.json`.
4. Run the doctor from a terminal (see "Running the doctor from a terminal").

## Start clean or try in a sandbox

- To run the welcome again without losing anything: "shortcuts and settings", then "setup and tour".
- To try a first run beside your real Hive, start the app with an empty state folder, its own app folder and its own tmux session, for example: `HIVE_HOME=/tmp/hive-try HIVE_USER_DATA=/tmp/hive-try-app HIVE_LOCAL_SESSION=hive-try HIVE_SANDBOX=1 /Applications/Hive.app/Contents/MacOS/Hive`. With `HIVE_SANDBOX` set, the app does not register `hive://` links, its server ignores `HIVE_*` variables from the environment except `HIVE_HUB`, and the welcome skips the steps that would touch a real server. From a checkout, `npm run onboarding:try` in `app/` does the same with a temporary state folder.
- To start over for real: quit the app, end the local chats (`tmux kill-session -t hive-local`, which stops every local chat), then move `~/.hive` and the app's own folder aside. The next start runs the welcome again, makes a new identity, and has no chats, no extra logins and no settings.
- The agents' own logins (`~/.claude`, `~/.codex` and the others) are not in `~/.hive`. Starting over leaves them alone.

## Uninstall

1. Quit the app. On macOS use ⌘Q, because closing the window only hides it.
2. Stop the local chats if you want them gone: `tmux kill-session -t hive-local`.
3. Remove the app:
   - macOS: move `/Applications/Hive.app` to the Trash.
   - AppImage: delete the file.
   - rpm: remove the `hive` package (for example `sudo dnf remove hive`).
   - Windows: Settings, Apps, Hive, Uninstall. The uninstaller keeps your data.
4. Delete the state, if you want it gone: `~/.hive`, the app's own folder (see "The app's own folder") and, on Linux, `~/.cache/hive`.
5. The agent CLIs and their logins are separate programs. Uninstall them with their own tools.

## In the code

- `README.md`
- `docs/run-your-own.md`
- `app/main.js`
- `app/main/boot.js`
- `app/main/update.js`
- `app/main/ota.js`
- `app/main/revive.js`
- `app/main/relay.js`
- `app/server.mjs`
- `app/lib/env.mjs`
- `app/lib/config.mjs`
- `app/lib/hive-identity.mjs`
- `app/lib/doctor-client.mjs`
- `app/lib/doctor-ignored.mjs`
- `app/lib/traces.mjs`
- `app/doctor/doctor.mjs`
- `app/doctor/doctor-runner.mjs`
- `app/doctor/doctor-readings.mjs`
- `app/doctor/doctor-core.mjs`
- `app/routes/updates.mjs`
- `app/routes/onboarding.mjs`
- `app/src/app/welcome.js`
- `app/src/app/avatars.js`
- `app/src/app/tour.js`
- `app/package.json`
- `server/engine/claude-binary.mjs`
- `infra/scripts/setup.sh`
- `infra/scripts/pack-js.sh`
- `infra/scripts/publish-release.sh`
- `.github/workflows/release.yml`
