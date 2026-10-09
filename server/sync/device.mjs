import {
  aadOf, bytesOf, decrypt, encrypt, exportPair, fingerprintOf, fromB64, hexOf, importPair, isJwkPair, keyIdOf, newAgreer, newSeatKey, newSigner,
  open, publicSigner, random, rawOfSsh, rawPublic, seal, sha256, signEntry, signRequest, signerOfPem, textOf, toB64
} from "./crypto.mjs";

export const CLIENT = 1;
export const RETRY_STEP = 500;
export const RETRY_CAP = 10000;
export const STALL_MS = 45000;
export const STALL_CHECK_MS = 5000;
export const STABLE_AFTER_MS = 30000;

/* equal jitter, as T3's supervisor does it: the ceiling doubles per failure up to the
   cap and the wait lands in its upper half, so phones that lost the same server do not
   all knock again in the same instant. */
export function retryDelay(attempt, random = Math.random()) {
  const ceiling = Math.min(RETRY_CAP, RETRY_STEP * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + (ceiling / 2) * random);
}
export const TITLE_CEILING = 160;
export const DRAFT_CEILING = 20000;

export const memoryStore = () => {
  const held = new Map();
  return { get: async (key) => held.get(key), set: async (key, value) => { held.set(key, value); } };
};

const emptyReplica = () => ({ title: "", draft: "", draftAt: 0, draftBy: "", events: [], intents: [], lastSeq: 0, lastIntent: 0, myIntent: 0, gapBefore: 0, locked: 0, bornAt: 0 });

export class Device {
  constructor({ name, signer, agreer, store, fetchImpl = globalThis.fetch, lean = false, stallMs = STALL_MS }) {
    this.name = name;
    this.signer = signer;
    this.agreer = agreer;
    this.store = store;
    this.fetchImpl = (url, init) => fetchImpl(url, init);
    this.lean = lean;
    this.stallMs = stallMs;
    this.host = "";
    this.audience = "";
    this.person = "";
    this.kind = "";
    this.clockOffset = 0;
    this.seatKeys = new Map();
    this.seats = new Map();
    this.replica = new Map();
    this.cursors = {};
    this.people = [];
    this.births = new Map();
    this.asks = new Map();
    this.stream = null;
    this.streamByPost = true;
    this.lastStreamWhy = "";
    this.lastFrameAt = 0;
    this.ears = new Set();
  }

  static async fromKeys({ name, signer, agreer, store = memoryStore(), fetchImpl, lean, stallMs } = {}) {
    const device = new Device({ name, signer, agreer, store, fetchImpl, lean, stallMs });
    device.rawSigner = await rawPublic(signer.publicKey);
    device.rawAgreer = await rawPublic(agreer.publicKey);
    device.fingerprint = await fingerprintOf(device.rawSigner);
    return device;
  }

  static async create({ name, store = memoryStore(), extractable = true, fetchImpl, lean, stallMs } = {}) {
    return Device.fromKeys({ name, signer: await newSigner(extractable), agreer: await newAgreer(extractable), store, fetchImpl, lean, stallMs });
  }

  static async fromIdentity({ name, secret, publicSsh, store = memoryStore(), fetchImpl, lean = true, stallMs } = {}) {
    const raw = rawOfSsh(publicSsh);
    if (!raw) throw new Error("that identity has no ed25519 public key");
    const signer = { privateKey: await signerOfPem(secret), publicKey: await publicSigner(raw) };
    let agreer = await store.get("agreer");
    if (!agreer) {
      agreer = await newAgreer(true);
      await store.set("agreer", agreer);
    }
    const device = new Device({ name, signer, agreer, store, fetchImpl, lean, stallMs });
    device.rawSigner = raw;
    device.rawAgreer = await rawPublic(agreer.publicKey);
    device.fingerprint = await fingerprintOf(raw);
    await device.restoreState();
    return device;
  }

  static async restore({ name, store, fetchImpl, lean, stallMs } = {}) {
    const held = await store.get("identity");
    if (!held?.signer || !held?.agreer) return null;
    let signer = held.signer;
    let agreer = held.agreer;
    try {
      if (isJwkPair(signer)) signer = await importPair(signer, "signer");
      if (isJwkPair(agreer)) agreer = await importPair(agreer, "agreer");
    } catch { return null; }
    if (!signer?.privateKey || !agreer?.privateKey) return null;
    const device = new Device({ name: held.name || name, signer, agreer, store, fetchImpl, lean, stallMs });
    device.rawSigner = await rawPublic(signer.publicKey);
    device.rawAgreer = await rawPublic(agreer.publicKey);
    device.fingerprint = await fingerprintOf(device.rawSigner);
    await device.restoreState();
    return device;
  }

  async restoreState() {
    const held = (await this.store.get("identity")) || {};
    this.host = held.host || "";
    this.audience = held.audience || "";
    this.person = held.person || "";
    this.kind = held.kind || "";
    const keys = (await this.store.get("seatKeys")) || {};
    for (const [seat, byId] of Object.entries(keys)) this.seatKeys.set(seat, new Map(Object.entries(byId).map(([id, b64]) => [id, fromB64(b64)])));
    const replica = (await this.store.get("replica")) || {};
    for (const [seat, kept] of Object.entries(replica)) this.replica.set(seat, { ...emptyReplica(), ...kept });
    this.cursors = {};
    for (const [seat, kept] of this.replica) {
      this.cursors[seat] = {
        events: Math.max(kept.lastSeq || 0, ...kept.events.map((one) => Number(one.seq) || 0)),
        intents: Math.max(kept.lastIntent || 0, ...kept.intents.map((one) => Number(one.n) || 0))
      };
    }
  }

  async keysForKeeping() {
    if (this.kept) return this.kept;
    const signer = this.signer.privateKey.extractable ? await exportPair(this.signer) : this.signer;
    const agreer = this.agreer.privateKey.extractable ? await exportPair(this.agreer) : this.agreer;
    this.kept = { signer, agreer };
    return this.kept;
  }

  async persist() {
    const identity = { name: this.name, host: this.host, audience: this.audience, person: this.person, kind: this.kind };
    if (!this.lean) Object.assign(identity, await this.keysForKeeping());
    await this.store.set("identity", identity);
    const keys = {};
    for (const [seat, byId] of this.seatKeys) keys[seat] = Object.fromEntries([...byId].map(([id, raw]) => [id, toB64(raw)]));
    await this.store.set("seatKeys", keys);
    const replica = {};
    for (const [seat, kept] of this.replica) replica[seat] = this.lean ? { title: kept.title, draft: kept.draft, draftAt: kept.draftAt, lastSeq: kept.lastSeq, lastIntent: kept.lastIntent, myIntent: kept.myIntent, bornAt: kept.bornAt } : kept;
    await this.store.set("replica", replica);
  }

  get paired() { return !!(this.host && this.audience); }

  async pair(host, code) {
    const base = String(host).replace(/\/$/, "");
    const response = await this.fetchImpl(`${base}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, name: this.name, signer: toB64(this.rawSigner), agreer: toB64(this.rawAgreer), client: CLIENT })
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok || !answer.paired) throw new Error(answer.error || `pairing answered ${response.status}`);
    this.host = base;
    this.audience = answer.fingerprint;
    this.person = answer.person;
    this.kind = answer.kind || "phone";
    await this.persist();
    return answer;
  }

  async enroll(host, { kind = "mac" } = {}) {
    const base = String(host).replace(/\/$/, "");
    const hello = await this.fetchImpl(`${base}/hello`);
    const said = await hello.json().catch(() => ({}));
    if (!hello.ok || !said.audience) throw new Error(said.error || `the hive answered ${hello.status} to hello`);
    this.host = base;
    this.audience = said.audience;
    const done = await this.call("POST", "/enroll", { agreer: toB64(this.rawAgreer), name: this.name, kind, client: CLIENT });
    this.person = done.person;
    this.kind = done.kind || kind;
    await this.persist();
    return done;
  }

  async signed(method, path, body = "") {
    const at = Date.now() + this.clockOffset;
    const nonce = hexOf(random(16));
    const signature = await signRequest(this.signer.privateKey, { method, path, body, at, nonce, audience: this.audience });
    return { "x-hive-key": this.fingerprint, "x-hive-at": String(at), "x-hive-nonce": nonce, "x-hive-signature": signature, "x-hive-client": String(CLIENT) };
  }

  async call(method, path, payload, { retried = false } = {}) {
    if (!this.host || !this.audience) throw new Error("this device is not paired");
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const headers = { ...(await this.signed(method, path, body)), "content-type": "application/json" };
    const response = await this.fetchImpl(`${this.host}${path}`, { method, headers, body: body || undefined });
    const answer = await response.json().catch(() => ({}));
    if (response.status === 401 && answer.error === "off the clock" && !retried && Number.isFinite(answer.serverAt)) {
      this.clockOffset = answer.serverAt - Date.now();
      return this.call(method, path, payload, { retried: true });
    }
    if (!response.ok) {
      const wrong = new Error(answer.error || `the hive answered ${response.status}`);
      wrong.status = response.status;
      wrong.answer = answer;
      throw wrong;
    }
    return answer;
  }

  keyFor(seat, keyId) {
    return this.seatKeys.get(seat)?.get(keyId) || null;
  }

  keepKey(seat, keyId, raw) {
    if (!this.seatKeys.has(seat)) this.seatKeys.set(seat, new Map());
    this.seatKeys.get(seat).set(keyId, raw);
  }

  async unwrap(seat, wraps) {
    for (const [keyId, box] of Object.entries(wraps || {})) {
      if (this.keyFor(seat, keyId)) continue;
      try { this.keepKey(seat, keyId, await open(this.agreer.privateKey, this.rawAgreer, box)); } catch {}
    }
  }

  async wrapFor(fingerprint, raw) {
    const target = this.people.find((one) => one.fingerprint === fingerprint);
    if (!target?.agreer) throw new Error(`I do not know a device ${fingerprint}`);
    return seal(fromB64(target.agreer), raw);
  }

  async refreshPeople() {
    const said = await this.call("GET", "/seats");
    this.people = said.people || [];
    return said;
  }

  mates() {
    return this.people.filter((one) => one.person === this.person && one.agreer);
  }

  held(seatId) {
    if (!this.replica.has(seatId)) this.replica.set(seatId, emptyReplica());
    return this.replica.get(seatId);
  }

  async putDraft(seatId, text, at = Date.now()) {
    const seat = this.seats.get(seatId) || (await this.call("GET", `/seats/${seatId}`));
    this.seats.set(seatId, seat);
    const keyId = seat.keyId;
    const raw = this.keyFor(seatId, keyId);
    if (!raw) throw new Error(`I hold no key ${keyId} for ${seatId}`);
    const said = String(text || "").slice(0, DRAFT_CEILING);
    const box = await encrypt(raw, aadOf({ seat: seatId, lane: "draft", seq: 0, keyId }), bytesOf(said));
    const answer = await this.call("POST", `/seats/${seatId}/draft`, { keyId, nonce: box.nonce, ct: box.ct, at });
    if (answer.older) return answer;
    const kept = this.held(seatId);
    kept.draft = said;
    kept.draftAt = Number(answer.draft?.at) || at;
    kept.draftBy = this.fingerprint;
    seat.draft = answer.draft || seat.draft;
    return answer;
  }

  async takeDraft(seatId, draft) {
    if (!draft?.ct) return false;
    const raw = this.keyFor(seatId, draft.keyId);
    if (!raw) return false;
    const kept = this.held(seatId);
    const at = Number(draft.at) || 0;
    if (at && at < (kept.draftAt || 0)) return false;
    let said;
    try { said = textOf(await decrypt(raw, aadOf({ seat: seatId, lane: "draft", seq: 0, keyId: draft.keyId }), draft)); }
    catch { return false; }
    const changed = said !== kept.draft;
    kept.draft = said;
    kept.draftAt = at;
    kept.draftBy = String(draft.by || "");
    for (const ear of this.ears) ear({ kind: "draft", seat: seatId, text: said, at, by: kept.draftBy, mine: kept.draftBy === this.fingerprint, changed });
    return changed;
  }

  async sealTitle(seatId, keyId, raw, title) {
    return { keyId, ...(await encrypt(raw, aadOf({ seat: seatId, lane: "title", seq: 0, keyId }), bytesOf(String(title || "").slice(0, TITLE_CEILING)))) };
  }

  async openSeat({ id, title = "", fresh = false }) {
    await this.refreshPeople();
    const raw = newSeatKey();
    const keyId = await keyIdOf(raw);
    const wraps = {};
    for (const mate of this.mates()) wraps[mate.fingerprint] = await seal(fromB64(mate.agreer), raw);
    if (!wraps[this.fingerprint]) wraps[this.fingerprint] = await seal(this.rawAgreer, raw);
    const seat = await this.call("POST", "/seats", { id, title: await this.sealTitle(id, keyId, raw, title), keyId, wraps, fresh });
    if (seat.keyId === keyId) {
      this.keepKey(id, keyId, raw);
      this.replica.set(id, { ...emptyReplica(), title });
      this.cursors[id] = { events: 0, intents: 0 };
    } else {
      await this.takeSeat(seat);
    }
    this.seats.set(id, seat);
    await this.persist();
    return seat;
  }

  async retitle(seatId, title) {
    const seat = this.seats.get(seatId) || (await this.call("GET", `/seats/${seatId}`));
    const raw = this.keyFor(seatId, seat.keyId);
    if (!raw) throw new Error(`I hold no key ${seat.keyId} for ${seatId}`);
    const said = await this.call("POST", `/seats/${seatId}/title`, await this.sealTitle(seatId, seat.keyId, raw, title));
    this.seats.set(seatId, said);
    this.held(seatId).title = String(title || "");
    return said;
  }

  async closeSeat(seatId) {
    const said = await this.call("DELETE", `/seats/${seatId}`);
    this.seats.set(seatId, said);
    return said;
  }

  async setProfile(profile) {
    return this.call("POST", "/profile", { avatar: String(profile?.avatar || ""), wear: String(profile?.wear || ""), language: String(profile?.language || "") });
  }

  async openCode({ ttlMs, person } = {}) {
    return this.call("POST", "/pair/open", { ...(ttlMs ? { ttlMs } : {}), ...(person ? { person } : {}) });
  }

  async noticesKey() {
    return this.call("GET", "/notices/key");
  }

  async takeNotices(subscription, wants) {
    return this.call("POST", "/notices", { ...subscription, wants });
  }

  async dropNotices() {
    return this.call("DELETE", "/notices");
  }

  async write(seatId, event, { wake = "", notice = null } = {}) {
    const seat = this.seats.get(seatId) || (await this.call("GET", `/seats/${seatId}`));
    this.seats.set(seatId, seat);
    const keyId = seat.keyId;
    const raw = this.keyFor(seatId, keyId);
    if (!raw) throw new Error(`I hold no key ${keyId} for ${seatId}`);
    const kept = this.held(seatId);
    const seq = Math.max(kept.lastSeq || 0, seat.lastSeq || 0) + 1;
    const box = await encrypt(raw, aadOf({ seat: seatId, lane: "events", seq, keyId }), bytesOf(JSON.stringify(event)));
    const entry = { seat: seatId, lane: "events", seq, keyId, nonce: box.nonce, ct: box.ct, by: this.fingerprint };
    entry.sig = await signEntry(this.signer.privateKey, entry);
    let body = entry;
    if (wake) {
      body = { ...entry, wake };
      if (notice) {
        const sealed = await encrypt(raw, aadOf({ seat: seatId, lane: "notice", seq, keyId }), bytesOf(JSON.stringify(notice)));
        body.notice = { keyId, nonce: sealed.nonce, ct: sealed.ct };
      }
    }
    try {
      const said = await this.call("POST", `/seats/${seatId}/events`, body);
      seat.lastSeq = said.lastSeq;
      this.takeEvent(seatId, { ...entry, at: Date.now() }, event);
      return said;
    } catch (wrong) {
      if (wrong.status === 409 && Number.isFinite(wrong.answer?.lastSeq)) {
        kept.lastSeq = wrong.answer.lastSeq;
        seat.lastSeq = wrong.answer.lastSeq;
        return this.write(seatId, event, { wake, notice });
      }
      throw wrong;
    }
  }

  async intend(seatId, intent) {
    const seat = this.seats.get(seatId) || (await this.call("GET", `/seats/${seatId}`));
    this.seats.set(seatId, seat);
    const keyId = seat.keyId;
    const raw = this.keyFor(seatId, keyId);
    if (!raw) throw new Error(`I hold no key ${keyId} for ${seatId}`);
    const kept = this.held(seatId);
    const mine = kept.intents.filter((one) => one.by === this.fingerprint);
    const seq = Math.max(kept.myIntent || 0, ...mine.map((one) => Number(one.seq) || 0)) + 1;
    const box = await encrypt(raw, aadOf({ seat: seatId, lane: "intents", seq: `${this.fingerprint}:${seq}`, keyId }), bytesOf(JSON.stringify(intent)));
    const entry = { seat: seatId, lane: "intents", seq, keyId, nonce: box.nonce, ct: box.ct, by: this.fingerprint };
    entry.sig = await signEntry(this.signer.privateKey, entry);
    const said = await this.call("POST", `/seats/${seatId}/intents`, entry);
    kept.myIntent = seq;
    this.takeIntent(seatId, { ...entry, n: said.n, at: Date.now() }, intent);
    return said;
  }

  async share(seatId, fingerprint, { write = false } = {}) {
    await this.refreshPeople();
    const seat = await this.call("GET", `/seats/${seatId}`);
    const raw = this.keyFor(seatId, seat.keyId);
    if (!raw) throw new Error(`I hold no current key for ${seatId}`);
    const wraps = { [fingerprint]: await this.wrapFor(fingerprint, raw) };
    return this.call("POST", `/seats/${seatId}/grant`, { wraps, write });
  }

  async revoke(seatId, fingerprint) {
    await this.refreshPeople();
    const seat = await this.call("GET", `/seats/${seatId}`);
    const raw = newSeatKey();
    const keyId = await keyIdOf(raw);
    const wraps = {};
    for (const reader of seat.readers.filter((one) => one !== fingerprint)) {
      wraps[reader] = reader === this.fingerprint ? await seal(this.rawAgreer, raw) : await this.wrapFor(reader, raw);
    }
    const said = await this.call("POST", `/seats/${seatId}/keys`, { keyId, wraps, revoke: fingerprint });
    this.keepKey(seatId, keyId, raw);
    this.seats.set(seatId, said);
    await this.persist();
    return said;
  }

  async askBirth(to, mission) {
    await this.refreshPeople();
    const target = this.people.find((one) => one.fingerprint === to);
    if (!target?.agreer) throw new Error(`I do not know a device ${to}`);
    const id = hexOf(random(16));
    const box = await seal(fromB64(target.agreer), bytesOf(JSON.stringify(mission)));
    const said = await this.call("POST", "/births", { id, to, box });
    this.births.set(id, { id, to, mission, at: said.at || Date.now(), answer: null });
    return { id, online: !!said.online };
  }

  async answerBirth(birth, said) {
    if (!this.people.some((one) => one.fingerprint === birth.from)) await this.refreshPeople();
    const asker = this.people.find((one) => one.fingerprint === birth.from);
    if (!asker?.agreer) throw new Error(`I do not know a device ${birth.from}`);
    const box = await seal(fromB64(asker.agreer), bytesOf(JSON.stringify(said)));
    return this.call("POST", `/births/${birth.id}/done`, { box });
  }

  async ask(to, kind, payload, { timeoutMs = 15000 } = {}) {
    if (!this.people.some((one) => one.fingerprint === to)) await this.refreshPeople();
    const target = this.people.find((one) => one.fingerprint === to);
    if (!target?.agreer) throw new Error(`I do not know a device ${to}`);
    const id = hexOf(random(16));
    const box = await seal(fromB64(target.agreer), bytesOf(JSON.stringify(payload ?? {})));
    let settle = null;
    const answer = new Promise((resolve, reject) => { settle = { resolve, reject }; });
    const held = { id, to, kind, at: Date.now(), answer: null, resolve: settle.resolve, reject: settle.reject, timer: null };
    this.asks.set(id, held);
    let said;
    try { said = await this.call("POST", "/asks", { id, to, kind, box }); }
    catch (wrong) { this.asks.delete(id); throw wrong; }
    if (this.asks.has(id)) {
      held.timer = setTimeout(() => {
        this.asks.delete(id);
        held.reject(new Error(said.online ? "the computer did not answer in time" : "your computer is not listening right now"));
      }, timeoutMs);
    }
    return answer;
  }

  async answerAsk(ask, payload) {
    if (!this.people.some((one) => one.fingerprint === ask.from)) await this.refreshPeople();
    const asker = this.people.find((one) => one.fingerprint === ask.from);
    if (!asker?.agreer) throw new Error(`I do not know a device ${ask.from}`);
    const box = await seal(fromB64(asker.agreer), bytesOf(JSON.stringify(payload ?? {})));
    return this.call("POST", `/asks/${ask.id}/answer`, { box });
  }

  async takeAsk(view) {
    if (view.to === this.fingerprint && !view.done && view.box) {
      let payload = null;
      try { payload = await this.openBox(view.box); } catch { return; }
      for (const ear of this.ears) ear({ kind: "ask", id: view.id, from: view.from, at: view.at, ask: view.kind, payload });
    }
    if (view.from === this.fingerprint && view.done) {
      const held = this.asks.get(view.id);
      if (!held || held.answer) return;
      let answer;
      try {
        const got = await this.call("GET", `/asks/${view.id}/answer`);
        answer = await this.openBox(got.box);
      } catch (wrong) { answer = { error: wrong.message }; }
      held.answer = answer;
      clearTimeout(held.timer);
      this.asks.delete(view.id);
      if (answer && answer.error) held.reject(new Error(answer.error));
      else held.resolve(answer);
      for (const ear of this.ears) ear({ kind: "ask-done", id: view.id, ask: view.kind });
    }
  }

  async pullAsks() {
    const said = await this.call("GET", "/asks");
    for (const view of said.asks || []) await this.takeAsk(view);
  }

  async openBox(box) {
    return JSON.parse(textOf(await open(this.agreer.privateKey, this.rawAgreer, box)));
  }

  async takeBirth(view) {
    if (view.to === this.fingerprint && !view.done) {
      let mission = null;
      try { mission = await this.openBox(view.box); } catch { return; }
      for (const ear of this.ears) ear({ kind: "birth", id: view.id, from: view.from, at: view.at, mission });
    }
    if (view.from === this.fingerprint && view.done) {
      const asked = this.births.get(view.id);
      if (!asked || asked.answer) return;
      let answer;
      try { answer = await this.openBox(view.done.box); } catch { answer = { error: "the answer came sealed with a key this device does not have" }; }
      asked.answer = answer;
      for (const ear of this.ears) ear({ ...answer, kind: "birth-done", id: view.id, job: answer.id || "", at: view.done.at });
    }
  }

  async pullBirths() {
    const said = await this.call("GET", "/births");
    for (const view of said.births || []) await this.takeBirth(view);
  }

  takePresence({ fingerprint, online }) {
    const one = this.people.find((each) => each.fingerprint === fingerprint);
    if (one) one.online = !!online;
    for (const seat of this.seats.values()) if (seat.runner === fingerprint) seat.online = !!online;
  }

  async putBlob(seatId, bytes) {
    const seat = this.seats.get(seatId) || (await this.call("GET", `/seats/${seatId}`));
    const raw = this.keyFor(seatId, seat.keyId);
    if (!raw) throw new Error(`I hold no key ${seat.keyId} for ${seatId}`);
    const box = await encrypt(raw, aadOf({ seat: seatId, lane: "blob", seq: 0, keyId: seat.keyId }), bytes);
    const id = hexOf(await sha256(bytesOf(box.ct))).slice(0, 32);
    await this.call("POST", `/seats/${seatId}/blobs`, { id, keyId: seat.keyId, nonce: box.nonce, ct: box.ct });
    return id;
  }

  async getBlob(seatId, id) {
    const box = await this.call("GET", `/seats/${seatId}/blobs/${id}`);
    const raw = this.keyFor(seatId, box.keyId);
    if (!raw) return null;
    return decrypt(raw, aadOf({ seat: seatId, lane: "blob", seq: 0, keyId: box.keyId }), box);
  }

  async openEntry(seatId, entry) {
    const raw = this.keyFor(seatId, entry.keyId);
    if (!raw) return { locked: true };
    const seqForAad = entry.lane === "intents" ? `${entry.by}:${entry.seq}` : entry.seq;
    try {
      const plain = await decrypt(raw, aadOf({ seat: seatId, lane: entry.lane, seq: seqForAad, keyId: entry.keyId }), entry);
      return { value: JSON.parse(textOf(plain)) };
    } catch {
      return { locked: true, tampered: true };
    }
  }

  async takeSeat(view) {
    if (view.gone) {
      this.seats.delete(view.id);
      this.replica.delete(view.id);
      this.seatKeys.delete(view.id);
      delete this.cursors[view.id];
      for (const ear of this.ears) ear({ kind: "seat-gone", seat: view.id });
      return;
    }
    this.seats.set(view.id, view);
    await this.unwrap(view.id, view.wraps);
    let kept = this.held(view.id);
    if (view.bornAt && kept.bornAt && kept.bornAt !== view.bornAt) {
      this.replica.set(view.id, { ...emptyReplica() });
      kept = this.replica.get(view.id);
      this.cursors[view.id] = { events: 0, intents: 0 };
      for (const ear of this.ears) ear({ kind: "seat-reborn", seat: view.id });
    }
    kept.bornAt = view.bornAt || kept.bornAt;
    if (view.draft) await this.takeDraft(view.id, view.draft);
    if (view.title) {
      const raw = this.keyFor(view.id, view.title.keyId);
      if (raw) {
        try { kept.title = textOf(await decrypt(raw, aadOf({ seat: view.id, lane: "title", seq: 0, keyId: view.title.keyId }), view.title)); } catch {}
      }
    }
    if (!this.cursors[view.id]) this.cursors[view.id] = { events: 0, intents: 0 };
  }

  takeEvent(seatId, entry, value, extra = {}) {
    const kept = this.held(seatId);
    if (entry.seq <= (kept.lastSeq || 0) && !this.lean && kept.events.some((one) => one.seq === entry.seq)) return false;
    if (this.lean && entry.seq <= (kept.lastSeq || 0)) return false;
    if (!this.lean) kept.events.push({ ...entry, value, ...extra });
    kept.lastSeq = Math.max(kept.lastSeq || 0, entry.seq);
    if (extra.locked) kept.locked += 1;
    this.cursors[seatId] = { ...(this.cursors[seatId] || { intents: 0 }), events: Math.max(this.cursors[seatId]?.events || 0, entry.seq) };
    for (const ear of this.ears) ear({ kind: "event", seat: seatId, entry, value, ...extra });
    return true;
  }

  takeIntent(seatId, entry, value, extra = {}) {
    const kept = this.held(seatId);
    if (kept.intents.some((one) => one.by === entry.by && one.seq === entry.seq)) return false;
    kept.intents.push({ ...entry, intent: value, mine: entry.by === this.fingerprint, ...extra });
    if (kept.intents.length > 400) kept.intents.splice(0, kept.intents.length - 400);
    kept.lastIntent = Math.max(kept.lastIntent || 0, entry.n || 0);
    this.cursors[seatId] = { ...(this.cursors[seatId] || { events: 0 }), intents: Math.max(this.cursors[seatId]?.intents || 0, entry.n || 0) };
    for (const ear of this.ears) ear({ kind: "intent", seat: seatId, entry, value, ...extra });
    return true;
  }

  async absorb(seatId, entry) {
    const opened = await this.openEntry(seatId, entry);
    if (entry.lane === "events") return this.takeEvent(seatId, entry, opened.value, opened.locked ? { locked: true } : {});
    return this.takeIntent(seatId, entry, opened.value, opened.locked ? { locked: true } : {});
  }

  async welcomeMates() {
    for (const [seatId, view] of this.seats) {
      if (view.person !== this.person || view.closedAt) continue;
      const raw = this.keyFor(seatId, view.keyId);
      if (!raw) continue;
      for (const mate of this.mates().filter((one) => !view.readers.includes(one.fingerprint))) {
        await this.call("POST", `/seats/${seatId}/grant`, { wraps: { [mate.fingerprint]: await seal(fromB64(mate.agreer), raw) }, write: true });
      }
    }
  }

  async sync() {
    const said = await this.refreshPeople();
    for (const id of [...this.seats.keys()]) {
      if (!said.seats.some((view) => view.id === id)) await this.takeSeat({ id, gone: true });
    }
    for (const view of said.seats) await this.takeSeat(view);
    for (const view of said.seats) await this.catchUp(view);
    if (this.births.size) await this.pullBirths().catch(() => {});
    if (this.asks.size) await this.pullAsks().catch(() => {});
    await this.welcomeMates();
    await this.persist();
    return this.replica;
  }

  async catchUp(view) {
    const cursor = this.cursors[view.id] || { events: 0, intents: 0 };
    const kept = this.held(view.id);
    if (view.lastSeq > cursor.events) {
      let from = cursor.events;
      if (view.firstSeq > from + 1) {
        if (!this.lean) kept.events = [];
        kept.gapBefore = view.firstSeq;
        from = view.firstSeq - 1;
      }
      const page = await this.call("GET", `/seats/${view.id}/events?from=${from}`);
      for (const entry of page.events) await this.absorb(view.id, entry);
    }
    if (view.lastIntent > cursor.intents) {
      const page = await this.call("GET", `/seats/${view.id}/intents?from=${cursor.intents}`);
      for (const entry of page.intents) await this.absorb(view.id, entry);
    }
  }

  listen(ear) {
    if (ear) this.ears.add(ear);
    if (this.stream) return () => { this.ears.delete(ear); };
    let leaving = false;
    let attempt = 0;
    let controller = null;
    let wakeEarly = null;
    let fellBack = false;
    const nap = (ms) => new Promise((wake) => { wakeEarly = wake; setTimeout(wake, ms); }).then(() => { wakeEarly = null; });
    const knock = async (signal) => {
      const cursors = JSON.stringify(this.cursors);
      if (this.streamByPost) {
        const headers = await this.signed("POST", "/stream", cursors);
        return this.fetchImpl(`${this.host}/stream`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: cursors, signal });
      }
      const path = `/stream?cursors=${encodeURIComponent(btoa(cursors))}`;
      const headers = await this.signed("GET", path);
      return this.fetchImpl(`${this.host}${path}`, { headers, signal });
    };
    const dial = async () => {
      while (!leaving) {
        controller = new AbortController();
        const stalled = setInterval(() => { if (Date.now() - this.lastFrameAt > this.stallMs) controller.abort(); }, Math.min(STALL_CHECK_MS, this.stallMs));
        stalled.unref?.();
        try {
          this.lastFrameAt = Date.now();
          const response = await knock(controller.signal);
          if (!response.ok) {
            const answer = await response.json().catch(() => ({}));
            if (answer.error === "off the clock" && Number.isFinite(answer.serverAt)) this.clockOffset = answer.serverAt - Date.now();
            if (this.streamByPost && (response.status === 404 || response.status === 405)) { this.streamByPost = false; fellBack = true; }
            throw new Error(answer.error || `stream answered ${response.status}`);
          }
          const upAt = Date.now();
          for (const one of this.ears) one({ kind: "state", up: true });
          await this.readFrames(response.body).finally(() => { if (Date.now() - upAt >= STABLE_AFTER_MS) attempt = 0; });
        } catch (wrong) {
          this.lastStreamWhy = wrong.message;
          for (const one of this.ears) one({ kind: "warning", message: wrong.message });
        }
        clearInterval(stalled);
        for (const one of this.ears) one({ kind: "state", up: false });
        if (leaving) break;
        if (fellBack) { fellBack = false; continue; }
        attempt += 1;
        await nap(retryDelay(attempt));
      }
    };
    this.stream = {
      stop: () => { leaving = true; controller?.abort(); this.stream = null; },
      redial: () => { attempt = 0; controller?.abort(); wakeEarly?.(); }
    };
    dial();
    return () => { this.ears.delete(ear); if (!this.ears.size) this.stream?.stop(); };
  }

  wake() {
    this.stream?.redial();
  }

  async readFrames(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      this.lastFrameAt = Date.now();
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        await this.takeFrame(frame);
      }
    }
  }

  async takeFrame(frame) {
    let kind = "";
    let data = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) kind = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!kind || kind === "ping") return;
    let body = null;
    try { body = JSON.parse(data); } catch { return; }
    if (kind === "seat") {
      const known = this.seats.has(body.id);
      await this.takeSeat(body);
      if (!body.gone && !known) await this.catchUp(body).catch(() => {});
      for (const ear of this.ears) ear({ kind: "seat", seat: body.id, view: body });
    }
    else if (kind === "draft") await this.takeDraft(body.seat, body.draft);
    else if (kind === "event") await this.absorb(body.seat, body.entry);
    else if (kind === "intent") await this.absorb(body.seat, body.entry);
    else if (kind === "caught-up") { await this.welcomeMates().catch(() => {}); await this.persist(); for (const ear of this.ears) ear({ kind: "caught-up" }); }
    else if (kind === "roster") { await this.refreshPeople().catch(() => {}); await this.welcomeMates().catch(() => {}); for (const ear of this.ears) ear({ ...body, kind: "roster" }); }
    else if (kind === "revoked") { for (const ear of this.ears) ear({ kind: "revoked" }); this.stream?.stop(); }
    else if (kind === "birth" || kind === "birth-done") await this.takeBirth(body);
    else if (kind === "ask" || kind === "ask-done") await this.takeAsk(body);
    else if (kind === "presence") { this.takePresence(body); for (const ear of this.ears) ear({ ...body, kind: "presence" }); }
    else for (const ear of this.ears) ear({ ...body, kind });
  }
}
