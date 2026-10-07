import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASK, RALLY, aimFor, askDue, chaseTo, flyBall, hitBy, mountRally, nextScore, resolve, scoreLine,
  serveFrom, wonBy
} from "../assets/pets/rally.mjs";
import { CARE_OF_ACT, SAY_LINES } from "../assets/pets/tamagotchi.mjs";
import { PT_BR } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const tama = readFileSync(join(HERE, "assets", "pets", "tamagotchi.mjs"), "utf8");
const game = readFileSync(join(HERE, "assets", "pets", "rally.mjs"), "utf8");

const COURT = { ceil: 0, floor: RALLY.rise, span: 101 };
const QUIET = {
  playing: false,
  asking: false,
  still: false,
  night: false,
  hatched: true,
  hungry: false,
  mood: "idle",
  quietSince: 1000,
  lastGame: null
};
const AT = QUIET.quietSince + ASK.quiet;

test("the invitation waits for a fleet that has been quiet for a while", () => {
  assert.equal(askDue(AT, QUIET), true);
  assert.equal(askDue(AT - 1, QUIET), false, "a fleet that just went quiet is not quiet yet");
  assert.equal(askDue(AT, { ...QUIET, quietSince: 0 }), false, "a fleet that never went quiet is never asked");
});

test("nothing that waits on a person is interrupted, and a fleet merely working is not waiting", () => {
  for (const mood of ["needs", "answered", "stalled", "done", "ready"]) {
    assert.equal(askDue(AT, { ...QUIET, mood }), false, `${mood} wants you, not a game`);
  }
  for (const mood of ASK.free) {
    assert.equal(askDue(AT, { ...QUIET, mood }), true, `${mood} leaves you free to play`);
  }
  assert.ok(ASK.free.includes("working"), "the wait for a fleet at work is the whole point of the game");
  for (const busy of ["playing", "asking", "still", "night", "hungry"]) {
    assert.equal(askDue(AT, { ...QUIET, [busy]: true }), false, `${busy} rules the invitation out`);
  }
  assert.equal(askDue(AT, { ...QUIET, hatched: false }), false, "an egg cannot play");
});

test("a match just played is not asked for again the same half hour", () => {
  const played = AT - 1;
  assert.equal(askDue(AT, { ...QUIET, lastGame: played }), false);
  assert.equal(askDue(played + ASK.after, { ...QUIET, lastGame: played }), true);
  assert.ok(ASK.after > ASK.every, "the wait after a match is longer than the wait between asks");
});

test("the creature serves upward, and never so flat that the ball skims a wall", () => {
  for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
    const ball = serveFrom(40, COURT.floor, COURT.span, roll);
    assert.ok(ball.vy < 0, "the serve leaves the creature going up");
    assert.ok(Math.abs(ball.vy) > Math.abs(ball.vx), "the serve climbs more than it drifts");
    assert.ok(Math.abs(Math.hypot(ball.vx, ball.vy) - RALLY.serve) < 1, "every serve leaves at the same speed");
  }
  assert.equal(serveFrom(9999, COURT.floor, COURT.span, 0.5).x, COURT.span, "a serve cannot start outside the court");
});

test("the ball turns at the walls instead of leaving the strip", () => {
  const out = flyBall({ x: COURT.span - 1, y: 40, vx: 300, vy: -100 }, 1 / 60, COURT.span);
  assert.equal(out.event, "wall");
  assert.equal(out.ball.x, COURT.span);
  assert.equal(out.ball.vx, -300, "the wall gives the speed back the other way");
  const on = flyBall({ x: 0, y: 40, vx: 60, vy: -100 }, 1 / 60, COURT.span);
  assert.equal(on.event, "");
  assert.ok(on.ball.y < 40, "a ball going up gets closer to the ceiling");
});

test("a bat that reaches the ball sends it back faster, and one that misses does not touch it", () => {
  const coming = { x: 10, y: 0, vx: 20, vy: -200 };
  const back = hitBy(coming, 10, RALLY.bat / 2, 1);
  assert.ok(back.vy > 0, "your bat sends the ball back down");
  assert.ok(Math.hypot(back.vx, back.vy) > Math.hypot(coming.vx, coming.vy), "every touch speeds the ball up");
  assert.equal(hitBy(coming, 10 + RALLY.bat / 2 + RALLY.ball + 1, RALLY.bat / 2, 1), null, "a bat out of reach never touches it");
  const reach = RALLY.bat / 2 + RALLY.ball;
  const right = hitBy(coming, 10 - reach, RALLY.bat / 2, 1);
  const left = hitBy(coming, 10 + reach, RALLY.bat / 2, 1);
  assert.ok(right && left, "the very edge of the bat still counts");
  assert.ok(right.vx > back.vx && left.vx < back.vx, "a ball taken off centre leaves towards that side");
});

test("however long the rally, the ball never outruns the fastest it is allowed to go", () => {
  let ball = { x: 0, y: 0, vx: 30, vy: -200 };
  for (let i = 0; i < 60; i += 1) {
    ball = hitBy(ball, ball.x, RALLY.bat / 2, i % 2 ? 1 : -1);
    assert.ok(Math.hypot(ball.vx, ball.vy) <= RALLY.fastest + 0.001, "the speed is capped");
    assert.ok(Math.abs(ball.vy) >= Math.hypot(ball.vx, ball.vy) * RALLY.steepest - 0.001, "the ball always crosses the court");
  }
});

test("the creature runs after a ball on its way in and goes back to the middle once it leaves", () => {
  assert.equal(aimFor({ x: 70, vy: 120 }, COURT.span), 70, "a ball coming down is where it wants to be");
  assert.equal(aimFor({ x: 70, vy: -120 }, COURT.span), 0, "a ball going up sends it home to the middle");
  assert.equal(aimFor({ x: 400, vy: 120 }, COURT.span), COURT.span, "it never runs past the wall");
  assert.equal(chaseTo(0, 100, 1 / 60, COURT.span), RALLY.petSpeed / 60, "it can only run so fast");
  assert.equal(chaseTo(0, -100, 1 / 60, COURT.span), -RALLY.petSpeed / 60);
  assert.equal(chaseTo(COURT.span, 999, 1, COURT.span), COURT.span, "the wall stops the run");
  assert.ok(chaseTo(0, 100, 1, COURT.span) === 100, "a target within reach is simply reached");
});

test("a ball past the bat is a point, and one still short of the line is still in play", () => {
  const past = { x: 0, y: COURT.ceil - RALLY.out - 1, vx: 0, vy: -200 };
  assert.equal(resolve(past, { ...COURT, aim: 90, pet: 0 }).event, "miss-you");
  assert.equal(resolve({ ...past, y: COURT.ceil - 1 }, { ...COURT, aim: 90, pet: 0 }).event, "", "a ball barely past the bat is not a point yet");
  const under = { x: 0, y: COURT.floor + RALLY.out + 1, vx: 0, vy: 200 };
  assert.equal(resolve(under, { ...COURT, aim: 0, pet: 90 }).event, "miss-pet");
  const met = resolve({ x: 0, y: COURT.ceil, vx: 0, vy: -200 }, { ...COURT, aim: 0, pet: 0 });
  assert.equal(met.event, "hit-you");
  assert.equal(met.ball.y, COURT.ceil, "the ball is put back on the line it was met at");
});

test("the match ends at five, and a point is only ever added to one side", () => {
  assert.deepEqual(nextScore({ mine: 0, theirs: 0 }, "you"), { mine: 1, theirs: 0 });
  assert.deepEqual(nextScore({ mine: 0, theirs: 0 }, "pet"), { mine: 0, theirs: 1 });
  assert.equal(wonBy({ mine: RALLY.points - 1, theirs: 0 }), "");
  assert.equal(wonBy({ mine: RALLY.points, theirs: 0 }), "you");
  assert.equal(wonBy({ mine: 0, theirs: RALLY.points }), "pet");
  assert.equal(wonBy({ mine: RALLY.points, theirs: RALLY.points }), "", "nobody wins a draw");
  assert.equal(scoreLine({ mine: 5, theirs: 3 }), "5–3");
});

test("somebody who never moves loses the match, and it takes a handful of serves to do it", () => {
  let ball = serveFrom(0, COURT.floor, COURT.span, 0.5);
  let score = { mine: 0, theirs: 0 };
  let ticks = 0;
  while (!wonBy(score) && ticks < 60000) {
    ticks += 1;
    ball = flyBall(ball, RALLY.step, COURT.span).ball;
    const seen = resolve(ball, { ...COURT, aim: 999, pet: 0 });
    ball = seen.ball;
    if (seen.event === "miss-you") {
      score = nextScore(score, "pet");
      ball = serveFrom(0, COURT.floor, COURT.span, 0.5);
    }
  }
  assert.equal(wonBy(score), "pet", "a bat that is never there loses every point");
  assert.ok(ticks * RALLY.step < 20, "walking away costs less than twenty seconds");
});

test("a rally where both bats are always under the ball never ends by itself", () => {
  let ball = serveFrom(0, COURT.floor, COURT.span, 0.5);
  for (let i = 0; i < 20000; i += 1) {
    ball = flyBall(ball, RALLY.step, COURT.span).ball;
    const seen = resolve(ball, { ...COURT, aim: ball.x, pet: ball.x });
    assert.ok(seen.event !== "miss-you" && seen.event !== "miss-pet", "a bat under the ball always returns it");
    ball = seen.ball;
    assert.ok(ball.y >= COURT.ceil - RALLY.out && ball.y <= COURT.floor + RALLY.out, "the ball stays in the court");
  }
});

test("a hidden window and calm mode are not courts either", () => {
  assert.match(tama, /if \(doc\.hidden\) \{\n      dropAsk\(\);\n      rally\.stop\(\);/, "a hidden window is not a court");
  assert.match(game, /if \(phase \|\| still\(\)\) return false;/, "calm mode never starts a match");
  assert.match(game, /@media \(prefers-reduced-motion: reduce\) \{ #pet \.pong \{ display: none; \} \}/, "and never draws one either");
  assert.match(game, /#pet \.pong \{[^}]*pointer-events: none;/, "the ball flies over the rail without stealing a click from it");
});

test("a match that stops being drawn is not left open forever", () => {
  assert.ok(RALLY.longest > 60000, "a real match has room to finish");
  assert.match(tama, /if \(rally\.playing\(\) && nowMs\(\) - gameFrom > RALLY\.longest\) rally\.stop\(\);/, "the clock that keeps ticking behind a covered window is the one that closes the match");
  assert.match(tama, /gameFrom = nowMs\(\);/, "the match knows when it started");
});

test("playing is a kind of care, and the creature says so in both languages", () => {
  assert.ok(CARE_OF_ACT.rally > CARE_OF_ACT.pet, "a whole match is worth more than a pat");
  assert.ok(CARE_OF_ACT.rally < CARE_OF_ACT.feed, "it is company, not dinner");
  assert.match(tama, /care = careAfter\(care, "rally"\);/, "the heart is fed when the match ends");
  for (const line of [SAY_LINES.pong, SAY_LINES.youWin, SAY_LINES.iWin]) {
    assert.ok(line, "the invitation and the result are said out loud");
    assert.ok(PT_BR[line], `${line} is translated`);
  }
  assert.ok(SAY_LINES.youWin.includes("{score}") && SAY_LINES.iWin.includes("{score}"), "the result carries the score");
});

test("the game hangs nothing on the page when nobody is playing", () => {
  const bits = [];
  const style = { remove: () => bits.push("style") };
  const made = () => ({
    className: "",
    style: { transform: "", opacity: "" },
    setAttribute() {},
    remove: () => bits.push("bit")
  });
  const doc = { createElement: made, head: { appendChild() {} }, defaultView: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} } };
  doc.createElement = (tag) => (tag === "style" ? Object.assign(made(), style) : made());
  const host = { appendChild() {}, style: { setProperty() {} }, getBoundingClientRect: () => ({ left: 0, width: 232 }) };
  const rally = mountRally(host, { document: doc, still: () => true });
  assert.equal(rally.playing(), false);
  assert.equal(rally.start(), false, "calm mode refuses the match");
  rally.destroy();
  assert.equal(rally.playing(), false);
});
