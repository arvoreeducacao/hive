import { test } from "node:test";
import assert from "node:assert";
import { envWithValue, itemWithField, moveToVault, pickVault, vaultSetupOf } from "../lib/hub-vault.mjs";

function fakeOp(answers) {
  const calls = [];
  const op = async (args, extra = {}) => {
    calls.push({ args, ...extra });
    const key = args.slice(0, 2).join(" ");
    const answer = typeof answers[key] === "function" ? answers[key](args, extra) : answers[key];
    return answer || { ok: false, out: "", error: `sem resposta para ${key}` };
  };
  return { op, calls };
}

test("pickVault prefere o cofre pessoal e cai no primeiro", () => {
  assert.equal(pickVault([{ name: "Shared" }, { name: "Employee" }]), "Employee");
  assert.equal(pickVault([{ name: "Private" }]), "Private");
  assert.equal(pickVault([{ name: "Time" }]), "Time");
  assert.equal(pickVault([]), "");
});

test("itemWithField troca o campo que existe e acrescenta o novo", () => {
  const item = { id: "x", fields: [{ label: "A", type: "CONCEALED", value: "velho" }, { label: "B", type: "CONCEALED", value: "b" }] };
  assert.deepEqual(itemWithField(item, "A", "novo").fields.map((f) => [f.label, f.value]), [["B", "b"], ["A", "novo"]]);
  assert.deepEqual(itemWithField(item, "C", "c").fields.map((f) => f.label), ["A", "B", "C"]);
});

test("envWithValue troca só a linha da chave e acrescenta quando falta", () => {
  assert.equal(envWithValue("A=1\nB=2\n", "B", "op://V/hub-env/B"), "A=1\nB=op://V/hub-env/B\n");
  assert.equal(envWithValue("# c\nexport A=1", "A", "x"), "# c\nA=x");
  assert.equal(envWithValue("A=1\n", "C", "3"), "A=1\nC=3\n");
});

test("moveToVault cria o item hub-env quando ele não existe e confere a leitura", async () => {
  const { op, calls } = fakeOp({
    "vault list": { ok: true, out: JSON.stringify([{ name: "Shared" }, { name: "Employee" }]) },
    "item list": { ok: true, out: JSON.stringify([{ id: "zzz", title: "outro" }]) },
    "item create": { ok: true, out: "{}" },
    "read --no-newline": { ok: true, out: "o-segredo" }
  });
  const moved = await moveToVault({ key: "POSTHOG_API_KEY", value: "o-segredo", op });
  assert.deepEqual(moved, { ok: true, vault: "Employee", ref: "op://Employee/hub-env/POSTHOG_API_KEY" });
  const created = calls.find((c) => c.args[1] === "create");
  assert.match(created.template, /"label":"POSTHOG_API_KEY"/);
  assert.ok(calls.every((c) => !c.args.join(" ").includes("o-segredo")), "o valor nunca vai na linha de comando");
});

test("moveToVault edita o item que existe por template, sem o valor na linha de comando", async () => {
  const { op, calls } = fakeOp({
    "vault list": { ok: true, out: JSON.stringify([{ name: "Employee" }]) },
    "item list": { ok: true, out: JSON.stringify([{ id: "zzz", title: "outro" }, { id: "abc", title: "hub-env" }]) },
    "item get": { ok: true, out: JSON.stringify({ id: "abc", title: "hub-env", fields: [{ label: "OUTRA", type: "CONCEALED", value: "x" }] }) },
    "item edit": { ok: true, out: "{}" },
    "read --no-newline": { ok: true, out: "o-segredo" }
  });
  const moved = await moveToVault({ key: "SENTRY_ACCESS_TOKEN", value: "o-segredo", op });
  assert.equal(moved.ok, true);
  assert.deepEqual(calls.find((c) => c.args[1] === "get").args.slice(0, 3), ["item", "get", "abc"]);
  const edited = calls.find((c) => c.args[1] === "edit");
  assert.deepEqual(edited.args.slice(0, 3), ["item", "edit", "abc"]);
  assert.deepEqual(JSON.parse(edited.template).fields.map((f) => f.label), ["OUTRA", "SENTRY_ACCESS_TOKEN"]);
  assert.ok(calls.every((c) => !c.args.join(" ").includes("o-segredo")));
});

test("moveToVault recusa valor vazio, valor que já está no cofre e leitura que não confere", async () => {
  assert.match((await moveToVault({ key: "A", value: "" })).error, /no value/);
  assert.match((await moveToVault({ key: "A", value: "op://V/i/A" })).error, /already in 1Password/);
  const { op } = fakeOp({
    "vault list": { ok: true, out: JSON.stringify([{ name: "Employee" }]) },
    "item list": { ok: true, out: "[]" },
    "item create": { ok: true, out: "{}" },
    "read --no-newline": { ok: true, out: "outro" }
  });
  assert.match((await moveToVault({ key: "A", value: "o-segredo", op })).error, /did not match/);
});

test("moveToVault refuses and writes nothing when the vault already has more than one hub-env item", async () => {
  const { op, calls } = fakeOp({
    "vault list": { ok: true, out: JSON.stringify([{ name: "Employee" }]) },
    "item list": { ok: true, out: JSON.stringify([{ id: "a", title: "hub-env" }, { id: "b", title: "hub-env" }]) }
  });
  const moved = await moveToVault({ key: "A", value: "o-segredo", op });
  assert.equal(moved.reason, "vault-duplicate");
  assert.match(moved.error, /2 items named hub-env/);
  assert.ok(calls.every((c) => !["get", "create", "edit"].includes(c.args[1])));
});

test("moveToVault does not create a second hub-env item when 1Password fails to return the existing one", async () => {
  const { op, calls } = fakeOp({
    "vault list": { ok: true, out: JSON.stringify([{ name: "Employee" }]) },
    "item list": { ok: true, out: JSON.stringify([{ id: "a", title: "hub-env" }]) },
    "item get": { ok: false, out: "", error: "authorization prompt dismissed" }
  });
  const moved = await moveToVault({ key: "A", value: "o-segredo", op });
  assert.deepEqual(moved, { error: "authorization prompt dismissed", reason: "vault-failed" });
  assert.ok(calls.every((c) => c.args[1] !== "create"));
});

test("moveToVault explica quando o op não está instalado", async () => {
  const { op } = fakeOp({ "vault list": { ok: false, out: "", error: "ENOENT" } });
  assert.deepEqual(await moveToVault({ key: "A", value: "v", op }), { error: "the op command is not installed", reason: "no-op" });
});

test("vaultSetupOf separa sem op, sem integração e conectado", async () => {
  assert.deepEqual(await vaultSetupOf({ op: fakeOp({}).op }), { installed: false, signedIn: false, vault: "", account: "" });
  const semConta = fakeOp({ "--version": { ok: true, out: "2.42.0" }, "account list": { ok: true, out: "[]" } });
  assert.equal((await vaultSetupOf({ op: semConta.op })).integration, false);
  const ok = fakeOp({ "--version": { ok: true, out: "2.42.0" }, "account list": { ok: true, out: JSON.stringify([{ email: "pessoa@exemplo.com" }]) }, "vault list": { ok: true, out: JSON.stringify([{ name: "Employee" }]) } });
  assert.deepEqual(await vaultSetupOf({ op: ok.op }), { installed: true, integration: true, signedIn: true, account: "pessoa@exemplo.com", vault: "Employee" });
});
