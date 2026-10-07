import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { translate as kimiTranslate, newSessionContext as kimiContext } from "../engine/kimi-acp.mjs";
import { translate as kiroTranslate, newSessionContext as kiroContext } from "../engine/kiro-acp.mjs";
import { stateOfSeat } from "../sessions.mjs";
import { slim } from "../sync/runner.mjs";

const HERE = new URL("..", import.meta.url).pathname;
const update = (sessionUpdate, rest = {}) => ({ method: "session/update", params: { update: { sessionUpdate, ...rest } } });
const CHECKLIST = { entries: [{ content: "ler o pedido", status: "completed" }, { content: "abrir o PR", status: "pending" }] };

test("the checklist of an acp seat is a todo, never the plan that stops a seat", () => {
  for (const [label, translate, context] of [["kimi", kimiTranslate, kimiContext], ["kiro", kiroTranslate, kiroContext]]) {
    const out = translate(update("plan", CHECKLIST), context());
    assert.deepEqual(out, [{ type: "driver", subtype: "todo", text: "✓ ler o pedido\n· abrir o PR" }], `${label} sends its checklist as a todo`);
  }
});

test("only the plan that carries a plan is drawn as one, and only that one stops the seat", () => {
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "driver", subtype: "plan", id: "p1", plan: "abre três frentes" } }), "asking");
  assert.equal(stateOfSeat({ alive: true, lastEvent: { type: "driver", subtype: "todo", text: "✓ ler o pedido" } }), "working", "a seat ticking off its list is working, not waiting on the person");
});

test("the phone carries the checklist as a note, with the checklist in it", () => {
  const [note] = slim({ seq: 7, type: "driver", subtype: "todo", text: "✓ ler o pedido\n· abrir o PR" });
  assert.equal(note.type, "note");
  assert.equal(note.subtype, "todo");
  assert.equal(note.text, "✓ ler o pedido\n· abrir o PR");

  const [gate] = slim({ seq: 8, type: "driver", subtype: "plan", id: "p1", plan: "abre três frentes" });
  assert.equal(gate.type, "plan");
  assert.equal(gate.plan, "abre três frentes");
});

test("the pane draws the approval card only for the plan, and the checklist as a quiet line", () => {
  const pane = readFileSync(join(HERE, "../app/src/app/chat-and-panes.js"), "utf8");
  assert.match(pane, /ev\.subtype === "todo".*svLine\(e, "sv-meta"/, "the checklist is a line in the chat, not a card that asks for something");
  assert.match(pane, /ev\.subtype === "plan".*svPlanCard/, "the plan mode gate keeps its card");
});

test("no acp adapter emits the name the plan gate owns", () => {
  for (const file of ["engine/kimi-acp.mjs", "engine/kiro-acp.mjs", "engine/cursor-acp.mjs"]) {
    const source = readFileSync(join(HERE, file), "utf8");
    assert.doesNotMatch(source, /subtype: "plan"/, `${file} must not speak for the gate that stops a seat`);
  }
});
