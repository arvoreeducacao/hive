import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export const TRACE_FILE_MAX = 10 * 1024 * 1024;
export const TRACE_FILES_KEPT = 5;
export const STALL_MS = 2000;
const OTLP_BATCH_MAX = 500;

export function createTraces({ dir, now = () => Date.now(), fileMax = TRACE_FILE_MAX, kept = TRACE_FILES_KEPT, otlp = "", send = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body }), service = "hive" } = {}) {
  const file = join(dir, "traces.ndjson");
  const outbox = [];

  function rotate() {
    try {
      if (!existsSync(file) || statSync(file).size < fileMax) return;
      rmSync(join(dir, `traces.${kept - 1}.ndjson`), { force: true });
      for (let n = kept - 2; n >= 1; n--) if (existsSync(join(dir, `traces.${n}.ndjson`))) renameSync(join(dir, `traces.${n}.ndjson`), join(dir, `traces.${n + 1}.ndjson`));
      renameSync(file, join(dir, "traces.1.ndjson"));
    } catch {}
  }

  function write(span) {
    try {
      mkdirSync(dir, { recursive: true });
      rotate();
      appendFileSync(file, `${JSON.stringify(span)}\n`);
    } catch {}
    if (otlp) {
      outbox.push(span);
      if (outbox.length > OTLP_BATCH_MAX) outbox.splice(0, outbox.length - OTLP_BATCH_MAX);
    }
  }

  function span(name, attrs = {}) {
    const start = now();
    return (extra = {}) => {
      const done = { name, start, ms: now() - start, ...attrs, ...extra };
      write(done);
      return done;
    };
  }

  function read() {
    try { return readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)); } catch { return []; }
  }

  function summary({ top = 15 } = {}) {
    const groups = new Map();
    let stalls = 0;
    for (const one of read()) {
      if (one.name === "event_loop.stall") { stalls += 1; continue; }
      const key = `${one.method || ""} ${one.route || one.name}`.trim();
      const g = groups.get(key) || { route: key, n: 0, errors: 0, ms: [] };
      g.n += 1;
      if (Number(one.status) >= 500) g.errors += 1;
      g.ms.push(Number(one.ms) || 0);
      groups.set(key, g);
    }
    const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
    const routes = [...groups.values()].map((g) => {
      const sorted = g.ms.sort((a, b) => a - b);
      return { route: g.route, n: g.n, errors: g.errors, p50: pct(sorted, 0.5), p95: pct(sorted, 0.95), max: sorted.at(-1) || 0 };
    }).sort((a, b) => b.p95 - a.p95).slice(0, top);
    return { routes, stalls };
  }

  function otlpBody(spans) {
    const nano = (ms) => String(BigInt(Math.round(ms)) * 1000000n);
    const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const attr = (key, value) => ({ key, value: typeof value === "number" ? { doubleValue: value } : { stringValue: String(value) } });
    return JSON.stringify({
      resourceSpans: [{
        resource: { attributes: [attr("service.name", service)] },
        scopeSpans: [{
          scope: { name: "hive" },
          spans: spans.map((one) => ({
            traceId: hex(16), spanId: hex(8), name: one.route ? `${one.method} ${one.route}` : one.name, kind: 2,
            startTimeUnixNano: nano(one.start), endTimeUnixNano: nano(one.start + one.ms),
            status: { code: Number(one.status) >= 500 ? 2 : 1 },
            attributes: Object.entries(one).filter(([key]) => !["name", "start", "ms"].includes(key)).map(([key, value]) => attr(key, value))
          }))
        }]
      }]
    });
  }

  async function flush() {
    if (!otlp || !outbox.length) return 0;
    const batch = outbox.splice(0, outbox.length);
    try { await send(`${otlp.replace(/\/$/, "")}/v1/traces`, otlpBody(batch)); } catch {}
    return batch.length;
  }

  function watchLoop({ every = 500, stall = STALL_MS, later = setInterval } = {}) {
    let last = now();
    let cpu = process.cpuUsage();
    const timer = later(() => {
      const at = now();
      const late = at - last - every;
      if (late >= stall) {
        const used = process.cpuUsage(cpu);
        write({ name: "event_loop.stall", start: last, ms: late, cpuUserMs: Math.round(used.user / 1000), cpuSystemMs: Math.round(used.system / 1000) });
      }
      last = at;
      cpu = process.cpuUsage();
    }, every);
    timer.unref?.();
    return timer;
  }

  return { span, write, read, summary, flush, watchLoop, otlpBody };
}
