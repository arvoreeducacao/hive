const MINUTE = 60000;
const LONG_TASK_MS = 50;
const KEEP_MINUTES = 30;

const fresh = () => ({ count: 0, totalMs: 0, max: 0, skipped: {}, longTasks: 0 });

export function makePerf({ now = () => Date.now(), clock = () => performance.now(), mark = () => {} } = {}) {
  const minutes = new Map();
  const minuteOf = () => {
    const key = Math.floor(now() / MINUTE);
    let bucket = minutes.get(key);
    if (!bucket) {
      bucket = fresh();
      minutes.set(key, bucket);
      for (const old of [...minutes.keys()]) if (old < key - KEEP_MINUTES) minutes.delete(old);
    }
    return bucket;
  };

  return {
    start(name) {
      mark(`${name}:start`);
      return clock();
    },
    end(name, from) {
      const took = clock() - from;
      mark(`${name}:end`);
      const bucket = minuteOf();
      bucket.count += 1;
      bucket.totalMs += took;
      if (took > bucket.max) bucket.max = took;
      return took;
    },
    skip(reason) {
      const bucket = minuteOf();
      bucket.skipped[reason] = (bucket.skipped[reason] || 0) + 1;
    },
    longTask(ms) {
      if (ms < LONG_TASK_MS) return;
      minuteOf().longTasks += 1;
    },
    stats() {
      const out = {};
      for (const [key, bucket] of minutes) out[new Date(key * MINUTE).toISOString().slice(11, 16)] = { ...bucket, avgMs: bucket.count ? bucket.totalMs / bucket.count : 0 };
      return out;
    },
    now: () => minuteOf()
  };
}

export const PERF_FLAG = "hive.perf";

export function perfWanted({ storage = globalThis.localStorage } = {}) {
  try { return !!storage?.getItem(PERF_FLAG); } catch { return false; }
}

export function watchLongTasks(perf, { storage = globalThis.localStorage, Observer = globalThis.PerformanceObserver } = {}) {
  if (!perfWanted({ storage }) || typeof Observer !== "function") return null;
  const observer = new Observer((list) => {
    for (const entry of list.getEntries()) perf.longTask(entry.duration);
  });
  try { observer.observe({ type: "longtask", buffered: true }); } catch { return null; }
  return observer;
}
