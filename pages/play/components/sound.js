import {isServer} from 'lit';

// Procedural sound for Backlog. Everything is synthesized with Web Audio,
// no audio files. Created lazily on the first user gesture (browser policy).

export class BacklogSound {
  ctx = null;
  master = null;
  noiseBuf = null;
  muted = false;

  start() {
    if (this.ctx || isServer) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    this._ambient();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  _ambient() {
    const c = this.ctx;
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const g = c.createGain();
    g.gain.value = 0.22;
    n.connect(lp).connect(g).connect(this.master);
    n.start();

    // low server-room hum with a slow swell
    const hum = c.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 55;
    const hg = c.createGain();
    hg.gain.value = 0.035;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = c.createGain();
    lg.gain.value = 0.02;
    lfo.connect(lg).connect(hg.gain);
    hum.connect(hg).connect(this.master);
    hum.start();
    lfo.start();
  }

  _noise(dur, type, freq, gain, q = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  _tone(type, f0, f1, dur, gain) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  step() {
    this._noise(0.06, 'bandpass', 700 + Math.random() * 300, 0.5, 2);
  }
  jump() {
    this._noise(0.12, 'bandpass', 1200, 0.35, 1);
  }
  land() {
    this._noise(0.14, 'lowpass', 400, 0.9);
  }
  push() {
    this._noise(0.18, 'lowpass', 220, 0.5);
  }
  lever() {
    this._tone('square', 180, 90, 0.12, 0.08);
    this._noise(0.1, 'highpass', 2500, 0.3);
  }
  gate() {
    this._noise(1.2, 'lowpass', 140, 1.2);
    this._tone('sawtooth', 48, 40, 1.2, 0.05);
  }
  slam() {
    this._noise(0.35, 'lowpass', 300, 1.6);
    this._tone('sine', 90, 35, 0.35, 0.35);
  }
  tick() {
    this._tone('square', 2400, 2300, 0.025, 0.05);
  }
  death() {
    this._tone('sine', 140, 30, 0.9, 0.4);
    this._noise(0.6, 'lowpass', 600, 1.2);
  }
  checkpoint() {
    this._tone('sine', 660, 650, 0.5, 0.04);
  }
  win() {
    [261.6, 329.6, 392, 523.3].forEach((f, i) =>
      setTimeout(() => this._tone('sine', f, f, 2.2, 0.08), i * 180)
    );
  }
}
