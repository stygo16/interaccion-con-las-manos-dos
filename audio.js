// AudioEngine — low-latency piano synthesis with the Web Audio API.
//
// Each pressed finger gets one polyphonic voice: a stack of sine partials
// through a short-attack envelope (click-free) and an independent release
// gain whose current value is always known, so note-off ramps are seamless.
// A compressor on the master bus keeps chords from clipping.

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.compressor = null;
    this.master = null;
    this.volume = 75; // 0..100, applied once the context exists
    this.voices = new Map(); // fingerId -> { release, oscs }
  }

  // Human-friendly volume curve: perceived loudness scales roughly linearly
  // with the slider position while keeping headroom for chords.
  level() {
    return Math.pow(this.volume / 100, 2) * 0.8;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, v));
    if (this.master) this.master.gain.value = this.level();
  }

  // Must be called from a user gesture (browser autoplay policy).
  async start() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctor({ latencyHint: 'interactive' });

    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -12;
    this.compressor.knee.value = 20;
    this.compressor.ratio.value = 8;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.15;
    this.compressor.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = this.level();
    this.master.connect(this.ctx.destination);
    this.compressor.connect(this.master);

    await this.ctx.resume();
  }

  freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  noteOn(fingerId, midi) {
    if (!this.ctx || this.voices.has(fingerId)) return;
    const now = this.ctx.currentTime;
    const base = this.freq(midi);

    // Envelope: fast attack (no click), then decay to a soft sustain level.
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(1, now + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.4, now + 0.1);

    // Release stage: stays at 1 while held, ramps down on noteOff.
    const release = this.ctx.createGain();
    release.gain.value = 1;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.min(base * 9, 12000);
    filter.Q.value = 0.4;

    envelope.connect(release);
    release.connect(filter);
    filter.connect(this.compressor);

    // Harmonic stack for a brighter, bell-like piano timbre: fundamental,
    // octave, fifth, double octave and a slightly detuned top partial.
    const partials = [
      { mult: 1, gain: 1 },
      { mult: 2, gain: 0.4 },
      { mult: 3, gain: 0.18 },
      { mult: 4, gain: 0.09 },
      { mult: 5.01, gain: 0.05 },
    ];
    const oscs = partials.map((p) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * p.mult;
      const g = this.ctx.createGain();
      g.gain.value = p.gain;
      osc.connect(g);
      g.connect(envelope);
      osc.start(now);
      return osc;
    });

    this.voices.set(fingerId, { midi, release, oscs });
  }

  noteOff(fingerId) {
    const voice = this.voices.get(fingerId);
    if (!voice) return;
    const now = this.ctx.currentTime;
    voice.release.gain.setValueAtTime(1, now);
    voice.release.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    for (const osc of voice.oscs) osc.stop(now + 0.25);
    this.voices.delete(fingerId);
  }
}
