# Hosting the hive for a team

The hive knows nothing about where your company runs it. It does not know your
cluster, your domain, your wiki or how you name a person's server. All of that
lives in one folder of your own, the **deployment folder**. The same hive then
serves any company: each one brings its own folder.

You do not need one to use the hive alone, or with a single server you started
with `docker compose`. You need one when a team shares a way of hosting the
hive: one server per person, a cluster, internal services.

## Where it lives

The deployment folder is any folder that holds a file called `hive.defaults`.
Its name is yours to choose. Two places are searched, in this order:

1. a folder at the top of the hive checkout, for example `hive/acme/`;
2. a folder at the top of your hub, the workspace that holds your repositories,
   for example `~/work/hive-acme/`.

The hub is the better place. It is already private, every person already has it,
and the servers already clone it. The hive checkout stays exactly as it is
upstream.

`infra/scripts/setup.sh` finds the folder, copies its values into
`~/.hive/config`, and writes the folder's name as `HIVE_DEPLOYMENT_DIR`. From
then on, the app reads the values from there and looks for the scripts there.

## What goes in it

```
hive-acme/
├── hive.defaults          the addresses and names of your hosting
├── hive-setup.sh          optional: where one person's server is
└── scripts/
    ├── pod-power.sh       optional: the power switch of a person's server
    ├── pod-memory-sync.sh optional: mirrors the agent's memory to the server
    └── pod-cloud-sessions.sh  optional: sets session sync up on the server
```

Anything else in the folder is yours: cluster manifests, cloud roles, the
scripts that provision a server. The app never runs them.

Every piece is optional. Without one, the part of the app that needs it turns
off and says so, in words that point at whoever runs your servers.

### `hive.defaults`

One `HIVE_KEY=value` per line. The app only takes the keys below from it. A key
that says who this machine is, such as `HIVE_DEV`, `HIVE_POD` or
`HIVE_SERVER_URL`, is ignored here. A value already in `~/.hive/config` wins
over this file.

| Key | What it sets |
|---|---|
| `HIVE_DOOR_DOMAIN` | the domain your servers answer on |
| `HIVE_NAMESPACE`, `HIVE_CLUSTER`, `HIVE_AWS_PROFILE`, `HIVE_POD_CONTAINER` | where a person's server runs, for your own scripts to read |
| `HIVE_RELEASE_REPO` | the GitHub repository whose releases the app offers as updates |
| `HIVE_REPOS_OWNER` | the GitHub owner of your repositories |
| `HIVE_EXPECTED_REPOS` | the repositories the doctor expects to find in the hub, comma separated |
| `HIVE_EXTENSIONS_REPO` | the repository of the extension catalog |
| `HIVE_POKERS` | the people who may poke a teammate's chat, comma separated |
| `HIVE_MEMORY_URL`, `HIVE_MEMORY_PLUGIN` | a shared memory server, and the agent plugin that reads it |
| `HIVE_LEAF_URL`, `HIVE_LEAF_PARENT` | a wiki the shelf mirrors its pages to, and the page they go under |
| `HIVE_AVEIA_URL` | an Aveia for meeting captions ([meetings.md](meetings.md)) |
| `HIVE_INTERNAL_DOMAINS` | your domains, so a secret that names them is caught before it leaves a chat |
| `HIVE_APP_PACKAGES` | short names for your Android apps, as `name=package` pairs |

### `hive-setup.sh`

`setup.sh <handle> <hub>` runs it with the person's handle. It prints the lines
that say where that person's server is, and `setup.sh` writes them into the
config:

```bash
#!/usr/bin/env bash
name="${1:?usage: hive-setup.sh <name>}"
echo "HIVE_SERVER_URL=https://hive-$name.acme.example"
echo "HIVE_POD=box-$name-0"
```

This is the only place that knows how your servers are named. Without it,
each person types their server's address in the app.

### `scripts/pod-power.sh`

The power switch of a person's server. The app runs it to learn whether the
server is up and to wake one that is asleep, and the doctor's buttons run it to
repair one. It reads `HIVE_POD` and the rest from `~/.hive/config`. It is called
with one verb:

| Verb | Asked by | What it must do |
|---|---|---|
| `status` | the app | print `up` or `down` |
| `reachable` | the app | exit 0 when the switch itself can reach your platform |
| `up` | the app, the doctor | start the server |
| `restart` | the app, the doctor | restart the server |
| `env <file>` | the app | hand the server the variables in that file |
| `why` | the doctor | print why the server is not up |
| `why-node <node>` | the doctor | print why the machine under it went away |
| `force-remove` | the doctor | remove a server stuck on its way down |
| `exec <script>` | the doctor | run a script on the server |
| `shell <command>` | the doctor | run an interactive command on the server |

Without it, the app treats the server as something it cannot switch on, and the
doctor's server repairs have nothing to run.

### `scripts/pod-memory-sync.sh`

Run with `--quiet` when the app starts and every ten minutes after, while the server is up. It mirrors the
agent's memory between this machine and the server. The app passes
`HIVE_HOME`, `HIVE_HUB`, `HIVE_POD` and `HIVE_NAMESPACE`.

### `scripts/pod-cloud-sessions.sh`

Run once, when a person turns session sync on, as
`pod-cloud-sessions.sh <handle> <repository url>`. It sets the same sync up on
the person's server. Without it, the app tells the person to ask whoever runs
the server.

## Setting a machine up

```
infra/scripts/setup.sh <handle> ~/work
```

The second argument is the hub. `setup.sh` prints which deployment it took:

```
deployment defaults: hive-acme/hive.defaults
```

Run it again whenever `hive.defaults` changes. Its keys are written again from
the file; any other line in `~/.hive/config` is kept.
