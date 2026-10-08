import { test } from "node:test";
import assert from "node:assert/strict";
import { nameFromAnswer, namerCommand, kimiAnswer, NAMER_MODELS, slug } from "../lib/naming.mjs";

test("a name the model answered is taken as it is", () => {
  assert.equal(nameFromAnswer("reader-cold-start", "por que o reader demora a abrir"), "reader-cold-start");
  assert.equal(nameFromAnswer("Funil Por Pessoa", "quero o funil por pessoa"), "funil-por-pessoa");
  assert.equal(nameFromAnswer("chip-flapando", "o chip fica caindo"), "chip-flapando");
  assert.equal(nameFromAnswer("assento", "arruma o assento"), "assento");
});

test("a model that answers in prose does not get to name the seat", () => {
  assert.equal(nameFromAnswer("I can't derive a session name from 'aoisdja'.", "aoisdja"), "aoisdja");
  assert.equal(
    nameFromAnswer("Não consigo nomear uma sessão a partir dessa mensagem", "revisar o funil de cobranca hoje"),
    "revisar-o-funil-de"
  );
  assert.equal(nameFromAnswer("", "conserta o login do professor"), "conserta-o-login-do");
});

test("the fallback is the mission's own first words, cut to a name", () => {
  assert.equal(nameFromAnswer("uma explicação bem longa que não é nome nenhum", "aoisdja"), "aoisdja");
  assert.equal(nameFromAnswer("...", "ãçéntos e Espaços"), "acentos-e-espacos");
});

test("slug stays what the rest of the app already relied on", () => {
  assert.equal(slug("  Reader Cold Start  "), "reader-cold-start");
  assert.equal(slug("já-tá!"), "ja-ta");
  assert.equal(slug("---"), "");
  assert.equal(slug(undefined), "");
  assert.equal(slug("a".repeat(60)).length, 40);
});

const REFUSED = "I cannot access Slack links, could you share what is in the thread?";

test("a mission that is only a slack link is named after the thread, not the address", () => {
  assert.equal(
    nameFromAnswer(REFUSED, "https://acme.slack.com/archives/C0EXAMPLE01/p1784210591983749"),
    "slack-c0example01-1784210591"
  );
});

test("two slack links never collapse into the same seat name", () => {
  const one = nameFromAnswer(REFUSED, "https://acme.slack.com/archives/C0EXAMPLE01/p1784210591983749");
  const other = nameFromAnswer(REFUSED, "https://acme.slack.com/archives/C0EXAMPLE01/p1788266220916919?thread_ts=1784210591.983749");
  const elsewhere = nameFromAnswer(REFUSED, "https://acme.slack.com/archives/C0EXAMPLE02/p1787250255841939");
  assert.notEqual(one, other);
  assert.notEqual(one, elsewhere);
  assert.notEqual(other, elsewhere);
});

test("a link that is not slack is named after what it points at", () => {
  assert.equal(nameFromAnswer(REFUSED, "https://github.com/acme/hive/pull/696"), "hive-pr-696");
  assert.equal(nameFromAnswer(REFUSED, "https://linear.app/acme/issue/PED-694/o-titulo-do-card"), "linear-ped-694-o-titulo-do-card");
  assert.equal(nameFromAnswer(REFUSED, "https://www.exemplo.com.br/"), "exemplo");
});

test("words the person wrote outrank the link they pasted", () => {
  assert.equal(
    nameFromAnswer(REFUSED, "olha essa thread https://acme.slack.com/archives/C0EXAMPLE01/p1784210591983749 e me diz"),
    "olha-essa-thread-e"
  );
});

test("the first words of the mission name the seat on the spot", async () => {
  const { nameFromMission } = await import("../lib/naming.mjs");
  assert.equal(nameFromMission("Irmão, queria fazer uma alteração no hive"), "irmao-queria-fazer-uma");
  assert.equal(nameFromMission("https://github.com/acme/hive/pull/711"), "hive-pr-711");
  assert.equal(nameFromMission(""), "");
});

test("a mission that opens with hive handles is named by the words after them", async () => {
  const { nameFromMission, pastHandles } = await import("../lib/naming.mjs");
  const woven = "[hive] peer: o-doutor · local · idle\n[hive] reach it: message(seat, text)\n\nolha o #o-doutor e conserta o login";
  assert.equal(pastHandles(woven), "olha o #o-doutor e conserta o login");
  assert.equal(nameFromMission(woven), "olha-o-o-doutor-e");
  assert.equal(pastHandles("sem handle nenhum"), "sem handle nenhum");
});

test("a claude seat is named by haiku through claude -p, with no mcp servers", () => {
  const ask = namerCommand({ agent: "claude", prompt: "Mission: x", outFile: "/tmp/n.txt", claude: "/usr/bin/claude" });
  assert.equal(ask.exe, "/usr/bin/claude");
  assert.deepEqual(ask.args.slice(0, 4), ["-p", "Mission: x", "--model", NAMER_MODELS.claude]);
  assert.ok(ask.args.includes("--strict-mcp-config"));
  assert.equal(ask.answerIn, "");
});

test("a codex seat is named by luna through codex exec, answering in a file", () => {
  const ask = namerCommand({ agent: "codex", prompt: "Mission: x", outFile: "/tmp/n.txt", claude: "/usr/bin/claude" });
  assert.equal(ask.exe, "codex");
  assert.equal(ask.args[0], "exec");
  assert.ok(ask.args.includes("--ephemeral"));
  assert.ok(ask.args.includes("--skip-git-repo-check"));
  assert.equal(ask.args[ask.args.indexOf("-m") + 1], NAMER_MODELS.codex);
  assert.equal(ask.args[ask.args.indexOf("-o") + 1], "/tmp/n.txt");
  assert.equal(ask.args.at(-1), "Mission: x");
  assert.equal(ask.answerIn, "/tmp/n.txt");
});

test("a kimi seat is named by kimi's own print mode", () => {
  const ask = namerCommand({ agent: "kimi", prompt: "Mission: x", outFile: "/tmp/n.txt", claude: "claude" });
  assert.equal(ask.exe, "kimi");
  assert.deepEqual(ask.args.slice(0, 2), ["-p", "Mission: x"]);
  assert.ok(ask.args.includes("--output-format") && ask.args.includes("stream-json"));
  assert.ok(!ask.args.includes("--auto"), "kimi refuses -p together with --auto");
  assert.equal(ask.answerIn, "");
  const out = '{"role":"meta","type":"system.version","version":"0.40.1"}\n{"role":"assistant","content":"reader-cold-start"}\n{"role":"meta","type":"session.resume_hint","content":"To resume this session: kimi -r session_x"}\n';
  assert.equal(ask.pick(out), "reader-cold-start");
  assert.equal(kimiAnswer("junk"), "");
});

test("a kiro seat is named by kiro's own acp, through the namer script in the engine dir, on haiku", () => {
  const ask = namerCommand({ agent: "kiro", prompt: "Mission: x", outFile: "/tmp/n.txt", claude: "claude", engineDir: "/app/server/engine" });
  assert.equal(ask.exe, process.execPath);
  assert.deepEqual(ask.args, ["/app/server/engine/kiro-namer.mjs", "Mission: x"]);
  assert.equal(ask.answerIn, "");
  assert.equal(NAMER_MODELS.kiro, "claude-haiku-4.5");
});

test("a cursor seat is named by cursor-agent's own print mode, asking only, on the login's default model", () => {
  const ask = namerCommand({ agent: "cursor", prompt: "Mission: x", outFile: "/tmp/n.txt", claude: "claude" });
  assert.equal(ask.exe, "cursor-agent");
  assert.deepEqual(ask.args.slice(0, 2), ["-p", "Mission: x"]);
  assert.ok(ask.args.includes("--output-format") && ask.args.includes("text"));
  assert.ok(ask.args.includes("--mode") && ask.args.includes("ask"), "naming must not run tools");
  assert.equal(ask.answerIn, "");
  assert.equal(ask.pick, undefined);
  assert.equal(NAMER_MODELS.cursor, "");
});

test("an agent without a namer of its own is named by claude", () => {
  assert.equal(namerCommand({ agent: "opencode", prompt: "m", outFile: "/tmp/n.txt", claude: "claude" }).exe, "claude");
  assert.equal(namerCommand({ agent: "", prompt: "m", outFile: "/tmp/n.txt", claude: "claude" }).exe, "claude");
});
