import { test } from "node:test";
import assert from "node:assert/strict";
import { hostFolderOf, placeOnHost, shellOnHost } from "../lib/host-folder.mjs";

test("a folder on the host is a whole path, with spaces allowed and control characters refused", () => {
  assert.deepEqual(hostFolderOf(""), { ok: true, folder: "" });
  assert.deepEqual(hostFolderOf(" /Users/ada/My Projects/hub/ "), { ok: true, folder: "/Users/ada/My Projects/hub" });
  assert.deepEqual(hostFolderOf("/srv//app/../hub"), { ok: true, folder: "/srv/hub" });
  assert.deepEqual(hostFolderOf("/"), { ok: true, folder: "/" });
  assert.equal(hostFolderOf("Projects/hub").ok, false);
  assert.equal(hostFolderOf("~/Projects").ok, false);
  assert.equal(hostFolderOf("/srv/a\nb").ok, false);
  assert.equal(hostFolderOf("/" + "a".repeat(2000)).ok, false);
});

test("the folder picked for this chat wins, then the repo asked for, then the folder kept for the host", () => {
  const host = { ssh: true, kept: "/srv/kept", home: "/home/ada", hub: true, hubRepo: "hub" };
  assert.deepEqual(placeOnHost({ ...host, folder: "/srv/picked", repo: "api" }), { cwd: "/srv/picked" });
  assert.deepEqual(placeOnHost({ ...host, repo: "api", branch: "fix" }), { repo: "api", branch: "fix" });
  assert.deepEqual(placeOnHost(host), { cwd: "/srv/kept" });
});

test("a host with nothing picked opens in its hub when it has one, and in the home folder when it does not", () => {
  assert.deepEqual(placeOnHost({ ssh: true, home: "/home/ada", hub: true, hubRepo: "hub" }), { repo: "hub", branch: "" });
  assert.deepEqual(placeOnHost({ ssh: true, home: "/home/ada", hub: false, hubRepo: "hub" }), { cwd: "/home/ada" });
  assert.deepEqual(placeOnHost({ ssh: true, hub: false, hubRepo: "hub" }), { repo: "", branch: "" });
});

test("the team's server never takes a folder: it keeps cloning the repo it was asked for, or the hub", () => {
  assert.deepEqual(placeOnHost({ folder: "/srv/picked", repo: "", branch: "", hubRepo: "hub" }), { repo: "hub", branch: "" });
  assert.deepEqual(placeOnHost({ folder: "/srv/picked", repo: "api", branch: "fix", hubRepo: "hub" }), { repo: "api", branch: "fix" });
});

test("a terminal on a host opens in the chat's folder, then the folder kept for the host, then its home", () => {
  assert.deepEqual(shellOnHost({ cwd: "/srv/hub/api/", ownerCwd: "/srv/hub", kept: "/srv/kept", home: "/home/ada" }), { cwd: "/srv/hub/api" });
  assert.deepEqual(shellOnHost({ cwd: "api", ownerCwd: "/srv/hub", kept: "/srv/kept", home: "/home/ada" }), { cwd: "/srv/hub" });
  assert.deepEqual(shellOnHost({ kept: "/srv/kept", home: "/home/ada" }), { cwd: "/srv/kept" });
  assert.deepEqual(shellOnHost({ home: "/home/ada" }), { cwd: "/home/ada" });
  assert.deepEqual(shellOnHost({ cwd: "/srv/a\nb" }), {});
  assert.deepEqual(shellOnHost(), {});
});
