import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPhoneBridge, syncHostOf } from "../lib/phone-bridge.mjs";
import { createSyncBroker } from "../../server/sync/broker.mjs";
import { Device } from "../../server/sync/device.mjs";
import { isSyncPath, serveSync } from "../../server/sync/mount.mjs";
import { rawOfSsh } from "../../server/sync/crypto.mjs";
import { newIdentity } from "../../server/identity.mjs";

const waitFor = (check, ms = 6000) => new Promise((done, fail) => {
  const started = Date.now();
  const tick = () => {
    if (check()) return done(true);
    if (Date.now() - started > ms) return fail(new Error("waited too long"));
    setTimeout(tick, 20);
  };
  tick();
});

const line = (seq, text) => `${JSON.stringify({ seq, ts: new Date(seq * 1000).toISOString(), type: "assistant", message: { content: [{ type: "text", text }] } })}\n`;

async function stage() {
  const root = mkdtempSync(join(tmpdir(), "hive-phone-bridge-"));
  const home = join(root, "hive");
  for (const dir of ["events", "sock", "shots"]) mkdirSync(join(home, dir), { recursive: true });
  const pod = newIdentity("pod");
  const mac = newIdentity("mac");
  const broker = createSyncBroker({
    dataDir: join(root, "broker"),
    audience: pod.fingerprint,
    owner: "joao",
    trusted: (fp) => (fp === mac.fingerprint ? { signer: rawOfSsh(mac.publicSsh), name: "mac", kind: "mac" } : null)
  });
  const http = createServer((request, response) => {
    const url = new URL(request.url, "http://sync");
    if (isSyncPath(url.pathname)) return serveSync(broker, request, response, url);
    response.writeHead(404);
    response.end();
  });
  await new Promise((ready) => http.listen(0, "127.0.0.1", ready));
  const url = `http://127.0.0.1:${http.address().port}`;
  const typed = [];
  const sock = createSocketServer((connection) => {
    connection.on("data", (chunk) => {
      const said = JSON.parse(String(chunk).trim());
      typed.push(said);
      const reply = said.type === "control" ? (said.op === "catalog" ? { ok: true, models: [{ value: "opus-5", label: "Opus 5", efforts: ["low", "high"] }], current: { model: "opus-5", effort: "high", account: "arvore" } } : { ok: true, model: said.model, level: said.level }) : { ok: true };
      connection.write(`${JSON.stringify(reply)}\n`);
    });
  });
  await new Promise((ready) => sock.listen(join(home, "sock", "cadencia.sock"), ready));
  const close = async () => {
    broker.close();
    sock.close();
    http.closeAllConnections?.();
    await new Promise((done) => http.close(() => done()));
    rmSync(root, { recursive: true, force: true });
  };
  return { root, home, pod, mac, broker, url, typed, close };
}

test("the sync door hangs off the server address", () => {
  assert.equal(syncHostOf("https://hive-joao.example.com/"), "https://hive-joao.example.com/sync");
  assert.equal(syncHostOf("http://127.0.0.1:8791"), "http://127.0.0.1:8791/sync");
});

test("with the switch on, the bridge enrolls this machine, mints a code, hands the chats to the phone and types what the phone says", async () => {
  const it = await stage();
  const events = join(it.home, "events", "cadencia.ndjson");
  writeFileSync(events, line(1, "primeira linha"));
  let on = true;
  const seats = [{ name: "cadencia", title: "a cadência do CRM" }];
  const bridge = createPhoneBridge({
    home: it.home,
    identity: it.mac,
    door: async () => ({ url: it.url, audience: it.pod.fingerprint }),
    seats: async () => seats,
    profile: () => ({ avatar: "cloud/curious/blue", wear: "hat:cap" }),
    enabled: async () => on,
    machineName: () => "mac do joao"
  });
  try {
    const said = await bridge.tick();
    assert.equal(said.running, true);
    assert.deepEqual(said.following, ["cadencia"]);
    assert.equal(bridge.state().enrolled, true);
    assert.equal(bridge.device.fingerprint, it.mac.fingerprint, "the bridge signs with the machine's own hive key");

    const code = await bridge.openCode();
    assert.match(code.code, /^[A-Z2-9]{8}$/);

    const phone = await Device.create({ name: "iphone" });
    await phone.pair(`${it.url}/sync`, code.code);
    phone.listen(() => {});
    await waitFor(() => phone.seats.has("cadencia"));
    await phone.sync();
    assert.equal(phone.replica.get("cadencia").title, "a cadência do CRM");
    assert.equal(phone.replica.get("cadencia").events[0].value.text, "primeira linha");
    assert.equal(phone.people.find((one) => one.kind === "mac").profile.wear, "hat:cap");

    const listed = await bridge.devices();
    assert.deepEqual(listed.devices.map((one) => one.name), ["iphone"]);

    appendFileSync(events, line(2, "segunda linha"));
    await waitFor(() => phone.replica.get("cadencia").events.length === 2);

    await phone.intend("cadencia", { type: "say", text: "pode ir" });
    await waitFor(() => it.typed.length === 1);
    assert.equal(it.typed[0].type, "say");
    assert.equal(it.typed[0].text, "pode ir");

    const one = await phone.putBlob("cadencia", new Uint8Array([1, 2, 3]));
    const two = await phone.putBlob("cadencia", new Uint8Array([4, 5, 6]));
    await phone.intend("cadencia", { type: "say", text: "duas fotos", images: [{ id: one, mime: "image/jpeg" }, { id: two, mime: "image/png" }] });
    await waitFor(() => it.typed.length === 2);
    assert.equal((it.typed[1].text.match(/celular-\d+(-1)?\.(jpg|png)/g) || []).length, 2, "both pictures were written and named in the say");

    await phone.intend("cadencia", { type: "control", op: "catalog" });
    await waitFor(() => phone.replica.get("cadencia").events.some((one) => one.value?.type === "intent-done" && one.value.reply?.models));
    const catalog = phone.replica.get("cadencia").events.find((one) => one.value?.type === "intent-done" && one.value.reply?.models).value.reply;
    assert.equal(catalog.models[0].label, "Opus 5");
    assert.deepEqual(catalog.current, { model: "opus-5", effort: "high", account: "arvore" });
    await phone.intend("cadencia", { type: "control", op: "setModel", model: "opus-5" });
    await waitFor(() => it.typed.some((one) => one.type === "control" && one.op === "setModel"));
    assert.equal(it.typed.find((one) => one.op === "setModel").model, "opus-5");
    await phone.intend("cadencia", { type: "control", op: "dropTables" });
    await waitFor(() => phone.replica.get("cadencia").events.some((one) => one.value?.type === "intent-done" && /not a control/.test(one.value.error || "")));

    const handed = await bridge.sendDraft("cadencia", "meia frase que eu não mandei", 8000);
    assert.equal(handed.ok, true);
    await waitFor(() => phone.replica.get("cadencia").draft === "meia frase que eu não mandei");
    assert.equal((await bridge.sendDraft("outro", "x")).ok, false, "a chat the hive does not hold takes no draft");

    const rang = await bridge.buzz("cadencia", "o deploy caiu");
    assert.equal(rang.ok, true);
    await waitFor(() => phone.replica.get("cadencia").events.some((one) => one.value?.type === "buzz"));
    assert.equal((await bridge.buzz("outro", "x")).ok, false);

    const gone = await bridge.revoke(phone.fingerprint);
    assert.equal(gone.revoked, true);
    await assert.rejects(() => phone.call("GET", "/me"), /revoked/);
    assert.deepEqual((await bridge.devices()).devices, []);

    on = false;
    assert.equal((await bridge.tick()).running, false);
    assert.equal(bridge.state().running, false);
    phone.stream?.stop();
  } finally {
    bridge.stop();
    await it.close();
  }
});

test("with no server the bridge says so once and keeps nothing running", async () => {
  const said = [];
  const bridge = createPhoneBridge({
    home: mkdtempSync(join(tmpdir(), "hive-phone-bridge-")),
    identity: newIdentity("mac"),
    door: async () => null,
    seats: async () => [],
    log: (one) => said.push(one)
  });
  assert.equal((await bridge.tick()).running, false);
  assert.equal((await bridge.tick()).running, false);
  assert.match((await bridge.openCode()).error, /no server/);
  assert.equal(said.filter((one) => /no server/.test(one)).length, 1, "the same complaint was logged more than once");
});

test("a chat asked for from the phone is opened by the bridge with the desktop's own opener, and the phone hears its name", async () => {
  const it = await stage();
  const opened = [];
  const bridge = createPhoneBridge({
    home: it.home,
    identity: it.mac,
    door: async () => ({ url: it.url, audience: it.pod.fingerprint }),
    seats: async () => opened.map((one) => ({ name: one.name, title: one.name })),
    machineName: () => "mac do joao",
    spawn: async (mission) => {
      if (/fail/.test(mission.prompt)) return { error: "no seat left on this machine" };
      const made = { id: `n${opened.length + 1}`, name: `chat-${opened.length + 1}`, where: mission.where, prompt: mission.prompt };
      opened.push(made);
      writeFileSync(join(it.home, "events", `${made.name}.ndjson`), line(1, `começando: ${mission.prompt}`));
      return made;
    }
  });
  try {
    await bridge.tick();
    const phone = await Device.create({ name: "iphone" });
    await phone.pair(`${it.url}/sync`, (await bridge.openCode()).code);
    const heard = [];
    phone.listen((note) => heard.push(note));
    await waitFor(() => heard.some((one) => one.kind === "caught-up"));

    const asked = await phone.askBirth(it.mac.fingerprint, { prompt: "revisa o PR 42", where: "cloud" });
    await waitFor(() => heard.some((one) => one.kind === "birth-done" && one.id === asked.id));
    const done = heard.find((one) => one.kind === "birth-done");
    assert.equal(done.name, "chat-1");
    assert.equal(done.where, "cloud");
    assert.deepEqual(opened.map((one) => [one.prompt, one.where]), [["revisa o PR 42", "cloud"]]);
    await waitFor(() => phone.seats.has("chat-1"));
    await waitFor(() => phone.replica.get("chat-1")?.events.length === 1);
    assert.equal(phone.replica.get("chat-1").events[0].value.text, "começando: revisa o PR 42");

    const failed = await phone.askBirth(it.mac.fingerprint, { prompt: "please fail", where: "local" });
    await waitFor(() => heard.some((one) => one.kind === "birth-done" && one.id === failed.id));
    assert.equal(heard.find((one) => one.kind === "birth-done" && one.id === failed.id).error, "no seat left on this machine");

    const empty = await phone.askBirth(it.mac.fingerprint, { prompt: "   ", where: "local" });
    await waitFor(() => heard.some((one) => one.kind === "birth-done" && one.id === empty.id));
    assert.match(heard.find((one) => one.kind === "birth-done" && one.id === empty.id).error, /write what the chat should do/);
    assert.equal(opened.length, 1, "an empty mission opens nothing");
    phone.stream?.stop();
  } finally {
    bridge.stop();
    await it.close();
  }
});

test("a bridge with no opener says so to the phone instead of staying quiet", async () => {
  const it = await stage();
  const bridge = createPhoneBridge({
    home: it.home,
    identity: it.mac,
    door: async () => ({ url: it.url, audience: it.pod.fingerprint }),
    seats: async () => [],
    machineName: () => "mac do joao"
  });
  try {
    await bridge.tick();
    const phone = await Device.create({ name: "iphone" });
    await phone.pair(`${it.url}/sync`, (await bridge.openCode()).code);
    const heard = [];
    phone.listen((note) => heard.push(note));
    await waitFor(() => heard.some((one) => one.kind === "caught-up"));
    const asked = await phone.askBirth(it.mac.fingerprint, { prompt: "abre aí", where: "local" });
    await waitFor(() => heard.some((one) => one.kind === "birth-done" && one.id === asked.id));
    assert.match(heard.find((one) => one.kind === "birth-done").error, /does not open chats/);
    phone.stream?.stop();
  } finally {
    bridge.stop();
    await it.close();
  }
});

test("the bridge answers the phone's asks with what the desktop knows, and says so when it does not", async () => {
  const it = await stage();
  const bridge = createPhoneBridge({
    home: it.home,
    identity: it.mac,
    door: async () => ({ url: it.url, audience: it.pod.fingerprint }),
    seats: async () => [],
    machineName: () => "mac do joao",
    answer: async (kind, payload) => {
      if (kind === "people") return { people: [{ name: "mateus", up: true }, { name: "lucas", up: false }] };
      if (kind === "files") return { files: [`src/${payload.q}.ts`, `docs/${payload.q}.md`] };
      return { error: "this Mac does not answer that" };
    }
  });
  try {
    await bridge.tick();
    const phone = await Device.create({ name: "iphone" });
    await phone.pair(`${it.url}/sync`, (await bridge.openCode()).code);
    const heard = [];
    phone.listen((note) => heard.push(note));
    await waitFor(() => heard.some((one) => one.kind === "caught-up"));
    const people = await phone.ask(it.mac.fingerprint, "people", {});
    assert.deepEqual(people.people.map((one) => one.name), ["mateus", "lucas"]);
    const files = await phone.ask(it.mac.fingerprint, "files", { seat: "cadencia", where: "local", q: "broker" });
    assert.deepEqual(files.files, ["src/broker.ts", "docs/broker.md"]);
    await assert.rejects(() => phone.ask(it.mac.fingerprint, "shelf", { slug: "x" }), /does not answer that/);
    phone.stream?.stop();
  } finally {
    bridge.stop();
    await it.close();
  }
});
