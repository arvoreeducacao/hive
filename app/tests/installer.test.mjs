import { test } from "node:test";
import assert from "node:assert/strict";
import { installCommand, installerFor } from "../doctor/installer.mjs";

const nothing = () => false;
const only = (path) => (one) => one === path;

test("a missing tool is installed with the package manager of the system the app runs on", () => {
  assert.equal(installCommand("tmux", "darwin", nothing), "brew install tmux");
  assert.equal(installCommand("tmux", "linux", only("/usr/bin/dnf")), "sudo dnf install -y tmux");
  assert.equal(installCommand("tmux", "linux", only("/usr/bin/pacman")), "sudo pacman -S --needed tmux");
  assert.equal(installCommand("tmux", "linux", nothing), "sudo apt-get install -y tmux");
});

test("on windows the github cli is asked for by its winget id", () => {
  assert.equal(installCommand("gh", "win32", nothing), "winget install GitHub.cli");
});

test("a linux machine is never told to use homebrew", () => {
  for (const has of [nothing, only("/usr/bin/dnf"), only("/usr/bin/zypper")]) {
    assert.doesNotMatch(installerFor("linux", has), /brew/);
  }
});
