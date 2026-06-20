// renderer.js
// パーティクルを Canvas に描画する。砂粒風の見た目に残像（トレイル）を加える。
// 縦軸・横軸には、楽器の波形形状（フーリエ近似）を使って定在波を表示する。

// 楽器別の倍音スペクトル（実測に近い相対振幅）。
// HARMONICS[楽器] = [第1倍音(基音), 第2倍音, 第3倍音, ...] の振幅。
// 理想的な幾何波形ではなく、実際の楽器の倍音構成をフーリエ合成して
// 軸に描くことで、その音色固有の波形を可視化する。
const HARMONICS = {
  // フルート：基音がほぼ支配的で倍音は弱い（純音に近い）
  flute:  [1.00, 0.22, 0.10, 0.05, 0.03, 0.02],

  // ピアノ：全倍音を含む豊かなスペクトル（偶数倍音も存在）。
  // 三角波（奇数倍音のみ）とは異なり、第2・第3倍音が強い。
  piano:  [1.00, 0.45, 0.32, 0.40, 0.18, 0.14, 0.10, 0.07, 0.05, 0.03],

  // バイオリン：弓による弦の運動（ヘルムホルツ運動）でほぼ鋸歯波。
  // 胴の共鳴で中域倍音が持ち上がる。
  violin: [1.00, 0.55, 0.58, 0.40, 0.33, 0.26, 0.20, 0.15, 0.11, 0.08],

  // チェロ：バイオリンより低音で、低次倍音がさらに豊か。
  cello:  [1.00, 0.72, 0.55, 0.48, 0.40, 0.32, 0.26, 0.20, 0.15, 0.11, 0.08],
};

// 倍音振幅の配列から、ピーク振幅で正規化した波形関数を作る。
// phase は mode * PI * t。倍音 k は (k+1)*phase で振動する。
function makeWave(harmonics) {
  // 1周期をサンプリングしてピーク値を求め、±1に正規化
  let peak = 0;
  const N = 1024;
  for (let i = 0; i < N; i++) {
    const ph = (i / N) * 2 * Math.PI;
    let v = 0;
    for (let k = 0; k < harmonics.length; k++) v += harmonics[k] * Math.sin((k + 1) * ph);
    peak = Math.max(peak, Math.abs(v));
  }
  const norm = peak > 0 ? 1 / peak : 1;
  return (phase) => {
    let v = 0;
    for (let k = 0; k < harmonics.length; k++) v += harmonics[k] * Math.sin((k + 1) * phase);
    return v * norm;
  };
}

const WAVE = {
  flute:  makeWave(HARMONICS.flute),
  piano:  makeWave(HARMONICS.piano),
  violin: makeWave(HARMONICS.violin),
  cello:  makeWave(HARMONICS.cello),
};

// 楽器ごとの縦軸（緑系）カラー
const AXIS_COLOR = {
  flute:  'rgba(52,  211, 165, 0.92)', // teal
  piano:  'rgba(147, 197, 253, 0.92)', // blue
  violin: 'rgba(251, 191, 36,  0.92)', // amber
  cello:  'rgba(248, 113, 113, 0.92)', // rose
};

export class Renderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d', { alpha: false });
    this.dpr      = Math.min(window.devicePixelRatio || 1, 2);
    this.size     = 0;
    this.showAxes = true;
    this.waveType = 'piano'; // 初期楽器
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const side = Math.max(1, Math.min(rect.width, rect.height));
    this.size = side;
    this.canvas.width  = Math.round(side * this.dpr);
    this.canvas.height = Math.round(side * this.dpr);
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setShowAxes(v) {
    this.showAxes = !!v;
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setWaveType(type) {
    this.waveType = type;
  }

  _plotRect() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!this.showAxes) return { x: 0, y: 0, w: W, h: H, gl: 0, gb: 0 };
    const gl = Math.round(W * 0.13);
    const gb = Math.round(H * 0.13);
    return { x: gl, y: 0, w: W - gl, h: H - gb, gl, gb };
  }

  draw(particles) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.fillStyle = 'rgba(6, 6, 12, 0.22)';
    ctx.fillRect(0, 0, W, H);

    const p = this._plotRect();
    const { x, y, count } = particles;
    const r = Math.max(0.6, this.dpr * 0.7);

    ctx.fillStyle = 'rgba(235, 238, 250, 0.9)';
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const px = p.x + x[i] * p.w;
      const py = p.y + y[i] * p.h;
      ctx.moveTo(px, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
    ctx.fill();

    if (this.showAxes) this._drawAxes(particles.field, p);
  }

  _drawAxes(field, p) {
    const ctx  = this.ctx;
    const W    = this.canvas.width;
    const H    = this.canvas.height;
    const PI   = Math.PI;
    const m    = field._m;
    const n    = field._n;
    const wave = WAVE[this.waveType] || WAVE.flute;
    const color = AXIS_COLOR[this.waveType] || AXIS_COLOR.flute;

    // ガター背景
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, p.gl, H);
    ctx.fillRect(p.gl, p.h, W - p.gl, p.gb);

    // ゼロ中心線（破線）
    const cxLeft   = p.gl * 0.5;
    const cyBottom = p.h + p.gb * 0.5;
    ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cxLeft, 0);      ctx.lineTo(cxLeft, p.h);
    ctx.moveTo(p.gl, cyBottom); ctx.lineTo(W, cyBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // 軸枠線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.beginPath();
    ctx.moveTo(p.gl, 0);   ctx.lineTo(p.gl, p.h);
    ctx.moveTo(p.gl, p.h); ctx.lineTo(W, p.h);
    ctx.stroke();

    ctx.lineWidth = Math.max(1.4, this.dpr * 1.1);
    ctx.lineJoin  = 'round';

    // 縦波（左ガター）：楽器波形 × n モード
    const ampX  = p.gl * 0.36;
    const stepsY = Math.max(120, Math.round(p.h / 1.5));
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= stepsY; i++) {
      const t  = i / stepsY;
      const py = p.y + t * p.h;
      const v  = wave(n * PI * t);
      const px = cxLeft + v * ampX;
      if (i === 0) ctx.moveTo(px, py);
      else          ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 横波（下ガター）：楽器波形 × m モード
    const ampY  = p.gb * 0.36;
    const stepsX = Math.max(120, Math.round(p.w / 1.5));
    ctx.strokeStyle = 'rgba(235, 238, 250, 0.92)';
    ctx.beginPath();
    for (let i = 0; i <= stepsX; i++) {
      const t  = i / stepsX;
      const px = p.x + t * p.w;
      const v  = wave(m * PI * t);
      const py = cyBottom - v * ampY;
      if (i === 0) ctx.moveTo(px, py);
      else          ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
