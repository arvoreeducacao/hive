import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(REPO, path), "utf8");

const dockerfile = read("infra/docker/workspace.Dockerfile");
const boot = read("infra/docker/workspace-boot.sh");
const compose = read("infra/docker/compose.yaml");

const BOOT_ONCE_INSTALLED = ["tmux", "git", "curl", "ripgrep", "procps", "locales", "openssh-server", "mosh", "netcat-openbsd"];

test("the image runs the one boot script", () => {
  assert.match(dockerfile, /COPY infra\/docker\/workspace-boot\.sh \/usr\/local\/bin\/workspace-boot/);
  assert.match(dockerfile, /CMD \["\/usr\/local\/bin\/workspace-boot"\]/);
});

test("the boot installs nothing — that is what drifted between pods", () => {
  assert.doesNotMatch(boot, /apt-get/);
  assert.doesNotMatch(boot, /npm install -g/);
  assert.doesNotMatch(boot, /run_retry/);
});

test("everything the boot used to install is pinned in the image instead", () => {
  for (const pkg of BOOT_ONCE_INSTALLED) assert.ok(dockerfile.includes(pkg), `${pkg} left the boot without reaching the image`);
  assert.match(dockerfile, /apt-get install -y -qq gh\b/);
  assert.match(dockerfile, /@anthropic-ai\/claude-code@\$\{CLAUDE_CODE_VERSION\}/);
});

test("the pins are exact, so two builds a week apart are the same machine", () => {
  assert.match(dockerfile, /^FROM \S+\/node:\d+\.\d+\.\d+-bookworm$/m);
  assert.match(dockerfile, /^ARG CLAUDE_CODE_VERSION=\d+\.\d+\.\d+$/m);
});

test("the base image comes from the mirror, because the docker hub quota is shared by the whole org", () => {
  assert.match(dockerfile, /^FROM public\.ecr\.aws\//m);
});

test("the sshd rules the boot used to patch are baked in", () => {
  assert.match(dockerfile, /AuthorizedKeysFile \/workspace\/home\/\.ssh\/authorized_keys/);
  assert.match(dockerfile, /PasswordAuthentication no/);
  assert.match(dockerfile, /PermitRootLogin prohibit-password/);
  assert.doesNotMatch(boot, /sshd_config/);
});

test("a copy of the cli left on the volume is removed, or the image pin means nothing", () => {
  const removal = boot.indexOf("npm rm -g @anthropic-ai/claude-code");
  const check = boot.indexOf('command -v "$tool"');
  assert.ok(removal > 0, "nothing removes the shadowing copy");
  assert.ok(check > removal, "the tool check runs before the removal and would find the volume copy");
});

test("a shell dropped into the box with docker exec lands where the credentials live, not in root's own home", () => {
  assert.match(dockerfile, /^ENV HOME=\/workspace\/home$/m);
  assert.match(boot, /^export HOME=\/workspace\/home$/m);
});

test("the boot takes the ssh key from the environment, and skips sshd when nobody gave one", () => {
  assert.match(boot, /if \[ -n "\$\{HIVE_SSH_PUBKEY:-\}" \]/);
  assert.doesNotMatch(boot, /DEV_SSH_PUBKEY/);
});

test("compose puts up one box, not two that have to find each other", () => {
  assert.match(compose, /dockerfile: infra\/docker\/workspace\.Dockerfile/);
  assert.doesNotMatch(compose, /dockerfile: server\/Dockerfile/, "the second image is gone — the box that answers is the one with the tools");
  assert.equal(compose.match(/- workspace:\/workspace/g)?.length, 1);
  assert.equal((compose.slice(compose.indexOf("services:"), compose.indexOf("\nvolumes:")).match(/^ {2}[a-z][\w-]*:$/gm) || []).length, 1, "more than one service means more than one box again");
  assert.doesNotMatch(compose, /kubectl|dkr\.ecr|arvore/);
});

test("compose runs anywhere: no value in it is one only we could supply", () => {
  for (const hit of compose.matchAll(/\$\{([A-Z_]+)(:-[^}]*)?\}/g)) {
    assert.ok(hit[2] !== undefined, `${hit[1]} has no default, so compose up fails on a machine that never heard of us`);
  }
});
