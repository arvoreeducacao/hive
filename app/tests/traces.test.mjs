import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTraces } from "../lib/traces.mjs";

test("a span is written to the local file and the summary ranks routes by their slow tail", () => {
  const dir = mkdtempSync(join(tmpdir(), "traces-"));
  const clock = { t: 1000 };
  const traces = createTraces({ dir, now: () => clock.t });
  for (const ms of [10, 20, 30, 900]) {
    const end = traces.span("http", { method: "GET", route: "/api/hive" });
    clock.t += ms;
    end({ status: 200 });
  }
  const end = traces.span("http", { method: "POST", route: "/api/say" });
  clock.t += 50;
  end({ status: 500 });
  traces.write({ name: "event_loop.stall", start: 1, ms: 2500 });
  const said = traces.summary();
  assert.equal(said.stalls, 1);
  assert.deepEqual(said.routes[0], { route: "GET /api/hive", n: 4, errors: 0, p50: 30, p95: 900, max: 900 });
  assert.equal(said.routes[1].errors, 1);
});

test("the file rotates by size and keeps a bounded number of old files", () => {
  const dir = mkdtempSync(join(tmpdir(), "traces-"));
  const traces = createTraces({ dir, fileMax: 200, kept: 3 });
  for (let i = 0; i < 60; i++) traces.write({ name: "x", start: i, ms: 1, pad: "y".repeat(40) });
  assert.ok(existsSync(join(dir, "traces.ndjson")));
  assert.ok(existsSync(join(dir, "traces.2.ndjson")));
  assert.equal(existsSync(join(dir, "traces.3.ndjson")), false);
});

test("with an OTLP endpoint the spans leave in batches as OTLP JSON", async () => {
  const dir = mkdtempSync(join(tmpdir(), "traces-"));
  const sent = [];
  const traces = createTraces({ dir, otlp: "http://signoz:4318/", send: async (url, body) => sent.push([url, JSON.parse(body)]) });
  traces.write({ name: "http", start: 1000, ms: 5, method: "GET", route: "/api/hive", status: 200 });
  assert.equal(await traces.flush(), 1);
  assert.equal(sent[0][0], "http://signoz:4318/v1/traces");
  const span = sent[0][1].resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(span.name, "GET /api/hive");
  assert.equal(span.endTimeUnixNano, "1005000000");
  assert.equal(await traces.flush(), 0);
});
