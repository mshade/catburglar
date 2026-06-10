// src/audio.js
// All SFX synthesized with WebAudio — no asset files.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Must be called from a user gesture (autoplay policy).
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // gain -> stereo pan -> master
  out(vol, pan) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.master);
    return g;
  }

  meow(vol = 1, pan = 0) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.42);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.6, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(filter).connect(env).connect(this.out(vol, pan));
    osc.start(t);
    osc.stop(t + 0.5);
  }

  hiss(vol = 1, pan = 0) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const t = this.ctx.currentTime;
    const len = 0.4;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4500;
    filter.Q.value = 0.7;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(env).connect(this.out(vol, pan));
    src.start(t);
  }

  gotcha() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => { // C5 E5 G5
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const env = this.ctx.createGain();
      const start = t + i * 0.09;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(env).connect(this.out(1, 0));
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }
}
