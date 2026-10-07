# Hive for Raycast

Reach Hive from anywhere on the Mac without switching windows.

| Command | What it does |
|---|---|
| New Hive Chat | Opens a chat that starts on the mission you write. The text selected on screen can travel along, quoted under the mission. |
| Go to Hive Chat | Lists the chats waiting on you, working and quiet. Enter brings the chat forward in Hive; ⌘R answers its question or sends it a message from Raycast. |
| Open from Hive Shelf | Finds a shelf page by title. Opens it in Hive, in the Leaf, or copies either link. |

The extension talks to the Hive app over its local socket (`~/.hive/hive.sock`, changeable in the extension preferences) and opens chats with `hive://seat/<name>` links. Both need a Hive build that knows `hive://seat` links and accepts `push` on `/api/say`.

## Install

```sh
cd raycast
npm install
npm run dev
```

`npm run dev` imports the extension into Raycast; it stays there after you stop the command.

## Test

```sh
npm test
```
