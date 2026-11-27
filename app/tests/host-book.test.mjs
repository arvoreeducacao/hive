import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostBook, hostIdOf } from "../lib/host-book.mjs";

const bookFile = () => join(mkdtempSync(join(tmpdir(), "hive-hosts-")), "hosts.json");

test("a host is known by the address ssh dials, port included only when one was given", () => {
  assert.deepEqual(hostIdOf("ada@devbox"), { ok: true, id: "ada@devbox", label: "devbox" });
  assert.deepEqual(hostIdOf("  ada@devbox:2222 "), { ok: true, id: "ada@devbox:2222", label: "devbox" });
  assert.equal(hostIdOf("-oProxyCommand=evil").ok, false);
  assert.equal(hostIdOf("").ok, false);
});

test("a host added once is there the next time the hive opens", () => {
  const file = bookFile();
  const added = createHostBook({ file }).add("ada@devbox");
  assert.equal(added.ok, true);
  assert.equal(added.host.id, "ada@devbox");
  assert.deepEqual(createHostBook({ file }).list().map((one) => one.id), ["ada@devbox"]);
  assert.equal(statSync(file).mode & 0o077, 0, "the list of machines is readable by the owner only");
});

test("adding the same host twice keeps one line", () => {
  const book = createHostBook({ file: bookFile() });
  book.add("ada@devbox");
  const again = book.add("ada@devbox");
  assert.equal(again.already, true);
  assert.equal(book.list().length, 1);
});

test("an address ssh would read as an option never reaches the book", () => {
  const file = bookFile();
  const book = createHostBook({ file });
  assert.ok(book.add("-oProxyCommand=evil").error);
  assert.ok(book.add("ada@dev box").error);
  assert.deepEqual(book.list(), []);
});

test("the host used last comes first", () => {
  let clock = 1000;
  const book = createHostBook({ file: bookFile(), now: () => (clock += 1000) });
  book.add("ada@first");
  book.add("ada@second");
  assert.deepEqual(book.list().map((one) => one.label), ["second", "first"]);
  book.touch("ada@first");
  assert.deepEqual(book.list().map((one) => one.label), ["first", "second"]);
});

test("a host written in the config leads the list and cannot be forgotten from the panel", () => {
  const book = createHostBook({ file: bookFile(), seeds: ["ada@seeded"] });
  book.add("ada@typed");
  assert.deepEqual(book.list().map((one) => [one.id, one.seed]), [["ada@seeded", true], ["ada@typed", false]]);
  assert.match(book.forget("ada@seeded").error, /HIVE_SERVER_SSH/);
  assert.equal(book.forget("ada@typed").ok, true);
  assert.deepEqual(book.list().map((one) => one.id), ["ada@seeded"]);
});

test("a seeded host typed again in the panel is not kept twice", () => {
  const file = bookFile();
  const book = createHostBook({ file, seeds: ["ada@seeded"] });
  assert.equal(book.add("ada@seeded").already, true);
  assert.equal(book.list().length, 1);
});

test("forgetting a host nobody added says so", () => {
  assert.match(createHostBook({ file: bookFile() }).forget("ada@nowhere").error, /keeps no host/);
});

test("a book somebody broke by hand reads as empty, and a tampered line is dropped", () => {
  const file = bookFile();
  writeFileSync(file, "{ not json");
  assert.deepEqual(createHostBook({ file }).list(), []);
  writeFileSync(file, JSON.stringify({ hosts: [{ id: "-oProxyCommand=evil" }, { id: "ada@devbox" }] }));
  assert.deepEqual(createHostBook({ file }).list().map((one) => one.id), ["ada@devbox"]);
});

test("the book stops growing at its ceiling", () => {
  const book = createHostBook({ file: bookFile(), ceiling: 2 });
  book.add("ada@one");
  book.add("ada@two");
  assert.match(book.add("ada@three").error, /forget one first/);
});

test("what is written down is the address and two dates, nothing else", () => {
  const file = bookFile();
  createHostBook({ file, now: () => 5 }).add("ada@devbox:2222");
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { hosts: [{ id: "ada@devbox:2222", addedAt: 5, usedAt: 5 }] });
});

test("the folder a host opens chats in is kept with the host, comes back the next time, and leaves with it", () => {
  const file = bookFile();
  const book = createHostBook({ file });
  book.add("ada@devbox");
  assert.equal(book.list()[0].folder, "");
  assert.deepEqual(book.setFolder("ada@devbox", "/home/ada/Projects/hub/"), { ok: true, folder: "/home/ada/Projects/hub" });
  assert.equal(createHostBook({ file }).list()[0].folder, "/home/ada/Projects/hub");
  assert.equal(createHostBook({ file }).folderOf("ada@devbox"), "/home/ada/Projects/hub");
  assert.equal(book.setFolder("ada@devbox", "").ok, true);
  assert.equal(book.folderOf("ada@devbox"), "");
  book.setFolder("ada@devbox", "/srv/app");
  book.forget("ada@devbox");
  assert.equal(JSON.parse(readFileSync(file, "utf8")).folders, undefined);
});

test("a folder is kept for a host written in the config too, and never for a host nobody added", () => {
  const book = createHostBook({ file: bookFile(), seeds: ["ada@seeded"] });
  assert.equal(book.setFolder("ada@seeded", "/srv/hub").ok, true);
  assert.equal(book.list()[0].folder, "/srv/hub");
  assert.match(book.setFolder("ada@nobody", "/srv/hub").error, /no host by that name/);
  assert.match(book.setFolder("ada@seeded", "Projects/hub").error, /whole path/);
  assert.equal(book.folderOf("ada@seeded"), "/srv/hub");
});
