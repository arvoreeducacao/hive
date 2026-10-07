class DictationTap extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const asked = options?.processorOptions || {};
    this.want = asked.sampleRate || 16000;
    this.step = sampleRate / this.want;
    this.at = 0;
    this.held = [];
    this.holding = 0;
    this.every = Math.round(this.want / 10);
    this.port.onmessage = (note) => { if (note.data === "flush") this.spill(); };
  }

  spill() {
    if (!this.holding) return;
    const out = new Float32Array(this.holding);
    let into = 0;
    for (const piece of this.held) { out.set(piece, into); into += piece.length; }
    this.held = [];
    this.holding = 0;
    this.port.postMessage(out, [out.buffer]);
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    if (this.step === 1) {
      const copy = new Float32Array(channel.length);
      copy.set(channel);
      this.held.push(copy);
      this.holding += copy.length;
    } else {
      const room = Math.ceil((channel.length - this.at) / this.step) + 1;
      const out = new Float32Array(Math.max(room, 0));
      let made = 0;
      for (let at = this.at; at < channel.length; at += this.step) {
        const left = Math.floor(at);
        const slide = at - left;
        const one = channel[left];
        const two = left + 1 < channel.length ? channel[left + 1] : one;
        out[made++] = one + (two - one) * slide;
      }
      this.at = this.at + Math.ceil((channel.length - this.at) / this.step) * this.step - channel.length;
      const kept = out.subarray(0, made);
      const copy = new Float32Array(made);
      copy.set(kept);
      this.held.push(copy);
      this.holding += made;
    }
    if (this.holding >= this.every) this.spill();
    return true;
  }
}

registerProcessor("dictation-tap", DictationTap);
