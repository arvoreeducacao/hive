import { landedMood, SULK_MS, THROWS_BEFORE_SULK } from "../assets/pets/tamagotchi.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARE_MAX, CARE_OF_ACT, COMPANY_EASE, DECAY_PER_HOUR, GAZE_PITCH, GAZE_REACH_PX, GAZE_YAW,
  HATCH_CARE, HATCH_TALK, HUG_STREAK, HUNGRY_BELOW, NEAR_PX, NEAR_TALK, NEST_KEY, NIGHT_FROM,
  NIGHT_TO, PARTY_PLAYS, PARTY_STREAK, PET_PLAYS, PLAY_OF_MOOD, REST_OF_STAGE, SAY_COOLDOWN_MS,
  SAY_LINES, SING_STREAK, STAGES, TALK_OF_MOOD, TALK_OF_STAGE, TAMAGOTCHI_ID, WHINE_OF_STAGE,
  FLING, careAfter, clampCare, dayStamp, decayedCare, flightStep, gazeAt, hatchNest, heartsOf,
  isHungry, launchFrom, nightAt, reactionTo, readNest, sayGate, snackColour, stageOf,
  vidaMansaDue, writeNest
} from "../assets/pets/tamagotchi.mjs";
import { PLAY_IDS } from "../assets/avatar/avatar-play.mjs";
import { BASE } from "../assets/avatar/avatar.mjs";
import { PT_BR } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "src", "app", "preferences.js"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const pack = readFileSync(join(HERE, "assets", "pets", "pets.mjs"), "utf8");
const tama = readFileSync(join(HERE, "assets", "pets", "tamagotchi.mjs"), "utf8");

const HOUR = 3600000;

test("a heart fades while it is ignored, and a workday nearly empties it", () => {
  assert.equal(decayedCare(CARE_MAX, HOUR), CARE_MAX - DECAY_PER_HOUR);
  assert.ok(decayedCare(CARE_MAX, 8 * HOUR) < 15, "eight hours alone leaves it forlorn");
  assert.equal(decayedCare(5, 24 * HOUR), 0, "care bottoms out instead of going negative");
  assert.equal(decayedCare(50, -HOUR), 50, "a clock that runs backwards feeds nobody");
});

test("every level of care lands on a stage, and every stage knows how to rest and how to whine", () => {
  for (let care = 0; care <= CARE_MAX; care += 1) assert.ok(STAGES.includes(stageOf(care)), `care ${care} has a stage`);
  for (const stage of STAGES) {
    assert.ok(PLAY_IDS.includes(REST_OF_STAGE[stage]) || REST_OF_STAGE[stage] === "idle", `${stage} rests in a real play`);
    const cry = WHINE_OF_STAGE[stage];
    assert.ok(cry === "" || PLAY_IDS.includes(cry), `${stage} whines with a real play`);
    assert.ok(TALK_OF_STAGE[stage], `${stage} has a line of its own`);
  }
  assert.equal(WHINE_OF_STAGE.beaming, "", "a well-loved creature does not beg");
  assert.equal(REST_OF_STAGE.forlorn, "snooze", "an abandoned creature dozes whole — the ball is gone from every road");
});

test("a click is a pat, three fast clicks are a party, and a hungry creature eats first", () => {
  for (const roll of [0, 0.5, 0.999, 7]) {
    const pat = reactionTo(CARE_MAX, 1, roll);
    assert.equal(pat.act, "pet");
    assert.ok(PET_PLAYS.includes(pat.play), "a pat plays a small joy");
    const party = reactionTo(CARE_MAX, PARTY_STREAK, roll);
    assert.equal(party.act, "party");
    assert.ok(PARTY_PLAYS.includes(party.play), "a party plays a big joy");
  }
  assert.equal(reactionTo(HUNGRY_BELOW - 1, 1).act, "feed");
  assert.equal(reactionTo(HUNGRY_BELOW, 1).act, "pet", "at the threshold it is fed enough");
  for (const play of [...PET_PLAYS, ...PARTY_PLAYS]) assert.ok(PLAY_IDS.includes(play), `${play} exists in the engine`);
});

test("a meal restores more than a pat, and no amount of either overfills the heart", () => {
  assert.ok(CARE_OF_ACT.feed > CARE_OF_ACT.pet);
  assert.equal(careAfter(CARE_MAX - 1, "feed"), CARE_MAX);
  assert.equal(careAfter(50, "pet"), 50 + CARE_OF_ACT.pet);
  assert.equal(careAfter(50, "sing"), 50, "an act nobody knows changes nothing");
  assert.equal(clampCare(-10), 0);
  assert.equal(clampCare(999), CARE_MAX);
});

test("the nest survives a restart, decays for the time away, and shrugs off a corrupt one", () => {
  const shelf = new Map();
  const store = { getItem: (k) => shelf.get(k) ?? null, setItem: (k, v) => shelf.set(k, v) };
  const born = 1000;
  writeNest(store, hatchNest(born));
  const later = born + 2 * HOUR;
  const back = readNest(store, later);
  assert.equal(back.care, HATCH_CARE - 2 * DECAY_PER_HOUR, "the hours away are charged on return");
  assert.equal(back.born, born, "the birthday travels along");
  assert.equal(back.at, later);
  shelf.set(NEST_KEY, "not json at all");
  assert.equal(readNest(store, later), null);
  shelf.delete(NEST_KEY);
  assert.equal(readNest(store, later), null);
  assert.equal(readNest({ getItem: () => { throw new Error("no"); } }, later), null, "a locked store reads as no nest");
});

test("the hearts row is always five hearts, lit by how loved it is", () => {
  assert.equal(heartsOf(CARE_MAX), "♥♥♥♥♥");
  assert.equal(heartsOf(0), "♡♡♡♡♡");
  for (let care = 0; care <= CARE_MAX; care += 10) assert.equal([...heartsOf(care)].length, 5);
});

test("every busy mood of the fleet lands on a play the engine owns", () => {
  for (const mood of ["needs", "answered", "working", "done", "stalled"]) {
    assert.ok(PLAY_IDS.includes(PLAY_OF_MOOD[mood]), `${mood} plays for real`);
    assert.ok(TALK_OF_MOOD[mood], `${mood} has a line`);
  }
  assert.ok(!PLAY_OF_MOOD.ready && !PLAY_OF_MOOD.idle, "a quiet fleet leaves the tamagotchi to its own heart");
});

test("no line is said twice, and every line speaks portuguese too", () => {
  const said = [...Object.values(TALK_OF_STAGE), ...Object.values(TALK_OF_MOOD), HATCH_TALK, NEAR_TALK];
  assert.equal(new Set(said).size, said.length, "no line is said twice");
  for (const line of said) {
    assert.ok(PT_BR[line], `"${line}" speaks portuguese`);
  }
  assert.ok(PT_BR["the little you"], "its name speaks portuguese");
  assert.ok(PT_BR["the little you — {talk} · {hearts} · a click is a pat, ⌥ a game"], "its tooltip speaks portuguese, and teaches the serve");
});

/* the escalation is the easter egg's front door: two clicks hug, three to five party, and
   whoever keeps going finds the show — discovered by playing, never announced anywhere */
test("the clicks escalate: a hug at two, a party at three, the show at six", () => {
  assert.equal(reactionTo(CARE_MAX, HUG_STREAK).act, "hug");
  assert.equal(reactionTo(CARE_MAX, HUG_STREAK).play, "hug");
  assert.equal(reactionTo(CARE_MAX, SING_STREAK).act, "sing");
  assert.equal(reactionTo(CARE_MAX, SING_STREAK + 3).play, "sing");
  assert.equal(reactionTo(HUNGRY_BELOW - 1, SING_STREAK).act, "feed", "a hungry creature eats before it sings");
  assert.ok(SING_STREAK > PARTY_STREAK && HUG_STREAK < PARTY_STREAK, "the ladder climbs in order");
  for (const play of ["hug", "sing", "giggle", "snooze"]) assert.ok(PLAY_IDS.includes(play), `${play} exists in the engine`);
});

test("night is a window of hours, and inside it the creature sleeps whole", () => {
  assert.ok(nightAt(23) && nightAt(NIGHT_FROM) && nightAt(3) && nightAt(NIGHT_TO - 1));
  assert.ok(!nightAt(NIGHT_TO) && !nightAt(12) && !nightAt(NIGHT_FROM - 1));
  assert.equal(PLAY_OF_MOOD.stalled, "snooze", "a stalled fleet no longer curls the creature into a ball");
});

test("the balloon is rare by design: a cooldown, a longer one for the same line, silence in calm", () => {
  assert.ok(sayGate(SAY_COOLDOWN_MS, 0, "a", "b"), "a different line waits one cooldown");
  assert.ok(!sayGate(SAY_COOLDOWN_MS - 1, 0, "a", "b"));
  assert.ok(!sayGate(SAY_COOLDOWN_MS, 0, "a", "a"), "the same line waits much longer");
  assert.ok(sayGate(6 * SAY_COOLDOWN_MS, 0, "a", "a"));
  assert.match(tama, /const say = \(line, \{ force = false, slots = null \} = \{\}\) => \{\n    if \(still\(\)\) return false;/, "calm mode mutes the balloon before any gate is read");
});

test("the toast only lands when the joke is true", () => {
  const tue1530 = new Date(2026, 8, 1, 15, 30);
  assert.ok(vidaMansaDue(tue1530, true, true, ""), "a weekday afternoon gone quiet earns the toast");
  assert.ok(!vidaMansaDue(tue1530, false, true, ""), "a day that never worked earns nothing");
  assert.ok(!vidaMansaDue(tue1530, true, false, ""), "a fleet still busy is not easy life");
  assert.ok(!vidaMansaDue(tue1530, true, true, dayStamp(tue1530)), "one toast a day");
  assert.ok(!vidaMansaDue(new Date(2026, 8, 5, 15, 30), true, true, ""), "saturday needs no joke");
  assert.ok(!vidaMansaDue(new Date(2026, 8, 1, 19, 0), true, true, ""), "seven pm is just the end of the day");
  assert.ok(!vidaMansaDue(new Date(2026, 8, 1, 10, 0), true, true, ""), "a quiet morning is not clocking out early");
});

const WALLS = { left: -90, right: 90, top: -150, floor: 0 };

test("a throw falls, bounces off every wall softer than it hit, and lands when the floor wins", () => {
  const dt = 0.04;
  let state = { fly: { x: 0, y: -60, vx: 300, vy: -400 }, event: "" };
  assert.ok(flightStep(state.fly, dt, WALLS).fly.vy > -400, "gravity is always pulling");
  let bounced = 0;
  let landed = false;
  for (let i = 0; i < 500 && !landed; i++) {
    state = flightStep(state.fly, dt, WALLS);
    assert.ok(Math.abs(state.fly.x) <= 90, "the walls hold");
    assert.ok(state.fly.y >= WALLS.top && state.fly.y <= WALLS.floor, "so do ceiling and floor");
    if (state.event === "bounce") bounced += 1;
    if (state.event === "landed") landed = true;
  }
  assert.ok(bounced > 0, "a real throw bounces at least once");
  assert.ok(landed, "and every throw ends on the floor");
  assert.equal(state.fly.y, 0, "landed means the floor, exactly");
  const wall = flightStep({ x: 89, y: -50, vx: 1000, vy: 0 }, dt, WALLS);
  assert.ok(wall.fly.vx < 0 && Math.abs(wall.fly.vx) < 1000, "a wall bounce reverses and softens");
});

/* the arena is the window now, and the window is measured in the same offsets the flight already
   used — so the walls arrive as numbers rather than a single span, and a throw has to stay inside
   whatever shape they describe, however hard it is flicked */
test("however hard it is flicked, it stays inside the window it was given", () => {
  const room = { left: -300, right: 1900, top: -700, floor: 12 };
  for (const [vx, vy] of [[FLING.max, -FLING.max], [-FLING.max, FLING.max], [FLING.max, 0]]) {
    let state = { fly: { x: 0, y: 0, vx, vy }, event: "" };
    for (let i = 0; i < 400 && state.event !== "landed"; i++) {
      state = flightStep(state.fly, 1 / 120, room);
      assert.ok(state.fly.x >= room.left && state.fly.x <= room.right, `x escaped: ${state.fly.x}`);
      assert.ok(state.fly.y >= room.top && state.fly.y <= room.floor, `y escaped: ${state.fly.y}`);
      assert.ok(Number.isFinite(state.fly.x + state.fly.y + state.fly.vx + state.fly.vy));
    }
  }
});

/* the throw is stepped at whatever rate the screen refreshes at. the settle threshold was tuned
   to the 25 frames a second of the tick, where one step of gravity is 104 and the tuned 130
   covered it; at 120 frames it is 22, and a bounce smaller than one step of gravity can never
   leave the floor again — kept, the creature hovers a pixel up forever and never lands. */
test("a throw ends, whatever rate it is stepped at", () => {
  for (const dt of [1 / 25, 1 / 60, 1 / 120, 1 / 240]) {
    let state = { fly: { x: 0, y: -140, vx: 120, vy: 0 }, event: "" };
    let waited = 0;
    for (let i = 0; i < 20000 && state.event !== "landed"; i++) {
      state = flightStep(state.fly, dt, WALLS);
      waited += dt;
    }
    assert.equal(state.event, "landed", `never landed at dt ${dt}`);
    assert.ok(waited < 4, `took ${waited.toFixed(2)}s to land at dt ${dt}`);
  }
});

test("the hand's velocity is the flick, not the whole drag, and it is capped", () => {
  const path = [
    { t: 0, x: 0, y: 0 }, { t: 400, x: 10, y: 0 },
    { t: 940, x: 100, y: -40 }, { t: 1000, x: 160, y: -80 }
  ];
  const v = launchFrom(path, 1000);
  assert.ok(v.vx === 1000 && v.vy < 0, "only the last window of samples counts");
  assert.equal(launchFrom([{ t: 990, x: 0, y: 0 }], 1000), null, "one sample is not a gesture");
  const wild = launchFrom([{ t: 950, x: 0, y: 0 }, { t: 1000, x: 900, y: -900 }], 1000);
  assert.equal(wild.vx, FLING.max, "no flick throws faster than the cap");
  assert.equal(wild.vy, -FLING.max);
});

test("calm mode never lifts the creature — a drag under calm stays a pat", () => {
  assert.match(tama, /if \(!grab\.moved && Math\.hypot\([^)]*\) < FLING\.start\) return;\n    if \(still\(\)\) return;/, "the calm check sits before the grab ever moves");
  assert.match(tama, /host\.setPointerCapture\(e\.pointerId\)/, "the capture keeps the throw alive outside the strip");
});

test("every line the balloon says speaks portuguese too", () => {
  const lines = Object.values(SAY_LINES);
  assert.equal(new Set(lines).size, lines.length, "no line is said twice");
  for (const line of lines) assert.ok(PT_BR[line], `"${line}" speaks portuguese`);
  assert.equal(PT_BR[SAY_LINES.toast], "Um brinde à vida mansa", "the punchline lands in portuguese");
});

test("a snack is a colour of the hive, never the creature's own", () => {
  const dyes = new Set(Object.values(BASE));
  for (const colour of Object.keys(BASE)) {
    for (const roll of [0, 0.5, 0.999]) {
      const dye = snackColour(colour, roll);
      assert.ok(dyes.has(dye), "the snack is dyed from the hive's palette");
      assert.notEqual(dye, BASE[colour], `a ${colour} creature is not offered itself`);
    }
  }
});

test("the page offers the little you, with the person's face in hand", () => {
  assert.match(page, /\[PET_ON\]: "the little you"/);
  assert.match(page, /pet = mountPet\(\$\("shell"\), \{\s*\n\s*face: \(\) => mugFace\(\),/);
});

test("switching the animations back on wakes the creature where it stands", () => {
  const helpers = readFileSync(join(HERE, "src", "app", "pure-helpers.js"), "utf8");
  assert.match(helpers, /function setCalm[\s\S]*?st\.pet\?\.refreshMotion\?\.\(\);/);
  assert.match(pack, /refreshMotion: \(\) => blob\.refreshMotion\(\)/);
  assert.match(tama, /const refreshMotion = \(\) => \{/);
});

test("the nest is handed to the tamagotchi, and given back when it leaves", () => {
  assert.match(pack, /import \{ TAMAGOTCHI_ID, mountTamagotchi \} from "\.\/tamagotchi\.mjs";/);
  assert.match(pack, /const blob = mountTamagotchi\(nest, \{/);
  assert.match(pack, /blob\.destroy\(\);/);
  assert.match(pack, /blob\.setMood\(mood\);/);
});

test("the server hands out the tamagotchi's module", () => {
  assert.match(server, /"\/assets\/pets\/tamagotchi\.mjs": \["assets\/pets\/tamagotchi\.mjs"/);
});

/* the lesson of the first day in the wild: a click that lands on a busy creature, on the play
   already on screen, or on the egg, must still be answered — silence reads as broken */
test("every click is answered, whatever the fleet or the dice are doing", () => {
  assert.match(tama, /squish\(\);\n    if \(r\.act === "feed"\) feed\(\);\n    else if \(r\.act === "sing"\) \{/, "the squash lands before the dice are even read");
  assert.ok(!tama.includes("else sparkle(2);"), "no mood swallows the reaction any more");
  assert.match(tama, /if \(next !== state\) from = /, "asking for the play already on screen starts it over");
  assert.ok(!tama.includes("if (next === state) return;"), "a repeated play is never swallowed");
  assert.match(tama, /if \(!hatched\) return crack\(\);/, "a click on the egg cracks it instead of being ignored");
  assert.match(tama, /@keyframes tama-squish/, "the squash has its motion written down");
});

test("the press lands on the creature without covering the rail behind it", () => {
  assert.match(tama, /host\.addEventListener\("pointerdown", press\);/, "the press is heard, not the click");
  assert.match(tama, /if \(e\.button !== 0 \|\| rally\.playing\(\)\) return;/, "only the left button is a pat, and a hand mid-match never grabs the player");
  assert.match(tama, /#pet\.tama-home \{ pointer-events: none; \}/, "the creature's strip covered the archived sessions");
  assert.match(pack, /#pet button \{[^}]*pointer-events: auto;/, "the creature itself stopped receiving a pat");
  assert.match(tama, /host\.addEventListener\("pointerenter", court\);/, "a pointer nearby is company");
  assert.match(tama, /if \(held \|\| fly \|\| courting \|\| rally\.playing\(\)\) goal = null;/, "it stands still to be petted");
  assert.match(tama, /!courting && \(goal !== null \|\| state === "muse"\)/, "the hop rests while company is near");
  assert.match(tama, /if \(e\.detail === 0\) \(asking \|\| \(e\.altKey && hatched\) \? takeUp : attend\)\(\);/, "the keyboard still reaches it through the button, invitation and serve included");
  assert.match(tama, /@keyframes tama-pulse/, "every touch glows on the floor");
  assert.match(tama, /host\.removeEventListener\("pointerdown", press\);/, "a swap takes the strip's ears with it");
});

/* the third lesson: a creature that only notices you once the pointer is on its strip reads as
   furniture. within a hand's reach it stops where it is, breathes where you can see it, and its
   eyes go where the pointer goes — and only in its own idle: a siren, a stroll with the fleet or
   a party is not interrupted by a passing mouse. */
test("a pointer nearby is company: the eyes go to it, saturating before the edge of the reach", () => {
  assert.ok(NEAR_PX > 84, "the reach is wider than the face, or it is just a hover");
  assert.ok(GAZE_REACH_PX < NEAR_PX, "the eyes are all the way over before the pointer is out of reach");
  assert.equal(gazeAt(NEAR_PX + 1, 0), null, "out of reach is nobody");
  assert.equal(gazeAt(0, -NEAR_PX - 1), null);
  assert.deepEqual(gazeAt(0, 0), { yaw: 0, pitch: -0 }, "a pointer on the face is looked straight at");
  const right = gazeAt(GAZE_REACH_PX / 2, 0);
  assert.ok(right.yaw > 0 && right.yaw < GAZE_YAW, "halfway right is a half turn right");
  assert.equal(gazeAt(NEAR_PX, 0).yaw, GAZE_YAW, "and at the edge the turn is full, not further");
  assert.equal(gazeAt(-NEAR_PX, 0).yaw, -GAZE_YAW);
  const above = gazeAt(0, -GAZE_REACH_PX);
  assert.equal(above.pitch, GAZE_PITCH, "a pointer above lifts the eyes");
  assert.equal(gazeAt(0, GAZE_REACH_PX).pitch, -GAZE_PITCH, "a pointer below lowers them");
  assert.ok(COMPANY_EASE > 0 && COMPANY_EASE < 0.5, "the eyes glide over instead of snapping");
});

test("company is heard on the whole document, answered by any face, and taken away on a swap", () => {
  assert.match(tama, /doc\.addEventListener\("pointermove", follow\);/, "the pointer is heard anywhere on the page");
  assert.match(tama, /doc\.addEventListener\("pointerout", lose\);/, "a pointer that leaves the window is forgotten");
  assert.match(tama, /if \(!e\.relatedTarget\) pointer = null;/, "but not one that only crossed into a child");
  assert.match(tama, /if \(!hatched \|\| !playHasEyes\(state\)\) return null;/, "a creature with a face on screen looks up, resting or not");
  assert.match(tama, /if \(held \|\| fly\) return null;/, "one in the air or in your hand is too busy");
  assert.match(tama, /const aimedAt = \(\) => \(pointer \|\| \(options\.farPointer \? options\.farPointer\(\) : null\)\);/, "the pointer this window can see wins over the one from outside");
  assert.match(tama, /if \(!box\.width\) return null;/, "a creature hidden with the rail has nobody to look at");
  assert.match(tama, /if \(held \|\| fly \|\| courting \|\| rally\.playing\(\)\) goal = null;/, "a pointer on top of it stops it, because a click is coming");
  assert.doesNotMatch(tama, /courting \|\| near\) goal = null;/, "merely being looked at no longer does");
  assert.match(tama, /if \(!near\) settleUntil = clock \* 1000 \+ SETTLE_MS;/, "and lingers a moment after you leave");
  assert.match(tama, /if \(near\) return NEAR_TALK;/, "the tooltip says what it is doing");
  assert.match(tama, /frameOf\(spec, state, clock, since, from, kept\)/, "the engine is handed the company");
  assert.match(tama, /doc\.removeEventListener\("pointermove", follow\);/, "a swap takes the page's ears with it");
  assert.match(tama, /doc\.removeEventListener\("pointerout", lose\);/);
});

/* the round trip the throw grew: the arena stopped being the strip at the foot of the rail, and
   what happens after the landing stopped being nothing */
test("out of the corner it is measured against the window, and it always finds its way back", () => {
  assert.match(tama, /left: -corner\.x \+ FLING\.edge,/, "the walls are the window, in the offsets the flight already used");
  assert.match(tama, /const w = win\.innerWidth - FACE_PX - FLING\.edge;/, "and held back by a margin, because it leans as it flies");
  assert.match(tama, /const h = win\.innerHeight - FACE_PX - FLING\.edge;/);
  assert.match(tama, /#pet\.tama-aloft \{ z-index: 60; \}/, "over the panes and under the menus");
  assert.match(tama, /const walkHome = \(dt\) => \{/, "it walks back rather than reappearing");
  assert.match(tama, /nestAgain\(\);\s*return false;/, "and arriving stops the loop instead of stepping past the corner");
  assert.match(tama, /play\("strut"\);/, "the strut moved from the landing to the doorstep");
});

/* the flight left the 40ms tick: 25 frames a second is enough for a face that breathes and far
   too few for something crossing the window */
test("the flight is drawn per frame and stepped at a fixed rate underneath", () => {
  assert.match(tama, /raf = win\.requestAnimationFrame\(glide\);/);
  assert.match(tama, /while \(owed >= FLING\.step\) \{/, "the physics keeps its own fixed step");
  assert.match(tama, /Math\.min\(\(now - lastFrame\) \/ 1000, FLING\.catchup\)/, "a skipped frame cannot teleport it");
  assert.doesNotMatch(tama, /flightStep\(fly, TICK_MS \/ 1000/, "and the tick no longer flies it");
});

/* being thrown is the one gesture that has to not also be affection: the pat is what ends the
   sulk, so a throw that patted on the way down would settle the mood it just caused */
test("a press that travels is a throw and nothing else, and one that stays put is still a pat", () => {
  const how = tama.slice(tama.indexOf("const press = (e) =>"), tama.indexOf("const court = () =>"));
  assert.match(how, /if \(had && !thrown\) \(asking \|\| asked \? takeUp : attend\)\(\);/, "the pat waits for the release to say what the gesture was, and answers an invitation or a serve asked for");
  assert.match(how, /const had = !!grab;/, "and a release that never had a press of ours is no gesture at all");
  assert.match(how, /if \(fly\) soar\(\);/, "and every way out of the press starts the frame loop again");
  assert.doesNotMatch(how, /if \(e\.button !== 0\) return;\s*attend\(\);/, "and no longer lands on the way down");
  assert.match(how, /homing = false;/, "a hand on it calls off the walk home, so it can be thrown again mid-sulk");
  assert.match(how, /host\.setPointerCapture\(e\.pointerId\);/, "which is only safe because both ends stay on the strip");
});

/* it lands cross and stays cross until you make peace or it gets home — but a seat calling for
   you still comes first */
test("the sulk holds until a pat or the doorstep, and never over a siren", () => {
  const how = tama.slice(tama.indexOf("const restPose = () =>"), tama.indexOf("function rest()"));
  assert.match(how, /if \(mood === "needs"\) return PLAY_OF_MOOD\.needs;/, "a seat asking for you wins");
  assert.match(how, /if \(cross\) return "cross";/, "and everything else waits");
  assert.match(tama, /homing = true;\s*const landed = landedMood\(tally, nowMs\(\)\);/, "the mood is decided on the landing, not on the throw");
  assert.match(tama, /cross = landed\.play === "cross";\s*glee = !cross;/, "and it is a joy until the count says sulk");
  assert.match(tama, /if \(!hatched\) return crack\(\);\s*cross = false;/, "a pat ends it");
  assert.match(tama, /if \(courting\) return true;/, "and a pointer on it holds the walk where it is");
});

/* it was sliding home like furniture: the flight branch of `place` had no hop, so the one walk
   the creature does outside its corner was the one walk that did not look like walking */
test("the walk home hops and leans, like the stroll it is", () => {
  const how = tama.slice(tama.indexOf("const place = () =>"), tama.indexOf("const patrol = () =>"));
  assert.match(how, /const hop = homing && !courting \? Math\.abs\(Math\.sin\(aloftClock \* 9\)\) \* 3\.5 : 0;/);
  assert.match(how, /const lean = homing \? heading \* 3 :/, "and it leans the way it is going, not the way it was thrown");
  assert.match(tama, /aloftClock \+= dt;/, "on the frame clock, so the hop is as smooth as the flight");
});

/* being thrown is a game before it is an offence: five rides home are a joy, the sixth starts a
   sulk that lasts five minutes of throws, and after that the creature forgives and plays again */
test("five throws are a joy, the sixth starts a five-minute sulk, and time forgives", () => {
  let tally = { throws: 0, sulkUntil: 0 };
  const rides = [];
  for (let i = 0; i < THROWS_BEFORE_SULK + 3; i++) {
    const landed = landedMood(tally, 1000 + i * 8000);
    tally = landed.tally;
    rides.push(landed.play);
  }
  assert.deepEqual(rides, ["glee", "glee", "glee", "glee", "glee", "cross", "cross", "cross"]);
  const stillSulking = landedMood(tally, tally.sulkUntil - 1);
  assert.equal(stillSulking.play, "cross", "a throw inside the five minutes is still taken badly");
  const forgiven = landedMood(stillSulking.tally, tally.sulkUntil + 1);
  assert.equal(forgiven.play, "glee", "and once the sulk is over the count starts again");
  assert.equal(forgiven.tally.throws, 1);
  assert.equal(SULK_MS, 5 * 60000);
});
