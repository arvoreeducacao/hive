import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HERE = new URL("..", import.meta.url).pathname;
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const history = readFileSync(join(HERE, "src/app/history.js"), "utf8");
const cut = (text, from, to) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${from} is not in the source`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${to} does not follow ${from}`);
  return text.slice(a, b);
};

test("the archive scan reads the records the other agents' drivers keep, on this machine and on the box", () => {
  const scan = cut(server, "const HIST_SCAN = `", "rm -rf \"$D\"");
  assert.match(scan, /"agent": \*"\(codex\|kimi\|kiro\|cursor\|opencode\)"/);
  assert.match(scan, /==J==/);
  assert.match(scan, /events\/\$n\.ndjson/);
  const here = cut(server, "async function scanLocalHistory", "async function runHistoryScan");
  assert.match(here, /sessionsDir: join\(HIVE_HOME, "sessions"\)/, "the local scan reads a sessions folder other than the one the hive writes");
  assert.match(here, /eventsDir: join\(HIVE_HOME, "events"\)/, "without the events folder an agent seat has no hour and no first line");
  const run = cut(server, "async function runHistoryScan", "async function readArchiveFile");
  assert.match(run, /parseHiveSessions\(r\.out, "cloud", cloud\)/);
  assert.match(run, /HIVE_SESSIONS="\$HIVE_STATE_DIR\/sessions"/);
});

test("a revive opens the seat on the agent that started the conversation", () => {
  const revive = cut(server, "async function reviveSession(", "const PREVIEW_TAIL_BYTES");
  assert.match(revive, /agent = ""/);
  assert.match(revive, /const other = otherAgentAsked\(agent\)/);
  assert.match(revive, /other \? OWN_SESSION_ID : /, "a kimi id is refused by the claude transcript pattern");
  assert.match(revive, /resumeId: id, structured, compactAt, agent: other \|\| "claude"/, "the box is not told which agent to revive on");
  assert.match(revive, /driverFileFor\(other\)/, "a native revive on another agent does not reach that agent's driver");
  assert.match(revive, /agent: other \|\| "claude",\n\s+cwd: dir \|\| fallback/, "the fleet forgets which agent the revived seat runs on");
  assert.match(revive, /JSON\.stringify\(\{ session_id: id, \.\.\.\(other \? \{ agent: other, cwd: dir \|\| fallback, \.\.\.\(wanted \? \{ model: wanted, model_id: wanted \} : \{\}\) \} : \{\}\) \}/);
  assert.match(revive, /if \(wanted\) assertSpawnArgs\(\{ model: wanted \}\);/, "a model off a history row reaches the shell unchecked");
  assert.match(history, /agent: agentOfRow\(s\), model: s\.model \|\| ""/);
});

test("a revive on the box is never handed a folder from this desk, and the person hears why a revive did not open", () => {
  const revive = cut(server, "async function reviveSession(", "const PREVIEW_TAIL_BYTES");
  assert.match(revive, /cwd: dir\.startsWith\(`\$\{CLOUD_ROOT\}\/`\) \? dir : ""/, "a synced session's local folder is sent to the box, where it does not exist, and the seat dies on the spot");
  const reviveAs = cut(history, "async function reviveAs(", "$(\"rh-native\")");
  assert.match(reviveAs, /catch \(wrong\)/);
  assert.match(reviveAs, /could not revive it/, "a refused revive is swallowed, and the history panel just sits there");
});

test("bring-local says plainly that another agent's conversation cannot be copied, instead of hunting a claude transcript", () => {
  const bring = cut(server, "async function bringLocal(", "async function reviveSession(");
  assert.match(bring, /own store on the server/);
  assert.ok(bring.indexOf("otherAgentAsked(agent)") < bring.indexOf("bad session id"));
});

test("the preview of another agent's conversation comes off the events file, here or on the box", () => {
  const preview = cut(server, "async function previewSession(", "const SYNC_CONFIG");
  assert.match(preview, /return previewOwnSession\(String\(id\), where\)/);
  const own = cut(server, "async function previewOwnSession(", "async function previewSession(");
  assert.match(own, /HIVE_SEAT_OF_SESSION, \[id\]/);
  assert.match(own, /hiveEventMessages\(tailOfFile\(events, PREVIEW_TAIL_BYTES\)\)/);
  const route = cut(server, "const HIVE_SEAT_OF_SESSION = `", "async function previewOwnSession(");
  assert.match(route, /"\$HIVE_STATE_DIR"\/sessions\/\*\.json/);
  assert.ok(route.includes(String.raw`grep -qF "\\"$1\\""`), "the id is matched as a whole quoted word, not as a substring of some other id");
});

test("the fleet learns the session id the agent named from the driver's init event", () => {
  const remember = cut(server, "function rememberStructuredSession(", "const MODEL_WORDS");
  assert.match(remember, /OWN_SESSION_ID\.test\(id\)/);
  assert.match(remember, /seat\.kind !== "structured" \|\| seat\.id === id\) return/);
  const tail = cut(server, "function parseStructuredTail(", "function structuredStateOf(");
  assert.match(tail, /sessionId = e\.session_id \|\| sessionId/);
  const collect = cut(server, "async function collect()", "const alive = new Set");
  assert.equal((collect.match(/rememberStructuredSession\(name, "(local|cloud)", structuredInfo\)/g) || []).length, 2);
});
