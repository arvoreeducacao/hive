import { request } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

const SOCK = process.env.HIVE_SOCK || join(process.env.HIVE_HOME || join(homedir(), ".hive"), "hive.sock");

function post(body) {
  return new Promise((done) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = request({ socketPath: SOCK, path: "/api/meetings/captions", method: "POST", headers: { "content-type": "application/json", "content-length": data.length }, timeout: 6000 }, (res) => {
      const pieces = [];
      res.on("data", (piece) => pieces.push(piece));
      res.on("end", () => { try { done(JSON.parse(Buffer.concat(pieces).toString("utf8"))); } catch { done({ error: "bad-answer" }); } });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => done({ error: "no-hive" }));
    req.end(data);
  });
}

function send(message) {
  const data = Buffer.from(JSON.stringify(message));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(data.length, 0);
  process.stdout.write(Buffer.concat([head, data]));
}

let held = Buffer.alloc(0);
process.stdin.on("data", async (bytes) => {
  held = Buffer.concat([held, bytes]);
  while (held.length >= 4) {
    const size = held.readUInt32LE(0);
    if (held.length < 4 + size) break;
    const raw = held.subarray(4, 4 + size);
    held = held.subarray(4 + size);
    let asked;
    try { asked = JSON.parse(raw.toString("utf8")); } catch { continue; }
    const { id, ...body } = asked;
    send({ ...(await post(body)), id });
  }
});
process.stdin.on("end", () => process.exit(0));
