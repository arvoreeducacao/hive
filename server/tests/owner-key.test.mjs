import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { fromAllowedSigners } from "../roster.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(REPO, path), "utf8");

const KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAEYdXE1P1NDRGIoyY90PC7LfyEw2oogwEOFuRhlvshX joao@mac";
const OTHER = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOmrOyxPKYeSlgfZgC+cfHFJBnI0uwKccE3dUEoiGxdi rafael@mac";

test("a key handed over by the environment is read the same way the file is", () => {
  const [one] = fromAllowedSigners(`joao ${KEY}`, { owners: ["joao"] });
  assert.match(one.fingerprint, /^SHA256:/);
  assert.equal(one.publicSsh, KEY);
});

test("the owner key joins the keys already written down, it does not replace them", () => {
  const written = `rafael ${OTHER}`;
  const both = fromAllowedSigners([written, `joao ${KEY}`].join("\n"), { owners: ["joao"] });
  assert.equal(both.length, 2);
  assert.deepEqual(both.map((one) => one.publicSsh).sort(), [KEY, OTHER].sort());
});

test("a key already written down is not adopted twice", () => {
  const written = `joao ${KEY}`;
  const ownerLine = written.includes(KEY) ? "" : `joao ${KEY}`;
  assert.equal(ownerLine, "", "the boot would append a key the file already carries");
});

test("the server reads the owner key from the environment, and only when it is new", () => {
  const boot = read("server/server.mjs");
  assert.match(boot, /HIVE_OWNER_KEY/);
  assert.match(boot, /!written\.includes\(ownerKey\)/, "a restart would keep appending the same key");
  assert.match(boot, /\[written, ownerLine\]\.filter\(Boolean\)/, "the file and the environment have to be read together");
});

test("compose can hand a server its owner", () => {
  assert.match(read("infra/docker/compose.yaml"), /HIVE_OWNER_KEY: \$\{HIVE_OWNER_KEY:-\}/);
});
