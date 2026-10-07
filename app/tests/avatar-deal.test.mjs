import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dealFaces, faceSlot, nearestFree, slotIsFree, SLOTS, SHAPES, COLOURS, FACES, avatarFor } from "../assets/avatar/avatar.mjs";
import { app, state, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const gateView = readFileSync(join(HERE, "src", "settings", "face.jsx"), "utf8");
const doorSource = readFileSync(join(HERE, "src", "app", "new-chat.js"), "utf8");

const st = await state();
const { avatarKey } = await app("core");
const { devFace, takenSlots } = await app("team");
const { facePickerViewModel, ownerOfSlot, paintBrandAvatar, wAvatar } = await app("welcome");
const { gateViewModel, offerFace, onGateClick, pickFace } = await app("brand-face");
const { avatarPulse, saveAvatar } = await app("avatars");
const { faceSheetOpen, toggleFaceSheet } = await app("face-door");
await app("new-chat");

const roster = (...names) => names.map((n) => (typeof n === "string" ? { dev: n, avatar: "" } : n));
const slots = (map) => [...map.values()].map(faceSlot);
const shot = (map) => [...map].map(([d, s]) => `${d}=${faceSlot(s)}`).sort().join(",");

test("nine people, nine different faces", () => {
  const dealt = dealFaces(roster("art", "guilherme", "joao", "joaobl", "jott4", "pedro", "rafaelandrade", "ricardo", "vitor"));
  assert.equal(dealt.size, 9);
  assert.equal(new Set(slots(dealt)).size, 9);
});

test("the same roster deals the same faces however it arrives", () => {
  /* the rows come sorted by how busy people are, which is a different order on every mac */
  const base = roster("vitor", "art", "joao", "pedro", "zed");
  const shuffles = [base, [...base].reverse(), [base[2], base[4], base[0], base[3], base[1]], [base[3], base[1], base[4], base[2], base[0]]];
  const seen = new Set(shuffles.map((r) => shot(dealFaces(r))));
  assert.equal(seen.size, 1, "two hives would have drawn different faces for the same team");
});

test("a face somebody wrote down is a face they keep", () => {
  const dealt = dealFaces([{ dev: "zed", avatar: "ball/dark/blue" }, ...roster("aaa", "bbb")]);
  assert.equal(faceSlot(dealt.get("zed")), "ball/blue");
});

test("two people who chose the same are separated by name, not by luck", () => {
  const dealt = dealFaces([{ dev: "vitor", avatar: "ball/dark/blue" }, { dev: "art", avatar: "ball/dark/blue" }]);
  assert.equal(faceSlot(dealt.get("art")), "ball/blue", "the earlier name keeps it");
  assert.notEqual(faceSlot(dealt.get("vitor")), "ball/blue");
  assert.equal(new Set(slots(dealt)).size, 2);
});

test("the expression is yours, the shape and the colour are one each", () => {
  const dealt = dealFaces([{ dev: "a", avatar: "ball/dark/blue" }, { dev: "b", avatar: "ball/light/blue" }]);
  assert.notEqual(faceSlot(dealt.get("a")), faceSlot(dealt.get("b")), "same shape and colour is the clash, whatever the face");
  const free = dealFaces([{ dev: "a", avatar: "ball/dark/blue" }, { dev: "b", avatar: "wide/dark/blue" }]);
  assert.equal(new Set(slots(free)).size, 2, "sharing an expression is not a clash");
});

test("everyone fits until the seventy-third", () => {
  const many = Array.from({ length: SLOTS }, (_, i) => ({ dev: `d${String(i).padStart(3, "0")}`, avatar: "" }));
  assert.equal(new Set(slots(dealFaces(many))).size, SLOTS, `${SLOTS} people must each get their own`);
  const over = dealFaces([...many, { dev: "zzz", avatar: "" }]);
  assert.equal(over.size, SLOTS + 1, "the seventy-third still gets a face, it just is not their own");
});

test("nearestFree only ever returns something free", () => {
  const taken = new Set();
  for (const shape of SHAPES) for (const colour of COLOURS.slice(0, 7)) taken.add(`${shape}/${colour}`);
  for (const shape of SHAPES) {
    const got = nearestFree({ shape, face: "dark", colour: COLOURS[0] }, taken);
    assert.ok(slotIsFree(got, taken), `walked from ${shape} onto a taken slot`);
  }
});

test("a fresh person keeps the face their name would have given them, when it is free", () => {
  const wanted = avatarFor("solo");
  const dealt = dealFaces(roster("solo"));
  assert.equal(faceSlot(dealt.get("solo")), faceSlot(wanted));
});


document.getElementById("rail-team").remove();

const team = (me, devs) => {
  st.team = { me, devs: devs.map((d) => ({ seats: [], up: false, ...d })), sharing: false, players: [], version: 0 };
  st.data = { sessions: [], spawning: [], archived: [], pod: {} };
  st.myFace = null;
  st.configHas = {};
  st.faceAsked = false;
  st.configRead = true;
  st.gateSaid = "";
  st.configPath = "~/.hive/config.json";
  document.getElementById("welcome").hidden = true;
  document.getElementById("face-gate").hidden = true;
};

const wrote = [];
const answers = (ok) => {
  globalThis.fetch = async (url, how) => {
    const body = JSON.parse(how?.body || "{}");
    wrote.push(body);
    return { ok: true, json: async () => (ok ? { config: body.config } : { config: {} }) };
  };
};

test("the app refuses a taken face at the click and again at the save", async () => {
  team("me", [{ dev: "art", avatar: "ball/dark/blue" }, { dev: "me", avatar: "" }]);
  const mine = wAvatar();
  assert.equal(ownerOfSlot({ ...mine, shape: "ball", colour: "blue" }), "art", "the click must ask who owns it");
  pickFace("shape", "ball");
  pickFace("colour", "blue");
  assert.notEqual(faceSlot(wAvatar()), "ball/blue", "and refuse instead of writing it");

  pickFace("hat", "cap");
  assert.equal(st.myWear.hat, "cap", "a hat is never anybody's to own");
  st.myWear = {};

  answers(true);
  st.myFace = { shape: "ball", face: "dark", colour: "blue" };
  await saveAvatar();
  assert.notEqual(faceSlot(st.myFace), "ball/blue", "the save is the last gate, for a config edited by hand");
  assert.ok(!takenSlots().has(faceSlot(st.myFace)), "and it moves you rather than letting two people share");
});

test("a face the deal drew for somebody who never chose is nobody's to hold", async () => {
  const drawn = avatarFor("pedro");
  team("me", [{ dev: "pedro", avatar: "" }, { dev: "me", avatar: "" }]);
  assert.equal(faceSlot(devFace("pedro")), faceSlot(drawn), "the wall shows pedro the face the deal drew");
  assert.equal(ownerOfSlot({ ...wAvatar(), shape: drawn.shape, colour: drawn.colour }), "", "but the picker does not grey it as his");
  assert.ok(!takenSlots().has(faceSlot(drawn)), "and the save does not move you off it");
  answers(true);
  wrote.length = 0;
  await pickFace("shape", drawn.shape);
  await pickFace("colour", drawn.colour);
  assert.equal(faceSlot(wAvatar()), faceSlot(drawn), "so you get to wear it");
  assert.notEqual(faceSlot(devFace("pedro")), faceSlot(drawn), "and pedro is drawn another");

  team("me", [{ dev: "pedro", avatar: avatarKey(drawn) }, { dev: "me", avatar: "" }]);
  assert.equal(ownerOfSlot({ ...wAvatar(), shape: drawn.shape, colour: drawn.colour }), "pedro", "once he writes it down, it is his");
});

test("a face picked in the settings is written down as it is picked", async () => {
  team("me", [{ dev: "me", avatar: "" }]);
  answers(true);
  wrote.length = 0;
  const other = SHAPES.find((s) => s !== wAvatar().shape);
  await pickFace("shape", other);
  assert.equal(wrote.length, 1, "no door closes on the settings panel, so the pick is the write");
  assert.equal(wrote[0].config.avatar, avatarKey(wAvatar()));

  wrote.length = 0;
  st.petChoice = "off";
  toggleFaceSheet(true);
  await pickFace("shape", SHAPES.find((s) => s !== wAvatar().shape));
  assert.deepEqual(wrote, [], "the sheet still writes only when it closes");
  toggleFaceSheet(false);
  assert.equal(wrote.length, 1);
  st.petChoice = "";
});

test("a click inside the gate goes through the same pick", () => {
  team("me", [{ dev: "art", avatar: "ball/dark/blue" }, { dev: "me", avatar: "" }]);
  const box = document.getElementById("face-gate");
  box.hidden = false;
  box.innerHTML = '<button data-w="face-set" data-part="shape" data-value="ball"></button><button data-w="face-set" data-part="colour" data-value="blue"></button>';
  for (const b of box.querySelectorAll("button")) onGateClick({ target: b });
  assert.notEqual(faceSlot(wAvatar()), "ball/blue", "the step refuses what the welcome refuses");
  box.innerHTML = "";
  box.hidden = true;
});

test("the picker offers the face and then the wardrobe — shape and colour one each, clothes anybody's", () => {
  team("me", [{ dev: "art", avatar: "ball/dark/blue" }, { dev: "me", avatar: "" }]);
  st.myFace = { shape: "wide", face: "dark", colour: "blue" };
  st.myWear = { hat: "cap" };
  const rows = facePickerViewModel();
  assert.deepEqual(rows.map((r) => r.part), ["style", "shape", "colour", "glasses", "hat", "extra"], "the screen has one tone now, so it is not a row");
  assert.equal(rows.find((r) => r.part === "shape").opts.some((o) => o.taken) || rows.find((r) => r.part === "colour").opts.some((o) => o.taken), true, "a shape or colour somebody wears is marked");
  assert.match(rows.find((r) => r.part === "shape").opts[0].svg, /data-wear="hat:cap"/, "the face options are drawn wearing what you have on");
  assert.equal(rows.slice(3).flatMap((r) => r.opts).some((o) => o.taken), false, "two people in the same hat is fine");
  const hats = rows.find((r) => r.part === "hat");
  assert.equal(hats.opts[0].value, "none", "nothing on is the first answer");
  assert.deepEqual(hats.opts.filter((o) => o.worn).map((o) => o.value), ["cap"]);
  assert.deepEqual(rows.find((r) => r.part === "glasses").opts.filter((o) => o.worn).map((o) => o.value), ["none"]);
  assert.match(hats.opts.find((o) => o.value === "beanie").svg, /data-wear="hat:beanie"/, "every option is drawn on your own face");
  st.myWear = {};
});

test("the face is asked for as a step, and only while there is none written down", () => {
  const gate = () => document.getElementById("face-gate");

  team("", [{ dev: "art", avatar: "" }]);
  offerFace();
  assert.equal(gate().hidden, true, "no name yet means no ask");

  team("me", [{ dev: "me", avatar: "" }]);
  st.configRead = false;
  offerFace();
  assert.equal(gate().hidden, true, "no config read yet means no ask");

  team("me", [{ dev: "me", avatar: "" }]);
  st.configHas.avatar = true;
  offerFace();
  assert.equal(gate().hidden, true, "decided already means no ask");

  team("me", [{ dev: "me", avatar: "" }]);
  document.getElementById("welcome").hidden = false;
  offerFace();
  assert.equal(gate().hidden, true, "the welcome has its own picker; do not ask twice");
  document.getElementById("welcome").hidden = true;

  team("me", [{ dev: "me", avatar: "" }]);
  offerFace();
  assert.equal(gate().hidden, false);
  gate().hidden = true;
  offerFace();
  assert.equal(gate().hidden, true, "and it is asked once, never again");
});

test("the triangle is not offered the tie, and keeps everything else", () => {
  team("me", [{ dev: "me", avatar: "" }]);
  st.myFace = { shape: "triangle", face: "dark", colour: "green" };
  st.myWear = {};
  const extras = facePickerViewModel().find((r) => r.part === "extra").opts.map((o) => o.value);
  assert.deepEqual(extras, ["none", "bowtie", "bow", "scarf", "moustache"], "no room under a screen that sits on the floor");
  st.myFace = { shape: "ball", face: "dark", colour: "green" };
  assert.ok(facePickerViewModel().find((r) => r.part === "extra").opts.some((o) => o.value === "tie"), "every other body is offered it");
});

test("the answer is already on screen, so the step is never a trap", () => {
  team("me", [{ dev: "me", avatar: "" }]);
  const model = gateViewModel();
  assert.match(model.mug, /<svg/, "the suggestion is shown, not an empty slot");
  assert.equal(model.keep, "This one is me", "and taking it is one click");
  assert.deepEqual(model.rows.map((r) => r.part), ["style", "shape", "colour", "glasses", "hat", "extra"], "with every option right there");
  assert.match(model.say, /Asked once/, "and it says out loud that the asking happens once");
  assert.match(model.say, /the face at the top of the window is where you change it/, "and where the door is afterwards");
  assert.equal(model.roll, "Another");
  assert.match(gateView, /data-fg="keep"/);
});

test("the ask happens once; the answer can be changed for as long as you use the hive", () => {
  team("me", [{ dev: "me", avatar: "" }]);
  assert.deepEqual(Object.keys(gateViewModel()).filter((k) => k === "later" || k === "close"), [], "there is no later on the step: it is one decision");
  assert.ok(!/data-fg="later"|data-fg="close"/.test(gateView), "and no way out of it painted either");
  assert.match(page, /id="brand-mug" aria-haspopup="dialog"/, "the face at the top is a button, not a picture");
  assert.match(doorSource, /\$\("brand-mug"\)\.addEventListener\("click", \(e\) => \{ e\.stopPropagation\(\); toggleFaceSheet\(\); \}\);/,
    "the face at the top no longer opens the sheet when it is clicked");
  assert.equal(faceSheetOpen(), false);
  toggleFaceSheet();
  assert.equal(faceSheetOpen(), true, "and clicking it opens the sheet");
  toggleFaceSheet(false);
});

test("the sheet writes the face down once, and only if it changed", async () => {
  team("me", [{ dev: "me", avatar: "" }]);
  answers(true);
  wrote.length = 0;
  toggleFaceSheet(true);
  assert.equal(st.faceSheetFrom, avatarKey(wAvatar()), "opening remembers what you walked in with");
  toggleFaceSheet(false);
  assert.deepEqual(wrote, [], "closing on the same face writes nothing");

  toggleFaceSheet(true);
  await pickFace("glasses", "round");
  assert.equal(wrote.length, 1, "a piece is written the moment it is picked");
  assert.deepEqual(wrote[0].config, { avatar: avatarKey(wAvatar()), wear: "glasses:round" }, "and the face goes with it");
  assert.equal(st.configHas.avatar, true, "which is what holds the pair");
  toggleFaceSheet(false);
  assert.equal(wrote.length, 1, "closing on the same face writes nothing more");
  st.myWear = {};
});

test("a face picked from the top is refused the same way as one picked in the welcome", () => {
  team("me", [{ dev: "art", avatar: "ball/dark/blue" }, { dev: "me", avatar: "" }]);
  const sheet = document.getElementById("face-sheet");
  sheet.hidden = false;
  sheet.innerHTML = '<button data-w="face-set" data-part="shape" data-value="ball"></button><button data-w="face-set" data-part="colour" data-value="blue"></button>';
  for (const b of sheet.querySelectorAll("button")) b.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.notEqual(faceSlot(wAvatar()), "ball/blue", "the same pick, with the same clash check");
  sheet.innerHTML = "";
  sheet.hidden = true;
});

test("keeping the face writes it down, which is what holds the pair", async () => {
  team("me", [{ dev: "me", avatar: "" }]);
  const gate = document.getElementById("face-gate");
  gate.hidden = false;
  const keep = document.createElement("button");
  keep.dataset.fg = "keep";
  gate.appendChild(keep);

  answers(false);
  await onGateClick({ target: keep });
  assert.match(st.gateSaid, /your face could not be written down/, "keep must persist, or the pair is yours only by luck");
  assert.equal(gate.hidden, false, "and when it did not, the gate says so instead of pretending");
  assert.equal(keep.disabled, false, "so the person can try again");

  answers(true);
  await onGateClick({ target: keep });
  assert.equal(st.gateSaid, "");
  assert.equal(st.configHas.avatar, true, "and mark it settled, so the step never returns");
  assert.equal(gate.hidden, true);
  gate.innerHTML = "";
});

test("the picker is styled by what it is, not by where it happens to be", () => {
  assert.ok(!/\.w-picker \.opt\b/.test(page), "option styles must not be nailed to the welcome");
  assert.match(page, /\.facepick \.opt \{/);
  assert.match(gateView, /class="fg-pick facepick"/, "the step wears it");
  const welcome = readFileSync(join(HERE, "src", "app", "avatars.js"), "utf8");
  assert.match(welcome, /class="w-picker facepick/, "and so does the welcome");
});

test("the face at the top is the one the rest of the hive draws for you", () => {
  team("me", [{ dev: "art", avatar: "" }, { dev: "me", avatar: "" }]);
  st.myFace = { shape: "ball", face: "dark", colour: "blue" };
  st.petChoice = "off";
  const drawn = devFace("me");
  paintBrandAvatar();
  assert.equal(st.brandDrawn, avatarKey(drawn), "one source of truth, and it is the deal");
  const slot = document.getElementById("brand-mug");
  assert.equal(slot.hidden, false);
  assert.match(slot.innerHTML, /<svg/);
});

test("the top is repainted when the deal changes its mind", () => {
  team("me", [{ dev: "me", avatar: "" }]);
  st.petChoice = "off";
  st.mugPlayer = null;
  st.brandDrawn = "";
  avatarPulse();
  assert.equal(st.brandDrawn, avatarKey(devFace("me")), "only when there is a name, and nothing is playing");
  st.team = { ...st.team, devs: [{ dev: "aaa", avatar: avatarKey(devFace("me")) }, { dev: "me", avatar: "" }] };
  avatarPulse();
  assert.notEqual(st.brandDrawn, "", "and it records what it drew, or it would loop");
  assert.equal(st.brandDrawn, avatarKey(devFace("me")));
});
