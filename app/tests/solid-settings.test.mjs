import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const kept = new Map();
const source = (module) => {
  if (!kept.has(module)) kept.set(module, readFileSync(join(HERE, "src/app", `${module}.js`), "utf8"));
  return kept.get(module);
};

function slice(module, from, to = "solidMounts.push((hive) => {") {
  const text = source(module);
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${module}.js`);
  return text.slice(a, b);
}

const phrase = `const phrase = (t, v) => Object.entries(v || {}).reduce((s, [k, x]) => s.split("{" + k + "}").join(x), String(t));`;
const esc = `const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));`;

function run(world, body, back) {
  const names = Object.keys(world);
  return new Function(...names, `${phrase}\n${esc}\n${body}\nreturn ${back};`)(...Object.values(world));
}

/* ── the seat menu ── */

const menu = slice("seat-menu", "let menuSolid = null;");

test("a menu row carries its place in the rows the app kept, so a click lands on the right one", () => {
  const model = run({ st: {} }, menu, "menuViewModel")("a seat", [
    { label: "go", note: "⌘1" },
    { sep: true },
    { label: "close", danger: true, off: true }
  ]);
  assert.equal(model.cap, "a seat");
  assert.deepEqual(model.rows[0], { key: "row-0", at: 0, label: "go", note: "⌘1", danger: false, off: false });
  assert.deepEqual(model.rows[1], { key: "sep-1", sep: true });
  assert.deepEqual(model.rows[2], { key: "row-2", at: 2, label: "close", note: "", danger: true, off: true });
});

test("a menu with no caption still says so as an empty one, never as undefined", () => {
  assert.equal(run({ st: {} }, menu, "menuViewModel")(undefined, []).cap, "");
});

/* ── the mirror of somebody else's hive ── */

const mirror = slice("team", "let mirrorSolid = null;");

function mirrorWorld(over = {}) {
  return {
    avatarSvg: (spec, how) => `<svg data-salt="${how.salt}"/>`,
    faceSvg: (dev, salt) => `<svg data-salt="${salt}"/>`,
    devFace: (dev) => ({ dev }),
    stateColor: (s) => "#" + s,
    GLYPH: { working: "g-working", idle: "g-idle" },
    LABEL: { working: "working", idle: "idle" },
    st: { team: { me: "vitor" }, mirrorOpen: over.open || "", mirrorDev: over.dev || "joao" },
    knockHolds: () => false,
    knockedAt: () => 0,
    teamSeatKey: (dev, name) => `team:${dev}/${name}`,
    renderMarkdown: (t) => `<p>${t}</p>`,
    toneOf: (dev) => `tone-${dev}`,
    teamRow: () => over.row ?? null,
    mirrorRow: () => over.row ?? null,
    ...over.extra
  };
}

const mirrorModel = (over) => run(mirrorWorld(over), mirror, "mirrorViewModel")();

const seat = (name, over = {}) => ({ name, title: name, state: "working", when: "at 20:00", where: "local", ...over });

test("a hive that never answered shows nothing at all, one that is up says it is empty, one asleep says so", () => {
  assert.deepEqual(mirrorModel({ row: null }).empty, { key: "gone", dev: "", said: "" });
  const up = mirrorModel({ row: { dev: "joao", up: true, seats: [] } }).empty;
  assert.equal(up.dev, "joao");
  assert.match(up.said, /has the server up and nothing running/);
  const asleep = mirrorModel({ row: { dev: "joao", up: false, seats: [] } }).empty;
  assert.equal(asleep.dev, "", "the name is inside the sentence, not a bold of its own");
  assert.match(asleep.said, /joao's server is asleep\./);
  assert.match(asleep.said, /the hive comes back when joao does/);
});

test("a mirrored card says whose seat it is, what it is doing and where it runs", () => {
  const model = mirrorModel({ row: { dev: "joao", up: true, seats: [seat("b2", { model: "opus", summary: "merging" })] } });
  const [card] = model.cards;
  assert.equal(model.empty, null);
  assert.equal(card.key, "joao/b2");
  assert.equal(card.tone, "tone-joao");
  assert.equal(card.side.label, "working");
  assert.equal(card.side.glyph, "g-working");
  assert.equal(card.side.whereSaid, "joao's machine");
  assert.equal(card.side.model, "opus");
  assert.equal(card.side.summary, "merging");
  assert.equal(card.side.blank, false);
});

test("a seat on the pod names whose server it is, and one with no card written says so", () => {
  const model = mirrorModel({ row: { dev: "joao", up: true, seats: [seat("b2", { where: "cloud" })] } });
  assert.equal(model.cards[0].side.whereSaid, "joao's server");
  assert.equal(model.cards[0].side.blank, true);
  assert.equal(model.cards[0].side.summary, "no card written yet");
});

test("the keyboard bar offers to ask while it is theirs, and to give it back while it is yours", () => {
  const free = mirrorModel({ row: { dev: "joao", up: true, seats: [seat("b2")] } }).cards[0].kb;
  assert.equal(free.mine, false);
  assert.equal(free.who, "joao");
  assert.equal(free.act.kind, "knock");
  assert.equal(free.act.knock, "b2");
  assert.equal(free.act.give, undefined);
  assert.equal(free.act.label, "ask for the keyboard");
  const mine = mirrorModel({ row: { dev: "joao", up: true, seats: [seat("b2", { keyboard: { with: "vitor", turns: [] } })] } }).cards[0].kb;
  assert.equal(mine.mine, true);
  assert.equal(mine.act.kind, "give");
  assert.equal(mine.act.give, "b2");
  assert.equal(mine.act.label, "give it back");
});

test("a keyboard somebody else is holding offers no button at all", () => {
  const lent = mirrorModel({ row: { dev: "joao", up: true, seats: [seat("b2", { keyboard: { with: "ana" } })] } }).cards[0].kb;
  assert.equal(lent.act, null);
  assert.equal(lent.who, "ana");
});

test("an ask already sent shows as waiting, and the button will not be pressed twice", () => {
  const world = { ...mirrorWorld({ row: { dev: "joao", up: true, seats: [seat("b2")] } }), knockHolds: () => true, knockedAt: () => 1 };
  const kb = run(world, mirror, "mirrorViewModel")().cards[0].kb;
  assert.equal(kb.act.label, "asked — waiting");
  assert.equal(kb.act.off, true);
  assert.equal(kb.act.quiet, true);
});

test("the conversation and the composer are only there while the keyboard is ours and the chat is not open alone", () => {
  const lent = seat("b2", { keyboard: { with: "vitor", turns: [{ who: "you", text: "**hi**" }] } });
  const deck = mirrorModel({ row: { dev: "joao", up: true, seats: [lent] } }).cards[0];
  assert.equal(deck.talk.chat, "team:joao/b2");
  assert.deepEqual(deck.talk.turns, [{ key: "0:you:**hi**", you: true, html: "<p>**hi**</p>" }]);
  assert.equal(deck.composer.send, "send");
  const alone = mirrorModel({ open: "b2", row: { dev: "joao", up: true, seats: [lent] } }).cards[0];
  assert.equal(alone.shown, true);
  assert.equal(alone.talk, null, "the well takes over from the preview when the seat is opened alone");
  assert.equal(alone.composer, null);
});

test("a turn is keyed by what it says, so an edited turn is a new node and gets its links wired again", () => {
  const turns = [{ who: "them", text: "one" }, { who: "them", text: "two" }];
  const talk = mirrorModel({ row: { dev: "joao", up: true, seats: [seat("b2", { keyboard: { with: "vitor", turns } })] } }).cards[0].talk;
  assert.deepEqual(talk.turns.map((one) => one.key), ["0:them:one", "1:them:two"]);
});

/* ── the settings ── */

const choices = slice("preferences", "let choiceSolids = null;");

test("every dropdown in the settings offers what the app knows and marks what is worn", () => {
  const model = run({
    LANGUAGES: [{ id: "en", short: "EN", name: "english" }, { id: "pt-BR", short: "PT", name: "português" }],
    PET_NAMES: { blob: "the little you", off: "none, thanks" },
    BRAND_NAMES: { always: "always", auto: "not when the rail wears it" },
    GAZE_NAMES: { off: "no, let it be", screen: "anywhere on the screen" },
    LAYOUTS: ["grid", "row"],
    LAYOUT_NAMES: { grid: "in a grid", row: "side by side, in one row" },
    LOOK_NAMES: { classic: "classic, as it was", dimension: "dimension, the new one" }, LOOK_DEFAULT: "classic",
    VISUAL_NAMES: { lean: "lean: nothing moves, no blur", full: "full: motion and blur, costs memory and battery" }, visualWorn: () => "full",
    PET_ON: "blob", PET_OFF: "off", brandFace: "auto",
    st: { language: "pt-BR", petChoice: "blob", gazeMode: "screen", seatLayout: "row", LIMIT: 4 }
  }, choices, "choicesViewModel")();
  assert.deepEqual(model.lang[0], { key: "en", value: "en", label: "EN · english" });
  assert.deepEqual(model.pet.map((one) => one.value), ["blob", "off"]);
  assert.equal(model.langWorn, "pt-BR");
  assert.equal(model.layoutWorn, "row");
  assert.deepEqual(model.visual.map((one) => one.value), ["lean", "full"]);
  assert.equal(model.visualWorn, "full");
  assert.equal(model.gazeOff, false);
  assert.equal(model.size, 4);
});

test("the eyes cannot be aimed when there is nobody to aim them", () => {
  const model = run({
    LANGUAGES: [], PET_NAMES: {}, BRAND_NAMES: {}, GAZE_NAMES: {}, LAYOUTS: [], LAYOUT_NAMES: {},
    LOOK_NAMES: {}, LOOK_DEFAULT: "classic", VISUAL_NAMES: {}, visualWorn: () => "lean",
    PET_ON: "blob", PET_OFF: "off", brandFace: "auto",
    st: { language: "en", petChoice: "off", gazeMode: "screen", seatLayout: "grid", LIMIT: 4 }
  }, choices, "choicesViewModel")();
  assert.equal(model.gazeOff, true);
  assert.equal(model.petWorn, "off");
});

const themes = slice("themes", "let themesSolid = null;");

const themeDef = (bg) => ({ ui: { bg, txt: "#fff", txt2: "#aaa", accent: "#f00" }, terminal: { red: "#f00", green: "#0f0", yellow: "#ff0", blue: "#00f", magenta: "#f0f", cyan: "#0ff" } });

test("a theme card shows the palette it wears and the acts you may do to it", () => {
  const model = run({
    fullThemeDef: (def) => def,
    wornThemeName: () => "Nord",
    BUILTIN_THEMES: [{ name: "Hive", def: themeDef("#111") }, { name: "Nord", def: themeDef("#222") }],
    st: { customThemes: { Mine: themeDef("#333") } },
    builtinTheme: (name) => ["Hive", "Nord"].includes(name) || undefined
  }, themes, "themesViewModel")();
  assert.deepEqual(model.cards.map((one) => one.name), ["Hive", "Nord", "Mine"]);
  assert.deepEqual(model.cards.map((one) => one.here), [false, true, false]);
  assert.equal(model.cards[0].dots.length, 7);
  assert.deepEqual(model.cards[0].acts.map((one) => one.act), ["tweak", "share"]);
  assert.deepEqual(model.cards[2].acts.map((one) => one.act), ["edit", "share", "delete"]);
  assert.equal(model.cards[2].custom, true);
});

/* ── the face ── */

const picker = slice("welcome", "function facePickerViewModel()", "function paintAvatar()");

const WORN = { none: "none", round: "round", square: "square", cap: "cap", beanie: "beanie", moustache: "moustache", bowtie: "bow tie" };

function faceWorld(wear = {}) {
  return {
    wAvatar: () => ({ shape: "drop", face: "curious", colour: "blue" }),
    ownerOfSlot: (spec) => (spec.colour === "pink" ? "ana" : ""),
    SHAPES: ["drop", "cloud"], FACES: ["curious", "wink"], COLOURS: ["blue", "pink"],
    wWear: () => wear,
    wDressed: () => ({ shape: "drop", face: "curious", colour: "blue", wear }),
    dressedKey: (spec) => `${spec.shape}/${spec.face}/${spec.colour} ${Object.entries(spec.wear || {}).map(([k, v]) => `${k}:${v}`).join(" ")}`.trim(),
    avatarSvg: (spec, how) => `<svg data-salt="${how.salt}" data-wear="${Object.entries(spec.wear || {}).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(" ")}"/>`,
    WEAR: { glasses: ["round", "square"], hat: ["cap", "beanie"], marks: ["moustache"], extra: ["bowtie"] },
    WEAR_SLOTS: ["glasses", "hat", "marks", "extra"],
    fitsBody: () => true,
    WEAR_SLOT_WORD: { glasses: "glasses", hat: "hat", marks: "face marks", extra: "extra bits" },
    WEAR_WORD: WORN,
    st: { myBlob: false },
    BLOB_FACE: "blobatar",
    myName: () => "joao",
    personFace: (name) => `<svg data-blob="${name}"/>`,
    myFaceSvg: (salt) => `<svg data-salt="${salt}"/>`
  };
}

test("the picker offers the face, then a row per slot, none first, every piece drawn on your own face over what you wear", () => {
  const [style, ...rows] = run(faceWorld({ hat: "cap" }), picker, "facePickerViewModel")();
  assert.equal(style.part, "style");
  assert.deepEqual(rows.map((one) => one.part), ["shape", "face", "colour", "glasses", "hat", "marks", "extra"]);
  assert.deepEqual(rows.slice(3).map((one) => one.cap), ["glasses", "hat", "face marks", "extra bits"]);
  const colours = rows[2].opts;
  assert.equal(colours[0].worn, true);
  assert.equal(colours[1].taken, true);
  assert.equal(colours[1].title, "pink — ana already wears it");
  assert.match(colours[0].svg, /data-salt="colour-blue"/);
  assert.match(colours[0].svg, /data-wear="hat:cap"/, "the face is tried on wearing what you have on");
  const hats = rows[4].opts;
  assert.deepEqual(hats.map((one) => one.value), ["none", "cap", "beanie"]);
  assert.deepEqual(hats.map((one) => one.worn), [false, true, false]);
  assert.equal(hats[2].title, "beanie");
  assert.match(hats[2].svg, /data-salt="hat-beanie"/);
  assert.match(hats[2].svg, /data-wear="hat:beanie"/);
  assert.match(hats[0].svg, /data-wear=""/, "none is drawn with the hat off");
  const glasses = rows[3].opts;
  assert.deepEqual(glasses.map((one) => one.worn), [true, false, false], "nothing on is what is worn until something is");
  assert.match(glasses[1].svg, /data-wear="hat:cap glasses:round"/, "over the hat already on");
});

test("the expression and the wardrobe are never taken from anyone — only shape and colour are one each", () => {
  const rows = run({ ...faceWorld(), ownerOfSlot: () => "ana" }, picker, "facePickerViewModel")().slice(1);
  assert.deepEqual(rows[0].opts.map((one) => one.taken), [true, true]);
  assert.deepEqual(rows[1].opts.map((one) => one.taken), [false, false]);
  assert.equal(rows.slice(3).flatMap((one) => one.opts).some((one) => one.taken), false);
});

test("the style row is first, the robot worn by default and the blobatar drawn from the name", () => {
  const [style] = run(faceWorld(), picker, "facePickerViewModel")();
  assert.deepEqual(style.opts.map((one) => [one.value, one.worn, one.taken]), [["robot", true, false], ["blobatar", false, false]]);
  assert.match(style.opts[0].svg, /data-salt="style-robot"/);
  assert.equal(style.opts[1].svg, '<svg data-blob="joao"/>');
});

test("a blobatar has only the style row: no body, colour or wardrobe to pick", () => {
  const rows = run({ ...faceWorld(), st: { myBlob: true } }, picker, "facePickerViewModel")();
  assert.deepEqual(rows.map((one) => one.part), ["style"]);
  assert.deepEqual(rows[0].opts.map((one) => one.worn), [false, true]);
});

const gate = slice("brand-face", "let gateSolid = null;");

test("the step shows the face it drew, the whole picker and the two ways out", () => {
  const model = run({ ...faceWorld(), facePickerViewModel: () => [{ key: "hat" }], st: { gateSaid: "" } }, gate, "gateViewModel")();
  assert.match(model.mug, /data-salt="gate"/);
  assert.match(model.head, /Pick the face the team will know you by/);
  assert.match(model.say, /Asked once/);
  assert.equal(model.keep, "This one is me");
  assert.equal(model.roll, "Another");
  assert.equal(model.bad, "");
  assert.equal(model.rows.length, 1);
});

test("a face that could not be written down leaves the step up with the reason on it", () => {
  const model = run({ ...faceWorld(), facePickerViewModel: () => [], st: { gateSaid: "nothing was saved" } }, gate, "gateViewModel")();
  assert.equal(model.bad, "nothing was saved");
});

const cfgFace = slice("welcome", "let cfgFaceSolid = null;");

test("the picker in the settings is a way in, not a wall: shut it costs nothing to draw", () => {
  const shut = run({ ...faceWorld(), st: { cfgFaceOpen: false }, facePickerViewModel: () => [1, 2, 3] }, cfgFace, "settingsFaceViewModel")();
  assert.deepEqual(shut.rows, []);
  assert.equal(shut.way, "change");
  assert.equal(shut.open, false);
  const open = run({ ...faceWorld(), st: { cfgFaceOpen: true }, facePickerViewModel: () => [1, 2, 3] }, cfgFace, "settingsFaceViewModel")();
  assert.equal(open.rows.length, 3);
  assert.equal(open.way, "done");
});

const sheet = slice("face-door", "let faceSheetSolid = null;");

test("the sheet the mug opens carries the same picker, a roll of its own and a way to take it all off", () => {
  const model = run({ ...faceWorld(), facePickerViewModel: () => [1, 2, 3] }, sheet, "faceSheetViewModel")();
  assert.match(model.mug, /data-salt="sheet"/);
  assert.equal(model.head, "your face in the hive");
  assert.match(model.say, /the screen is free, and so is what it wears/);
  assert.equal(model.roll, "Another");
  assert.equal(model.strip, "take it all off");
  assert.equal(model.done, "done");
  assert.equal(model.rows.length, 3);
});

/* ── the shortcuts ── */

const keysPanel = slice("leader-key", "let keysGridSolid = null;");

function keysWorld(over = {}) {
  const ACTION_GROUPS = [["chats", "chats and seats", ["new"]], ["moving", "moving around", ["seat"]]];
  const ACTION_SAID = { new: "opens a chat", seat: "goes to seat {limit}" };
  return {
    ACTION_GROUPS,
    ACTION_SAID,
    ACTIONS: ACTION_GROUPS.flatMap(([, , actions]) => actions.map((a) => [a, ACTION_SAID[a]])),
    st: {
      LIMIT: 4,
      keys: { new: { code: "KeyN", ctrl: true }, seat: { code: "Digit" }, type: { code: "KeyI" }, release: { code: "Escape" } },
      chords: { new: { code: "KeyC" } },
      leader: over.leader === undefined ? { code: "KeyB", ctrl: true } : over.leader,
      capturing: over.capturing ?? null,
      directMode: over.directMode || "on",
      keysOpen: over.open ?? false,
      keysFilter: over.filter ?? ""
    },
    DEFAULT_LEADER: { code: "KeyB", ctrl: true },
    IS_MAC: false,
    silenced: (a) => a === "new" && over.silenced === true,
    digitSpan: () => 4,
    keyLabel: (b) => (b ? b.code : "—"),
    keyHint: (a) => `hint:${a}`
  };
}

const rowsOf = (model) => model.groups.flatMap((group) => group.rows);

test("the list starts folded, with one line saying how many actions answer a key", () => {
  const model = run(keysWorld(), keysPanel, "keysGridModel")();
  assert.equal(model.open, false);
  assert.equal(model.summary, "2 of 2 actions answer a key — the rest are one click from having one");
  assert.equal(model.toggle, "show them all");
  const open = run(keysWorld({ open: true }), keysPanel, "keysGridModel")();
  assert.equal(open.open, true);
  assert.equal(open.toggle, "fold the list");
});

test("every action sits in its group with its direct key, and the second column only while the leader is on", () => {
  const model = run(keysWorld(), keysPanel, "keysGridModel")();
  assert.deepEqual(model.groups.map((group) => group.title), ["chats and seats", "moving around", "the ones you cannot change"]);
  const rows = rowsOf(model).filter((row) => !row.fixed);
  assert.deepEqual(rows.map((one) => one.action), ["new", "seat"]);
  assert.equal(rows[0].label, "KeyN");
  assert.equal(rows[0].chord.label, "KeyC");
  assert.equal(rows[1].chord.label, "—");
  assert.equal(rows[1].chord.unset, true);
  assert.equal(rows[1].desc, "goes to seat 4");
  assert.deepEqual(model.head, { action: "what it does", direct: "shortcut", chord: "after KeyB" });
  const bare = run(keysWorld({ leader: null }), keysPanel, "keysGridModel")();
  assert.equal(rowsOf(bare)[0].chord, null);
  assert.equal(bare.head.chord, null);
});

test("a key being captured says so in its own cell, and a silenced one says why it is grey", () => {
  const model = run(keysWorld({ capturing: "new", silenced: true }), keysPanel, "keysGridModel")();
  const rows = rowsOf(model);
  assert.equal(rows[0].label, "press…");
  assert.equal(rows[0].capturing, "direct");
  assert.equal(rows[0].muted, true);
  assert.equal(rows[0].title, "off while the leader is on");
  assert.equal(rows[1].title, "click to change");
  const chord = run(keysWorld({ capturing: "chord:seat" }), keysPanel, "keysGridModel")();
  assert.equal(rowsOf(chord)[1].chord.label, "press…");
  assert.equal(rowsOf(chord)[1].capturing, "chord");
});

test("an action with no key yet says so on the cell, so the click is an offer and not a mistake", () => {
  const world = keysWorld();
  world.st.keys.new = null;
  world.st.chords.new = null;
  const model = run(world, keysPanel, "keysGridModel")();
  assert.equal(rowsOf(model)[0].unset, true);
  assert.equal(rowsOf(model)[0].title, "no shortcut yet — click to set one");
  assert.equal(model.summary, "1 of 2 actions answer a key — the rest are one click from having one");
});

test("the search narrows the list by what it does or by the key, and says so when nothing is left", () => {
  const model = run(keysWorld({ filter: "seat" }), keysPanel, "keysGridModel")();
  assert.deepEqual(rowsOf(model).map((row) => row.action || row.key), ["seat", "swap"]);
  const byKey = run(keysWorld({ filter: "keyn" }), keysPanel, "keysGridModel")();
  assert.deepEqual(rowsOf(byKey).map((row) => row.action), ["new"]);
  const none = run(keysWorld({ filter: "zzz" }), keysPanel, "keysGridModel")();
  assert.deepEqual(none.groups, []);
  assert.equal(none.empty, "nothing here answers to that");
});

test("the five combinations the app does not let you change close the list", () => {
  const model = run(keysWorld(), keysPanel, "keysGridModel")();
  const fixed = model.groups.at(-1);
  assert.equal(fixed.fixed, true);
  assert.deepEqual(fixed.rows.map((one) => one.combo), ["Ctrl+V", "⇧Enter", "drag", "drag", "Esc"]);
});

test("the leader line offers to turn it off while it is on, and on while it is off", () => {
  const on = run(keysWorld(), keysPanel, "keysLeaderModel")();
  assert.equal(on.on, true);
  assert.equal(on.label, "KeyB");
  assert.equal(on.turn, "turn the leader key off");
  assert.match(on.tail, /Pressing it twice sends it to the terminal\.$/);
  assert.equal(on.direct, "the direct shortcuts on the left work too");
  assert.equal(on.flip, "turn them off");
  const off = run(keysWorld({ leader: null }), keysPanel, "keysLeaderModel")();
  assert.equal(off.on, false);
  assert.equal(off.turn, "turn the leader key on");
  assert.match(off.off, /one prefix \(KeyB\)/);
});

test("the direct shortcuts handed to Claude Code say so, with the way back", () => {
  const model = run(keysWorld({ directMode: "off" }), keysPanel, "keysLeaderModel")();
  assert.match(model.direct, /the direct shortcuts are off — every ctrl combination/);
  assert.equal(model.flip, "bring them back");
});

/* ── the release notes ── */

const relnotes = slice("tour", "let relnotesSolid = null;");

function notesWorld(over = {}) {
  return {
    st: {
      updateState: over.state || { behind: 4, tag: "hive-2026.08.23-7712d0d5", number: 814, via: "release", packaged: true, assetSize: 2097152, notes: [] },
      showAllNotes: !!over.all,
      held: over.held || null
    },
    notesIn: (d) => d.notes || [],
    versionOf: (tag, number) => (number > 0 ? `#${number}` : String(tag || "")),
    plural: (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`,
    megabytes: (b) => (b > 0 ? `${(b / 1048576).toFixed(0)} MB` : ""),
    NOTE_TAG: { new: "new", fixed: "fix" }
  };
}

const note = (text, kind = "fixed") => ({ kind, text, pr: "" });

test("the notes panel shows the first few and says how many it is holding back", () => {
  const state = { behind: 5, tag: "t", number: 9, via: "release", packaged: true, assetSize: 2097152, notes: [1, 2, 3, 4, 5].map((n) => note(`change ${n}`)) };
  const model = run(notesWorld({ state }), relnotes, "relnotesViewModel")();
  assert.equal(model.ver, "#9");
  assert.equal(model.count, "5 changes");
  assert.deepEqual(model.notes.map((one) => one.text), ["change 1", "change 2", "change 3"]);
  assert.equal(model.notes[0].delay, "40ms");
  assert.equal(model.notes[1].delay, "85ms");
  assert.equal(model.more, "+2 more");
  assert.equal(model.size, "2 MB");
  assert.equal(model.go, "Update and restart");
});

test("asked for all of them, the panel stops saying there are more", () => {
  const state = { behind: 5, tag: "t", number: 9, via: "pack", notes: [1, 2, 3, 4, 5].map((n) => note(`change ${n}`)) };
  const model = run(notesWorld({ state, all: true }), relnotes, "relnotesViewModel")();
  assert.equal(model.notes.length, 5);
  assert.equal(model.more, "");
  assert.equal(model.go, "Update");
  assert.match(model.sub, /Just the javascript/);
});

test("an update that stopped says why on the panel and offers to try again", () => {
  const model = run(notesWorld({ held: { lead: "did not go", why: "no zip in that release" } }), relnotes, "relnotesViewModel")();
  assert.deepEqual(model.why, { lead: "did not go", said: "no zip in that release" });
  assert.equal(model.go, "try again");
});

test("the housekeeping left out of the list is counted at the foot of it", () => {
  const state = { behind: 2, tag: "t", number: 9, via: "release", packaged: true, quiet: 3, notes: [note("a")] };
  const model = run(notesWorld({ state }), relnotes, "relnotesViewModel")();
  assert.match(model.sub, /3 housekeeping commits stayed out of this list\./);
});

const whatsNew = slice("whats-new", "let whatsNewSolid = null;");

test("what landed leads with the news and groups the rest by what kind of change it was", () => {
  const model = run({
    releasesUrl: () => "https://github.com/x/y/releases",
    versionOf: (tag, number) => (number > 0 ? `#${number}` : String(tag || "")),
    plural: (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`,
    NOTE_TAG: { new: "new", fixed: "fix" },
    NOTE_GROUP: [["new", "new"], ["fixed", "fixed"], ["", "also"]]
  }, whatsNew, "whatsNewViewModel")({
    tag: "t", number: 9, from: "old", fromNumber: 7, releases: 2, quiet: 1,
    notes: [{ kind: "fixed", text: "a fix", pr: "#1" }, { kind: "new", text: "a thing", pr: "" }, { kind: "", text: "loose", pr: "" }]
  });
  assert.equal(model.lead.title, "a thing");
  assert.equal(model.lead.tag, "new");
  assert.match(model.lead.body, /It came in with 2 builds that went out while this app was on #7\./);
  assert.deepEqual(model.groups.map((one) => one.key), ["fixed", ""]);
  assert.deepEqual(model.groups[0].items.map((one) => one.text), ["a fix"]);
  assert.equal(model.groups[0].items[0].delay, "420ms");
  assert.equal(model.groups[0].count, 1);
  assert.match(model.chip, /<s>#7<\/s><em>→<\/em>#9/);
  assert.match(model.quiet, /1 housekeeping commit stayed out of this list\./);
  assert.match(model.quiet, /See the whole release/);
});

test("one change landed is one change, and a hive with no releases page links nowhere", () => {
  const model = run({
    releasesUrl: () => "",
    versionOf: (tag) => String(tag),
    plural: (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`,
    NOTE_TAG: {}, NOTE_GROUP: [["", "also"]]
  }, whatsNew, "whatsNewViewModel")({ tag: "t", notes: [{ kind: "", text: "only one", pr: "" }] });
  assert.equal(model.headline, "change landed while you were working");
  assert.equal(model.quiet, "");
  assert.equal(model.lead.tag, "change");
  assert.deepEqual(model.groups, [], "the only note is the lead, so no group is left to draw");
});

/* ── the tour ── */

const tour = slice("tour", "let tourSolid = null;");

function tourWorld(at, said) {
  return {
    TOUR: [{ el: "#a", title: "the rail", text: "up to {limit} seats" }, { el: "#b", title: "the plane", text: "everything at once" }],
    st: { tourAt: at, LIMIT: 4 },
    tourSaid: new Map(said ? [[at, said]] : []),
    keyHint: (a) => `hint:${a}`
  };
}

test("the coach counts the steps, asks whether it helped, and only offers back once you have moved", () => {
  const first = run(tourWorld(0), tour, "tourViewModel")();
  assert.equal(first.count, "1 / 2");
  assert.equal(first.title, "the rail");
  assert.equal(first.text, "up to 4 seats");
  assert.equal(first.back, "");
  assert.equal(first.next, "next");
  assert.equal(first.thanks, "");
  const last = run(tourWorld(1), tour, "tourViewModel")();
  assert.equal(last.back, "back");
  assert.equal(last.next, "done");
});

test("a step already answered thanks you instead of asking again", () => {
  assert.equal(run(tourWorld(0, "yes"), tour, "tourViewModel")().thanks, "glad it helped");
  assert.equal(run(tourWorld(0, "no"), tour, "tourViewModel")().thanks, "noted — this one gets rewritten");
});

/* ── the plane ── */

const planeBar = slice("plane", "let planeBarSolid = null;");

test("the bar over a note offers its colours, and the one over an area offers a rename instead", () => {
  const world = {
    planeIsArea: (id) => id === "a1",
    keyLabel: () => "⌫",
    PLANE_TINTS: ["", "amber", "blue"],
    st: {}
  };
  const note = run(world, planeBar, "planeBarViewModel")("n1", { tint: "amber" });
  assert.equal(note.area, false);
  assert.deepEqual(note.tints.map((one) => one.cls), ["plain", "amber", "blue"]);
  assert.deepEqual(note.tints.map((one) => one.on), [false, true, false]);
  assert.equal(note.remove, "remove ⌫");
  const area = run(world, planeBar, "planeBarViewModel")("a1", {});
  assert.equal(area.area, true);
  assert.equal(area.rename, "rename");
});

const planeMap = slice("plane", "let planeMapSolid = null;");

test("the little map puts a dot on every thing on the field and marks the ones waiting on you", () => {
  const model = run({
    planeBounds: () => ({ x: 0, y: 0, w: 100, h: 100 }),
    planeSeen: () => ({ x: 0, y: 0, w: 50, h: 50 }),
    st: {
      planeAreas: [{ id: "a1", x: 0, y: 0, w: 10, h: 10 }],
      planeNotes: [{ id: "n1", x: 10, y: 10, w: 10, h: 10 }],
      blocks: [{ keys: ["s2"] }],
      block: 0
    },
    planeNodes: new Map([["s1", {}], ["s2", {}]]),
    itemOf: (key) => ({ state: key === "s1" ? "needs" : "idle" }),
    planeBoxOf: () => ({ x: 0, y: 0, w: 10, h: 10 })
  }, planeMap, "planeMapViewModel")({ clientWidth: 100, clientHeight: 100 });
  assert.deepEqual(model.dots.map((one) => one.key), ["area:a1", "note:n1", "seat:s1", "seat:s2"]);
  assert.deepEqual(model.dots.map((one) => one.cls), ["area", "note", "needs", "live"]);
  assert.equal(model.field.k, 1);
  assert.equal(model.dots[1].at.left, "10px");
  assert.equal(model.seen.width, "50px");
});

test("a dot is never smaller than two pixels, however far out the field is", () => {
  const model = run({
    planeBounds: () => ({ x: 0, y: 0, w: 1000, h: 1000 }),
    planeSeen: () => ({ x: 0, y: 0, w: 1000, h: 1000 }),
    st: { planeAreas: [], planeNotes: [{ id: "n1", x: 0, y: 0, w: 1, h: 1 }], blocks: [], block: 0 },
    planeNodes: new Map(), itemOf: () => null, planeBoxOf: () => ({ x: 0, y: 0, w: 1, h: 1 })
  }, planeMap, "planeMapViewModel")({ clientWidth: 100, clientHeight: 100 });
  assert.equal(model.dots[0].at.width, "2px");
});

const planeCard = slice("plane", "let planeCardMount = null;");

test("a card on the field says what the seat is about, where it runs and what it carries", () => {
  const world = {
    GLYPH: { needs: "g-needs" }, LABEL: { needs: "needs you" },
    prsOfChat: (name) => (name === "b2" ? [{ number: 12 }] : []),
    prIsGone: () => false
  };
  const model = run(world, planeCard, "planeCardViewModel")({ key: "b2", name: "b2", title: "Persist PRs", state: "needs", when: "20:00", where: "cloud", model: "opus" });
  assert.equal(model.glyph, "g-needs");
  assert.equal(model.name, "Persist PRs");
  assert.equal(model.said, "needs you");
  assert.equal(model.of, "on the server");
  assert.deepEqual(model.chips.map((one) => one.text), ["#12", "opus"]);
  assert.match(model.sum, /no status written yet/);
});

test("a seat on an errand is named by the errand, and a local one names no server", () => {
  const model = run({
    GLYPH: {}, LABEL: {}, prsOfChat: () => [], prIsGone: () => false
  }, planeCard, "planeCardViewModel")({ key: "b2", name: "b2", errand: "the mirror", where: "local", summary: "half done" });
  assert.equal(model.of, "the mirror · b2");
  assert.equal(model.sum, "half done");
  assert.equal(model.glyph, "g-idle");
  assert.deepEqual(model.chips, []);
});

/* ── the hooks themselves ── */

test("every painter in this region paints through its solid view", () => {
  const guards = [
    ["seat-menu", "function paintMenu(cap, rows, x, y) {", /menuSolid\.show\(menuViewModel\(cap, rows\)\);/],
    ["team", "function renderMirror() {", /mirrorSolid\.show\(mirrorViewModel\(\)\);/],
    ["preferences", "function paintChoices() {", /choiceSolids\.lang\.show\(/],
    ["themes", "function paintThemes() {", /themesSolid\.show\(themesViewModel\(\)\);/],
    ["brand-face", "function paintGate() {", /gateSolid\.show\(gateViewModel\(\)\);/],
    ["welcome", "function paintSettingsFace() {", /cfgFaceSolid\.show\(/],
    ["face-door", "function paintFaceSheet() {", /faceSheetSolid\.show\(faceSheetViewModel\(\)\);/],
    ["leader-key", "function paintKeys() {", /keysGridSolid\.show\(said\.grid\);/],
    ["tour", "function paintRelnotes() {", /relnotesSolid\.show\(/],
    ["whats-new", "function paintWhatsNew(d) {", /whatsNewSolid\.show\(/],
    ["tour", "function paintTour() {", /tourSolid\.show\(tourViewModel\(\)\);/],
    ["plane", "function paintPlaneBar() {", /planeBarSolid\.show\(planeBarViewModel\(id, one\)\)/],
    ["plane", "function paintPlaneMap() {", /planeMapSolid\.show\(/],
    ["plane", "function paintPlaneCard(node, it) {", /planeCardMount\(/]
  ];
  for (const [module, head, guard] of guards) {
    const text = source(module);
    const at = text.indexOf(head);
    assert.ok(at >= 0, `${head} is gone from ${module}.js`);
    const body = text.slice(at, text.indexOf("\n}\n", at));
    assert.match(body, guard, `${head} does not paint through solid`);
  }
});

test("each view of this region is mounted on the element the painter writes into", () => {
  const mounts = [
    ["seat-menu", /menuSolid = hive\.mountMenu\(\$\("seatmenu"\)/],
    ["team", /mirrorSolid = hive\.mountMirror\(\$\("mirror"\)/],
    ["themes", /hive\.mountThemes\(grid\)/],
    ["brand-face", /hive\.mountGate\(box\)/],
    ["welcome", /hive\.mountFacePicker\(pick\)/],
    ["face-door", /hive\.mountFaceSheet\(box\)/],
    ["leader-key", /hive\.mountKeysGrid\(grid\)/],
    ["leader-key", /hive\.mountKeysLeader\(lead\)/],
    ["tour", /hive\.mountRelnotes\(list\)/],
    ["whats-new", /hive\.mountWhatsNewGroups\(groups\)/],
    ["tour", /hive\.mountTourPop\(pop\)/],
    ["plane", /hive\.mountPlaneBar\(bar, \{/],
    ["plane", /hive\.mountPlaneMap\(in_\)/],
    ["plane", /planeCardMount = hive\.mountPlaneCard;/],
    ["preferences", /\[which, hive\.mountOptions\(host\)\]/]
  ];
  for (const [module, shape] of mounts) assert.match(source(module), shape, `no mount for ${shape}`);
});

test("the plane keeps its drag, its wires and its writing surfaces imperative", () => {
  const layer = source("plane");
  for (const still of ["function paintPlaneWires()", "function paintPlaneMarks(alive)", "function paintPlaneGroups()", "function paintPlaneNotes()", "function paintPlaneAreas()", "function applyPlane()"]) {
    assert.ok(layer.includes(still), `${still} left the plane`);
  }
  assert.ok(!/mountPlaneNotes|mountPlaneAreas|mountPlaneWires/.test(layer), "a surface the pointer writes on was handed to the reconciler");
});

const canBuild = existsSync(join(HERE, "node_modules/esbuild")) && existsSync(join(HERE, "node_modules/solid-js"));

test("the region builds into the one bundle, with every mount it promises", { skip: !canBuild && "esbuild and solid-js are dev dependencies — not installed here" }, async () => {
  const { buildApp } = await import("../build.mjs");
  const outdir = await mkdtemp(join(tmpdir(), "hive-settings-"));
  try {
    const { errors } = await buildApp({ outdir, minify: false });
    assert.deepEqual(errors, []);
    const built = await readFile(join(outdir, "hive.mjs"), "utf8");
    for (const name of ["mountMenu", "mountMirror", "mountThemes", "mountOptions", "mountGate", "mountFacePicker", "mountFaceSheet", "mountKeysGrid", "mountKeysLeader", "mountRelnotes", "mountWhatsNewGroups", "mountTourPop", "mountPlaneBar", "mountPlaneMap", "mountPlaneCard"]) {
      assert.ok(built.includes(name), `the bundle does not carry ${name}`);
    }
    for (const piece of ["kb-bar", "mirror-talk", "mirror-send", "well structured", "thm-prev", "facepick", "fg-page", "fs-top", "wn-group", "pc-chips", "data-tour", "i-thumb-up", "data-tint"]) {
      assert.ok(built.includes(piece), `the built region lost ${piece}`);
    }
  } finally {
    await rm(outdir, { recursive: true, force: true });
  }
});
