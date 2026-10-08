const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pickRepo, runsFromBundle, bundleOf, builtBundle, swapScript, appImageOf, swapAppImage, rpmInstallOf, swapRpm, shaOfTag, numberOf, notesOf, quietOf, updateFromReleases, updatePicked, releasesQuery, releaseOf, notesBetween, downloadScript, verifyScript, unpackScript, unpackedBundle } = require("../main/update.js");

const isRepo = (dirs) => (dir) => dirs.includes(dir);

test("takes the first candidate that is a checkout", () => {
  const repo = pickRepo(["", "/Applications/Hive.app/Contents", "/Users/me/hub/dev-workspaces"], isRepo(["/Users/me/hub/dev-workspaces"]));
  assert.equal(repo, "/Users/me/hub/dev-workspaces");
});

test("says there is no checkout instead of guessing one", () => {
  assert.equal(pickRepo(["/Applications/Hive.app/Contents"], isRepo([])), "");
});

test("knows the app runs from a bundle when it sits outside the checkout", () => {
  assert.equal(runsFromBundle("/Users/me/hub/dev-workspaces/app", "/Users/me/hub/dev-workspaces"), false);
  assert.equal(runsFromBundle("/Applications/Hive.app/Contents/Resources/app", "/Users/me/hub/dev-workspaces"), true);
  assert.equal(runsFromBundle("/Users/me/hub/dev-workspaces/app", ""), true);
});

test("reads the bundle out of the running binary", () => {
  assert.equal(bundleOf("/Applications/Hive.app/Contents/MacOS/Hive"), "/Applications/Hive.app");
  assert.equal(bundleOf("/Users/me/hub/dev-workspaces/app/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"), "/Users/me/hub/dev-workspaces/app/node_modules/electron/dist/Electron.app");
  assert.equal(bundleOf("/usr/local/bin/node"), "");
});

test("finds the freshly built bundle whatever the platform folder is called", () => {
  const exists = (p) => p === "/app/dist/mac-arm64/Hive.app";
  assert.equal(builtBundle("/app/dist", [".icon-icns", "mac-arm64"], exists), "/app/dist/mac-arm64/Hive.app");
  assert.equal(builtBundle("/app/dist", ["builder-debug.yml"], exists), "");
});

test("the swap waits for the app to die, then puts the new bundle in its place", () => {
  const script = swapScript({ from: "/app/dist/mac-arm64/Hive.app", to: "/Applications/Hive.app", pid: 4321 });
  assert.match(script, /kill -0 4321/);
  assert.match(script, /mv '\/Applications\/Hive\.app' '\/Applications\/Hive\.app\.hive-old'/);
  assert.match(script, /ditto '\/app\/dist\/mac-arm64\/Hive\.app' '\/Applications\/Hive\.app'/);
  assert.match(script, /open '\/Applications\/Hive\.app'/);
});

test("the swap leaves no second bundle claiming the scheme", () => {
  const script = swapScript({ from: "/app/dist/mac-arm64/Hive.app", to: "/Applications/Hive.app", pid: 4321 });
  const installed = script.split("\n").find((line) => line.startsWith("if ditto"));
  assert.match(installed, /lsregister' -u '\/app\/dist\/mac-arm64\/Hive\.app'/);
  assert.match(installed, /rm -rf '\/app\/dist\/mac-arm64\/Hive\.app'/);
  assert.match(script, /lsregister' -f '\/Applications\/Hive\.app'/);
});

test("a swap that fails keeps the source it could not install", () => {
  const yard = mkdtempSync(join(tmpdir(), "hive-swap-"));
  const from = join(yard, "built", "Hive.app");
  const to = join(yard, "Applications", "Hive.app");
  mkdirSync(from, { recursive: true });
  mkdirSync(to, { recursive: true });
  writeFileSync(join(from, "what"), "new");
  writeFileSync(join(to, "what"), "old");
  const script = swapScript({ from, to, pid: 0 }).replace(/^ditto |(?<=; )ditto /gm, "false ");
  execFileSync("/bin/bash", ["-c", `ditto() { false; }; open() { :; }; ${script}`], { encoding: "utf8" });
  assert.equal(readFileSync(join(from, "what"), "utf8"), "new", "the source survives a swap that failed");
  assert.equal(readFileSync(join(to, "what"), "utf8"), "old", "the app that was installed is back");
  rmSync(yard, { recursive: true, force: true });
});

test("a swap that works takes the source out of the scheme's way", () => {
  const script = swapScript({ from: "/app/dist/mac-arm64/Hive.app", to: "/Applications/Hive.app", pid: 4321 });
  const gone = script.split("\n").filter((line) => line.includes("rm -rf '/app/dist/mac-arm64/Hive.app'"));
  assert.equal(gone.length, 1, "the source is removed in exactly one place");
  assert.ok(gone[0].startsWith("if ditto"), "the only removal lives in the branch that installed it");
});

test("a staged path that is not a bundle is never handed to rm -rf", () => {
  const script = swapScript({ from: "/Users/me/Documents", to: "/Applications/Hive.app", pid: 4321 });
  assert.ok(!script.includes("rm -rf '/Users/me/Documents'"), "only a .app is cleaned up");
  assert.ok(!script.includes("-u '/Users/me/Documents'"), "and only a .app is unregistered");
});

test("only a running AppImage names itself", () => {
  assert.equal(appImageOf({ APPIMAGE: "/home/me/Apps/Hive-x86_64.AppImage" }), "/home/me/Apps/Hive-x86_64.AppImage");
  assert.equal(appImageOf({ APPIMAGE: "/home/me/Apps/Hive" }), "");
  assert.equal(appImageOf({}), "");
  assert.equal(appImageOf(undefined), "");
});

test("the AppImage swap waits, replaces the file and starts it again", () => {
  const script = swapAppImage({ from: "/tmp/updates/Hive-x86_64.AppImage", to: "/home/me/Apps/Hive-x86_64.AppImage", pid: 4321 });
  assert.match(script, /kill -0 4321/);
  assert.match(script, /mv '\/home\/me\/Apps\/Hive-x86_64\.AppImage' '\/home\/me\/Apps\/Hive-x86_64\.AppImage\.hive-old'/);
  assert.match(script, /cp '\/tmp\/updates\/Hive-x86_64\.AppImage' '\/home\/me\/Apps\/Hive-x86_64\.AppImage'/);
  assert.match(script, /chmod \+x '\/home\/me\/Apps\/Hive-x86_64\.AppImage'/);
  assert.match(script, /setsid '\/home\/me\/Apps\/Hive-x86_64\.AppImage'/);
});

test("only the binary of an rpm install names itself", () => {
  assert.equal(rpmInstallOf("/opt/Hive/hive"), "/opt/Hive/hive");
  assert.equal(rpmInstallOf("/opt/Hive/resources/app/main.js"), "");
  assert.equal(rpmInstallOf("/home/me/Apps/Hive-x86_64.AppImage"), "");
  assert.equal(rpmInstallOf("/usr/local/bin/node"), "");
  assert.equal(rpmInstallOf(""), "");
  assert.equal(rpmInstallOf(undefined), "");
});

test("the rpm swap waits, installs the package with pkexec and starts the app again", () => {
  const script = swapRpm({ from: "/tmp/updates/Hive-x86_64.rpm", exe: "/opt/Hive/hive", pid: 4321 });
  assert.match(script, /kill -0 4321/);
  assert.match(script, /pkexec rpm -U --replacepkgs --oldpackage --replacefiles '\/tmp\/updates\/Hive-x86_64\.rpm'/);
  assert.match(script, /setsid '\/opt\/Hive\/hive'/);
});

test("an rpm install the user cancels still brings the app back", () => {
  const script = swapRpm({ from: "/tmp/Hive-x86_64.rpm", exe: "/opt/Hive/hive", pid: 7 });
  const install = script.split("\n").find((line) => line.startsWith("pkexec"));
  assert.match(install, /\|\| true$/);
  assert.equal(script.split("\n").at(-1), "setsid '/opt/Hive/hive' >/dev/null 2>&1 &");
});

test("an AppImage copy that fails puts the old one back", () => {
  const script = swapAppImage({ from: "/tmp/Hive-x86_64.AppImage", to: "/opt/Hive-x86_64.AppImage", pid: 7 });
  const rescue = script.split("\n").find((line) => line.startsWith("if cp"));
  assert.match(rescue, /else rm -f '\/opt\/Hive-x86_64\.AppImage'; mv '\/opt\/Hive-x86_64\.AppImage\.hive-old' '\/opt\/Hive-x86_64\.AppImage'/);
});

test("a failed copy puts the old bundle back", () => {
  const script = swapScript({ from: "/new/Hive.app", to: "/Applications/Hive.app", pid: 1 });
  const rescue = script.split("\n").find((line) => line.startsWith("if ditto"));
  assert.match(rescue, /else rm -rf '\/Applications\/Hive\.app'; mv '\/Applications\/Hive\.app\.hive-old' '\/Applications\/Hive\.app'/);
});

test("a path with a quote in it cannot break out of the script", () => {
  const script = swapScript({ from: "/tmp/it's here/Hive.app", to: "/Applications/Hive.app", pid: 9 });
  assert.match(script, /'\/tmp\/it'\\''s here\/Hive\.app'/);
  assert.equal(script.includes("; rm -rf /"), false);
});

test("a pid that is not a pid waits a beat instead of becoming shell", () => {
  const script = swapScript({ from: "/new/Hive.app", to: "/old/Hive.app", pid: "1; rm -rf /" });
  assert.equal(script.includes("kill -0"), false);
  assert.equal(script.includes("rm -rf /'"), false);
  assert.match(script, /^sleep 1$/m);
});

const release = (tag, subjects, assets = ["Hive-arm64.zip"], published = "", name = "") => ({
  tag_name: tag,
  name,
  published_at: published,
  body: subjects.map((line) => `- ${line}`).join("\n"),
  assets: assets.map((name) => ({ name, url: `https://api.github.com/repos/o/r/releases/assets/${name}`, size: 128 }))
});

test("reads the commit a release was built from out of its tag", () => {
  assert.equal(shaOfTag("hive-2026.08.20-ade62111"), "ade62111");
  assert.equal(shaOfTag("hive-2026.08.20"), "");
  assert.equal(shaOfTag(""), "");
});

test("the newest release being the running one means up to date", () => {
  const state = updateFromReleases(
    [release("hive-2026.08.20-ade62111", ["a thing"])],
    "ade621110db80ad29dc2b97dd208651311e41163",
    "Hive-arm64.zip"
  );
  assert.deepEqual(state, {
    tag: "hive-2026.08.20-ade62111",
    number: 0,
    asset: "Hive-arm64.zip",
    assetUrl: "https://api.github.com/repos/o/r/releases/assets/Hive-arm64.zip",
    assetSize: 128,
    behind: 0,
    commits: [],
    notes: [],
    quiet: 0
  });
});

test("counts every commit of every release published after the running one", () => {
  const state = updateFromReleases(
    [
      release("hive-2026.08.20-cccccccc", ["third", "fourth"]),
      release("hive-2026.08.19-bbbbbbbb", ["second"]),
      release("hive-2026.08.18-aaaaaaaa", ["first"])
    ],
    "aaaaaaaa11111111111111111111111111111111",
    "Hive-arm64.zip"
  );
  assert.equal(state.tag, "hive-2026.08.20-cccccccc");
  assert.equal(state.behind, 3);
  assert.deepEqual(state.commits, ["third", "fourth", "second"]);
});

test("a running build the list already trimmed still counts every release numbered after it", () => {
  const state = updateFromReleases(
    [
      release("hive-2026.09.22-cccccccc", ["third"], ["Hive-x86_64.rpm"], "2026-09-22T14:51:28Z", "Hive 800"),
      release("hive-2026.09.22-bbbbbbbb", ["second"], ["Hive-x86_64.rpm"], "2026-09-22T14:45:35Z", "Hive 799"),
      release("hive-2026.09.21-dddddddd", ["earlier"], ["Hive-x86_64.rpm"], "2026-09-21T19:05:40Z", "Hive 791")
    ],
    "aaaaaaaa11111111",
    "Hive-x86_64.rpm",
    752
  );
  assert.equal(state.tag, "hive-2026.09.22-cccccccc");
  assert.equal(state.behind, 3);
  assert.deepEqual(state.commits, ["third", "second", "earlier"]);
});

test("a trimmed list stops at the releases the running build already carries", () => {
  const state = updateFromReleases(
    [
      release("hive-2026.09.22-cccccccc", ["third"], ["Hive-x86_64.rpm"], "2026-09-22T14:51:28Z", "Hive 800"),
      release("hive-2026.09.21-dddddddd", ["earlier"], ["Hive-x86_64.rpm"], "2026-09-21T19:05:40Z", "Hive 791")
    ],
    "aaaaaaaa11111111",
    "Hive-x86_64.rpm",
    795
  );
  assert.equal(state.behind, 1);
  assert.deepEqual(state.commits, ["third"]);
});

test("a build newer than every published release is not offered an older one", () => {
  const releases = [
    release("hive-2026.10.06-6e0b9b47", ["windows only"], ["Hive-x64.exe"], "2026-10-06T21:29:56Z", "Hive 990"),
    release("hive-2026.10.06-c1dd60f1", ["older fix"], ["Hive-arm64.zip"], "2026-10-06T19:03:57Z", "Hive 980")
  ];
  const state = updatePicked(releases, "73ac1aedc89572af88e24a1e87d16764ebb66642", { pack: "", bundle: "Hive-arm64.zip", number: 992 });
  assert.equal(state, null);
});

test("the pick carries the running number down to the count", () => {
  const releases = [
    release("hive-2026.09.22-cccccccc", ["third"], ["Hive-x86_64.rpm"], "2026-09-22T14:51:28Z", "Hive 800"),
    release("hive-2026.09.22-bbbbbbbb", ["second"], ["Hive-x86_64.rpm"], "2026-09-22T14:45:35Z", "Hive 799")
  ];
  const state = updatePicked(releases, "aaaaaaaa11111111", { pack: "", bundle: "Hive-x86_64.rpm", number: 752 });
  assert.equal(state.via, "release");
  assert.equal(state.behind, 2);
});

test("the list asks for a whole page of releases, so the running build can still be found in it", () => {
  assert.equal(releasesQuery("acme/hive"), "repos/acme/hive/releases?per_page=100");
  assert.equal(releasesQuery("not a slug"), "");
});

test("a build nobody published takes the newest release on its word", () => {
  const state = updateFromReleases([release("hive-2026.08.20-cccccccc", ["third"])], "", "Hive-arm64.zip");
  assert.equal(state.behind, 1);
  assert.deepEqual(state.commits, ["third"]);
});

test("drafts and prereleases are not offered, and no release at all is no answer", () => {
  const drafted = { ...release("hive-2026.08.21-dddddddd", ["draft"]), draft: true };
  const state = updateFromReleases([drafted, release("hive-2026.08.20-cccccccc", ["third"])], "aaaaaaaa", "Hive-arm64.zip");
  assert.equal(state.tag, "hive-2026.08.20-cccccccc");
  assert.equal(updateFromReleases([], "aaaaaaaa", "Hive-arm64.zip"), null);
});

test("a release that carries nothing for this Mac is not offered at all", () => {
  const state = updateFromReleases([release("hive-2026.08.20-cccccccc", ["third"], ["Hive-x64.zip"])], "aaaaaaaa", "Hive-arm64.zip");
  assert.equal(state, null);
});

test("the newest release is skipped while its zip is still going up, and the notes come from the one you can take", () => {
  const uploading = release("hive-2026.08.21-dddddddd", ["fourth"], []);
  const state = updateFromReleases(
    [uploading, release("hive-2026.08.20-cccccccc", ["third"]), release("hive-2026.08.18-aaaaaaaa", ["first"])],
    "aaaaaaaa11111111111111111111111111111111",
    "Hive-arm64.zip"
  );
  assert.equal(state.tag, "hive-2026.08.20-cccccccc");
  assert.equal(state.asset, "Hive-arm64.zip");
  assert.equal(state.behind, 1);
  assert.deepEqual(state.commits, ["third"]);
});

test("a release still uploading over the running one is no update yet", () => {
  const uploading = release("hive-2026.08.21-dddddddd", ["fourth"], []);
  const state = updateFromReleases(
    [uploading, release("hive-2026.08.20-cccccccc", ["third"])],
    "cccccccc11111111111111111111111111111111",
    "Hive-arm64.zip"
  );
  assert.equal(state.behind, 0);
  assert.deepEqual(state.notes, []);
});

test("unpacking clears the folder, extracts and drops the quarantine mark", () => {
  const script = unpackScript({ zip: "/Users/me/.hive/updates/tag/Hive-arm64.zip", into: "/Users/me/.hive/updates/tag/app" });
  assert.match(script, /^rm -rf '\/Users\/me\/\.hive\/updates\/tag\/app'$/m);
  assert.match(script, /^ditto -x -k '\/Users\/me\/\.hive\/updates\/tag\/Hive-arm64\.zip' '\/Users\/me\/\.hive\/updates\/tag\/app'$/m);
  assert.match(script, /xattr -dr com\.apple\.quarantine '\/Users\/me\/\.hive\/updates\/tag\/app'/);
});

test("a path with a quote in it cannot break out of the unpack script", () => {
  const script = unpackScript({ zip: "/tmp/it's here/Hive-arm64.zip", into: "/tmp/out" });
  assert.match(script, /'\/tmp\/it'\\''s here\/Hive-arm64\.zip'/);
});

test("finds the app the download left behind, wherever the zip put it", () => {
  const exists = (path) => ["/u/app/Hive.app", "/u/nested/mac-arm64/Hive.app"].includes(path);
  assert.equal(unpackedBundle("/u/app", ["Hive.app", "latest-mac.yml"], exists), "/u/app/Hive.app");
  assert.equal(unpackedBundle("/u/nested", ["mac-arm64"], exists), "/u/nested/mac-arm64/Hive.app");
  assert.equal(unpackedBundle("/u/empty", [], exists), "");
});

test("the download goes through the REST asset url, never through the graphql quota", () => {
  const script = downloadScript({
    url: "https://api.github.com/repos/o/r/releases/assets/522205728",
    zip: "/Users/me/.hive/updates/tag/Hive-arm64.zip"
  });
  assert.match(script, /^mkdir -p '\/Users\/me\/\.hive\/updates\/tag'$/m);
  assert.match(script, /^gh api 'https:\/\/api\.github\.com\/repos\/o\/r\/releases\/assets\/522205728' -H 'Accept: application\/octet-stream' > '\/Users\/me\/\.hive\/updates\/tag\/Hive-arm64\.zip'$/m);
  assert.equal(script.includes("release download"), false);
});

test("a url with a quote in it reaches the shell as one argument", () => {
  const nasty = "https://x/'; echo broke out; echo '";
  const line = downloadScript({ url: nasty, zip: "/tmp/a.zip" }).split("\n").find((l) => l.startsWith("gh api "));
  const asOneWord = line.slice("gh api ".length).split(" -H ")[0];
  const read = execFileSync("/bin/bash", ["-c", `printf '%s' ${asOneWord}`], { encoding: "utf8" });
  assert.equal(read, nasty);
});

test("the newest release is the one published last, not the one the api happens to list first", () => {
  const older = release("hive-2026.08.20-aaaaaaaa", ["first"], ["Hive-arm64.zip"], "2026-08-20T12:11:43Z");
  const newer = release("hive-2026.08.20-bbbbbbbb", ["second"], ["Hive-arm64.zip"], "2026-08-20T12:23:23Z");
  const state = updateFromReleases([older, newer], "aaaaaaaa11111111", "Hive-arm64.zip");
  assert.equal(state.tag, "hive-2026.08.20-bbbbbbbb");
  assert.deepEqual(state.commits, ["second"]);
});

test("running the last published build is up to date even when the api lists an older one first", () => {
  const older = release("hive-2026.08.20-aaaaaaaa", ["first"], ["Hive-arm64.zip"], "2026-08-20T12:11:43Z");
  const newer = release("hive-2026.08.20-bbbbbbbb", ["second"], ["Hive-arm64.zip"], "2026-08-20T12:23:23Z");
  const state = updateFromReleases([older, newer], "bbbbbbbb22222222", "Hive-arm64.zip");
  assert.equal(state.behind, 0);
});

const packRelease = (tag, hash, published = "") => ({
  tag_name: tag,
  name: "",
  published_at: published,
  body: "",
  assets: [
    { name: `hive-js-${hash}.tar.gz`, url: `https://api.github.com/repos/o/r/releases/assets/${hash}`, size: 256 },
    { name: `hive-js-${hash}.tar.gz.sig`, url: `https://api.github.com/repos/o/r/releases/assets/${hash}.sig`, size: 64 }
  ]
});

test("a build stuck behind an incompatible shell is not told it is up to date — it is told nothing, so git gets a turn", () => {
  const mine = packRelease("hive-2026.09.02-bbe8ff04", "80e15b575669", "2026-09-02T20:38:25Z");
  const newerShell = packRelease("hive-2026.09.03-44bf2924", "1ffb26d2c26e", "2026-09-03T10:13:13Z");
  const state = updatePicked([mine, newerShell], "bbe8ff04566ac20e3b5504d22bf0a99d9bda4b36", { pack: "hive-js-80e15b575669.tar.gz" });
  assert.equal(state, null);
});

test("the running build is up to date when its own pack really is the newest", () => {
  const mine = packRelease("hive-2026.09.02-bbe8ff04", "80e15b575669");
  const state = updatePicked([mine], "bbe8ff04566ac20e3b5504d22bf0a99d9bda4b36", { pack: "hive-js-80e15b575669.tar.gz" });
  assert.equal(state.behind, 0);
  assert.equal(state.asset, "hive-js-80e15b575669.tar.gz");
});

test("a newer release still on the same shell is offered through the pack, same as before", () => {
  const mine = packRelease("hive-2026.09.02-bbe8ff04", "80e15b575669", "2026-09-02T20:38:25Z");
  const sameShellLater = packRelease("hive-2026.09.03-44bf2924", "80e15b575669", "2026-09-03T10:13:13Z");
  const state = updatePicked([mine, sameShellLater], "bbe8ff04566ac20e3b5504d22bf0a99d9bda4b36", { pack: "hive-js-80e15b575669.tar.gz" });
  assert.equal(state.via, "pack");
  assert.equal(state.tag, "hive-2026.09.03-44bf2924");
  assert.notEqual(state.behind, 0);
});

test("a pack missing its signature is not offered as an update", () => {
  const unsigned = {
    tag_name: "hive-2026.09.03-44bf2924",
    name: "",
    published_at: "",
    body: "",
    assets: [{ name: "hive-js-1ffb26d2c26e.tar.gz", url: "https://x/asset", size: 256 }]
  };
  const state = updatePicked([unsigned], "", { pack: "hive-js-old.tar.gz" });
  assert.equal(state, null);
});

test("the swap only happens for a bundle signed by our team, anchored at apple", () => {
  const line = verifyScript({ bundle: "/Users/me/.hive/updates/tag/bundle/Hive.app", team: "62BZJX9R58" });
  assert.match(line, /^codesign --verify --deep --strict -R /);
  assert.match(line, /anchor apple generic and certificate leaf\[subject\.OU\] = "62BZJX9R58"/);
  assert.match(line, /'\/Users\/me\/\.hive\/updates\/tag\/bundle\/Hive\.app'$/);
});

test("a team id that is not a team id cannot become requirement syntax", () => {
  const line = verifyScript({ bundle: "/a/Hive.app", team: '62BZJX9R58" or anchor apple' });
  assert.match(line, /= "62BZJX9R58oranchorapple"/);
});

test("a bundle path with a quote in it reaches codesign as one argument", () => {
  const nasty = "/tmp/it's here/Hive.app";
  const line = verifyScript({ bundle: nasty, team: "62BZJX9R58" });
  const probe = `codesign() { printf '%s' "\${@: -1}"; }\n${line}`;
  assert.equal(execFileSync("/bin/bash", ["-c", probe], { encoding: "utf8" }), nasty);
});

const grouped = (tag, published) => ({
  tag_name: tag,
  published_at: published,
  body: [
    "### new",
    "- The app updates itself now — no rebuild, no checkout. (#131)",
    "",
    "### fixed",
    "- The newest release is the one published last. (#136)",
    "- A busy driver gets 30s to ack.",
    "",
    "_2 housekeeping commits._"
  ].join("\n"),
  assets: [{ name: "Hive-arm64.zip", url: "https://api.github.com/repos/o/r/releases/assets/1", size: 4096 }]
});

test("a note carries its group and its PR, and loses the parentheses", () => {
  assert.deepEqual(notesOf(grouped("hive-2026.08.20-cccccccc", "").body), [
    { kind: "new", text: "The app updates itself now — no rebuild, no checkout.", pr: "#131" },
    { kind: "fixed", text: "The newest release is the one published last.", pr: "#136" },
    { kind: "fixed", text: "A busy driver gets 30s to ack.", pr: "" }
  ]);
  assert.equal(quietOf(grouped("hive-2026.08.20-cccccccc", "").body), 2);
});

test("a body written before the groups existed still reads, minus the merge noise", () => {
  const notes = notesOf([
    "- Merge pull request #134 from acme/jonas/-/pr-panel",
    '- Revert "Merge pull request #118 from acme/comms"',
    "- fix: the PR panel stops burning the GitHub API budget"
  ].join("\n"));
  assert.deepEqual(notes, [{ kind: "", text: "fix: the PR panel stops burning the GitHub API budget", pr: "" }]);
});

test("the count behind is how many notes there are, not how many releases", () => {
  const state = updateFromReleases(
    [grouped("hive-2026.08.20-cccccccc", "2026-08-20T12:00:00Z"), release("hive-2026.08.19-aaaaaaaa", ["first"], ["Hive-arm64.zip"], "2026-08-19T12:00:00Z")],
    "aaaaaaaa11111111",
    "Hive-arm64.zip"
  );
  assert.equal(state.behind, 3);
  assert.equal(state.quiet, 2);
  assert.equal(state.assetSize, 4096);
  assert.equal(state.notes[0].kind, "new");
});

test("the release the app runs is the one tagged with its commit, and it carries its number", () => {
  const releases = [
    release("hive-2026.08.20-cccccccc", ["third"], ["Hive-arm64.zip"], "2026-08-20T12:00:00Z", "Hive 97"),
    release("hive-2026.08.18-aaaaaaaa", ["first"], ["Hive-arm64.zip"], "2026-08-18T12:00:00Z", "Hive 96")
  ];
  assert.deepEqual(releaseOf(releases, "aaaaaaaa1111"), { tag: "hive-2026.08.18-aaaaaaaa", number: 96, at: "2026-08-18T12:00:00Z" });
  assert.equal(releaseOf(releases, "dddddddd"), null);
  assert.equal(releaseOf(releases, ""), null);
});

test("the number of a release is the run that built it, and a release from before them has none", () => {
  assert.equal(numberOf({ name: "Hive 96" }), 96);
  assert.equal(numberOf({ name: "hive-2026.08.21-12345678" }), 0);
  assert.equal(numberOf({ name: "" }), 0);
  assert.equal(numberOf({}), 0);
  const numbered = updateFromReleases(
    [release("hive-2026.08.20-cccccccc", ["third"], ["Hive-arm64.zip"], "2026-08-20T12:00:00Z", "Hive 97")],
    "aaaaaaaa",
    "Hive-arm64.zip"
  );
  assert.equal(numbered.number, 97);
});

test("what landed is read between the build you had and the one you are running", () => {
  const releases = [
    grouped("hive-2026.08.20-cccccccc", "2026-08-20T12:00:00Z"),
    release("hive-2026.08.19-bbbbbbbb", ["second"], ["Hive-arm64.zip"], "2026-08-19T12:00:00Z"),
    release("hive-2026.08.18-aaaaaaaa", ["first"], ["Hive-arm64.zip"], "2026-08-18T12:00:00Z")
  ];
  const landed = notesBetween(releases, "aaaaaaaa1111", "cccccccc1111");
  assert.equal(landed.tag, "hive-2026.08.20-cccccccc");
  assert.equal(landed.from, "hive-2026.08.18-aaaaaaaa");
  assert.equal(landed.releases, 2);
  assert.deepEqual(landed.notes.map((note) => note.text), [
    "The app updates itself now — no rebuild, no checkout.",
    "The newest release is the one published last.",
    "A busy driver gets 30s to ack.",
    "second"
  ]);
});

test("a build nobody published has nothing to show, and one nobody remembers shows only itself", () => {
  const releases = [grouped("hive-2026.08.20-cccccccc", "2026-08-20T12:00:00Z")];
  assert.equal(notesBetween(releases, "aaaaaaaa", "dddddddd"), null);
  const alone = notesBetween(releases, "aaaaaaaa", "cccccccc1111");
  assert.equal(alone.from, "");
  assert.equal(alone.releases, 1);
  assert.equal(alone.notes.length, 3);
});

const { installedExeOf, installerArgs } = require("../main/update.js");

test("only the installed Windows binary names itself, and the installer it hands over runs silently", () => {
  assert.equal(installedExeOf("C:\\Users\\ana\\AppData\\Local\\Programs\\Hive\\Hive.exe"), "C:\\Users\\ana\\AppData\\Local\\Programs\\Hive\\Hive.exe");
  assert.equal(installedExeOf("C:\\dev\\app\\node_modules\\electron\\dist\\electron.exe"), "");
  assert.equal(installedExeOf("/Applications/Hive.app/Contents/MacOS/Hive"), "");
  assert.equal(installedExeOf(""), "");
  assert.deepEqual(installerArgs(), ["/S"]);
});
