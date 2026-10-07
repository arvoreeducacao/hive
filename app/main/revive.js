const REVIVALS = 3;
const STEADY = 60000;
const HINT = `A \`pkill -f "node server.mjs"\` in a session hits this server too — kill a dev server by its port instead.`;

function killedFromOutside(code, signal) {
  return code === 0 || (code === null && Boolean(signal));
}

function readDeath({ code, signal = null, revivals = 0, aliveFor = 0 }) {
  if (!killedFromOutside(code, signal)) {
    return {
      verdict: "mourn",
      reason: `the server died (code ${code})`,
      said: `The server died (code ${code}).`
    };
  }
  const before = aliveFor >= STEADY ? 0 : revivals;
  if (before >= REVIVALS) {
    return {
      verdict: "mourn",
      reason: `something keeps killing the server — ${REVIVALS} restarts in a row died`,
      said: `Something outside keeps killing the server — ${REVIVALS} restarts in a row died.\n\n${HINT}`
    };
  }
  return { verdict: "revive", revivals: before + 1, of: REVIVALS, killedBy: signal || "a clean stop" };
}

module.exports = { REVIVALS, STEADY, killedFromOutside, readDeath };
