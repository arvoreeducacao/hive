import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { newSessionContext as kimiContext, carryOver as kimiCarry, translate as kimiTranslate } from "../engine/kimi-acp.mjs";
import { newSessionContext as kiroContext, translate as kiroTranslate } from "../engine/kiro-acp.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const drivers = { kimi: readFileSync(join(HERE, "engine/kimi-driver.mjs"), "utf8"), kiro: readFileSync(join(HERE, "engine/kiro-driver.mjs"), "utf8"), cursor: readFileSync(join(HERE, "engine/cursor-driver.mjs"), "utf8") };

const chunk = { method: "session/update", params: { update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "olá" } } } };

test("a muted context swallows the agent's updates, and the mute survives a carry-over", () => {
  const kimi = kimiContext();
  assert.equal(kimi.muted, false);
  assert.ok(kimiTranslate(chunk, kimi).length > 0);
  kimi.muted = true;
  assert.deepEqual(kimiTranslate(chunk, kimi), []);
  assert.equal(kimiCarry(kimi).muted, true);
  const kiro = kiroContext();
  kiro.muted = true;
  assert.deepEqual(kiroTranslate(chunk, kiro), []);
});

test("a session picked up into an empty events file gets its history painted back, marked as a replay; a full one keeps quiet", () => {
  for (const [agent, source] of Object.entries(drivers)) {
    assert.match(source, /const freshEventsFile = seq === 0;/, `${agent} does not know whether the events file is new`);
    assert.match(source, /ctx\.muted = !freshEventsFile;\n\s+ctx\.replaying = freshEventsFile;/, `${agent} does not open the replay on a fresh file`);
    assert.match(source, /if \(freshEventsFile\) emit\(\{ type: "driver", subtype: "replayed", session_id: sessionId \}\);/, `${agent} does not say the history was replayed`);
    assert.match(source, /emit\(ctx\.replaying \? \{ \.\.\.e, replayed: true \} : e\)/, `${agent} paints replayed turns as live ones, so the seat reads as working forever`);
    assert.match(source, /finally \{\n\s+ctx\.muted = false;\n\s+ctx\.replaying = false;\n\s+\}/, `${agent} leaves the replay flag up after the load`);
  }
});
