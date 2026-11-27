export const OVER_HTTP = "http";
export const CLUSTER = "cluster";
export const NOWHERE = "";

export function reachAsked(env = process.env, config = {}) {
  const asked = String(env.HIVE_REACH ?? config.HIVE_REACH ?? "").trim().toLowerCase();
  return asked === OVER_HTTP || asked === CLUSTER ? asked : "";
}

export function createReach({
  cluster = null,
  serverFor = async () => null,
  asked = reachAsked(),
  pathFor = (path) => path,
  readElsewhere = null
} = {}) {
  async function chosen() {
    if (asked === CLUSTER) return cluster ? { how: CLUSTER, cluster } : { how: NOWHERE };
    const server = await serverFor().catch(() => null);
    if (server) return { how: OVER_HTTP, server };
    if (asked === OVER_HTTP) return { how: NOWHERE };
    return cluster ? { how: CLUSTER, cluster } : { how: NOWHERE };
  }

  return {
    chosen,

    async how() {
      return (await chosen()).how;
    },

    async putFile(path, body) {
      const via = await chosen();
      if (via.how === CLUSTER) return via.cluster.putFile(path, body);
      if (via.how === OVER_HTTP) {
        const there = pathFor(path);
        const said = await via.server.client.post("/api/file", { path: there, data: Buffer.from(body).toString("base64") });
        return said.ok ? { ok: true, path: said.body?.path || there } : { error: said.error || "the server would not take that file" };
      }
      return { error: "there is no server to put that on" };
    },

    async getFile(path) {
      const via = await chosen();
      if (via.how === CLUSTER) return via.cluster.getFile(path);
      if (via.how === OVER_HTTP) {
        const there = pathFor(path);
        const said = await via.server.client.get(`/api/file?path=${encodeURIComponent(there)}`);
        if (said.ok) return { ok: true, path: there, body: Buffer.from(String(said.body?.data || ""), "base64") };
        const other = readElsewhere ? await readElsewhere(there).catch(() => null) : null;
        if (other) return { ok: true, path: there, body: other };
        return { error: said.error || "the server would not hand that file over" };
      }
      return { error: "there is no server to read that from" };
    },

    async terminal({ seat, cols, rows, readOnly = false }) {
      const via = await chosen();
      if (via.how === OVER_HTTP) return { how: OVER_HTTP, url: via.server.client.terminalUrl({ seat, cols, rows, readOnly }) };
      return { error: "there is no server to open a terminal on" };
    }
  };
}
