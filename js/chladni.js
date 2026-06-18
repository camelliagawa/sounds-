// chladni.js
// クラドニ図形の物理モデルとパーティクルシミュレーション。
//
// 正方形プレートの定在波変位場（正規化座標 x,y ∈ [0,1]）:
//   z(x,y) = sin(n·π·x)·sin(m·π·y) + sin(m·π·x)·sin(n·π·y)
// 砂粒は変位の大きい（よく揺れる）場所から弾かれ、
// |z| ≈ 0 の節線（ノード）へ集まっていく。

export class ChladniField {
  constructor() {
    this.m = 2;
    this.n = 3;
    // 表示用にスムージングした実数モード（連続的に遷移させる）
    this._m = 2;
    this._n = 3;
  }

  /**
   * 周波数(Hz)からモード数 m, n を決める。
   * 物理的な厳密対応ではなく、低音=単純／高音=複雑になるよう写像する。
   */
  setFromFrequency(freq) {
    const f = Math.max(50, Math.min(2000, freq));
    // 50–2000Hz を おおよそ 1–11 のモードに対数マッピング
    const t = Math.log2(f / 50) / Math.log2(2000 / 50); // 0..1
    const base = 1 + t * 9; // 1..10
    this.m = Math.max(1, Math.round(base));
    this.n = Math.max(1, Math.round(base + 1 + Math.sin(f * 0.013) * 1.5));
  }

  /** m, n を直接指定 */
  setModes(m, n) {
    this.m = Math.max(1, Math.round(m));
    this.n = Math.max(1, Math.round(n));
  }

  /** 変位場 z(x,y) （x,y は 0..1） */
  value(x, y) {
    const { _m: m, _n: n } = this;
    const PI = Math.PI;
    return (
      Math.sin(n * PI * x) * Math.sin(m * PI * y) +
      Math.sin(m * PI * x) * Math.sin(n * PI * y)
    );
  }

  /** 毎フレーム、実数モードを目標値へなめらかに近づける */
  update() {
    const s = 0.08;
    this._m += (this.m - this._m) * s;
    this._n += (this.n - this._n) * s;
  }
}

export class ParticleSystem {
  constructor(count = 12000) {
    this.field = new ChladniField();
    this.vibration = 0.45; // 0..1 揺れの強さ
    this.x = null;
    this.y = null;
    this.setCount(count);
  }

  setCount(count) {
    const n = Math.max(100, Math.round(count));
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    // 既存粒子はできるだけ引き継ぎ、増えた分だけランダム配置
    const old = this.x ? this.x.length : 0;
    for (let i = 0; i < n; i++) {
      if (i < old) {
        px[i] = this.x[i];
        py[i] = this.y[i];
      } else {
        px[i] = Math.random();
        py[i] = Math.random();
      }
    }
    this.x = px;
    this.y = py;
    this.count = n;
  }

  setVibration(v) {
    this.vibration = Math.max(0, Math.min(1, v));
  }

  /**
   * 1ステップ進める。
   * 各粒子は |z| に比例したランダムウォークで動き、
   * 揺れの小さい節線で自然に停滞する（= 線が浮かび上がる）。
   */
  step() {
    this.field.update();
    const { x, y, count } = this;
    const field = this.field;
    // 揺れの強さ。最低限の拡散を入れて完全停止を防ぐ
    const amp = 0.0009 + this.vibration * 0.02;
    const minMove = 0.00035;

    for (let i = 0; i < count; i++) {
      const z = field.value(x[i], y[i]);
      const move = Math.abs(z) * amp + minMove;
      x[i] += (Math.random() - 0.5) * move;
      y[i] += (Math.random() - 0.5) * move;

      // 壁での反射
      if (x[i] < 0) x[i] = -x[i];
      else if (x[i] > 1) x[i] = 2 - x[i];
      if (y[i] < 0) y[i] = -y[i];
      else if (y[i] > 1) y[i] = 2 - y[i];
    }
  }
}
