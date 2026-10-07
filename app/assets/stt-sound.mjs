export const STT_SAMPLE_RATE = 16000;

export const STT_QUIET_RMS = 0.005;

export const STT_SHORTEST_MS = 300;

export function joinSound(pieces) {
  let size = 0;
  for (const piece of pieces) size += piece.length;
  const whole = new Float32Array(size);
  let into = 0;
  for (const piece of pieces) { whole.set(piece, into); into += piece.length; }
  return whole;
}

export function loudnessOf(pcm) {
  if (!pcm?.length) return 0;
  let square = 0;
  for (let at = 0; at < pcm.length; at++) square += pcm[at] * pcm[at];
  return Math.sqrt(square / pcm.length);
}

export function wasAnythingSaid(pcm, { rate = STT_SAMPLE_RATE, quiet = STT_QUIET_RMS, shortestMs = STT_SHORTEST_MS } = {}) {
  if (!pcm?.length) return { said: false, why: "nothing" };
  if ((pcm.length / rate) * 1000 < shortestMs) return { said: false, why: "too short" };
  if (loudnessOf(pcm) < quiet) return { said: false, why: "too quiet" };
  return { said: true, why: "" };
}

export function whereTheWordsGo(text, before, cursor) {
  const words = String(text || "").trim();
  if (!words) return { text: before, cursor };
  const at = Math.max(0, Math.min(Number.isInteger(cursor) ? cursor : before.length, before.length));
  const left = before.slice(0, at);
  const right = before.slice(at);
  const needsSpace = left.length > 0 && !/\s$/.test(left);
  const piece = `${needsSpace ? " " : ""}${words}`;
  return { text: `${left}${piece}${right}`, cursor: at + piece.length };
}
