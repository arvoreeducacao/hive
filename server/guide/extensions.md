# Extensions

Extensions: JavaScript folders the desktop app runs to change chat titles and new chats, serve routes and sync tasks; writing, installing and debugging them.

## What an extension is

An extension is a folder with two files, `extension.json` (the manifest) and `index.mjs` (the module). The desktop app imports the module and calls it at fixed points, the hooks.

What an extension can do, one hook each:

- `seat.title`: "change the title the rail shows for a chat".
- `seat.opening`: "change what goes into a new chat before it opens" (its message, name, branch, title, errand).
- `routes`: "answer at its own addresses inside the hive", under `/api/ext/<name>/`.
- `tasks.read`: "read and write your own tasks when you open them".
- `tasks.changed`: "hear about every task you write in the hive".

It also gets a small private store, a folder of its own and a settings form built from its manifest.

What it cannot do:

- It has no screen of its own beyond the settings form.
- It runs only in the desktop app, never on the server. The server, `peers`, the phone, the archive and the transcript see the clean title.
- It cannot change anonymous chats: they skip `seat.opening` and keep their own title.

An extension runs inside the app's Node process with the same reach the app has on your machine: files, network and processes. There is no sandbox. Plain ESM; the app never runs `npm install` for an extension.

## Where extensions live

The app looks in three places, in this order:

| Origin | Folder | Starts |
|---|---|---|
| built-in | the app's own `extensions/` folder, shipped with the build | on |
| hub | `<hub>/extensions/<name>/`, shared through the hub's repository | off |
| personal | `~/.hive/extensions/<name>/`, this machine only | off |

- The folder name is the extension's name: lowercase words joined by hyphens, at most 40 characters. If the manifest's `name` differs, the folder wins.
- A built-in name is reserved. A copy of it in the hub or in `~/.hive` is reported as "reserved name — not loaded".
- When the hub and `~/.hive` hold the same name, the personal copy wins. The hub copy shows "shadowed by your copy — not loaded".
- On Windows, `~/.hive` is `%USERPROFILE%\.hive`.
- The app reads these folders when it starts. A folder added by hand shows up after you reopen the app. Installing or uninstalling from the catalog also reads them again.

## The extensions panel

Open it with "extensions" in the command palette. Its title is "Extensions", with "what this hive runs on top of the hive" under it.

- Two tabs: "installed · {n}" and "explore" (the catalog).
- "installed" groups the extensions as "built-in", "hub" and "personal · ~/.hive". Each row has a switch, "turn {name} on" or "turn {name} off".
- Pick one to see three tabs: "overview" (name, folder, version, hooks, routes, state), "settings" and "problems".
- "check again" asks the app for the state again. It does not find new folders, and "a module that changed still needs the app reopened".
- The panel asks again every 30 seconds while it is open.

The state line of an extension says one of:

- "on · {hooks}" or "off · {hooks}".
- "needs {keys} before it runs": a required setting is empty.
- "changed on disk — turn it on again": `index.mjs` changed since it was turned on.
- "on · reopen the app for the new code": `index.mjs` changed while the app runs.
- "on · {hook} skipped after an error": that hook threw and is off until the extension is turned on again.
- "problem — not loaded", "reserved name — not loaded", "shadowed by your copy — not loaded".

## Turn an extension on or off

1. Open the extensions panel.
2. Find the extension under "hub" or "personal · ~/.hive".
3. Click its switch. "on: the app records the module as it is now, and runs it from the next poll."
4. Fill in its "settings" tab, if it has one (see "Settings and secrets").

Turning one on writes `enabled: true` and the hash of `index.mjs` (the first 16 hex characters of its SHA-256) into `~/.hive/config.jsonc`:

```jsonc
{
  "extensions": {
    "ticket-title": { "enabled": true, "hash": "3f9a0c1b2d4e5f60", "settings": { "prefix": "T-" } }
  }
}
```

- Hub and personal extensions run only with `enabled: true`. A built-in runs unless `enabled` is `false`.
- When `index.mjs` no longer matches the recorded hash, the extension stays off until someone turns it on again. "the app never turns one back on by itself."
- Only `index.mjs` is hashed. A change to another file in the folder is not reported.
- An entry written by hand in `config.jsonc` takes effect when the app starts. An entry with `"enabled": true` and no `hash` loads without the change check.
- Each person turns on hub extensions for themselves; the setting lives in their own `~/.hive/config.jsonc`.

## Settings and secrets

The "settings" tab is built from the manifest's `settings`.

- Values go to `~/.hive/config.jsonc` under `extensions.<name>.settings`. They apply at once; no reopen.
- A `password` setting goes to `~/.hive/extension-secrets.json` (mode 0600) instead. The panel never shows it again: the field says "set — type to replace" or "not set".
- An extension with an empty `required` setting does not run. Its state says "needs {keys} before it runs".
- Values are checked against the manifest when read. A wrong type or an unknown key shows on the "problems" tab.

## Install from the catalog

The "explore" tab lists the catalog: every folder at the root of one GitHub repository that holds an `extension.json` and an `index.mjs`.

1. Open the extensions panel and click "explore".
2. Pick an extension. The detail shows "what it can do in your hive" and a warning: "an extension runs inside the hive, with the same reach the hive has on your machine."
3. Click "install". The app copies the folder into `~/.hive/extensions/<name>/`, leaves out test files (`*.test.js`, `*.test.mjs`), writes `.store.json` (repository, commit, version, time) and turns the extension on.
4. Fill in its settings.

- No reopen is needed after an install.
- "needs a newer hive": the extension asks for a hook this build does not know ("asks for {hooks}, which this hive does not know yet"). Update the Hive first.
- An extension with more than 40 files, or a file over 512 KB, cannot be installed.
- If a copy with that name is already on this machine and did not come from the catalog, the card says "copied by hand" and the install refuses. Remove that copy by hand first.
- The catalog is read when the tab opens and kept for ten minutes.

## Point the Hive at a catalog

The catalog repository is `HIVE_EXTENSIONS_REPO` (`owner/name`) from the environment or `~/.hive/config`. Without it, the Hive uses `<HIVE_REPOS_OWNER>/hive-extensions`.

- With neither set, "explore" says "this hive does not know where the catalog of extensions lives — set HIVE_EXTENSIONS_REPO in ~/.hive/config".
- The app reads the catalog through the GitHub API and `raw.githubusercontent.com` without a token, so the repository must be public.
- Reopen the app after you change the setting.

## Update and uninstall

- "update" shows on a catalog card when the installed `.store.json` version differs from the catalog's version. It installs the new copy over the old one and turns it on with the new hash. Settings stay.
- "uninstall" is at the end of the extension's "settings" tab. It only exists for an extension installed from the catalog; the app never deletes a copy made by hand.
- The confirmation "uninstall {name}?" has "also delete its key and what it kept". Left unticked, the settings, the key and the stored data stay, and installing it again picks up where it stopped.

## Write an extension

1. Make the folder: `mkdir -p ~/.hive/extensions/ticket-title` (personal) or `<hub>/extensions/ticket-title` (for the team).
2. Write `extension.json`:

   ```json
   {
     "name": "ticket-title",
     "version": "1.0.0",
     "title": "Ticket title",
     "icon": "i-plug",
     "description": "Puts the ticket number in front of each chat title.",
     "hooks": ["seat.title"],
     "settings": {
       "prefix": { "type": "string", "default": "T-", "label": "prefix" }
     }
   }
   ```

3. Write `index.mjs`:

   ```js
   export default function ticketTitle(hive) {
     hive.on("seat.title", ({ title, mission, settings }) => {
       const ticket = /#(\d+)/.exec(mission)?.[1];
       return ticket ? `${settings.prefix}${ticket} | ${title}` : title;
     });
   }
   ```

4. Reopen the app, so it finds the new folder.
5. Open the extensions panel and turn the extension on.
6. Check that its state says "on · seat.title" and that the "problems" tab says "no problem since the app came up".

After each edit to `index.mjs`: reopen the app, then turn the extension on again ("changed on disk — turn it on again").

## The manifest

`extension.json` keys:

- `name` (required): the folder's name.
- `version` (required): a short string such as `1.0.0` (letters, digits, `.`, `+`, `-`, `_`; up to 40).
- `hooks` (required): at least one of `seat.title`, `seat.opening`, `routes`, `tasks.read`, `tasks.changed`. An unknown hook keeps the extension from loading.
- `title`: what the panel shows, up to 60 characters. Default: the name.
- `description`: up to 200 characters.
- `icon`: the id of one of the app's symbols, such as `i-plug`.
- `logo`: the name of an SVG file in the folder (up to 64 KB). It replaces the icon in the panel and the catalog.
- `settings`: up to 20 keys. A key is letters and digits and starts with a letter.

Each setting has a `type`: `string`, `number`, `boolean`, `password` or `dropdown`. It can carry `default`, `label`, `description`, `placeholder` and `required`.

- A `password` cannot have a `default`.
- A `dropdown` lists its choices in `data`, as `{ "title", "value" }` objects or plain strings (up to 40). Its `default` must be one of the values.

Any problem in the manifest, a bad setting included, keeps the extension from loading. The "problems" tab names it.

## The module and the hive object

`index.mjs` has a default export, a function that receives the `hive` object and registers handlers. It runs once, when the extension loads.

- `hive.on(hook, fn)`: registers a handler. The hook must be in the manifest's `hooks`, or it is ignored and reported.
- `hive.storage`: `get(key)`, `set(key, value)`, `remove(key)`, `all()`, `clear()`. Small JSON kept in `~/.hive/extension-state/<name>.json`, at most 256 KB. A key is a short word such as `last-run`.
- `hive.paths.support`: a folder of its own for bigger data, `~/.hive/extension-state/<name>/`.
- `hive.paths.dir`: the extension's own folder. `hive.paths.hub`: the hub folder.
- `hive.log(line)`: a line in the app's output, prefixed `hive: extension <name>:`.
- `hive.refuse(status, message)`: an error to throw from a route.
- `hive.name`: the extension's name.

Every hook handler and route handler receives `settings`, the current values of the extension's settings.

## Hook: seat.title

`({ name, where, title, mission, status, errand, settings }) => string`

- Runs synchronously each time the app lists the chats. Return the label the rail, the chat list and the palette show. Nothing is written to disk.
- `title` is the chat's title, or what the previous extension returned. `mission` is the chat's first message. `where` is `local` or `cloud`.
- The result is trimmed to one line of at most 80 characters. An empty result keeps the title.
- The result is cached per chat until the title, the errand or the first line of the mission changes.

## Hook: seat.opening

`async ({ body, prompt, settings }) => ({ body?, prompt?, name? })`

- Runs before a new chat opens. `body` is the new chat request (for example `name`, `where`, `agent`, `model`, `repo`, `branch`, `title`, `errand`). `prompt` is its first message.
- What it returns is merged in: `body` keys override, a non-empty `prompt` replaces the message, and `name` names the chat when the request had none.
- Each extension has 1500 ms. Past that the chat opens without it, and the problem is noted; the hook stays on.

## Hook: routes

`(on) => { on(method, path, handler) }`

```js
hive.on("routes", (on) => {
  on("GET", "/api/ext/ticket-title/last", async ({ storage }) => storage.get("last") ?? null);
  on("POST", "/api/ext/ticket-title/last", async ({ body, storage }) => {
    if (!body.ticket) throw hive.refuse(400, "give a ticket");
    storage.set("last", body.ticket);
  });
});
```

- Runs once, when the module loads. Each path must start with `/api/ext/<name>/`, without `..` or `//`.
- The method is `GET`, `POST` or `null` (any). At most 40 routes. A path registered twice is reported and skipped.
- The handler gets `{ method, url, body, settings, storage }`. A `POST` body is parsed as JSON.
- The return value is the JSON answer with status 200. `undefined` answers `{ "ok": true }`.
- `throw hive.refuse(404, "no such thing")` answers `{ "error": "no such thing" }` with that status (400 to 599).
- Any other exception answers 500, is listed as a problem, and the route keeps serving.
- While the extension is off, its routes answer 404.

The routes live on the app's own server, the one the window talks to. On macOS and Linux it listens on the socket `~/.hive/hive.sock` (mode 600), or on `$HIVE_SOCK` when that is set; a home path too long for a socket moves it to the temp folder as `hive-<hash>.sock`. On Windows it is a named pipe. Test a route from a terminal: `curl --unix-socket ~/.hive/hive.sock http://hive/api/ext/ticket-title/last`.

## Hooks: tasks.read and tasks.changed

`tasks.read`: `async ({ tasks, settings }) => void`

- Runs when someone opens the tasks, before the list is answered.
- `tasks` reaches only the personal tasks of the person who runs this Hive: `list()`, `add({ text, done })`, `edit(id, { text, done })`, `remove(id)`.
- What it writes does not come back through `tasks.changed`.
- Each extension has 4000 ms. Past that, the list is answered without it, and what it writes later shows the next time the tasks open.

`tasks.changed`: `async ({ change, task, before, settings }) => void`

- Runs after a task this person owns was written from the Hive. `change` is `added`, `edited` or `removed`. `task` is the result and `before` the earlier version. `task.who` says whether it is personal or shared.
- It runs after the answer went out, so a slow handler never holds the screen.

Together, these two hooks can keep the personal tasks in step with an outside task list.

## Order and failures

- Extensions run in order: built-in, hub, personal, and alphabetical within each. For `seat.title` and `seat.opening`, each one receives what the previous one returned.
- An exception in a handler is reported, and that hook is skipped until the extension is turned on again. It never takes the app down.
- A timeout in `seat.opening` or `tasks.read` is reported, but does not skip the hook.
- A module is imported once per app run. Reopen the app to load new code.

## Debug an extension

1. Open the extensions panel and pick the extension. Read its state line.
2. Open the "problems" tab. It lists bad manifest fields, bad setting values, missing required settings, import errors, "threw while registering", hooks not declared in the manifest, hooks skipped after an error, timeouts and route errors.
3. Fix the file. Reopen the app if `index.mjs` changed, then turn the extension on again.
4. Read the app's output for `hive.log` lines (prefix `hive: extension <name>:`). Start the app from a terminal to see that output.
5. On macOS and Linux, ask the app for the raw state: `curl --unix-socket ~/.hive/hive.sock http://hive/api/extensions`. Each extension lists `enabled`, `loaded`, `on`, `changed`, `stale`, `missing`, `skipped`, `routes` and `problems`.
6. If a hand-made folder does not show at all, reopen the app; the folder name must be lowercase words joined by hyphens.

## Share an extension

- With your team: put the folder in `<hub>/extensions/<name>/` and commit it with the hub. Each person turns it on in their own panel (see the "hub" topic).
- With everyone: add the folder to the catalog repository by pull request. "missing one? the extensions live in their own repository, and anyone can propose one by pull request."

## In the code

- `app/lib/extensions.mjs`
- `app/lib/extension-store.mjs`
- `app/routes/extensions.mjs`
- `app/src/app/extensions.js`
- `app/src/panels/extensions.jsx`
- `app/extensions/README.md`
- `app/lib/env.mjs`
- `app/lib/config.mjs`
- `app/server.mjs`
- `app/main/relay.js`
