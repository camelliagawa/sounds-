// sampler.js
// Tone.js を使ったサンプル音源。ピアノ・バイオリン・フルート・チェロを
// シンセで近似し、鳴っている音の基本周波数を取り出せるようにする。

const NOTE_FREQ = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23,
  G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25,
};

export const NOTES = Object.keys(NOTE_FREQ);
export function noteToFreq(note) { return NOTE_FREQ[note]; }

export class SampleInstrument {
  constructor() {
    this.current = 'piano';
    this.synth = null;
    this._ready = false;
  }

  async ensureStarted() {
    if (!this._ready) {
      await Tone.start();
      this._ready = true;
    }
  }

  _build(type) {
    if (this.synth) {
      this.synth.dispose();
      this.synth = null;
    }
    let synth;
    switch (type) {
      case 'violin':
        // 弦：ノコギリ波＋ゆっくりした立ち上がり＋ビブラート
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.18, decay: 0.1, sustain: 0.9, release: 0.6 },
        });
        break;
      case 'flute':
        // 笛：ほぼ正弦波・柔らかい立ち上がり
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sine' },
          envelope: { attack: 0.08, decay: 0.1, sustain: 0.8, release: 0.4 },
        });
        break;
      case 'cello':
        // チェロ：低めの三角＋ノコギリ
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fatsawtooth', count: 3, spread: 20 },
          envelope: { attack: 0.25, decay: 0.2, sustain: 0.85, release: 0.8 },
        });
        break;
      case 'piano':
      default:
        // ピアノ：打鍵的なエンベロープ
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.005, decay: 0.4, sustain: 0.25, release: 1.2 },
        });
        break;
    }
    const reverb = new Tone.Reverb({ decay: 1.6, wet: 0.18 }).toDestination();
    synth.connect(reverb);
    this.synth = synth;
    this.current = type;
  }

  async setInstrument(type) {
    await this.ensureStarted();
    this._build(type);
  }

  async play(note) {
    await this.ensureStarted();
    if (!this.synth) this._build(this.current);
    this.synth.triggerAttackRelease(note, '8n');
    return NOTE_FREQ[note];
  }
}
