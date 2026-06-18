// sampler.js — Tone.js サンプル音源
// Reverb は非同期初期化が必要なため JCReverb (同期) に変更。

const NOTE_FREQ = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392.0,  A4: 440.0,  B4: 493.88, C5: 523.25,
};

export const NOTES = Object.keys(NOTE_FREQ);
export function noteToFreq(note) { return NOTE_FREQ[note]; }

export class SampleInstrument {
  constructor() {
    this.current = 'piano';
    this.synth = null;
    this._started = false;
  }

  async _ensureCtx() {
    if (!this._started) {
      await Tone.start();
      this._started = true;
    }
    if (Tone.context.state !== 'running') {
      await Tone.context.resume();
    }
  }

  _build(type) {
    if (this.synth) {
      try { this.synth.dispose(); } catch {}
      this.synth = null;
    }

    // JCReverb は同期で使えるリバーブ
    const reverb = new Tone.JCReverb(0.25).toDestination();
    const vol = new Tone.Volume(-3).connect(reverb);

    let synth;
    switch (type) {
      case 'violin':
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.18, decay: 0.1, sustain: 0.85, release: 0.8 },
        });
        break;
      case 'flute':
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.1, decay: 0.05, sustain: 0.9, release: 0.5 },
        });
        break;
      case 'cello':
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
          envelope: { attack: 0.3, decay: 0.15, sustain: 0.8, release: 1.0 },
        });
        break;
      case 'piano':
      default:
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 1.5 },
        });
        break;
    }

    synth.connect(vol);
    this.synth = synth;
    this.current = type;
  }

  async setInstrument(type) {
    await this._ensureCtx();
    this._build(type);
  }

  async play(note) {
    await this._ensureCtx();
    if (!this.synth) this._build(this.current);
    this.synth.triggerAttackRelease(note, '8n');
    return NOTE_FREQ[note];
  }
}
