import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { nameTheServerDir } from "../server.mjs";

test("a server started without docker tells its chats where the engine is", () => {
  const env = {};
  const dir = nameTheServerDir(env);
  assert.equal(env.HIVE_SERVER_DIR, dir);
  assert.ok(existsSync(join(dir, "engine", "driver.mjs")), "the named folder holds the engine the app looks for");
});

test("a server whose image already names the folder keeps that name", () => {
  const env = { HIVE_SERVER_DIR: "/app/server" };
  assert.equal(nameTheServerDir(env, "/elsewhere"), "/app/server");
});
