# Team and cloud

Your own Hive server, trust and invites, the phone, encrypted sync, the team's shelf of pages, the Slack bridge and team deployment files.

## The pieces beyond one laptop

- **The desktop app** runs local seats on this machine and signs every request it sends with its own key.
- **A Hive server** is one node process. It runs cloud seats, keeps the list of trusted keys (the roster), relays the team's panels and stores the sealed sync logs. It needs no Kubernetes and no cloud account; a container on any machine is enough.
- **The phone** is a web page the server itself serves at `/phone/`. Nothing is installed from a store.
- **A team** is a set of servers that know each other, normally one per person. They meet through a one-time invite link.
- **The shelf** is a private GitHub repository that every member clones. The `publish` tool writes pages there.

Everything team-related goes through a server: the "Who gets in" screen, invites, the team panel, the phone and cloud seats all need `HIVE_SERVER_URL` (see "Point the app at a server").

## Local and cloud seats (the side)

Every seat has a side. The new-chat form asks under **Where it runs**: "Local" (`local · your machine`) or "Cloud" (`cloud · server`).

| | Local | Cloud |
|---|---|---|
| Runs on | this computer | the Hive server |
| State folder | `~/.hive` (`HIVE_HOME`) | `<workspace>/hive` on the server (`/workspace/hive` in the container) |
| tmux session | `hive-local` | `hive` |
| Login | the accounts on this machine | the server's own login ("accounts live on your machine — a cloud chat uses the server's own login") |

- A cloud seat can take a **repo** ("the repo the cloud seat clones") and a **branch**. The server makes a git worktree at `/workspace/worktrees/<repo>/<seat>` from `origin/main`, on the branch `<owner>/-/<seat>` unless you name one. The repository must already be cloned at `/workspace/repos/<repo>`, or the seat fails with "there is no <repo> on this server".
- Every seat process gets `HIVE_SIDE` set to `local` or `cloud`.
- The ⋯ menu has **new terminal on the server** for a shell on the server.

## Run a server with Docker

From a checkout of the Hive:

```
cd infra/docker
docker compose up
```

- Compose builds one image (`hive:local`, service `hive`) with node 22, git, tmux, gh, ripgrep, openssh-server, mosh and the Claude Code CLI. Other agent CLIs are not in the image.
- The server answers on `http://127.0.0.1:8791`. Compose publishes the port on `127.0.0.1` only.
- On boot it prints `server: <host>:<port> — key SHA256:…` and `server: state in <folder>`. The key is the server's identity. If it changes without the volume being wiped, find out why before you trust it again.
- `GET /health` is the liveness check; the image's healthcheck calls it every 30 s. The container restarts `unless-stopped`.
- Every boot appends to `/workspace/hive/boot.log`; problems appear there as `boot-error step=<step> detail=<detail>`.
- If the hub folder has no `.env` and `/workspace/secrets/env` exists, boot copies that file to `<hub>/.env`.
- Attach to the seats from a terminal: `docker compose exec -it hive tmux attach -t hive`. Each seat is a window named after it. Detaching leaves everything running.

## Run a server without Docker

On a machine with node 22, tmux, git and the Claude Code CLI:

```
cd server && npm ci --omit=dev
HIVE_WORKSPACE=$HOME/hive node server.mjs
```

- The layout on disk is the same as in the container, under `HIVE_WORKSPACE`.
- Outside a container the server binds `127.0.0.1` (`HIVE_BROKER_BIND`). Set `HIVE_BROKER_BIND=0.0.0.0` only on purpose: there the bind is the only boundary.
- `HIVE_BROKER_SOCKET=<path>` makes it listen on a unix socket (mode 600) instead of a port.

## What the server keeps and where

Everything lives under one root, `HIVE_WORKSPACE` (default `/workspace`, the compose volume `workspace`). The volume is what survives a rebuild; delete it and you get a new key, no seats and no logins.

| Path | What |
|---|---|
| `/workspace/hive` | the state folder: `events/`, `sessions/`, `sock/`, `fleet.json` (seats written down on stop and restored on boot), `boot.log` |
| `/workspace/hive/allowed_signers` | keys trusted at boot (`HIVE_ALLOWED_SIGNERS` overrides) |
| `/workspace/hive/server/identity.json` | the server's own key pair (mode 600) |
| `/workspace/hive/server/roster.json` | every trusted key with its name and kind, and revocations |
| `/workspace/hive/server/peers.json` | peer servers and open invites |
| `/workspace/hive/server/grants.json` | lent keyboards |
| `/workspace/hive/server/sync/` | the sealed sync logs, blobs, asks, the phone roster and the notices key |
| `/workspace/repos` | the hub and the repositories (`HIVE_HUB` overrides) |
| `/workspace/worktrees` | worktrees of cloud seats |
| `/workspace/home` | `HOME` of the user inside the box, with the Claude credential |

## Server environment variables

| Variable | Default | What it decides |
|---|---|---|
| `PORT` | `8791` | the port the server listens on |
| `HIVE_PORT` | `8791` | the host port compose maps to it |
| `HIVE_BIND` | `127.0.0.1` | the host address compose publishes on; `0.0.0.0` opens it to the network |
| `HIVE_BROKER_BIND` | `127.0.0.1` (`0.0.0.0` inside the container) | the address the server process binds |
| `HIVE_BROKER_SOCKET` | none | listen on a unix socket instead of a port |
| `HIVE_SERVER_URL` | `http://127.0.0.1:8791` in compose | the address the server gives about itself; invites need it |
| `HIVE_SERVER_NAME` | `hive` in compose | the server's name; also the name that marks a key as yours in `allowed_signers` |
| `HIVE_OWNER_KEY` | none | one public key trusted as yours from boot |
| `HIVE_WORKSPACE` | `/workspace` | the root of everything it keeps |
| `HIVE_HUB` | `<workspace>/repos` | where the hub is |
| `HIVE_SEAT_WINDOWS` | `1` | open each seat in a tmux window |
| `HIVE_TMUX_SESSION` | from the workspace | the tmux session for those windows; set it when two servers share a machine |
| `HIVE_SSH_PUBKEY` | none | when set, sshd starts and accepts this key; when empty, sshd never starts |

## Make the server trust you

The server answers only signed requests from keys on its roster. There are no passwords or bearer tokens.

- The desktop app's key is `~/.hive/identity.json`; its public half is `~/.hive/identity.pub`. The app writes both on first start. This is the key a server must trust.
- Hand it to the server at start: `HIVE_OWNER_KEY="$(cat ~/.hive/identity.pub)" docker compose up`. The server adopts it on boot as your own machine; a restart with the same key changes nothing.
- The welcome screen shows the same thing: "Your server does not know this key yet." / "A server trusts the key it was started with. Hand it yours and restart it:" with a `HIVE_OWNER_KEY="…"` line to copy.
- More keys go in the `allowed_signers` file, one per line: `<name> ssh-ed25519 AAAA…`. A line whose name equals the server's name (`HIVE_SERVER_NAME`, else `HIVE_DEV`) becomes your own machine (kind `mac`). Any other name becomes a peer. The file is read on boot, so restart the server after you edit it.
- Each request carries `x-hive-key`, `x-hive-at`, `x-hive-nonce` and `x-hive-signature`. The signature covers the method, path, body hash, time, nonce and the server's own fingerprint. The server refuses a request more than 60 s off its clock or with a nonce it saw before.
- On the main API, only `GET /health`, `GET /api/broker` (the server's public key) and `POST /api/invites/redeem` answer without a signature. The phone page under `/phone/` is static and public; the sync under `/sync/` signs its own requests.
- A revoked key stays revoked. Putting it back in `allowed_signers` or `HIVE_OWNER_KEY` does not undo it; the roster keeps the revocation in `roster.json`.
- `infra/scripts/setup.sh` also makes `~/.hive/key-<name>` and prints a line for a server's `allowed_signers`. That is a separate SSH key; the app's HTTP requests are signed with `identity.json`.

## Point the app at a server

The app reads the server address from `~/.hive/config`, a file of `HIVE_KEY=value` lines (an environment variable of the same name wins over the file).

1. Add `HIVE_SERVER_URL=https://hive.example.com` to `~/.hive/config`.
2. Restart the app.
3. The app asks the server's `GET /api/broker` for its key and writes it as `HIVE_SERVER_KEY` in the same file. If the server later answers with a different key, the app writes the new one.

- The welcome screen checks the server: "Your server is answering.", then "Your server recognizes your signature."
- Running `infra/scripts/setup.sh` again rewrites `~/.hive/config` and drops a hand-written `HIVE_SERVER_URL`, unless the deployment's `hive-setup.sh` prints one. Write it again after setup.

## Sign in to Claude and other agents on the server

A cloud seat uses the server's logins, not the ones on your computer.

- **From the app:** the welcome step "Last door: log Claude in on the server." Press **Start the login**, **open the authorization page ↗**, sign in, paste the code into "code from the page" and press **Finish the login**. The app also pre-accepts Claude's trust and bypass dialogs on the server and starts Remote Control (button **start remote control**).
- **From a terminal:** `docker compose exec -it hive claude`, then sign in. The credential lands on the volume (`/workspace/home/.claude/.credentials.json`), once per server.
- **Other agents:** the image ships only Claude Code. Install another CLI on the server and run its own login in **new terminal on the server** or `docker compose exec -it hive <cli>`. The server reports which agent CLIs it has.
- **GitHub on the server:** `docker compose exec -it hive gh auth login`.

## Reach the server from somewhere else

Put the box on a machine with an address (a VPS, a cloud instance, a server at home). Two settings change, and neither happens by accident:

```
HIVE_BIND=0.0.0.0 HIVE_SERVER_URL=https://hive.example.com docker compose up
```

- `HIVE_BIND` decides who may reach the port. `HIVE_SERVER_URL` is what the server tells clients, phones and peers about itself, so it must be the address they can actually reach.
- The server speaks plain HTTP. Put something that terminates TLS in front of it (a reverse proxy or a tunnel of your choice). The phone page needs `https`, because the browser gives its key storage only to a secure origin (or `localhost`).
- Anyone who reaches the port reaches a machine that runs commands. Open it the way you would open SSH.
- `HIVE_SSH_PUBKEY="<public key>"` starts sshd in the box for that key; mosh is installed too.

## The "Who gets in" screen

Open it from the ⋯ menu: **who gets in**. It lists everything that can reach your server and refreshes every 15 s (**read again** forces it). With no server it says "no server answered".

- **devices**: your machines ("the machine you are on", "another machine of yours", a key from `allowed_signers` that never came in: "a key the trust file vouches for — no machine ever came in with it"), the server itself ("in the cloud"), phones and services. Machines show "always" and cannot be revoked here; phones and services have **revoke**.
- **pair a device** opens an eight-letter code for a phone; **connect a service** opens one for a service (see "Connect a service").
- **people**: peer servers ("in since … · sees your seat cards and can ask for the keyboard"), keys allowed by file that never came in ("by file"), and open invites ("an open invite", with **copy the link** and **cancel**).
- **invite someone** makes a new invite link.
- "someone invited you? paste the link here" plus **go in** joins someone else's team.
- Revoking access drops whatever is open on it at once.

## Your other machines

A second computer of yours joins your server as your own machine, not as a person.

1. On the second computer, open the Hive once so it writes `~/.hive/identity.pub`.
2. Add a line `<server name> <contents of identity.pub>` to the server's `allowed_signers`, where `<server name>` is the server's `HIVE_SERVER_NAME`.
3. Restart the server.
4. Put the same `HIVE_SERVER_URL` in that computer's `~/.hive/config` and restart its app.

- ⋯ menu → **my other machines** (config key `machines`, default off) decides whether your other computers may read and drive the seats of this machine. Seeing them in the rail does not depend on it.
- ⋯ menu → **this machine** (config key `machine`, up to 32 characters) is the name the team sees for this computer in the rail. Empty uses the computer's own name.

## Add a person to the team

People join through invites between servers. Each person has their own server, and both servers need a working `HIVE_SERVER_URL`: the joiner's server sends its own address, and invites refuse to open without one ("this server has no address to invite anyone to — set HIVE_SERVER_URL").

1. The inviter opens **who gets in** → **invite someone**, then **copy the link** ("send it in a DM, not in a channel").
2. The link is `hive://join?at=<server address>&key=<server fingerprint>&token=<token>`. It works once and lasts seven days.
3. The person clicks it, or pastes it under "someone invited you? paste the link here". Clicking opens their **Who gets in** with the link filled in: "an invite came in from … — go in when you know who sent it".
4. They press **go in**. Their server calls the inviter's server, checks that it answers with the key the link promised, and the two servers adopt each other as peers.

- A peer server can trade panels and messages, and touches a seat only while its keyboard is lent. It cannot open seats, run scripts or open terminals on your server.
- **revoke** next to a person forgets that peer.
- Invites are kept in `peers.json` on the server; the 32 newest are kept.

## What teammates see of each other

Each app publishes a **panel** to its server, and servers push panels to their peers. Your board is read from that cache.

- ⋯ menu → **share my fleet** (config key `share`, default on): "whether the team sees the cards of your fleet — titles and state, never the conversation". It also needs your Hive name (`HIVE_DEV`, set during the welcome).
- A seat card carries: name, title, local or cloud, state (needs, working, done, idle and so on), model, summary, short description, what it does now and up to six live tasks. Anonymous seats and plain shells are never published. Up to 40 seats.
- The panel also carries your face, the machine name and which shelf pages your seats have open.
- A panel not refreshed for about two and a half minutes shows as stale ("has the server up and nothing running — or the panel is closed, and the cards went stale.").
- **ask for the keyboard** on a teammate's card sends a keyboard request. The owner sees "keyboard request" with **lend it** or **not now**; **give it back** returns it.
- A poke ("just that — a poke") waves your face at the foot of their rail. Only people listed in `HIVE_POKERS` may poke.
- ⋯ menu → **shortcuts and settings** (⌥?) → **Notices** → **the team can knock** (config key `knocks`, default on). Off means "nothing from the team reaches you": no keyboard asks, pokes or questions.

## Ask another person: ask_person

A seat calls `ask_person` with `person` (their Hive name, lowercase) and `question`. The person sees "question from someone else" on their screen, presses **let it in** and picks which of their chats answers. Nothing reaches their chats without that approval, and nothing arrives while their **the team can knock** is off. The answer comes back to the asking seat as a message. Full tool list: see the "tools" topic.

## Pair a phone

The phone needs a server that the phone can reach over `https`.

1. In the app, open **who gets in** and press **pair a device**. It shows an eight-letter code and, when the server address is known, a QR code for `<server>/phone/?code=<code>`.
2. On the phone, scan the QR code, or open `https://<server>/phone/` and type the code under **invite code**. Name the phone under **this device** and press **come in**.
3. Add the page to the home screen. On iPhone: Share → Add to Home Screen.

- The code lasts five minutes, works once, and five wrong tries close it.
- Pairing turns on ⋯ menu → **my phone** (config key `phone`). That switch decides whether your paired phone may read and drive the seats of this machine. Turn it off and the chats stop travelling.
- The phone makes its own keys; the private halves never leave it. The code pairs a device for you; a teammate joins with an invite, not a code.
- On the phone, **this device** → **leave this device** → **erase everything here** wipes its keys and copies. To take it out for good, press **revoke** on it in **who gets in**.

## What the phone can do

- List every chat on your machines and open one, with answers in full, tools folded and questions as cards you answer with a tap.
- Type into a chat, send up to six pictures in one message, and stop the turn.
- In the composer, `/` offers the chat's commands, `#` your other chats, `@` files in the chat's folder and `~` people on the team.
- Pills above the box change the model, the effort and, for a chat on the computer, the login.
- **+** opens a new chat: the first message is the mission, and the header switches between computer and cloud (a cloud chat asks for the repo). This needs the Hive open on the computer.
- Open a shelf page inside the app.

The desktop has more; the phone has what a pocket needs.

## Phone notices and buzz

- On the phone: **this device** → **notices** → **let it tell me**, then choose **ended or asked** or **only when it asks** (the default). "On an iPhone it only rings with the app closed once you add the Hive to the home screen."
- Notices go through the browser's web push. A phone that is reading at the moment gets none. "Ended" notices to one phone are held to one per five minutes and say how many more chats ended.
- The `buzz` tool rings the phone at once with one line, for what cannot wait. Nothing arrives if no phone is paired, and the same seat cannot buzz twice inside five minutes.

## Connect a service

A service is a program (a bot, a triage queue) that may only open new chats for you.

1. **who gets in** → **connect a service**. The code lasts 30 minutes and works once.
2. Give the service the server's sync address (`<server>/sync`) and the code.

A service can read who it is, list the machines that can open a chat, and ask for a chat. Everything else is refused ("a service only asks for new chats"). Its request waits up to a day for the computer to come online. Remove it with **revoke**.

## How the sync works and what the server can read

The phone, your other machines and services read chats through the server's sync, under `/sync/` on the same address.

- Each chat gets its own key, made on the machine that runs it. Every line, picture and answer is sealed with that key (AES-GCM) and appended to a numbered log on the server.
- The chat key is wrapped for each of your devices' public keys (X25519). The server orders and delivers the logs and cannot open them.
- A device that was offline resumes from the last number it read. Two phones read the same log.
- New chats asked for from the phone, and questions to the computer (a shelf page, files, people, providers), travel the same way in sealed envelopes. A new-chat ask waits half an hour, a service's a day.
- Only your own machines and the server itself enroll in the sync; peers never do.
- Revoking a phone removes it from every chat's readers and closes its stream at once.
- The app logs `phone: this machine is enrolled at <server>/sync as <fingerprint>` when it works, or `phone: no server to hand the chats to yet` without a server. **who gets in** shows "the phones could not be listed: …" when the sync does not answer.

## Transcript sync to a private repository

The history screen (⌥H) can keep Claude transcripts in a private GitHub repository, so a conversation started on one machine continues on another.

- **sync to a private GitHub repo** sets it up. The repository must be private; if it does not exist, the app creates it private with `gh`. A public one is refused.
- **sync now** pushes and pulls every transcript, on this machine and on the server.
- The sync runs `scripts/cloud-sessions/cloud-sessions.mjs` from your hub. Without it, the app says "has no scripts/cloud-sessions/cloud-sessions.mjs — pull the hub first". Its settings are in `~/.claude/cloud-sessions.json`.
- On the server it is set up by the deployment's `pod-cloud-sessions.sh` (see "Deployment scripts").

## The shelf

The shelf (⋯ menu → **shelf**, ⌥E) is the team's gallery of pages, kept in one private GitHub repository that everyone clones.

- Set it in `~/.hive/config.jsonc`: `"shelf": "https://github.com/<owner>/<repo>"` (`git@github.com:<owner>/<repo>` also works). Everyone on the team sets the same repository.
- On first use the app checks the repository with `gh`: it refuses a public one, creates it private if it is missing, and clones it to `~/.hive/shelf`. Pointing at another repository replaces that clone.
- Each page lives in `a/<slug>/`: `<tab>.v<n>.html` per version, `meta.json`, `comments.json`, thumbnails and `prints/`. The slug comes from the page's `<title>`, so one title is one page.
- Tabs: `documento`, `telas`, `plano`, `lente`, `prints`. Each tab keeps its last 12 versions; publishing identical content only updates the label.
- Status labels: `draft`, `in-review`, `decided`, `delivered`, `closed` (a suffix is fine). A page moves only forward unless `reopen` is passed.
- The shelf filters by **mine** and **the team's**, and by label. A page has **Open in a seat**, **Copy link**, **See on GitHub** and **Full screen**.
- Every write is a commit pushed to the repository, retried up to three times after pulling.
- A page's link inside the Hive is `hive://shelf/<slug>?tab=<tab>`.
- With no repository set, the shelf says "The shelf has no repo yet."

## Publish a page

A seat publishes with the `publish` tool: `path` (an `.html` file), an optional `label`, `tab` and `reopen`. The `telas` tab takes a Screenbook proposal link (`proposal` plus the page's title in `page`) instead of HTML; the Screenbook store comes from `HIVE_SCREENBOOK_STORE`. Publishing goes through the Hive app on that machine and its shelf clone. With the app closed, it fails with "no hive answering on this machine — the app has to be open where the page is". Details of the tool: see the "tools" topic.

## Comments and pins on shelf pages

1. Open a page on the shelf and press **comments**.
2. Press **mark on the page**, then click a spot ("click on the page where you want to comment"), or write without a pin.
3. Write in "write the comment" and press **send**.

- Comments are saved in the page's `comments.json` on the shelf repository, up to 2000 characters each. A pin shows on the page; **go to the pin** and **remove the pin** act on it. A thread can be **settled** and reopened.
- The seat that published the page receives a line: `asked on "<title>" (…): <text> · hive://shelf/<slug>… · answer in the page with reply_on_page: slug "<slug>", thread "<id>"`.
- The seat answers with `reply_on_page` (`slug`, `thread`, `text`). The answer lands in the same thread, on the page, for everyone who opens it later.

## Slack bridge

With the bridge, a direct message to a Slack bot, or a mention of it in a channel, opens a local chat on your machine. The chat answers in the same thread with `reply_on_slack`, which is the only way back.

Connect through a relay (a bot someone on the team runs):

1. Open **shortcuts and settings** (⌥?) → **Slack** and press **connect**.
2. Send the code it shows to the bot in a direct message on Slack. The code is good for ten minutes.
3. The pane says "connected · <you>". **disconnect** removes the link (kept in `~/.hive/slack-link.json`).

- The relay address is `HIVE_SLACK_RELAY`, else `https://hive-slack.<HIVE_DOOR_DOMAIN>`. Without either, the pane says "this hive does not know where the team's bot lives".

Or use your own Slack app:

- Put `HIVE_SLACK_BOT_TOKEN` and `HIVE_SLACK_APP_TOKEN` (Socket Mode) in the environment or in the hub's `.env`. The pane then says "connected with this machine's own slack keys".
- `HIVE_SLACK_USERS` lists the Slack user IDs allowed to open chats here, separated by commas or spaces. Anyone else is turned away.

The bridge reacts with 👀 to a message it takes. Threads it follows are kept in `~/.hive/slack-chats.json`. If the bound chat is closed, the next message opens a new one.

## Slack threads in a seat

When a chat carries a link to a Slack thread, the seat menu shows it under **Slack threads**, with **open in Slack** and **mark as read in Slack**. The app reads Slack with `SLACK_USER_TOKEN` from the hub's `.env`; without it, it says "no SLACK_USER_TOKEN in the hub .env". Replying from here needs the `chat:write` scope, and reactions need `reactions:write`.

## Team memory server

The memories screen (⋯ menu → **memories**, ⌥⇧M) reads a team memory server at `HIVE_MEMORY_URL`. Editing and archiving ask you to sign in, and signing in works only in the Hive on your own machine. The sign-in is kept in the system keychain (macOS Keychain, or `secret-tool` on Linux) under "Hive memory". `HIVE_MEMORY_PLUGIN` names the agent plugin the doctor expects for it.

## Hosting for a team: the deployment folder

The Hive knows nothing about where a team hosts it. A team keeps that in a **deployment folder**: any folder at the top of the Hive checkout that holds a `hive.defaults` file. You need one only when a team shares a way of hosting servers (one per person, a cluster, internal services).

```
<deployment>/
├── hive.defaults              addresses and names of your hosting
├── hive-setup.sh              optional: where one person's server is
└── scripts/
    ├── pod-power.sh           optional: the power switch of a person's server
    ├── pod-memory-sync.sh     optional: mirrors agent memory to the server
    └── pod-cloud-sessions.sh  optional: sets transcript sync up on the server
```

- The folder name must match `[A-Za-z0-9_-][A-Za-z0-9._-]*`. `setup.sh` writes it as `HIVE_DEPLOYMENT_DIR` in `~/.hive/config`, and the checkout path as `HIVE_REPO`.
- A build copies every top-level folder's `hive.defaults` into the app, so an installed app still reads it. The scripts are run from `<HIVE_REPO>/<HIVE_DEPLOYMENT_DIR>/scripts/`.
- Everything else in the folder (manifests, provisioning) is yours; the app never runs it.
- Every piece is optional. Without one, the part that needs it turns off and says to ask whoever runs your servers.

## hive.defaults keys

One `HIVE_KEY=value` per line. The app takes only these keys from the file. Precedence: environment variable, then `~/.hive/config`, then `hive.defaults`.

| Key | What it sets |
|---|---|
| `HIVE_DOOR_DOMAIN` | the domain your servers answer on; also the default Slack relay `https://hive-slack.<domain>` |
| `HIVE_NAMESPACE`, `HIVE_CLUSTER`, `HIVE_AWS_PROFILE`, `HIVE_POD_CONTAINER` | where a person's server runs, for your scripts; a namespace or cluster makes `setup.sh` treat it as a cluster |
| `HIVE_RELEASE_REPO` | the GitHub repository whose releases the app offers as updates |
| `HIVE_REPOS_OWNER` | the GitHub owner of your repositories |
| `HIVE_EXPECTED_REPOS` | repositories the doctor expects in the hub, comma separated |
| `HIVE_POKERS` | people who may poke a teammate, comma separated |
| `HIVE_MEMORY_URL`, `HIVE_MEMORY_PLUGIN` | the team memory server and its agent plugin |
| `HIVE_SCREENBOOK_STORE` | where the shelf reads Screenbook proposals, `owner/repo` or an `https://` server; off when empty |
| `HIVE_INTERNAL_DOMAINS` | your own domains, comma separated, for the seats' scan of personal data |
| `HIVE_APP_PACKAGES` | short names for Android apps, as `name=package` pairs, comma separated |

## Set up a machine with setup.sh

```
infra/scripts/setup.sh <handle> <path-to-hub>
```

The welcome screen runs the same script when you press **Create my key**.

- It needs `tmux`, `git` and `gh` (`git` and `gh` on Windows) and prints the install command when one is missing. `kubectl` and `aws` are needed only for a server on a cluster.
- It writes `~/.hive/config` (mode 600) with `HIVE_DEV`, `HIVE_HUB`, `HIVE_REPO`, the lines of the first `hive.defaults` it finds, and `HIVE_DEPLOYMENT_DIR`. It prints `deployment defaults: <folder>/hive.defaults`.
- If `<deployment>/hive-setup.sh` is executable, it runs it with the handle and keeps the `HIVE_…=` lines it prints, for example `HIVE_SERVER_URL=https://hive-<handle>.example.com` and `HIVE_POD=<pod name>`. This is the only place that knows how your servers are named.
- Run it again whenever `hive.defaults` changes. Other lines in the config are kept, except `HIVE_DEV`, `HIVE_POD`, `HIVE_HUB`, `HIVE_REPO` and `HIVE_SERVER_URL`.
- If it finds the files of an old command-line install in `~/.local/bin`, it deletes them, the `hive` command included.

## Deployment scripts: power, memory sync, transcript sync

**`scripts/pod-power.sh`** is the power switch of a person's server. It reads `HIVE_POD` and the rest from `~/.hive/config`. Without it, the app treats the server as something it cannot switch on.

| Verb | Asked by | What it must do |
|---|---|---|
| `status` | the app | print `up` or `down` |
| `reachable` | the app | exit 0 when the switch can reach your platform |
| `up` | the app, the doctor | start the server |
| `restart` | the app, the doctor | restart the server |
| `env <file>` | the app | hand the hub's `.env` to the server and restart it |
| `verdict` | the doctor | print the server's state as JSON (`state`, `detail`) |
| `why` | the doctor | print why the server is not up |
| `why-node <node>` | the doctor | print why the machine under it went away |
| `force-remove` | the doctor | remove a server stuck on its way down |
| `exec <script>` | the doctor | run a script on the server |
| `shell <command>` | the doctor | run an interactive command on the server |

**`scripts/pod-memory-sync.sh`** runs with `--quiet` when the app starts and every ten minutes after, while the server is up. It gets `HIVE_HOME`, `HIVE_HUB`, `HIVE_POD` and `HIVE_NAMESPACE`.

**`scripts/pod-cloud-sessions.sh`** runs once when a person turns on transcript sync, as `pod-cloud-sessions.sh <handle> <repository url>`, with `HIVE_HUB` set. Without it, the app tells the person to ask whoever runs the server.

## Troubleshooting the server and the team

- "that key is not on the roster": the server does not trust this app's key. Start it with `HIVE_OWNER_KEY` or add the key to `allowed_signers`, then restart the server.
- "that request is Ns off the clock": the clocks differ by more than 60 s. Fix the clock on the computer or the server.
- "that key was revoked": revocation is permanent for that key. Use a new key, or remove the device's entry from `roster.json` with the server stopped.
- "this hive has no server address — put one in HIVE_SERVER_URL": add the address to `~/.hive/config` and restart the app.
- "no server answers at <address> — <reason>": the address is wrong, the server is down, or TLS in front of it is broken. Check `<address>/health`.
- "this server has no address to invite anyone to — set HIVE_SERVER_URL": restart the server with `HIVE_SERVER_URL`.
- "that server answered with a key the link did not promise": the invite link does not match the server that answered. Ask for a new link.
- "the phone switch is off, the chats stop travelling" in the log: turn on ⋯ menu → **my phone**.
- A cloud seat is stuck on a login prompt: sign Claude in on the server (see "Sign in to Claude and other agents on the server").
- The box will not boot cleanly: read `/workspace/hive/boot.log` for `boot-error` lines.

## In the code

- `docs/run-your-own.md`
- `infra/docker/compose.yaml`
- `infra/docker/workspace.Dockerfile`
- `infra/docker/workspace-boot.sh`
- `infra/scripts/setup.sh`
- `server/server.mjs`
- `server/identity.mjs`
- `server/roster.mjs`
- `server/invites.mjs`
- `server/peers.mjs`
- `server/grants.mjs`
- `server/inside.mjs`
- `server/worktree.mjs`
- `server/engine/paths.mjs`
- `server/sync/broker.mjs`
- `server/sync/device.mjs`
- `server/sync/runner.mjs`
- `server/sync/mount.mjs`
- `server/sync/notices.mjs`
- `server/sync/crypto.mjs`
- `server/phone/index.html`
- `server/phone/app.js`
- `server/peer/peer-tools.mjs`
- `app/server.mjs`
- `app/build.mjs`
- `app/lib/env.mjs`
- `app/lib/config.mjs`
- `app/lib/cloud-door.mjs`
- `app/lib/cloud-reach.mjs`
- `app/lib/hive-identity.mjs`
- `app/lib/phone-bridge.mjs`
- `app/lib/team.mjs`
- `app/lib/shelf.mjs`
- `app/lib/shelf-pins.mjs`
- `app/lib/slack.mjs`
- `app/lib/slack-bridge.mjs`
- `app/lib/slack-hive.mjs`
- `app/lib/slack-link.mjs`
- `app/lib/memories.mjs`
- `app/lib/memory-vault.mjs`
- `app/routes/portaria.mjs`
- `app/routes/team.mjs`
- `app/routes/slack.mjs`
- `app/routes/artifacts.mjs`
- `app/doctor/doctor-readings.mjs`
- `app/src/app/pod.js`
- `app/src/app/team.js`
- `app/src/app/shelf.js`
- `app/src/app/slack-prefs.js`
- `app/app.html`
