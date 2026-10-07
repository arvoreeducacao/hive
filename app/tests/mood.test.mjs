import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MOODS, MOOD_BREATH, moodOf, fleetMood, playOfMood } from "../assets/mood.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

test("every mood is a fact the server already holds", () => {
  assert.equal(moodOf({ state: "needs" }), "blocked");
  assert.equal(moodOf({ state: "stalled" }), "stuck");
  assert.equal(moodOf({ state: "done" }), "won");
  assert.equal(moodOf({ state: "working" }), "focused");
  assert.equal(moodOf({ state: "working", finish: { error: true } }), "thrashing");
  assert.equal(moodOf({ state: "working", finish: { denials: 2 } }), "thrashing");
});

test("a seat with nothing said about it at all is asleep, not busy", () => {
  assert.equal(moodOf({}), "sleepy");
  assert.equal(moodOf(), "sleepy");
  assert.equal(moodOf({ state: "idle" }), "sleepy");
  assert.equal(moodOf({ state: "ready" }), "sleepy");
});

test("no model is ever asked for a mood", () => {
  /* the AI moods (and the helper CLI that fed them) were removed with the
     simplificar-contexto-chats mission: a third of the fleet's AI calls were captions.
     a mood prompt creeping back into the server is that bill coming back. */
  assert.ok(!server.includes("MOOD_PROMPT"), "the server grew a mood prompt again");
  assert.ok(!server.includes("moodWithAi"), "the server asks a model for a mood again");
  assert.ok(!server.includes("READ_FROM_SCREEN"), "the server reads moods off the screen again");
});

test("one face, many seats: the worst news wins", () => {
  assert.equal(fleetMood(["focused", "thrashing", "sleepy"]), "thrashing");
  assert.equal(fleetMood(["focused", "blocked"]), "blocked");
  assert.equal(fleetMood(["won", "focused"]), "won");
  assert.equal(fleetMood(["sleepy", "sleepy"]), "sleepy");
});

test("an empty fleet is asleep, and so is one full of words nobody knows", () => {
  assert.equal(fleetMood([]), "sleepy");
  assert.equal(fleetMood(), "sleepy");
  assert.equal(fleetMood(["excited", "furious"]), "sleepy");
});

test("every mood the reducer can return has a play", () => {
  for (const mood of MOODS) assert.ok(playOfMood(mood) !== "idle", `${mood} falls through to idle`);
  assert.equal(playOfMood("nonsense"), "idle");
});

/* the page's own chooser, lifted out and run for real: the tests above read app.html as text,
   and text cannot tell you that a quiet fleet stops flashing at you. */
const page = readFileSync(join(HERE, "app.html"), "utf8");
const avatars = readFileSync(join(HERE, "src", "app", "avatars.js"), "utf8");
const core = readFileSync(join(HERE, "src", "app", "core.js"), "utf8");

function choose(opts) {
  const cut = avatars.slice(avatars.indexOf("function fleetFeeling()"), avatars.indexOf("function mugRest()"));
  const vars = [];
  const run = new Function("fleetMood", "playOfMood", "MOOD_BREATH", "st", "$", `
    ${cut}
    return { feeling: fleetFeeling(), play: mugMood(), breathe: (f) => mugBreath(f) };
  `);
  const out = run(fleetMood, playOfMood, MOOD_BREATH,
    {
      alerts: { state: opts.fail ? "fail" : "ok" },
      updateState: { behind: opts.behind || 0 },
      data: { sessions: opts.sessions || [] }
    },
    () => ({ style: { setProperty: (k, v) => vars.push([k, v]) } }));
  out.breathe(out.feeling);
  return { ...out, vars };
}

const seats = (...moods) => moods.map((mood) => ({ mood }));

test("the face the fleet actually gets", () => {
  assert.equal(choose({ sessions: seats("focused", "focused") }).play, "wide");
  assert.equal(choose({ sessions: seats("focused", "thrashing") }).play, "exclaim");
  assert.equal(choose({ sessions: seats("focused", "blocked") }).play, "notify");
  assert.equal(choose({ sessions: seats("won", "focused") }).play, "burst");
  assert.equal(choose({ sessions: seats("focused", "stuck") }).play, "alert");
});

test("a quiet fleet rests its face; only an empty one sleeps", () => {
  /* every seat idle used to mean "idle" and no play at all. it still does — a sleep flash every
     time you finish a turn would be the face going out exactly when you are looking at it. */
  assert.equal(choose({ sessions: seats("sleepy", "sleepy") }).play, "idle");
  assert.equal(choose({ sessions: [] }).play, "sleep");
});

test("a warning about the machine no longer masks what the chats are doing", () => {
  /* the strip and the update are conditions, not events. read ahead of the fleet they pinned the
     face: a machine whose strip is failing is failing all day, so the word never changed again,
     the play never fired again, and the breath sat on one tempo from launch to quit. measured on
     a real window it was `--av-breath: 1.9s` — thrashing — with no seat thrashing anywhere. */
  assert.equal(choose({ sessions: seats("focused"), fail: true }).play, "wide");
  assert.equal(choose({ sessions: seats("blocked"), fail: true }).play, "notify");
  assert.equal(choose({ sessions: seats("focused"), behind: 3 }).play, "wide");
  assert.deepEqual(choose({ sessions: seats("focused"), fail: true }).vars, [["--av-breath", MOOD_BREATH.focused]],
    "the breath must follow the fleet, not the strip");
});

test("the strip and the update flash on the edge, and never at launch", () => {
  const pulse = avatars.slice(avatars.indexOf("function avatarPulse()"), avatars.indexOf("st.hatched = false;"));
  assert.match(pulse, /if \(st\.wasFailing === false && failing\) mugPlay\("alert"\);/, "only when it turns true");
  assert.match(pulse, /if \(st\.wasBehind === false && behind\) mugPlay\("wide"\);/, "only when it turns true");
  assert.match(avatars, /st\.wasFailing = null;/, "null so the first poll only looks");
  assert.match(avatars, /st\.wasBehind = null;/, "a strip already red at launch is not news");
});

test("the mug's ambient is sized for a mug, not inherited from the big face", () => {
  /* 2.8% of a 104px face is a chest rising. 2.8% of the 20px mug is 0.35 of one pixel, which is
     why it has looked frozen: the amplitude was picked on the big face and inherited by the small
     one. this asserts the movement in pixels, because percentages are what hid the bug. */
  const at = (name) => {
    const m = page.match(new RegExp(`@keyframes ${name}[\\s\\S]*?50% \\{ transform: scale\\(([\\d.]+), ([\\d.]+)\\)`));
    assert.ok(m, `${name} is missing`);
    return Number(m[2]);
  };
  const size = Number(page.match(/\.brand \.mug \{ width: (\d+)px/)?.[1]);
  assert.ok(size, "could not read the mug's size out of the css");
  const travel = size * (at("av-breath-mug") - 1) * 0.62;
  assert.ok(travel > 1, `the mug still only moves ${travel.toFixed(2)}px, which nobody can see`);
  assert.ok(travel < size / 8, `${travel.toFixed(2)}px on a ${size}px face is a bounce, not a breath`);
  assert.match(page, /\.brand \.mug\.av-alive svg \{ animation-name: av-breath-mug; \}/);
  assert.match(page, /\.brand \.mug\.av-alive \.avatar > g \{ animation-name: av-sway-mug; \}/);
  /* there is more than one reduced-motion block in the page; the one that matters is the block
     that turns the avatar off, so find it by what it contains rather than by being first. */
  const from = page.indexOf(".av-alive svg, .av-alive .avatar > g");
  assert.ok(from > 0, "the avatar's reduced-motion block moved");
  const reduced = page.slice(from, page.indexOf("}", page.indexOf(".av-follow .av-look { transition: none; }", from)));
  assert.match(reduced, /\.brand \.mug\.av-alive svg, \.brand \.mug\.av-alive \.avatar > g \{ animation: none; \}/,
    "the louder ambient must still switch off for whoever asked for less motion");
});

test("the breath is set every poll, and it is a tempo and nothing else", () => {
  const quiet = choose({ sessions: seats("sleepy") });
  const busy = choose({ sessions: seats("thrashing") });
  assert.deepEqual(quiet.vars, [["--av-breath", MOOD_BREATH.sleepy]]);
  assert.deepEqual(busy.vars, [["--av-breath", MOOD_BREATH.thrashing]]);
  assert.ok(parseFloat(MOOD_BREATH.thrashing) < parseFloat(MOOD_BREATH.sleepy), "trouble breathes faster than sleep");
});

test("everything the page imports from here is actually exported", async () => {
  /* the page imports this at the top of its module: a name that is not here throws before a
     single line of the app runs, and the window comes up blank. no test would notice — they all
     read app.html as text — so this one reads the import and checks it against the module. */
  const line = core.match(/import \{([^}]*)\} from "\/assets\/mood\.mjs";/);
  assert.ok(line, "the page no longer imports the moods");
  const wanted = line[1].split(",").map((s) => s.trim()).filter(Boolean);
  const mod = await import("../assets/mood.mjs");
  for (const name of wanted) assert.ok(name in mod, `the page imports ${name}, which mood.mjs does not export`);
});

test("the module the page imports is one the server agrees to serve", () => {
  assert.match(server, /"\/assets\/mood\.mjs": \["assets\/mood\.mjs", "text\/javascript"\]/, "a 404 here is a blank window");
});

test("the mood rides the seat the panel never publishes", () => {
  const build = server.slice(server.indexOf("function build(name, where, lines"), server.indexOf("let cache ="));
  assert.match(build, /mood: moodOf\(/, "the seat carries its mood to our own screen");
  const team = readFileSync(join(HERE, "lib", "team.mjs"), "utf8");
  assert.ok(!team.includes("mood"), "and team.mjs has no idea the field exists");
});
