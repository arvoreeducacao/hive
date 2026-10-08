import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncBroker } from "../sync/broker.mjs";
import { Device, memoryStore } from "../sync/device.mjs";
import { localFetch, serveSync, isSyncPath } from "../sync/mount.mjs";
import { createRunner } from "../sync/runner.mjs";
import { rawOfSsh } from "../sync/crypto.mjs";
import { newIdentity } from "../identity.mjs";

const waitFor = (check, ms = 4000) => new Promise((done, fail) => {
  const started = Date.now();
  const tick = () => {
    if (check()) return done(true);
    if (Date.now() - started > ms) return fail(new Error("waited too long"));
    setTimeout(tick, 15);
  };
  tick();
});

function host(broker) {
  const http = createServer((request, response) => {
    const url = new URL(request.url, "http://sync");
    if (isSyncPath(url.pathname)) return serveSync(broker, request, response, url);
    response.writeHead(404);
    response.end();
  });
  return new Promise((ready) => http.listen(0, "127.0.0.1", () => ready({ url: `http://127.0.0.1:${http.address().port}/sync`, close: () => new Promise((done) => { http.closeAllConnections?.(); http.close(() => done()); }) })));
}

test("what is typed and not sent travels both ways and the broker never reads it", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-draft-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = createSyncBroker({
    dataDir,
    audience: pod.fingerprint,
    owner: "jonas",
    trusted: (fingerprint) => (fingerprint === macIdentity.fingerprint ? { signer: rawOfSsh(macIdentity.publicSsh), name: "mac", kind: "mac" } : null)
  });
  const door = await host(broker);

  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), lean: true });
  await mac.enroll(door.url, { kind: "mac" });
  const code = await mac.openCode();
  const phone = await Device.create({ name: "iphone" });
  await phone.pair(door.url, code.code);

  const seatId = "cadencia-do-crm";
  await mac.openSeat({ id: seatId, title: "a fila do CRM" });
  await mac.welcomeMates();
  await phone.sync();

  const heardOnThePhone = [];
  phone.listen((note) => { if (note.kind === "draft") heardOnThePhone.push(note); });
  const heardOnTheMac = [];
  mac.listen((note) => { if (note.kind === "draft") heardOnTheMac.push(note); });
  await waitFor(() => broker.online.length === 2);

  await mac.putDraft(seatId, "vou pedir o relatório de ", 1000);
  await waitFor(() => phone.held(seatId).draft === "vou pedir o relatório de ");
  assert.equal(phone.held(seatId).draftAt, 1000);
  assert.equal(heardOnThePhone.at(-1).mine, false, "the phone knows the words came from the other device");

  await phone.putDraft(seatId, "vou pedir o relatório de setembro", 2000);
  await waitFor(() => mac.held(seatId).draft === "vou pedir o relatório de setembro");
  assert.equal(mac.held(seatId).draftAt, 2000);
  assert.equal(heardOnTheMac.at(-1).by, phone.fingerprint);

  const late = await mac.putDraft(seatId, "isto chegou atrasado", 1500);
  assert.equal(late.older, true, "a draft older than the one on the broker does not win");
  await phone.sync();
  assert.equal(phone.held(seatId).draft, "vou pedir o relatório de setembro");

  const kept = broker.state.seats[seatId].draft;
  assert.ok(kept.ct && kept.nonce, "the broker keeps the draft sealed");
  assert.ok(!JSON.stringify(kept).includes("setembro"), "the broker cannot read what is being typed");

  const colleague = await Device.create({ name: "mac da colega" });
  await colleague.pair(door.url, (await mac.openCode({ person: "rafa" })).code);
  await mac.share(seatId, colleague.fingerprint, { write: true });
  await colleague.sync();
  const asSeenByHer = await colleague.call("GET", `/seats/${seatId}`);
  assert.equal(asSeenByHer.draft, null, "someone the chat was shared with does not read what is being typed");
  await assert.rejects(() => colleague.putDraft(seatId, "não devia", 9000), /stays with the person/);

  await phone.putDraft(seatId, "", 3000);
  await waitFor(() => mac.held(seatId).draft === "");

  mac.stream?.stop();
  phone.stream?.stop();
  broker.close();
  await door.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("the runner hands over what was typed on the mac and keeps what was typed on the phone", async () => {
  const root = mkdtempSync(join(tmpdir(), "hive-draft-runner-"));
  const base = join(root, "state");
  for (const dir of ["events", "sock", "shots"]) mkdirSync(join(base, dir), { recursive: true });
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = createSyncBroker({
    dataDir: join(root, "broker"),
    audience: pod.fingerprint,
    owner: "jonas",
    trusted: (fp) => (fp === macIdentity.fingerprint ? { signer: rawOfSsh(macIdentity.publicSsh), name: "mac", kind: "mac" } : null)
  });
  const fetchImpl = localFetch(broker);
  writeFileSync(join(base, "events", "cadencia.ndjson"), `${JSON.stringify({ seq: 1, type: "assistant", message: { content: [{ type: "text", text: "pronto" }] } })}\n`);

  const onTheMac = { cadencia: { text: "o que eu estava escrevendo", at: 5000 } };
  const device = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), fetchImpl, lean: true });
  await device.enroll("http://sync/sync", { kind: "mac" });
  const runner = createRunner({
    device,
    base,
    seats: async () => [{ name: "cadencia", title: "a cadência do CRM" }],
    say: async () => ({ ok: true }),
    draftOf: (name) => onTheMac[name] || null,
    keepDraft: (name, text, at) => { onTheMac[name] = { text, at }; },
    pollMs: 50,
    fleetMs: 100
  });
  await runner.start();

  const phone = await Device.create({ name: "phone", fetchImpl });
  await phone.pair("http://sync/sync", (await device.openCode()).code);
  phone.listen(() => {});
  await waitFor(() => phone.seats.has("cadencia"));
  await phone.sync();
  assert.equal(phone.held("cadencia").draft, "o que eu estava escrevendo", "the phone opens the chat with the words left on the mac");

  await phone.putDraft("cadencia", "o que eu estava escrevendo no celular", 6000);
  await waitFor(() => onTheMac.cadencia.text === "o que eu estava escrevendo no celular");
  assert.equal(onTheMac.cadencia.at, 6000);

  runner.stop();
  await phone.putDraft("cadencia", "e isto foi escrito com o mac fechado", 7000);
  const again = createRunner({
    device,
    base,
    seats: async () => [{ name: "cadencia", title: "a cadência do CRM" }],
    say: async () => ({ ok: true }),
    draftOf: (name) => onTheMac[name] || null,
    keepDraft: (name, text, at) => { onTheMac[name] = { text, at }; },
    pollMs: 50,
    fleetMs: 100
  });
  await again.start();
  assert.deepEqual(onTheMac.cadencia, { text: "e isto foi escrito com o mac fechado", at: 7000 }, "the mac catches up with what was typed while it was closed");
  again.stop();
  phone.stream?.stop();
  broker.close();
  rmSync(root, { recursive: true, force: true });
});
