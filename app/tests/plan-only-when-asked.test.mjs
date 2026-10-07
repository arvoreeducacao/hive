import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

const chat = async (name, seat = {}) => {
  await views();
  const { svEvent } = await app("chat-and-panes");
  const { getStructured } = await app("chat-stretches");
  const e = getStructured({ name, where: "local" });
  if (seat.agent) e.agent = seat.agent;
  e.ws = { readyState: 1, send: () => {} };
  return { e, svEvent };
};

test("a checklist another agent published never opens the card that waits on the person", async () => {
  const { e, svEvent } = await chat("kimi-com-passos", { agent: "kimi" });
  svEvent(e, { type: "driver", subtype: "todo", text: "✓ ler o diff\n· escrever o teste" });
  assert.equal(e.host.querySelector(".sv-plan"), null, "kimi's own checklist painted the approval card");
});

test("a plan with no id is not a plan anyone is holding", async () => {
  const { e, svEvent } = await chat("plano-sem-id");
  svEvent(e, { type: "driver", subtype: "plan", text: "· um passo\n· outro" });
  assert.equal(e.host.querySelector(".sv-plan"), null, "an event with no id cannot be answered, so it must not ask");
});

test("the plan the chat is held on still opens the card", async () => {
  const { e, svEvent } = await chat("plano-de-verdade");
  svEvent(e, { type: "driver", subtype: "plan", id: "p1", plan: "Vou repartir em duas frentes." });
  assert.ok(e.host.querySelector(".sv-plan"), "the held plan lost its card");
});

test("the mode command belongs to the program that has a mode", async () => {
  const { CLAUDE_ONLY_COMMANDS } = await app("chat-and-panes");
  assert.ok(CLAUDE_ONLY_COMMANDS.has("plane-mode"), "no other driver implements setMode, so the command has to say so itself");
});
