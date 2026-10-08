import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncBroker } from "../sync/broker.mjs";
import { Device, memoryStore } from "../sync/device.mjs";
import { localFetch } from "../sync/mount.mjs";
import { createRunner, firstWindowOf, slim, targetOf } from "../sync/runner.mjs";
import { fileStore } from "../sync/store.mjs";
import { aadOf, decrypt, rawOfSsh, textOf } from "../sync/crypto.mjs";
import { newIdentity } from "../identity.mjs";

const waitFor = (check, ms = 5000) => new Promise((done, fail) => {
  const started = Date.now();
  const tick = () => {
    if (check()) return done(true);
    if (Date.now() - started > ms) return fail(new Error("waited too long"));
    setTimeout(tick, 15);
  };
  tick();
});

const line = (seq, event) => `${JSON.stringify({ seq, ts: new Date(seq * 1000).toISOString(), ...event })}\n`;

const openNotice = async (phone, seat, payload) => JSON.parse(textOf(await decrypt(
  phone.keyFor(seat, payload.n.keyId),
  aadOf({ seat, lane: "notice", seq: payload.seq, keyId: payload.n.keyId }),
  payload.n
)));

function stage() {
  const root = mkdtempSync(join(tmpdir(), "hive-runner-"));
  const base = join(root, "state");
  for (const dir of ["events", "sock", "shots"]) mkdirSync(join(base, dir), { recursive: true });
  const pod = newIdentity("pod");
  const mac = newIdentity("mac");
  const broker = createSyncBroker({
    dataDir: join(root, "broker"),
    audience: pod.fingerprint,
    owner: "jonas",
    trusted: (fp) => (fp === mac.fingerprint ? { signer: rawOfSsh(mac.publicSsh), name: "mac", kind: "mac" } : null)
  });
  return { root, base, pod, mac, broker, fetchImpl: localFetch(broker) };
}

test("what the driver writes becomes slim events: text, tools, questions, pictures and what the person said", () => {
  assert.deepEqual(slim({ seq: 1, type: "stream_event" }), []);
  assert.deepEqual(slim({ seq: 90, type: "driver", subtype: "plan", id: "p1", plan: "abre três frentes" }), [{ hiveSeq: 90, ts: "", type: "plan", id: "p1", plan: "abre três frentes" }]);
  assert.deepEqual(slim({ seq: 91, type: "driver", subtype: "plan_approved", id: "p1" }), [{ hiveSeq: 91, ts: "", type: "plan-closed", id: "p1", went: true }]);
  assert.deepEqual(slim({ seq: 92, type: "driver", subtype: "plan_dismissed", id: "p1" }), [{ hiveSeq: 92, ts: "", type: "plan-closed", id: "p1", went: false }]);
  assert.deepEqual(slim({ seq: 2, type: "system", subtype: "init", model: "claude-opus-5" }), [{ hiveSeq: 2, ts: "", type: "system", model: "claude-opus-5" }]);
  const said = slim({ seq: 3, type: "assistant", message: { content: [{ type: "text", text: "olá" }, { type: "tool_use", name: "Bash", input: { description: "list files" } }] } });
  assert.deepEqual(said.map((one) => one.type), ["assistant", "tool"]);
  assert.equal(said[1].target, "list files");
  assert.deepEqual(slim({ seq: 4, type: "assistant", parent_tool_use_id: "x", message: { content: [{ type: "text", text: "sub" }] } }), []);
  const asked = slim({ seq: 5, type: "driver", subtype: "question", id: "q1", questions: [{ question: "vai?", header: "Vai", options: [{ label: "sim", description: "" }] }] });
  assert.equal(asked[0].type, "question");
  assert.equal(asked[0].questions[0].options[0].label, "sim");
  assert.deepEqual(slim({ seq: 6, type: "driver", subtype: "question_answered", id: "q1" }), [{ hiveSeq: 6, ts: "", type: "question-closed", id: "q1" }]);
  const shot = slim({ seq: 7, type: "user", message: { content: [{ type: "tool_result", content: [{ type: "image", path: "/x/shots/a/1.png" }] }] } });
  assert.deepEqual(shot, [{ hiveSeq: 7, ts: "", type: "shot", path: "/x/shots/a/1.png" }]);
  const typed = slim({ seq: 8, type: "user", subtype: "say", message: { content: [{ type: "text", text: "faz isso" }] } });
  assert.equal(typed[0].type, "user");
  assert.equal(typed[0].text, "faz isso");
  assert.deepEqual(slim({ seq: 9, type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }), []);
  assert.equal(slim({ seq: 10, type: "driver", subtype: "title_changed", title: "novo" })[0].type, "title");
  assert.equal(slim({ seq: 11, type: "driver", subtype: "interrupted", ms: 3 })[0].type, "note");
  assert.equal(slim({ seq: 12, type: "result", total_cost_usd: 0.5, num_turns: 3 })[0].cost, 0.5);
  assert.equal(targetOf("Read", { file_path: "/a/b/c/d.mjs" }), "c/d.mjs");
});

test("the first window opens on a turn the person started, reads only the tail of a long file, and caps how much goes up", () => {
  const root = mkdtempSync(join(tmpdir(), "hive-window-"));
  const file = join(root, "events.ndjson");
  let text = "";
  for (let at = 1; at <= 40; at += 1) {
    text += at % 4 === 1
      ? line(at, { type: "user", subtype: "say", message: { content: [{ type: "text", text: `turno ${at}` }] } })
      : line(at, { type: "assistant", message: { content: [{ type: "text", text: "x".repeat(60) }] } });
  }
  writeFileSync(file, text);
  const whole = firstWindowOf(file, { turns: 2 });
  assert.equal(whole.turns, 2);
  assert.equal(whole.events, 8);
  assert.equal(readFileSync(file, "utf8").slice(whole.offset).startsWith(line(33, {}).slice(0, 12)), true, "the window does not begin on the turn the person started");
  const tail = firstWindowOf(file, { bytes: 900, turns: 8 });
  assert.ok(tail.offset > 0, "a file bigger than the byte window is read from its tail");
  assert.ok(readFileSync(file, "utf8").slice(tail.offset).startsWith("{"), "the window begins in the middle of a line");
  const capped = firstWindowOf(file, { turns: 20, events: 5 });
  assert.equal(capped.events, 5);
  rmSync(root, { recursive: true, force: true });
});

test("the runner mirrors a chat from its tail, keeps following it, hands what the phone types to the seat and writes the picture down", async () => {
  const { root, base, mac, broker, fetchImpl } = stage();
  const events = join(base, "events", "cadencia.ndjson");
  let text = "";
  for (let at = 1; at <= 50; at += 1) {
    text += at % 5 === 1
      ? line(at, { type: "user", subtype: "say", message: { content: [{ type: "text", text: `pergunta ${at}` }] } })
      : line(at, { type: "assistant", message: { content: [{ type: "text", text: `linha ${at}` }] } });
  }
  writeFileSync(events, text);
  writeFileSync(join(base, "shots", "grande.png"), Buffer.from("PNGDATA"));

  const seats = [{ name: "cadencia", title: "a cadência do CRM" }];
  const said = [];
  const device = await Device.fromIdentity({ name: "mac", secret: mac.secret, publicSsh: mac.publicSsh, store: fileStore(join(root, "mac-store")), fetchImpl, lean: true });
  await device.enroll("http://sync/sync");
  const runner = createRunner({
    device, base, seats: async () => seats, say: async (seat, cmd) => { said.push({ seat, cmd }); return { ok: true }; },
    profile: () => ({ avatar: "cloud/curious/blue", wear: "" }), pollMs: 50, fleetMs: 100, firstWindow: { turns: 3 }
  });
  await runner.start();
  assert.deepEqual(runner.following, ["cadencia"]);

  const phone = await Device.create({ name: "phone", fetchImpl });
  await phone.pair("http://sync/sync", (await device.openCode()).code);
  const heard = [];
  phone.listen((note) => heard.push(note));
  await waitFor(() => phone.seats.has("cadencia"), 5000);
  await phone.sync();
  const kept = phone.replica.get("cadencia");
  assert.equal(kept.title, "a cadência do CRM");
  assert.equal(kept.events.length, 15, "the first window is the last three turns of the conversation, not the whole file");
  assert.equal(kept.events[0].value.text, "pergunta 36");
  assert.equal(kept.events.at(-1).value.text, "linha 50");
  assert.equal(phone.people.find((one) => one.fingerprint === device.fingerprint).profile.avatar, "cloud/curious/blue");

  await waitFor(() => heard.some((one) => one.kind === "caught-up"));

  appendFileSync(events, line(51, { type: "assistant", message: { content: [{ type: "text", text: "**markdown** chegou" }] } }));
  appendFileSync(events, line(52, { type: "user", message: { content: [{ type: "tool_result", content: [{ type: "image", path: join(base, "shots", "grande.png") }] }] } }));
  await waitFor(() => kept.events.some((one) => one.value?.type === "shot"));
  const shot = kept.events.find((one) => one.value?.type === "shot");
  assert.equal(shot.value.mime, "image/png");
  assert.equal(textOf(await phone.getBlob("cadencia", shot.value.blob)), "PNGDATA");
  assert.equal(kept.events.find((one) => one.value?.text === "**markdown** chegou").seq, shot.seq - 1);

  await phone.intend("cadencia", { type: "say", text: "pode ir" });
  await waitFor(() => said.length === 1);
  assert.deepEqual(said[0], { seat: "cadencia", cmd: { type: "say", text: "pode ir" } });
  await waitFor(() => kept.events.some((one) => one.value?.type === "intent-done" && one.value.ok));

  const photo = await phone.putBlob("cadencia", new TextEncoder().encode("JPEGDATA"));
  await phone.intend("cadencia", { type: "say", text: "olha", image: { id: photo, mime: "image/jpeg" } });
  await waitFor(() => said.length === 2);
  const written = readdirSync(join(base, "shots", "cadencia")).find((one) => one.startsWith("celular-"));
  assert.ok(written, "the phone's picture was not written next to the seat's shots");
  assert.equal(readFileSync(join(base, "shots", "cadencia", written), "utf8"), "JPEGDATA");
  assert.equal(said[1].cmd.text, `olha ${join(base, "shots", "cadencia", written)}`);

  await phone.intend("cadencia", { type: "answer", id: "q1", answers: { "vai?": "sim" } });
  await waitFor(() => said.length === 3);
  assert.deepEqual(said[2].cmd, { type: "answer", id: "q1", answers: { "vai?": "sim" } });

  await phone.intend("cadencia", { type: "interrupt" });
  await waitFor(() => said.length === 4);
  assert.deepEqual(said[3].cmd, { type: "interrupt" });

  seats[0].title = "renomeado";
  await waitFor(() => kept.title === "renomeado");

  seats.length = 0;
  await waitFor(() => phone.seats.get("cadencia")?.closedAt > 0);
  assert.deepEqual(runner.following, []);

  runner.stop();
  phone.stream?.stop();
  broker.close();
  rmSync(root, { recursive: true, force: true });
});

test("a runner that comes back keeps its place: nothing is mirrored twice and an old intent is not typed again", async () => {
  const { root, base, mac, broker, fetchImpl } = stage();
  const events = join(base, "events", "um.ndjson");
  writeFileSync(events, line(1, { type: "assistant", message: { content: [{ type: "text", text: "um" }] } }));
  const store = fileStore(join(root, "mac-store"));
  const said = [];
  const make = async () => {
    const device = await Device.fromIdentity({ name: "mac", secret: mac.secret, publicSsh: mac.publicSsh, store, fetchImpl, lean: true });
    await device.enroll("http://sync/sync");
    return { device, runner: createRunner({ device, base, seats: async () => [{ name: "um", title: "um" }], say: async (seat, cmd) => { said.push(cmd); return { ok: true }; }, pollMs: 50, fleetMs: 100 }) };
  };
  const first = await make();
  await first.runner.start();
  const phone = await Device.create({ name: "phone", fetchImpl });
  await phone.pair("http://sync/sync", (await first.device.openCode()).code);
  phone.listen(() => {});
  await waitFor(() => phone.seats.has("um"));
  await phone.sync();
  await phone.intend("um", { type: "say", text: "antes" });
  await waitFor(() => said.length === 1);
  first.runner.stop();

  appendFileSync(events, line(2, { type: "assistant", message: { content: [{ type: "text", text: "dois" }] } }));
  await phone.intend("um", { type: "say", text: "enquanto o mac dormia" });

  const second = await make();
  await second.runner.start();
  await phone.sync();
  const kept = phone.replica.get("um");
  assert.deepEqual(kept.events.filter((one) => one.value?.type === "assistant").map((one) => one.value.text), ["um", "dois"]);
  await waitFor(() => said.length === 2);
  assert.equal(said[1].text, "enquanto o mac dormia", "what was typed while the mac slept is delivered once it is back");
  await new Promise((wake) => setTimeout(wake, 200));
  assert.equal(said.length, 2, "the intent from before the restart was typed again");

  writeFileSync(events, line(1, { type: "assistant", message: { content: [{ type: "text", text: "outra conversa" }] } }));
  await waitFor(() => phone.replica.get("um").events.some((one) => one.value?.text === "outra conversa"));
  assert.equal(phone.replica.get("um").events.length, 1, "a file that started over starts the chat over on the phone");

  second.runner.stop();
  phone.stream?.stop();
  broker.close();
  assert.ok(existsSync(join(root, "mac-store", "agreer.json")));
  rmSync(root, { recursive: true, force: true });
});

test("the chat's slash commands travel to the phone with the first turn and when they change", () => {
  const first = slim({ type: "system", subtype: "init", model: "claude", slash_commands: ["compact", "clear", { name: "review" }], terminal_slash_commands: ["clear"] });
  assert.deepEqual(first.map((one) => [one.type, one.slash]), [["system", ["compact", "review"]]]);
  const changed = slim({ type: "driver", subtype: "commands_changed", commands: [{ name: "plan" }, "ship"] });
  assert.deepEqual(changed.map((one) => [one.type, one.names]), [["commands", ["plan", "ship"]]]);
});

test("what the chat runs on travels with the first turn and every change of model, effort or account", () => {
  const first = slim({ type: "system", subtype: "init", model: "opus-5", agent: "claude", effort: "high" });
  assert.deepEqual(first.map((one) => [one.type, one.model, one.agent, one.effort]), [["system", "opus-5", "claude", "high"]]);
  assert.equal(slim({ type: "driver", subtype: "model_changed", model: "sonnet-5", label: "Sonnet 5" })[0].model, "sonnet-5");
  assert.equal(slim({ type: "driver", subtype: "effort_changed", level: "low" })[0].level, "low");
  assert.equal(slim({ type: "driver", subtype: "account_changed", account: "acme" })[0].account, "acme");
});

test("what the chat already said does not ring the phone, and a turn rings it once with the line the person will read", async () => {
  const root = mkdtempSync(join(tmpdir(), "hive-runner-"));
  const base = join(root, "state");
  for (const dir of ["events", "sock", "shots"]) mkdirSync(join(base, dir), { recursive: true });
  const pod = newIdentity("pod");
  const mac = newIdentity("mac");
  const rang = [];
  const notices = { publicKey: async () => "BKeyOfThisHive", send: async (to, payload) => { rang.push(payload); return { ok: true, gone: false, status: 201 }; } };
  const broker = createSyncBroker({
    dataDir: join(root, "broker"),
    audience: pod.fingerprint,
    owner: "jonas",
    notices,
    doneFloorMs: 0,
    trusted: (fp) => (fp === mac.fingerprint ? { signer: rawOfSsh(mac.publicSsh), name: "mac", kind: "mac" } : null)
  });
  const fetchImpl = localFetch(broker);
  const events = join(base, "events", "fila.ndjson");
  let text = "";
  for (let at = 1; at <= 36; at += 3) {
    text += line(at, { type: "user", subtype: "say", message: { content: [{ type: "text", text: `pergunta ${at}` }] } });
    text += line(at + 1, { type: "assistant", message: { content: [{ type: "text", text: `resposta ${at}` }] } });
    text += line(at + 2, { type: "result", total_cost_usd: 0.1, num_turns: 1 });
  }
  writeFileSync(events, text);

  const device = await Device.fromIdentity({ name: "mac", secret: mac.secret, publicSsh: mac.publicSsh, store: fileStore(join(root, "mac-store")), fetchImpl, lean: true });
  await device.enroll("http://sync/sync");
  const phone = await Device.create({ name: "phone", fetchImpl });
  await phone.pair("http://sync/sync", (await device.openCode()).code);
  await phone.takeNotices({ endpoint: "https://web.push.apple.com/phone", p256dh: "p", auth: "a" }, { needs: true, done: true });

  const runner = createRunner({ device, base, seats: async () => [{ name: "fila", title: "a fila do suporte" }], say: async () => ({ ok: true }), pollMs: 30, fleetMs: 60, firstWindow: { turns: 4 } });
  await runner.start();
  await waitFor(() => (device.seats.get("fila")?.lastSeq || 0) >= 12);
  assert.deepEqual(rang, [], "the turns already in the transcript are history, and history does not ring a phone");

  appendFileSync(events, line(40, { type: "assistant", message: { content: [{ type: "text", text: "  li a fila\ninteira, são 135 " }] } }));
  appendFileSync(events, line(41, { type: "result", total_cost_usd: 0.2, num_turns: 2 }));
  await waitFor(() => rang.length === 1);
  await new Promise((done) => setTimeout(done, 120));
  assert.equal(rang.length, 1, "one turn rings once");
  assert.equal(rang[0].wake, "done");
  await phone.sync();
  const said = await openNotice(phone, "fila", rang[0]);
  assert.equal(said.title, "a fila do suporte");
  assert.equal(said.text, "li a fila inteira, são 135");

  rang.length = 0;
  appendFileSync(events, line(42, { type: "driver", subtype: "question", id: "q1", questions: [{ question: "posso mexer no schema?", header: "schema", options: [] }] }));
  appendFileSync(events, line(43, { type: "result", total_cost_usd: 0.1, num_turns: 1 }));
  await waitFor(() => rang.length === 1);
  await new Promise((done) => setTimeout(done, 120));
  assert.equal(rang.length, 1, "a question and the turn that ends on it are one interruption, not two");
  assert.equal(rang[0].wake, "needs");
  await phone.sync();
  assert.equal((await openNotice(phone, "fila", rang[0])).text, "posso mexer no schema?");

  await runner.stop();
  broker.close();
  rmSync(root, { recursive: true, force: true });
});
