import { test } from "node:test";
import assert from "node:assert/strict";
import { askTheDoor, findCloudServer, NO_ADDRESS, reasonOf, withServerLines } from "../lib/cloud-door.mjs";

const KEY = `SHA256:${"a".repeat(43)}`;
const answering = (body, ok = true, status = 200) => async () => ({ ok, status, json: async () => body });

test("a hive with no address to reach is told so, and never invents one out of a name", async () => {
  const never = async () => { throw new Error("the door must not be asked when there is no address"); };
  for (const env of [{}, { HIVE_DEV: "jonas", HIVE_DOOR_DOMAIN: "example.com" }, { HIVE_POD: "ws-jonas-0" }]) {
    const found = await findCloudServer({ env, fetchImpl: never });
    assert.equal(found.url, "", `${JSON.stringify(env)} became an address`);
    assert.equal(found.error, NO_ADDRESS);
  }
});

test("the hive takes its name from the server that answers, not from whoever is typing", async () => {
  const found = await findCloudServer({
    env: { HIVE_SERVER_URL: "https://guardado", HIVE_SERVER_KEY: KEY },
    fetchImpl: answering({ fingerprint: KEY, name: "ws-jonas" })
  });
  assert.equal(found.name, "ws-jonas");
  const unnamed = await findCloudServer({
    env: { HIVE_SERVER_URL: "https://guardado", HIVE_SERVER_KEY: KEY, HIVE_SERVER_NAME: "o que estava escrito" },
    fetchImpl: answering({ fingerprint: KEY })
  });
  assert.equal(unnamed.name, "o que estava escrito", "a server that names nobody leaves what was written down alone");
});

test("the address the door names is only taken when it is a key we can read", async () => {
  assert.deepEqual(await askTheDoor("https://x", { fetchImpl: answering({ fingerprint: KEY }) }), { ok: true, fingerprint: KEY, name: "" });
  assert.equal((await askTheDoor("https://x", { fetchImpl: answering({ fingerprint: "nao-e-chave" }) })).ok, false);
  assert.equal((await askTheDoor("https://x", { fetchImpl: answering({}) })).ok, false);
  assert.equal((await askTheDoor("https://x", { fetchImpl: answering({}, false, 502) })).ok, false);
  assert.equal((await askTheDoor("", {})).ok, false);
});

test("a door that refuses to talk is an error, never a wrong address", async () => {
  const said = await askTheDoor("https://x", { fetchImpl: async () => { throw new Error("connect ECONNREFUSED"); } });
  assert.equal(said.ok, false);
  assert.match(said.error, /ECONNREFUSED/);
});

test("what is written down is confirmed with the door, and kept when it still matches", async () => {
  let asked = 0;
  const found = await findCloudServer({
    env: { HIVE_SERVER_URL: "https://guardado", HIVE_SERVER_KEY: KEY },
    fetchImpl: async () => { asked += 1; return { ok: true, json: async () => ({ fingerprint: KEY }) }; }
  });
  assert.equal(found.found, "kept");
  assert.equal(found.url, "https://guardado");
  assert.equal(found.key, KEY);
  assert.equal(asked, 1, "it has to confirm, or a volume recreated behind it locks the app out forever");
});

test("a pod whose volume was recreated has a new key, and the app takes the new one", async () => {
  const OLD = `SHA256:${"o".repeat(43)}`;
  const NEW = `SHA256:${"n".repeat(43)}`;
  let kept = `HIVE_SERVER_URL=https://hive-jonas.example.com\nHIVE_SERVER_KEY=${OLD}\n`;
  const found = await findCloudServer({
    env: { HIVE_SERVER_URL: "https://hive-jonas.example.com", HIVE_SERVER_KEY: OLD },
    read: () => kept,
    write: (text) => { kept = text; },
    fetchImpl: answering({ fingerprint: NEW })
  });
  assert.equal(found.found, "renewed");
  assert.equal(found.key, NEW);
  assert.match(kept, new RegExp(`HIVE_SERVER_KEY=${NEW}`));
  assert.doesNotMatch(kept, new RegExp(OLD), "the old key has to go, not sit there next to the new one");
});

test("a door that is briefly down does not throw away the key we already had", async () => {
  const found = await findCloudServer({
    env: { HIVE_SERVER_URL: "https://hive-jonas.example.com", HIVE_SERVER_KEY: KEY },
    fetchImpl: async () => { throw new Error("503"); }
  });
  assert.equal(found.found, "kept");
  assert.equal(found.key, KEY);
  assert.match(found.stale, /503/);
});

test("what the door says is written down, so the next boot does not ask again", async () => {
  let kept = "HIVE_OTHER=fica\n";
  const found = await findCloudServer({
    read: () => kept,
    write: (text) => { kept = text; },
    env: { HIVE_SERVER_URL: "https://hive-jonas.example.com" },
    fetchImpl: answering({ fingerprint: KEY })
  });
  assert.equal(found.found, "asked");
  assert.equal(found.url, "https://hive-jonas.example.com");
  assert.equal(found.key, KEY);
  assert.match(kept, /HIVE_OTHER=fica/);
  assert.match(kept, /HIVE_SERVER_URL=https:\/\/hive-jonas\.example\.com/);
  assert.match(kept, new RegExp(`HIVE_SERVER_KEY=${KEY.replace(/[+/]/g, "\\$&")}`));
});

test("writing the address twice leaves one of each line, not two", () => {
  let text = "HIVE_A=1\n";
  text = withServerLines(text, { url: "https://um", key: "SHA256:um" });
  text = withServerLines(text, { url: "https://dois", key: "SHA256:dois" });
  assert.equal((text.match(/HIVE_SERVER_URL=/g) || []).length, 1);
  assert.equal((text.match(/HIVE_SERVER_KEY=/g) || []).length, 1);
  assert.match(text, /HIVE_SERVER_URL=https:\/\/dois/);
  assert.match(text, /HIVE_A=1/);
});



test("a door that does not answer leaves nothing written down", async () => {
  let kept = "HIVE_A=1\n";
  const found = await findCloudServer({
    env: { HIVE_SERVER_URL: "https://hive-jonas.example.com" },
    read: () => kept,
    write: (text) => { kept = text; },
    fetchImpl: async () => { throw new Error("timeout"); }
  });
  assert.match(found.error, /timeout/);
  assert.equal(kept, "HIVE_A=1\n", "it wrote an address it could not confirm");
});

test("the dns miss of a door nobody opened survives node's fetch, which only says it failed", async () => {
  const wrapped = new Error("fetch failed");
  wrapped.cause = Object.assign(new Error("getaddrinfo ENOTFOUND hive-ada.hive.example"), { code: "ENOTFOUND" });
  const said = await askTheDoor("https://hive-ada.hive.example", { fetchImpl: async () => { throw wrapped; } });
  assert.equal(said.ok, false);
  assert.match(said.error, /ENOTFOUND hive-ada\.hive\.example/,
    "without the cause the reader cannot tell a closed door from a door that was never opened");
});

test("a reason with nothing under it is not repeated twice", () => {
  assert.equal(reasonOf(new Error("connect ECONNREFUSED")), "connect ECONNREFUSED");
  const same = new Error("boom");
  same.cause = new Error("boom");
  assert.equal(reasonOf(same), "boom");
});
