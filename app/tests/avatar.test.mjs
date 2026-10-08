import { test } from "node:test";
import { cleanAvatar } from "../lib/config.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHAPES, FACES, COLOURS, BODY, OLD_SHAPES, avatarFor, avatarSvg, avatarKey, parseAvatar, normalAvatar, isAvatar, lookDeltas, eyeShapes, bridgeOf, toneOf } from "../assets/avatar/avatar.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

const balanced = (svg) => {
  const open = (svg.match(/<(?!\/)[a-zA-Z]/g) || []).length;
  const close = (svg.match(/<\/[a-zA-Z]|\/>/g) || []).length;
  return open === close;
};

test("the same name always gets the same face", () => {
  for (const name of ["jorge", "rosa", "art", "a"]) {
    assert.deepEqual(avatarFor(name), avatarFor(name));
  }
});

test("different names spread across the catalogue", () => {
  const names = ["jorge", "rosa", "vini-dev", "jonas", "renato", "art", "mariana", "ana", "bruno", "carla", "diego", "elisa"];
  const seen = new Set(names.map((n) => avatarKey(avatarFor(n))));
  assert.ok(seen.size >= names.length - 1, `only ${seen.size} distinct faces for ${names.length} names`);
  const shapes = new Set(names.map((n) => avatarFor(n).shape));
  const colours = new Set(names.map((n) => avatarFor(n).colour));
  assert.ok(shapes.size >= 4, `only ${shapes.size} distinct bodies`);
  assert.ok(colours.size >= 4, `only ${colours.size} distinct colours`);
});

test("a derived avatar is always a valid one", () => {
  for (const name of ["", "x", "sem-nome", "ÁÉÍ", "a".repeat(200)]) {
    assert.ok(isAvatar(avatarFor(name)), `${name} produced an invalid avatar`);
  }
});

test("the key round-trips and junk is refused", () => {
  const me = avatarFor("jorge");
  assert.deepEqual(parseAvatar(avatarKey(me)), me);
  for (const junk of ["", "ball", "ball/dark", "ball/dark/mauve", "sphere/dark/purple", "ball/grinning/purple", "../../etc/passwd", null, undefined]) {
    assert.equal(parseAvatar(junk), null, `${junk} should not parse`);
  }
});

test("a face saved before the robot is read onto the body that replaced its shape", () => {
  for (const [old, now] of Object.entries(OLD_SHAPES)) {
    assert.deepEqual(parseAvatar(`${old}/curious/blue`), { shape: now, face: "dark", colour: "blue" }, `${old} must land on ${now}`);
  }
  assert.deepEqual(parseAvatar("cloud/surprised/pink"), { shape: "tall", face: "dark", colour: "pink" });
  assert.deepEqual(normalAvatar({ shape: "pebble", face: "excited", colour: "amber" }), { shape: "wide", face: "dark", colour: "amber" });
  assert.ok(isAvatar(normalAvatar({ shape: "nope", face: "nope", colour: "nope", seed: "ana" })), "junk falls back to the name");
});

test("every body has the anchors the drawing needs", () => {
  for (const shape of SHAPES) {
    const b = BODY[shape];
    assert.ok(b, `${shape} has no body`);
    assert.ok(b.shell.d || (b.shell.w > 0 && b.shell.h > 0), `${shape} has no shell`);
    assert.ok(b.top < b.faceY && b.faceY < b.foot, `${shape} puts the screen outside the body`);
    assert.ok(b.hw >= 20, `${shape} is too thin to carry the screen`);
    assert.equal(b.hat.length, 2, `${shape} has no brim for a hat`);
    assert.equal(b.arms.length, 2, `${shape} has no arm anchors`);
    for (const [x0, , x1] of b.arms) assert.ok(Math.abs(x1) > Math.abs(x0), `${shape} arm swings into the body`);
    assert.ok(b.top >= -135, `${shape} pokes ${-135 - b.top} units above the box`);
  }
});

test("the screen is the same rectangle on every body, and never has a mouth", () => {
  for (const shape of SHAPES) {
    const svg = avatarSvg({ shape, face: "dark", colour: "amber" });
    assert.match(svg, new RegExp(`<rect x="-62" y="-?[\\d.]+" width="124" height="84" rx="42" fill="${toneOf("amber").screen}"/>`), `${shape} draws another screen`);
    assert.equal((svg.match(/class="av-seat"/g) || []).length, 2, `${shape} has ${(svg.match(/class="av-seat"/g) || []).length} eyes`);
  }
  const arms = avatarSvg({ shape: "ball", face: "dark", colour: "amber" });
  assert.ok(!arms.includes("av-arm"), "the still face has no arms");
});

test("every combination renders one svg with the body clipped and the screen on it", () => {
  for (const shape of SHAPES) {
    for (const face of FACES) {
      for (const colour of COLOURS) {
        const svg = avatarSvg({ shape, face, colour });
        assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${shape}/${face}/${colour} is not one svg`);
        assert.match(svg, /<clipPath id="[^"]+-tc"/, `${shape}/${face}/${colour} lost its texture clip`);
        assert.match(svg, /<clipPath id="[^"]+-sc"/, `${shape}/${face}/${colour} lost its screen`);
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${shape}/${face}/${colour} rendered a broken value`);
        assert.ok(balanced(svg), `${shape}/${face}/${colour} has unbalanced tags`);
      }
    }
  }
});

test("the screen is a dark tone of the body colour, never pure ink, and a saved light face lands on it", () => {
  const dark = avatarSvg({ shape: "ball", face: "dark", colour: "blue" });
  const light = avatarSvg({ shape: "ball", face: "light", colour: "blue" });
  assert.equal(light, dark, "light is no longer a tone of its own");
  assert.match(dark, /rx="42" fill="#3c5869"/);
  assert.ok(!dark.includes('rx="42" fill="#1b1b1b"'), "the screen is not pure ink");
  assert.notEqual(toneOf("red").screen, toneOf("blue").screen, "each colour has its own screen");
  assert.match(dark, /class="av-eye"[^>]*\/>|fill="#fffbf2" class="av-eye"/);
});

test("two avatars on one page do not share ids", () => {
  const a = avatarSvg(avatarFor("ana"), { salt: "one" });
  const b = avatarSvg(avatarFor("ana"), { salt: "two" });
  const idOf = (svg) => svg.match(/<clipPath id="([^"]+)-sc"/)[1];
  assert.notEqual(idOf(a), idOf(b));
});

test("a bad spec falls back instead of throwing", () => {
  const svg = avatarSvg({ shape: "sphere", face: "smug", colour: "mauve", seed: "ana" });
  assert.ok(svg.startsWith("<svg"));
  assert.ok(!/NaN|undefined/.test(svg));
});

test("a title makes it an image for the screen reader", () => {
  assert.match(avatarSvg(avatarFor("ana"), { title: "ana" }), /role="img"[^>]*>.*<title>ana<\/title>/s);
  assert.match(avatarSvg(avatarFor("ana")), /aria-hidden="true"/);
});

test("the eyes move together on the screen, and stay inside it", () => {
  const [l, r] = lookDeltas({ shape: "ball", face: "dark", colour: "blue" }, 26, -22);
  assert.deepEqual(l, r, "one screen, one gaze");
  assert.ok(l.dx > 0 && l.dy > 0, "right and down on screen for a pointer right and below");
  assert.ok(Math.abs(l.dx) + 26 + 17 < 62 && Math.abs(l.dy) + 21 < 42, "the widest look stays on the glass");
});

test("the server validates the avatar it is asked to store, and keeps what it was told", () => {
  const problems = [];
  assert.equal(cleanAvatar("ball/dark/purple", "patch", problems), "ball/dark/purple");
  assert.equal(cleanAvatar("circle/curious/purple", "patch", problems), "circle/curious/purple", "an old face is still a face");
  assert.equal(cleanAvatar(undefined, "patch", problems), "");
  assert.deepEqual(problems, []);
  assert.equal(cleanAvatar("sphere/curious/purple", "patch", problems), "");
  assert.equal(problems.length, 1);
});

test("the app and the server load the module from the same place", () => {
  const server = readFileSync(join(HERE, "server.mjs"), "utf8");
  const core = readFileSync(join(HERE, "src", "app", "core.js"), "utf8");
  assert.match(server, /"\/assets\/avatar\/avatar\.mjs": \["assets\/avatar\/avatar\.mjs"/);
  assert.match(core, /import \{[^}]*avatarSvg[^}]*\} from "\/assets\/avatar\/avatar\.mjs"/);
});

import { WEAR, WEAR_SLOTS, RETIRED_WEAR, UNFIT, parseWear, wearKey, isDressed, wearPaths, fitsBody, wornBy } from "../assets/avatar/avatar.mjs";

test("the triangle refuses the tie: the screen sits on the floor, so there is no room for it", () => {
  assert.deepEqual(UNFIT, { triangle: ["extra:tie"] });
  assert.equal(fitsBody("triangle", "extra", "tie"), false);
  assert.equal(fitsBody("triangle", "extra", "bowtie"), true);
  assert.equal(fitsBody("ball", "extra", "tie"), true);
  assert.deepEqual(wornBy("triangle", "hat:fedora extra:tie"), { hat: "fedora" }, "the tie is kept in the config, just not worn by this body");
  assert.deepEqual(wornBy("ball", "hat:fedora extra:tie"), { hat: "fedora", extra: "tie" });
  assert.equal(wearPaths({ shape: "triangle", face: "dark", colour: "green" }, "extra:tie"), "");
});
import { cleanWear } from "../lib/config.mjs";

test("what is worn is a word per slot, and junk is left on the floor", () => {
  assert.deepEqual(parseWear("glasses:round hat:wizard"), { glasses: "round", hat: "wizard" });
  assert.deepEqual(parseWear({ glasses: "round", hat: "nope", boots: "tall" }), { glasses: "round" });
  assert.deepEqual(parseWear("shape:circle glasses:sphere"), {});
  for (const junk of ["", null, undefined, 42, []]) assert.deepEqual(parseWear(junk), {}, `${junk} should be nothing worn`);
  assert.equal(wearKey({ hat: "cap", glasses: "round" }), "glasses:round hat:cap", "the key is in slot order, whatever order it came in");
  assert.equal(wearKey(""), "");
  assert.equal(isDressed({}), false);
  assert.equal(isDressed("extra:scarf"), true);
});

test("the wardrobe is five lines and thirty-five pieces, and the retired ones are named", () => {
  assert.deepEqual(WEAR_SLOTS, ["glasses", "hat", "extra"]);
  const pieces = SHAPES.length + COLOURS.length + FACES.length + WEAR_SLOTS.reduce((n, slot) => n + WEAR[slot].length, 0);
  assert.equal(pieces, 35);
  assert.deepEqual(parseWear("hair:mullet marks:blush glasses:shades extra:headphones"), {}, "what left the wardrobe is not worn");
  assert.deepEqual(parseWear("marks:moustache hat:cap"), { hat: "cap", extra: "moustache" }, "the moustache moved from marks to extra, and what was saved follows it");
  assert.deepEqual(parseWear({ marks: "moustache", extra: "tie" }), { extra: "tie" }, "unless the extra slot is already taken: one piece under the screen");
  assert.deepEqual(parseWear("extra:tie marks:moustache"), { extra: "tie" });
  for (const slot of Object.keys(RETIRED_WEAR)) for (const piece of RETIRED_WEAR[slot]) assert.ok(!(WEAR[slot] || []).includes(piece), `${slot}:${piece} is both kept and retired`);
});

test("every piece fits every body, and never breaks the drawing", () => {
  for (const slot of WEAR_SLOTS) {
    for (const piece of WEAR[slot]) {
      for (const shape of SHAPES) {
        const svg = avatarSvg({ shape, face: "dark", colour: "amber", wear: { [slot]: piece } });
        if (!fitsBody(shape, slot, piece)) assert.doesNotMatch(svg, new RegExp(`data-wear="${slot}:${piece}"`), `${slot}:${piece} does not fit a ${shape}, so it is not drawn`);
        else if (slot !== "glasses") assert.match(svg, new RegExp(`data-wear="${slot}:${piece}"`), `${slot}:${piece} is not drawn on a ${shape}`);
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${slot}:${piece} on a ${shape} rendered a broken value`);
        assert.ok(balanced(svg), `${slot}:${piece} on a ${shape} has unbalanced tags`);
      }
    }
  }
});

test("glasses are the shape of the eye, not a frame on top", () => {
  const bare = eyeShapes("attentive");
  const round = eyeShapes("attentive", "round");
  const square = eyeShapes("attentive", "square");
  assert.deepEqual(bare.map((e) => e.kind), ["rect", "rect"]);
  assert.deepEqual(round.map((e) => e.kind), ["circle", "circle"]);
  assert.deepEqual(square.map((e) => [e.w, e.h]), [[46, 46], [46, 46]]);
  const svg = avatarSvg({ shape: "ball", face: "dark", colour: "blue", wear: "glasses:round" });
  assert.ok(!svg.includes("data-wear=\"glasses"), "nothing is drawn over the screen");
  assert.match(svg, /<path d="M-4 6L4 6" fill="none" stroke="#fffbf2" stroke-width="6"/, "only the bridge joins them, lens to lens");
  const sleepy = avatarSvg({ shape: "ball", face: "dark", colour: "blue", wear: "glasses:round" }).replace(/av-look0|av-look1/g, "");
  assert.match(sleepy, /M-4 6L4 6/, "the still face is the default look, so it wears them");
  assert.equal(bridgeOf(eyeShapes("attentive", "round")), "M-4 6L4 6");
  const seats = (svg.match(/class="av-seat"/g) || []).length;
  assert.equal(seats, 3, "the bridge rides the same seat as the eyes, so it follows the pointer with them");
  assert.deepEqual(eyeShapes("sleepy", "round").map((e) => e.kind), ["arc", "arc"], "only the default look shows the glasses; every other expression draws the eyes as they are");
  assert.deepEqual(eyeShapes("scared", "square").map((e) => e.kind), ["fill", "fill"]);
  assert.deepEqual(eyeShapes("surprised", "round").map((e) => e.kind), ["rect", "rect"], "the wide-open face draws no glasses either");
});

test("the hat takes the antenna's place, and is drawn last", () => {
  const bare = avatarSvg({ shape: "ball", face: "dark", colour: "amber" });
  const hatted = avatarSvg({ shape: "ball", face: "dark", colour: "amber", wear: "hat:cap extra:scarf" });
  assert.ok(bare.includes("av-crest"), "the bare head has its antenna");
  assert.ok(!hatted.includes("av-crest"), "the hat replaces it");
  assert.ok(hatted.indexOf('data-wear="extra:scarf"') < hatted.indexOf('data-wear="hat:cap"'), "the hat is on top of everything");
  assert.ok(hatted.indexOf('data-wear="hat:cap"') > hatted.indexOf('class="av-seat"'), "the clothes are drawn after the eyes");
  assert.ok(!bare.includes("data-wear"), "a naked face has no wardrobe group");
  assert.equal(wearPaths({ shape: "ball", face: "dark", colour: "amber" }, "hat:sombrero"), "");
});

test("the hat is molded to each body: the crown is the body's own silhouette in the hat's colour", () => {
  for (const shape of SHAPES) {
    const svg = avatarSvg({ shape, face: "dark", colour: "amber", wear: "hat:beanie" });
    const hat = svg.slice(svg.indexOf('data-wear="hat:beanie"'));
    assert.match(hat, /<clipPath id="[^"]+-hc">/, `${shape} wears a beanie that floats instead of fitting`);
  }
});

test("the file keeps the clothes as words, drops what retired without complaint, and names what it never knew", () => {
  const problems = [];
  assert.equal(cleanWear("glasses:round hat:wizard", "patch", problems), "glasses:round hat:wizard");
  assert.equal(cleanWear({ hat: "cap" }, "patch", problems), "hat:cap");
  assert.equal(cleanWear(undefined, "patch", problems), "");
  assert.equal(cleanWear("", "patch", problems), "");
  assert.equal(cleanWear("hair:mullet marks:blush glasses:round", "patch", problems), "glasses:round", "hair and marks left with the blob");
  assert.deepEqual(problems, []);
  assert.equal(cleanWear("hat:sombrero glasses:round", "patch", problems), "glasses:round");
  assert.equal(problems.length, 1, "the unknown piece is named, not swallowed");
  assert.equal(cleanWear(42, "patch", problems), "");
  assert.equal(problems.length, 2);
});
