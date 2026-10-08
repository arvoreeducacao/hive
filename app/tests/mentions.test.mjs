import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { expandMentions, expandPeople, peerChoices, peerHandle, personChoices, personSays, seatHandle, seatLabel, seatSays, shellLineOf, splitPeerHandle } = await app("pure-helpers");

const fleet = [
  { name: "api-payload", where: "cloud", state: "working", model: "opus", title: "api-payload", now: "montando o dto", structured: true },
  { name: "api-webhooks", where: "cloud", state: "idle", model: "sonnet", title: "retry do webhook", now: "", structured: true },
  { name: "checkout", where: "local", state: "needs", model: "", title: "checkout", now: "qual moeda default?", structured: true },
  { name: "terminal-velho", where: "cloud", state: "working", model: "", title: "terminal-velho", now: "", structured: false },
];

test("the mention menu never offers the chat you are writing to", () => {
  const names = peerChoices(fleet, "", "checkout").map((s) => s.name);
  assert.ok(!names.includes("checkout"));
  assert.equal(names.length, 3);
});

test("the menu matches on name and on title, and puts what starts with the query first", () => {
  assert.deepEqual(peerChoices(fleet, "api", "checkout").map((s) => s.name), ["api-payload", "api-webhooks"]);
  assert.deepEqual(peerChoices(fleet, "retry", "checkout").map((s) => s.name), ["api-webhooks"]);
});

test("the chat is called by the name it goes by, cut to one token", () => {
  assert.equal(seatLabel(fleet[1]), "retry do webhook");
  assert.equal(seatHandle(fleet[1]), "retry-do-webhook");
  assert.equal(seatHandle({ name: "so-o-nome", title: "" }), "so-o-nome", "a chat that has not named itself yet is still reachable");
  assert.equal(seatHandle({ name: "x", title: "Revisar a Sessão!" }), "revisar-a-sessao");
});

test("the name the person reads is the name they can write", () => {
  const out = expandMentions("confere com #retry-do-webhook", fleet, "api-payload");
  assert.deepEqual(out.peers, ["api-webhooks"]);
  assert.match(out.text, /\[hive\] peer: api-webhooks/, "the far end goes on answering to the name the tools know");
});

test("the machine name a mention was written with goes on working", () => {
  assert.deepEqual(expandMentions("confere com #api-webhooks", fleet, "api-payload").peers, ["api-webhooks"]);
});

test("two chats under the same name stop the send instead of a coin toss", () => {
  const twins = [
    { name: "primeiro", where: "local", state: "idle", title: "revisar o hive", now: "" },
    { name: "segundo", where: "local", state: "idle", title: "revisar o hive", now: "" },
  ];
  const out = expandMentions("fala com #revisar-o-hive", twins, "checkout");
  assert.match(out.error, /fits 2 seats/);
  assert.match(out.error, /revisar-o-hive, revisar-o-hive/);
});

test("the menu offers a chat by the name it goes by, and finds it by the words in it", () => {
  assert.deepEqual(peerChoices(fleet, "retry-do", "checkout").map(seatHandle), ["retry-do-webhook"]);
  assert.deepEqual(peerChoices(fleet, "webhook", "checkout").map(seatHandle), ["retry-do-webhook"]);
});

test("a mention hands the peer over and leaves the message where it was going", () => {
  const out = expandMentions("alinha o payload com #api-payload antes", fleet, "api-webhooks");
  assert.deepEqual(out.peers, ["api-payload"]);
  assert.match(out.text, /\[hive\] peer: api-payload · cloud · opus · working · "montando o dto"/);
  assert.match(out.text, /\[hive\] you are: api-webhooks/);
  assert.ok(out.text.endsWith("alinha o payload com #api-payload antes"));
});

test("a message with no mention goes through untouched", () => {
  const out = expandMentions("segue o plano", fleet, "checkout");
  assert.equal(out.text, "segue o plano");
  assert.deepEqual(out.peers, []);
});

test("an ambiguous mention stops the send instead of picking one", () => {
  const out = expandMentions("fala com #api sobre o dto", fleet, "checkout");
  assert.match(out.error, /fits 2 seats/);
  assert.equal(out.text, undefined);
});

test("the box's own image mark is not a handle, however many chats carry that digit", () => {
  const withDigits = [
    { name: "1-passo", where: "local", state: "idle", title: "1-passo", structured: true },
    { name: "revisao", where: "local", state: "idle", title: "corrigir o passo 1", structured: true },
  ];
  const out = expandMentions("olha isso [Image #1]", withDigits, "checkout");
  assert.equal(out.error, undefined);
  assert.equal(out.text, "olha isso [Image #1]");
  assert.deepEqual(out.peers, []);
});

test("a real mention still lands in a message that carries an image mark", () => {
  const out = expandMentions("[Image #1] confere com #api-payload", fleet, "api-webhooks");
  assert.deepEqual(out.peers, ["api-payload"]);
  assert.ok(out.text.endsWith("[Image #1] confere com #api-payload"));
});

test("a # that fits nobody stays text — a hex colour and an issue number are not mentions", () => {
  const out = expandMentions("a cor #fff no card #1287, pergunta pro #floresta", fleet, "checkout");
  assert.equal(out.error, undefined);
  assert.equal(out.text, "a cor #fff no card #1287, pergunta pro #floresta");
  assert.deepEqual(out.peers, []);
});

test("a number is a number: a card the person is writing about is not two chats at once", () => {
  const numbered = [
    { name: "feriados-e-prazo-de-compra", where: "local", state: "idle", model: "", title: "o passo 1 do prazo", now: "" },
    { name: "loja-produto-do-livro", where: "local", state: "idle", model: "", title: "a loja, parte 1", now: "" },
  ];
  const out = expandMentions("o problema #1 é esse, o #2 vem depois", numbered, "checkout");
  assert.equal(out.error, undefined, "a list the person numbered stopped the message");
  assert.equal(out.text, "o problema #1 é esse, o #2 vem depois");
  assert.deepEqual(out.peers, []);
});

test("a piece of a title only names a chat once it is long enough to be a word", () => {
  const titled = [
    { name: "campo-da-seta", where: "local", state: "idle", model: "", title: "a seta entre pai e filho", now: "" },
    { name: "teto-do-spawn", where: "local", state: "idle", model: "", title: "o teto de 3 assentos", now: "" },
  ];
  assert.equal(expandMentions("a cor #a3 no card", titled, "checkout").error, undefined);
  assert.deepEqual(expandMentions("fala com #seta", titled, "checkout").peers, ["campo-da-seta"]);
});

test("two mentions of the same seat hand it over once", () => {
  const out = expandMentions("#api-payload e de novo #api-payload", fleet, "api-webhooks");
  assert.deepEqual(out.peers, ["api-payload"]);
  assert.equal(out.text.match(/\[hive\] peer:/g).length, 1);
});

test("what fits nobody and what fits one seat can share a message", () => {
  const out = expandMentions("na cor #fff, alinha com #api-payload", fleet, "api-webhooks");
  assert.deepEqual(out.peers, ["api-payload"]);
  assert.ok(out.text.endsWith("na cor #fff, alinha com #api-payload"));
});

test("mentioning the chat you are already writing to hands over nothing", () => {
  const out = expandMentions("falo com #checkout", fleet, "checkout");
  assert.equal(out.error, undefined);
  assert.deepEqual(out.peers, []);
});

test("a handle for a terminal seat is one line, because a newline there sends the message", () => {
  const out = expandMentions("olha isso\ncom #api-payload", fleet, "terminal-velho", true);
  assert.ok(!out.text.includes("\n"), out.text);
  assert.match(out.text, /peer: api-payload/);
});

test("a mention across the two sides is refused, because the pod cannot call your machine", () => {
  const out = expandMentions("confere com #checkout", fleet, "api-payload");
  assert.match(out.error, /checkout runs on your machine and this chat runs on the server/);
  assert.match(out.error, /Mention a chat on the same side/);
});

test("same side, same message, no complaint", () => {
  assert.deepEqual(expandMentions("confere com #api-webhooks", fleet, "api-payload").peers, ["api-webhooks"]);
});

test("the handle is folded away from what the person reads", () => {
  const out = expandMentions("alinha com #api-payload", fleet, "api-webhooks");
  const split = splitPeerHandle(out.text);
  assert.equal(split.body, "alinha com #api-payload");
  assert.match(split.handle, /\[hive\] peer:/);
});

test("a message that never carried a handle keeps every line", () => {
  const split = splitPeerHandle("primeira\nsegunda");
  assert.equal(split.handle, "");
  assert.equal(split.body, "primeira\nsegunda");
});

test("a seat says where it runs and what it is doing", () => {
  assert.deepEqual(seatSays(fleet[2]), { state: "needs you", meta: "local", spot: "local", now: "qual moeda default?" });
  assert.equal(seatSays(fleet[1]).meta, "cloud · sonnet · retry do webhook");
  assert.equal(seatSays(fleet[1]).spot, "cloud · sonnet", "the menu says the title on its own line, so the meta under it must not say it twice");
});

test("the handle tells the peer which tools reach it", () => {
  const handle = peerHandle(fleet[0], "checkout");
  assert.match(handle, /message\(seat, text\) · ask\(seat, question\) · peek\(seat\)/);
});

const team = [
  { dev: "vini", up: true, sharing: true, seats: [
    { name: "api-payload", title: "dto do pagamento", where: "cloud", model: "opus", state: "working", now: "montando o dto" },
    { name: "b", title: "b" },
    { name: "c", title: "base de dados do mcp", where: "local", state: "blocked", now: "o postgres nao sobe" }
  ] },
  { dev: "rosa", up: true, sharing: true, seats: [{ name: "d" }] },
  { dev: "renato", up: true, sharing: false, seats: [] },
  { dev: "art", up: false, sharing: false, seats: [] },
  { dev: "jonas", up: true, sharing: true, seats: [{ name: "e" }] },
];

test("the people menu puts whoever can be reached first, and never yourself", () => {
  const devs = personChoices(team, "", "jonas").map((r) => r.dev);
  assert.ok(!devs.includes("jonas"));
  assert.deepEqual(devs.slice(0, 2), ["rosa", "vini"]);
  assert.deepEqual(devs.slice(2), ["art", "renato"]);
});

test("the people menu matches on the start of the name", () => {
  assert.deepEqual(personChoices(team, "vi", "jonas").map((r) => r.dev), ["vini"]);
  assert.deepEqual(personChoices(team, "ro", "jonas").map((r) => r.dev), ["rosa"]);
});

test("a person mention hands the person over and leaves the message where it was", () => {
  const out = expandPeople("pergunta pro ~vini qual é o formato", team, "jonas", "checkout");
  assert.deepEqual(out.people, ["vini"]);
  assert.match(out.text, /\[hive\] person: vini · hive open · 3 seats awake/);
  assert.match(out.text, /approves before it lands/);
  assert.match(out.text, /\[hive\] you are: jonas · checkout/);
  assert.ok(out.text.endsWith("pergunta pro ~vini qual é o formato"));
});

test("the person mention hands over which chats they have open, not only how many", () => {
  const out = expandPeople("~vini quem ta no banco?", team, "jonas", "checkout");
  assert.match(out.text, /their chats/);
  assert.match(out.text, /- api-payload "dto do pagamento" · cloud · opus · working · "montando o dto"/);
  assert.match(out.text, /- c "base de dados do mcp" · local · blocked · "o postgres nao sobe"/, "naming the chat is the whole point of the handle");
});

test("a chat whose title only repeats its name is not said twice", () => {
  const out = expandPeople("~vini oi", team, "jonas", "checkout");
  assert.match(out.text, /^ {2}- b$/m);
});

test("a long list of chats is cut and says how many were left out", () => {
  const many = [{ dev: "vini", up: true, sharing: true, seats: Array.from({ length: 15 }, (_, i) => ({ name: `s${i}`, title: `chat ${i}` })) }];
  const out = expandPeople("~vini oi", many, "jonas", "checkout");
  assert.match(out.text, /and 3 more/);
  assert.ok(!out.text.includes("s12"));
});

test("with the hive open but no chat, the handle stops at the count", () => {
  const alone = [{ dev: "vini", up: true, sharing: true, seats: [] }];
  const out = expandPeople("~vini oi", alone, "jonas", "checkout");
  assert.ok(!out.text.includes("their chats"));
});

test("a ~ that fits nobody was never a mention — paths and shell lines keep working", () => {
  for (const line of ["~/src/app", "cd ~", "roda ~npm test", "~", "!ls -la", "que susto!"]) {
    const out = expandPeople(line, team, "jonas", "checkout");
    assert.equal(out.text, line, line);
    assert.deepEqual(out.people, []);
  }
});

test("a line that opens with ! is a shell line, and two of them keep it out of the history", () => {
  assert.deepEqual(shellLineOf("!git status"), { command: "git status", quiet: false });
  assert.deepEqual(shellLineOf("!  ls -la  "), { command: "ls -la", quiet: false });
  assert.deepEqual(shellLineOf("!!git status"), { command: "git status", quiet: true });
  assert.deepEqual(shellLineOf("!! ls"), { command: "ls", quiet: true });
  for (const line of ["git status", "!", "!!", "que susto!", " !ls", ""]) assert.equal(shellLineOf(line), null, line);
});

test("a person mention works at the start of the line, because the name is what decides", () => {
  const out = expandPeople("~vini sabe o formato?", team, "jonas", "checkout");
  assert.deepEqual(out.people, ["vini"]);
});

test("mentioning someone with the hive closed is refused where it can still be changed", () => {
  for (const dev of ["renato", "art"]) {
    const out = expandPeople(`pergunta pro ~${dev}`, team, "jonas", "checkout");
    assert.match(out.error, new RegExp(dev));
    assert.match(out.error, /hive closed/);
  }
});

test("a name that fits two people stops the send", () => {
  const two = [...team, { dev: "vinicia", up: true, sharing: true, seats: [] }];
  const out = expandPeople("chama o ~vin", two, "jonas", "checkout");
  assert.match(out.error, /fits 2 people/);
  assert.match(out.error, /vini, vinicia/);
});

test("the same person named twice is handed over once", () => {
  const out = expandPeople("o ~vini e depois o ~vini de novo", team, "jonas", "checkout");
  assert.deepEqual(out.people, ["vini"]);
  assert.equal(out.text.match(/\[hive\] person:/g).length, 1);
});

test("a handle going to a tui is flattened to one line", () => {
  const out = expandPeople("alinha com o ~vini", team, "jonas", "checkout", true);
  assert.ok(!out.text.includes("\n"));
  assert.match(out.text, /\[hive\] person: vini/);
});

test("what the menu says about someone it cannot reach", () => {
  assert.match(personSays({ dev: "renato", up: true, sharing: false, seats: [] }).state, /hive closed/);
  assert.match(personSays({ dev: "art", up: false, sharing: false, seats: [] }).state, /server asleep/);
  assert.match(personSays({ dev: "rafa", up: true, sharing: true, seats: [{ name: "x" }] }).meta, /1 seat awake/);
});
