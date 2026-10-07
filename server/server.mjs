import { createServer, STATUS_CODES } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { hostname } from "node:os";
import { WebSocketServer } from "ws";

import { createGuard, fingerprintOf, newIdentity } from "./identity.mjs";
import { createBrokerClient } from "./client.mjs";
import { createRosterStore, fromAllowedSigners, publicView } from "./roster.mjs";
import { createHub, envelopeOf } from "./hub.mjs";
import { createSessions, isSeatName, seatWindowSession, seatWindowsWanted } from "./sessions.mjs";
import { HUB_SERVER } from "./gateway/mcp-gateway.mjs";
import { createSeats } from "./seats.mjs";
import { createRun } from "./run.mjs";
import { keepPushing, rootsOf } from "./autopush.mjs";
import { createFiles } from "./files.mjs";
import { createTerminals, readFrame } from "./terminal.mjs";
import { prepareWorktree } from "./worktree.mjs";
import { hubDir, workspaceRoot } from "./engine/paths.mjs";
import { warmClaudeBinary } from "./engine/claude-binary.mjs";
import { createPeers } from "./peers.mjs";
import { linkOf, openInvite, readLink, redeemInvite, peerOf, sameToken } from "./invites.mjs";
import { createGrants, GRANT_MS } from "./grants.mjs";
import { allowedSigners, brokerHome, stateDir as stateDirOf } from "./engine/paths.mjs";
import { insideOf } from "./inside.mjs";
import { fleetOf } from "./fleet.mjs";
import { BIRTH_REPLY_MS, BIRTH_WAIT_MS, createAsked, onItsWay } from "./asked.mjs";
import { createSyncBroker } from "./sync/broker.mjs";
import { createNotices } from "./sync/notices.mjs";
import { Device } from "./sync/device.mjs";
import { isSyncPath, localFetch, serveSync } from "./sync/mount.mjs";
import { createRunner } from "./sync/runner.mjs";
import { fileStore } from "./sync/store.mjs";
import { rawOfSsh } from "./sync/crypto.mjs";

const windowAsked = (query) => { const asked = String(query?.get("window") || ""); return asked === "tail" || asked === "turns" ? asked : "all"; };

export const BODY_CEILING = 1 << 20;
export const OPEN_ROUTES = new Set(["/health", "/api/broker", "/api/invites/redeem"]);

export function refusalLine({ method, path, who, error }) {
  return `server: refused ${who} on ${String(method || "GET").toUpperCase()} ${path} — ${error}`;
}

export function refusalHead({ status, error }) {
  const code = Number(status) || 401;
  const body = JSON.stringify({ error: String(error || STATUS_CODES[code] || "refused") });
  return [
    `HTTP/1.1 ${code} ${STATUS_CODES[code] || "Unauthorized"}`,
    "content-type: application/json",
    `content-length: ${Buffer.byteLength(body)}`,
    "connection: close",
    "",
    body
  ].join("\r\n");
}

export const TURNING = new Set(["result", "assistant", "system"]);
export const FLEET_STIR_MS = 400;
export const PHONE_KINDS = new Set(["mac", "pod"]);
export const LENT_COMMANDS = new Set(["say", "answer", "interrupt", "saynow", "unsay"]);

export const POD_HOST = /^ws-([a-z0-9][a-z0-9-]*)-\d+$/;

export function devOfHost(host) {
  return (POD_HOST.exec(String(host || "").trim().toLowerCase()) || [])[1] || "";
}

const SEAT_PATH = /^\/api\/sessions\/[^/]+(\/[a-z]+)?$/;
const GUEST_READS = new Set(["/api/me", "/api/board", "/api/sessions"]);
const GUEST_WRITES = new Set(["/api/peer-panel", "/api/peer-say", "/api/peer-note"]);

export function guestMay(method, path) {
  if (SEAT_PATH.test(path)) return true;
  if (GUEST_READS.has(path)) return method === "GET";
  if (GUEST_WRITES.has(path)) return method === "POST";
  return false;
}

export function readBody(request, { ceiling = BODY_CEILING } = {}) {
  return new Promise((resolve, reject) => {
    const pieces = [];
    let held = 0;
    let spilled = false;
    request.on("data", (chunk) => {
      if (spilled) return;
      held += chunk.length;
      if (held > ceiling) {
        spilled = true;
        request.pause();
        reject(new Error(`that body is past the ${ceiling} the broker takes`));
        return;
      }
      pieces.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(pieces)));
    request.on("error", reject);
  });
}

export function readSignature(headers) {
  return {
    fingerprint: String(headers["x-hive-key"] || ""),
    signature: String(headers["x-hive-signature"] || ""),
    at: String(headers["x-hive-at"] || ""),
    nonce: String(headers["x-hive-nonce"] || "")
  };
}

export function loadIdentity(file) {
  if (existsSync(file)) {
    const held = JSON.parse(readFileSync(file, "utf8"));
    if (held?.secret && held?.publicSsh) return { ...held, fingerprint: fingerprintOf(held.publicSsh) };
  }
  const fresh = newIdentity("hive-broker");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(fresh, null, 2));
  try { chmodSync(file, 0o600); } catch {}
  return fresh;
}

export function createBroker({ home, stateDir, now = () => Date.now(), log = () => {}, driverPath = "", launch = null, publicUrl: publicUrlAsked = "", name = "", fetchImpl = fetch, phone = true } = {}) {
  const base = home || brokerHome();
  const stateHome = stateDir || home || stateDirOf();
  mkdirSync(base, { recursive: true });
  mkdirSync(stateHome, { recursive: true });

  const me = loadIdentity(join(base, "identity.json"));
  const myUrl = () => String(publicUrlAsked || process.env.HIVE_SERVER_URL || "").replace(/\/$/, "");
  const myName = () => String(name || process.env.HIVE_SERVER_NAME || process.env.HIVE_DEV || "").slice(0, 40);
  const rosterFile = join(base, "roster.json");
  const roster = createRosterStore({
    read: () => (existsSync(rosterFile) ? readFileSync(rosterFile, "utf8") : ""),
    write: (text) => { writeFileSync(rosterFile, text); try { chmodSync(rosterFile, 0o600); } catch {} },
    now
  });

  const signers = allowedSigners();
  const ownerKey = String(process.env.HIVE_OWNER_KEY || "").trim();
  const written = signers && existsSync(signers) ? readFileSync(signers, "utf8") : "";
  const ownerLine = ownerKey && !written.includes(ownerKey) ? `${myName()} ${ownerKey}`.trim() : "";
  if (written || ownerLine) {
    const trusted = fromAllowedSigners([written, ownerLine].filter(Boolean).join("\n"), { owners: [myName(), devOfHost(hostname())] });
    const { added } = roster.adopt(trusted);
    let moved = 0;
    for (const one of trusted) {
      if (roster.keepKind(one.fingerprint, one.kind).kept) moved += 1;
      roster.keepName(one.fingerprint, one.name);
    }
    if (added) log(`server: adopted ${added} keys from allowed_signers`);
    if (ownerLine) log(`server: the owner key from the environment is trusted`);
    if (moved) log(`server: ${moved} keys from allowed_signers changed side`);
  }

  const peersFile = join(base, "peers.json");
  const grantsFile = join(base, "grants.json");
  const grants = createGrants({
    read: () => (existsSync(grantsFile) ? readFileSync(grantsFile, "utf8") : ""),
    write: (text) => { writeFileSync(grantsFile, text); try { chmodSync(grantsFile, 0o600); } catch {} },
    now
  });

  const peerWatchers = new Map();
  const peers = createPeers({
    identity: me,
    read: () => (existsSync(peersFile) ? readFileSync(peersFile, "utf8") : ""),
    write: (text) => { writeFileSync(peersFile, text); try { chmodSync(peersFile, 0o600); } catch {} },
    now,
    log,
    onPeerEvent: (fingerprint, envelope) => {
      if (envelope?.kind !== "event") return;
      const key = `${fingerprint}/${envelope.body?.session}`;
      const following = peerWatchers.get(key);
      if (!following?.size) return;
      const out = envelopeOf({ kind: "event", from: fingerprint, body: { peer: fingerprint, session: envelope.body.session, event: envelope.body.event }, at: now() });
      for (const who of following) hub.deliver(who, out);
    }
  });

  const seatsSeen = new Map();

  const hub = createHub({ now });
  const guard = createGuard({ roster, audience: me.fingerprint, now });
  const whoIs = (fingerprint) => {
    const known = fingerprint ? roster.find(fingerprint) : null;
    if (known) return `${known.kind} ${known.name}`;
    return fingerprint ? `unknown key ${fingerprint}` : "an unsigned request";
  };
  const refused = (verdict, { method, path, fingerprint }) => {
    log(refusalLine({ method, path, who: whoIs(fingerprint), error: verdict.error }));
    return verdict;
  };

  setImmediate(() => {
    try {
      const warmed = warmClaudeBinary();
      if (warmed.copied) log(`server: claude runs from ${warmed.path}, out of reach of an app update`);
      for (const gone of warmed.forgotten) log(`server: dropped the claude copy ${gone}, nothing runs from it`);
    } catch (e) {
      log(`server: could not put claude out of reach of an app update: ${String(e?.message || e)}`);
    }
  });

  const watchers = new Map();
  const sessions = createSessions({
    base: stateHome,
    driver: driverPath || join(dirname(new URL(import.meta.url).pathname), "../server/engine/driver.mjs"),
    launch,
    now,
    log,
    onEvent: (name, event) => {
      if (TURNING.has(event?.type) || event?.subtype === "question") stirTheFleet();
      if (event?.type === "driver" && event.subtype === "mcp_gateway" && event.replaced) {
        sessions.reconnectMcp(HUB_SERVER, { except: name }).catch((e) => log(`mcp ${HUB_SERVER}: reconnect after gateway swap failed: ${String(e?.message || e)}`));
      }
      const following = watchers.get(name);
      if (!following?.size) return;
      const envelope = envelopeOf({ kind: "event", from: me.fingerprint, body: { session: name, event }, at: now() });
      for (const fingerprint of following) hub.deliver(fingerprint, envelope);
    }
  });

  const files = createFiles();
  const terminals = createTerminals({ log });
  const seatSession = seatWindowSession(stateHome);
  const seats = createSeats({ session: seatSession, base: stateHome, owner: myName(), log });
  const runner = createRun();

  const askedBirths = createAsked({ what: "new chat", waitMs: BIRTH_WAIT_MS });

  const sync = createSyncBroker({
    dataDir: join(base, "sync"),
    audience: me.fingerprint,
    notices: createNotices({ dir: join(base, "sync"), subject: myUrl(), log }),
    owner: devOfHost(hostname()) || myName() || "owner",
    now,
    log,
    trusted: (fingerprint) => {
      if (fingerprint === me.fingerprint) return { signer: rawOfSsh(me.publicSsh), name: myName() || "pod", kind: "pod" };
      const known = roster.find(fingerprint);
      if (!known || known.revokedAt || !PHONE_KINDS.has(known.kind)) return null;
      return { signer: rawOfSsh(known.publicSsh), name: known.name, kind: known.kind };
    }
  });
  let phoneRunner = null;
  async function followSeatsForThePhone() {
    if (phoneRunner || !phone) return phoneRunner;
    const device = await Device.fromIdentity({ name: myName() || "pod", secret: me.secret, publicSsh: me.publicSsh, store: fileStore(join(base, "sync", "pod-device")), fetchImpl: localFetch(sync), lean: true });
    await device.enroll("http://sync/sync", { kind: "pod" });
    phoneRunner = createRunner({
      device,
      base: stateHome,
      seats: async () => (await sessions.list()).filter((one) => one.alive).map((one) => ({ name: one.name, title: one.title || one.name })),
      say: (seat, cmd) => sessions.command(seat, cmd),
      log
    });
    await phoneRunner.start();
    return phoneRunner;
  }

  function whoOwnsTheFleet() {
    const rows = hub.board().filter((row) => Array.isArray(row?.panel?.seats));
    const awake = rows.filter((row) => row.online);
    return (awake[0] || rows[0])?.fingerprint || "";
  }

  let stirring = null;
  function stirTheFleet() {
    if (stirring) return;
    stirring = setTimeout(() => {
      stirring = null;
      hub.broadcast(envelopeOf({ kind: "panel", from: me.fingerprint, at: now() }));
    }, FLEET_STIR_MS);
    stirring.unref?.();
  }

  function follow(fingerprint, name) {
    const held = watchers.get(name) || new Set();
    held.add(fingerprint);
    watchers.set(name, held);
  }

  function watchPeerSeat(who, fingerprint, name) {
    const key = `${fingerprint}/${name}`;
    const held = peerWatchers.get(key) || new Set();
    held.add(who);
    peerWatchers.set(key, held);
    peers.listen(fingerprint);
  }

  function adoptPeer(peer, { mine = false } = {}) {
    const kind = mine ? "mac" : "peer";
    const done = peers.adopt({ ...peer, mine: !!mine });
    roster.adopt([{
      fingerprint: peer.fingerprint,
      publicSsh: peer.publicSsh,
      name: peer.name || peer.fingerprint,
      kind,
      pairedAt: peer.knownAt,
      lastSeen: peer.knownAt,
      revokedAt: 0
    }]);
    roster.keepKind(peer.fingerprint, kind);
    return done;
  }

  const asJson = (payload, status = 200) => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });

  async function answer({ method, path, signedPath, headers, body, query }) {
    if (path === "/health") return asJson({ ok: true, at: now() });

    if (path === "/api/broker" && method === "GET") {
      return asJson({ key: me.publicSsh, fingerprint: me.fingerprint, pairing: !!roster.all.pairing });
    }

    if (path === "/api/pair" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const done = roster.redeem({ code: asked.code, publicSsh: asked.key, name: asked.name });
      if (done.error) return asJson({ error: done.error }, 401);
      log(`server: paired ${done.device.kind} ${done.device.name} (${done.device.fingerprint})`);
      return asJson({ paired: true, fingerprint: me.fingerprint, device: done.device.fingerprint, broker: me.publicSsh });
    }

    if (path === "/api/invites/redeem" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const made = peerOf({ url: String(asked.url || ""), publicSsh: String(asked.key || ""), name: String(asked.name || ""), now: now() });
      if (made.error) return asJson(made, 400);
      const used = redeemInvite(peers.invites, { token: String(asked.token || ""), now: now(), by: String(asked.name || "") });
      if (used.error) return asJson(used, 401);
      peers.keepInvites(used.invites);
      adoptPeer(made.peer, { mine: !!used.invite?.mine });
      log(`invite redeemed by ${made.peer.name || made.peer.fingerprint}`);
      return asJson({ key: me.publicSsh, fingerprint: me.fingerprint, name: myName(), url: myUrl() });
    }

    if (!OPEN_ROUTES.has(path)) {
      const signed = readSignature(headers);
      const verdict = guard.check({ method, path: signedPath || path, body, ...signed });
      if (!verdict.ok) return asJson({ error: refused(verdict, { method, path, fingerprint: signed.fingerprint }).error }, verdict.status);
      return await asMe(verdict.device, { method, path, body, query });
    }
    return asJson({ error: "no such route" }, 404);
  }

  async function asMe(device, { method, path, body, query }) {
    if (device.kind === "peer" && !guestMay(method, path)) {
      return asJson({ error: "a server that came in by invite trades panels and messages, and touches a seat only while its keyboard is lent" }, 403);
    }

    if (path === "/api/me" && method === "GET") {
      return asJson({ fingerprint: device.fingerprint, name: device.name, kind: device.kind, waiting: hub.waiting(device.fingerprint) });
    }

    if (path === "/api/devices" && method === "GET") return asJson({ devices: publicView(roster.all) });

    if (path === "/api/pair/open" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch {}
      const opened = roster.open({ kind: asked.kind });
      return asJson({ code: opened.code, expiresAt: opened.expiresAt });
    }

    if (path === "/api/devices/revoke" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch {}
      const done = roster.revoke(String(asked.fingerprint || ""));
      if (done.error) return asJson({ error: done.error }, 404);
      hub.forget(done.device.fingerprint);
      log(`server: revoked ${done.device.name} (${done.device.fingerprint})`);
      return asJson({ revoked: true });
    }

    if (path === "/api/say" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const to = String(asked.to || "");
      const kind = asked.kind || "say";
      if (peers.find(to)) {
        const sent = await peers.send(to, { kind, body: asked.body ?? null, from: device.fingerprint });
        return asJson(sent, sent.ok ? 200 : 502);
      }
      if (roster.find(to)) {
        const done = hub.deliver(to, envelopeOf({ kind, from: device.fingerprint, to, body: asked.body ?? null, at: now() }));
        return asJson(done, done.ok ? 200 : 400);
      }
      return asJson({ error: "nobody on the roster or among the peers has that key" }, 404);
    }

    if (path === "/api/panel" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const done = hub.publish(device.fingerprint, asked.panel ?? null);
      if (!done.ok) return asJson(done, 413);
      seatsSeen.set(device.fingerprint, Array.isArray(asked.panel?.sessions) ? asked.panel.sessions : []);
      hub.broadcast(envelopeOf({ kind: "panel", from: device.fingerprint, at: now() }), { except: device.fingerprint });
      peers.publish(asked.panel ?? null).catch(() => {});
      return asJson({ ok: true });
    }

    if (path === "/api/inside" && method === "GET") return asJson(await insideOf());

    if (path === "/api/run" && method === "POST") {
      if (device.kind === "peer") return asJson({ error: "a server that came in by invite does not run scripts here" }, 403);
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const said = await runner.run(asked);
      return said.error ? asJson(said, 400) : asJson(said);
    }

    if (path.startsWith("/api/seats")) {
      if (device.kind === "peer") return asJson({ error: "a server that came in by invite does not open seats here" }, 403);

      if (path === "/api/seats" && method === "GET") {
        const listed = await seats.list();
        return listed.error ? asJson(listed, 503) : asJson(listed);
      }

      if (path === "/api/seats" && method === "POST") {
        let asked = {};
        try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
        const opened = await seats.open({ ...asked, owner: myName() || device.name });
        if (opened.error) return asJson(opened, 400);
        log(`seat ${opened.name} opened by ${device.name}`);
        return asJson(opened);
      }

      if (path === "/api/seats/wall" && method === "GET") {
        const painted = await seats.wall({ lines: Number(query?.get("lines") || 0) || undefined });
        return painted.error ? asJson(painted, 503) : asJson(painted);
      }

      if (path === "/api/seats/restore" && method === "POST") {
        let asked = {};
        try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
        return asJson(await seats.restore(Array.isArray(asked.seats) ? asked.seats : null, { compactAt: String(asked.compactAt || "") }));
      }

      if (path === "/api/seats/checkpoint" && method === "POST") {
        let asked = {};
        try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
        const wrote = await seats.checkpoint({ fleet: Array.isArray(asked.seats) ? asked.seats : null });
        return wrote.error ? asJson(wrote, 503) : asJson(wrote);
      }

      const desk = path.match(/^\/api\/seats\/([^/]+)(\/[a-z]+)?$/);
      if (desk) {
        const name = decodeURIComponent(desk[1]);
        const leaf = desk[2] || "";
        if (!isSeatName(name)) return asJson({ error: "that is not a name a seat can have" }, 400);

        if (!leaf && method === "DELETE") return asJson(await seats.close(name));

        if (leaf === "/screen" && method === "GET") {
          const looked = await seats.screen(name, { lines: Number(query?.get("lines") || 0) || undefined });
          return looked.error ? asJson(looked, 404) : asJson(looked);
        }

        if (leaf === "/type" && method === "POST") {
          let asked = {};
          try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
          const said = await seats.type(name, String(asked.text || ""), { submit: !!asked.submit });
          return asJson(said, said.ok ? 200 : 404);
        }
      }

      return asJson({ error: "no such route" }, 404);
    }

    if (path === "/api/sessions" && method === "GET") return asJson({ sessions: await sessions.list() });

    if (path === "/api/sessions" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const name = String(asked.name || "");
      let cwd = String(asked.cwd || "");
      if (!cwd && asked.repo) {
        const made = await prepareWorktree({
          root: workspaceRoot(),
          repo: String(asked.repo),
          branch: String(asked.branch || ""),
          name,
          owner: myName() || device.name
        });
        if (made.error) return asJson(made, 400);
        cwd = made.cwd;
        if (made.made) log(`session ${name} got a worktree at ${cwd} on ${made.branch}`);
      }
      const opened = await sessions.open({
        name,
        cwd,
        model: String(asked.model || ""),
        promptFile: String(asked.promptFile || ""),
        resumeId: String(asked.resumeId || ""),
        sessionId: String(asked.sessionId || ""),
        agent: String(asked.agent || "claude")
      });
      if (opened.error) return asJson(opened, 400);
      follow(device.fingerprint, opened.name);
      log(`session ${opened.name} opened by ${device.name}`);
      return asJson(opened);
    }

    const seat = path.match(/^\/api\/sessions\/([^/]+)(\/[a-z]+)?$/);
    if (seat) {
      const name = decodeURIComponent(seat[1]);
      const leaf = seat[2] || "";
      if (!isSeatName(name)) return asJson({ error: "that is not a name a seat can have" }, 400);
      if (device.kind === "peer" && !grants.allows(name, device.fingerprint)) {
        return asJson({ error: "that seat's keyboard is not lent to you" }, 403);
      }

      if (!leaf && method === "GET") {
        const one = await sessions.one(name);
        if (one.error) return asJson(one, 404);
        follow(device.fingerprint, name);
        return asJson(one);
      }
      if (!leaf && method === "DELETE") return asJson(await sessions.close(name));

      if (leaf === "/events" && method === "GET") {
        const from = Number(query?.get("from") || 0);
        const held = sessions.history(name, Number.isFinite(from) && from > 0 ? from : 0, {
          window: windowAsked(query),
          turns: Number(query?.get("turns")) || 0,
          before: Number(query?.get("before")) || 0
        });
        if (held.error) return asJson(held, 400);
        follow(device.fingerprint, name);
        return asJson(held);
      }

      if (method !== "POST") return asJson({ error: "no such route" }, 404);
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }

      if (leaf === "/command") {
        const kind = String(asked.type || "");
        if (!kind) return asJson({ ok: false, error: "a command needs a type" }, 400);
        if (device.kind === "peer" && !LENT_COMMANDS.has(kind)) {
          return asJson({ ok: false, error: `a lent keyboard types, it does not "${kind}"` }, 403);
        }
        follow(device.fingerprint, name);
        const said = await sessions.command(name, asked);
        return asJson(said, said.ok ? 200 : 409);
      }

      if (leaf === "/say") {
        follow(device.fingerprint, name);
        const said = await sessions.command(name, { type: "say", text: String(asked.text || ""), images: Array.isArray(asked.images) ? asked.images : [] });
        return asJson(said, said.ok ? 200 : 409);
      }
      if (leaf === "/answer") {
        follow(device.fingerprint, name);
        const said = await sessions.command(name, { type: "answer", text: String(asked.text || "") });
        return asJson(said, said.ok ? 200 : 409);
      }
      if (leaf === "/interrupt") {
        const said = await sessions.command(name, { type: "interrupt" });
        return asJson(said, said.ok ? 200 : 409);
      }
      return asJson({ error: "no such route" }, 404);
    }

    if (path === "/api/peers" && method === "GET") {
      return asJson({
        peers: peers.all.map((one) => ({ fingerprint: one.fingerprint, url: one.url, name: one.name, knownAt: one.knownAt, misses: peers.misses(one.fingerprint) })),
        me: { key: me.publicSsh, fingerprint: me.fingerprint, url: myUrl() }
      });
    }

    if (path === "/api/peers/forget" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch {}
      const fingerprint = String(asked.fingerprint || "");
      const done = peers.forget(fingerprint);
      if (!done.forgotten) return asJson({ error: "no peer with that key" }, 404);
      for (const key of [...peerWatchers.keys()]) if (key.startsWith(`${fingerprint}/`)) peerWatchers.delete(key);
      roster.revoke(fingerprint);
      hub.forget(fingerprint);
      log(`peer ${asked.fingerprint} forgotten`);
      return asJson({ forgotten: true });
    }

    if (path === "/api/invites" && method === "GET") {
      const live = peers.invites.filter((one) => !one.usedAt && one.expiresAt > now());
      return asJson({
        invites: live.map((one) => ({
          at: one.at,
          expiresAt: one.expiresAt,
          mine: !!one.mine,
          link: myUrl() ? linkOf({ url: myUrl(), fingerprint: me.fingerprint, token: one.token }) : ""
        })),
        used: peers.invites.filter((one) => one.usedAt).map((one) => ({ at: one.at, usedAt: one.usedAt, by: one.by }))
      });
    }

    if (path === "/api/invites/cancel" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch {}
      const read = readLink(String(asked.link || ""));
      const token = read.error ? String(asked.token || "") : read.token;
      if (!token) return asJson({ error: "no invite named" }, 400);
      const kept = peers.invites.filter((one) => !sameToken(one.token, token));
      if (kept.length === peers.invites.length) return asJson({ error: "no invite by that token" }, 404);
      peers.keepInvites(kept);
      log("invite cancelled");
      return asJson({ cancelled: true });
    }

    if (path === "/api/invites" && method === "POST") {
      if (!myUrl()) return asJson({ error: "this server has no address to invite anyone to — set HIVE_SERVER_URL" }, 409);
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch {}
      const mine = !!asked.mine;
      const opened = openInvite(peers.invites, { url: myUrl(), fingerprint: me.fingerprint, now: now(), mine });
      peers.keepInvites(opened.invites);
      log(mine ? "invite opened for another machine of mine" : "invite opened");
      return asJson({ link: opened.link, expiresAt: opened.invite.expiresAt });
    }

    if (path === "/api/join" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const read = readLink(String(asked.link || ""));
      if (read.error) return asJson(read, 400);
      if (read.fingerprint === me.fingerprint) return asJson({ error: "that invite is this server's own" }, 400);

      const theirs = createBrokerClient({ url: read.url, identity: me, audience: read.fingerprint, fetchImpl });
      let said = null;
      try {
        said = await theirs.post("/api/invites/redeem", { token: read.token, key: me.publicSsh, url: myUrl(), name: myName() });
      } catch (wrong) {
        return asJson({ error: `could not reach ${read.url}: ${wrong.message}` }, 502);
      }
      if (!said.ok) return asJson({ error: said.error }, said.status || 502);

      const made = peerOf({ url: read.url, publicSsh: said.body?.key || "", name: said.body?.name || "", now: now() });
      if (made.error) return asJson(made, 502);
      if (made.peer.fingerprint !== read.fingerprint) return asJson({ error: "that server answered with a key the link did not promise" }, 502);
      adoptPeer(made.peer, { mine: !!asked.mine });
      log(`joined ${made.peer.name || made.peer.fingerprint}${asked.mine ? " as another machine of mine" : ""}`);
      return asJson({ joined: true, peer: { fingerprint: made.peer.fingerprint, url: made.peer.url, name: made.peer.name } });
    }

    if (path === "/api/peer-panel" && method === "POST") {
      if (device.kind !== "peer") return asJson({ error: "only a paired server sends a peer panel" }, 403);
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const took = peers.take(device.fingerprint, asked.panel ?? null);
      if (!took.ok) return asJson(took, 403);
      seatsSeen.set(device.fingerprint, Array.isArray(asked.panel?.sessions) ? asked.panel.sessions : []);
      hub.broadcast(envelopeOf({ kind: "panel", from: device.fingerprint, at: now() }));
      return asJson({ ok: true });
    }

    if (path === "/api/peer-say" && method === "POST") {
      if (device.kind !== "peer") return asJson({ error: "only a paired server sends a peer message" }, 403);
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const to = String(asked.to || "");
      const kind = asked.kind || "say";
      if (!to) {
        const owners = roster.owners();
        if (!owners.length) return asJson({ ok: false, error: "nobody here keeps notes" }, 404);
        for (const one of owners) {
          hub.deliver(one.fingerprint, envelopeOf({ kind, from: device.fingerprint, to: one.fingerprint, body: asked.body ?? null, at: now() }));
        }
        return asJson({ ok: true, kept: owners.length });
      }
      if (!roster.find(to)) return asJson({ error: "nobody here has that key" }, 404);
      const done = hub.deliver(to, envelopeOf({ kind, from: device.fingerprint, to, body: asked.body ?? null, at: now() }));
      return asJson(done);
    }

    if (path === "/api/peer-note" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const to = String(asked.to || "");
      const kind = String(asked.kind || "");
      if (!kind) return asJson({ error: "a note needs a kind" }, 400);
      const peer = to ? peers.find(to) : peers.all.find((one) => one.name === String(asked.dev || ""));
      if (!peer) return asJson({ error: "we are not paired with that server" }, 404);
      const sent = await peers.send(peer.fingerprint, { kind, body: asked.note ?? null });
      return sent.ok ? asJson({ ok: true, to: peer.fingerprint }) : asJson({ error: sent.error || "the other server did not take it" }, 502);
    }

    const onPeer = path.match(/^\/api\/peers\/([^/]+)\/sessions(?:\/([^/]+))?(\/[a-z]+)?$/);
    if (onPeer) {
      const fingerprint = decodeURIComponent(onPeer[1]);
      if (!/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) return asJson({ error: "that is not a key I can address" }, 400);
      const seat = onPeer[2] ? decodeURIComponent(onPeer[2]) : "";
      const leaf = onPeer[3] || "";
      if (!peers.find(fingerprint)) return asJson({ error: "we are not paired with that server" }, 404);
      if (seat && !isSeatName(seat)) return asJson({ error: "that is not a name a seat can have" }, 400);

      if (!seat && method === "GET") return asJson((await peers.ask(fingerprint, "GET", "/api/sessions")).body ?? { sessions: [] });

      if (seat && !leaf && method === "GET") {
        watchPeerSeat(device.fingerprint, fingerprint, seat);
        const said = await peers.ask(fingerprint, "GET", `/api/sessions/${encodeURIComponent(seat)}`);
        return asJson(said.body ?? { error: said.error }, said.ok ? 200 : (said.status || 502));
      }

      if (seat && leaf === "/events" && method === "GET") {
        watchPeerSeat(device.fingerprint, fingerprint, seat);
        const from = Number(query?.get("from") || 0);
        const said = await peers.ask(fingerprint, "GET", `/api/sessions/${encodeURIComponent(seat)}/events?from=${Number.isFinite(from) && from > 0 ? from : 0}&window=${windowAsked(query)}`);
        return asJson(said.body ?? { error: said.error }, said.ok ? 200 : (said.status || 502));
      }

      if (seat && method === "POST" && ["/say", "/answer", "/interrupt", "/command"].includes(leaf)) {
        let asked = {};
        try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
        watchPeerSeat(device.fingerprint, fingerprint, seat);
        const said = await peers.ask(fingerprint, "POST", `/api/sessions/${encodeURIComponent(seat)}${leaf}`, asked);
        return asJson(said.body ?? { error: said.error }, said.ok ? 200 : (said.status || 502));
      }

      return asJson({ error: "no such route" }, 404);
    }

    if (path === "/api/grants" && method === "GET") {
      grants.sweep();
      return asJson({ grants: grants.all, forMs: GRANT_MS });
    }

    if (path === "/api/grants" && method === "POST") {
      if (device.kind === "peer") return asJson({ error: "a peer does not lend keyboards here" }, 403);
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const seat = String(asked.seat || "");
      const to = String(asked.to || "");
      if (!isSeatName(seat)) return asJson({ error: "that is not a name a seat can have" }, 400);
      if (!peers.find(to) && !roster.find(to)) return asJson({ error: "nobody we know has that key" }, 404);
      const lent = grants.lend(seat, to, Number(asked.forMs) || GRANT_MS);
      log(`keyboard of ${seat} lent to ${peers.find(to)?.name || roster.find(to)?.name || to}`);
      return asJson({ granted: true, grant: lent });
    }

    if (path === "/api/grants/take" && method === "POST") {
      if (device.kind === "peer") return asJson({ error: "a peer does not take keyboards back here" }, 403);
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const seat = String(asked.seat || "");
      if (!isSeatName(seat)) return asJson({ error: "that is not a name a seat can have" }, 400);
      const took = grants.take(seat, String(asked.to || ""));
      if (!took.taken) return asJson({ error: "that seat's keyboard was not lent" }, 404);
      log(`keyboard of ${seat} taken back`);
      return asJson({ taken: took.taken });
    }

    if (path === "/api/spawn" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const prompt = String(asked.prompt || "").trim();
      if (!prompt && !String(asked.name || "").trim()) return asJson({ error: "write the mission or give it a name" }, 400);

      const machine = whoOwnsTheFleet();
      if (!machine) return asJson({ error: "no machine of yours is publishing a fleet right now — open the app on it first" }, 409);

      const wait = askedBirths.open();
      const sent = hub.deliver(machine, envelopeOf({
        kind: "seat-born",
        from: me.fingerprint,
        to: machine,
        body: { id: wait.id, mission: { ...asked, prompt, where: asked.where === "mac" ? "local" : "cloud" } },
        at: now()
      }));
      if (!sent.ok) askedBirths.settle(wait.id, { error: "that machine is not listening right now" });

      const said = await Promise.race([wait.answer, onItsWay(BIRTH_REPLY_MS)]);
      if (said.error) return asJson({ error: said.error }, 502);
      return asJson({ ok: true, id: said.id || wait.id, name: said.name || "" }, 202);
    }

    if (path === "/api/born" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const id = String(asked.id || "");
      if (!id) return asJson({ error: "a new chat needs to say which ask it answers" }, 400);
      const said = asked.error
        ? { error: String(asked.error).slice(0, 240) }
        : { id: String(asked.born || ""), name: String(asked.name || "") };
      return asJson({ took: askedBirths.settle(id, said) });
    }

    if (path === "/api/hive" && method === "GET") {
      return asJson(fleetOf({
        sessions: await sessions.list(),
        rows: hub.board(),
        pod: devOfHost(hostname()) || myName(),
        at: now()
      }));
    }

    if (path === "/api/file" && method === "GET") {
      const said = files.read(query?.get("path"));
      return said.error ? asJson(said, /outside what this server holds/.test(said.error) ? 403 : 404) : asJson(said);
    }

    if (path === "/api/file" && method === "POST") {
      let asked = {};
      try { asked = JSON.parse(body.toString("utf8") || "{}"); } catch { return asJson({ error: "unreadable body" }, 400); }
      const said = files.write(asked.path, asked.data);
      return said.error ? asJson(said, /outside what this server holds/.test(said.error) ? 403 : 400) : asJson(said);
    }

    if (path === "/api/board" && method === "GET") {
      const mineRows = hub.board().map((row) => ({ ...row, name: roster.find(row.fingerprint)?.name || "", peer: false }));
      const theirs = peers.cached().map((row) => ({ ...row, online: false, peer: true }));
      return asJson({ board: [...mineRows, ...theirs].sort((a, b) => b.at - a.at), online: hub.online.length, at: now() });
    }

    return asJson({ error: "no such route" }, 404);
  }

  const http = createServer(async (request, response) => {
    const url = new URL(request.url, "http://broker");
    if (isSyncPath(url.pathname)) return serveSync(sync, request, response, url, { log });
    let body = Buffer.alloc(0);
    try {
      if (request.method !== "GET" && request.method !== "HEAD") body = await readBody(request);
    } catch (wrong) {
      response.writeHead(413, { "content-type": "application/json", connection: "close" });
      response.end(JSON.stringify({ error: wrong.message }));
      request.resume();
      return;
    }
    let out;
    try {
      out = await answer({ method: request.method, path: url.pathname, signedPath: url.pathname + url.search, headers: request.headers, body, query: url.searchParams });
    } catch (wrong) {
      log(`server: ${url.pathname} stumbled — ${wrong.message}`);
      out = asJson({ error: "the broker stumbled on that one" }, 500);
    }
    response.writeHead(out.status, out.headers);
    response.end(out.body);
  });

  const sockets = new WebSocketServer({ noServer: true });

  const AUTH_PARAMS = ["key", "at", "nonce", "signature"];

  const pathAsSigned = (url) => {
    const asked = new URLSearchParams(url.searchParams);
    for (const one of AUTH_PARAMS) asked.delete(one);
    const rest = asked.toString();
    return rest ? `${url.pathname}?${rest}` : url.pathname;
  };

  http.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://broker");
    if (url.pathname === "/terminal") { openTerminal(request, socket, head, url); return; }
    if (url.pathname !== "/stream") { socket.destroy(); return; }
    const verdict = guard.check({
      method: "GET",
      path: "/stream",
      body: Buffer.alloc(0),
      fingerprint: String(url.searchParams.get("key") || ""),
      signature: String(url.searchParams.get("signature") || ""),
      at: String(url.searchParams.get("at") || ""),
      nonce: String(url.searchParams.get("nonce") || "")
    });
    if (!verdict.ok) {
      refused(verdict, { method: "GET", path: url.pathname, fingerprint: String(url.searchParams.get("key") || "") });
      socket.once("finish", () => socket.destroy());
      socket.end(refusalHead(verdict));
      return;
    }
    sockets.handleUpgrade(request, socket, head, (live) => {
      const handle = hub.join(verdict.device.fingerprint, (envelope) => live.send(JSON.stringify(envelope)));
      log(`server: ${verdict.device.name} joined the stream (${handle.backlog} held)`);
      live.send(JSON.stringify(envelopeOf({ kind: "welcome", from: me.fingerprint, to: verdict.device.fingerprint, body: { backlog: handle.backlog }, at: now() })));
      live.on("close", () => hub.leave(handle));
      live.on("error", () => hub.leave(handle));
    });
  });

  function openTerminal(request, socket, head, url) {
    const verdict = guard.check({
      method: "GET",
      path: pathAsSigned(url),
      body: Buffer.alloc(0),
      fingerprint: String(url.searchParams.get("key") || ""),
      signature: String(url.searchParams.get("signature") || ""),
      at: String(url.searchParams.get("at") || ""),
      nonce: String(url.searchParams.get("nonce") || "")
    });
    if (!verdict.ok) {
      refused(verdict, { method: "GET", path: url.pathname, fingerprint: String(url.searchParams.get("key") || "") });
      socket.once("finish", () => socket.destroy());
      socket.end(refusalHead(verdict));
      return;
    }
    if (verdict.device.kind === "peer") {
      socket.once("finish", () => socket.destroy());
      socket.end(refusalHead({ status: 403, error: "a server that came in by invite does not get a terminal" }));
      return;
    }

    const seat = String(url.searchParams.get("seat") || "");
    const readOnly = url.searchParams.get("read") === "1";

    sockets.handleUpgrade(request, socket, head, async (live) => {
      const say = (frame) => { try { live.send(JSON.stringify(frame)); } catch {} };
      const opened = await terminals.open(seatSession, seat, {
        readOnly,
        view: `${seatSession}-view-${randomUUID().slice(0, 8)}`,
        cols: url.searchParams.get("cols"),
        rows: url.searchParams.get("rows"),
        onOutput: (chunk) => { try { live.send(chunk); } catch {} },
        onClose: (why) => { say({ t: "end", why }); try { live.close(); } catch {} }
      });
      if (opened.error) {
        say({ t: "end", why: opened.error });
        try { live.close(); } catch {}
        return;
      }
      log(`server: ${verdict.device.name} opened a terminal on ${seat}${readOnly ? " (read only)" : ""}`);
      say({ t: "open", seat, readOnly, cols: opened.size.cols, rows: opened.size.rows, painted: opened.painted });

      live.on("message", async (raw) => {
        const frame = readFrame(raw);
        if (!frame) return;
        if (frame.kind === "input") await opened.handle.write(frame.text);
        if (frame.kind === "resize") await opened.handle.resize(frame);
      });
      const letGo = () => { opened.handle.close(""); };
      live.on("close", letGo);
      live.on("error", letGo);
    });
  }

  return { http, hub, roster, guard, sessions, seats, peers, grants, sync, followSeatsForThePhone, get phoneRunner() { return phoneRunner; }, identity: me, home: base, stateDir: stateHome, get publicUrl() { return myUrl(); }, answer };
}

export function doorOf(env = process.env) {
  const socket = env.HIVE_BROKER_SOCKET;
  if (socket) return { kind: "socket", socket };
  return { kind: "port", port: Number(env.PORT || 8791), host: env.HIVE_BROKER_BIND || "127.0.0.1" };
}

export function listenOn(http, door) {
  return new Promise((ready, wrong) => {
    http.once("error", wrong);
    if (door.kind === "socket") {
      try { if (existsSync(door.socket)) rmSync(door.socket); } catch {}
      mkdirSync(dirname(door.socket), { recursive: true });
      http.listen(door.socket, () => {
        try { chmodSync(door.socket, 0o600); } catch {}
        ready(door);
      });
      return;
    }
    http.listen(door.port, door.host, () => ready(door));
  });
}

export function keepTheSeatsWrittenDown(broker, { on = process.on.bind(process), leave = process.exit.bind(process), log = console.log } = {}) {
  let going = false;
  const write = async (signal) => {
    if (going) return;
    going = true;
    const wrote = await broker.seats.checkpoint().catch((wrong) => ({ error: String(wrong?.message || wrong) }));
    log(wrote.error ? `server: ${signal} came and the seats were not written down — ${wrote.error}` : `server: ${signal} came, ${wrote.seats} seat(s) written down in ${wrote.file}`);
    leave(0);
  };
  for (const signal of ["SIGTERM", "SIGINT"]) on(signal, () => { write(signal); });
  return write;
}

const runAsCli = process.argv[1] && basename(process.argv[1]) === "server.mjs";
if (runAsCli) {
  const broker = createBroker({ log: (line) => console.log(line) });
  const door = doorOf();
  listenOn(broker.http, door).then(async () => {
    console.log(door.kind === "socket"
      ? `server: socket ${door.socket} — key ${broker.identity.fingerprint}`
      : `server: ${door.host}:${door.port} — key ${broker.identity.fingerprint}`);
    console.log(`server: state in ${broker.home}`);
    broker.followSeatsForThePhone().catch((wrong) => console.log(`sync: the phone will not see this pod's chats — ${wrong.message}`));
    if (!seatWindowsWanted()) return;
    keepTheSeatsWrittenDown(broker);
    keepPushing({
      roots: rootsOf({ hub: hubDir(), workspace: workspaceRoot() }),
      state: join(broker.stateDir, "autopush-state"),
      say: (line) => console.log(`autopush: ${line}`)
    });
    const back = await broker.seats.restore().catch((wrong) => ({ restored: [], skipped: [], error: String(wrong?.message || wrong) }));
    if (back.error) console.log(`server: the seats could not be brought back — ${back.error}`);
    else console.log(`server: ${back.restored.length} seat(s) back, ${back.skipped.length} left behind`);
  }).catch((wrong) => {
    console.error(`server: could not open the door — ${wrong.message}`);
    process.exit(1);
  });
}
