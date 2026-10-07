import { createBrokerClient } from "../../server/client.mjs";
import { loadIdentity } from "./hive-identity.mjs";

export const CLOUD = "cloud";

export function createServers({ home, identity = null, fetchImpl = fetch } = {}) {
  const me = identity || loadIdentity(home);
  const held = new Map();

  return {
    get identity() { return me; },

    async remote(where, { url, audience }) {
      if (!url || !audience) return null;
      const known = held.get(where);
      if (known && known.url === url && known.audience === audience) return known;
      const one = { where, client: createBrokerClient({ url, identity: me, audience, fetchImpl }), audience, url };
      held.set(where, one);
      return one;
    },

    forget(where) { held.delete(where); },

    stop() { held.clear(); }
  };
}
