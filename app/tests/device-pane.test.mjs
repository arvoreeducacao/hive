import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const src = (name) => readFileSync(join(HERE, "src", name), "utf8");
const panes = src("app/chat-and-panes.js");
const menu = src("app/seat-menu.js");
const thread = src("app/thread.js");
const focus = src("app/focus-navigation.js");
const keys = src("app/hold-numbers.js");
const chats = src("app/new-chat.js");
const tile = src("tile.jsx");

function cut(text, from, to, what = "app.html") {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const block = cut(panes, "\nst.deviceChat = null;", "\nst.cockChat = null;", "chat-and-panes.js");
const DEVICE = { platform: "android", avd: "hive-pixel", serial: "emulator-5554", booted: true, app: "com.example.reader", width: 1080, height: 2400, at: 1700000000000, want: 1 };

function world({ device = DEVICE, visible = "visible", answer = { ok: true }, appears = DEVICE, list = { ok: true, avds: ["hive-pixel"], running: [], sims: [] } } = {}) {
  const timers = [];
  const posted = [];
  const pulls = [];
  const srcs = [];
  const img = { hidden: true, naturalWidth: 1080, naturalHeight: 2400, get src() { return srcs.at(-1) || ""; }, set src(v) { srcs.push(v); } };
  const gone = { hidden: true, textContent: "", kids: [], append(...ones) { this.kids.push(...ones); } };
  const id = { textContent: "" };
  const pane = { gone: false, remove() { this.gone = true; }, querySelector: (sel) => (sel === ".device-screen" ? img : sel === ".art-gone" ? gone : id) };
  const chip = { hidden: true, dataset: {}, classes: new Set(), span: { textContent: "" }, on: {} };
  chip.classList = { toggle: (c, on) => (on ? chip.classes.add(c) : chip.classes.delete(c)) };
  chip.querySelector = () => chip.span;
  chip.addEventListener = (kind, fn) => { chip.on[kind] = fn; };
  const el = { dataset: { name: "ana" }, classes: [], vars: {}, querySelector: (sel) => (sel === ".art.device" ? pane : sel === ".t-device" ? chip : null) };
  el.classList = {
    add: (c) => { if (!el.classes.includes(c)) el.classes.push(c); },
    toggle: (c, on) => { if (on) el.classList.add(c); else el.classes = el.classes.filter((x) => x !== c); }
  };
  el.style = { setProperty: (k, v) => { el.vars[k] = v; } };
  const made = [];
  const element = (tag) => {
    const one = { tag, textContent: "", className: "", type: "", kids: [], on: {} };
    one.append = (...ones) => one.kids.push(...ones);
    one.addEventListener = (kind, fn) => { one.on[kind] = fn; };
    made.push(one);
    return one;
  };
  const document = { visibilityState: visible, createElement: element, querySelector: (sel) => (sel.endsWith(".device-screen") ? img : sel.endsWith(".art.device") ? pane : null) };
  const data = { sessions: [{ name: "ana", device }] };
  const closed = [];
  const stub = (what) => () => closed.push(what);
  const setTimeout = (fn, ms) => { timers.push({ fn, ms, dead: false }); return timers.length; };
  const clearTimeout = (n) => { if (n) timers[n - 1].dead = true; };
  const fetch = (url, opts) => {
    posted.push({ url, body: opts ? JSON.parse(opts.body) : null });
    const said = String(url).startsWith("/api/device/list") ? list : answer;
    return Promise.resolve({ json: () => Promise.resolve(said) });
  };
  const pull = async () => { pulls.push(true); data.sessions[0].device = appears; };
  const api = new Function(
    "document", "setTimeout", "clearTimeout", "fetch", "phrase", "st", "render", "openTile", "releaseKeyboard", "prsOnScreen", "finishOn",
    "closePrs", "closeFinish", "closeCockpit", "closeBrowser", "exitReview", "closeThreadPanel", "pull",
    "takeFieldPane", "dropFieldPane",
    `const paneShownFor = (name) => st.open === name;
     ${block}
     return { openDevice, closeDevice, askDeviceFrame, deviceFrameLanded, stopDeviceFrames, paintDeviceChipOfChat, paintDeviceOfChat, pointOnDevice, deviceSaid, deviceApplied,
       startDevice, bootDevice, askWhichPhone, phonesToBoot, deviceAct, sayOnDevice, tapDevice,
       now: () => ({ deviceChat: st.deviceChat, deviceClock, deviceLoading: st.deviceLoading, deviceGone: st.deviceGone, deviceBooting: st.deviceBooting }) };`
  )(document, setTimeout, clearTimeout, fetch, (t) => t,
    { data, open: "ana", cockChat: null, webChat: null, reviewChat: null, threadChat: null },
    () => {}, () => {}, () => {}, () => false, () => false,
    stub("prs"), stub("finish"), stub("cockpit"), stub("browser"), stub("review"), stub("thread"), pull,
    () => false, () => false);
  const pending = () => timers.filter((t) => !t.dead);
  const tick = () => { for (const t of pending()) { t.dead = true; t.fn(); } };
  return { ...api, img, gone, id, chip, el, document, data, posted, pulls, srcs, closed, pending, tick, made, seat: () => ({ name: "ana", device: data.sessions[0].device }) };
}

test("the chip sits in the card next to the cockpit chip, hidden until a device exists", () => {
  const state = cut(tile, '<div class="t-state">', "</div>", "tile.jsx");
  assert.ok(state.indexOf('class="t-canopy"') < state.indexOf('class="t-device"'), "the device chip comes after the cockpit chip");
  assert.match(state, /<button class="t-device" hidden title=\{props\.model\.tags\.device\}>/);
  assert.match(cut(menu, "    tags: {", "\n    },", "seat-menu.js"), /device: phrase\("its device"\),/);
  const render = cut(menu, "  paintCanopyOfChat(el, s);", "  paintWebChipOfChat(el, s);", "seat-menu.js");
  assert.match(render, /paintDeviceChipOfChat\(el, s\);/);
  assert.match(cut(menu, "  paintWebOfChat(el, s);\n", "\n}", "seat-menu.js"), /paintDeviceOfChat\(el, s\);/);
});

test("the chip says which device and whether it is live, and opens the pane", () => {
  const w = world();
  w.paintDeviceChipOfChat(w.el, w.seat());
  assert.equal(w.chip.hidden, false);
  assert.equal(w.chip.span.textContent, "hive-pixel · live");
  assert.ok(w.chip.classes.has("live"));
  w.chip.on.click({ stopPropagation() {}, preventDefault() {} });
  assert.equal(w.now().deviceChat, "ana");
  w.data.sessions[0].device = { ...DEVICE, booted: false };
  w.paintDeviceChipOfChat(w.el, w.seat());
  assert.equal(w.chip.span.textContent, "hive-pixel · off");
  assert.ok(!w.chip.classes.has("live"));
  w.data.sessions[0].device = null;
  w.paintDeviceChipOfChat(w.el, w.seat());
  assert.equal(w.chip.hidden, true);
});

test("opening the device closes every sibling pane, and every sibling closes the device", () => {
  const w = world();
  w.openDevice("ana");
  assert.deepEqual(w.closed, ["prs", "finish"].filter(() => false), "nothing on screen means nothing to close");
  for (const [where, what, fn, end] of [[panes, "chat-and-panes.js", "function openCockpit(name) {", "\n}\n"], [panes, "chat-and-panes.js", "function openBrowser(name) {", "\n}\n"], [thread, "thread.js", "function openThreadOf(name, key) {", "\n}\n"], [thread, "thread.js", "function reviewInChat(name, key) {", "\n}\n"]]) {
    assert.match(cut(where, fn, end, what), /if \(st\.deviceChat\) closeDevice\(\);/, `${fn} must close the device pane`);
  }
  const opener = cut(panes, "function openDevice(name) {", "\n}\n", "chat-and-panes.js");
  for (const closer of ["closeCockpit()", "closeBrowser()", "exitReview()", "closeThreadPanel()", "closePrs()", "closeFinish()"]) {
    assert.ok(opener.includes(closer), `openDevice must call ${closer}`);
  }
  assert.match(cut(keys, "  if (st.deviceChat && !inField) {", "\n  }", "hold-numbers.js"), /closeDevice\(\)/);
});

test("the pane comes back with the seat, like the browser and the cockpit", () => {
  const keep = cut(focus, "function keepPane() {", "\n}\n", "focus-navigation.js");
  assert.match(keep, /else if \(st\.deviceChat === name\) paneOfSeat\.set\(name, \{ kind: "device" \}\);/);
  assert.match(cut(focus, "function restorePane(name) {", "\n}\n", "focus-navigation.js"), /if \(pane\.kind === "device"\) return openDevice\(name\);/);
  assert.match(cut(focus, "const paneHere = ", "\n", "focus-navigation.js"), /st\.deviceChat === name/);
  assert.match(cut(focus, "function openTile(name, restore = true) {", "\n}\n", "focus-navigation.js"), /if \(st\.deviceChat && st\.deviceChat !== name\) \{ st\.deviceChat = null; stopDeviceFrames\(\); \}/);
  assert.match(cut(focus, "function closeTile() {", "\n}\n", "focus-navigation.js"), /if \(st\.deviceChat\) \{ st\.deviceChat = null; stopDeviceFrames\(\); \}/);
});

test("one frame in flight at a time — the next is only asked after the last landed", () => {
  const w = world();
  w.openDevice("ana");
  w.paintDeviceOfChat(w.el, w.seat());
  assert.deepEqual(w.el.classes, ["deviced", "arting"]);
  assert.equal(w.id.textContent, "ana · hive-pixel · 1080×2400 · com.example.reader");
  assert.equal(w.srcs.length, 1);
  assert.match(w.srcs[0], /^\/api\/device\/frame\?name=ana&t=\d+$/);
  assert.equal(w.gone.textContent, "waiting for the first frame");
  w.paintDeviceOfChat(w.el, w.seat());
  w.askDeviceFrame("ana");
  assert.equal(w.srcs.length, 1, "a repaint never stacks a second request on the one in flight");
  assert.equal(w.pending().length, 0);
  w.deviceFrameLanded("ana", true);
  assert.equal(w.img.hidden, false);
  assert.equal(w.gone.hidden, true);
  assert.deepEqual(w.pending().map((t) => t.ms), [120]);
  w.tick();
  assert.equal(w.srcs.length, 2);
});

test("a frame that fails says the emulator is gone, keeps saying it, and asks again on its own", () => {
  const w = world();
  w.openDevice("ana");
  w.paintDeviceOfChat(w.el, w.seat());
  w.deviceFrameLanded("ana", false);
  assert.equal(w.img.hidden, true);
  assert.equal(w.gone.hidden, false);
  assert.equal(w.gone.textContent, "the emulator is gone");
  assert.deepEqual(w.pending().map((t) => t.ms), [3000], "a slow beat, not a dead pane");
  w.paintDeviceOfChat(w.el, w.seat());
  assert.equal(w.srcs.length, 1, "a repaint does not hammer a dead emulator");
  assert.equal(w.gone.textContent, "the emulator is gone", "a repaint keeps the reason on the screen");
  w.tick();
  assert.equal(w.srcs.length, 2, "the pane asks again without a new device_open");
  w.deviceFrameLanded("ana", true);
  assert.equal(w.img.hidden, false);
  assert.equal(w.now().deviceGone, "", "a frame that lands lets the video come back");
});

test("a pane built from scratch starts with no frame in flight", () => {
  assert.match(cut(panes, "function devicePaneOf(el, s) {", "\n}\n", "chat-and-panes.js"), /^function devicePaneOf\(el, s\) \{\n  stopFrameLoop\(\);/);
});

test("closing the pane, leaving the tile or hiding the window stops the clock", () => {
  const w = world();
  w.openDevice("ana");
  w.paintDeviceOfChat(w.el, w.seat());
  w.deviceFrameLanded("ana", true);
  assert.equal(w.pending().length, 1);
  w.closeDevice();
  assert.equal(w.pending().length, 0);
  assert.equal(w.now().deviceClock, 0);
  assert.equal(w.now().deviceChat, null);

  const hidden = world({ visible: "hidden" });
  hidden.openDevice("ana");
  hidden.paintDeviceOfChat(hidden.el, hidden.seat());
  assert.equal(hidden.srcs.length, 0, "a hidden window asks for nothing");
  hidden.document.visibilityState = "visible";
  hidden.askDeviceFrame("ana");
  assert.equal(hidden.srcs.length, 1);

  const visibility = cut(chats, 'document.addEventListener("visibilitychange", () => {', "\n});", "new-chat.js");
  assert.match(visibility, /if \(document\.hidden\) stopDeviceFrames\(\);/);
  assert.match(visibility, /else if \(st\.deviceChat\) askDeviceFrame\(st\.deviceChat\);/);
});

test("without a device the pane says how to get one and asks for no frame", () => {
  const w = world({ device: null });
  w.openDevice("ana");
  w.paintDeviceOfChat(w.el, w.seat());
  assert.equal(w.srcs.length, 0);
  assert.equal(w.gone.hidden, false);
  assert.equal(w.gone.textContent, "no device on this seat — press the phone above, or ask the seat for device_open");
  assert.equal(w.id.textContent, "ana");
});

test("a click on the picture lands on the device through the contain formula, and outside the picture is ignored", () => {
  const w = world();
  const { pointOnDevice } = w;
  const natural = { width: 1080, height: 2400 };
  const box = { width: 800, height: 600 };
  assert.deepEqual(pointOnDevice({ x: 400, y: 300 }, box, natural), { x: 540, y: 1200 });
  assert.deepEqual(pointOnDevice({ x: 265, y: 0 }, box, natural), { x: 0, y: 0 });
  assert.deepEqual(pointOnDevice({ x: 535, y: 600 }, box, natural), { x: 1080, y: 2400 });
  assert.equal(pointOnDevice({ x: 100, y: 300 }, box, natural), null, "the letterbox is not the screen");
  assert.equal(pointOnDevice({ x: 400, y: 300 }, box, { width: 0, height: 0 }), null, "no picture yet, no tap");
  w.openDevice("ana");
  const shot = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }), naturalWidth: 1080, naturalHeight: 2400 };
  w.tapDevice("ana", shot, { clientX: 400, clientY: 300 });
  assert.deepEqual(w.posted.at(-1), { url: "/api/device/tap", body: { name: "ana", x: 540, y: 1200 } });
  w.tapDevice("ana", shot, { clientX: 100, clientY: 300 });
  assert.equal(w.posted.length, 1, "a click on the letterbox never reaches the device");
});

test("the pane has a head, the keys, a way to type and a print that reuses the browser's print road", () => {
  const pane = cut(panes, "function devicePaneOf(el, s) {", "\n}\n", "chat-and-panes.js");
  assert.match(pane, /pane\.className = "art device"/);
  assert.match(pane, /<b>\$\{phrase\("device"\)\}<\/b>/);
  assert.match(pane, /data-key="BACK"/);
  assert.match(pane, /data-key="HOME"/);
  assert.match(pane, /deviceAct\(s\.name, "key", \{ key: b\.dataset\.key \}\)/);
  assert.match(pane, /deviceAct\(s\.name, "type", \{ text \}\)/);
  assert.match(pane, /object-fit|device-screen/);
  assert.match(pane, /img\.addEventListener\("error", \(\) => deviceFrameLanded\(s\.name, false\)\)/);
  const print = cut(panes, "function sendDevicePrint(name) {", "\n}\n", "chat-and-panes.js");
  assert.match(print, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(print, /fetch\("\/api\/browser\/print"/);
  assert.match(page, /\.device-screen, \.device-live \{[^}]*object-fit: contain/);
  assert.match(cut(panes, "const deviceCall = ", "\n", "chat-and-panes.js"), /\/api\/device\/\$\{path\}/);
});

test("device_open opens the pane by itself, once per boot, without waiting for a click", () => {
  const w = world();
  assert.equal(w.now().deviceChat, null);
  w.paintDeviceChipOfChat(w.el, w.seat());
  assert.equal(w.now().deviceChat, null, "opening is deferred out of the render cycle");
  w.tick();
  assert.equal(w.now().deviceChat, "ana");
  w.closeDevice();
  w.paintDeviceChipOfChat(w.el, w.seat());
  w.tick();
  assert.equal(w.now().deviceChat, null, "the same boot never reopens a pane the person shut");
  w.data.sessions[0].device = { ...DEVICE, want: 2, at: DEVICE.at + 1 };
  w.paintDeviceChipOfChat(w.el, w.seat());
  w.tick();
  assert.equal(w.now().deviceChat, "ana", "a new device_open opens it again");
});

test("the picture never sits under the waiting box, and the box never eats a tap", () => {
  const w = world();
  w.openDevice("ana");
  w.paintDeviceOfChat(w.el, w.seat());
  assert.equal(w.gone.hidden, false);
  w.deviceFrameLanded("ana", true);
  w.gone.hidden = false;
  w.paintDeviceOfChat(w.el, w.seat());
  assert.equal(w.gone.hidden, true, "a repaint with a picture on screen hides the waiting box");
  assert.match(page, /\.art\.device \.art-gone \{[^}]*pointer-events: none/);
});

test("the pane is as wide as the device is, not half the tile", () => {
  const w = world();
  w.openDevice("ana");
  w.paintDeviceOfChat(w.el, w.seat());
  assert.ok(w.el.classes.includes("deviced"));
  assert.equal(w.el.vars["--dev-ar"], "0.4500");
  w.closeDevice();
  w.paintDeviceOfChat(w.el, w.seat());
  assert.ok(!w.el.classes.includes("deviced"), "the tile goes back to the usual split when the pane closes");
  assert.match(page, /\.tile\.open\.arting\.deviced \{[^}]*grid-template-columns: minmax\(0, 1fr\) min\(calc\(84vh \* var\(--dev-ar/);
});

test("the card carries a phone button beside the browser one, and it wakes what is not there yet", async () => {
  const tags = cut(tile, '<span class="t-tags">', "\n        </span>", "tile.jsx");
  assert.ok(tags.indexOf('class="t-web"') < tags.indexOf('class="t-phone"'), "the phone button sits right after the browser one");
  assert.match(cut(menu, '  el.querySelector(".t-web")', "\n\n", "seat-menu.js"), /el\.querySelector\("\.t-phone"\)\.addEventListener\("click", \(ev\) => \{ ev\.stopPropagation\(\); startDevice\(s\.name\); \}\);/);
  const w = world({ device: null });
  await w.startDevice("ana");
  assert.equal(w.posted.at(-1).url, "/api/device/open", "with no device on the seat, the button boots one");
  assert.equal(w.posted.at(-1).body.platform, "android", "the only phone this machine has is the one it boots, with no question asked");
  assert.equal(w.pulls.length, 1, "the fleet state is read back so the pane knows the device exists");
  assert.equal(w.now().deviceBooting, "", "the seat is free to try again");
  assert.ok(w.srcs.length, "and the first frame is asked for without waiting for a beat");
});

test("a seat that already has a device only opens the pane", async () => {
  const w = world();
  await w.startDevice("ana");
  assert.equal(w.posted.length, 0, "nothing is booted twice");
  assert.equal(w.now().deviceChat, "ana");
});

test("the button says what went wrong instead of leaving an empty box", async () => {
  const w = world({ device: null, answer: { error: "no AVD called \"hive-pixel\"" } });
  await w.startDevice("ana");
  assert.match(w.gone.textContent, /no AVD called/);
  assert.equal(w.gone.hidden, false);
});

test("a machine that can boot both asks which phone instead of guessing android", async () => {
  const w = world({ device: null, list: { ok: true, avds: ["hive-pixel"], running: [], sims: [{ udid: "BBB", name: "iPhone 16", state: "Shutdown" }] } });
  await w.startDevice("ana");
  assert.ok(!w.posted.some((one) => one.url === "/api/device/open"), "nothing is booted before the person says which");
  const row = w.made.find((one) => one.className === "device-pick");
  assert.ok(row, "the pane offers the choice");
  assert.deepEqual(row.kids.map((one) => one.textContent), ["Android", "iPhone"]);
  assert.match(page, /\.device-pick \{[^}]*pointer-events: auto/, "the choice is clickable inside a pane that ignores the pointer");

  row.kids[1].on.click({ stopPropagation: () => {} });
  await new Promise((r) => setImmediate(r));
  assert.equal(w.posted.at(-1).url, "/api/device/open");
  assert.equal(w.posted.at(-1).body.platform, "ios", "the phone that was picked is the phone that boots");
});

test("a machine with only a simulator boots the iPhone without asking", async () => {
  const w = world({ device: null, list: { ok: true, avds: [], running: [], sims: [{ udid: "BBB", name: "iPhone 16", state: "Shutdown" }] } });
  await w.startDevice("ana");
  assert.equal(w.posted.at(-1).url, "/api/device/open");
  assert.equal(w.posted.at(-1).body.platform, "ios");
  assert.ok(!w.made.some((one) => one.className === "device-pick"), "one phone is not a choice");
});

test("a machine that can boot nothing carries the reason, not an empty pane", async () => {
  const w = world({ device: null, list: { ok: true, avds: [], running: [], sims: [], android: "no Android SDK on this machine", ios: "the iOS simulator only runs on a mac" } });
  await w.startDevice("ana");
  assert.ok(!w.posted.some((one) => one.url === "/api/device/open"), "nothing is booted");
  assert.match(w.gone.textContent, /no Android SDK on this machine/);
  assert.equal(w.gone.hidden, false);
});

test("what the pane put on screen survives the next repaint, so the choice does not blink away", async () => {
  const w = world({ device: null, list: { ok: true, avds: ["hive-pixel"], running: [], sims: [{ udid: "BBB", name: "iPhone 16", state: "Shutdown" }] } });
  await w.startDevice("ana");
  w.gone.textContent = "";
  w.paintDeviceOfChat(w.el, w.seat());
  assert.equal(w.gone.textContent, "", "a repaint leaves the question and its buttons alone");
  w.closeDevice();
  w.paintDeviceOfChat(w.el, w.seat());
});

test("an action asks for a fresh frame instead of waiting out the beat", async () => {
  const w = world();
  w.openDevice("ana");
  w.askDeviceFrame("ana");
  assert.equal(w.now().deviceLoading, true, "a frame is in flight");
  await w.deviceAct("ana", "tap", { x: 10, y: 20 });
  assert.deepEqual(w.posted.at(-1), { url: "/api/device/tap", body: { name: "ana", x: 10, y: 20 } });
  w.deviceFrameLanded("ana", true);
  assert.equal(w.pending().at(-1).ms, 0, "the frame that shows the tap is asked for at once");
  w.deviceFrameLanded("ana", true);
  assert.ok(w.pending().at(-1).ms > 0, "and the loop goes back to its beat afterwards");
});

test("in the new Hive, esc on a chat in full screen minimizes it first and keeps the pane for the way back", () => {
  const minimize = keys.indexOf("experienceNext() && st.open && !inField");
  assert.ok(minimize > 0, "esc in full screen no longer goes straight to minimizing");
  for (const pane of ["  if (st.cockChat && !inField) {", "  if (st.webChat && !inField) {", "  if (st.deviceChat && !inField) {", "  if (threadVisible() && !st.typing) {"]) {
    assert.ok(keys.indexOf(pane) > minimize, `a pane closes on esc before the chat minimizes: ${pane.trim()}`);
  }
  assert.match(cut(keys, "experienceNext() && st.open && !inField", "\n  }", "hold-numbers.js"), /closeTile\(\)/);
  assert.match(cut(focus, "function closeTile() {", "\n}", "focus-navigation.js"), /keepPane\(\)/);
});

test("esc closes an open model, effort or login menu before it minimizes the chat", () => {
  const picker = keys.indexOf('if (e.key === "Escape" && document.querySelector(".sv-menu"))');
  assert.ok(picker > 0, "esc with a menu open no longer closes the menu");
  assert.ok(picker < keys.indexOf("experienceNext() && st.open && !inField"), "esc minimizes the chat with its menu still open");
  assert.match(cut(keys, 'if (e.key === "Escape" && document.querySelector(".sv-menu"))', "\n  }", "hold-numbers.js"), /closeEveryPicker\(true\)/);
});
