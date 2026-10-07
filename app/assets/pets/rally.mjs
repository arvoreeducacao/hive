export const RALLY = {
  ball: 7,
  rise: 168,
  bat: 46,
  batThick: 6,
  head: 52,
  serve: 214,
  gain: 1.04,
  fastest: 380,
  english: 2.6,
  steepest: 0.45,
  petSpeed: 200,
  wobble: 14,
  step: 1 / 120,
  catchup: 0.05,
  out: 30,
  serveWait: 900,
  longest: 180000,
  overWait: 1500,
  points: 5
};

export const ASK = {
  every: 300000,
  spread: 300000,
  quiet: 90000,
  hold: 12000,
  after: 1800000,
  free: ["idle", "working"]
};

export function askDue(now, seen) {
  if (!seen || seen.playing || seen.asking || seen.still || seen.night || !seen.hatched || seen.hungry) return false;
  if (!ASK.free.includes(seen.mood)) return false;
  if (!(seen.quietSince > 0) || now - seen.quietSince < ASK.quiet) return false;
  if (typeof seen.lastGame === "number" && now - seen.lastGame < ASK.after) return false;
  return true;
}

export function serveFrom(at, y, span, roll) {
  const side = (Math.min(Math.max(roll, 0), 0.999) * 2 - 1) * RALLY.serve * 0.45;
  return {
    x: Math.max(-span, Math.min(span, at)),
    y,
    vx: side,
    vy: -Math.sqrt(Math.max(RALLY.serve * RALLY.serve - side * side, 1))
  };
}

export function flyBall(ball, dt, span) {
  const next = { x: ball.x + ball.vx * dt, y: ball.y + ball.vy * dt, vx: ball.vx, vy: ball.vy };
  if (next.x < -span || next.x > span) {
    next.x = next.x < -span ? -span : span;
    next.vx = -next.vx;
    return { ball: next, event: "wall" };
  }
  return { ball: next, event: "" };
}

export function hitBy(ball, at, half, dir) {
  const off = ball.x - at;
  if (Math.abs(off) > half + RALLY.ball) return null;
  const speed = Math.min(RALLY.fastest, Math.hypot(ball.vx, ball.vy) * RALLY.gain);
  const drift = ball.vx + off * RALLY.english;
  const climb = Math.abs(ball.vy);
  const len = Math.hypot(drift, climb) || 1;
  let side = drift / len;
  let up = climb / len;
  if (up < RALLY.steepest) {
    up = RALLY.steepest;
    side = Math.sign(side || 1) * Math.sqrt(1 - up * up);
  }
  return { x: ball.x, y: ball.y, vx: side * speed, vy: dir * up * speed };
}

export function resolve(ball, court) {
  if (ball.vy < 0 && ball.y <= court.ceil) {
    const back = hitBy(ball, court.aim, RALLY.bat / 2, 1);
    if (back) return { ball: { ...back, y: court.ceil }, event: "hit-you" };
    if (ball.y < court.ceil - RALLY.out) return { ball, event: "miss-you" };
  }
  if (ball.vy > 0 && ball.y >= court.floor) {
    const back = hitBy(ball, court.pet, RALLY.head / 2, -1);
    if (back) return { ball: { ...back, y: court.floor }, event: "hit-pet" };
    if (ball.y > court.floor + RALLY.out) return { ball, event: "miss-pet" };
  }
  return { ball, event: "" };
}

export function aimFor(ball, span, wobble = 0) {
  const want = ball.vy > 0 ? ball.x + wobble : 0;
  return Math.max(-span, Math.min(span, want));
}

export function chaseTo(at, want, dt, span, speed = RALLY.petSpeed) {
  const reach = speed * dt;
  const gone = Math.max(-reach, Math.min(reach, want - at));
  return Math.max(-span, Math.min(span, at + gone));
}

export function nextScore(score, who) {
  return who === "you" ? { mine: score.mine + 1, theirs: score.theirs } : { mine: score.mine, theirs: score.theirs + 1 };
}

export function wonBy(score) {
  if (score.mine >= RALLY.points && score.mine > score.theirs) return "you";
  if (score.theirs >= RALLY.points && score.theirs > score.mine) return "pet";
  return "";
}

export const scoreLine = (score) => `${score.mine}–${score.theirs}`;

const STYLE = `
#pet .pong { position: absolute; left: 50%; top: 0; pointer-events: none; will-change: transform; }
#pet .pong-ball { width: ${RALLY.ball * 2}px; height: ${RALLY.ball * 2}px; margin: ${-RALLY.ball}px 0 0 ${-RALLY.ball}px; border-radius: 50%; background: var(--pong-ink, var(--accent)); box-shadow: 0 1px 6px rgba(0, 0, 0, .35); }
#pet .pong-bat { width: ${RALLY.bat}px; height: ${RALLY.batThick}px; margin: ${-RALLY.batThick / 2}px 0 0 ${-RALLY.bat / 2}px; border-radius: ${RALLY.batThick}px; background: var(--txt-3, #8b8b93); }
#pet .pong-score { margin-left: -30px; width: 60px; text-align: center; font-family: var(--mono); font-size: 11px; letter-spacing: .08em; color: var(--txt-3, #8b8b93); }
@media (prefers-reduced-motion: reduce) { #pet .pong { display: none; } }
body.no-motion #pet .pong { display: none; }
`;

export function mountRally(host, options = {}) {
  const doc = options.document || (host && host.ownerDocument) || document;
  const win = doc.defaultView;
  const still = options.still || (() => false);
  const floorAt = options.floorAt || (() => 0);
  const spanAt = options.spanAt || (() => 0);
  const aimAt = options.aimAt || (() => null);
  const petAt = options.petAt || (() => 0);
  const movePet = options.movePet || (() => {});
  const on = (name, arg) => { if (typeof options[name] === "function") options[name](arg); };

  const style = doc.createElement("style");
  style.textContent = STYLE;
  doc.head.appendChild(style);

  const ball = doc.createElement("span");
  ball.className = "pong pong-ball";
  ball.setAttribute("aria-hidden", "true");
  const bat = doc.createElement("span");
  bat.className = "pong pong-bat";
  bat.setAttribute("aria-hidden", "true");
  const board = doc.createElement("div");
  board.className = "pong pong-score";
  board.setAttribute("aria-hidden", "true");

  let flight = null;
  let score = { mine: 0, theirs: 0 };
  let phase = "";
  let waitUntil = 0;
  let clock = 0;
  let raf = 0;
  let lastFrame = 0;
  let owed = 0;

  const ceilOf = () => floorAt() - RALLY.rise;

  const courtNow = () => ({
    ceil: ceilOf(),
    floor: floorAt(),
    pet: petAt(),
    aim: aimAt() ?? petAt()
  });

  const paint = () => {
    const ceil = ceilOf();
    bat.style.transform = `translate(${(aimAt() ?? 0).toFixed(1)}px, ${ceil.toFixed(1)}px)`;
    board.style.transform = `translate(0px, ${(ceil - 20).toFixed(1)}px)`;
    board.textContent = scoreLine(score);
    if (!flight) {
      ball.style.opacity = "0";
      return;
    }
    ball.style.opacity = "1";
    ball.style.transform = `translate(${flight.x.toFixed(1)}px, ${flight.y.toFixed(1)}px)`;
  };

  const serve = () => {
    phase = "live";
    flight = serveFrom(petAt(), floorAt() - RALLY.ball, spanAt(), Math.random());
    on("onServe");
  };

  const point = (who) => {
    score = nextScore(score, who);
    flight = null;
    on("onPoint", who);
    const winner = wonBy(score);
    if (!winner) {
      phase = "serve";
      waitUntil = clock + RALLY.serveWait / 1000;
      return;
    }
    phase = "over";
    waitUntil = clock + RALLY.overWait / 1000;
    on("onEnd", { winner, score: scoreLine(score) });
  };

  const advance = (dt) => {
    if (phase !== "live") {
      if (clock < waitUntil) return true;
      if (phase === "over") return false;
      serve();
      return true;
    }
    const span = spanAt();
    const flown = flyBall(flight, dt, span);
    flight = flown.ball;
    const seen = resolve(flight, courtNow());
    flight = seen.ball;
    if (seen.event === "hit-you" || seen.event === "hit-pet") on("onHit", seen.event);
    else if (seen.event === "miss-you") point("pet");
    else if (seen.event === "miss-pet") point("you");
    if (phase !== "live") return true;
    movePet(chaseTo(petAt(), aimFor(flight, span, Math.sin(clock * 2.3) * RALLY.wobble), dt, span));
    return true;
  };

  const frame = (at) => {
    raf = 0;
    if (!phase) return;
    const dt = lastFrame ? Math.min((at - lastFrame) / 1000, RALLY.catchup) : RALLY.step;
    lastFrame = at;
    owed += dt;
    while (owed >= RALLY.step) {
      owed -= RALLY.step;
      clock += RALLY.step;
      if (!advance(RALLY.step)) return stop();
    }
    paint();
    raf = win.requestAnimationFrame(frame);
  };

  const spin = () => {
    if (raf || !phase) return;
    lastFrame = 0;
    owed = 0;
    raf = win.requestAnimationFrame(frame);
  };

  function stop() {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    if (!phase) return;
    phase = "";
    flight = null;
    for (const bit of [ball, bat, board]) bit.remove();
    on("onOver");
  }

  return {
    start() {
      if (phase || still()) return false;
      score = { mine: 0, theirs: 0 };
      clock = 0;
      phase = "serve";
      waitUntil = RALLY.serveWait / 1000;
      if (options.colour) host.style.setProperty("--pong-ink", options.colour());
      for (const bit of [ball, bat, board]) host.appendChild(bit);
      paint();
      spin();
      return true;
    },
    stop,
    playing: () => phase !== "",
    scoreNow: () => scoreLine(score),
    destroy() {
      stop();
      style.remove();
    }
  };
}
