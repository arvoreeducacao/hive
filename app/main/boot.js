const ORDER = ["node", "server", "pod"];

const LABELS = {
  node: "looking for node",
  server: "starting server",
  pod: "connecting to the pod"
};

const REASONS = {
  node: "could not find node",
  server: "the server did not start",
  pod: "could not connect to the pod"
};

function initial() {
  return { step: ORDER[0], error: "" };
}

function reduce(state, event) {
  if (state.error) return state;
  if (event.type === "step") return ORDER.includes(event.step) ? { ...state, step: event.step } : state;
  if (event.type === "ready") return { ...state, step: "ready" };
  if (event.type === "failed") return { ...state, error: event.reason || REASONS[state.step] || "could not start" };
  if (event.type === "timeout") return { ...state, error: `${REASONS[state.step] || "could not start"} within ${Math.round((event.limit || 0) / 1000)}s` };
  return state;
}

function shouldSwitchToBase(state) {
  return state.step === "ready" && !state.error;
}

function steps(state) {
  const found = ORDER.indexOf(state.step);
  const at = found === -1 ? ORDER.length : found;
  return ORDER.map((name, i) => {
    let situation = i < at ? "done" : i === at ? "now" : "waiting";
    if (state.error && i === at) situation = "failed";
    return { name, label: LABELS[name], situation };
  });
}

function screen(state) {
  return { steps: steps(state), error: state.error };
}

module.exports = { ORDER, LABELS, REASONS, initial, reduce, shouldSwitchToBase, steps, screen };
