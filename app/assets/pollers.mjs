const beats = new Map();

let pace = (name, ms) => ms;

const arm = (entry) => {
  const ms = pace(entry.name, entry.ms);
  if (!(ms > 0)) return;
  entry.id = setInterval(entry.fn, ms);
  entry.id.unref?.();
};

const disarm = (entry) => {
  if (entry.id === undefined) return;
  clearInterval(entry.id);
  entry.id = undefined;
};

export function every(name, ms, fn, { background = false } = {}) {
  stopBeat(name);
  const entry = { name, ms, fn, background, id: undefined };
  beats.set(name, entry);
  if (background || !document.hidden) arm(entry);
}

export function stopBeat(name) {
  const entry = beats.get(name);
  if (!entry) return;
  disarm(entry);
  beats.delete(name);
}

export const beatOn = (name) => beats.has(name);

export function setPace(next) {
  pace = typeof next === "function" ? next : (name, ms) => ms;
  for (const entry of beats.values()) {
    disarm(entry);
    if (entry.background || !document.hidden) arm(entry);
  }
}

document.addEventListener("visibilitychange", () => {
  for (const entry of beats.values()) {
    if (entry.background) continue;
    disarm(entry);
    if (document.hidden) continue;
    entry.fn();
    arm(entry);
  }
});
