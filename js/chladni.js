// chladni.js
// 実際のチャドニ実験を再現する物理モデルとパーティクルシミュレーション。
//
// 板の端は「自由端（free edge）」なので、端で変位が最大（腹）になる。
// このため固定端を意味する sin ではなく cos を使う。
//
//   正方形板:  z(x,y) = cos(pπx)·cos(qπy) − cos(qπx)·cos(pπy)
//   円形板  :  z(r,θ) = J_n(k·r)·cos(nθ)
//
// 入力周波数は、薄板の固有振動数  f ≈ C·λ  （λ = 空間周波数の2乗）
// に最も近い固有モードへスナップする。これにより「455Hz だから機械的に
// m=6,n=7」ではなく、実在の板で 455Hz が励起する実際のモードを選ぶ。

// ---- ベッセル関数 J_n(x) （級数展開） ----
// J_n(x) = Σ_{k≥0} (−1)^k / (k!(k+n)!) · (x/2)^(2k+n)
// 漸化式で各項を更新し、x ≲ 40 まで安定に収束させる。
function besselJ(n, x) {
  const h = x / 2;
  // 第0項: (x/2)^n / n!
  let term = 1;
  for (let k = 1; k <= n; k++) term *= h / k;
  let sum = term;
  const h2 = h * h;
  for (let k = 1; k < 60; k++) {
    term *= -h2 / (k * (k + n));
    sum += term;
    if (Math.abs(term) < 1e-12) break;
  }
  return sum;
}

// J_n の正のゼロ点（節円の半径に対応）を数値走査で求める。
// 自由端の厳密条件は J_n'(k)=0 だが、見た目に分かりやすい同心円を出すため
// 縁も節とする J_n(k)=0 のゼロ点を使う（教育的な可視化として一般的）。
function besselZeros(n, maxX, maxCount) {
  const zeros = [];
  const dx = 0.02;
  let prev = besselJ(n, dx);
  for (let x = dx * 2; x <= maxX; x += dx) {
    const cur = besselJ(n, x);
    if (prev === 0 || (prev < 0) !== (cur < 0)) {
      // 線形補間で根を絞り込む
      const root = x - dx * cur / (cur - prev);
      zeros.push(root);
      if (zeros.length >= maxCount) break;
    }
    prev = cur;
  }
  return zeros;
}

const PI  = Math.PI;
const PI2 = PI * PI;

// 板スケールのプリセット（C 定数）。f ≈ C·λ。
// C が大きいほど同じ周波数で低次モード（線が少ない）。
export const PLATE_PRESETS = {
  xlarge: { label: '特大', C: 36   }, // 線ごく少
  large:  { label: '大',   C: 20   }, // 線少
  medium: { label: '標準', C: 11.5 },
  small:  { label: '小',   C: 6    }, // 線多
  xsmall: { label: '極小', C: 3.5  }, // 線最多
};

export class ChladniField {
  constructor() {
    this.shape = 'square'; // 'square' | 'circle'
    this.C     = PLATE_PRESETS.medium.C;
    this.freq  = 440;

    // 表示用モード番号（HUD・軸波形参照）
    this.m  = 2;
    this.n  = 3;
    this._m = 2;
    this._n = 3;

    // 正方形モード
    this._p = 2;
    this._q = 3;

    // 円形モード
    this._cn = 0;   // 節直径の本数
    this._ck = 2.4; // J_n の引数スケール（節円）

    // 変位場のルックアップテーブル（LUT）。
    // 円形のベッセル関数や cos をモード変更時に一度だけ格子で計算しキャッシュし、
    // 粒子ループでは配列の双線形補間だけにして発熱・負荷を抑える。
    this._lutN = 256;
    this._lut  = null;
    this._mode = null;

    this._buildModes();
    this.setFromFrequency(this.freq);
  }

  // 正方形・円形それぞれの固有モード表を生成し λ（=空間周波数²）で並べる。
  _buildModes() {
    // 正方形: λ = π²(p² + q²)
    const sq = [];
    const PMAX = 11;
    for (let p = 0; p <= PMAX; p++) {
      for (let q = p; q <= PMAX; q++) {
        if (p === 0 && q === 0) continue;
        sq.push({ shape: 'square', p, q, lam: PI2 * (p * p + q * q) });
      }
    }
    sq.sort((a, b) => a.lam - b.lam);
    this._squareModes = sq;

    // 円形: λ = k², k = J_n のゼロ点。n=節直径, s=節円。
    const ci = [];
    const NMAX = 12, SMAX = 7, KMAX = 40;
    for (let n = 0; n <= NMAX; n++) {
      const zeros = besselZeros(n, KMAX, SMAX);
      for (let s = 0; s < zeros.length; s++) {
        const k = zeros[s];
        ci.push({ shape: 'circle', n, s: s + 1, k, lam: k * k });
      }
    }
    ci.sort((a, b) => a.lam - b.lam);
    this._circleModes = ci;
  }

  setShape(shape) {
    this.shape = shape === 'circle' ? 'circle' : 'square';
    this.setFromFrequency(this.freq);
  }

  setPlateC(C) {
    this.C = C;
    this.setFromFrequency(this.freq);
  }

  // 周波数 → 最も近い固有モードへスナップ
  setFromFrequency(freq) {
    this.freq = Math.max(50, Math.min(2000, freq));
    const targetLam = this.freq / this.C;
    const modes = this.shape === 'circle' ? this._circleModes : this._squareModes;

    let best = modes[0];
    let bestD = Infinity;
    for (let i = 0; i < modes.length; i++) {
      const d = Math.abs(modes[i].lam - targetLam);
      if (d < bestD) { bestD = d; best = modes[i]; }
    }
    this._applyMode(best);
  }

  _applyMode(mode) {
    // 同じ固有モードなら場は変わらない。重い再計算（正規化・LUT構築）を省く。
    // 周波数スライダーを細かく動かしても、スナップ先が同じならノーコスト。
    if (mode === this._mode) return;
    this._mode = mode;
    if (mode.shape === 'square') {
      this._p = mode.p;
      this._q = mode.q;
      this.m  = mode.p;
      this.n  = mode.q;
      this._m = mode.p || mode.q; // 軸波形は 0 を避ける
      this._n = mode.q;
    } else {
      this._cn = mode.n;
      this._ck = mode.k;
      this.m   = mode.n; // 節直径
      this.n   = mode.s; // 節円
      this._m  = Math.max(1, mode.n);
      this._n  = Math.max(1, mode.s);
    }
    this._computeScale();
  }

  // モードごとに変位場のピーク |z| を求め、形状によらず振幅を揃える。
  // 円板（ベッセル関数）は値域が小さく、正規化しないと正方形より振動が
  // 弱く見えてしまうため、ここで 1/peak を掛けて正規化する。
  _computeScale() {
    this._scale = 1;
    let mx = 0;
    const S = 48;
    for (let i = 0; i <= S; i++) {
      for (let j = 0; j <= S; j++) {
        const v = Math.abs(this._field(i / S, j / S));
        if (v > mx) mx = v;
      }
    }
    this._scale = mx > 1e-6 ? 1 / mx : 1;
    this._buildLUT();
  }

  // モードごとに value(x,y) を (N+1)×(N+1) 格子で前計算してキャッシュする。
  _buildLUT() {
    const N = this._lutN;
    const w = N + 1;
    if (!this._lut) this._lut = new Float32Array(w * w);
    const lut = this._lut;
    const s   = this._scale;
    for (let j = 0; j <= N; j++) {
      const y = j / N;
      for (let i = 0; i <= N; i++) {
        lut[j * w + i] = this._field(i / N, y) * s;
      }
    }
  }

  // LUT を双線形補間で参照する高速版 value()。粒子シミュレーション用。
  sample(x, y) {
    const lut = this._lut;
    if (!lut) return this.value(x, y);
    const N = this._lutN, w = N + 1;
    if (x < 0) x = 0; else if (x > 1) x = 1;
    if (y < 0) y = 0; else if (y > 1) y = 1;
    const fx = x * N, fy = y * N;
    let i = fx | 0, j = fy | 0;
    if (i >= N) i = N - 1;
    if (j >= N) j = N - 1;
    const tx = fx - i, ty = fy - j;
    const base = j * w + i;
    const a = lut[base],         b = lut[base + 1];
    const c = lut[base + w],     d = lut[base + w + 1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }

  // 周波数スライダー上に描くモード境界の周波数リストを返す。
  // 隣接するモードのλ中点を周波数に変換したもの。
  getTransitionFreqs(minF, maxF) {
    const modes = this.shape === 'circle' ? this._circleModes : this._squareModes;
    const C = this.C;
    const out = [];
    for (let i = 0; i < modes.length - 1; i++) {
      const f = C * (modes[i].lam + modes[i + 1].lam) / 2;
      if (f > minF && f < maxF) out.push(f);
    }
    return out;
  }

  // 正規化前の生の変位場。
  _field(x, y) {
    if (this.shape === 'circle') {
      // 単位正方形 → 中心(0.5,0.5)・半径0.5 の円盤
      const dx = (x - 0.5) * 2;
      const dy = (y - 0.5) * 2;
      const r  = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) return 0;
      const th = Math.atan2(dy, dx);
      return besselJ(this._cn, this._ck * r) * Math.cos(this._cn * th);
    }
    // 正方形・自由端
    const p = this._p, q = this._q;
    // 片側の節数が 0：一方向だけの単純な平行線モード（実物の低次モード）
    if (p === 0) return Math.cos(q * PI * y);
    // 対角モード：単一の積（十字・格子）
    if (p === q) return Math.cos(p * PI * x) * Math.cos(q * PI * y);
    // 縮退ペアの反対称結合：古典的なチャドニ図形（星・網目）
    return (
      Math.cos(p * PI * x) * Math.cos(q * PI * y) -
      Math.cos(q * PI * x) * Math.cos(p * PI * y)
    );
  }

  // 変位場の値（正規化済み）。|z|≈0 の場所（節線）に砂が集まる。
  // 節線描画など 1 回限りの精密計算に使う。粒子ループは sample() を使う。
  value(x, y) {
    return this._field(x, y) * this._scale;
  }
}

export class ParticleSystem {
  constructor(count = 12000) {
    this.field     = new ChladniField();
    this.vibration = 0.45;
    this.x         = null;
    this.y         = null;
    this.energy    = 0; // 直近ステップの平均 |z|（収束検出用）
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
    const { x, y, count } = this;
    const field   = this.field;
    const amp     = 0.0009 + this.vibration * 0.02;
    const minMove = 0.00035;
    const circle  = field.shape === 'circle';
    let sumAbs    = 0;

    for (let i = 0; i < count; i++) {
      const z    = field.sample(x[i], y[i]);
      const az   = z < 0 ? -z : z;
      sumAbs    += az;
      const move = az * amp + minMove;
      x[i] += (Math.random() - 0.5) * move;
      y[i] += (Math.random() - 0.5) * move;

      if (circle) {
        // 単位円盤の外へ出たら中心方向へ反射
        const dx = x[i] - 0.5, dy = y[i] - 0.5;
        const r  = Math.sqrt(dx * dx + dy * dy);
        if (r > 0.5) {
          const over = r - 0.5;
          const inv  = 1 / r;
          x[i] = 0.5 + dx * inv * (0.5 - over);
          y[i] = 0.5 + dy * inv * (0.5 - over);
        }
      } else {
        if (x[i] < 0)       x[i] = -x[i];
        else if (x[i] > 1)  x[i] = 2 - x[i];
        if (y[i] < 0)       y[i] = -y[i];
        else if (y[i] > 1)  y[i] = 2 - y[i];
      }
    }

    this.energy = sumAbs / count;
  }
}
