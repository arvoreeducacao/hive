# Working in this repo

## Never kill a server by name

A `pkill -f "node server.mjs"` matches every hive on this machine: the one behind
`/Applications/Hive.app` that runs your own session, and the dev servers of every
other seat working in a worktree. Killing them is how a session takes the whole
fleet down with it.

Kill the one you started, by its port:

```bash
lsof -ti tcp:8796 | xargs kill
```

Start your own on a port nobody else holds, never on 8790 — that one belongs to the
installed app:

```bash
cd app && PORT=8796 HIVE_NO_SWEEP=1 npm run server
```

The same rule holds for every long-lived process here (drivers, bridges, tmux
sessions): address the one you own, never a pattern that matches your neighbours.
