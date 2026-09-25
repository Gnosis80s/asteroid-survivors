// Tiny procedural WebAudio synth for UI feedback. No assets required.
// Lazily initializes the AudioContext on first user gesture.

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._thrust = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && this._thrust && this.ctx) {
      this._thrust.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  }

  // Continuous engine sound: ramps up while thrusting, fades while drifting.
  setThrust(on) {
    if (this.muted) {
      if (this._thrust && this.ctx) this._thrust.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
      return;
    }
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this._thrust) this._thrust = this._createThrust(ctx);
    const now = ctx.currentTime;
    if (on) this._thrust.gain.gain.setTargetAtTime(0.06, now, 0.07);
    else this._thrust.gain.gain.setTargetAtTime(0.0001, now, 0.35);
  }

  _createThrust(ctx) {
    const len = Math.floor(ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.5;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    osc.connect(oscGain).connect(lp);
    noise.connect(lp);
    lp.connect(gain).connect(ctx.destination);
    osc.start();
    noise.start();
    return { gain };
  }

  _tone(freq, dur, type = 'square', vol = 0.04, slideTo = null, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  _noise(dur, vol = 0.06, delay = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  shoot() { this._tone(620, 0.06, 'square', 0.025, 220); }
  laser() { this._tone(180, 0.18, 'sawtooth', 0.035, 90); }
  missile() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const dur = 0.18;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(500, t0);
    bp.frequency.exponentialRampToValueAtTime(2600, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(gain).connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + dur);
  }
  mineArm() { this._tone(1200, 0.04, 'square', 0.02); }
  blaster() { this._tone(160, 0.12, 'sawtooth', 0.045, 70); this._noise(0.08, 0.025); }
  railgun() { this._tone(1500, 0.07, 'square', 0.035, 180); this._noise(0.06, 0.035); }
  mineDeploy() { this._tone(200, 0.1, 'triangle', 0.03, 90); }
  zap() { this._noise(0.09, 0.04); this._tone(900, 0.06, 'sawtooth', 0.03, 300); }
  chestOpen() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.16, 'square', 0.035, null, i * 0.08));
    this._tone(1568, 0.5, 'triangle', 0.035, null, 5 * 0.08);
  }
  bigGem() {
    [880, 1174, 1568].forEach((f, i) => this._tone(f, 0.09, 'sine', 0.035, null, i * 0.05));
  }
  breakpoint() {
    this._tone(523, 0.08, 'square', 0.04);
    this._tone(784, 0.12, 'square', 0.04, null, 0.07);
    this._tone(1047, 0.16, 'triangle', 0.04, null, 0.14);
  }
  evolution() {
    this._tone(196, 0.4, 'sawtooth', 0.04);
    [392, 523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.15, 'square', 0.04, null, 0.1 + i * 0.08));
    this._tone(1568, 0.6, 'triangle', 0.04, null, 0.5);
  }
  explosion() { this._noise(0.25, 0.09); this._tone(90, 0.2, 'sawtooth', 0.04, 40); }
  hit() { this._tone(200, 0.09, 'square', 0.05, 90); }
  playerHit() { this._noise(0.2, 0.08); this._tone(140, 0.15, 'sawtooth', 0.05, 60); }
  pickup() { this._tone(880, 0.05, 'sine', 0.025, 1320); }
  levelup() {
    this._tone(150, 0.32, 'sawtooth', 0.035, 1100);
    [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.12, 'square', 0.032, null, 0.08 + i * 0.055));
    this._tone(1568, 0.3, 'sine', 0.04, null, 0.45);
  }
  select() { this._tone(440, 0.06, 'square', 0.03, 660); }
  bossWarning() { [220, 165, 220].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.05, null, i * 0.32)); }
  gameover() { [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.2, 'triangle', 0.05, null, i * 0.16)); }
  victory() { [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone(f, 0.14, 'square', 0.04, null, i * 0.1)); }
}
