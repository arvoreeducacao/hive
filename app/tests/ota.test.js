const test = require("node:test");
const assert = require("node:assert/strict");
const { createPublicKey, generateKeyPairSync, sign } = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const {
  RELEASE_KEY,
  sdkAgreement,
  shellTree,
  shellPrint,
  packOf,
  signatureOf,
  verifyPack,
  jsRootOf,
  readCurrent,
  pickJsRoot,
  signingTeam,
  unpackPackScript,
  sweepJsScript
} = require("../main/ota.js");

const { updatePicked, releasesQuery } = require("../main/update.js");

const disk = { readdirSync, readFileSync, statSync };

function aRepo() {
  const root = mkdtempSync(join(tmpdir(), "hive-ota-"));
  mkdirSync(join(root, "app", "main"), { recursive: true });
  mkdirSync(join(root, "app", "assets"), { recursive: true });
  mkdirSync(join(root, "app", "lib"), { recursive: true });
  mkdirSync(join(root, "server"), { recursive: true });
  writeFileSync(join(root, "app", "main.js"), "the shell\n");
  writeFileSync(join(root, "app", "boot.html"), "<html></html>\n");
  writeFileSync(join(root, "app", "package.json"), "{}\n");
  writeFileSync(join(root, "app", "package-lock.json"), "{}\n");
  writeFileSync(join(root, "app", "main", "update.js"), "module.exports = {};\n");
  writeFileSync(join(root, "app", "assets", "icon.icns"), "icon\n");
  writeFileSync(join(root, "app", "assets", "i18n.mjs"), "export const words = {};\n");
  writeFileSync(join(root, "app", "lib", "fleet.mjs"), "export const a = 1;\n");
  writeFileSync(join(root, "app", "server.mjs"), "the server\n");
  writeFileSync(join(root, "server", "package.json"), "{}\n");
  writeFileSync(join(root, "server", "package-lock.json"), "{}\n");
  return root;
}

test("the shell print covers the files the bundle seals and nothing else", () => {
  const root = aRepo();
  const listed = shellTree(root, disk);
  assert.deepEqual(listed, [
    "app/assets/icon.icns",
    "app/boot.html",
    "app/main.js",
    "app/main/update.js",
    "app/package-lock.json",
    "app/package.json",
    "server/package-lock.json",
    "server/package.json"
  ]);
  assert.ok(!listed.includes("app/server.mjs"));
  assert.ok(!listed.includes("app/lib/fleet.mjs"));
  assert.ok(!listed.includes("app/assets/i18n.mjs"), "the words on the screen travel in the pack, not in the shell");
});

test("a change in the shell moves the print, a change in the shipped javascript does not", () => {
  const root = aRepo();
  const before = shellPrint(root, disk);

  writeFileSync(join(root, "app", "server.mjs"), "the server, fixed\n");
  writeFileSync(join(root, "app", "lib", "fleet.mjs"), "export const a = 2;\n");
  writeFileSync(join(root, "app", "assets", "i18n.mjs"), "export const words = { a: 1 };\n");
  assert.equal(shellPrint(root, disk), before, "javascript that travels in the pack must not rename the pack");

  writeFileSync(join(root, "app", "package-lock.json"), '{"a":1}\n');
  assert.notEqual(shellPrint(root, disk), before, "a new dependency has to force the full build");
});

test("a new file under the shell trees moves the print", () => {
  const root = aRepo();
  const before = shellPrint(root, disk);
  writeFileSync(join(root, "app", "main", "ota.js"), "module.exports = {};\n");
  assert.notEqual(shellPrint(root, disk), before);
});

test("the print is stable across two reads of the same tree", () => {
  const root = aRepo();
  assert.equal(shellPrint(root, disk), shellPrint(root, disk));
  assert.match(shellPrint(root, disk), /^[0-9a-f]{12}$/);
});

test("the pack is named after the shell it needs", () => {
  assert.equal(packOf("ad5a7c8395c1"), "hive-js-ad5a7c8395c1.tar.gz");
  assert.equal(signatureOf(packOf("ad5a7c8395c1")), "hive-js-ad5a7c8395c1.tar.gz.sig");
  assert.equal(packOf(""), "", "a build with no print asks for no pack");
  assert.equal(signatureOf(""), "");
});

test("only the key this Hive was built with can hand it javascript", () => {
  const mine = generateKeyPairSync("ed25519");
  const theirs = generateKeyPairSync("ed25519");
  const bytes = Buffer.from("a pack of javascript");
  const key = mine.publicKey.export({ type: "spki", format: "pem" });

  assert.equal(verifyPack({ bytes, signature: sign(null, bytes, mine.privateKey), key }), true);
  assert.equal(verifyPack({ bytes, signature: sign(null, bytes, theirs.privateKey), key }), false);
  assert.equal(verifyPack({ bytes: Buffer.from("tampered"), signature: sign(null, bytes, mine.privateKey), key }), false);
  assert.equal(verifyPack({ bytes, signature: sign(null, bytes, mine.privateKey), key: "" }), false, "no key at all accepts nothing");
  assert.equal(verifyPack({ bytes, signature: Buffer.alloc(0), key }), false);
  assert.equal(verifyPack({ bytes, signature: sign(null, bytes, mine.privateKey), key: "not a key" }), false);
});

test("the app carries a real public key, and never the half that signs", () => {
  assert.ok(RELEASE_KEY.includes("BEGIN PUBLIC KEY"), "with no key in the bundle no pack would ever install");
  assert.ok(!RELEASE_KEY.includes("PRIVATE"), "the half that signs must never travel in something everyone installs");
  assert.doesNotThrow(() => createPublicKey(RELEASE_KEY), "the key in the bundle has to parse, or every update dies at the check");
});

test("the root is only taken when the pack was cut for this shell", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-home-"));
  const tag = "hive-2026.08.27-abcdef12";
  const root = jsRootOf(home, tag);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "server.mjs"), "the server\n");

  const current = { tag, print: "aaaaaaaaaaaa" };
  assert.equal(pickJsRoot({ home, print: "aaaaaaaaaaaa", current, exists: existsSync }), root);
  assert.equal(pickJsRoot({ home, print: "bbbbbbbbbbbb", current, exists: existsSync }), "", "a shell that moved on ignores the pack");
  assert.equal(pickJsRoot({ home, print: "", current, exists: existsSync }), "");
  assert.equal(pickJsRoot({ home, print: "aaaaaaaaaaaa", current: { tag: "", print: "aaaaaaaaaaaa" }, exists: existsSync }), "");
  assert.equal(
    pickJsRoot({ home, print: "aaaaaaaaaaaa", current: { tag: "hive-2026.08.27-99999999", print: "aaaaaaaaaaaa" }, exists: existsSync }),
    "",
    "a pointer to a root that was swept away falls back to the bundle"
  );
});

test("a pack older than the app that shipped is left on disk and the shipped code runs", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-home-"));
  const tag = "hive-2026.10.06-1eead3c5";
  const root = jsRootOf(home, tag);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "server.mjs"), "the server\n");
  writeFileSync(join(root, "app", "build.json"), JSON.stringify({ release: 970, shell: "6eb159323ceb" }));
  const current = { tag, print: "6eb159323ceb" };
  const pick = (shipped) => pickJsRoot({ home, print: "6eb159323ceb", current, exists: existsSync, shipped, read: readFileSync });
  assert.equal(pick(975), "", "release 975 came with the app, so pack 970 would run older code than what is installed");
  assert.equal(pick(970), root, "the same release is the pack the app already trusts");
  assert.equal(pick(968), root, "a pack newer than the app is the point of the pack");
  assert.equal(pick(0), root, "an app that does not know its own release keeps the old rule");
  writeFileSync(join(root, "app", "build.json"), "{}");
  assert.equal(pick(975), root, "a pack that does not say its release keeps the old rule");
});

test("a rejected pointer reads as no pack at all", () => {
  const held = { "/tmp/current.json": JSON.stringify({ rejected: "/somewhere", why: "it never answered" }) };
  const current = readCurrent("/tmp/current.json", (file) => held[file]);
  assert.deepEqual(current, { tag: "", print: "", sha: "" });
  assert.equal(pickJsRoot({ home: "/tmp", print: "aaaaaaaaaaaa", current, exists: () => true }), "");
});

test("a pointer file that is not json reads as no pack at all", () => {
  const current = readCurrent("/tmp/nope.json", () => { throw new Error("no such file"); });
  assert.deepEqual(current, { tag: "", print: "", sha: "" });
});

test("a tag with a slash in it cannot walk out of the js folder", () => {
  assert.equal(jsRootOf("/home/.hive", "../../etc"), "/home/.hive/js/______etc");
  assert.equal(jsRootOf("/home/.hive", "/etc/passwd"), "/home/.hive/js/_etc_passwd");
  assert.equal(jsRootOf("/home/.hive", "hive-2026.08.27-abcdef12"), "/home/.hive/js/hive-2026_08_27-abcdef12");
  for (const tag of ["../../etc", "/etc/passwd", "a/b", "..", ".", "", "~", "./."]) {
    assert.ok(jsRootOf("/home/.hive", tag).startsWith("/home/.hive/js/"), `${tag} escaped`);
  }
});

test("unpacking links the dependencies that stayed in the bundle", () => {
  const script = unpackPackScript({
    pack: "/home/.hive/updates/tag/hive-js-abc.tar.gz",
    into: "/home/.hive/js/tag",
    shipped: "/Applications/Hive.app/Contents/Resources/app"
  });
  assert.match(script, /^rm -rf '\/home\/\.hive\/js\/tag'$/m);
  assert.match(script, /^tar -xzf '\/home\/\.hive\/updates\/tag\/hive-js-abc\.tar\.gz' -C '\/home\/\.hive\/js\/tag'$/m);
  assert.match(script, /^test -f '\/home\/\.hive\/js\/tag\/app\/server\.mjs'$/m);
  assert.match(script, /ln -sfn '\/Applications\/Hive\.app\/Contents\/Resources\/app\/node_modules' '\/home\/\.hive\/js\/tag\/app\/node_modules'/);
  assert.match(script, /ln -sfn '\/Applications\/Hive\.app\/Contents\/Resources\/server\/node_modules' '\/home\/\.hive\/js\/tag\/server\/node_modules'/);
});

test("a path with a quote in it reaches the shell as one argument", () => {
  const script = unpackPackScript({ pack: "/tmp/it's here/p.tar.gz", into: "/tmp/out", shipped: "/tmp/app" });
  assert.match(script, /'\/tmp\/it'\\''s here\/p\.tar\.gz'/);
});

test("the sweep keeps the root in use and the pointer beside it", () => {
  const script = sweepJsScript({ home: "/home/.hive", keep: ["hive-2026.08.27-abcdef12", "current.json"] });
  assert.match(script, /-name 'hive-2026\.08\.27-abcdef12' -o -name 'current\.json'/);
  assert.match(script, /find '\/home\/\.hive\/js'/);
});

test("the sweep spares a release a live seat still runs from", { skip: process.platform === "win32" }, async () => {
  const home = mkdtempSync(join(tmpdir(), "hive-sweep-"));
  for (const tag of ["hive-new", "hive-held", "hive-gone"]) mkdirSync(join(home, "js", tag, "server", "engine"), { recursive: true });
  writeFileSync(join(home, "js", "current.json"), "{}");
  const seat = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)", join(home, "js", "hive-held", "server", "engine", "driver.mjs")], { stdio: "ignore" });
  try {
    await new Promise((resolve) => seat.once("spawn", resolve));
    const swept = spawnSync("bash", ["-c", sweepJsScript({ home, keep: ["hive-new", "current.json"] })], { encoding: "utf8" });
    assert.equal(swept.status, 0);
    assert.deepEqual(readdirSync(join(home, "js")).sort(), ["current.json", "hive-held", "hive-new"]);
  } finally {
    seat.kill();
  }
});

const release = (tag, assets, at) => ({
  tag_name: tag,
  name: "Hive 500",
  published_at: at,
  body: "### fixed\n- Something.\n",
  assets: assets.map((name) => ({ name, url: `https://api.github.com/assets/${name}`, size: 4096 }))
});

const PACK = "hive-js-ad5a7c8395c1.tar.gz";

test("the pack wins when its release is the newest one", () => {
  const found = updatePicked(
    [
      release("hive-2026.08.27-cccccccc", [PACK, `${PACK}.sig`], "2026-08-27T15:00:00Z"),
      release("hive-2026.08.26-aaaaaaaa", ["Hive-arm64.zip"], "2026-08-26T15:00:00Z")
    ],
    "bbbbbbbb",
    { pack: PACK, bundle: "Hive-arm64.zip" }
  );
  assert.equal(found.via, "pack");
  assert.equal(found.asset, PACK);
  assert.equal(found.signature, `${PACK}.sig`);
  assert.match(found.signatureUrl, /hive-js-ad5a7c8395c1\.tar\.gz\.sig$/);
});

test("a pack with no signature beside it is not a pack", () => {
  const found = updatePicked(
    [
      release("hive-2026.08.27-cccccccc", [PACK], "2026-08-27T15:00:00Z"),
      release("hive-2026.08.26-aaaaaaaa", ["Hive-arm64.zip"], "2026-08-26T15:00:00Z")
    ],
    "bbbbbbbb",
    { pack: PACK, bundle: "Hive-arm64.zip" }
  );
  assert.equal(found.via, "release");
  assert.equal(found.asset, "Hive-arm64.zip");
});

test("a shell that moved on takes the full build", () => {
  const found = updatePicked(
    [
      release("hive-2026.08.27-cccccccc", ["hive-js-999999999999.tar.gz", "hive-js-999999999999.tar.gz.sig", "Hive-arm64.zip"], "2026-08-27T15:00:00Z"),
      release("hive-2026.08.26-aaaaaaaa", [PACK, `${PACK}.sig`], "2026-08-26T15:00:00Z")
    ],
    "bbbbbbbb",
    { pack: PACK, bundle: "Hive-arm64.zip" }
  );
  assert.equal(found.via, "release", "the newest release is for another shell, so the bundle is the only way across");
  assert.equal(found.tag, "hive-2026.08.27-cccccccc");
});

test("the same release carrying both hands over the cheap one", () => {
  const found = updatePicked(
    [release("hive-2026.08.27-cccccccc", [PACK, `${PACK}.sig`, "Hive-arm64.zip"], "2026-08-27T15:00:00Z")],
    "bbbbbbbb",
    { pack: PACK, bundle: "Hive-arm64.zip" }
  );
  assert.equal(found.via, "pack");
});

test("with nothing to take it says so", () => {
  assert.equal(updatePicked([], "bbbbbbbb", { pack: PACK, bundle: "Hive-arm64.zip" }), null);
  assert.equal(
    updatePicked([release("hive-2026.08.27-cccccccc", ["Hive-x86_64.rpm"], "2026-08-27T15:00:00Z")], "b", { pack: PACK, bundle: "Hive-arm64.zip" }),
    null
  );
});

test("a build with no print never looks for a pack", () => {
  const found = updatePicked(
    [release("hive-2026.08.27-cccccccc", [PACK, `${PACK}.sig`, "Hive-arm64.zip"], "2026-08-27T15:00:00Z")],
    "bbbbbbbb",
    { pack: "", bundle: "Hive-arm64.zip" }
  );
  assert.equal(found.via, "release");
});

test("a build with no commit under it is never stamped", () => {
  const room = mkdtempSync(join(tmpdir(), "hive-stamp-"));
  const main = join(room, "app", "main");
  mkdirSync(main, { recursive: true });
  for (const file of ["stamp.mjs", "ota.js"]) writeFileSync(join(main, file), readFileSync(join(__dirname, "..", "main", file)));
  const run = spawnSync(process.execPath, [join(main, "stamp.mjs")], { env: { PATH: "", HOME: process.env.HOME }, encoding: "utf8" });
  assert.equal(run.status, 1, "with no git to name the commit the stamp has to refuse");
  assert.match(run.stderr, /will not name the commit/);
  assert.equal(existsSync(join(room, "app", "build.json")), false, "a refused stamp must never leave a build.json with an empty commit");
});

test("a release repository with no name is never asked for releases", () => {
  assert.equal(releasesQuery("acme/hive"), "repos/acme/hive/releases?per_page=100");
  for (const nameless of [undefined, null, "", "   ", "undefined", "acme", "a/b/c", "a b/c"]) {
    assert.equal(releasesQuery(nameless), "", `${nameless} is not a repository, and asking for it 404s in silence`);
  }
});

function aStamp(team) {
  const root = mkdtempSync(join(tmpdir(), "hive-stamp-"));
  writeFileSync(join(root, "build.json"), `${JSON.stringify({ sha: "abc", team, shell: "deadbeef" })}\n`);
  return root;
}

test("the pack of js carries no team of its own, so the team comes from the shell that is installed", () => {
  const shipped = aStamp("62BZJX9R58");
  const pack = aStamp("");
  assert.equal(signingTeam({ here: pack, shipped, read: readFileSync }), "62BZJX9R58");
});

test("a team stamped on the running code is the one that counts", () => {
  const shipped = aStamp("SHELLTEAM1");
  const here = aStamp("OWNTEAM123");
  assert.equal(signingTeam({ here, shipped, read: readFileSync }), "OWNTEAM123");
});

test("with no stamp anywhere the team is empty, and the download is refused rather than trusted", () => {
  const here = mkdtempSync(join(tmpdir(), "hive-stamp-"));
  assert.equal(signingTeam({ here, shipped: here, read: readFileSync }), "");
  assert.equal(signingTeam({ here, shipped: "", read: readFileSync }), "");
});

function anSdk(root, { locked, shipped }) {
  if (locked !== undefined) {
    writeFileSync(join(root, "server", "package-lock.json"), JSON.stringify({ packages: { "node_modules/@anthropic-ai/claude-agent-sdk": { version: locked } } }));
  }
  if (shipped !== undefined) {
    const installed = join(root, "server", "node_modules", "@anthropic-ai", "claude-agent-sdk");
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "package.json"), JSON.stringify({ name: "@anthropic-ai/claude-agent-sdk", version: shipped }));
  }
}

test("the shipped sdk agrees with the lockfile only when the two versions match", () => {
  const root = aRepo();
  anSdk(root, { locked: "0.3.257", shipped: "0.3.257" });
  assert.deepEqual(sdkAgreement(root, readFileSync), { locked: "0.3.257", shipped: "0.3.257", agrees: true });
  anSdk(root, { shipped: "0.3.241" });
  assert.deepEqual(sdkAgreement(root, readFileSync), { locked: "0.3.257", shipped: "0.3.241", agrees: false });
});

test("a bundle with no sdk installed, or a lockfile that names none, does not agree", () => {
  const nothingInstalled = aRepo();
  anSdk(nothingInstalled, { locked: "0.3.257" });
  assert.equal(sdkAgreement(nothingInstalled, readFileSync).agrees, false);
  const nothingLocked = aRepo();
  anSdk(nothingLocked, { shipped: "0.3.257" });
  assert.equal(sdkAgreement(nothingLocked, readFileSync).agrees, false);
});

function aBuildRoom({ locked, shipped }) {
  const room = mkdtempSync(join(tmpdir(), "hive-stamp-"));
  const main = join(room, "app", "main");
  mkdirSync(main, { recursive: true });
  mkdirSync(join(room, "server"), { recursive: true });
  for (const file of ["stamp.mjs", "ota.js"]) writeFileSync(join(main, file), readFileSync(join(__dirname, "..", "main", file)));
  anSdk(room, { locked, shipped });
  const git = (...args) => spawnSync("git", ["-C", room, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "a build");
  return { room, main };
}

test("a build whose server/node_modules disagrees with its lockfile is never stamped", () => {
  const { room, main } = aBuildRoom({ locked: "0.3.257", shipped: "0.3.241" });
  const run = spawnSync(process.execPath, [join(main, "stamp.mjs")], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8" });
  assert.equal(run.status, 1, run.stderr);
  assert.match(run.stderr, /0\.3\.241/);
  assert.match(run.stderr, /0\.3\.257/);
  assert.equal(existsSync(join(room, "app", "build.json")), false);
});

test("a build whose sdk agrees with its lockfile is stamped with that version", () => {
  const { room, main } = aBuildRoom({ locked: "0.3.257", shipped: "0.3.257" });
  const run = spawnSync(process.execPath, [join(main, "stamp.mjs")], { env: { PATH: process.env.PATH, HOME: process.env.HOME }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(readFileSync(join(room, "app", "build.json"), "utf8")).sdk, "0.3.257");
});
