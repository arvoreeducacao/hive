import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncBroker } from "../sync/broker.mjs";
import { Device, memoryStore } from "../sync/device.mjs";
import { localFetch } from "../sync/mount.mjs";
import { createRunner } from "../sync/runner.mjs";
import { rawOfSsh } from "../sync/crypto.mjs";
import { newIdentity } from "../identity.mjs";

const MINUTE = 60 * 1000;

const waitFor = (check, ms = 4000) => new Promise((done, fail) => {
  const started = Date.now();
  const tick = () => {
    if (check()) return done(true);
    if (Date.now() - started > ms) return fail(new Error("waited too long"));
    setTimeout(tick, 15);
  };
  tick();
});

async function stage() {
  const root = mkdtempSync(join(tmpdir(), "hive-service-"));
  const base = join(root, "state");
  for (const dir of ["events", "sock", "shots"]) mkdirSync(join(base, dir), { recursive: true });
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = createSyncBroker({
    dataDir: join(root, "broker"),
    audience: pod.fingerprint,
    owner: "jonas",
    trusted: (fp) => (fp === macIdentity.fingerprint ? { signer: rawOfSsh(macIdentity.publicSsh), name: "jonas mac", kind: "mac" } : null)
  });
  const fetchImpl = localFetch(broker);
  const mac = await Device.fromIdentity({ name: "jonas mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), fetchImpl, lean: true });
  await mac.enroll("http://sync/sync");
  const phone = await Device.create({ name: "jonas iphone", fetchImpl });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  const service = await Device.create({ name: "ticket bot", fetchImpl });
  await service.pair("http://sync/sync", (await mac.openCode({ kind: "service" })).code);
  return { root, base, broker, mac, phone, service };
}

test("a service comes in with a code of its own and may only ask for new chats", async () => {
  const { root, broker, mac, phone, service } = await stage();
  assert.equal(service.kind, "service");
  assert.equal(service.person, "jonas");

  const seen = await service.call("GET", "/seats");
  assert.deepEqual(seen.seats, []);
  assert.deepEqual(seen.people.map((one) => one.fingerprint), [mac.fingerprint], "a service sees only the machines that can open a chat for its person");

  for (const [method, path, payload] of [
    ["GET", "/roster"],
    ["POST", "/pair/open", {}],
    ["POST", "/roster/revoke", { fingerprint: phone.fingerprint }],
    ["POST", "/seats", { id: "roubado" }],
    ["POST", "/asks", { id: "a".repeat(32), kind: "files", to: mac.fingerprint, box: { epk: "a", nonce: "b", ct: "c" } }],
    ["POST", "/profile", { avatar: "x" }]
  ]) {
    await assert.rejects(() => service.call(method, path, payload), /a service only asks for new chats/, `${method} ${path} let a service through`);
  }

  let status = 0;
  const sink = { head: (code) => { status = code; }, write: () => {}, end: () => {}, onClose: () => {} };
  await broker.stream({ path: "/stream", method: "GET", headers: await service.signed("GET", "/stream") }, sink);
  assert.equal(status, 403, "a service listened to the person's stream");

  await assert.rejects(() => service.askBirth(phone.fingerprint, { prompt: "x" }), /I do not know a device/, "a service is shown a phone it could ask");
  await assert.rejects(() => phone.askBirth(service.fingerprint, { prompt: "x" }), /a service does not open chats/);

  broker.close();
  rmSync(root, { recursive: true, force: true });
});

test("a chat a service asks for waits a day for the Mac, while the phone's goes stale in minutes", async () => {
  const { root, base, broker, mac, phone, service } = await stage();
  const mission = { prompt: "TKT-1767: the upload button does nothing\n\nFix TKT-1767.", name: "tkt-1767", title: "the upload button does nothing", errand: "Ticket Bot · TKT-1767", where: "local" };

  const fromService = await service.askBirth(mac.fingerprint, mission);
  assert.equal(fromService.online, false, "the Mac was off and the service did not learn it");
  const fromPhone = await phone.askBirth(mac.fingerprint, { prompt: "uma coisa de antes", where: "local" });
  const birthOf = (id) => broker.state.births.find((one) => one.id === id);
  assert.equal(birthOf(fromService.id).fromKind, "service");
  birthOf(fromService.id).at -= 120 * MINUTE;
  birthOf(fromPhone.id).at -= 20 * MINUTE;

  const spawned = [];
  const runner = createRunner({
    device: mac, base, seats: async () => [], say: async () => ({ ok: true }),
    spawn: async (asked) => { spawned.push(asked); return { id: "n1", name: asked.name, where: asked.where }; },
    pollMs: 30, fleetMs: 60
  });
  await runner.start();
  await waitFor(() => spawned.length === 1);
  assert.equal(spawned[0].name, "tkt-1767");
  assert.equal(spawned[0].title, "the upload button does nothing");
  assert.equal(spawned[0].errand, "Ticket Bot · TKT-1767");
  assert.match(spawned[0].prompt, /^TKT-1767: the upload button does nothing/);

  await waitFor(() => birthOf(fromPhone.id)?.done && birthOf(fromService.id)?.done);
  await service.pullBirths();
  assert.equal(service.births.get(fromService.id).answer.name, "tkt-1767");
  await phone.sync();
  assert.match(phone.births.get(fromPhone.id).answer.error, /waited too long/, "a phone's ask twenty minutes old still opened a chat");

  runner.stop();
  broker.close();
  rmSync(root, { recursive: true, force: true });
});
