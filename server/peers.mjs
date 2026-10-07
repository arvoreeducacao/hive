import { WebSocket } from "ws";
import { attachStream, createBrokerClient } from "./client.mjs";

export const PUSH_RETRY_STEP = 2000;
export const PUSH_RETRY_CAP = 60000;
export const STALE_MS = 180000;

export function createPeers({
  identity,
  read,
  write,
  fetchImpl = fetch,
  openStream = null,
  onPeerEvent = () => {},
  now = () => Date.now(),
  log = () => {}
} = {}) {
  let held = load();
  const panels = new Map();
  const clients = new Map();
  const failing = new Map();
  const streams = new Map();

  function load() {
    try {
      const parsed = JSON.parse(read() || "null");
      if (parsed && Array.isArray(parsed.peers)) return { peers: parsed.peers, invites: Array.isArray(parsed.invites) ? parsed.invites : [] };
    } catch {}
    return { peers: [], invites: [] };
  }

  function save(next) {
    held = next;
    write(JSON.stringify(next, null, 2));
    return next;
  }


  function streamFor(peer) {
    const known = streams.get(peer.fingerprint);
    if (known && known.url === peer.url) return known.stream;
    try { known?.stream?.stop?.(); } catch {}
    const dial = openStream
      ? () => openStream(peer)
      : () => new WebSocket(createBrokerClient({ url: peer.url, identity, audience: peer.fingerprint, fetchImpl }).streamUrl());
    const stream = attachStream({
      open: dial,
      onEnvelope: (envelope) => onPeerEvent(peer.fingerprint, envelope),
      warn: (why) => log(`peer ${peer.name || peer.fingerprint}: ${why}`)
    });
    streams.set(peer.fingerprint, { url: peer.url, stream });
    return stream;
  }

  function clientFor(peer) {
    const known = clients.get(peer.fingerprint);
    if (known && known.url === peer.url) return known.client;
    const client = createBrokerClient({ url: peer.url, identity, audience: peer.fingerprint, fetchImpl });
    clients.set(peer.fingerprint, { url: peer.url, client });
    return client;
  }

  async function pushTo(peer, panel) {
    const client = clientFor(peer);
    let said = { ok: false, error: "" };
    try {
      said = await client.post("/api/peer-panel", { panel });
    } catch (wrong) {
      said = { ok: false, error: wrong.message };
    }
    if (said.ok) {
      failing.delete(peer.fingerprint);
      return { ok: true };
    }
    const misses = (failing.get(peer.fingerprint) || 0) + 1;
    failing.set(peer.fingerprint, misses);
    if (misses === 3) log(`peer ${peer.name || peer.fingerprint} is not taking the panel — ${said.error}`);
    return { ok: false, error: said.error };
  }

  return {
    get all() { return held.peers; },
    get invites() { return held.invites; },
    misses: (fingerprint) => failing.get(fingerprint) || 0,

    find(fingerprint) {
      return held.peers.find((one) => one.fingerprint === fingerprint) || null;
    },

    listen(fingerprint) {
      const peer = this.find(fingerprint);
      if (!peer) return null;
      return streamFor(peer);
    },

    listening: (fingerprint) => !!streams.get(fingerprint)?.stream?.up,

    async ask(fingerprint, method, path, payload) {
      const peer = this.find(fingerprint);
      if (!peer) return { ok: false, status: 404, error: "we are not paired with that server" };
      try {
        const client = clientFor(peer);
        return method === "GET" ? await client.get(path) : await client.post(path, payload ?? {});
      } catch (wrong) {
        return { ok: false, status: 502, error: wrong.message };
      }
    },

    adopt(peer) {
      if (held.peers.some((one) => one.fingerprint === peer.fingerprint)) {
        save({ ...held, peers: held.peers.map((one) => (one.fingerprint === peer.fingerprint ? { ...one, ...peer } : one)) });
        return { adopted: false, updated: true };
      }
      save({ ...held, peers: [...held.peers, peer] });
      return { adopted: true, updated: false };
    },

    forget(fingerprint) {
      if (!held.peers.some((one) => one.fingerprint === fingerprint)) return { forgotten: false };
      save({ ...held, peers: held.peers.filter((one) => one.fingerprint !== fingerprint) });
      panels.delete(fingerprint);
      clients.delete(fingerprint);
      failing.delete(fingerprint);
      try { streams.get(fingerprint)?.stream?.stop?.(); } catch {}
      streams.delete(fingerprint);
      return { forgotten: true };
    },

    keepInvites(invites) { save({ ...held, invites }); },

    take(fingerprint, panel) {
      if (!this.find(fingerprint)) return { ok: false, error: "we are not paired with that server" };
      panels.set(fingerprint, { panel, at: now() });
      return { ok: true };
    },

    cached() {
      const at = now();
      return [...panels].map(([fingerprint, one]) => ({
        fingerprint,
        name: this.find(fingerprint)?.name || "",
        panel: one.panel,
        at: one.at,
        stale: at - one.at > STALE_MS
      }));
    },

    async publish(panel) {
      const out = await Promise.all(held.peers.map((peer) => pushTo(peer, panel)));
      return { reached: out.filter((one) => one.ok).length, of: held.peers.length };
    },

    stop() {
      for (const held of streams.values()) { try { held.stream.stop(); } catch {} }
      streams.clear();
    },

    async send(fingerprint, envelope) {
      const peer = this.find(fingerprint);
      if (!peer) return { ok: false, error: "we are not paired with that server" };
      try {
        const said = await clientFor(peer).post("/api/peer-say", envelope);
        return said.ok ? { ok: true } : { ok: false, error: said.error };
      } catch (wrong) {
        return { ok: false, error: wrong.message };
      }
    }
  };
}
