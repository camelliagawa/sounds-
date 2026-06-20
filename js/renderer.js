// renderer.js
// パーティクルを Canvas に描画する。砂粒風の見た目に残像（トレイル）を加える。
// 縦軸・横軸には、楽器の波形形状（フーリエ近似）を使って定在波を表示する。

// 楽器別の波形関数。引数 phase = mode * PI * t（0〜n·π の範囲）。
// フーリエ級数で各波形を近似し、軸に描くことで音色の倍音構造を視覚化する。
const WAVE = {
  // フルート：純粋なサイン波（基音のみ）
  flute: (p) => Math.sin(p),

  // ピアノ：三角波（奇数倍音が 1/n² で減衰）
  piano: (p) => {
    const k = 8 / (Math.PI * Math.PI);
    return k * (Math.sin(p) - Math.sin(3 * p) / 9 + Math.sin(5 * p) / 25 - Math.sin(7 * p) / 49);
  },

  // バイオリン：鋸歯波（全倍音が 1/n で減衰）
  violin: (p) => {
    const k = 2 / Math.PI;
    return k * (Math.sin(p) - Math.sin(2 * p) / 2 + Math.sin(3 * p) / 3 - Math.sin(4 * p) / 4 + Math.sin(5 * p) / 5);
  },

  // チェロ：太い鋸歯波（さらに高次倍音を含む）
  cello: (p) => {
    const k = 2 / Math.PI;
    return k * (
      Math.sin(p) - Math.sin(2 * p) / 2 + Math.sin(3 * p) / 3
      - Math.sin(4 * p) / 4 + Math.sin(5 * p) / 5 - Math.sin(6 * p) / 6
    );
  },
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
