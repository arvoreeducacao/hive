import { test } from "node:test";
import assert from "node:assert/strict";
import { foldText, markUp, rankSessions, wordsOf } from "../assets/archive-search.mjs";

const session = (title, prompt = "", cwd = "/Users/me/acme-hub", id = title) => ({ id, where: "local", title, prompt, cwd, at: 1 });

const titles = (found) => found.map((one) => one.session.title);

test("an accent typed or left out finds the same chat", () => {
  const list = [session("histórico do hive")];
  assert.deepEqual(titles(rankSessions(list, "historico")), ["histórico do hive"]);
  assert.deepEqual(titles(rankSessions(list, "HISTÓRICO")), ["histórico do hive"]);
});

test("words typed out of order still find the chat", () => {
  const list = [session("conserta o histórico do hive")];
  assert.deepEqual(titles(rankSessions(list, "hive conserta")), ["conserta o histórico do hive"]);
});

test("a word in the title beats the same word in the typed line and in the folder", () => {
  const list = [
    session("nada a ver", "falamos de crm ali", "/Users/me/outro"),
    session("limpeza do crm"),
    session("nada disso", "", "/Users/me/crm")
  ];
  assert.deepEqual(titles(rankSessions(list, "crm")), ["limpeza do crm", "nada a ver", "nada disso"]);
});

test("a chat nothing in the list matches is left out", () => {
  assert.deepEqual(rankSessions([session("uma coisa")], "outra"), []);
});

test("with nothing typed the list comes back whole and in the order it arrived", () => {
  const list = [session("um"), session("dois")];
  assert.deepEqual(titles(rankSessions(list, "  ")), ["um", "dois"]);
});

test("a chat only the conversation matches comes in, carrying the line that matched", () => {
  const list = [session("nome que não diz nada", "", "/Users/me/hub", "abc")];
  const deep = new Map([["local/abc", "aquele bug do webview branco"]]);
  const found = rankSessions(list, "webview", { deep });
  assert.equal(found.length, 1);
  assert.equal(found[0].hit, "aquele bug do webview branco");
});

test("the order a chat sits at points back at the list it came from", () => {
  const list = [session("um"), session("dois"), session("tres")];
  const found = rankSessions(list, "tres");
  assert.equal(list[found[0].order].title, "tres");
});

test("what matched comes back cut into lit and unlit pieces", () => {
  assert.deepEqual(markUp("conserta o histórico", "histórico"), [
    { text: "conserta o " },
    { text: "histórico", lit: true }
  ]);
  assert.deepEqual(markUp("conserta o histórico", ""), [{ text: "conserta o histórico" }]);
});

test("folding and cutting into words is the same on both sides of the wire", () => {
  assert.equal(foldText("Histórico DO Hive"), "historico do hive");
  assert.deepEqual(wordsOf("crm — limpeza, 2026!"), ["crm", "limpeza", "2026"]);
});
