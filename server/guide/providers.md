# Agent providers

The agent CLIs a seat runs on: install, sign-in, logins, models, effort, plan mode, limits, failover and moving a chat between providers.

## The providers at a glance

A provider is an agent CLI that the Hive starts for a chat. The Hive does not ship a model or an API key of its own: each chat runs the CLI installed on the machine, with that CLI's own sign-in.

| Id | Name in the app | Program | How the Hive drives a chat | Sign-in command |
|---|---|---|---|---|
| `claude` | Claude | `claude` | the Claude Agent SDK, one process per chat | `claude auth login` |
| `codex` | Codex | `codex` | `codex app-server`, one per chat (JSON-RPC) | `codex login` |
| `kimi` | Kimi | `kimi` | `kimi acp`, one per chat (Agent Client Protocol) | `kimi login` |
| `kiro` | Kiro | `kiro-cli` | `kiro-cli acp --trust-all-tools`, one per chat | `kiro-cli login --use-device-flow` |
| `cursor` | Cursor | `cursor-agent` | `cursor-agent acp`, one per chat | `cursor-agent login` |
| `gemini` | Gemini | `gemini` | `gemini --acp --yolo --skip-trust`, one per chat | `gemini` (interactive) |
| `antigravity` | Antigravity | `agy` | one `agy -p` process per turn (stream-json) | `agy` (interactive) |
| `opencode` | OpenCode | `opencode` | `opencode serve` on 127.0.0.1, one per chat | `opencode auth login` |

Claude is the default. Each of the others works without any Claude subscription: the title of a new chat is also guessed by the chat's own provider.

## The providers screen

Open it with "providers and accounts" in the command palette, in the "everything else" menu (⋯), or with ⌥A on macOS (Ctrl+Shift+A elsewhere). Its title is "Providers", "the agents this hive can seat, and their logins".

- The left column lists every provider with its version and a status: "not installed", "turned off", "signed out", "authenticated", or "{n} logins". A version with an arrow (`1.2 → 1.3`) means a newer one is out.
- Each row has a switch. Off: "its models leave every picker, chats already open keep running". The switch does not move while the CLI is not installed.
- "check again" reads the binaries, versions and logins again. The screen rereads them every 30 seconds while open.
- The right side has three tabs: "Accounts" (the logins), "Configuration" (how the Hive runs it) and "Models" (what it can run here).

A provider appears in the model pickers only when it is on, installed and signed in. When one of those is missing, the picker says why: "{name} is turned off in providers", "{name} is not installed on this machine", or "nobody is signed in to {name} — open providers to sign in".

## Installing a provider CLI

The Hive finds each CLI by its program name on the PATH it took from your login shell when it started. If you install a CLI while the app is open, quit the app and open it again, then click "check again".

- Claude: the Hive ships a Claude binary of its own, inside the Claude Agent SDK. If a `claude` on the PATH (or in `~/.local/bin`) is at least as new, chats use that one; else they use the bundled one. The providers screen then says "chats use the claude that came with the hive ({version}) until this one is at least as new". `HIVE_CLAUDE=bundled` always uses the bundled one. The welcome suggests `npm install -g @anthropic-ai/claude-code`.
- npm packages the Hive knows for update checks: `@openai/codex` (Codex), `@google/gemini-cli` (Gemini), `opencode-ai` (OpenCode), `@anthropic-ai/claude-code` (Claude).
- Kiro, Cursor, Antigravity and Kimi come from their vendors' own installers. The Hive recognizes these native installs: `~/.local/bin/kiro-cli`, `~/.local/share/cursor-agent/`, `~/.local/bin/agy`, `~/.kimi-code/bin/`.
- The welcome's machine check passes with Claude signed in, or with any other of these CLIs installed.
- The "Configuration" tab's "binary path" tells the providers screen where the CLI is (for "installed", the version and updates). Chats still start the CLI by its program name from the PATH.

## Signing in

1. Open the providers screen and pick the provider.
2. On the "Accounts" tab, click "sign in" on the `default` row (the CLI's own login).
3. The CLI's own sign-in opens live in a terminal inside the screen: "the CLI's own sign-in, live — pick with the arrows, paste a key, the links open outside". Links open in your normal browser.
4. When the sign-in lands, the row turns green by itself ("when the sign-in lands, the login below turns green on its own"). "cancel" closes it.

The sign-in runs in a hidden tmux session named `hive-auth-<provider>` (a native terminal on Windows), so macOS and Linux need tmux for it. You can also sign in from your own terminal with the command in "The providers at a glance"; then click "check again".

How the Hive reads "who is signed in": Claude asks `claude auth status`. Codex, Kimi, Cursor, Gemini and OpenCode are read from their own files. Kiro asks `kiro-cli whoami`. Antigravity asks `agy models`. A row that says "could not ask this login who it is" means the CLI did not answer.

## More than one login per provider

A second login (a work account and a personal one, for example) is a separate home for the CLI, with its own sign-in and its own plan limit.

1. On the "Accounts" tab, type a nickname in "another login — its nickname" (lowercase letters, numbers and dashes, starting with a letter or a number; not `default`, not an email).
2. Click "sign in to {name} with another login", and finish the CLI's sign-in in the live terminal. You pick the real account in the browser sign-in; the nickname is only a label.
3. "remove" deletes the folder that holds that sign-in. It runs the CLI's logout first when the CLI has one. Chats on it keep running until they close. The `default` login cannot be removed here; sign out of it in the CLI.

Limits on more than one login:

- Antigravity: one login per machine, on every platform. `agy` keeps its logins in the system keyring. Switch accounts inside `agy`.
- Kiro on macOS: one login per Mac. `kiro-cli` reads `XDG_DATA_HOME` on Linux only and keeps its token in the login keychain.
- Cursor on macOS: one login per Mac. `cursor-agent` reads `XDG_CONFIG_HOME` on Linux only and keeps its token in `~/.cursor/auth.json`.

On those, the screen shows "One login for {name} on this machine, with the limit that comes with it." instead of the add field.

## Where logins live on disk

- `default` is the CLI's own home: `~/.claude`, `~/.codex`, `~/.kimi-code`, `~/.local/share` for Kiro (`~/Library/Application Support` on macOS), `~/.config` for Cursor (`~/.cursor` on macOS), `~/.gemini`, `~/.gemini/antigravity-cli`, `~/.local/share` for OpenCode.
- Extra Claude logins: `~/.hive/accounts/<nickname>/`, used through `CLAUDE_CONFIG_DIR`. It links `CLAUDE.md`, `settings.json`, `plugins`, `projects`, `commands`, `agents` and `skills` from `~/.claude`, and has its own `.claude.json` copied from `~/.claude.json` without the signed-in account.
- Extra logins of the other agents: `~/.hive/providers/<agent>/accounts/<nickname>/`. The CLI's home is mirrored there with links, except the files that hold the sign-in. The variable that points the CLI at it: `CODEX_HOME` (own `auth.json`), `KIMI_CODE_HOME` (own `credentials/` and `oauth/`), `XDG_DATA_HOME` for Kiro and OpenCode (own `kiro-cli/data.sqlite3`, `opencode/auth.json`), `XDG_CONFIG_HOME` for Cursor (own `cursor/auth.json`), `GEMINI_CLI_HOME` for Gemini (own `.gemini/oauth_creds.json` and `.gemini/google_accounts.json`).
- Per provider, next to the logins: `spent.json` (logins out of room, and until when) and `order.json` (the fallback order). For Claude these are in `~/.hive/accounts/`; for the others in `~/.hive/providers/<agent>/`.

## Which login a chat uses

- In the new-chat form, a login picker appears when the chosen agent has two or more logins. Each option shows the nickname and who it is signed in as.
- In an open chat, the account pill in the composer footer appears when the chat's agent has two or more logins. `/account` opens the same picker. Picking a login moves the chat to it.
- Each chat remembers the login it was opened on as its home login.

## Failover: when a login runs out

This works the same on every provider. When a turn ends on a refusal from the provider:

1. If the refusal says the login is signed out, the chat rereads the login once and runs the turn again.
2. Else the login is written in `spent.json` as out of room for the whole machine, until the hour the provider gave (or 30 minutes when it gave none).
3. The next login in the order that still has room takes the chat, and the same turn runs again on it. The chat shows which login took over.
4. When every login is out of room, the message fails and says so. If the reason was a limit, the chat waits for the earliest reset, plus 30 seconds, and runs the refused turn again by itself.
5. When the home login has room again and the chat is not busy, the chat moves back to it.

The plan-limit check (see "Plan limits") also marks a login as out of room when its plan reports 100% of a session, week or month.

The Hive never moves a chat to another provider by itself. Changing provider is always your choice (see "Moving a chat to another provider").

## Order of logins

The order is the order in which chats fall back. On the "Accounts" tab, the arrows "try this login sooner" and "try this login later" change it. The first row shows "first", and a login with an open chat shows "in use". Underneath it is `order.json`, a list of nicknames:

```json
["work", "default", "spare"]
```

A chat tries its own login first, then the rest in this order. A machine with one login per provider behaves as if this did not exist.

## Plan limits

The footer's plan chip ("how much of each plan is spent") shows how much of each signed-in plan is used. Click it for every login: each window with "{percent}% used" and "resets {when}". The reload button beside it, "ask the plans again", asks now.

- Claude: "current session" (5 hours), "current week · all models" and per-model weeks, read from Anthropic's usage endpoint with the login's own token (on macOS the token is read from the Keychain).
- Codex: its windows, read from `codex app-server`.
- Kimi: read from Kimi's usage API with the login's token.
- Kiro: "current month · credits" and per-bucket months, read from `kiro-cli chat --no-interactive /usage`.
- Cursor, Gemini, Antigravity and OpenCode: not read. Their chats still fail over on a refusal.

The plans are asked every 5 minutes, and at most every 15 seconds when forced. A plan at 80% is shown hot, at 95% full.

## Models: where the list comes from

The Hive keeps no list of models. Each CLI answers for itself, so a model that ships in a CLI update appears without a Hive update.

- Claude: the Agent SDK's supported models. Only the newest generation of each family is shown, plus `default`.
- Codex: `codex app-server`, `model/list`.
- Kimi, Kiro, Cursor, Gemini: the models the CLI lists when an ACP session opens.
- Antigravity: `agy models`. The reasoning level is part of the model id (for example `-high`).
- OpenCode: `opencode models --verbose` (or the running server's provider list), grouped by provider, as `provider/model`.

Where to pick a model: the model pill in the chat's composer footer, or `/model` (with a name, `/model <name>` switches at once). The first three rows have Ctrl+1, Ctrl+2 and Ctrl+3. The "Models" tab of the providers screen shows the same list: "What {name} can run here, as it answered the hive."

## Effort (reasoning level)

The levels belong to the model, and the Hive repeats the CLI's own descriptions. Pick with the effort pill or `/effort`.

- Claude: the model's own levels. With none set, the chat uses `effortLevel` from Claude's settings files, the same way Claude Code does.
- Codex: the model's reasoning efforts (`low`, `medium`, `high`, `xhigh` on most models).
- Kimi: the model's thinking setting, when the model offers one.
- Kiro: `low`, `medium`, `high`, `xhigh`, `max`.
- OpenCode: the model's variants.
- Cursor, Gemini, Antigravity: no effort. On Antigravity, pick a model id with the level in it.

A model with no levels leaves the pill dimmed, with the reason in its tooltip.

## Plan mode

Plan mode is Claude only. In a Claude chat, type `/plane-mode` to turn it on: "it plans, and nothing runs until you approve". The plan becomes a card you approve at once; it lists one line per chat to open. `/plane-mode off` turns it back. While it is on, a pill in the composer footer shows it; its tooltip says "this chat plans before it does anything, and nothing runs until you approve". On any other provider the command answers that it is Claude Code's own. `/config` and `/agents` are also Claude only.

## Moving a chat to another provider

An open chat can continue on another provider, with its conversation carried over.

1. Open the chat's model picker (the model pill, or `/model`).
2. The bar on the left of the picker shows the providers. Click another one ("continue this chat with {agent}"). For a chat on this machine, only providers that are on, installed and signed in are offered.
3. Pick a model. A status line above the composer shows the steps:
   - "waiting for the current turn before changing providers…": it waits up to 10 minutes for the turn, queued messages and open questions to end. "cancel provider change" stops it here, and only here.
   - "preparing the conversation for {agent}…" (2/3): the old session stops. The Hive saves the chat record and writes the whole conversation (user and assistant text, tool calls and results) to `~/.hive/transfers/<chat>/<id>/conversation.md`.
   - "connecting to {agent}…" (3/3): the chat starts on the new provider and model. It has 90 seconds to answer and to list that model.
4. Your next message carries the history: the first request, the most recent part of the conversation (about 48,000 characters, long entries clipped), a note that this is history and not a new request, and the path of `conversation.md`. Thinking is left out, and pictures become placeholders.

If any step fails after the old session stopped, the Hive restores it ("restoring the previous provider…") and shows "could not change providers: {error}" with "Try again". If the Hive restarts during a change, it restores the original chat on the next start. While a change runs, new messages are refused until it ends. Picking another model on the same provider only changes the model.

## The Configuration tab

"How this hive runs {name}. Saved in your config file." It writes `providers.<id>` in `~/.hive/config.jsonc`:

```jsonc
"providers": {
  "codex": { "enabled": true, "name": "Codex", "color": "#10A37F", "binary": "", "args": [], "env": {} }
}
```

- `enabled`: the on/off switch.
- `name` ("display name", up to 40 characters) and `color` ("colour", a hex like `#CD694A`): how the provider is shown in the pickers and the rail.
- `binary` ("binary path"): where the providers screen looks for the CLI.
- `args` ("launch arguments", up to 40) and `env` ("environment", up to 40 variables): saved here, but in this version chats are started without them.
- "home path" and "shadow home path" are read only: the CLI's own home, and the folder that holds the extra logins.

An unknown provider id or a value of the wrong shape is ignored.

## Updating a provider CLI

The Hive watches the CLIs' versions too. When one is behind, the top bar shows a button for "agents with a newer version out", and the providers screen shows "{version} is out" with "update".

- npm installs (`npm install -g`): the Hive runs `npm install -g --prefix <the same prefix> <package>@latest`.
- Homebrew installs: `brew upgrade <name>` (or `--cask`).
- Native installs: the CLI's own command: `claude update`, `codex update`, `opencode upgrade`, `kiro-cli update --non-interactive`, `cursor-agent update`, `agy update`, `kimi upgrade --yes`.
- When the Hive cannot tell how a CLI was installed, it shows the command to run in a terminal.
- Kiro, Cursor, Antigravity and Kimi have no npm package to compare with, so the screen offers "look for an update", which runs the native command.
- The Claude binary bundled with the Hive updates with the Hive (see the "start" topic).

New versions are looked up at most once an hour.

## Approvals and permissions

Every chat runs its CLI with approvals off, so nothing waits on a prompt nobody sees:

- Claude: bypass-permissions mode (plan mode is the exception).
- Codex: `approval_policy="never"` and `sandbox_mode="danger-full-access"`; terminal chats use `--dangerously-bypass-approvals-and-sandbox`.
- Kimi: its `yolo` mode. Kiro: `--trust-all-tools`. Cursor: `--force --trust` for terminal chats; the driver answers "allow" if asked. Gemini: `--yolo --skip-trust`. Antigravity: `--dangerously-skip-permissions`.

A chat can run any command its CLI can run, on everything the machine reaches.

## Claude

- Driven through the Claude Agent SDK. It has every feature: question cards, plan mode, `/config`, `/agents`, `/compact`, `/context`, `/mcp`.
- Sign in with `claude auth login`, or run `claude` once in a terminal.
- Plan limits are shown, and logins fail over on "usage limit reached", spend limits and a low credit balance. "please run /login", an expired OAuth session or an invalid API key counts as signed out.

## Codex

- One `codex app-server` per chat. `~/.codex/config.toml` is not changed. Question cards work through Codex's `request_user_input`, a feature Codex marks as experimental. If a Codex release drops it, the model asks in plain text.
- Sign in with `codex login`: a ChatGPT account (the screen shows its plan) or an API key (the screen shows "api key").
- Plan limits are shown. The autocompact ceiling is passed to Codex, which compacts by itself.

## Kimi

- One `kimi acp` per chat, in `yolo` mode.
- Sign in with `kimi login`. Kimi has no logout command, so removing a login only deletes its folder.
- Plan limits are shown. No question cards.

## Kiro

- One `kiro-cli acp --trust-all-tools` per chat. `/context` and `/mcp` show Kiro's own breakdown and the real state of each MCP server.
- Sign in with `kiro-cli login --use-device-flow`. On macOS, one login per Mac.
- Plan limits are shown (monthly credits). No question cards.
- A tool whose schema has `oneOf`, `allOf` or `anyOf` at the top level makes Kiro refuse the whole tool list. `HIVE_KIRO_MCP_SKIP` (comma separated, with a default) lists MCP servers to leave out of Kiro chats. A chat that fails on this names the tool and the variable.

## Cursor

- One `cursor-agent acp` per chat. Right after it starts, the driver authenticates with Cursor's own login; a chat with no login fails with one sentence pointing at the login.
- Sign in with `cursor-agent login`. On macOS, one login per Mac.
- No effort, no question cards. `/compact` works only when Cursor offers a compact command for the session. Plan limits are not read.

## Gemini

- One `gemini --acp --yolo --skip-trust` per chat.
- Gemini CLI has no login command. The sign-in opens the interactive `gemini`, where you pick Google or an API key. The choice is kept in Gemini's `settings.json` (`security.auth.selectedType`).
- An API key login counts only when `GEMINI_API_KEY` is set in the environment the Hive runs in. Vertex AI counts with `GOOGLE_API_KEY` or `GOOGLE_CLOUD_PROJECT`. The app passes its own environment on, so start it from a shell that has these variables.
- Google refuses personal Google accounts on Gemini CLI. On a personal account, use a Gemini API key or Vertex AI, or run the chat on Antigravity.
- No effort, no question cards, no `/compact` (Gemini compacts by its own threshold). Plan limits are not read.

## Antigravity

- One `agy -p` process per turn, resumed with `--conversation <id>`. Stop sends SIGINT and keeps the conversation.
- `agy` reads MCP servers only from its own config file, so each chat gets its own home at `~/.hive/agy/<chat>/home`. It mirrors your home with links, and only `.gemini/config/mcp_config.json` there is the chat's own. Commands the agent runs see that `HOME`.
- Sign in by running `agy` in a terminal (the sign-in opens it). One login per machine.
- No effort, no `/context`, no `/compact`, no question cards. Plan limits are not read.

## OpenCode

- One `opencode serve` per chat on 127.0.0.1, with a password of its own. The Hive's tools and MCP servers reach it through `OPENCODE_CONFIG_CONTENT`, so your OpenCode config files are not changed.
- Sign in with `opencode auth login`. One OpenCode login can hold keys for several model providers; the screen lists them.
- Question cards work. Models are grouped by provider. Plan limits are not read.

## What differs by provider

| | Claude | Codex | Kimi | Kiro | Cursor | Gemini | Antigravity | OpenCode |
|---|---|---|---|---|---|---|---|---|
| Effort | yes | yes | thinking | yes | no | no | in the model id | variants |
| Question cards | yes | yes | no | no | no | no | no | yes |
| Plan mode | yes | no | no | no | no | no | no | no |
| `/compact` | yes | yes | yes | yes | if offered | no | no | yes |
| Plan limits shown | yes | yes | yes | yes | no | no | no | no |
| More than one login | yes | yes | yes | not on macOS | not on macOS | yes | no | yes |
| Failover between logins | yes | yes | yes | yes | yes | yes | yes | yes |

## Troubleshooting

- A provider is missing from the pickers: open the providers screen. The status says which of "not installed", "turned off" or "signed out" applies.
- "not installed" right after you installed it: quit and reopen the Hive, so it reads the new PATH, then "check again".
- "signed out mid-answer — sign in again for chats to come back to it": the login expired during a turn. Click "sign in" on that row.
- "out of room until {when}": the login hit its plan limit. Add another login, or wait.
- "{agent} has no model to offer on this machine": the CLI answered with an empty list. Check the CLI in a terminal.
- A chat says "this chat is changing providers; send the message when it finishes": wait for the change to end, or for it to fail and restore.

## In the code

- `server/engine/providers.mjs`
- `server/engine/agents.mjs`
- `server/engine/accounts.mjs`
- `server/engine/failover.mjs`
- `server/engine/claude-binary.mjs`
- `server/engine/driver.mjs`
- `server/engine/codex-driver.mjs`
- `server/engine/codex-app-server.mjs`
- `server/engine/kimi-driver.mjs`
- `server/engine/kiro-driver.mjs`
- `server/engine/kiro-acp.mjs`
- `server/engine/cursor-driver.mjs`
- `server/engine/gemini-driver.mjs`
- `server/engine/opencode-driver.mjs`
- `server/engine/opencode-server.mjs`
- `server/engine/turn-driver.mjs`
- `server/engine/antigravity-stream.mjs`
- `server/engine/seat-command.mjs`
- `server/engine/transfer-context.mjs`
- `server/provider-transfer.mjs`
- `server/sessions.mjs`
- `app/lib/providers.mjs`
- `app/lib/accounts.mjs`
- `app/lib/limits.mjs`
- `app/lib/agent-updates.mjs`
- `app/lib/naming.mjs`
- `app/lib/config.mjs`
- `app/routes/providers.mjs`
- `app/routes/usage.mjs`
- `app/src/app/providers.js`
- `app/src/app/provider-transfer.js`
- `app/src/app/limit-chip.js`
- `app/src/app/chat-and-panes.js`
- `app/server.mjs`
- `docs/run-your-own.md`
