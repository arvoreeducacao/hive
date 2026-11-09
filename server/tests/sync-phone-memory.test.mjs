import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLOSED_SHOWN_MS, createSyncBroker } from "../sync/broker.mjs";
import { Device, EVENTS_KEPT, LEAN_REPLICA_KEY, RECENT_REPLICA_KEY, memoryStore } from "../sync/device.mjs";
import { localFetch } from "../sync/mount.mjs";
import { rawOfSsh } from "../sync/crypto.mjs";
import { newIdentity } from "../identity.mjs";

async function hiveWithPhone({ now = () => Date.now(), store = memoryStore() } = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-phone-memory-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const trusted = (fingerprint) => (fingerprint === macIdentity.fingerprint ? { signer: rawOfSsh(macIdentity.publicSsh), name: "mac", kind: "mac" } : null);
  const broker = createSyncBroker({ dataDir, audience: pod.fingerprint, owner: "jonas", trusted, now });
  const fetchImpl = localFetch(broker);
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, fetchImpl, lean: true });
  await mac.enroll("http://sync/sync");
  const phone = await Device.create({ name: "phone", store, fetchImpl });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  const done = () => { broker.close(); rmSync(dataDir, { recursive: true, force: true }); };
  return { broker, mac, phone, store, fetchImpl, done };
}

test("a phone keeps only the newest events of a chat, without their ciphertext", async () => {
  const { mac, phone, done } = await hiveWithPhone();
  await mac.openSeat({ id: "comprido", title: "um chat comprido" });
  for (let at = 1; at <= EVENTS_KEPT + 50; at += 1) await mac.write("comprido", { type: "assistant", text: `linha ${at}` });

  await phone.sync();
  const kept = phone.replica.get("comprido");
  assert.equal(kept.events.length, EVENTS_KEPT);
  assert.equal(kept.events[0].value.text, "linha 51");
  assert.equal(kept.gapBefore, 51, "the phone says where its copy begins");
  for (const field of ["ct", "nonce", "sig"]) assert.equal(field in kept.events[0], false, `the kept event still carries ${field}`);

  await mac.write("comprido", { type: "assistant", text: "mais uma" });
  await phone.sync();
  assert.equal(kept.events.length, EVENTS_KEPT, "a new event pushes the oldest out");
  assert.equal(kept.events.at(-1).value.text, "mais uma");
  assert.equal(kept.gapBefore, 52);
  done();
});

test("a phone still knows the model, the effort and the commands after the events that said them leave", async () => {
  const { mac, phone, done } = await hiveWithPhone();
  await mac.openSeat({ id: "longo", title: "um turno comprido" });
  await mac.write("longo", { type: "system", model: "opus", slash: ["/plano"] });
  await mac.write("longo", { type: "note", subtype: "effort_changed", level: "high" });
  await phone.sync();
  for (let at = 1; at <= EVENTS_KEPT + 30; at += 1) await mac.write("longo", { type: "tool", name: "Bash", text: `passo ${at}` });

  await phone.sync();
  const kept = phone.replica.get("longo");
  assert.deepEqual(kept.events.slice(0, 2).map((one) => one.value.type), ["system", "note"], "the phone was away and came back past the window");
  assert.equal(kept.events.length, EVENTS_KEPT + 2);
  assert.equal(kept.gapBefore, kept.events[2].seq);

  await mac.write("longo", { type: "system", model: "sonnet", slash: ["/plano", "/novo"] });
  for (let at = 1; at <= EVENTS_KEPT + 10; at += 1) {
    await mac.write("longo", { type: "tool", name: "Bash", text: `depois ${at}` });
    if (at % 50 === 0) await phone.sync();
  }
  await phone.sync();
  const systems = kept.events.filter((one) => one.value.type === "system");
  assert.deepEqual(systems.map((one) => one.value.model), ["sonnet"], "only the newest word on the model is carried");
  assert.equal(kept.events.find((one) => one.value.type === "note").value.level, "high");
  assert.equal(kept.events.length, EVENTS_KEPT + 2);
  assert.ok(kept.events.slice(2).every((one, at, all) => at === 0 || one.seq === all[at - 1].seq + 1), "the window behind them stays in order");
  done();
});

test("a phone opened again never reads the old full copy, and clears it", async () => {
  const store = memoryStore();
  const { mac, phone, fetchImpl, done } = await hiveWithPhone({ store });
  await mac.openSeat({ id: "curto", title: "um chat curto" });
  await mac.write("curto", { type: "assistant", text: "oi" });
  await phone.sync();
  await store.set(LEAN_REPLICA_KEY, { curto: { events: new Array(50000).fill({ seq: 1, value: { type: "assistant", text: "x".repeat(100) } }) } });

  const asked = [];
  const watched = { get: (key) => { asked.push(key); return store.get(key); }, set: (key, value) => store.set(key, value) };
  const again = await Device.restore({ name: "phone", store: watched, fetchImpl });
  assert.equal(asked.includes(LEAN_REPLICA_KEY), false, "the old copy that crashed the phone is read on the way in");
  assert.equal(await store.get(LEAN_REPLICA_KEY), null);
  assert.ok(await store.get(RECENT_REPLICA_KEY));
  assert.deepEqual(again.replica.get("curto").events.map((one) => one.value.text), ["oi"]);
  done();
});

test("a chat closed more than a week ago leaves the phone, and comes back if it reopens", async () => {
  let clock = Date.now();
  const store = memoryStore();
  const { mac, phone, fetchImpl, done } = await hiveWithPhone({ now: () => clock, store });
  await mac.openSeat({ id: "velho", title: "fechado faz tempo" });
  await mac.write("velho", { type: "assistant", text: "antigo" });
  await mac.openSeat({ id: "novo", title: "aberto" });
  await mac.write("novo", { type: "assistant", text: "atual" });
  await mac.closeSeat("velho");
  await phone.sync();
  assert.ok(phone.seats.get("velho")?.closedAt, "a chat closed a moment ago still shows");

  clock += CLOSED_SHOWN_MS + 1000;
  const listed = await phone.call("GET", "/seats");
  assert.deepEqual(listed.seats.map((one) => one.id), ["novo"]);

  const reopened = await Device.restore({ name: "phone", store, fetchImpl });
  await reopened.sync();
  assert.equal(reopened.seats.has("velho"), false);
  assert.equal(reopened.replica.has("velho"), false, "what the phone kept of it goes too");
  assert.equal(reopened.seatKeys.has("velho"), false);
  assert.equal(reopened.replica.get("novo").events[0].value.text, "atual");

  await mac.openSeat({ id: "velho", title: "de volta", fresh: true });
  await mac.write("velho", { type: "assistant", text: "voltou" });
  await reopened.sync();
  assert.equal(reopened.replica.get("velho").title, "de volta");
  assert.deepEqual(reopened.replica.get("velho").events.map((one) => one.value.text), ["voltou"]);
  done();
});
