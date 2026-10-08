import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOCTOR } from "../lib/doctor-client.mjs";

test("o caminho do doctor aponta pra um arquivo que existe", () => {
  assert.equal(existsSync(DOCTOR), true, `a faixa de ambiente so mostra o rodape do crash: ${DOCTOR} nao existe`);
});

let dispensed = 0;

function fakeDoctor(dir, items) {
  const script = join(dir, "doctor.mjs");
  writeFileSync(script, `import { existsSync } from "node:fs";
const green = ${JSON.stringify(join(dir, "green"))};
const items = ${JSON.stringify(items)}.map((item) => (item.greenWhenFixed && existsSync(green) ? { ...item, state: "ok", detail: "all set", fix: null } : item));
process.stdout.write(JSON.stringify({ dev: "rafael", pod: "ws-rafael-0", generatedAt: new Date().toISOString(), items }));
`);
  return { script, green: join(dir, "green") };
}

async function clientFor(build) {
  const dir = mkdtempSync(join(tmpdir(), "hive-doctor-"));
  const green = join(dir, "green");
  const { script } = fakeDoctor(dir, typeof build === "function" ? build(green) : build);
  process.env.HIVE_DOCTOR = script;
  const client = await import(`../lib/doctor-client.mjs?fresh=${++dispensed}`);
  delete process.env.HIVE_DOCTOR;
  return { client, green };
}

const DISK = {
  id: "disk", title: "space on /workspace", state: "warn", detail: "89% used, 4.2 GiB free",
  fix: { label: "see what is eating the disk", command: "printf 'first\\nsecond\\nthird\\n'", kind: "investigate" }
};

test("investigar devolve a saida mesmo com a checagem seguindo vermelha", async () => {
  const { client } = await clientFor([DISK]);
  const r = await client.applyFix("disk");
  assert.equal(r.ok, true, `a caixa-preta continua invisivel: ${r.error}`);
  assert.equal(r.id, "disk");
  assert.equal(r.kind, "investigate");
  assert.equal(r.label, "see what is eating the disk");
  assert.equal(r.output, "first\nsecond\nthird\n", "investigacao aparada como se fosse rodape de fix");
  assert.equal(r.state, "warn");
  assert.equal(r.detail, "89% used, 4.2 GiB free");
});

test("investigar cai pro stderr quando o comando so fala por ali, e apara em 8000", async () => {
  const quiet = { ...DISK, fix: { ...DISK.fix, command: "printf 'nothing on stdout' >&2" } };
  const flood = { ...DISK, id: "flood", fix: { ...DISK.fix, command: "printf 'x%.0s' $(seq 1 9000)" } };
  const { client } = await clientFor([quiet, flood]);
  assert.equal((await client.applyFix("disk")).output, "nothing on stdout");
  const big = await client.applyFix("flood");
  assert.equal(big.output.length, client.INVESTIGATION_LIMIT);
});

test("investigar so erra quando o proprio comando morre", async () => {
  const broken = { ...DISK, fix: { ...DISK.fix, command: "echo 'du: cannot read' >&2; exit 1" } };
  const { client } = await clientFor([broken]);
  const r = await client.applyFix("disk");
  assert.equal(r.ok, undefined);
  assert.equal(r.error, "du: cannot read");
  assert.equal(r.kind, "investigate");
});

test("corrigir continua sem poder alegar sucesso antes do verde", async () => {
  const item = {
    id: "hub-context", title: "canonical hub context on the pod", state: "warn",
    detail: "3 commit(s) behind origin/main", group: "hub-checkout",
    fix: { label: "sync the canonical hub context", command: "echo pulled" }
  };
  const { client } = await clientFor([item]);
  const r = await client.applyFix("hub-context");
  assert.equal(r.ok, undefined, "o --fix voltou a mentir");
  assert.match(r.error, /hub-context is still warn after the fix/);
  assert.equal(r.kind, "fix");
});

test("corrigir alega sucesso quando a checagem fica verde", async () => {
  const { client } = await clientFor((green) => [{
    id: "hub-context", title: "canonical hub context on the pod", state: "warn", detail: "3 commit(s) behind", greenWhenFixed: true,
    fix: { label: "sync the canonical hub context", command: `touch ${green} && printf 'a\\nb\\nc\\n'` }
  }]);
  const r = await client.applyFix("hub-context");
  assert.equal(r.ok, true, `a correcao ficou verde e mesmo assim foi dada como falha: ${r.error}`);
  assert.equal(r.id, "hub-context");
  assert.equal(r.kind, "fix");
  assert.equal(r.label, "sync the canonical hub context");
  assert.equal(r.output, "b c", "o fix segue com as duas ultimas linhas, nao com a saida inteira");
});

test("copiar e recusado no servidor, e fica de fora do automatico", async () => {
  const items = [
    DISK,
    { id: "pod", title: "pod", state: "fail", detail: "node died", fix: { label: "see why the node died", command: "kubectl describe node <node>", kind: "investigate" } },
    { id: "clock", title: "clock", state: "warn", detail: "drifted", fix: { label: "sync this machine's clock", command: "sudo sntp -sS time.apple.com" } },
    { id: "config", title: "config", state: "ok", detail: "all set", fix: null }
  ];
  const { client } = await clientFor(items);
  const report = await client.readDoctor(true);
  assert.deepEqual(report.automatic, ["disk"]);
  assert.equal(report.items.find((i) => i.id === "disk").fix.kind, "investigate");
  assert.equal(report.items.find((i) => i.id === "pod").fix.kind, "copy");
  assert.equal(report.items.find((i) => i.id === "clock").fix.kind, "copy");
  assert.equal(report.items.find((i) => i.id === "config").fix, null);

  const r = await client.applyFix("pod");
  assert.equal(r.ok, undefined);
  assert.equal(r.kind, "copy");
  assert.equal(r.command, "kubectl describe node <node>");
  assert.match(r.error, /needs you at the keyboard/);
});

test("acordar ou logar pelo servidor nao deixa o achado do doctor contando a historia velha", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const from = server.indexOf('if (["wake", "login-start"');
  assert.ok(from >= 0, "o caminho que executa acoes no servidor saiu do lugar");
  const route = server.slice(from, server.indexOf("\n  }\n", from));
  assert.match(route, /doctor\?\.invalidateDoctor\(\)/, "o doctor so releria o servidor 10 min depois da acao");
  assert.match(route, /podAction\(/);
});

test("o contexto do hub atrasado se sincroniza sozinho na leitura e o relatorio ja volta verde", async () => {
  const { client, green } = await clientFor((green) => [{
    id: "hub-context", title: "canonical hub context on the server", state: "warn", detail: "4 commit(s) behind", greenWhenFixed: true,
    fix: { label: "sync the canonical hub context", command: `touch ${green}`, heals: true }
  }]);
  const report = await client.readDoctor(true);
  assert.equal(existsSync(green), true, "o fix que se cura sozinho nao rodou");
  assert.equal(report.items.find((i) => i.id === "hub-context").state, "ok");
  assert.deepEqual(report.healed, [{ id: "hub-context", label: "sync the canonical hub context", ok: true, error: "" }]);
});

test("so roda sozinho o fix marcado, o resto espera o clique", async () => {
  const { client, green } = await clientFor((green) => [{
    id: "pod", title: "pod", state: "warn", detail: "old server", greenWhenFixed: true,
    fix: { label: "restart the box onto the new server", command: `touch ${green}` }
  }]);
  const report = await client.readDoctor(true);
  assert.equal(existsSync(green), false, "um fix sem a marca rodou sem ninguem pedir");
  assert.deepEqual(report.healed, []);
});

test("o fix que falha sozinho nao tenta de novo a cada leitura", async () => {
  const { client } = await clientFor((green) => [{
    id: "hub-context", title: "canonical hub context on the server", state: "warn", detail: "4 commit(s) behind",
    fix: { label: "sync the canonical hub context", command: `echo diverged >&2; echo x >> ${green}; exit 1`, heals: true }
  }]);
  const first = await client.readDoctor(true);
  assert.deepEqual(first.healed, [{ id: "hub-context", label: "sync the canonical hub context", ok: false, error: "diverged" }]);
  const second = await client.readDoctor(true);
  assert.deepEqual(second.healed, []);
});

test("um conserto que roda dentro do servidor vai pela porta do servidor, nao pelo interruptor do cluster", async () => {
  const { client, green } = await clientFor((done) => [{
    id: "flags", title: "Claude flags on the server", state: "fail", detail: "missing hasCompletedOnboarding", greenWhenFixed: true,
    fix: { label: "pre-accept the dialogs", command: "bash <this deployment ships no power switch> exec 'true'", podScript: `touch ${done}`, kind: "fix" }
  }]);
  const ran = [];
  client.runFixesOnTheServer(async (script) => {
    ran.push(script);
    writeFileSync(green, "");
    return { ok: true, out: "done\n", error: "" };
  });
  const r = await client.applyFix("flags");
  assert.equal(r.ok, true, `o conserto caiu no comando de cluster: ${r.error}`);
  assert.deepEqual(ran, [`touch ${green}`]);
});
