// chladni.js
// クラドニ図形の物理モデルとパーティクルシミュレーション。
//
// 正方形プレートの定在波変位場（正規化座標 x,y ∈ [0,1]）:
//   z(x,y) = f(n·π·x)·f(m·π·y) + f(m·π·x)·f(n·π·y)
// f は楽器の波形関数（初期値: piano）。
// 楽器を変えると f の形が変わり、節線パターン（クラドニ図形）も変化する。

import { WAVE } from './waveforms.js';

export class ChladniField {
  constructor() {
    this.m = 2;
    this.n = 3;
    this._m = 2;
    this._n = 3;
    this._waveFn = WAVE.piano;
  }

  setFromFrequency(freq) {
    const f = Math.max(50, Math.min(2000, freq));
    const t = Math.log2(f / 50) / Math.log2(2000 / 50);
    const base = 1 + t * 9;
    this.m = Math.max(1, Math.round(base));
    this.n = Math.max(1, Math.round(base + 1 + Math.sin(f * 0.013) * 1.5));
  }

  setModes(m, n) {
    this.m = Math.max(1, Math.round(m));
    this.n = Math.max(1, Math.round(n));
  }

  setWaveType(type) {
    this._waveFn = WAVE[type] || WAVE.piano;
  }

  value(x, y) {
    const { _m: m, _n: n, _waveFn: f } = this;
    const PI = Math.PI;
    return (
      f(n * PI * x) * f(m * PI * y) +
      f(m * PI * x) * f(n * PI * y)
    );
  }

  update() {
    const s = 0.08;
    this._m += (this.m - this._m) * s;
    this._n += (this.n - this._n) * s;
  }
}

export class ParticleSystem {
  constructor(count = 12000) {
    this.field     = new ChladniField();
    this.vibration = 0.45;
    this.x         = null;
    this.y         = null;
    this.setCount(count);
  }

  setCount(count) {
    const n  = Math.max(100, Math.round(count));
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const old = this.x ? this.x.length : 0;
    for (let i = 0; i < n; i++) {
      if (i < old) { px[i] = this.x[i]; py[i] = this.y[i]; }
      else          { px[i] = Math.random(); py[i] = Math.random(); }
    }
    this.x     = px;
    this.y     = py;
    this.count = n;
  }

  setVibration(v) {
    this.vibration = Math.max(0, Math.min(1, v));
  }

  step() {
    this.field.update();
    const { x, y, count } = this;
    const field   = this.field;
    const amp     = 0.0009 + this.vibration * 0.02;
    const minMove = 0.00035;

    for (let i = 0; i < count; i++) {
      const z    = field.value(x[i], y[i]);
      const move = Math.abs(z) * amp + minMove;
      x[i] += (Math.random() - 0.5) * move;
      y[i] += (Math.random() - 0.5) * move;

      if (x[i] < 0)       x[i] = -x[i];
      else if (x[i] > 1)  x[i] = 2 - x[i];
      if (y[i] < 0)       y[i] = -y[i];
      else if (y[i] > 1)  y[i] = 2 - y[i];
    }
  }
}
