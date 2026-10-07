export const MEETING_SAMPLE_RATE = 16000;

export const MEETING_CHUNK_SECONDS = 30;

export const MEETING_CUT_WINDOW_SECONDS = 4;

export const MEETING_QUIET_RMS = 0.004;

function join(pieces, size) {
  const whole = new Float32Array(size);
  let into = 0;
  for (const piece of pieces) { whole.set(piece, into); into += piece.length; }
  return whole;
}

export function rmsOf(pcm, from = 0, to = pcm.length) {
  if (to <= from) return 0;
  let square = 0;
  for (let at = from; at < to; at++) square += pcm[at] * pcm[at];
  return Math.sqrt(square / (to - from));
}

export function quietestCut(pcm, { rate = MEETING_SAMPLE_RATE, window = MEETING_CUT_WINDOW_SECONDS } = {}) {
  const block = Math.round(rate / 10);
  const from = Math.max(block, pcm.length - Math.round(window * rate));
  let best = pcm.length;
  let quietest = Infinity;
  for (let at = from; at + block <= pcm.length; at += block) {
    const loud = rmsOf(pcm, at, at + block);
    if (loud < quietest) { quietest = loud; best = at + Math.round(block / 2); }
  }
  return best;
}

export function createChunker({ rate = MEETING_SAMPLE_RATE, seconds = MEETING_CHUNK_SECONDS, quiet = MEETING_QUIET_RMS } = {}) {
  let pieces = [];
  let size = 0;
  let consumed = 0;
  let peak = 0;

  const cut = (whole, upTo) => {
    const chunk = whole.subarray(0, upTo);
    const rest = whole.subarray(upTo);
    const at = consumed / rate;
    consumed += upTo;
    pieces = rest.length ? [new Float32Array(rest)] : [];
    size = rest.length;
    return { at, pcm: new Float32Array(chunk), said: rmsOf(chunk) >= quiet };
  };

  return {
    push(piece) {
      if (!piece?.length) return null;
      pieces.push(piece);
      size += piece.length;
      peak = Math.max(peak * 0.8, rmsOf(piece));
      if (size < seconds * rate) return null;
      const whole = join(pieces, size);
      return cut(whole, quietestCut(whole, { rate }));
    },
    flush() {
      if (!size) return null;
      return cut(join(pieces, size), size);
    },
    level: () => Math.min(1, peak * 6),
    heard: () => (consumed + size) / rate
  };
}
