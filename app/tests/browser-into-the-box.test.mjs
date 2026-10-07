import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app } from "./dom.mjs";

const { REVIEW_ASK, referenceLine } = await app("chat-and-panes");

const panes = readFileSync(new URL("../src/app/chat-and-panes.js", import.meta.url), "utf8");
const routes = readFileSync(new URL("../routes/browser.mjs", import.meta.url), "utf8");
const cut = (from, to) => {
  const a = panes.indexOf(from);
  const b = panes.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, `could not cut ${from}`);
  return panes.slice(a, b);
};

test("print, review and reference land in the box of a chat, never typed into a terminal it does not read", () => {
  for (const name of ["async function sendScreenPrint(name)", "function sendScreenReview(name)", "async function sendPickReference(name, frame, pick)"]) {
    const body = cut(name, "\n}\n");
    const handed = body.indexOf("intoTheBox(");
    assert.ok(handed > 0, `${name} does not hand its words to the box`);
    assert.ok(handed < body.indexOf("fetch("), `${name} still reaches the server before the box`);
    assert.match(body, /const e = structPool\.get\(name\);\n\s+if \(e\) return intoTheBox/, `${name}: only a chat with a box takes the shortcut`);
  }
  assert.ok(!/structuredSeat/.test(routes), "the server routes still type into tmux, which a chat seat never reads: they stay for the terminal seats only");
});

test("the box gets the words and the picture, and nothing is sent", () => {
  const box = cut("function intoTheBox(e, words, shot) {", "\n}\n");
  assert.match(box, /svTypePath\(e, words\)/);
  assert.match(box, /attachFilesToSeat\(e, \[\{ name: "browser\.png", data: shot \}\]\)/);
  assert.ok(!/svCmd|type: "say"/.test(box), "attaching is not sending");
});

test("a reference names the element, the page and how it looks", () => {
  const line = referenceLine({ selector: "main > h1", text: "Projetos   da turma", url: "http://localhost:3000/writing", styles: { "font-size": "24px", "font-weight": "600", color: "rgb(0, 0, 0)", padding: "8px 0px" } });
  assert.equal(line, '<main > h1> "Projetos da turma" · http://localhost:3000/writing · 24px 600 rgb(0, 0, 0) pad 8px 0px');
  assert.equal(referenceLine({ selector: "button" }), "<button>");
});

test("review asks for the same check it always did", () => {
  assert.match(REVIEW_ASK, /390 e 1440/);
  assert.match(REVIEW_ASK, /Nielsen/);
  assert.match(REVIEW_ASK, /copy check/);
});
