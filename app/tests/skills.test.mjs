import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { svSynthetic, svUser, svUserText } = await app("chat-and-panes");
const { svConvSeed, svConvTool } = await app("conversation-model");
const { SKILL_TOOL, trimBody } = await app("tool-face");

const SKILL_TEXT = "Base directory for this skill: /w/.claude/skills/plano-vivo\n\n# Plano Vivo\n\nUm artifact por missão.";
const BUNDLED_TEXT = "Approach this as the design lead at a small studio known for their versatility.";

let tag = 0;
function seat() {
  return { name: `seat-${++tag}`, tag: `t${tag}`, conv: svConvSeed(), tools: new Map(), at: 1756700000000, atBottom: false };
}

function skillCardOn(e) {
  return svConvTool(e, { id: `tool-${++tag}`, name: "Skill", input: { command: "plano-vivo" } }, false);
}

const blocksOfKind = (e, kind) => e.conv.blocks.filter((one) => one.kind === kind);
const lastBlock = (e) => e.conv.blocks[e.conv.blocks.length - 1];

test("the skill text lands inside the card that already named the skill", () => {
  const e = seat();
  const card = skillCardOn(e);
  assert.equal(e.skillCard, card);
  svSynthetic(e, SKILL_TEXT);
  assert.equal(card.body, SKILL_TEXT);
  assert.equal(e.skillCard, null);
});

test("a bundled skill has no base directory line and still lands in the card", () => {
  const e = seat();
  const card = skillCardOn(e);
  svUserText(e, BUNDLED_TEXT, true);
  assert.equal(card.body, BUNDLED_TEXT);
  assert.equal(blocksOfKind(e, "bubble").length, 0);
});

test("a synthetic line with no card to fold it into is a folded note and never a message", () => {
  const e = seat();
  svUserText(e, "[Image: original 2560x1440, displayed at 2000x1125.]", true);
  assert.equal(lastBlock(e).kind, "think");
  assert.equal(lastBlock(e).label, "note");
  assert.equal(blocksOfKind(e, "bubble").length, 0);

  svUserText(e, SKILL_TEXT, true);
  assert.equal(lastBlock(e).label, "skill");
  assert.equal(lastBlock(e).body, SKILL_TEXT);
});

test("a base directory line arrives as a skill even when nobody flagged it synthetic", () => {
  const e = seat();
  svUserText(e, SKILL_TEXT);
  assert.equal(lastBlock(e).kind, "think");
  assert.equal(lastBlock(e).label, "skill");
  assert.equal(blocksOfKind(e, "bubble").length, 0);
});

test("what the person typed is still a bubble", () => {
  const e = seat();
  svUserText(e, "arruma o cartão da skill");
  assert.equal(lastBlock(e).kind, "bubble");
  assert.match(lastBlock(e).body, /arruma o cartão da skill/);
  assert.equal(blocksOfKind(e, "think").length, 0);
});

test("a long skill is cut like any other tool body", () => {
  const long = "x".repeat(5000);
  const cut = trimBody(long);
  assert.ok(cut.length < long.length);
  assert.match(cut, /\(5000 chars\)$/);

  const e = seat();
  const card = skillCardOn(e);
  svSynthetic(e, long);
  assert.equal(card.body, cut);
});

test("only the Skill tool is remembered, and any other tool clears it", () => {
  assert.ok(SKILL_TOOL.test("Skill"));
  assert.ok(!SKILL_TOOL.test("SlashCommand"));

  const e = seat();
  const card = skillCardOn(e);
  assert.equal(e.skillCard, card);
  const other = svConvTool(e, { id: "tool-other", name: "SlashCommand", input: {} }, false);
  assert.equal(e.skillCard, null);
  svSynthetic(e, SKILL_TEXT);
  assert.equal(other.body, "", "the skill body landed on whatever tool ran after it");
  assert.equal(lastBlock(e).label, "skill");
});

test("the transcript hands the synthetic flag to the text it renders", () => {
  const spoken = seat();
  const card = skillCardOn(spoken);
  svUser(spoken, { message: { content: BUNDLED_TEXT }, isSynthetic: true });
  assert.equal(card.body, BUNDLED_TEXT, "a string body dropped the synthetic flag on the way in");

  const blocked = seat();
  const held = skillCardOn(blocked);
  svUser(blocked, { message: { content: [{ type: "text", text: BUNDLED_TEXT }] }, isSynthetic: true });
  assert.equal(held.body, BUNDLED_TEXT, "a text block dropped the synthetic flag on the way in");

  const typed = seat();
  svUser(typed, { message: { content: "arruma o cartão da skill" } });
  assert.equal(lastBlock(typed).kind, "bubble");
});
