import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSeatServer } from "../engine/seat-core.mjs";
import { makeSecretKeeper, parseShellEnv, prepareShellEnv, pullSecrets, readShellEnv, shellEnvFileFor, shellEnvScript } from "../engine/shell-env.mjs";

const OPENAI = "sk-proj-Zx81kQm2Lp0vTr7wNs4Yb6Hc9Jd3Fg5Ae1Uo";
const GITHUB = "ghp_8fKs2LmQ9wX4vR7tY1zB3nC6pD0hJ5gA2eUi";
const OPAQUE = "q7Rk2mZ9xLw4Tp8Vn3Bc6Yd1Hf5Gs0Ja";

async function scratch(t) {
  const dir = await mkdtemp(join(tmpdir(), "hive-shell-env-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("an assigned key leaves the message and keeps the name the dev gave it", () => {
  const { text, moved, held } = pullSecrets(`usa essa: OPENAI_API_KEY=${OPENAI} e roda o bench`);
  assert.equal(text, "usa essa: OPENAI_API_KEY=$OPENAI_API_KEY e roda o bench");
  assert.deepEqual(moved.map((one) => one.name), ["OPENAI_API_KEY"]);
  assert.equal(held.get("OPENAI_API_KEY"), OPENAI);
});

test("a bare token pasted in prose is named after what it is", () => {
  const { text, held } = pullSecrets(`meu token: ${GITHUB}`);
  assert.equal(text, "meu token: $GITHUB_TOKEN");
  assert.equal(held.get("GITHUB_TOKEN"), GITHUB);
});

test("a random value under a name with no secret word in it is still caught", () => {
  const { text, held } = pullSecrets(`PARTNER_CRED=${OPAQUE}`);
  assert.equal(text, "PARTNER_CRED=$PARTNER_CRED");
  assert.equal(held.get("PARTNER_CRED"), OPAQUE);
});

test("ordinary settings and prose pass untouched", () => {
  for (const said of [
    "NODE_ENV=production PORT=8796 npm run server",
    "LOG_DIR=/var/log/hive/very/long/path/name",
    "o deploy das 14h quebrou, olha o log",
    "API_KEY=${API_KEY}",
  ]) {
    const { text, moved } = pullSecrets(said);
    assert.equal(text, said);
    assert.deepEqual(moved, []);
  }
});

test("the password of a connection string goes, the rest of the address stays", () => {
  const { text, held } = pullSecrets("DATABASE_URL=postgres://app:Pa55w0rdQx9z@db.internal:5432/main");
  assert.equal(text, "DATABASE_URL=postgres://app:$DATABASE_PASSWORD@db.internal:5432/main");
  assert.equal(held.get("DATABASE_PASSWORD"), "Pa55w0rdQx9z");
});

test("a name the seat itself depends on is never overwritten by a pasted key", () => {
  const { text, held } = pullSecrets("ANTHROPIC_API_KEY=sk-ant-api03-Xk2Lm9Qp4Rt7Vw1Zy3Bn6Cd8Fg0Hj5Ks");
  assert.equal(text, "ANTHROPIC_API_KEY=$ANTHROPIC_KEY");
  assert.ok(!held.has("ANTHROPIC_API_KEY"));
});

test("the same secret twice is one variable, a different one under a taken name gets its own", () => {
  const first = pullSecrets(`OPENAI_API_KEY=${OPENAI}`);
  const again = pullSecrets(`de novo ${OPENAI}`, first.held);
  assert.equal(again.text, "de novo $OPENAI_API_KEY");
  const other = "sk-proj-Mm3Nn4Bb5Vv6Cc7Xx8Zz9Ll0Kk1Jj2Hh3Gg";
  const second = pullSecrets(`OPENAI_API_KEY=${other}`, again.held);
  assert.equal(second.text, "OPENAI_API_KEY=$OPENAI_API_KEY_2");
  assert.equal(second.held.get("OPENAI_API_KEY"), OPENAI);
  assert.equal(second.held.get("OPENAI_API_KEY_2"), other);
});

test("a whole private key leaves, not just its first line", () => {
  const pem = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmU=\nAAAAC3NzaC1lZDI1NTE5AAAAIL\n-----END OPENSSH PRIVATE KEY-----";
  const { text, held } = pullSecrets(`a chave do deploy:\n${pem}\nvaleu`);
  assert.equal(text, "a chave do deploy:\n$PRIVATE_KEY\nvaleu");
  assert.equal(parseShellEnv(shellEnvScript(held)).get("PRIVATE_KEY"), pem);
});

test("values with quotes survive the round trip through the script", () => {
  const held = new Map([["ODD", "it's $HOME `x` \"y\""]]);
  assert.deepEqual(parseShellEnv(shellEnvScript(held)), held);
});

test("the keeper writes the secret only to a file nobody else can read and tells the model how to use it", async (t) => {
  const dir = await scratch(t);
  const file = shellEnvFileFor(dir, "seat-a");
  const keeper = makeSecretKeeper(file);
  const { cmd, moved } = await keeper.command({ type: "say", text: `GITHUB_TOKEN=${GITHUB}`, cid: "c1" });
  assert.equal(cmd.cid, "c1");
  assert.ok(!cmd.text.includes(GITHUB));
  assert.match(cmd.text, /\$GITHUB_TOKEN/);
  assert.match(cmd.text, /Never print/);
  assert.deepEqual(moved.map((one) => one.name), ["GITHUB_TOKEN"]);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await readShellEnv(file)).get("GITHUB_TOKEN"), GITHUB);
});

test("a key typed as the answer to a question is kept out too", async (t) => {
  const dir = await scratch(t);
  const keeper = makeSecretKeeper(shellEnvFileFor(dir, "seat-a"));
  const { cmd } = await keeper.command({ type: "answer", id: "q1", answers: { "Qual a chave?": OPENAI, "Ambiente?": "staging" } });
  assert.ok(!JSON.stringify(cmd).includes(OPENAI));
  assert.equal(cmd.answers["Ambiente?"], "staging");
});

test("a message with no secret goes through exactly as sent and writes nothing", async (t) => {
  const dir = await scratch(t);
  const file = shellEnvFileFor(dir, "seat-a");
  const sent = { type: "say", text: "roda os testes" };
  const { cmd } = await makeSecretKeeper(file).command(sent);
  assert.equal(cmd, sent);
  await assert.rejects(stat(file));
});

test("a key pasted mid-session reaches the next shell command through the loader", async (t) => {
  const dir = await scratch(t);
  const file = shellEnvFileFor(dir, "seat-a");
  const loader = await prepareShellEnv(file);
  const length = () => execFileSync("bash", ["-c", `. '${loader}'; printf %s "\${#OPENAI_API_KEY}"`], { encoding: "utf8" });
  assert.equal(length(), "0");
  await makeSecretKeeper(file).command({ type: "say", text: `OPENAI_API_KEY=${OPENAI}` });
  assert.equal(length(), String(OPENAI.length));
});

test("the seat hands its driver the message without the secret", async (t) => {
  const dir = await scratch(t);
  const sockFile = join(dir, "seat.sock");
  const received = [];
  const server = createSeatServer({
    sockFile,
    shellEnvFile: shellEnvFileFor(dir, "seat-a"),
    handleCommand: (cmd, reply) => { received.push(cmd); reply({ ok: true }); },
    emit: () => 0,
  });
  t.after(() => server.close());
  await new Promise((up) => server.on("listening", up));
  const answer = await new Promise((settle, fail) => {
    const conn = connect(sockFile, () => conn.write(JSON.stringify({ type: "say", text: `chave ${GITHUB}` }) + "\n"));
    conn.on("data", (data) => { conn.destroy(); settle(JSON.parse(String(data))); });
    conn.on("error", fail);
  });
  assert.equal(answer.ok, true);
  assert.equal(received.length, 1);
  assert.ok(!received[0].text.includes(GITHUB));
  assert.match(await readFile(shellEnvFileFor(dir, "seat-a"), "utf8"), /GITHUB_TOKEN/);
});

test("the panel gets back the message as the model read it, so its bubble never shows the secret", async (t) => {
  const dir = await scratch(t);
  const sockFile = join(dir, "seat.sock");
  const server = createSeatServer({
    sockFile,
    shellEnvFile: shellEnvFileFor(dir, "seat-a"),
    handleCommand: (cmd, reply) => reply({ ok: true, cid: cmd.cid }),
    emit: () => 0,
  });
  t.after(() => server.close());
  await new Promise((up) => server.on("listening", up));
  const say = (text) => new Promise((settle, fail) => {
    const conn = connect(sockFile, () => conn.write(JSON.stringify({ type: "say", text, cid: "c1" }) + "\n"));
    conn.on("data", (data) => { conn.destroy(); settle(JSON.parse(String(data))); });
    conn.on("error", fail);
  });
  const withSecret = await say(`chave ${GITHUB}`);
  assert.equal(withSecret.shown, "chave $GITHUB_TOKEN");
  assert.equal(withSecret.cid, "c1");
  const plain = await say("bom dia");
  assert.equal(plain.shown, undefined);
});
