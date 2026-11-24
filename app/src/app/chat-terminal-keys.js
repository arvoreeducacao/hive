const DRAWER_CODES = { KeyD: ["split", "split-down"], KeyN: ["new", ""], KeyW: ["close", ""] };

function chordOf(event, { mac, inTerminal, inDrawer }) {
  if (event.type !== "keydown" || event.altKey || !mac || !inDrawer) return "";
  if (!event.metaKey || event.ctrlKey) return "";
  if (event.code === "KeyK") return inTerminal && !event.shiftKey ? "clear" : "";
  return DRAWER_CODES[event.code]?.[event.shiftKey ? 1 : 0] || "";
}

const shortcutText = (code, { mac, shift = false }) => (mac ? `${shift ? "⇧" : ""}⌘${code}` : "");

const withShortcut = (said, key) => (key ? `${said} (${key})` : said);

export { chordOf, shortcutText, withShortcut };
