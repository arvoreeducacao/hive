# MCP servers

How every chat gets its MCP servers: adding them to the hub, credentials, OAuth logins, the gateway, the Hive's own tools, ceilings, and troubleshooting.

## Where a chat's MCP servers come from

A chat gets MCP servers from three places. `<hub>` below is the hub's root folder, the one with `hive.json` (see the "hub" topic).

- **The hub.** Remote (HTTP) servers live in `<hub>/.mcp.json`. Command (stdio) servers live in `<hub>/.mcp-servers/servers.json` and run inside the MCP gateway, one local process on `127.0.0.1:4671`. Chats reach the gateway's servers through one server named `hub`.
- **The provider's own user config**, for example `~/.claude.json` or `~/.codex/config.toml`. The Hive reroutes some of these entries (see "What each provider receives").
- **The Hive itself.** Every chat gets a server named `hive` with the Hive's own tools (`peers`, `message`, `spawn`, `browser_*`, `guide` and more). A Claude chat opened as `anonymous` ("a chat that leaves nothing behind") gets no MCP server at all, not even `hive`.

`<hub>/hive.json` has an `mcps` map that says where each server applies: `"*"` for every repository, or a list of repository names. This scope only orders the output of `mcp_list` and the workspace screen. It does not hide a server from any chat.

The Hive stores no MCP credential of its own. Every variable a server needs comes from `<hub>/.env` (see "Credentials: the hub's .env").

## Add a server from the workspace screen

1. Open the `⋯` menu at the top right ("everything else") and pick `workspace`. The command palette item `workspace` opens the same screen.
2. In the `mcp servers` card, click `+ add`.
3. Pick the kind: `remote (url)` or `command (stdio)`.
4. Fill in the fields:
   - `name`: lower-case letters, digits, dots and dashes. The name `hub` is reserved for the gateway.
   - `url` for a remote server, or `command that starts it` for a command server, for example `npx -y <package>@latest`. The Hive splits the command on spaces: the first word is the program, the rest are its arguments. There is no quoting.
   - `variables it needs (names only)`: UPPER_CASE names, separated by commas or spaces.
   - `applies to (empty: every repository)`: repository names that are already in `hive.json`.
5. Click `see what changes` to read the plan, then click `write`.

What `write` changes (nothing is committed):

- `hive.json`: one line under `mcps` with the scope.
- Remote: one entry in `.mcp.json`, `{"type": "http", "url": ...}`. If you named variables, the first one becomes the header `Authorization: Bearer ${VAR}`. Edit `.mcp.json` by hand for any other header.
- Command: one entry in `.mcp-servers/servers.json` with `command`, `args` and `env` (`"VAR": "${VAR}"` for each variable). It also adds the `hub` entry to `.mcp.json` if it is missing, and tells the gateway to reload.
- `.env`: the Hive does not write it. The plan lists the variables that `.env` does not set yet.

The line after the write gives the result: `<name> is in; the gateway reloaded`, or `<name> is in, but has no credentials: set <keys> in the .env of the hub`.

The card also offers fixes. A server in `.mcp.json` or `servers.json` but not in `hive.json` gets `write it into hive.json`. A server in `hive.json` with no url and no command gets `set it up`.

Chats that are already open keep the list they opened with (see "Check a chat's MCP servers and find a missing one").

## Add a server by hand: the file formats

A remote server in `<hub>/.mcp.json`:

```json
{
  "mcpServers": {
    "tracker": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ${TRACKER_TOKEN}" }
    }
  }
}
```

A command server in `<hub>/.mcp-servers/servers.json`:

```json
{
  "servers": {
    "errors": {
      "command": "npx",
      "args": ["-y", "@example/errors-mcp@latest"],
      "env": { "ERRORS_TOKEN": "${ERRORS_TOKEN}" },
      "optionalEnv": []
    }
  }
}
```

The `hub` entry in `<hub>/.mcp.json`. Claude chats get the `hub` server only through this entry:

```json
"hub": {
  "type": "http",
  "url": "http://127.0.0.1:4671/mcp/hub",
  "headers": { "Authorization": "Bearer ${HIVE_MCP_GATEWAY_TOKEN}" }
}
```

Rules:

- Put command servers in `servers.json`, not in `.mcp.json`. The Hive hands the non-Claude providers only `.mcp.json` entries that have a `url` and a `type` of `http` (or no `type`).
- A `servers.json` entry can also be remote: give `url` and `headers` instead of `command`. The gateway connects to it and fills the headers from `.env`.
- The gateway replaces `${VAR}` in `env` and `headers` with the value from `<hub>/.env`. A missing variable becomes an empty string. Put a variable in `optionalEnv` when the server works without it.
- A command server starts in `<hub>` and gets every variable of `<hub>/.env`, not only the ones in its `env`. Relative paths in `args` resolve from `<hub>`.
- Install npm packages in `<hub>/.mcp-servers/` (`npm install` there). The gateway does not start while `<hub>/.mcp-servers/node_modules` is missing, even if every server runs through `npx`.
- After you edit `servers.json`, reload the gateway (see "Restart or reload the gateway").

## Credentials: the hub's .env

`<hub>/.env` holds every MCP credential. Write one `KEY=value` per line. A line that starts with `#` is a comment. Quotes around the value are removed. Do not put `export` before the key: the gateway reads the key literally.

Who reads the file:

- **The gateway** loads `<hub>/.env` on top of its own environment, so the file wins. It reads the file again after it changes: when it starts a server, answers `/health`, or gets `/reload`. A server that is already running keeps the old values until it sleeps (after 10 idle minutes) or until `/reload`. When `.env` changed, `/reload` stops every running server, and each one starts again with the new values on its next call.
- **Each chat on this machine**, when the Hive opens it, gets in its environment every variable that `<hub>/.mcp.json` names as `${VAR}`, with the value from `<hub>/.env`. If `.env` does not set `HIVE_MCP_GATEWAY_TOKEN`, the value comes from `<hub>/.mcp-servers/.token`. No other `.env` variable reaches the chat. A value added later reaches a chat only after the chat is reopened.

To fill in a value without showing it in a chat:

1. The agent calls `request_secret` with a short `label`. The person types the value in a private card on their screen.
2. The agent gets back a file path, never the value. The file is deleted after 24 hours.
3. The agent appends it without printing it, for example `printf 'TRACKER_TOKEN=%s\n' "$(cat <path>)" >> <hub>/.env`.
4. The agent reloads the gateway, and reopens the chats that use a `.mcp.json` server with that variable.

`request_secret` works only in a chat on this machine.

## What each provider receives

Every chat gets `hive`, the gateway's `hub` when the gateway is up (a Claude chat only when `.mcp.json` has the `hub` entry), and the remote servers of `<hub>/.mcp.json`. The way they arrive differs:

- **Claude.** The Hive opens the session with every settings source on, so Claude loads `.mcp.json` and its user config by itself. The Hive adds `hive`. In the user config (`~/.claude.json`, or `<account dir>/.claude.json` for another account), stdio servers under `mcpServers` and under `projects.<folder>.mcpServers` whose name matches a `servers.json` server (or that name plus `-direnv`) are replaced, in that chat, by the gateway route `http://127.0.0.1:4671/mcp/<name>`. The other entries start as usual.
- **Codex.** The Hive passes `-c mcp_servers.<name>=...` to `codex app-server`: `hive` as a command, `hub` as a url with `bearer_token_env_var = "HIVE_MCP_GATEWAY_TOKEN"`, and each remote server with `http_headers`. In `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`), stdio servers that the gateway also serves are turned off for the chat (`enabled=false`). Codex names change every character other than letters, digits and `_` into `_`.
- **Kimi, Kiro, Cursor, Gemini.** The Hive passes the servers in the `mcpServers` list of the ACP `session/new` and `session/load` calls: `hive` as a command, `hub` and the remote servers as `http` with headers. It does not touch their own config files.
- **Kiro only.** Servers named in `HIVE_KIRO_MCP_SKIP` (comma-separated) are left out, with a warning `mcp <name> left out of this kiro seat`. The variable replaces a built-in default list. Use it for a server whose tool schema has `oneOf`, `allOf` or `anyOf` at the top level, which makes the model refuse the whole tool list.
- **OpenCode.** The Hive passes `OPENCODE_CONFIG_CONTENT` with an `mcp` map: `hive` as `local`, the others as `remote`. A key that does not start with a letter gets `mcp_` in front. OpenCode names each tool `<server>_<tool>`.
- **Antigravity.** Each chat gets its own HOME at `<state dir>/agy/<seat>/home`. The Hive writes `.gemini/config/mcp_config.json` there: the servers of the person's `~/.gemini/config/mcp_config.json`, plus `hive`, `hub` and the remote servers (remote ones use `serverUrl`). On the same name, the Hive's entry wins.

For the non-Claude providers, the Hive fills `${VAR}` in remote headers from the chat's environment when the chat opens. It skips `.mcp.json` entries whose url points at the gateway (`http://127.0.0.1:4671/...`), because it adds `hub` itself. When the running gateway is an old one without the `hub` route, providers get one entry per gateway server instead.

## Servers that need an OAuth login

In a chat, `/mcp` shows a server that waits for a login as `needs authorization`, with an `authenticate` button. Claude, Codex, Kiro and OpenCode report this status. Kimi, Cursor and Gemini do not report per-server status, so their servers show as `connecting`.

What `authenticate` runs, in the chat's own folder:

- **Claude:** `claude mcp login <server>` (with `--no-browser` on the server).
- **Codex:** `codex mcp login <server>`. If Codex does not know the server yet and it is an `http` entry of `<hub>/.mcp.json`, the Hive first runs `codex mcp add <name> --url <url>`.
- **OpenCode:** `opencode mcp auth <server>`.
- **Kiro** (this machine only): no command. The Hive takes the login page that Kiro reported for the server and waits until Kiro says it is connected.
- **Kimi, Cursor, Gemini, Antigravity:** the Hive cannot drive the login and says so. Kimi: sign in from a `kimi` terminal in the chat's folder. Cursor: run `agent mcp login` in a Cursor terminal there. Gemini: run `/mcp auth <server>` inside a `gemini` terminal there. Antigravity: run `/mcp` in an `agy` terminal there and authenticate the server. Then reopen the chat.

The flow in the card:

1. The button reads `waiting for the browser…` (on the server: `getting the login url…`).
2. An `open the login page` link appears, with a field: "finish the login, then paste the url of the page it lands on (even a broken localhost one)". Paste the address and click `confirm`.
3. The login gives up after 5 minutes (`the login timed out`).
4. After a good login, the Hive reconnects that server in the chat: `<name> authenticated — its tools answer in this seat now`. If that fails, the line says to reopen the seat with the same name.

The Hive keeps no OAuth token. The provider's own CLI stores it. The gateway runs no OAuth login: give a `servers.json` server its credential through `.env`.

## The MCP gateway

The gateway is one local process that runs the hub's `servers.json` servers for every chat on the machine.

- **Address:** `127.0.0.1:4671`. `HIVE_MCP_GATEWAY_PORT` changes the port.
- **Who starts it:** every chat checks `http://127.0.0.1:4671/health` when it opens. If nothing answers, the chat starts the gateway as a detached `node` process in `<hub>`, waits about 6 seconds, and logs to `<hub>/.mcp-servers/gateway.log`. On the server, the boot starts it (see "On the server").
- **Which hub:** `HIVE_MCP_HUB`, then `HIVE_HUB`, else the first folder above the chat's folder that has `.mcp-servers/servers.json`. A hub without that file has no gateway and no `hub` server.
- **Updates:** if the running gateway runs another file than the installed one (another Hive install, or a file from before an update), the next chat that opens stops it (SIGTERM) and starts the installed one.
- **Routes:** `/health` (no token), `/reload`, `/mcp/hub`, `/mcp/hive`, and `/mcp/<server>` for one server.
- **Token:** `HIVE_MCP_GATEWAY_TOKEN` if set, else `<hub>/.mcp-servers/.token`. The gateway creates that file (48 hex characters, mode 600) on its first start. Every route except `/health` needs `Authorization: Bearer <token>`. A request with an `Origin` header (a browser page) is refused.
- **On demand:** a server starts on its first call and sleeps after 10 idle minutes. Tool lists are cached in `<hub>/.mcp-servers/.manifest/`, one file per server definition and package version, so listing tools does not start a server. At start, the gateway catalogs in the background every server that has no cache yet.
- **When it is down:** chats open without `hub`, Claude chats run `hive` as their own stdio child, user-level stdio servers start directly, and remote servers keep working.

The `hub` server has three tools:

- `mcp_list`: every server with its tool count, first tools and missing credentials. `repo` puts the servers that apply to that repository first. It starts no server.
- `mcp_search`: `query` (every word must match the server, tool name or description), `limit` (1 to 20), and `server` to catalog only that server. It returns the schemas for `mcp_call`.
- `mcp_call`: `server`, `tool`, `arguments`. It starts the server if needed.

## Read the gateway's state

Ask the gateway directly:

```sh
curl -s http://127.0.0.1:4671/health
```

The fields (some names are Portuguese):

- `ok`: true when it answers.
- `configurados`: how many servers `servers.json` has.
- `acordados`: the servers running now.
- `catalogados`: how many servers have a cached tool list.
- `hub`, `peer`: the routes it serves (`/mcp/hub`, `/mcp/hive`). A missing field means an old gateway.
- `pid`, `script`, `scriptMtimeMs`: the process and the file it runs.
- `envFile`: the `.env` it reads.
- `faltando`: for each server, the variables that are missing or empty in `.env`.

No answer, or `ECONNREFUSED`, means no gateway listens on the port.

Read the log with `tail -40 <hub>/.mcp-servers/gateway.log`. Its lines are in Portuguese: `subiu <name>` (started), `catalogou <name>: N ferramentas` (catalogued), `dormiu <name>` (went to sleep), `falhou <name>: ...` (a request failed), `nao catalogou <name>: ...` (could not catalog), `<name> sem credencial: defina <KEYS> em <file>` (missing credential).

Read what a chat saw when it opened, in its own events file `<state dir>/events/<seat>.ndjson`. `<seat>` is the chat's name (`peers` shows "you are <name>" when other chats are open). The state dir is `~/.hive` on a desktop:

```sh
grep -E '"subtype":"mcp_(gateway|peer|routed)"' ~/.hive/events/<seat>.ndjson | tail -3
```

`mcp_gateway` has `ok`, `started`, `replaced`, `port` and `reason`. `mcp_peer` says whether `hive` came `via` `gateway` or `stdio`. `mcp_routed` lists the user-level servers moved to the gateway.

## Restart or reload the gateway

Reload rereads `<hub>/.env` and `servers.json` without a restart:

```sh
curl -s -X POST -H "Authorization: Bearer $(cat <hub>/.mcp-servers/.token)" http://127.0.0.1:4671/reload
```

If `HIVE_MCP_GATEWAY_TOKEN` is set, use that value instead of the file. The answer lists `servidores.novos` (new), `removidos` (removed) and `mudados` (changed), plus `recarregado` (true when `.env` changed) and `faltando`. New servers become callable through the `hub` of chats that are already open. Removed and changed servers stop. When `.env` changed, every running server stops and starts again on its next call. The workspace screen sends this reload after it adds a command server.

Restart the process:

1. Read `script` from `/health` if you will start it by hand.
2. Stop the process on the port, and only that one: `lsof -ti tcp:4671 | xargs kill`.
3. Open a new chat or reopen one: it starts the gateway again. To start it by hand: `cd <hub> && HIVE_HUB=<hub> nohup node <script> >> .mcp-servers/gateway.log 2>&1 &`.

The gateway keeps no MCP session between requests, so open chats can call it again as soon as it answers. If a chat still shows a server as `failed`, reopen the chat.

A tool list that is out of date: the cache changes only when the server's definition or its installed package version changes. A server run as `npx ...@latest` can change its tools with the same definition. Delete `<hub>/.mcp-servers/.manifest/<name>.*.json` and restart the gateway, which also keeps the list in memory.

## Gateway failures and fixes

- **`ECONNREFUSED 127.0.0.1:4671`, or `/health` does not answer.** No gateway listens. Open a new chat, which starts it, or start it by hand. If it still fails, read `gateway.log` and the chat's `mcp_gateway` reason.
- **Reason ``as ferramentas do hub nao foram instaladas: rode `npm install` em .mcp-servers/``.** `<hub>/.mcp-servers/node_modules` is missing. Run `npm install` in `<hub>/.mcp-servers/`, then open a new chat.
- **One server fails.** `mcp_call` answers `<server>/<tool> falhou: ...`, or `mcp_search` answers `<server> nao foi catalogado: ...`. Its command did not start, often because its package is missing from `.mcp-servers/node_modules`. Run `npm install` there. The gateway discards server stderr, so run the server's command by hand in `<hub>` to see its error. The next call tries again.
- **A missing key.** `mcp_list` shows `falta <KEY> no .env do hub`, `/health` lists it under `faltando`, and a remote `servers.json` entry fails with `<name> sem credencial: defina <KEY> em <hub>/.env`. Add `KEY=value` to `<hub>/.env`, then reload. A command server starts without the key and may fail on its own.
- **Reason `este hub nao declara ferramentas locais`.** The hub has no `.mcp-servers/servers.json`. This is not an error: there is nothing to serve.
- **Reason `gateway de pe na 4671, mas a credencial nao esta em <file> — aponte HIVE_HUB para o hub que subiu o gateway`.** A gateway is up, but the chat's hub has no token file, usually because the gateway belongs to another hub. Set `HIVE_HUB` to the hub that started it, or stop that gateway.
- **Reason `o gateway nao respondeu a tempo`.** It started but did not answer within about 6 seconds. Read `gateway.log`.
- **Reason `gateway velho na 4671 (...) e sem pid para derrubar` or `... nao saiu depois do SIGTERM no pid <N>`.** An old gateway did not stop. Kill the process on the port, then open a chat.
- **HTTP 401 `credencial invalida`.** The token sent is not the gateway's. The chat's `HIVE_MCP_GATEWAY_TOKEN` and `<hub>/.mcp-servers/.token` must match; reopen the chat after the token changes. `origem de navegador recusada` means a browser page sent the request.
- **HTTP 404 `servidor <name> nao existe`.** The name is not in `servers.json`. Fix the name or reload.

## The hive server: how it reaches a chat

`hive` is the Hive's own MCP server. It knows which chat calls it from `HIVE_SEAT` (the chat's name) and `HIVE_STATE_DIR`.

- **Claude chats** reach it through the gateway at `http://127.0.0.1:4671/mcp/hive`, with the headers `X-Hive-Seat`, `X-Hive-Side` (`local` or `cloud`) and `X-Hive-State-Dir`. One process serves every chat. If the gateway is down or has no `/mcp/hive` route, the chat starts `hive` as its own stdio child.
- **Every other provider** starts `hive` as a stdio child: the Hive's `node` with the `hive` entry file. Its config carries only the Hive's own variables (`HIVE_SEAT`, `HIVE_STATE_DIR`), so no token lands on the agent's command line.
- In the desktop app, the entry file follows the running version of the Hive.
- An anonymous Claude chat has no `hive` server.

The state dir is `HIVE_STATE_DIR`, else `HIVE_HOME`, else `/workspace/hive` when it exists (on the server), else `~/.hive`.

## The hive server's tools

Each tool and its ceiling (the "tools" topic describes each one):

- **Other chats:** `peers` and `peek` (read); `message` and `ask` (operate).
- **Opening and closing chats:** `spawn` (full), `close` (operate; only chats you opened, or this chat), `rename` (operate).
- **Pages on the team's shelf:** `publish` (full), `reply_on_page` (operate).
- **Browser pane:** `browser_screenshot`, `browser_snapshot`, `browser_cookies`, `browser_console`, `browser_network` (read); `browser_navigate`, `browser_profile`, `browser_resize`, `browser_eval`, `browser_click`, `browser_type`, `browser_select_option`, `browser_press_key`, `browser_wait_for`, `browser_tabs`, `browser_back`, `browser_forward`, `browser_reload`, `browser_upload` (operate); `browser_set_cookie` (full).
- **Device pane:** `device_screenshot`, `device_tree`, `device_logs` (read); `device_open`, `device_tap`, `device_swipe`, `device_type`, `device_key`, `device_close` (operate).
- **The person:** `task`, `buzz`, `reply_on_slack`, `request_secret`, `ask_person` (operate).
- **This guide:** `guide` (read). No argument lists the topics, `topic` reads one, and `search` returns the sections that match a few words.

The browser, device, secret and task tools work only in a chat of this Hive, with the app open on the same machine.

## Ceilings: read, operate, full

A ceiling limits which `hive` tools a chat may use. Each level includes the ones below it.

- **read:** look only. `peers`, `peek`, `guide`, `browser_screenshot`, `browser_snapshot`, `browser_cookies`, `browser_console`, `browser_network`, `device_screenshot`, `device_tree`, `device_logs`.
- **operate:** also talk, browse and act. `message`, `ask`, `close`, `rename`, `task`, `buzz`, `reply_on_slack`, `ask_person`, `request_secret`, `reply_on_page`, the other `browser_*` tools except `browser_set_cookie`, and the other `device_*` tools.
- **full:** also `spawn`, `publish` and `browser_set_cookie`.

How a chat gets its ceiling:

- A chat the person opens gets `full`.
- A chat opened with `spawn` gets the `ceiling` argument if it is narrower than the opener's, else the opener's. Without the argument it gets the opener's.
- The Hive records it only for chats on this machine. A chat opened on the server starts at `full`.
- The interface has no control for it. The ceilings live in `<state dir>/ceilings.json` (`~/.hive/ceilings.json` on a desktop), as `{"<seat>": "read"}`. `full` entries are dropped.
- To narrow a chat by hand, edit that file. Every call reads it, so the next call above the ceiling is refused. The tool list is filtered when the chat loads it.

A refused call answers: `this chat runs with a "read" ceiling, and message needs "operate" — ask the person to open it from a chat that may`.

## Reach the Hive's tools from outside

A terminal or another app can use the `hive` tools as an outside client. In the command palette (the magnifier at the top, "search anything"):

- `connect an agent from outside` copies the command that gives a Claude Code outside the Hive these tools, with the `read` ceiling.
- `connect an agent from outside that can talk` copies the same command with `operate`.

The copied command looks like this:

```sh
claude mcp add hive -e HIVE_CLIENT=terminal -e HIVE_CLIENT_CEILING=read -e HIVE_STATE_DIR=<state dir> -- <node> <entry>
```

`<node>` and `<entry>` are the Node binary and the `hive` entry file of the running Hive. For another MCP client, run the same `<node> <entry>` as a stdio server with the same variables.

The variables:

- `HIVE_CLIENT`: a label. Messages from the client arrive as `<label> (outside the hive)`.
- `HIVE_CLIENT_CEILING`: `read` (the default) or `operate`. Any other value, `full` too, gives `read`.
- `HIVE_STATE_DIR`: the Hive's state dir (`~/.hive` on a desktop).
- Do not set `HIVE_SEAT`: with it, the client acts as that chat, with that chat's ceiling. A client with neither `HIVE_SEAT` nor `HIVE_CLIENT` gets `full`, so always set `HIVE_CLIENT`.

What works from outside: `peers`, `peek` and `guide` with `read`; also `message` with `operate`. `ask` sends the question but cannot wait for the answer. The other tools act for a chat and answer that the session has no seat.


## Check a chat's MCP servers and find a missing one

See the list:

1. Ask the person to type `/mcp` in this chat's composer. The card lists each server with `connected`, `needs authorization`, `failed`, `connecting` or `turned off`, and its tool count. An empty list shows `this session has no MCP servers`.
2. For servers behind the gateway, call `hub` → `mcp_list`, then `mcp_search` with `server` to catalog one.
3. Read the chat's `mcp_gateway`, `mcp_peer` and `mcp_routed` events and the gateway's `/health` (see "Read the gateway's state").

If `/mcp` answers that the seat's driver is older than the native commands, close the seat and reopen it with the same name; resume keeps the conversation.

Why a server is missing:

- **It was added after the chat opened.** Each chat reads its MCP list when it opens. Close the chat and reopen it with the same name. Exception: a new `servers.json` server shows up through `hub` after a gateway reload, with no reopen.
- **`mcp_list` does not show a new `servers.json` server.** The gateway has not reloaded. Reload it.
- **No `hub` server at all.** The gateway is down, or the hub has no `servers.json`. Read the `mcp_gateway` reason.
- **A Claude chat has no `hub`, but other chats do.** `<hub>/.mcp.json` lacks the `hub` entry. Claude gets the gateway only from that entry.
- **A remote server is missing in a non-Claude chat.** Its `.mcp.json` entry has no `url`, has a `type` other than `http`, or points at the gateway.
- **A remote server is missing in a Claude chat.** Claude decides which `.mcp.json` servers it loads, by its own project settings.
- **`needs authorization`.** Log in (see "Servers that need an OAuth login").
- **Kiro warns `mcp <name> left out of this kiro seat`.** The server is in `HIVE_KIRO_MCP_SKIP` or the default skip list.
- **The chat is anonymous.** It has no MCP servers.
- **Tools exist but fail on credentials.** `mcp_list` shows `falta <KEY> no .env do hub`. Fill in `.env` and reload.
- **A server from the person's own config behaves like the hub's.** The gateway serves a server with the same name, so the Hive rerouted it (Claude) or turned the person's copy off (Codex).

## On the server

Chats on the server (see the "team-and-cloud" topic) use the server's own gateway on its own `127.0.0.1:4671`, with the hub the server was set up with (`HIVE_HUB`, default `/workspace/repos`). At boot, the server:

- copies its environment secret into `<hub>/.env` when `.env` is missing or empty;
- runs `npm ci` in `<hub>/.mcp-servers/` when `package-lock.json` changed;
- starts the gateway if `/health` does not answer, with the log in `<hub>/.mcp-servers/gateway.log`;
- writes `<hub>/.claude/settings.local.json` with `{"enableAllProjectMcpServers": true}` when the hub is a git checkout and the file is missing;
- exports `HIVE_MCP_GATEWAY_TOKEN` from the token file in its shell profile.

OAuth logins for server chats run in a tmux session named `mcp-auth-<seat>` on the server, for Claude, Codex and OpenCode only. `request_secret` refuses there: "a secret is only kept on this machine — ask for it from a local chat". The doctor's check `MCP credentials on the server` reads that gateway's `/health` and lists the missing keys.

## In the code

- `server/gateway/gateway.mjs`
- `server/gateway/mcp-gateway.mjs`
- `server/gateway/hub-facade.mjs`
- `server/engine/mcp-routing.mjs`
- `server/engine/peer-module.mjs`
- `server/engine/driver.mjs`
- `server/engine/codex-app-server.mjs`
- `server/engine/kimi-acp.mjs`
- `server/engine/kiro-acp.mjs`
- `server/engine/agents.mjs`
- `server/engine/antigravity-stream.mjs`
- `server/engine/opencode-server.mjs`
- `server/peer/peer-tools.mjs`
- `server/peer/ceilings.mjs`
- `server/peer/peer-mcp.mjs`
- `server/peer/peer-cli.mjs`
- `app/lib/hub-workspace.mjs`
- `app/routes/workspace.mjs`
- `app/routes/mcp.mjs`
- `app/routes/external-mcp.mjs`
- `app/lib/mcp-login.mjs`
- `app/lib/codex-mcp.mjs`
- `app/lib/secrets.mjs`
- `app/server.mjs`
- `infra/docker/workspace-boot.sh`
