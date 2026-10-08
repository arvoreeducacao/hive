import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyncBroker, EVENTS_CEILING, EVENTS_FLOOR } from "../sync/broker.mjs";
import { Device, memoryStore } from "../sync/device.mjs";
import { localFetch, serveSync, isSyncPath } from "../sync/mount.mjs";
import { bytesOf, rawOfSsh, toB64 } from "../sync/crypto.mjs";
import { newIdentity } from "../identity.mjs";

const SECRET_TITLE = "o CRM manda a régua sozinho";
const SECRET_LINES = ["li a fila do HubSpot", "achei 3 leads sem dono", "vou abrir o PR"];
const SECRET_ANSWER = "pode ir, mas sem tocar no schema";

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
  return new Promise((ready) => http.listen(0, "127.0.0.1", () => ready({ http, url: `http://127.0.0.1:${http.address().port}/sync`, close: () => new Promise((done) => { http.closeAllConnections?.(); http.close(() => done()); }) })));
}

function brokerIn(dataDir, pod, mac) {
  const trusted = (fingerprint) => {
    if (fingerprint === mac.fingerprint) return { signer: rawOfSsh(mac.publicSsh), name: "mac do jonas", kind: "mac" };
    if (fingerprint === pod.fingerprint) return { signer: rawOfSsh(pod.publicSsh), name: "pod", kind: "pod" };
    return null;
  };
  return createSyncBroker({ dataDir, audience: pod.fingerprint, owner: "jonas", trusted });
}

test("the whole phone story: enroll by signature, pair by code, sync from zero, live both ways, share, revoke, pictures, clock, restart, compaction", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  let broker = brokerIn(dataDir, pod, macIdentity);
  let door = await host(broker);

  const mac = await Device.fromIdentity({ name: "mac do jonas", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), lean: true });
  const enrolled = await mac.enroll(door.url, { kind: "mac" });
  assert.equal(enrolled.person, "jonas");
  assert.equal(mac.audience, pod.fingerprint, "the mac pins the pod's own fingerprint as audience");
  assert.equal(mac.fingerprint, macIdentity.fingerprint, "the mac keeps the fingerprint of its hive identity");

  const podDevice = await Device.fromIdentity({ name: "pod", secret: pod.secret, publicSsh: pod.publicSsh, store: memoryStore(), fetchImpl: localFetch(broker), lean: true });
  await podDevice.enroll("http://sync/sync", { kind: "pod" });
  assert.equal(podDevice.kind, "pod");

  const stranger = await Device.create({ name: "intruso" });
  await assert.rejects(() => stranger.enroll(door.url), /not on the roster/);

  const code = await mac.openCode();
  const phone = await Device.create({ name: "iphone do jonas" });
  await phone.pair(door.url, code.code);
  assert.equal(phone.person, "jonas");
  assert.equal(phone.kind, "phone");
  await assert.rejects(() => phone.call("POST", "/enroll", { agreer: toB64(phone.rawAgreer) }), /code, not by enrolling/);

  await assert.rejects(() => stranger.pair(door.url, "AAAAAAAA"), /wrong or expired/);

  await mac.setProfile({ avatar: "cloud/surprised/pink", wear: "glasses:square" });

  const seatId = "cadencia-do-crm";
  await mac.openSeat({ id: seatId, title: SECRET_TITLE });
  for (const line of SECRET_LINES) await mac.write(seatId, { type: "assistant", text: line });
  assert.equal(mac.held(seatId).lastSeq, 3);
  assert.equal(mac.held(seatId).events.length, 0, "a lean runner keeps no copy of what it wrote");

  const again = await mac.openSeat({ id: seatId, title: SECRET_TITLE });
  assert.equal(again.lastSeq, 3, "opening a seat the runner already runs hands back the seat, not a fresh one");

  await phone.sync();
  const phoneSeat = phone.replica.get(seatId);
  assert.equal(phoneSeat.title, SECRET_TITLE);
  assert.deepEqual(phoneSeat.events.map((one) => one.value.text), SECRET_LINES);
  assert.equal(phone.people.find((one) => one.fingerprint === mac.fingerprint)?.profile?.avatar, "cloud/surprised/pink");

  const podSeen = await podDevice.sync();
  assert.equal(podSeen.get(seatId)?.title, SECRET_TITLE, "another device of the same person is welcomed into the seat");

  const heard = [];
  const macHeard = [];
  phone.listen((note) => heard.push(note));
  mac.listen((note) => macHeard.push(note));
  await waitFor(() => heard.some((one) => one.kind === "caught-up") && macHeard.some((one) => one.kind === "caught-up"));

  await mac.write(seatId, { type: "assistant", text: "quarta linha, ao vivo" });
  await waitFor(() => phoneSeat.events.length === 4);
  assert.equal(phoneSeat.events[3].value.text, "quarta linha, ao vivo");

  await phone.intend(seatId, { type: "answer", text: SECRET_ANSWER });
  await waitFor(() => macHeard.some((one) => one.kind === "intent"));
  const intent = macHeard.find((one) => one.kind === "intent");
  assert.equal(intent.value.text, SECRET_ANSWER);
  await mac.write(seatId, { type: "intent-done", n: intent.entry.n, echo: intent.value.text });
  await waitFor(() => phoneSeat.events.length === 5);
  assert.equal(phoneSeat.events[4].value.echo, SECRET_ANSWER);

  await mac.retitle(seatId, "título novo");
  await waitFor(() => phoneSeat.title === "título novo");

  const anaCode = await mac.openCode({ person: "ana" });
  const ana = await Device.create({ name: "celular da ana" });
  await ana.pair(door.url, anaCode.code);
  await ana.sync();
  assert.equal(ana.replica.size, 0, "a teammate sees no seat of yours");

  await mac.share(seatId, ana.fingerprint);
  await ana.sync();
  const anaSeat = ana.replica.get(seatId);
  assert.equal(anaSeat.events.length, 5);
  assert.equal(anaSeat.title, "título novo");
  await assert.rejects(() => ana.intend(seatId, { type: "say", text: "posso?" }), /not lent/);

  await mac.revoke(seatId, ana.fingerprint);
  await mac.write(seatId, { type: "assistant", text: "depois da rotação" });
  await ana.sync().catch(() => {});
  await phone.sync();
  assert.equal(phoneSeat.events[5]?.value.text, "depois da rotação");
  assert.equal(ana.seats.has(seatId), false);
  assert.equal(anaSeat.events.length, 5);

  const picture = bytesOf("PNG-fake-bytes-".repeat(200));
  const blobId = await mac.putBlob(seatId, picture);
  await mac.write(seatId, { type: "shot", blob: blobId });
  await waitFor(() => phoneSeat.events.length === 7);
  assert.equal(toB64(await phone.getBlob(seatId, blobId)), toB64(picture));

  const photoId = await phone.putBlob(seatId, bytesOf("JPEG-from-the-phone"));
  await phone.intend(seatId, { type: "say", text: "olha isso", image: { id: photoId, mime: "image/jpeg" } });
  await waitFor(() => macHeard.filter((one) => one.kind === "intent").length === 2);
  assert.equal(toB64(await mac.getBlob(seatId, photoId)), toB64(bytesOf("JPEG-from-the-phone")));

  phone.clockOffset = -120000;
  const late = await phone.call("GET", "/me");
  assert.equal(late.fingerprint, phone.fingerprint);
  assert.ok(Math.abs(phone.clockOffset) < 5000, "the phone learned the hive's clock");

  const peek = await mac.call("GET", `/peek/${seatId}`);
  const stored = JSON.stringify(peek) + readdirSync(join(dataDir, "log")).map((one) => readFileSync(join(dataDir, "log", one), "utf8")).join("") + readFileSync(join(dataDir, "state.json"), "utf8");
  for (const secret of [SECRET_TITLE, ...SECRET_LINES, SECRET_ANSWER, "depois da rotação", "título novo", "olha isso"]) {
    assert.equal(stored.includes(secret), false, `the broker holds "${secret}" in the clear`);
  }

  const forged = { ...phoneSeat.events[0], seq: 99 };
  await assert.rejects(() => mac.call("POST", `/seats/${seatId}/events`, forged), /expected seq/);

  phone.stream?.stop();
  mac.stream?.stop();
  await door.close();
  broker.close();
  broker = brokerIn(dataDir, pod, macIdentity);
  door = await host(broker);
  mac.host = door.url;
  phone.host = door.url;
  const before = phoneSeat.events.length;
  await mac.write(seatId, { type: "assistant", text: "o hive voltou" });
  await phone.sync();
  assert.equal(phoneSeat.events.length, before + 1);
  assert.equal(new Set(phoneSeat.events.map((one) => one.seq)).size, phoneSeat.events.length, "no duplicates after the restart");

  await mac.closeSeat(seatId);
  await phone.sync();
  assert.ok(phone.seats.get(seatId).closedAt > 0, "the phone sees the seat closed, and keeps what it read");
  await mac.openSeat({ id: seatId, title: "o mesmo nome, outra conversa", fresh: true });
  await mac.write(seatId, { type: "assistant", text: "primeira linha da nova" });
  await phone.sync();
  assert.equal(phone.replica.get(seatId).title, "o mesmo nome, outra conversa");
  assert.equal(phone.seats.get(seatId).closedAt, 0);

  await door.close();
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a seat's log is trimmed past the ceiling and a phone far behind learns where the kept part begins", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, fetchImpl: localFetch(broker), lean: true });
  await mac.enroll("http://sync/sync");
  const phone = await Device.create({ name: "phone", fetchImpl: localFetch(broker) });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);

  await mac.openSeat({ id: "longo", title: "um chat comprido" });
  await mac.write("longo", { type: "assistant", text: "início" });
  await phone.sync();
  assert.equal(phone.replica.get("longo").events.length, 1);

  for (let at = 0; at < EVENTS_CEILING + 5; at += 1) await mac.write("longo", { type: "tool", name: "Read", target: `f${at}` });
  const view = await mac.call("GET", "/seats/longo");
  assert.equal(view.firstSeq, EVENTS_CEILING + 1 - EVENTS_FLOOR + 1, "the trim happened the moment the ceiling was crossed");
  assert.equal(view.lastSeq, EVENTS_CEILING + 6);
  const onDisk = readFileSync(join(dataDir, "log", "longo.events.ndjson"), "utf8").trim().split("\n").length;
  assert.equal(onDisk, EVENTS_FLOOR + 5);

  await phone.sync();
  const kept = phone.replica.get("longo");
  assert.equal(kept.gapBefore, view.firstSeq);
  assert.equal(kept.events.length, EVENTS_FLOOR + 5);
  assert.equal(kept.events[0].seq, view.firstSeq);
  assert.equal(kept.events.at(-1).seq, view.lastSeq);
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("revoking a phone cuts its stream and its keys, and a stale request from it is refused", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, fetchImpl: localFetch(broker), lean: true });
  await mac.enroll("http://sync/sync");
  const phone = await Device.create({ name: "phone", fetchImpl: localFetch(broker) });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  await mac.openSeat({ id: "um", title: "um" });
  await phone.sync();
  const heard = [];
  phone.listen((note) => heard.push(note));
  await waitFor(() => heard.some((one) => one.kind === "caught-up"));
  assert.ok(broker.online.includes(phone.fingerprint));

  await mac.call("POST", "/roster/revoke", { fingerprint: phone.fingerprint });
  await waitFor(() => heard.some((one) => one.kind === "revoked"));
  assert.equal(broker.online.includes(phone.fingerprint), false);
  await assert.rejects(() => phone.call("GET", "/me"), /revoked/);
  const roster = await mac.call("GET", "/roster");
  assert.ok(roster.devices.find((one) => one.fingerprint === phone.fingerprint).revokedAt > 0);
  const seat = await mac.call("GET", "/seats/um");
  assert.equal(seat.readers.includes(phone.fingerprint), false);
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a phone asks the Mac for a new chat in an envelope the broker cannot read, and hears back the chat's name", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const macStore = memoryStore();
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: macStore, fetchImpl: localFetch(broker), lean: true });
  await mac.enroll("http://sync/sync");
  const phone = await Device.create({ name: "phone", fetchImpl: localFetch(broker) });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  const secondPhone = await Device.create({ name: "outro celular", fetchImpl: localFetch(broker) });
  await secondPhone.pair("http://sync/sync", (await mac.openCode()).code);
  const ana = await Device.create({ name: "celular da ana", fetchImpl: localFetch(broker) });
  await ana.pair("http://sync/sync", (await mac.openCode({ person: "ana" })).code);
  await phone.sync();
  await ana.sync();

  const mission = { prompt: "revisa o PR 42 e me diz se pode ir", where: "cloud" };
  await assert.rejects(() => ana.askBirth(mac.fingerprint, mission), /only your own devices/);
  await assert.rejects(() => phone.askBirth(secondPhone.fingerprint, mission), /a phone does not open chats/);

  const macHeard = [];
  mac.listen((note) => macHeard.push(note));
  const phoneHeard = [];
  phone.listen((note) => phoneHeard.push(note));
  await waitFor(() => macHeard.some((one) => one.kind === "caught-up") && phoneHeard.some((one) => one.kind === "caught-up"));

  const asked = await phone.askBirth(mac.fingerprint, mission);
  assert.equal(asked.online, true);
  await waitFor(() => macHeard.some((one) => one.kind === "birth"));
  const birth = macHeard.find((one) => one.kind === "birth");
  assert.equal(birth.id, asked.id);
  assert.equal(birth.from, phone.fingerprint);
  assert.deepEqual(birth.mission, mission);

  await mac.answerBirth(birth, { id: "n7", name: "revisa-o-pr-42", where: "cloud" });
  await waitFor(() => phoneHeard.some((one) => one.kind === "birth-done"));
  const done = phoneHeard.find((one) => one.kind === "birth-done");
  assert.equal(done.id, asked.id);
  assert.equal(done.name, "revisa-o-pr-42");
  assert.equal(phone.births.get(asked.id).answer.name, "revisa-o-pr-42");

  const stored = readFileSync(join(dataDir, "state.json"), "utf8");
  assert.equal(stored.includes("revisa o PR 42"), false, "the broker holds the mission in the clear");
  assert.equal(stored.includes("revisa-o-pr-42"), false, "the broker holds the chat's name in the clear");

  await assert.rejects(() => secondPhone.call("POST", `/births/${asked.id}/done`, { box: { epk: "a", nonce: "b", ct: "c" } }), /only the device that was asked/);

  phone.stream?.stop();
  mac.stream?.stop();

  const late = await phone.askBirth(mac.fingerprint, { prompt: "outra missão", where: "local" });
  assert.equal(late.online, false, "the phone learns the computer is not listening right now");
  const macAgain = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: macStore, fetchImpl: localFetch(broker), lean: true });
  await macAgain.enroll("http://sync/sync");
  const againHeard = [];
  macAgain.listen((note) => againHeard.push(note));
  await waitFor(() => againHeard.some((one) => one.kind === "birth"));
  assert.equal(againHeard.find((one) => one.kind === "birth").mission.prompt, "outra missão", "a Mac that connects later still gets the ask");
  await macAgain.answerBirth(againHeard.find((one) => one.kind === "birth"), { error: "no seat left" });
  await phone.sync();
  assert.equal(phone.births.get(late.id).answer.error, "no seat left", "a phone without its stream still picks the answer up on sync");

  macAgain.stream?.stop();
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a seat handed to a phone while its stream is up arrives with its history, not only with what comes after", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, fetchImpl: localFetch(broker), lean: true });
  await mac.enroll("http://sync/sync");
  await mac.openSeat({ id: "antigo", title: "um chat de antes" });
  for (const text of ["um", "dois", "três"]) await mac.write("antigo", { type: "assistant", text });
  const macHeard = [];
  mac.listen((note) => macHeard.push(note));
  await waitFor(() => macHeard.some((one) => one.kind === "caught-up"));

  const code = await mac.openCode();
  const phone = await Device.create({ name: "phone", fetchImpl: localFetch(broker) });
  await phone.pair("http://sync/sync", code.code);
  phone.listen(() => {});
  await waitFor(() => phone.replica.get("antigo")?.events.length === 3);
  assert.deepEqual(phone.replica.get("antigo").events.map((one) => one.value.text), ["um", "dois", "três"]);
  assert.equal(phone.replica.get("antigo").title, "um chat de antes");

  phone.stream?.stop();
  mac.stream?.stop();
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a phone's identity survives a store that keeps only JSON, the way an iOS home-screen app keeps it", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, fetchImpl: localFetch(broker), lean: true });
  await mac.enroll("http://sync/sync");
  await mac.openSeat({ id: "um", title: "um chat" });
  await mac.write("um", { type: "assistant", text: "linha guardada" });

  const disk = new Map();
  const jsonStore = { get: async (key) => (disk.has(key) ? JSON.parse(disk.get(key)) : undefined), set: async (key, value) => { disk.set(key, JSON.stringify(value)); } };
  const phone = await Device.create({ name: "iphone", store: jsonStore, fetchImpl: localFetch(broker) });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  await mac.sync();
  await phone.sync();
  assert.equal(phone.replica.get("um").events[0].value.text, "linha guardada");
  assert.doesNotMatch(disk.get("identity"), /\{\}/, "a key was written as an empty object, so it was a CryptoKey the store cannot keep");

  const back = await Device.restore({ name: "iphone", store: jsonStore, fetchImpl: localFetch(broker) });
  assert.ok(back, "the phone came back from JSON alone");
  assert.equal(back.fingerprint, phone.fingerprint);
  assert.equal(back.paired, true);
  const me = await back.call("GET", "/me");
  assert.equal(me.fingerprint, phone.fingerprint, "the restored key still signs requests the hive accepts");
  await mac.write("um", { type: "assistant", text: "depois da volta" });
  await back.sync();
  assert.equal(back.replica.get("um").events.at(-1).value.text, "depois da volta", "the restored phone still opens the seat with the keys it kept");

  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a stream that goes quiet is hung up and dialed again, and a wake dials at once", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const inner = localFetch(broker);
  let dials = 0;
  let quiet = true;
  const fetchImpl = async (url, init) => {
    const response = await inner(url, init);
    if (!String(url).includes("/stream")) return response;
    dials += 1;
    if (!quiet) return response;
    const reader = response.body.getReader();
    const muted = new ReadableStream({
      async start(controller) {
        const { value } = await reader.read();
        controller.enqueue(value);
        init.signal?.addEventListener("abort", () => { reader.cancel().catch(() => {}); try { controller.error(new Error("aborted")); } catch {} });
      }
    });
    return new Response(muted, { status: response.status, headers: response.headers });
  };
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, fetchImpl, lean: true, stallMs: 150 });
  await mac.enroll("http://sync/sync");
  const heard = [];
  mac.listen((note) => heard.push(note));
  await waitFor(() => dials >= 2, 3000);
  assert.ok(heard.some((one) => one.kind === "state" && one.up === false), "the quiet stream was hung up");

  quiet = false;
  const before = dials;
  mac.wake();
  await waitFor(() => dials > before, 3000);
  await waitFor(() => heard.some((one) => one.kind === "caught-up"), 3000);
  mac.stream?.stop();
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a phone asks the Mac for a page and the answer, far bigger than an envelope, comes back sealed", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const mac = await Device.fromIdentity({ name: "mac", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, fetchImpl: localFetch(broker), lean: true });
  await mac.enroll("http://sync/sync");
  const phone = await Device.create({ name: "phone", fetchImpl: localFetch(broker) });
  await phone.pair("http://sync/sync", (await mac.openCode()).code);
  const ana = await Device.create({ name: "celular da ana", fetchImpl: localFetch(broker) });
  await ana.pair("http://sync/sync", (await mac.openCode({ person: "ana" })).code);
  await phone.sync();
  await ana.sync();

  await assert.rejects(() => ana.ask(mac.fingerprint, "shelf", { slug: "x" }), /only your own devices/);
  await assert.rejects(() => phone.ask(mac.fingerprint, "coffee", {}), /not something a device can be asked/);
  await assert.rejects(() => phone.ask(mac.fingerprint, "people", {}, { timeoutMs: 200 }), /not listening/);

  const html = `<h1>Celular do Hive</h1>${"<p>uma linha da página publicada na estante</p>".repeat(40000)}`;
  const macHeard = [];
  mac.listen((note) => {
    macHeard.push(note);
    if (note.kind === "ask") mac.answerAsk({ id: note.id, from: note.from }, note.ask === "shelf" ? { html, slug: note.payload.slug } : { error: "no such thing" });
  });
  const phoneHeard = [];
  phone.listen((note) => phoneHeard.push(note));
  await waitFor(() => macHeard.some((one) => one.kind === "caught-up") && phoneHeard.some((one) => one.kind === "caught-up"));

  const page = await phone.ask(mac.fingerprint, "shelf", { slug: "celular-do-hive", tab: "telas", v: 2 });
  assert.equal(page.slug, "celular-do-hive");
  assert.equal(page.html.length, html.length, "the whole page came through");
  assert.ok(html.length > 1024 * 1024, "the page is bigger than a megabyte");
  await assert.rejects(() => phone.ask(mac.fingerprint, "files", { q: "x" }), /no such thing/);

  const kept = readdirSync(join(dataDir, "asks")).map((one) => readFileSync(join(dataDir, "asks", one), "utf8")).join("");
  assert.equal(kept.includes("uma linha da página"), false, "the broker holds the page in the clear");
  assert.equal(readFileSync(join(dataDir, "state.json"), "utf8").includes("celular-do-hive"), false, "the ask leaked into the state");
  assert.equal(phone.asks.size, 0, "answered asks are forgotten by the phone");

  phone.stream?.stop();
  mac.stream?.stop();
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test("a phone with hundreds of chats keeps its stream: what it already has travels in the body, not in the address", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "hive-sync-"));
  const pod = newIdentity("pod");
  const macIdentity = newIdentity("mac");
  const broker = brokerIn(dataDir, pod, macIdentity);
  const door = await host(broker);

  const mac = await Device.fromIdentity({ name: "mac do jonas", secret: macIdentity.secret, publicSsh: macIdentity.publicSsh, store: memoryStore(), lean: true });
  await mac.enroll(door.url, { kind: "mac" });
  const code = await mac.openCode();
  const phone = await Device.create({ name: "iphone do jonas" });
  await phone.pair(door.url, code.code);

  const seatId = "a-conversa-de-hoje";
  await mac.openSeat({ id: seatId, title: "hoje" });
  await mac.write(seatId, { type: "assistant", text: "primeira linha" });
  await phone.sync();
  for (let n = 0; n < 400; n += 1) phone.cursors[`uma-conversa-de-semanas-atras-numero-${n}`] = { events: 900, intents: 90 };

  const asked = [];
  const plain = phone.fetchImpl;
  phone.fetchImpl = (url, init) => { asked.push(String(url)); return plain(url, init); };

  const heard = [];
  phone.listen((note) => heard.push(note));
  await waitFor(() => heard.some((one) => one.kind === "caught-up"));
  const dialed = asked.find((one) => one.includes("/stream")) || "";
  assert.ok(dialed.length < 2000, `the stream was dialed at ${dialed.length} characters, and a proxy cuts the address long before that`);

  await mac.write(seatId, { type: "assistant", text: "ao vivo" });
  await waitFor(() => phone.replica.get(seatId).events.length === 2);

  const framesFor = async (cursors) => {
    const body = JSON.stringify(cursors);
    const headers = await phone.signed("POST", "/stream", body);
    const response = await fetch(`${door.url}/stream`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("event: caught-up")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    return text;
  };

  const told = await framesFor({ [seatId]: { events: 2, intents: 0 } });
  assert.equal(told.includes("event: event"), false, "the hive replayed what the phone said it already had");
  const all = await framesFor({});
  assert.equal(all.split("event: event").length - 1, 2, "a phone that knows nothing is given the whole chat");

  phone.stream?.stop();
  mac.stream?.stop();
  await door.close();
  broker.close();
  rmSync(dataDir, { recursive: true, force: true });
});
