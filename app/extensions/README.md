# Extensions

An extension is a folder with two files: `extension.json` and `index.mjs`. The
ones anyone can install live in a repository of their own, named in the
[README at the root](../../README.md#extensions), and are installed by copying.
The app finds extensions in three places, in this order:

| Origin | Folder | Turned on |
|---|---|---|
| built-in | `app/extensions/<name>/` — this folder, shipped with the app | by default |
| hub | `<hub>/extensions/<name>/` — tracked in the hub's own repository | only after someone turns it on |
| personal | `~/.hive/extensions/<name>/` — this machine only | only after someone turns it on |

A built-in name is reserved: a copy of it in the hub or in `~/.hive` is reported
and not loaded. When the hub and `~/.hive` both hold the same name, the personal
one wins and the hub one is reported as shadowed.

## The catalog

The extensions panel has two tabs. **installed** lists what is on this machine;
**explore** lists the catalog: every folder of the extensions repository named in
the [README at the root](../../README.md#extensions) that holds a manifest and a
module. The repository comes from `HIVE_EXTENSIONS_REPO` in `~/.hive/config`, or
from `HIVE_REPOS_OWNER` followed by `/hive-extensions` when that is not set. The
catalog is read when the tab opens and kept for ten minutes.

**install** copies the folder into `~/.hive/extensions/<name>`, leaves its tests
out, writes a `.store.json` beside it (repository, commit, version) and turns the
extension on, recording its hash as turning it on by hand does. No reopening:
the app finds the new folder at once. An extension that asks for a hook this
hive does not know cannot be installed until the hive is updated.

**uninstall**, at the end of the settings tab, removes only a folder that has a
`.store.json`: a copy made by hand is never deleted by the app. The key and what
the extension stored stay, so installing it again picks up where it stopped,
unless the confirmation is asked to forget them.

## The manifest

```json
{
  "name": "pedtec-title",
  "version": "1.0.0",
  "description": "Prefixes the chat title with the tech request it serves.",
  "hooks": ["seat.title"],
  "settings": {
    "prefix": { "type": "string", "default": "p.t.", "label": "prefix" }
  }
}
```

`name` is the folder's name: lowercase words joined by hyphens, at most 40
characters. `title` is what the panel shows (the name when absent) and `icon` is
the id of one of the app's symbols, like `i-plug`. `logo` names an SVG file inside
the folder, the mark of the service the extension talks to; the panel and the
catalog show it in place of the icon. `hooks` lists what the module
will register; a hook the app does not know keeps the extension from loading.

### Settings

```json
"settings": {
  "prefix":  { "type": "string",   "default": "p.t.", "label": "prefix", "description": "goes before the request number" },
  "token":   { "type": "password", "label": "API token", "required": true, "placeholder": "lin_api_…" },
  "channel": { "type": "dropdown", "data": [{ "title": "engineering", "value": "C01" }, { "title": "support", "value": "C02" }] },
  "loud":    { "type": "boolean",  "default": false }
}
```

Types are `string`, `number`, `boolean`, `password` and `dropdown`. Every
setting can carry `label`, `description`, `placeholder` and `required`; a
dropdown lists its choices in `data`. The panel builds the form from this.

Values live in `~/.hive/config.jsonc` under `extensions.<name>.settings` and are
checked against the manifest when read. A `password` never goes there: it is
kept in `~/.hive/extension-secrets.json`, mode 0600, and the panel never sends
it back to the screen. An extension with a `required` setting still empty is
listed as needing it and does not run until it is set.

## The module

```js
export default function pedtecTitle(hive) {
  hive.on("seat.title", ({ title, errand, mission, settings }) => `${settings.prefix}430 | ${title}`);
}
```

The default export receives the hive and registers handlers with `hive.on`.
Plain ESM, no dependencies beyond Node: the app does not run `npm install` for
anyone.

The `hive` an extension receives also carries:

- `hive.storage` — `get(key)`, `set(key, value)`, `remove(key)`, `all()`,
  `clear()`. Small JSON, private to this extension, kept in
  `~/.hive/extension-state/<name>.json`; at most 256 KB.
- `hive.paths.support` — a folder of this extension's own, for anything bigger,
  under `~/.hive/extension-state/<name>/`. `hive.paths.dir` is where its files are.
- `hive.log(line)` — a line in the app's log, prefixed with the extension's name.

## The hooks

**`seat.title`** — `({ name, where, title, mission, status, errand, settings }) => string`.
Runs synchronously every time the app lists seats, after the clean title was
already remembered and stamped. What it returns is the label the rail, the seat
list and the palette show; nothing is written. The result is cached per seat
until the title, the errand or the first line of the mission changes.

**`seat.opening`** — `async ({ body, prompt, settings }) => { body?, prompt?, name? }`.
Runs before a seat is born. What it returns is
merged into the request: the mission, the branch, the title, the errand and the
seat's name. Each extension has 1500 ms; past that the seat opens without it.

**`routes`** — `(on) => { on(method, path, handler) }`.
Runs once, when the module loads. Each route lives under `/api/ext/<name>/`,
the same door every client of the hive goes through; a path outside it, a
method other than `GET`, `POST` or `null` (any), or a path registered twice is
reported and not registered. The handler is
`async ({ method, url, body, settings, storage }) => value`: what it returns is
answered as JSON with 200, `undefined` answers `{ ok: true }`. To answer with
another status, `throw hive.refuse(404, "no such thing")`. Any other exception
answers 500, is listed as a problem, and the route keeps serving: one bad
request never turns the extension off. While the extension is off, its routes
answer 404.

```js
export default function linear(hive) {
  hive.on("routes", (on) => {
    on("GET", "/api/ext/linear/mine", async ({ settings }) => fetchMine(settings.token));
    on("POST", "/api/ext/linear/issue", async ({ body }) => {
      if (!body.key) throw hive.refuse(400, "give an issue key");
      return fetchIssue(body.key);
    });
  });
}
```

**`tasks.read`** — `async ({ tasks, settings }) => void`.
Runs when someone opens the tasks, before the list is answered. `tasks` reaches
only the personal tasks of whoever runs this hive (the ones nobody else sees):
`list()`, `add({ text, done })`, `edit(id, { text, done })` and `remove(id)`.
What it writes there does not come back through `tasks.changed`. Each extension
has 4000 ms; past that the list is answered without waiting, and what it writes
afterwards shows up the next time the tasks are opened.

**`tasks.changed`** — `async ({ change, task, before, settings }) => void`.
Runs after a task this person owns was written from the hive: `change` is
`added`, `edited` or `removed`, `task` is how it ended up and `before` how it
was. It runs after the answer went out, so a slow extension never holds the
screen. Personal and shared tasks both arrive; `task.who` says which.

The `todoist` extension, in the repository named in the
[README at the root](../../README.md#extensions), uses both to keep the
personal tasks in a Todoist project.

Extensions run in order: built-in, hub, personal, alphabetical within each. The
second receives what the first returned.

## What holds

- An exception in a handler is reported and that hook is skipped until the
  extension is turned on again. It never takes the app down.
- Turning an extension on records the hash of its `index.mjs` in the config. A
  module that changed on disk since it was turned on shows as changed and is not
  loaded until someone turns it on again.
- A module is imported once per app run. A change on disk after that is shown
  as stale; reopening the app is what picks it up.
- Everything runs in the app's process, on the desktop. The pod runs no
  extensions, so `peers`, the phone, the archive and the transcript see the
  clean title.
