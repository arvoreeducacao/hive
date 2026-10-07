const AWAY_AFTER_S = 120;
const AWAY_LOOK_MS = 10000;
const GONE_EVENTS = ["lock-screen", "suspend"];
const BACK_EVENTS = ["unlock-screen", "resume"];

const awayFrom = (state) => state === "idle" || state === "locked";

function watchAway({ power, tell, every = setInterval, halt = clearInterval }) {
  let away = false;
  const settle = (next) => {
    if (next === away) return;
    away = next;
    tell(away);
  };
  const look = () => settle(awayFrom(power.getSystemIdleState(AWAY_AFTER_S)));
  for (const name of GONE_EVENTS) power.on(name, () => settle(true));
  for (const name of BACK_EVENTS) power.on(name, look);
  const timer = every(look, AWAY_LOOK_MS);
  look();
  return { away: () => away, stop: () => halt(timer) };
}

module.exports = { AWAY_AFTER_S, AWAY_LOOK_MS, GONE_EVENTS, BACK_EVENTS, awayFrom, watchAway };
