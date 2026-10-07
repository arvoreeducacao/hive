import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fingerprintOf, fromB64, publicSigner, random, toB64, verifyEntry, verifyRequest } from "./crypto.mjs";

export const MIN_CLIENT = 1;
export const SKEW_MS = 60000;
export const NONCES_KEPT = 8192;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_TTL_MS = 300000;
export const CODE_TTL_CEILING_MS = 86400000;
export const CODE_TRIES = 5;
export const HEARTBEAT_MS = 15000;
export const EVENTS_CEILING = 4000;
export const EVENTS_FLOOR = 2000;
export const INTENTS_CEILING = 800;
export const INTENTS_FLOOR = 400;
export const NAME_CEILING = 40;
export const SEAT_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
export const BLOB_ID = /^[a-f0-9]{16,64}$/;
export const BIRTH_ID = /^[a-f0-9]{16,64}$/;
export const BIRTH_TTL_MS = 30 * 60 * 1000;
export const BIRTHS_KEPT = 200;
export const BOX_CEILING = 64 * 1024;
export const ASK_KINDS = new Set(["shelf", "files", "people", "providers"]);
export const ASK_TTL_MS = 10 * 60 * 1000;
export const ASKS_KEPT = 200;
export const ANSWER_CEILING = 8 << 20;
export const OPEN_ROUTES = new Set(["/hello", "/pair"]);
export const KINDS = new Set(["mac", "pod", "phone"]);
export const WAKES = new Set(["done", "needs"]);
export const DONE_FLOOR_MS = 5 * 60 * 1000;
export const NOTICE_FIELD_CEILING = 1200;
export const ENDPOINT_CEILING = 800;

export function mintCode(entropy = random(8)) {
  let code = "";
  for (const byte of entropy) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export const typedCode = (code) => String(code || "").replace(/[\s-]+/g, "").toUpperCase();

const cleanName = (name, fallback = "device") => String(name || "").replace(/\s+/g, " ").trim().slice(0, NAME_CEILING) || fallback;

function readLog(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

const lowerHeaders = (headers) => {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) out[String(key).toLowerCase()] = Array.isArray(value) ? value[0] : value;
  return out;
};

export function createSyncBroker({ dataDir, audience, owner = "owner", trusted = () => null, notices = null, doneFloorMs = DONE_FLOOR_MS, now = () => Date.now(), log = () => {} } = {}) {
  if (!audience) throw new Error("the sync broker needs the fingerprint requests are addressed to");
  mkdirSync(join(dataDir, "log"), { recursive: true });
  mkdirSync(join(dataDir, "blobs"), { recursive: true });
  mkdirSync(join(dataDir, "asks"), { recursive: true });
  const stateFile = join(dataDir, "state.json");
  let state = { devices: [], seats: {}, codes: [], births: [], notices: {} };
  if (existsSync(stateFile)) {
    try { state = { devices: [], seats: {}, codes: [], births: [], notices: {}, ...JSON.parse(readFileSync(stateFile, "utf8")) }; } catch {}
  }
  const logs = new Map();
  const seen = new Map();
  const streams = new Map();
  const signers = new Map();
  const doneFloor = new Map();

  const logFile = (id, lane) => join(dataDir, "log", `${id}.${lane}.ndjson`);
  const blobDir = (id) => join(dataDir, "blobs", id);

  const loadLogs = (id) => logs.set(id, { events: readLog(logFile(id, "events")), intents: readLog(logFile(id, "intents")) });
  for (const id of Object.keys(state.seats)) loadLogs(id);

  const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));

  const onRoster = (fingerprint) => state.devices.find((one) => one.fingerprint === fingerprint) || null;
  const liveDevices = () => state.devices.filter((one) => !one.revokedAt);
  const isAdmin = (device) => !!device?.admin;
  const online = (fingerprint) => !!streams.get(fingerprint)?.size;

  function deviceOf(fingerprint) {
    const held = onRoster(fingerprint);
    if (held) return held;
    const vouched = trusted(fingerprint);
    if (!vouched?.signer) return null;
    return {
      fingerprint,
      name: cleanName(vouched.name, fingerprint.slice(7, 19)),
      person: owner,
      kind: KINDS.has(vouched.kind) ? vouched.kind : "mac",
      admin: true,
      signer: toB64(vouched.signer),
      agreer: "",
      vouched: true,
      pairedAt: 0,
      lastSeen: 0,
      revokedAt: 0
    };
  }

  async function signerOf(device) {
    const key = `${device.fingerprint}|${device.signer}`;
    if (!signers.has(key)) signers.set(key, await publicSigner(fromB64(device.signer)));
    return signers.get(key);
  }

  function openCode({ person = owner, ttlMs = CODE_TTL_MS } = {}) {
    const code = mintCode();
    const lasts = Math.min(CODE_TTL_CEILING_MS, Math.max(60000, Number(ttlMs) || CODE_TTL_MS));
    state.codes = state.codes.filter((one) => one.expiresAt > now());
    state.codes.push({ code, person, expiresAt: now() + lasts, tries: 0 });
    save();
    return { code, expiresAt: now() + lasts };
  }

  function push(fingerprint, kind, body) {
    const held = streams.get(fingerprint);
    if (!held) return 0;
    const frame = `event: ${kind}\ndata: ${JSON.stringify(body)}\n\n`;
    let reached = 0;
    for (const sink of held) {
      try { sink.write(frame); reached += 1; } catch {}
    }
    return reached;
  }

  const pushReaders = (seat, kind, body) => { for (const fp of seat.readers) push(fp, kind, body); };
  const pushMine = (seat, kind, body) => {
    for (const fp of seat.readers) if ((onRoster(fp) || deviceOf(fp))?.person === seat.person) push(fp, kind, body);
  };
  const broadcast = (kind, body) => { for (const fp of streams.keys()) push(fp, kind, body); };

  const personView = (one) => ({
    fingerprint: one.fingerprint,
    person: one.person,
    name: one.name,
    kind: one.kind,
    agreer: one.agreer || "",
    online: online(one.fingerprint),
    profile: one.profile || null
  });

  const seatView = (seat, forDevice) => {
    const held = logs.get(seat.id);
    return {
      id: seat.id,
      person: seat.person,
      runner: seat.runner,
      runnerKind: onRoster(seat.runner)?.kind || deviceOf(seat.runner)?.kind || "mac",
      title: seat.title,
      draft: forDevice.person === seat.person ? seat.draft || null : null,
      keyId: seat.keyId,
      wraps: Object.fromEntries(Object.entries(seat.keys).map(([keyId, key]) => [keyId, key.wraps[forDevice.fingerprint]]).filter(([, box]) => box)),
      readers: [...seat.readers],
      writers: [...seat.writers],
      firstSeq: seat.firstSeq || 1,
      bornAt: seat.bornAt || 0,
      lastSeq: held.events.at(-1)?.seq || seat.lastSeq || 0,
      lastIntent: held.intents.at(-1)?.n || seat.lastIntent || 0,
      online: online(seat.runner),
      closedAt: seat.closedAt || 0,
      at: seat.at
    };
  };

  const validBox = (box) => !!box && typeof box === "object" && [box.epk, box.nonce, box.ct].every((one) => typeof one === "string" && one) && box.ct.length <= BOX_CEILING;
  const boxOf = (box) => ({ epk: box.epk, nonce: box.nonce, ct: box.ct });
  const birthView = (one) => ({ id: one.id, from: one.from, to: one.to, box: one.box, at: one.at, done: one.done || null });

  const askFile = (id, part = "") => join(dataDir, "asks", `${id}${part}.json`);
  const asks = new Map();
  for (const name of readdirSync(join(dataDir, "asks"))) {
    if (!name.endsWith(".json") || name.endsWith(".answer.json")) continue;
    try { const one = JSON.parse(readFileSync(join(dataDir, "asks", name), "utf8")); if (one?.id) asks.set(one.id, one); } catch {}
  }
  const wipeAsk = (id) => { for (const part of ["", ".answer"]) { try { rmSync(askFile(id, part), { force: true }); } catch {} } };
  const askView = (one, { box = true } = {}) => ({ id: one.id, from: one.from, to: one.to, kind: one.kind, at: one.at, done: one.done || 0, size: one.size || 0, ...(box ? { box: one.box } : {}) });

  function freshAsks() {
    const floor = now() - ASK_TTL_MS;
    for (const [id, one] of asks) if (one.at <= floor) { asks.delete(id); wipeAsk(id); }
    while (asks.size > ASKS_KEPT) { const [id] = asks.keys(); asks.delete(id); wipeAsk(id); }
    return asks;
  }

  function freshBirths() {
    const floor = now() - BIRTH_TTL_MS;
    const kept = state.births.filter((one) => one.at > floor).slice(-BIRTHS_KEPT);
    if (kept.length !== state.births.length) state.births = kept;
    return state.births;
  }

  const mayRead = (seat, device) => seat.readers.includes(device.fingerprint);
  const mayWrite = (seat, device) => seat.writers.includes(device.fingerprint) || seat.person === device.person;
  const mayRun = (seat, device) => seat.runner === device.fingerprint;
  const mayManage = (seat, device) => seat.person === device.person;

  const asJson = (payload, status = 200) => ({ status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-hive-min-client": String(MIN_CLIENT) }, body: JSON.stringify(payload) });
  const refuse = (error, status = 400, extra = {}) => asJson({ error, ...extra }, status);

  const readable = (device) => Object.values(state.seats).filter((seat) => mayRead(seat, device));

  function checkSignature({ method, path, headers, body }) {
    const fingerprint = String(headers["x-hive-key"] || "");
    const at = Number(headers["x-hive-at"]);
    const nonce = String(headers["x-hive-nonce"] || "");
    const signature = String(headers["x-hive-signature"] || "");
    const client = Number(headers["x-hive-client"] || 0);
    if (!fingerprint || !signature) return { error: "that request is not signed", status: 401 };
    if (client < MIN_CLIENT) return { error: `this hive needs phone client ${MIN_CLIENT} or newer`, status: 426 };
    if (!Number.isFinite(at)) return { error: "that request has no readable time on it", status: 401 };
    if (Math.abs(now() - at) > SKEW_MS) return { error: "off the clock", status: 401, extra: { serverAt: now(), skewMs: SKEW_MS } };
    if (!nonce) return { error: "that request has no nonce", status: 401 };
    if (seen.has(nonce)) return { error: "that request was already used once", status: 401 };
    const device = deviceOf(fingerprint);
    if (!device) return { error: "that key is not on the roster", status: 401 };
    if (device.revokedAt) return { error: "that key was revoked", status: 403 };
    return { device, fields: { method, path, body, at, nonce, audience }, signature };
  }

  async function guard(request) {
    const verdict = checkSignature(request);
    if (verdict.error) return verdict;
    const ok = await verifyRequest(await signerOf(verdict.device), verdict.signature, verdict.fields);
    if (!ok) return { error: "that signature does not match the request", status: 401 };
    seen.set(verdict.fields.nonce, now());
    if (seen.size > NONCES_KEPT) seen.delete(seen.keys().next().value);
    if (!verdict.device.vouched) verdict.device.lastSeen = now();
    return verdict;
  }

  async function pair(asked) {
    const typed = typedCode(asked.code);
    const found = state.codes.find((one) => one.code === typed && one.expiresAt > now());
    if (!found) {
      for (const one of state.codes) one.tries += 1;
      state.codes = state.codes.filter((one) => one.tries < CODE_TRIES && one.expiresAt > now());
      save();
      return refuse("that code is wrong or expired", 401);
    }
    const signerRaw = fromB64(String(asked.signer || ""));
    const agreerRaw = fromB64(String(asked.agreer || ""));
    if (signerRaw.length !== 32 || agreerRaw.length !== 32) return refuse("a device brings two 32-byte public keys", 400);
    const fingerprint = await fingerprintOf(signerRaw);
    if (onRoster(fingerprint)) return refuse("that key is already on the roster", 409);
    const device = {
      fingerprint,
      name: cleanName(asked.name, "phone"),
      person: found.person,
      kind: "phone",
      admin: false,
      signer: toB64(signerRaw),
      agreer: toB64(agreerRaw),
      client: Number(asked.client || 0),
      pairedAt: now(),
      lastSeen: now(),
      revokedAt: 0
    };
    state.devices.push(device);
    state.codes = state.codes.filter((one) => one !== found);
    save();
    log(`sync: paired ${device.name} of ${device.person} (${fingerprint})`);
    broadcast("roster", { fingerprint, person: device.person, name: device.name, kind: device.kind });
    return asJson({ paired: true, fingerprint: audience, device: fingerprint, person: device.person, kind: device.kind });
  }

  function enroll(device, asked) {
    const agreerRaw = fromB64(String(asked.agreer || ""));
    if (agreerRaw.length !== 32) return refuse("a device brings a 32-byte agreement key", 400);
    const held = onRoster(device.fingerprint);
    const record = held || {
      fingerprint: device.fingerprint,
      person: device.person,
      admin: !!device.admin,
      signer: device.signer,
      pairedAt: now(),
      revokedAt: 0
    };
    record.name = cleanName(asked.name, device.name);
    record.kind = KINDS.has(asked.kind) ? asked.kind : device.kind;
    record.agreer = toB64(agreerRaw);
    record.client = Number(asked.client || 0);
    record.lastSeen = now();
    if (!held) state.devices.push(record);
    save();
    if (!held) {
      log(`sync: ${record.kind} ${record.name} enrolled as a device of ${record.person}`);
      broadcast("roster", { fingerprint: record.fingerprint, person: record.person, name: record.name, kind: record.kind });
    }
    return asJson({ enrolled: true, fingerprint: audience, device: record.fingerprint, person: record.person, kind: record.kind });
  }

  function compact(seat, lane, ceiling, floor) {
    const held = logs.get(seat.id)[lane];
    if (held.length <= ceiling) return;
    const kept = held.slice(-floor);
    logs.get(seat.id)[lane] = kept;
    writeFileSync(logFile(seat.id, lane), kept.map((one) => `${JSON.stringify(one)}\n`).join(""));
    if (lane === "events") seat.firstSeq = kept[0].seq;
    else seat.firstIntent = kept[0].n;
  }

  function appendEntry(seat, lane, entry) {
    logs.get(seat.id)[lane].push(entry);
    appendFileSync(logFile(seat.id, lane), `${JSON.stringify(entry)}\n`);
    seat.at = now();
    if (lane === "events") { seat.lastSeq = entry.seq; compact(seat, lane, EVENTS_CEILING, EVENTS_FLOOR); }
    else { seat.lastIntent = entry.n; compact(seat, lane, INTENTS_CEILING, INTENTS_FLOOR); }
  }

  function wipeSeat(id) {
    for (const lane of ["events", "intents"]) { try { rmSync(logFile(id, lane), { force: true }); } catch {} }
    try { rmSync(blobDir(id), { recursive: true, force: true }); } catch {}
    logs.set(id, { events: [], intents: [] });
  }

  function wantsWake(kept, wake) {
    if (wake === "needs") return kept.wants?.needs !== false;
    return kept.wants?.done === true;
  }

  function noticeIn(asked) {
    const held = asked?.notice;
    if (!held || typeof held !== "object") return null;
    const box = { keyId: String(held.keyId || ""), nonce: String(held.nonce || ""), ct: String(held.ct || "") };
    if (!box.keyId || !box.nonce || !box.ct) return null;
    if (box.ct.length > NOTICE_FIELD_CEILING) return null;
    return box;
  }

  function tellPhones(seat, wake, entry, notice) {
    if (!notices || !WAKES.has(wake)) return;
    for (const fingerprint of seat.readers) {
      const kept = state.notices[fingerprint];
      const device = onRoster(fingerprint);
      if (!kept || !device || device.revokedAt || device.person !== seat.person) continue;
      if (online(fingerprint) || !wantsWake(kept, wake)) continue;
      let more = 0;
      if (wake === "done") {
        const last = doneFloor.get(fingerprint) || { at: 0, missed: new Set() };
        if (now() - last.at < doneFloorMs) {
          last.missed.add(seat.id);
          doneFloor.set(fingerprint, last);
          continue;
        }
        last.missed.delete(seat.id);
        more = last.missed.size;
        doneFloor.set(fingerprint, { at: now(), missed: new Set() });
      }
      const payload = { seat: seat.id, wake, at: now(), seq: entry.seq };
      if (notice) payload.n = notice;
      if (more) payload.more = more;
      notices.send(kept, payload).then((said) => {
        if (!said.gone) return;
        delete state.notices[fingerprint];
        doneFloor.delete(fingerprint);
        save();
        log(`sync: ${device.name} stopped taking notices, its subscription was dropped`);
      }).catch(() => {});
    }
  }

  function tellSeat(seat) {
    for (const fp of seat.readers) push(fp, "seat", seatView(seat, deviceOf(fp) || { fingerprint: fp }));
  }

  async function answer({ method, path, query = "", headers = {}, body = "" }) {
    const heads = lowerHeaders(headers);
    if (path === "/hello" && method === "GET") return asJson({ audience, person: owner, minClient: MIN_CLIENT, at: now() });
    if (path === "/pair" && method === "POST") {
      let asked = {};
      try { asked = body ? JSON.parse(body) : {}; } catch { return refuse("unreadable body", 400); }
      return pair(asked);
    }
    if (OPEN_ROUTES.has(path)) return refuse("no such route", 404);

    const verdict = await guard({ method, path: path + (query ? `?${query}` : ""), headers: heads, body });
    if (verdict.error) {
      log(`sync: refused ${heads["x-hive-key"] || "an unsigned request"} on ${method} ${path}: ${verdict.error}`);
      return refuse(verdict.error, verdict.status, verdict.extra || {});
    }
    const device = verdict.device;
    let asked = {};
    if (body) {
      try { asked = JSON.parse(body); } catch { return refuse("unreadable body", 400); }
    }

    if (path === "/enroll" && method === "POST") {
      if (device.kind === "phone") return refuse("a phone comes in with a code, not by enrolling", 403);
      return enroll(device, asked);
    }

    if (path === "/me" && method === "GET") return asJson({ ...device, signer: undefined, online: online(device.fingerprint), admin: !!device.admin });

    if (path === "/roster" && method === "GET") {
      const mine = isAdmin(device) ? state.devices : state.devices.filter((one) => one.person === device.person);
      return asJson({ devices: mine.map((one) => ({ ...personView(one), admin: !!one.admin, client: one.client || 0, pairedAt: one.pairedAt, lastSeen: one.lastSeen, revokedAt: one.revokedAt || 0 })) });
    }

    if (path === "/roster/revoke" && method === "POST") {
      const target = onRoster(String(asked.fingerprint || ""));
      if (!target || target.revokedAt) return refuse("no live device with that key", 404);
      if (target.person !== device.person && !isAdmin(device)) return refuse("only that person, or an admin, revokes it", 403);
      target.revokedAt = now();
      for (const seat of Object.values(state.seats)) {
        seat.readers = seat.readers.filter((fp) => fp !== target.fingerprint);
        seat.writers = seat.writers.filter((fp) => fp !== target.fingerprint);
      }
      state.births = state.births.filter((one) => one.from !== target.fingerprint && one.to !== target.fingerprint);
      for (const [id, one] of asks) if (one.from === target.fingerprint || one.to === target.fingerprint) { asks.delete(id); wipeAsk(id); }
      save();
      for (const sink of streams.get(target.fingerprint) || []) { try { sink.write(`event: revoked\ndata: {}\n\n`); sink.end(); } catch {} }
      streams.delete(target.fingerprint);
      log(`sync: revoked ${target.name} (${target.fingerprint})`);
      broadcast("roster", { fingerprint: target.fingerprint, revoked: true });
      return asJson({ revoked: true });
    }

    if (path === "/pair/open" && method === "POST") {
      const person = String(asked.person || device.person);
      if (person !== device.person && !isAdmin(device)) return refuse("only an admin invites another person", 403);
      return asJson(openCode({ person, ttlMs: asked.ttlMs }));
    }

    if (path === "/profile" && method === "POST") {
      const held = onRoster(device.fingerprint);
      if (!held) return refuse("enroll first", 409);
      held.profile = { avatar: String(asked.avatar || "").slice(0, 80), wear: String(asked.wear || "").slice(0, 160), language: String(asked.language || "").slice(0, 12) };
      save();
      broadcast("roster", { fingerprint: device.fingerprint, person: device.person, name: device.name, kind: device.kind, profile: held.profile });
      return asJson({ kept: true });
    }

    if (path === "/notices/key" && method === "GET") {
      if (!notices) return refuse("this hive does not send notices", 404);
      return asJson({ key: await notices.publicKey() });
    }

    if (path === "/notices" && method === "POST") {
      if (!notices) return refuse("this hive does not send notices", 404);
      if (!onRoster(device.fingerprint)) return refuse("enroll first", 409);
      const endpoint = String(asked.endpoint || "");
      if (!/^https:\/\//.test(endpoint) || endpoint.length > ENDPOINT_CEILING) return refuse("a notice goes to an https endpoint", 400);
      if (!asked.p256dh || !asked.auth) return refuse("a subscription brings its two keys", 400);
      state.notices[device.fingerprint] = {
        endpoint,
        p256dh: String(asked.p256dh),
        auth: String(asked.auth),
        wants: { needs: asked.wants?.needs !== false, done: asked.wants?.done === true },
        at: now()
      };
      save();
      return asJson({ kept: true, wants: state.notices[device.fingerprint].wants });
    }

    if (path === "/notices" && method === "DELETE") {
      delete state.notices[device.fingerprint];
      save();
      return asJson({ kept: false });
    }

    if (path === "/births" && method === "GET") {
      return asJson({ births: freshBirths().filter((one) => one.from === device.fingerprint || one.to === device.fingerprint).map(birthView) });
    }

    if (path === "/births" && method === "POST") {
      const id = String(asked.id || "");
      if (!BIRTH_ID.test(id)) return refuse("a birth id is 16 to 64 hex characters", 400);
      const target = onRoster(String(asked.to || ""));
      if (!target || target.revokedAt || !target.agreer) return refuse("no live device with that key", 404);
      if (target.person !== device.person && !isAdmin(device)) return refuse("only your own devices open a chat for you", 403);
      if (target.kind === "phone") return refuse("a phone does not open chats", 400);
      if (!validBox(asked.box)) return refuse("a birth carries one sealed box", 400);
      const had = freshBirths().find((one) => one.id === id);
      if (had) return had.from === device.fingerprint ? asJson({ ...birthView(had), online: online(had.to) }) : refuse("that birth id is taken", 409);
      const birth = { id, from: device.fingerprint, to: target.fingerprint, box: boxOf(asked.box), at: now(), done: null };
      state.births.push(birth);
      save();
      push(target.fingerprint, "birth", birthView(birth));
      return asJson({ ...birthView(birth), online: online(target.fingerprint) });
    }

    const birthPath = path.match(/^\/births\/([a-f0-9]+)\/done$/);
    if (birthPath && method === "POST") {
      const birth = freshBirths().find((one) => one.id === birthPath[1]);
      if (!birth) return refuse("no such birth", 404);
      if (birth.to !== device.fingerprint) return refuse("only the device that was asked answers", 403);
      if (!validBox(asked.box)) return refuse("an answer carries one sealed box", 400);
      birth.done = { box: boxOf(asked.box), at: now() };
      save();
      push(birth.from, "birth-done", birthView(birth));
      return asJson(birthView(birth));
    }

    if (path === "/asks" && method === "GET") {
      const mine = [...freshAsks().values()].filter((one) => one.from === device.fingerprint || one.to === device.fingerprint);
      return asJson({ asks: mine.map((one) => askView(one, { box: one.to === device.fingerprint })) });
    }

    if (path === "/asks" && method === "POST") {
      const id = String(asked.id || "");
      if (!BIRTH_ID.test(id)) return refuse("an ask id is 16 to 64 hex characters", 400);
      const kind = String(asked.kind || "");
      if (!ASK_KINDS.has(kind)) return refuse("that is not something a device can be asked", 400);
      const target = onRoster(String(asked.to || ""));
      if (!target || target.revokedAt || !target.agreer) return refuse("no live device with that key", 404);
      if (target.person !== device.person && !isAdmin(device)) return refuse("only your own devices answer you", 403);
      if (target.kind === "phone") return refuse("a phone does not answer asks", 400);
      if (!validBox(asked.box)) return refuse("an ask carries one sealed box", 400);
      const had = freshAsks().get(id);
      if (had) return had.from === device.fingerprint ? asJson({ ...askView(had, { box: false }), online: online(had.to) }) : refuse("that ask id is taken", 409);
      const ask = { id, from: device.fingerprint, to: target.fingerprint, kind, box: boxOf(asked.box), at: now(), done: 0, size: 0 };
      asks.set(id, ask);
      writeFileSync(askFile(id), JSON.stringify(ask));
      push(target.fingerprint, "ask", askView(ask));
      return asJson({ ...askView(ask, { box: false }), online: online(target.fingerprint) });
    }

    const askPath = path.match(/^\/asks\/([a-f0-9]+)\/answer$/);
    if (askPath && method === "POST") {
      const ask = freshAsks().get(askPath[1]);
      if (!ask) return refuse("no such ask", 404);
      if (ask.to !== device.fingerprint) return refuse("only the device that was asked answers", 403);
      const box = asked.box;
      if (!box || typeof box !== "object" || [box.epk, box.nonce, box.ct].some((one) => typeof one !== "string" || !one)) return refuse("an answer carries one sealed box", 400);
      if (box.ct.length > ANSWER_CEILING) return refuse("that answer is bigger than the hive carries", 413);
      writeFileSync(askFile(ask.id, ".answer"), JSON.stringify(boxOf(box)));
      ask.done = now();
      ask.size = box.ct.length;
      writeFileSync(askFile(ask.id), JSON.stringify(ask));
      push(ask.from, "ask-done", askView(ask, { box: false }));
      return asJson(askView(ask, { box: false }));
    }

    if (askPath && method === "GET") {
      const ask = freshAsks().get(askPath[1]);
      if (!ask) return refuse("no such ask", 404);
      if (ask.from !== device.fingerprint) return refuse("only the device that asked reads the answer", 403);
      if (!ask.done || !existsSync(askFile(ask.id, ".answer"))) return refuse("not answered yet", 404);
      return asJson({ id: ask.id, kind: ask.kind, box: JSON.parse(readFileSync(askFile(ask.id, ".answer"), "utf8")) });
    }

    if (path === "/seats" && method === "GET") {
      return asJson({ seats: readable(device).map((seat) => seatView(seat, device)), people: liveDevices().filter((one) => one.agreer).map(personView) });
    }

    if (path === "/seats" && method === "POST") {
      const id = String(asked.id || "");
      if (!SEAT_ID.test(id)) return refuse("that is not a name a seat can have", 400);
      const wraps = asked.wraps && typeof asked.wraps === "object" ? asked.wraps : {};
      if (!wraps[device.fingerprint]) return refuse("the runner wraps the key to itself at least", 400);
      const keyId = String(asked.keyId || "");
      if (!keyId) return refuse("a seat needs a key id", 400);
      const had = state.seats[id];
      if (had && !had.closedAt && !asked.fresh) {
        if (had.runner !== device.fingerprint) return refuse("that seat is run by another device", 409);
        return asJson(seatView(had, device));
      }
      if (had && had.person !== device.person) return refuse("that seat belongs to another person", 409);
      if (had) wipeSeat(id);
      const seat = {
        id,
        person: device.person,
        runner: device.fingerprint,
        title: asked.title || null,
        keyId,
        keys: { [keyId]: { wraps, at: now() } },
        readers: Object.keys(wraps),
        writers: Object.keys(wraps),
        firstSeq: 1,
        lastSeq: 0,
        lastIntent: 0,
        closedAt: 0,
        bornAt: now(),
        at: now()
      };
      state.seats[id] = seat;
      if (!logs.has(id)) logs.set(id, { events: [], intents: [] });
      save();
      tellSeat(seat);
      return asJson(seatView(seat, device));
    }

    const seatPath = path.match(/^\/seats\/([^/]+)(\/[a-z]+)?(?:\/([A-Za-z0-9_-]+))?$/);
    if (seatPath) {
      const seat = state.seats[decodeURIComponent(seatPath[1])];
      if (!seat) return refuse("no such seat", 404);
      const leaf = seatPath[2] || "";
      const held = logs.get(seat.id);

      if (!mayRead(seat, device)) return refuse("that seat is not yours to read", 403);

      if (!leaf && method === "GET") return asJson(seatView(seat, device));

      if (!leaf && method === "DELETE") {
        if (!mayRun(seat, device) && !mayManage(seat, device)) return refuse("only the seat's runner or person closes it", 403);
        if (!seat.closedAt) { seat.closedAt = now(); seat.at = now(); save(); tellSeat(seat); }
        return asJson(seatView(seat, device));
      }

      if (leaf === "/draft" && method === "POST") {
        if (device.person !== seat.person) return refuse("what is being typed stays with the person whose seat it is", 403);
        if (!mayWrite(seat, device)) return refuse("that seat's keyboard is not lent to you", 403);
        if (!seat.keys[String(asked.keyId || "")]) return refuse("that key id is not one of this seat's", 400);
        const ct = String(asked.ct || "");
        if (ct.length > BOX_CEILING) return refuse("that draft is too long to keep", 413);
        const at = Number(asked.at) || now();
        if (seat.draft && at < Number(seat.draft.at || 0)) return asJson({ draft: seat.draft, older: true });
        seat.draft = { keyId: String(asked.keyId), nonce: String(asked.nonce || ""), ct, at, by: device.fingerprint };
        save();
        pushMine(seat, "draft", { seat: seat.id, draft: seat.draft });
        return asJson({ draft: seat.draft });
      }

      if (leaf === "/title" && method === "POST") {
        if (!mayRun(seat, device)) return refuse("only the seat's runner names it", 403);
        if (!seat.keys[String(asked.keyId || "")]) return refuse("that key id is not one of this seat's", 400);
        seat.title = { keyId: String(asked.keyId), nonce: String(asked.nonce || ""), ct: String(asked.ct || "") };
        seat.at = now();
        save();
        tellSeat(seat);
        return asJson(seatView(seat, device));
      }

      if (leaf === "/events" && method === "GET") {
        const from = Number(new URLSearchParams(query).get("from") || 0);
        return asJson({ events: held.events.filter((one) => one.seq > from), firstSeq: seat.firstSeq || 1, lastSeq: held.events.at(-1)?.seq || 0 });
      }

      if (leaf === "/events" && method === "POST") {
        if (!mayRun(seat, device)) return refuse("only the seat's runner appends events", 403);
        if (seat.closedAt) { seat.closedAt = 0; save(); tellSeat(seat); }
        const entry = { seat: seat.id, lane: "events", seq: Number(asked.seq), keyId: String(asked.keyId || ""), nonce: String(asked.nonce || ""), ct: String(asked.ct || ""), by: device.fingerprint, sig: String(asked.sig || "") };
        if (!seat.keys[entry.keyId]) return refuse("that key id is not one of this seat's", 400);
        const last = held.events.at(-1)?.seq || 0;
        if (entry.seq === last && held.events.at(-1)?.sig === entry.sig) return asJson({ seq: entry.seq, duplicate: true, lastSeq: last });
        if (entry.seq !== last + 1) return refuse(`expected seq ${last + 1}`, 409, { lastSeq: last });
        if (!(await verifyEntry(await signerOf(device), entry))) return refuse("that entry's signature does not match", 401);
        entry.at = now();
        appendEntry(seat, "events", entry);
        save();
        pushReaders(seat, "event", { seat: seat.id, entry });
        tellPhones(seat, String(asked.wake || ""), entry, noticeIn(asked));
        return asJson({ seq: entry.seq, lastSeq: entry.seq });
      }

      if (leaf === "/intents" && method === "GET") {
        const from = Number(new URLSearchParams(query).get("from") || 0);
        return asJson({ intents: held.intents.filter((one) => one.n > from), lastIntent: held.intents.at(-1)?.n || 0 });
      }

      if (leaf === "/intents" && method === "POST") {
        if (!mayWrite(seat, device)) return refuse("that seat's keyboard is not lent to you", 403);
        const entry = { seat: seat.id, lane: "intents", seq: Number(asked.seq), keyId: String(asked.keyId || ""), nonce: String(asked.nonce || ""), ct: String(asked.ct || ""), by: device.fingerprint, sig: String(asked.sig || "") };
        if (!seat.keys[entry.keyId]) return refuse("that key id is not one of this seat's", 400);
        const twice = held.intents.find((one) => one.by === entry.by && one.seq === entry.seq);
        if (twice) return asJson({ n: twice.n, duplicate: true, lastIntent: held.intents.at(-1)?.n || 0 });
        if (!(await verifyEntry(await signerOf(device), entry))) return refuse("that entry's signature does not match", 401);
        entry.n = (held.intents.at(-1)?.n || seat.lastIntent || 0) + 1;
        entry.at = now();
        appendEntry(seat, "intents", entry);
        save();
        pushReaders(seat, "intent", { seat: seat.id, entry });
        return asJson({ n: entry.n, lastIntent: entry.n });
      }

      if (leaf === "/grant" && method === "POST") {
        if (!mayManage(seat, device)) return refuse("only the seat's person shares it", 403);
        const wraps = asked.wraps && typeof asked.wraps === "object" ? asked.wraps : {};
        const current = seat.keys[seat.keyId];
        for (const [fp, box] of Object.entries(wraps)) {
          const target = onRoster(fp);
          if (!target || target.revokedAt) return refuse(`no live device ${fp}`, 404);
          current.wraps[fp] = box;
          if (!seat.readers.includes(fp)) seat.readers.push(fp);
          if (asked.write && !seat.writers.includes(fp)) seat.writers.push(fp);
        }
        save();
        for (const fp of Object.keys(wraps)) push(fp, "seat", seatView(seat, onRoster(fp)));
        return asJson(seatView(seat, device));
      }

      if (leaf === "/keys" && method === "POST") {
        if (!mayManage(seat, device)) return refuse("only the seat's person rotates its key", 403);
        const keyId = String(asked.keyId || "");
        const wraps = asked.wraps && typeof asked.wraps === "object" ? asked.wraps : {};
        if (!keyId || seat.keys[keyId]) return refuse("a rotation brings a new key id", 400);
        if (!wraps[seat.runner]) return refuse("the runner keeps a copy of every key", 400);
        const drop = String(asked.revoke || "");
        seat.keys[keyId] = { wraps, at: now() };
        seat.keyId = keyId;
        seat.readers = Object.keys(wraps);
        seat.writers = seat.writers.filter((fp) => seat.readers.includes(fp));
        save();
        tellSeat(seat);
        if (drop) push(drop, "seat", { id: seat.id, gone: true });
        return asJson(seatView(seat, device));
      }

      if (leaf === "/blobs" && method === "POST") {
        if (!mayWrite(seat, device)) return refuse("that seat's keyboard is not lent to you", 403);
        const id = String(asked.id || "");
        if (!BLOB_ID.test(id)) return refuse("a blob id is the hex hash of its ciphertext", 400);
        if (!seat.keys[String(asked.keyId || "")]) return refuse("that key id is not one of this seat's", 400);
        mkdirSync(blobDir(seat.id), { recursive: true });
        writeFileSync(join(blobDir(seat.id), `${id}.json`), JSON.stringify({ id, keyId: asked.keyId, nonce: asked.nonce, ct: asked.ct, by: device.fingerprint, at: now() }));
        return asJson({ id });
      }

      if (leaf === "/blobs" && method === "GET" && seatPath[3]) {
        if (!BLOB_ID.test(seatPath[3])) return refuse("no such blob", 404);
        const file = join(blobDir(seat.id), `${seatPath[3]}.json`);
        if (!existsSync(file)) return refuse("no such blob", 404);
        return asJson(JSON.parse(readFileSync(file, "utf8")));
      }

      return refuse("no such route", 404);
    }

    const peek = path.match(/^\/peek\/([^/]+)$/);
    if (peek && method === "GET") {
      const seat = state.seats[decodeURIComponent(peek[1])];
      if (!seat) return refuse("no such seat", 404);
      if (!mayManage(seat, device) && !isAdmin(device)) return refuse("only the seat's person peeks at what the broker holds", 403);
      const blobs = existsSync(blobDir(seat.id)) ? readdirSync(blobDir(seat.id)).map((one) => JSON.parse(readFileSync(join(blobDir(seat.id), one), "utf8"))) : [];
      return asJson({ seat, events: logs.get(seat.id).events, intents: logs.get(seat.id).intents, blobs });
    }

    return refuse("no such route", 404);
  }

  async function stream({ path = "/stream", method = "GET", query = "", headers = {}, body = "" }, sink) {
    const heads = lowerHeaders(headers);
    const verdict = await guard({ method, path: path + (query ? `?${query}` : ""), headers: heads, body });
    if (verdict.error) {
      sink.head(verdict.status, { "content-type": "application/json", "cache-control": "no-store" });
      sink.write(JSON.stringify({ error: verdict.error, ...(verdict.extra || {}) }));
      sink.end();
      return { ok: false, error: verdict.error };
    }
    const device = verdict.device;
    let cursors = {};
    try { cursors = body ? JSON.parse(body) : JSON.parse(atob(new URLSearchParams(query).get("cursors") || "e30")); } catch {}
    if (!cursors || typeof cursors !== "object" || Array.isArray(cursors)) cursors = {};
    sink.head(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", "x-hive-min-client": String(MIN_CLIENT) });
    const held = streams.get(device.fingerprint) || new Set();
    held.add(sink);
    streams.set(device.fingerprint, held);
    sink.write(`event: welcome\ndata: ${JSON.stringify({ fingerprint: audience, person: owner, at: now() })}\n\n`);
    for (const seat of readable(device)) {
      sink.write(`event: seat\ndata: ${JSON.stringify(seatView(seat, device))}\n\n`);
      const cursor = cursors[seat.id] || {};
      for (const entry of logs.get(seat.id).events.filter((one) => one.seq > Number(cursor.events || 0))) {
        sink.write(`event: event\ndata: ${JSON.stringify({ seat: seat.id, entry })}\n\n`);
      }
      for (const entry of logs.get(seat.id).intents.filter((one) => one.n > Number(cursor.intents || 0))) {
        sink.write(`event: intent\ndata: ${JSON.stringify({ seat: seat.id, entry })}\n\n`);
      }
    }
    for (const birth of freshBirths()) {
      if (birth.to === device.fingerprint && !birth.done) sink.write(`event: birth\ndata: ${JSON.stringify(birthView(birth))}\n\n`);
      if (birth.from === device.fingerprint && birth.done) sink.write(`event: birth-done\ndata: ${JSON.stringify(birthView(birth))}\n\n`);
    }
    for (const ask of freshAsks().values()) {
      if (ask.to === device.fingerprint && !ask.done) sink.write(`event: ask\ndata: ${JSON.stringify(askView(ask))}\n\n`);
      if (ask.from === device.fingerprint && ask.done) sink.write(`event: ask-done\ndata: ${JSON.stringify(askView(ask, { box: false }))}\n\n`);
    }
    sink.write(`event: caught-up\ndata: ${JSON.stringify({ at: now() })}\n\n`);
    const wasOffline = held.size === 1;
    if (wasOffline) broadcast("presence", { fingerprint: device.fingerprint, kind: device.kind, online: true });
    const beat = setInterval(() => { try { sink.write(`event: ping\ndata: ${now()}\n\n`); } catch {} }, HEARTBEAT_MS);
    beat.unref?.();
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      clearInterval(beat);
      held.delete(sink);
      if (!held.size) {
        streams.delete(device.fingerprint);
        broadcast("presence", { fingerprint: device.fingerprint, kind: device.kind, online: false });
      }
    };
    sink.onClose(leave);
    return { ok: true, device };
  }

  return {
    answer,
    stream,
    openCode,
    audience,
    owner,
    get state() { return state; },
    get online() { return [...streams.keys()]; },
    close() {
      for (const held of streams.values()) for (const sink of held) { try { sink.end(); } catch {} }
      streams.clear();
    }
  };
}
