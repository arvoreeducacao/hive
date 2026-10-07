const beats = new Map();

const arm = (entry) => {
  entry.id = setInterval(entry.fn, entry.ms);
  entry.id.unref?.();
};

const disarm = (entry) => {
  if (entry.id === undefined) return;
  clearInterval(entry.id);
  entry.id = undefined;
};

export function every(name, ms, fn, { background = false } = {}) {
  stopBeat(name);
  const entry = { ms, fn, background, id: undefined };
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

document.addEventListener("visibilitychange", () => {
  for (const entry of beats.values()) {
    if (entry.background) continue;
    disarm(entry);
    if (document.hidden) continue;
    entry.fn();
    arm(entry);
  }
});
