import { execFile, spawn as spawnChild } from "node:child_process";
import { createChunker, MEETING_SAMPLE_RATE, rmsOf } from "../assets/meeting-chunks.mjs";

export const OUTPUT_DEFAULT = "";
export const OUTPUT_QUIET_RMS = 0.003;
export const OUTPUT_TARGET_PEAK = 0.5;

const SINK_NAME = /^[\w.:@+-]{1,200}$/;

export const isOutputName = (name) => name === OUTPUT_DEFAULT || SINK_NAME.test(String(name || ""));

export const monitorOf = (output) => (output && isOutputName(output) ? `${output}.monitor` : "@DEFAULT_MONITOR@");

function run(cmd, args, timeout = 4000) {
  return new Promise((done) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 << 20 }, (err, stdout) => done({ ok: !err, out: String(stdout || "") }));
  });
}

export function outputsFromPactl(text, chosen = "") {
  let sinks = [];
  try { sinks = JSON.parse(text); } catch { return []; }
  if (!Array.isArray(sinks)) return [];
  return sinks.filter((one) => isOutputName(one?.name) && one.name).map((one) => {
    const said = one.properties || {};
    const device = [said["device.description"], said["node.description"], one.description].find((label) => label && label !== "(null)") || one.name;
    const nick = said["node.nick"] && said["node.nick"] !== "(null)" && !String(device).includes(said["node.nick"]) ? ` · ${said["node.nick"]}` : "";
    return { id: one.name, name: `${device}${nick}`, default: one.name === chosen };
  });
}

export async function listOutputs({ platform = process.platform, exec = run } = {}) {
  if (platform !== "linux") return { supported: false, outputs: [] };
  const [sinks, chosen] = await Promise.all([exec("pactl", ["-f", "json", "list", "sinks"]), exec("pactl", ["get-default-sink"])]);
  if (!sinks.ok) return { supported: false, outputs: [] };
  return { supported: true, outputs: outputsFromPactl(sinks.out, chosen.out.trim()) };
}

export function loudEnough(pcm, { quiet = OUTPUT_QUIET_RMS, target = OUTPUT_TARGET_PEAK } = {}) {
  if (rmsOf(pcm) < quiet) return null;
  let peak = 0;
  for (let at = 0; at < pcm.length; at++) { const loud = Math.abs(pcm[at]); if (loud > peak) peak = loud; }
  if (!peak || peak >= target) return pcm;
  const gain = Math.min(8, target / peak);
  const out = new Float32Array(pcm.length);
  for (let at = 0; at < pcm.length; at++) out[at] = pcm[at] * gain;
  return out;
}

export function createOutputTap({ output = OUTPUT_DEFAULT, onChunk, spawn = spawnChild, log = () => {} }) {
  const chunker = createChunker({ quiet: 0 });
  let left = Buffer.alloc(0);
  let ended = false;
  let heardBytes = 0;
  const child = spawn("parec", ["--device", monitorOf(output), "--format=float32le", `--rate=${MEETING_SAMPLE_RATE}`, "--channels=1", "--latency-msec=100"], { stdio: ["ignore", "pipe", "ignore"] });
  const gone = new Promise((done) => { child.on("close", done); child.on("error", (wrong) => { log(`meetings: the computer's sound did not open — ${wrong.message}`); done(); }); });
  const hand = (chunk) => { if (chunk) onChunk({ at: chunk.at, pcm: chunk.pcm }); };
  child.stdout?.on("data", (bytes) => {
    if (ended) return;
    heardBytes += bytes.length;
    const whole = left.length ? Buffer.concat([left, bytes]) : bytes;
    const usable = whole.length - (whole.length % 4);
    left = whole.subarray(usable);
    if (!usable) return;
    const copy = new Float32Array(usable / 4);
    for (let at = 0; at < copy.length; at++) copy[at] = whole.readFloatLE(at * 4);
    hand(chunker.push(copy));
  });
  return {
    level: () => chunker.level(),
    heard: () => heardBytes > 0,
    async stop({ discard = false } = {}) {
      if (ended) return;
      ended = true;
      try { child.kill("SIGTERM"); } catch {}
      await Promise.race([gone, new Promise((done) => setTimeout(done, 1500))]);
      if (!discard) hand(chunker.flush());
    }
  };
}
