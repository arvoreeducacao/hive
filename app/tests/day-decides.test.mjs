import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { CONDUCTOR, CONDUCTOR_BRIEF, whatIsOpen, conductorAsk, dayWhatItDecided } = await app("day");

const errand = (name, seats, asked = "") => ({ errand: name, asked, prs: [], seats: seats.map((n) => ({ name: n })) });

const shut = (name, minutesAgo, over = {}) => ({
  errand: name, asked: over.asked || "", at: 0, prs: over.prs || [],
  endedAt: Date.now() - minutesAgo * 60000
});

function theDay(over = {}) {
  st.data = {
    sessions: [], spawning: [], archived: [], pod: {},
    closed: over.closed || [],
    day: { needsYou: [], cameBack: [], onTheWay: [], byHand: [], ...over }
  };
}

const note = () => document.getElementById("day-note");

function afterItFinished(finish, waitingFor) {
  st.data = { sessions: finish ? [{ name: CONDUCTOR, finish }] : [], spawning: [], archived: [], pod: {} };
  st.dayHeard = waitingFor === undefined ? null : { seq: waitingFor };
  const box = note();
  box.innerHTML = "";
  box.hidden = true;
  dayWhatItDecided();
  return box;
}

test("the brief tells it to decide where the sentence goes before opening anything", () => {
  assert.match(CONDUCTOR_BRIEF, /ANTES de abrir qualquer assento/);
  assert.match(CONDUCTOR_BRIEF, /não abra assento novo/i);
  assert.match(CONDUCTOR_BRIEF, /`message`/, "it is not told how to put the sentence into a chat already running");
  assert.match(CONDUCTOR_BRIEF, /UMA linha/, "it is not told to answer in one line, which is all the screen shows");
});

test("what is already open travels with the sentence, so it can decide without asking", () => {
  theDay({
    needsYou: [errand("áudio mudo no CRM", ["crm-audio", "crm-midia"], "descobre por que o áudio fica mudo")],
    onTheWay: [errand("teto do load test", ["load-test"])]
  });
  const said = whatIsOpen();
  assert.match(said, /áudio mudo no CRM/);
  assert.match(said, /crm-audio, crm-midia/);
  assert.match(said, /descobre por que o áudio fica mudo/);
  assert.match(said, /teto do load test/);
});

test("a request whose chats closed says so, so it does not message a seat that is gone", () => {
  theDay({ cameBack: [errand("PED-42", [])] });
  assert.match(whatIsOpen(), /sem chat aberto/);
});

test("with nothing open it says so plainly instead of sending an empty list", () => {
  theDay();
  const said = whatIsOpen();
  assert.match(said, /Nada aberto/);
  assert.doesNotMatch(said, /·/, "an empty list still shipped bullet rows");
});

test("the brief makes it ask before repeating, instead of deciding that alone", () => {
  assert.match(CONDUCTOR_BRIEF, /AskUserQuestion/, "it is not told to ask through the card the screen can answer");
  assert.match(CONDUCTOR_BRIEF, /NÃO abra nada/);
  assert.match(CONDUCTOR_BRIEF, /desde quando/, "the question does not have to say since when the request exists");
  assert.match(CONDUCTOR_BRIEF, /sem nada parecido na lista, abra os assentos direto, sem perguntar/,
    "it would ask on every new request, which turns the card into noise");
});

test("what she asked days ago travels too — that is where “did I already send this?” lives", () => {
  theDay({ closed: [shut("o áudio mudo no CRM", 3 * 24 * 60, { asked: "descobre o áudio", prs: ["u/1"] })] });
  const said = whatIsOpen();
  assert.match(said, /já fecharam/);
  assert.match(said, /o áudio mudo no CRM/);
  assert.match(said, /há 3 dias/);
  assert.match(said, /com PR/);
  assert.match(said, /descobre o áudio/);
});

test("a request that is open is not also listed as closed", () => {
  theDay({ onTheWay: [errand("PED-42", ["ped-42"])], closed: [shut("PED-42", 30)] });
  const said = whatIsOpen();
  assert.equal((said.match(/PED-42/g) || []).length, 1, "the same request was offered twice, open and closed");
});

test("the closed list is capped, so an old machine does not ship a wall of text", () => {
  theDay({ closed: Array.from({ length: 40 }, (_, i) => shut(`pedido ${i}`, i + 1)) });
  const said = whatIsOpen();
  assert.equal((said.match(/^· “pedido /gm) || []).length, 12);
});

test("with nothing closed the section does not exist at all", () => {
  theDay({ onTheWay: [errand("PED-42", ["ped-42"])] });
  assert.doesNotMatch(whatIsOpen(), /já fecharam/);
});

test("what you opened by hand is not offered as a request to complete", () => {
  theDay({ byHand: [errand("", ["solto"])] });
  const said = whatIsOpen();
  assert.match(said, /Nada aberto/);
  assert.doesNotMatch(said, /solto/);
});

test("the message carries the list first and your sentence last, marked as yours", () => {
  theDay({ onTheWay: [errand("PED-42", ["ped-42"])] });
  const said = conductorAsk("o áudio ainda tá mudo em staging");
  assert.ok(said.indexOf("PED-42") < said.indexOf("o áudio ainda tá mudo"), "the sentence came before the list");
  assert.match(said, /O que ela acabou de dizer:/);
  assert.match(said, /o áudio ainda tá mudo em staging$/);
});

test("the screen takes the line it LEADS with, not the one it trails off on", () => {
  const box = afterItFinished(
    { seq: 12, text: "abri 2 assentos para “áudio mudo no CRM”\n\nUm detalhe meu, já resolvido: a ferramenta não apareceu na lista desta sessão." },
    5
  );
  assert.equal(box.hidden, false, "the note stayed hidden after the conductor decided");
  assert.match(box.textContent, /abri 2 assentos/);
  assert.doesNotMatch(box.textContent, /detalhe meu/, "the screen showed a technical aside instead of the decision");
  assert.equal(st.dayHeard, null, "the screen is still waiting for a turn it already showed");
});

test("nothing is said until its turn actually finished", () => {
  const box = afterItFinished({ seq: 5, text: "coisa velha" }, 5);
  assert.equal(box.innerHTML, "", "it echoed a turn that had already ended before you asked");
  assert.equal(box.hidden, true);
});

test("with nothing waiting to be heard the screen is left alone", () => {
  const box = afterItFinished({ seq: 99, text: "qualquer coisa" });
  assert.equal(box.innerHTML, "");
  assert.equal(box.hidden, true);
});

test("a turn that ended saying nothing says that, instead of a blank line", () => {
  const box = afterItFinished({ seq: 9, text: "   \n  " }, 1);
  assert.equal(box.hidden, false);
  assert.match(box.textContent, /said nothing/);
});

test("html in what it said is escaped before it becomes the note", () => {
  const box = afterItFinished({ seq: 9, text: "<img src=x onerror=alert(1)>" }, 1);
  assert.equal(box.querySelector("img"), null, "the note grew a tag out of what the conductor said");
  assert.match(box.innerHTML, /&lt;img/);
  assert.match(box.textContent, /<img src=x onerror=alert\(1\)>/);
});
