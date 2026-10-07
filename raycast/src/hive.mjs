import { request } from "node:http";
import { homedir } from "node:os";

export const DEFAULT_SOCKET = "~/.hive/hive.sock";

export function socketPath(asked) {
  const path = String(asked || "").trim() || DEFAULT_SOCKET;
  return path.startsWith("~/") ? `${homedir()}${path.slice(1)}` : path;
}

export function hiveClient(asked, timeout = 15000) {
  const socket = socketPath(asked);
  const call = (method, path, body, raw = false) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? "" : JSON.stringify(body);
      const req = request(
        {
          socketPath: socket,
          path,
          method,
          headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {},
          timeout
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const bytes = Buffer.concat(chunks);
            if (raw) return res.statusCode >= 400 ? reject(new Error(`Hive answered ${res.statusCode}`)) : resolve(bytes);
            const text = bytes.toString("utf8");
            let data = null;
            try { data = JSON.parse(text); } catch { return reject(new Error("Hive answered something that is not JSON — is it up to date?")); }
            if (res.statusCode >= 400 || data?.error) return reject(new Error(data?.error || `Hive answered ${res.statusCode}`));
            resolve(data);
          });
        }
      );
      req.on("timeout", () => req.destroy(new Error("Hive took too long to answer")));
      req.on("error", (wrong) => {
        if (wrong.code === "ENOENT" || wrong.code === "ECONNREFUSED") return reject(new Error("Hive is not running on this Mac"));
        reject(wrong);
      });
      if (payload) req.write(payload);
      req.end();
    });
  return {
    hive: () => call("GET", "/api/hive"),
    shelf: () => call("GET", "/api/shelf"),
    providers: () => call("GET", "/api/providers").then((data) => data.providers || data),
    catalog: (agent) => call("GET", `/api/catalog?agent=${encodeURIComponent(agent)}`),
    thumb: (slug, tab, version) => call("GET", `/api/shelf/thumb?slug=${encodeURIComponent(slug)}&tab=${encodeURIComponent(tab)}&v=${version}`, undefined, true),
    spawn: (body) => call("POST", "/api/spawn", body),
    say: (chat, text) => call("POST", "/api/say", { name: chat.name, where: chat.where, text, push: true }),
    answer: (chat, id, answers) => call("POST", "/api/answer", { name: chat.name, where: chat.where, id, answers })
  };
}

export async function settledName(client, job, { tries = 40, wait = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const hive = await client.hive().catch(() => null);
    const born = hive?.spawning?.find((one) => one.id === job.id);
    if (born?.error) throw new Error(born.error);
    if (born?.settled && born.name) return born.name;
    if (!born && hive?.sessions?.some((seat) => seat.name === job.name)) return job.name;
    await new Promise((next) => setTimeout(next, wait));
  }
  return job.name;
}
