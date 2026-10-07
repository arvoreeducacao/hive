export const NATIVE_COMMAND_NAMES = ["model", "mcp", "context", "effort", "account", "agents", "config", "compact", "plane-mode"];

const NATIVE = new Set(NATIVE_COMMAND_NAMES);

/* a command is a word of its own anywhere in the text: "/name" that opens a word and closes one.
   a path pasted into the box ("/Users/someone/notes.md") never matches — the slash that follows
   the name is not a word end, so the token is not a token. */
const TOKEN = /(?:^|(?<=[\s([{'"]))\/([\w:-]+)(?![\w:/-])/g;

/* the head is the same token, in the one place the session reads a command from. */
const HEAD = /^\/([\w:-]+)(?:[ \t]+|$)/;

export function isNativeCommand(name) {
  return NATIVE.has(String(name || "").toLowerCase());
}

export function commandOf(text) {
  const hit = HEAD.exec(String(text ?? ""));
  return hit ? hit[1] : "";
}

export function stripCommand(text) {
  const said = String(text ?? "");
  const hit = HEAD.exec(said);
  return hit ? said.slice(hit[0].length) : said;
}

export function commandsIn(text) {
  const said = String(text ?? "");
  const out = [];
  TOKEN.lastIndex = 0;
  for (let hit = TOKEN.exec(said); hit; hit = TOKEN.exec(said)) {
    out.push({ name: hit[1], start: hit.index, end: hit.index + hit[0].length });
  }
  return out;
}

/* a native command is the seat's own control, not words for the session, and its argument is a
   short name — a model, a level. Lifting one out of the middle of a sentence handed the whole
   sentence to the driver as a model name, so it only counts when it opens the message. A session
   command still travels from anywhere: the rest of the sentence is its prompt, which is the point. */
export function commandCounts(one, text) {
  return !isNativeCommand(one?.name) || commandOf(text) === one?.name;
}

export function commandSpot(text, name) {
  const wanted = String(name || "");
  if (!wanted) return null;
  return commandsIn(text).find((one) => one.name === wanted) || null;
}

export function withoutCommand(name, text) {
  const said = String(text ?? "");
  const spot = commandSpot(said, name);
  if (!spot) return said;
  const left = said.slice(0, spot.start);
  const right = said.slice(spot.end);
  /* the token sat between two spaces when it was called mid-sentence: taking it out would leave
     both behind and the words would go out with a hole in them. */
  const mended = /[ \t]$/.test(left) && /^[ \t]/.test(right) ? right.slice(1) : right;
  return left + mended;
}

export function withCommand(name, text) {
  const command = String(name || "").trim();
  const said = String(text ?? "").trim();
  if (!command) return said;
  return said ? `/${command} ${said}` : `/${command}`;
}
