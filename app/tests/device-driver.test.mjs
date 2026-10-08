import test from "node:test";
import assert from "node:assert/strict";
import {
  AVD_IMAGE, AVD_RECIPE, DEFAULT_AVD, appPackagesOf, avdAbiOf, avdHomeOf, avdNamesIn, bootArgs, chooseAvd, createDriver, hasGpuOf, inputTextArg,
  isEmulatorSerial, keyCodeOf, packageOf, parseAvdName, parseDevices, parseUiTree, parseWmSize, pointOnDevice, sdkRootOf, toolsOf
} from "../lib/device.mjs";

test("the sdk root follows ANDROID_HOME, then the studio default of each platform", () => {
  assert.equal(sdkRootOf({ ANDROID_HOME: "/opt/sdk" }, "/home/ana", "linux"), "/opt/sdk");
  assert.equal(sdkRootOf({ ANDROID_SDK_ROOT: "/opt/sdk2" }, "/home/ana", "linux"), "/opt/sdk2");
  assert.equal(sdkRootOf({}, "/home/ana", "linux"), "/home/ana/Android/Sdk");
  assert.equal(sdkRootOf({}, "/Users/ana", "darwin"), "/Users/ana/Library/Android/sdk");
  assert.equal(sdkRootOf({}, "", "linux"), "");
  assert.equal(avdHomeOf({}, "/home/ana"), "/home/ana/.android/avd");
  assert.equal(avdHomeOf({ ANDROID_AVD_HOME: "/avds" }, "/home/ana"), "/avds");
});

test("the tools hang off the sdk root, and no root means no tools", () => {
  const tools = toolsOf("/sdk", "");
  assert.equal(tools.adb, "/sdk/platform-tools/adb");
  assert.equal(tools.emulator, "/sdk/emulator/emulator");
  assert.equal(tools.avdmanager, "/sdk/cmdline-tools/latest/bin/avdmanager");
  assert.equal(toolsOf("", ""), null);
});

test("avds are the .ini files in the avd home, and a missing home is an empty list", () => {
  assert.deepEqual(avdNamesIn("/x", () => ["hive-pixel.ini", "hive-pixel.avd", "tablet.ini", "notes.txt"]), ["hive-pixel", "tablet"]);
  assert.deepEqual(avdNamesIn("/nowhere", () => { throw new Error("ENOENT"); }), []);
});

test("choosing an avd: the one asked, the only one, hive-pixel, or a useful error", () => {
  assert.deepEqual(chooseAvd(["a", "hive-pixel"], "a"), { avd: "a" });
  assert.deepEqual(chooseAvd(["solo"], ""), { avd: "solo" });
  assert.deepEqual(chooseAvd(["a", "hive-pixel"], ""), { avd: DEFAULT_AVD });
  assert.match(chooseAvd(["a", "b"], "").error, /2 AVDs here \(a, b\)/);
  assert.match(chooseAvd(["a"], "zzz").error, /no AVD called "zzz" — the ones here are a/);
  const none = chooseAvd([], "");
  assert.match(none.error, /no Android AVD on this machine/);
  assert.ok(none.error.includes(AVD_RECIPE));
  assert.match(AVD_RECIPE, /avdmanager create avd -n hive-pixel -k "system-images;android-35;google_apis_playstore;(arm64-v8a|x86_64)" -d pixel_7/);
  assert.match(AVD_RECIPE, /hw\.ramSize=2048/);
  assert.match(AVD_RECIPE, /disk\.dataPartition\.path=\/d/);
});

test("adb devices is read line by line, and only emulators count as emulators", () => {
  const out = "List of devices attached\n192.168.1.17:41035\tdevice\nadb-XYZ._adb-tls-connect._tcp\tdevice\nemulator-5554\tdevice\nemulator-5556\toffline\n\n";
  assert.deepEqual(parseDevices(out), [
    { serial: "192.168.1.17:41035", state: "device" },
    { serial: "adb-XYZ._adb-tls-connect._tcp", state: "device" },
    { serial: "emulator-5554", state: "device" },
    { serial: "emulator-5556", state: "offline" }
  ]);
  assert.equal(isEmulatorSerial("emulator-5554"), true);
  assert.equal(isEmulatorSerial("192.168.1.17:41035"), false);
  assert.deepEqual(parseDevices(""), []);
});

test("wm size prefers the override, then the physical size", () => {
  assert.deepEqual(parseWmSize("Physical size: 1080x2400\n"), { width: 1080, height: 2400 });
  assert.deepEqual(parseWmSize("Physical size: 1080x2400\nOverride size: 720x1600\n"), { width: 720, height: 1600 });
  assert.equal(parseWmSize("error: no display"), null);
  assert.equal(parseAvdName("hive-pixel\r\nOK\r\n"), "hive-pixel");
  assert.equal(parseAvdName("OK"), "");
});

test("the ui tree keeps only labelled nodes, with bounds as numbers and entities undone", () => {
  const xml = `<?xml version='1.0'?><hierarchy rotation="0">` +
    `<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="x" content-desc="" clickable="false" bounds="[0,0][1080,2400]">` +
    `<node index="1" text="Entrar &amp; ler" resource-id="com.example:id/login" class="android.widget.Button" package="x" content-desc="" clickable="true" bounds="[100,200][980,320]" />` +
    `<node index="2" text="" resource-id="" class="android.view.View" package="x" content-desc="Menu &quot;principal&quot;" clickable="true" bounds="[0,0][120,120]" />` +
    `</node></hierarchy>`;
  const nodes = parseUiTree(xml);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[0], { text: "Entrar & ler", desc: "", id: "com.example:id/login", cls: "android.widget.Button", bounds: [100, 200, 980, 320], clickable: true });
  assert.equal(nodes[1].desc, "Menu \"principal\"");
  assert.deepEqual(parseUiTree(""), []);
});

test("input text: spaces become %s and the device shell's specials are escaped", () => {
  assert.equal(inputTextArg("aluno teste"), "aluno%steste");
  assert.equal(inputTextArg("a&b (c) 'd' \"e\" $f `g` |h; <i> \\j"), "a\\&b%s\\(c\\)%s\\'d\\'%s\\\"e\\\"%s\\$f%s\\`g\\`%s\\|h\\;%s\\<i\\>%s\\\\j");
  assert.equal(inputTextArg("aluno@teste.com"), "aluno@teste.com");
  assert.equal(inputTextArg(""), "");
});

test("a nickname the deployment configured maps to a package, anything else is taken as a package", () => {
  const known = appPackagesOf("reader=com.example.reader,Writer=com.example.writer");
  assert.deepEqual(known, { reader: "com.example.reader", writer: "com.example.writer" });
  assert.equal(packageOf("reader", known), "com.example.reader");
  assert.equal(packageOf("WRITER", known), "com.example.writer");
  assert.equal(packageOf("com.example.app", known), "com.example.app");
  assert.equal(packageOf("reader"), "reader", "with no nicknames configured the word is taken as a package");
  assert.equal(packageOf(""), "");
});

test("keys: names, KEYCODE_ names and numbers all reach input keyevent", () => {
  assert.equal(keyCodeOf("HOME"), "KEYCODE_HOME");
  assert.equal(keyCodeOf("back"), "KEYCODE_BACK");
  assert.equal(keyCodeOf("ENTER"), "KEYCODE_ENTER");
  assert.equal(keyCodeOf("TAB"), "KEYCODE_TAB");
  assert.equal(keyCodeOf("KEYCODE_VOLUME_UP"), "KEYCODE_VOLUME_UP");
  assert.equal(keyCodeOf("dpad_down"), "KEYCODE_DPAD_DOWN");
  assert.equal(keyCodeOf(66), "66");
  assert.equal(keyCodeOf("???"), "");
  assert.equal(keyCodeOf(""), "");
});

test("the boot line is headless by default, and the machine's own gpu draws whenever there is one", () => {
  assert.deepEqual(bootArgs({ avd: "hive-pixel", display: ":1", platform: "linux" }), ["-avd", "hive-pixel", "-no-audio", "-no-boot-anim", "-accel", "on", "-no-window", "-gpu", "host"]);
  assert.deepEqual(bootArgs({ avd: "hive-pixel", display: "", platform: "linux" }), ["-avd", "hive-pixel", "-no-audio", "-no-boot-anim", "-accel", "on", "-no-window", "-gpu", "swiftshader_indirect"]);
  assert.deepEqual(bootArgs({ avd: "hive-pixel", display: "", platform: "darwin" }), ["-avd", "hive-pixel", "-no-audio", "-no-boot-anim", "-accel", "on", "-no-window", "-gpu", "host"]);
  assert.ok(!bootArgs({ avd: "x", window: true, display: ":1" }).includes("-no-window"));
});

test("a mac never falls back to drawing the screen on the cpu", () => {
  assert.equal(hasGpuOf("darwin", ""), true);
  assert.equal(hasGpuOf("linux", ""), false);
  assert.equal(hasGpuOf("linux", ":0"), true);
});

test("the recipe builds a plain phone for this machine's own chip", () => {
  assert.equal(avdAbiOf("arm64"), "arm64-v8a");
  assert.equal(avdAbiOf("x64"), "x86_64");
  assert.ok(!AVD_IMAGE.includes("tablet"), "a tablet is not the phone people carry");
  assert.match(AVD_RECIPE, /hw\.ramSize=2048/);
  assert.match(AVD_RECIPE, /hw\.gpu\.enabled=yes/);
});

test("a click on the contained image maps back to device pixels, and the letterbox is nobody's", () => {
  const natural = { width: 1080, height: 2400 };
  const box = { width: 400, height: 800 };
  assert.deepEqual(pointOnDevice({ x: 200, y: 400 }, box, natural), { x: 540, y: 1200 });
  assert.deepEqual(pointOnDevice({ x: 20, y: 0 }, box, natural), { x: 0, y: 0 });
  assert.deepEqual(pointOnDevice({ x: 380, y: 800 }, box, natural), { x: 1080, y: 2400 });
  assert.equal(pointOnDevice({ x: 5, y: 400 }, box, natural), null);
  assert.equal(pointOnDevice({ x: 200, y: 400 }, { width: 0, height: 0 }, natural), null);
  const wide = { width: 1000, height: 500 };
  assert.deepEqual(pointOnDevice({ x: 500, y: 250 }, wide, natural), { x: 540, y: 1200 });
});

function fakeExec(answers) {
  const calls = [];
  const exec = async (cmd, args, opts = {}) => {
    calls.push({ cmd, args, opts });
    const key = args.join(" ");
    for (const [match, reply] of answers) if (key.includes(match)) return typeof reply === "function" ? reply(args) : reply;
    return { ok: true, out: "", err: "" };
  };
  return { exec, calls };
}

const tools = toolsOf("/sdk", "");
const ok = (out) => ({ ok: true, out, err: "" });

test("the driver talks to adb by serial with argv arrays, never through a shell", async () => {
  const { exec, calls } = fakeExec([
    ["devices", ok("List of devices attached\nemulator-5554\tdevice\nR58M\tdevice\n")],
    ["emu avd name", ok("hive-pixel\nOK\n")],
    ["wm size", ok("Physical size: 1080x2400\n")],
    ["screencap", ok(Buffer.from("\x89PNG\r\n\x1a\n........"))]
  ]);
  const drive = createDriver({ tools, exec, avdHome: "/nowhere" });
  assert.deepEqual(await drive.running(), [{ serial: "emulator-5554", avd: "hive-pixel" }]);
  await drive.tap("emulator-5554", 540, 1200);
  await drive.swipe("emulator-5554", 1, 2, 3, 4, 300);
  await drive.type("emulator-5554", "aluno teste");
  await drive.key("emulator-5554", drive.keyOf("HOME"));
  const shot = await drive.shot("emulator-5554");
  assert.ok(shot.png.length > 8);
  const argv = calls.map((c) => c.args.join(" "));
  assert.ok(calls.every((c) => c.cmd === "/sdk/platform-tools/adb"));
  assert.ok(argv.includes("-s emulator-5554 shell input tap 540 1200"));
  assert.ok(argv.includes("-s emulator-5554 shell input swipe 1 2 3 4 300"));
  assert.ok(argv.includes("-s emulator-5554 shell input text aluno%steste"));
  assert.ok(argv.includes("-s emulator-5554 shell input keyevent KEYCODE_HOME"));
  assert.ok(argv.includes("-s emulator-5554 exec-out screencap -p"));
  const shotCall = calls.find((c) => c.args.includes("screencap"));
  assert.equal(shotCall.opts.encoding, "buffer");
  assert.equal(shotCall.opts.timeout, 5000);
});

test("boot reuses an emulator that is already up, and only launches when none carries the avd", async () => {
  let launched = [];
  const spawn = (cmd, args) => { launched.push({ cmd, args }); return { unref() {} }; };
  const { exec } = fakeExec([
    ["devices", ok("emulator-5554\tdevice\n")],
    ["emu avd name", ok("hive-pixel\nOK\n")],
    ["getprop sys.boot_completed", ok("1\n")],
    ["wm size", ok("Physical size: 1080x2400\n")]
  ]);
  const drive = createDriver({ tools, exec, spawn, avdHome: "/nowhere", env: { DISPLAY: ":1" } });
  const up = await drive.boot({ avd: "hive-pixel" });
  assert.equal(up.serial, "emulator-5554");
  assert.equal(up.fresh, false);
  assert.deepEqual({ width: up.width, height: up.height }, { width: 1080, height: 2400 });
  assert.deepEqual(launched, []);
});

test("a cold boot launches the emulator detached and waits for the serial, then sys.boot_completed", async () => {
  const launched = [];
  const spawn = (cmd, args, opts) => { launched.push({ cmd, args, opts }); return { unref() {} }; };
  let polls = 0;
  const { exec } = fakeExec([
    ["devices", () => { polls += 1; return ok(polls > 1 ? "emulator-5556\tdevice\n" : ""); }],
    ["emu avd name", ok("hive-pixel\nOK\n")],
    ["getprop sys.boot_completed", ok("1\n")],
    ["wm size", ok("Physical size: 1080x2400\n")]
  ]);
  const drive = createDriver({ tools: { ...tools, emulator: process.execPath }, exec, spawn, avdHome: "/nowhere", env: { DISPLAY: "" } });
  const up = await drive.boot({ avd: "hive-pixel", timeout: 20000 });
  assert.equal(up.fresh, true);
  assert.equal(up.serial, "emulator-5556");
  assert.equal(launched.length, 1);
  assert.equal(launched[0].cmd, process.execPath);
  assert.deepEqual(launched[0].args, ["-avd", "hive-pixel", "-no-audio", "-no-boot-anim", "-accel", "on", "-no-window", "-gpu", hasGpuOf() ? "host" : "swiftshader_indirect"]);
  assert.equal(launched[0].opts.detached, true);
  assert.equal(launched[0].opts.stdio, "ignore");
});

test("a boot that never shows up in adb fails with the command to run by hand", async () => {
  const spawn = () => ({ unref() {} });
  const { exec } = fakeExec([["devices", ok("")]]);
  let clock = 0;
  const drive = createDriver({ tools: { ...tools, emulator: process.execPath }, exec, spawn, avdHome: "/nowhere", env: { DISPLAY: ":1" }, now: () => (clock += 4000) });
  const up = await drive.boot({ avd: "hive-pixel", timeout: 10000 });
  assert.match(up.error, /never showed up in adb devices within 10s/);
  assert.match(up.error, /-avd hive-pixel -no-audio -no-boot-anim -accel on -no-window -gpu host/);
});

test("the tree dumps then reads the xml, and logs filter by the app's pid when there is one", async () => {
  const { exec, calls } = fakeExec([
    ["uiautomator dump", ok("UI hierchary dumped to: /sdcard/ui.xml\n")],
    ["cat /sdcard/ui.xml", ok(`<hierarchy><node text="Entrar" resource-id="" class="android.widget.Button" content-desc="" clickable="true" bounds="[0,0][10,10]"/></hierarchy>`)],
    ["pidof com.example.reader", ok("4242\n")],
    ["logcat", ok("08-25 18:47:03.641 4242 4242 D X: one\n08-25 18:47:03.642 4242 4242 D X: two\n")]
  ]);
  const drive = createDriver({ tools, exec, avdHome: "/nowhere" });
  const tree = await drive.tree("emulator-5554");
  assert.equal(tree.count, 1);
  assert.equal(tree.nodes[0].text, "Entrar");
  const logs = await drive.logs("emulator-5554", { lines: 50, pkg: "com.example.reader" });
  assert.deepEqual(logs.lines, ["08-25 18:47:03.641 4242 4242 D X: one", "08-25 18:47:03.642 4242 4242 D X: two"]);
  const logcat = calls.find((c) => c.args.includes("logcat"));
  assert.deepEqual(logcat.args, ["-s", "emulator-5554", "logcat", "-d", "-t", "50", "--pid=4242"]);
});

test("opening an app that is not installed says so, with the nearest package when there is one", async () => {
  const { exec } = fakeExec([
    ["monkey", ok("** No activities found to run, monkey aborted.\n")],
    ["pm list packages", ok("package:com.android.settings\npackage:com.example.reader\n")]
  ]);
  const drive = createDriver({ tools, exec, avdHome: "/nowhere" });
  const r = await drive.openApp("emulator-5554", "com.example.other");
  assert.match(r.error, /no app com\.example\.other on emulator-5554/);
  const { exec: exec2 } = fakeExec([["monkey", ok("Events injected: 1\n")]]);
  const drive2 = createDriver({ tools, exec: exec2, avdHome: "/nowhere" });
  assert.deepEqual(await drive2.openApp("emulator-5554", "com.example.reader"), { ok: true, app: "com.example.reader" });
});
