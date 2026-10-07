import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCommand, answerInput, frontWishes, endedOnApiError, eventLine, lastSeq, compactLine, noConversationToResume, sayEvent, sayGate, staleInterrupt, weaveImageMarks, inlineImageMarks, missionImagesFile } from "../engine/protocol.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("parseCommand accepts a typed object and refuses everything else", () => {
  assert.deepEqual(parseCommand('{"type":"say","text":"hi"}'), { type: "say", text: "hi" });
  assert.equal(parseCommand("not json"), null);
  assert.equal(parseCommand('"a string"'), null);
  assert.equal(parseCommand('["array"]'), null);
  assert.equal(parseCommand('{"text":"no type"}'), null);
});

const question = {
  questions: [
    { question: "Which color?", header: "Color", options: [{ label: "Red" }, { label: "Blue" }], multiSelect: false },
  ],
};

test("answerInput fills every question with a string", () => {
  const r = answerInput(question, { "Which color?": "Blue" });
  assert.equal(r.error, undefined);
  assert.equal(r.input.answers["Which color?"], "Blue");
  assert.deepEqual(r.input.questions, question.questions);
});

test("answerInput joins a multiSelect array into one string", () => {
  const r = answerInput(question, { "Which color?": ["Red", "Blue"] });
  assert.equal(r.input.answers["Which color?"], "Red, Blue");
});

test("answerInput names the missing question", () => {
  assert.match(answerInput(question, {}).error, /Which color\?/);
  assert.match(answerInput(question, { "Which color?": "  " }).error, /Which color\?/);
  assert.match(answerInput({ questions: [] }, {}).error, /no questions/);
});

test("answerInput takes an answer that came back under a worn key, in the order it was asked", () => {
  const two = {
    questions: [
      { question: "Which color?", options: [{ label: "Red" }] },
      { question: "Which size?", options: [{ label: "Big" }] }
    ]
  };
  const worn = answerInput(two, { "Which color": "Red", "Which size": "Big" });
  assert.equal(worn.error, undefined);
  assert.equal(worn.input.answers["Which color?"], "Red");
  assert.equal(worn.input.answers["Which size?"], "Big");
  assert.match(answerInput(two, { "Which color?": "Red" }).error, /Which size\?/);
});

test("sayEvent records what the person said so a restart can replay it", () => {
  const ev = sayEvent("look at this", ["/tmp/shot.png"], "c3-ab12c");
  assert.equal(ev.type, "user");
  assert.equal(ev.subtype, "say");
  assert.equal(ev.cid, "c3-ab12c");
  assert.deepEqual(ev.images, ["/tmp/shot.png"]);
  assert.deepEqual(ev.message.content, [{ type: "text", text: "look at this" }]);
  assert.equal(sayEvent("hi").cid, null);
  assert.match(compactLine(ev), /user: look at this/);
});

test("weaveImageMarks puts each image where its mark sits in the text", () => {
  const woven = weaveImageMarks("before [Image #1] between [Image #2] after", ["/tmp/a.png", "/tmp/b.png"]);
  assert.deepEqual(woven, [
    { text: "before " },
    { image: "/tmp/a.png" },
    { text: " between " },
    { image: "/tmp/b.png" },
    { text: " after" },
  ]);
});

test("weaveImageMarks keeps images without a mark ahead of the text, as before", () => {
  assert.deepEqual(weaveImageMarks("no marks here", ["/tmp/a.png"]), [
    { image: "/tmp/a.png" },
    { text: "no marks here" },
  ]);
});

test("weaveImageMarks leaves a mark that points at no image as plain text", () => {
  assert.deepEqual(weaveImageMarks("see [Image #4]", ["/tmp/a.png"]), [
    { image: "/tmp/a.png" },
    { text: "see [Image #4]" },
  ]);
});

test("weaveImageMarks drops the whitespace a lone mark leaves behind", () => {
  assert.deepEqual(weaveImageMarks("[Image #1] ", ["/tmp/a.png"]), [{ image: "/tmp/a.png" }]);
});

test("the pictures a mission carries ride in a file beside the words", () => {
  assert.equal(missionImagesFile("/h/.hive/prompts/seat.md"), "/h/.hive/prompts/seat.images.json");
  assert.equal(missionImagesFile(""), ".images.json");
});

test("every driver that reads a mission also reads the pictures beside it", () => {
  const engine = join(HERE, "..", "engine");
  for (const file of ["driver.mjs", "codex-driver.mjs", "kimi-driver.mjs", "kiro-driver.mjs", "opencode-driver.mjs", "turn-driver.mjs"]) {
    const src = readFileSync(join(engine, file), "utf8");
    assert.match(src, /missionShots\(promptFile\)/, `${file} opens a seat without the pictures the mission carried`);
    assert.doesNotMatch(src, /text: mission, images: \[\]/, `${file} throws away the pictures the mission carried`);
  }
});

test("the budget to open chats refills on the person's turn, and the seat spends it through the driver", () => {
  const src = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  assert.match(src, /if \(!from\) persistSession\(\{ births: BIRTHS_MAX \}\)/,
    "a message from the person has to refill the budget to open chats");
  const op = src.slice(src.indexOf("spendBirth: () => {"), src.indexOf("setTitle: () => {"));
  assert.match(op, /if \(asked > left\)/, "the op has to refuse before it writes");
  assert.match(op, /persistSession\(\{ births: left - asked \}\)/, "what was opened has to come off the budget");
  assert.match(op, /nothing was opened/, "the refusal has to say that nothing was opened");
});

test("plan mode is a state of the chat: it is asked for, it is written down, and it drops when a plan is approved", () => {
  const src = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  assert.match(src, /permissionMode: mode === "plan" \? "plan" : "bypassPermissions"/, "the seat has to be able to start in plan mode");
  assert.match(src, /planModeInstructions: PLAN_INSTRUCTIONS/, "the hive has to say what it wants planned, or plan mode plans a code change");
  const setMode = src.slice(src.indexOf("setMode: async () => {"), src.indexOf("spendBirth: () => {"));
  assert.match(setMode, /PLAN_MODES\.has\(wanted\)/, "only plan and normal are modes");
  assert.match(setMode, /wearMode\(wanted\)/, "one place puts the mode on, or the two ways in drift");
  const wear = src.slice(src.indexOf("async function wearMode(wanted)"), src.indexOf("let sessionId = resumeId;"));
  assert.match(wear, /await session\.setPermissionMode\(permission\);\s*\n\s*mode = wanted;/, "the seat only believes it changed mode after the session took it");
  assert.match(wear, /options\.permissionMode = permission/, "a session reopened after a nap copies options, so the mode has to live there too");
  assert.match(wear, /persistSession\(\{ mode \}\)/, "the mode has to survive a rebind");
  const leaving = src.slice(src.indexOf("async function leavePlanMode()"), src.indexOf("async function wearMode"));
  assert.match(leaving, /wearMode\("normal"\)/, "an approved plan has to leave plan mode, or the chat cannot do what it planned");
  assert.match(leaving, /subtype: "warning"/, "a mode that would not come off has to be said out loud, not swallowed");
});

test("the plan waits on the person through the same door the question card uses", () => {
  const src = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  assert.match(src, /if \(toolName === "ExitPlanMode"\) return waitOnThePlan/);
  const wait = src.slice(src.indexOf("async function waitOnThePlan("), src.indexOf("async function leavePlanMode()"));
  assert.match(wait, /subtype: "plan"/, "the screen has to be told there is a plan to read");
  assert.match(wait, /pendingQuestions\.set\(id, resolve\)/, "a message typed instead of an answer has to drop the plan, like it drops a question");
  assert.match(wait, /behavior: "deny"/, "a dismissed plan is a refusal, not an approval");
});

test("what the person chose on the card is what opens, front by front", () => {
  const fronts = frontWishes();
  fronts.keep([
    { name: "Loja-Produto", agent: "codex", model: "gpt-5", where: "cloud" },
    { name: "feriados-e-prazo", agent: "claude", model: "", where: "local" },
  ]);
  assert.deepEqual(fronts.pick({ mission: "a", name: "loja-produto", where: "local" }), { mission: "a", name: "loja-produto", agent: "codex", model: "gpt-5", where: "cloud" });
  assert.deepEqual(fronts.pick({ mission: "b", name: "feriados-e-prazo", where: "cloud", model: "opus" }), { mission: "b", name: "feriados-e-prazo", agent: "claude", model: "opus", where: "local" });
});

test("a front the model renamed keeps its row, and a spawn nobody planned is left alone", () => {
  const fronts = frontWishes();
  fronts.keep([{ name: "loja-produto-do-livro", agent: "", model: "opus", where: "cloud" }]);
  assert.deepEqual(fronts.pick({ mission: "a", name: "loja-produto" }), { mission: "a", name: "loja-produto", model: "opus", where: "cloud" });
  assert.deepEqual(fronts.pick({ mission: "b", name: "outra-coisa" }), { mission: "b", name: "outra-coisa" }, "a seat nobody planned must not wear a front's choices");
});

test("a spawn that was refused and tried again is the same front, and opens the way she asked", () => {
  const fronts = frontWishes();
  fronts.keep([
    { name: "loja-produto", agent: "codex", model: "", where: "local" },
    { name: "feriados-e-prazo", agent: "claude", model: "opus", where: "cloud" },
  ]);
  const first = fronts.pick({ mission: "a", name: "loja-produto" });
  assert.equal(first.agent, "codex");
  const again = fronts.pick({ mission: "a", name: "loja-produto" });
  assert.deepEqual(again, first, "the retry of a refused front took another front's row");
  assert.equal(fronts.pick({ mission: "b", name: "feriados-e-prazo" }).model, "opus");
});

test("a spawn with no name takes the next front in order, never one that is already open", () => {
  const fronts = frontWishes();
  fronts.keep([
    { name: "primeira", agent: "", model: "opus", where: "local" },
    { name: "segunda", agent: "", model: "sonnet", where: "cloud" },
  ]);
  assert.equal(fronts.pick({ mission: "a" }).model, "opus");
  assert.equal(fronts.pick({ mission: "b" }).model, "sonnet");
  assert.deepEqual(fronts.pick({ mission: "c" }), { mission: "c" });
});

test("a login belongs to the program it was written for, and does not follow another agent", () => {
  const fronts = frontWishes();
  fronts.keep([{ name: "loja", agent: "codex", model: "", where: "local" }]);
  const said = fronts.pick({ mission: "a", name: "loja", agent: "claude", account: "pessoal" });
  assert.equal(said.agent, "codex");
  assert.equal("account" in said, false, "the codex seat would open pointed at a claude login folder");
});

test("an account written for the agent that stayed is kept", () => {
  const fronts = frontWishes();
  fronts.keep([{ name: "loja", agent: "claude", model: "opus", where: "local" }]);
  const said = fronts.pick({ mission: "a", name: "loja", agent: "claude", account: "pessoal" });
  assert.equal(said.account, "pessoal");
});

test("the choices belong to the turn that approved them and to no other", () => {
  const fronts = frontWishes();
  fronts.keep([{ name: "loja-produto", agent: "codex", model: "", where: "cloud" }]);
  fronts.clear();
  assert.deepEqual(fronts.pick({ mission: "a", name: "loja-produto" }), { mission: "a", name: "loja-produto" });
  assert.deepEqual(fronts.rows(), []);
});

test("a plan approved with no table changes nothing about the spawns that follow", () => {
  const fronts = frontWishes();
  assert.equal(fronts.keep(undefined), 0);
  assert.deepEqual(fronts.pick({ mission: "a", name: "sozinho", where: "local" }), { mission: "a", name: "sozinho", where: "local" });
});

test("the fronts of an approved plan reach the spawn tool, and the card can edit them", () => {
  const src = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  assert.match(src, /if \(toolName === "mcp__hive__spawn"\) return \{ behavior: "allow", updatedInput: fronts\.pick\(toolInput\)/, "a spawn has to be opened the way the person asked on the card");
  assert.match(src, /fronts\.keep\(settled\?\.answers\?\.fronts\)/, "the approval carries the table the person edited");
  assert.match(src, /fronts\.clear\(\);\s+lastSaid = item;/, "leftover choices must not reach the next turn");
  const mcp = readFileSync(join(HERE, "..", "peer", "peer-tools.mjs"), "utf8");
  assert.match(mcp, /model: args\.model \|\| ""/, "spawn has to pass the model on, or the choice dies at the door");
});

test("a mission born with a picture says it as a picture, not as a path", () => {
  const born = sayEvent("centraliza isso [Image #1]", ["/tmp/a.png"]);
  assert.deepEqual(born.images, ["/tmp/a.png"]);
  assert.deepEqual(weaveImageMarks(born.message.content[0].text, born.images), [
    { text: "centraliza isso " },
    { image: "/tmp/a.png" },
  ]);
});

test("inlineImageMarks writes the path where the mark sits", () => {
  assert.equal(inlineImageMarks("fix [Image #1] please", ["/tmp/a.png"]), "fix /tmp/a.png please");
  assert.equal(inlineImageMarks("see [Image #7]", ["/tmp/a.png"]), "see [Image #7]");
});

test("sayGate hands a say over when idle and holds it while a turn runs", () => {
  const gate = sayGate();
  assert.deepEqual(gate.push({ text: "first" }), { text: "first" });
  assert.equal(gate.busy, true);
  assert.equal(gate.push({ text: "second" }), null);
  assert.equal(gate.push({ text: "third" }), null);
  assert.equal(gate.queued, 2);
  assert.deepEqual(gate.turnEnded(), { text: "second" });
  assert.equal(gate.busy, true);
  assert.deepEqual(gate.turnEnded(), { text: "third" });
  assert.equal(gate.turnEnded(), null);
  assert.equal(gate.busy, false);
  assert.deepEqual(gate.push({ text: "fourth" }), { text: "fourth" });
});

test("sayGate keeps the queue through an interrupted turn", () => {
  const gate = sayGate();
  gate.push({ text: "the turn that will be interrupted" });
  gate.push({ text: "typed while it ran" });
  assert.deepEqual(gate.turnEnded(), { text: "typed while it ran" });
});

test("sayGate.unsay pulls a queued item back and never touches dispatched ones", () => {
  const gate = sayGate();
  gate.push({ text: "running", cid: "c1-aa" });
  gate.push({ text: "stale", cid: "c2-aa" });
  gate.push({ text: "still wanted", cid: "c3-aa" });
  assert.deepEqual(gate.unsay("c2-aa"), { text: "stale", cid: "c2-aa" });
  assert.equal(gate.unsay("c2-aa"), null);
  assert.equal(gate.unsay("c1-aa"), null);
  assert.equal(gate.unsay(undefined), null);
  assert.equal(gate.queued, 1);
  assert.deepEqual(gate.turnEnded(), { text: "still wanted", cid: "c3-aa" });
});

test("eventLine puts seq and ts before the event fields", () => {
  const line = JSON.parse(eventLine(7, { type: "driver", subtype: "started" }, "2026-08-18T00:00:00.000Z"));
  assert.equal(line.seq, 7);
  assert.equal(line.ts, "2026-08-18T00:00:00.000Z");
  assert.equal(line.type, "driver");
});

test("lastSeq survives a torn tail and an empty file", () => {
  assert.equal(lastSeq(""), 0);
  assert.equal(lastSeq('{"seq":3}\n{"seq":4}\n{"seq":5,"tru'), 4);
  assert.equal(lastSeq('{"seq":3}\n{"seq":9}\n'), 9);
  assert.equal(lastSeq("garbage\nmore garbage"), 0);
});

test("compactLine keeps the window log short and skips partials", () => {
  assert.equal(compactLine({ type: "stream_event" }), null);
  assert.match(compactLine({ type: "system", subtype: "init", model: "haiku", session_id: "s1" }), /init model=haiku/);
  assert.match(
    compactLine({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "ls" } }] } }),
    />Bash/
  );
  assert.match(compactLine({ type: "result", subtype: "success", total_cost_usd: 0.01, num_turns: 2 }), /result success/);
  assert.match(compactLine({ type: "driver", subtype: "question", id: "q1", questions: [{ question: "A or B?" }] }), /QUESTION q1/);
});

test("compactLine narrates the compactation of a session", () => {
  assert.equal(compactLine({ type: "system", subtype: "status", status: "compacting" }), "compacting the conversation…");
  assert.equal(compactLine({ type: "system", subtype: "status", status: null }), null);
  assert.equal(compactLine({ type: "system", subtype: "status", compact_result: "success" }), null);
  assert.match(compactLine({ type: "system", subtype: "status", compact_result: "failed", compact_error: "nope" }), /compact failed: nope/);
  assert.equal(
    compactLine({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 154000, post_tokens: 18000 } }),
    "compact boundary (manual) 154k → 18k"
  );
  assert.match(compactLine({ type: "driver", subtype: "compact_asked", queued: true }), /queued behind the turn/);
  assert.equal(compactLine({ type: "driver", subtype: "compact_asked", queued: false }), "compact asked");
});

test("staleInterrupt drops only an interrupt that waited too long in the pipe", () => {
  const now = 1_000_000;
  assert.equal(staleInterrupt({ type: "interrupt", sent: now - 61000 }, now), true);
  assert.equal(staleInterrupt({ type: "interrupt", sent: now - 5000 }, now), false);
  assert.equal(staleInterrupt({ type: "interrupt" }, now), false);
  assert.equal(staleInterrupt({ type: "say", text: "hi", sent: now - 61000 }, now), false);
});

test("the one failure a seat starts over from is the conversation that is not there", () => {
  assert.equal(noConversationToResume("Claude Code returned an error result: No conversation found with session ID: 3cb41ff4"), true);
  assert.equal(noConversationToResume("no conversation found with session id: abc"), true);
  assert.equal(noConversationToResume("Claude Code returned an error result: overloaded"), false);
  assert.equal(noConversationToResume("credit balance is too low"), false);
  assert.equal(noConversationToResume(""), false);
  assert.equal(noConversationToResume(undefined), false);
});

test("a run the API refused is marked, and an interrupted one is left alone", () => {
  assert.equal(endedOnApiError({ type: "result", subtype: "success", is_error: true, terminal_reason: "api_error", api_error_status: 429 }), true);
  assert.equal(endedOnApiError({ type: "result", subtype: "success", is_error: true, terminal_reason: "api_error", api_error_status: null }), true);
  assert.equal(endedOnApiError({ type: "result", subtype: "success", is_error: true, api_error_status: 529 }), true);
  assert.equal(endedOnApiError({ type: "result", subtype: "success", is_error: false, terminal_reason: "completed", api_error_status: null }), false);
  assert.equal(endedOnApiError({ type: "result", subtype: "error_during_execution", is_error: true, terminal_reason: "aborted_streaming" }), false);
  assert.equal(endedOnApiError({ type: "result", subtype: "error_max_turns", is_error: true }), false);
  assert.equal(endedOnApiError({ type: "assistant", terminal_reason: "api_error" }), false);
  assert.equal(endedOnApiError(null), false);
});

test("the session store exists before the mission is emitted, so a fresh seat does not die on its first event", () => {
  const source = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  const storeAt = source.indexOf("const sessionStore = makeSessionStore(");
  const missionAt = source.indexOf("await deliverMission();");
  const transferAt = source.indexOf("transferEvent(event, sessionStore)");
  assert.ok(storeAt > 0 && missionAt > 0 && transferAt > 0);
  assert.ok(storeAt < missionAt, "deliverMission emits a user event that reads sessionStore; the store must be built first");
});

test("a seat that sleeps is reborn without the agent sdk, and loads it again only to wake", () => {
  const src = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  assert.doesNotMatch(src, /^import \{ query \} from "@anthropic-ai\/claude-agent-sdk"/m, "a top-level import keeps the sdk resident in every sleeping driver");
  assert.match(src, /\(\{ query \} = await importSdk\(\)\)/, "the sdk has to come in on demand");
  const loader = readFileSync(join(HERE, "..", "engine", "sdk-module.mjs"), "utf8");
  assert.doesNotMatch(loader, /^import .* from "@anthropic-ai\/claude-agent-sdk"/m, "the loader must not pull the sdk in at the top either");
  const retire = src.slice(src.indexOf("function retire("), src.indexOf("function ensureAwake("));
  assert.match(retire, /canBeReborn\(process, process\.env, sessionId\)/, "the rebirth has to be guarded by what the platform can do");
  assert.match(retire, /await childrenGone\(/, "the claude child has to be gone before the process image is replaced");
  assert.match(retire, /await sessionStore\.flush\(\);\s*\n\s*await appendChain;/, "the session file and the events have to be on disk before execve");
  assert.match(retire, /process\.execve\(process\.execPath, \[process\.execPath, \.\.\.rebornArgs\(process\.argv\.slice\(1\), sessionId\)\], process\.env\)/);
  const handle = src.slice(src.indexOf("function handleCommand(cmd, reply)"), src.indexOf("const server = createSeatServer"));
  assert.match(handle, /if \(wakesTheSeat\(cmd\) && sleeping && !query\)/, "a command that wakes a reborn seat has to wait for the sdk before it is handled");
  assert.match(src, /if \(!bornAsleep\) await runConsume\(\);/, "a seat born asleep has no session to consume");
});

test("the seat's peer server comes from one place, and rides the gateway the driver just ensured", () => {
  const src = readFileSync(join(HERE, "..", "engine", "driver.mjs"), "utf8");
  assert.match(src, /peerServerFor\(\{ seat: name, side, home: base, entry: peerEntry\(\), gateway \}\)/, "the driver hands the gateway it ensured to the peer, or every chat keeps its own child");
  assert.doesNotMatch(src, /args: \[peerEntry\(\)\]/, "a second, inline definition of the peer server would drift from the routed one");
  assert.match(src, /subtype: "mcp_peer", via: hive\.type === "http" \? "gateway" : "stdio"/, "the log has to say which way the peer went, or nobody can tell a chat with a child from one without");
});
