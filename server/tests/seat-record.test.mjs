import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSeatServer } from "../engine/seat-core.mjs";

const askOnce = (sock, cmd) => new Promise((done, fail) => {
  const live = createConnection(sock, () => live.write(JSON.stringify(cmd) + "\n"));
  let buf = "";
  live.on("data", (chunk) => {
    buf += chunk;
    const nl = buf.indexOf("\n");
    if (nl < 0) return;
    live.end();
    done(JSON.parse(buf.slice(0, nl)));
  });
  live.on("error", fail);
});

test("a record lands in the transcript as the driver event it carries, whatever agent is behind the seat", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hive-record-"));
  const sock = join(dir, "seat.sock");
  const written = [];
  let seq = 0;
  const handled = [];
  const server = createSeatServer({
    sockFile: sock,
    handleCommand: (cmd, reply) => { handled.push(cmd); reply({ ok: true }); },
    emit: (event) => { written.push(event); return ++seq; }
  });
  try {
    await new Promise((done) => (server.listening ? done() : server.once("listening", done)));
    const note = { type: "driver", subtype: "shell", command: "ls", output: "a\nb", code: 0, ms: 12 };
    const said = await askOnce(sock, { type: "record", event: note });
    assert.deepEqual(said, { ok: true, seq: 1 });
    assert.deepEqual(written, [note]);
    assert.deepEqual(handled, [], "a record is written down, never handed to the agent");
    for (const bad of [{ type: "record" }, { type: "record", event: { type: "user" } }, { type: "record", event: { type: "driver" } }]) {
      assert.equal((await askOnce(sock, bad)).ok, false);
    }
    assert.equal(written.length, 1);
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(dir, { recursive: true, force: true });
  }
});
