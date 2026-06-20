// renderer.js
// パーティクルを Canvas に描画する。
// 縦軸・横軸には、楽器波形（実測倍音スペクトル）と
// 参照用サイン波（薄く重ねて表示）を描く。

import { WAVE, sinWave } from './waveforms.js';

// 楽器ごとの縦軸カラー
const AXIS_COLOR = {
  sine:   'rgba(226, 232, 240, 0.92)', // white（単振動）
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
    this.waveType = 'piano';
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
    const W   = this.canvas.width;
    const H   = this.canvas.height;

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
    const ctx   = this.ctx;
    const W     = this.canvas.width;
    const H     = this.canvas.height;
    const PI    = Math.PI;
    const m     = field._m;
    const n     = field._n;
    const wave  = WAVE[this.waveType] || WAVE.piano;
    const color = AXIS_COLOR[this.waveType] || AXIS_COLOR.piano;

    // ガター背景
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, p.gl, H);
    ctx.fillRect(p.gl, p.h, W - p.gl, p.gb);

    const cxLeft   = p.gl * 0.5;
    const cyBottom = p.h + p.gb * 0.5;

    // ゼロ中心線（破線）
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

    const stepsY = Math.max(120, Math.round(p.h / 1.5));
    const stepsX = Math.max(120, Math.round(p.w / 1.5));
    const ampX   = p.gl * 0.36;
    const ampY   = p.gb * 0.36;

    ctx.lineJoin = 'round';

    // ── 1. サイン波参照線（薄い白、細線） ──────────────────────
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth   = Math.max(1, this.dpr * 0.8);

    // 縦（サイン）
    ctx.beginPath();
    for (let i = 0; i <= stepsY; i++) {
      const t  = i / stepsY;
      const py = p.y + t * p.h;
      const px = cxLeft + sinWave(n * PI * t) * ampX;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 横（サイン）
    ctx.beginPath();
    for (let i = 0; i <= stepsX; i++) {
      const t  = i / stepsX;
      const px = p.x + t * p.w;
      const py = cyBottom - sinWave(m * PI * t) * ampY;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // ── 2. 楽器波形（実測倍音スペクトル、太め・鮮やか） ────────
    ctx.lineWidth = Math.max(1.8, this.dpr * 1.2);

    // 縦（楽器波形）
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= stepsY; i++) {
      const t  = i / stepsY;
      const py = p.y + t * p.h;
      const px = cxLeft + wave(n * PI * t) * ampX;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 横（楽器波形）
    ctx.strokeStyle = 'rgba(235, 238, 250, 0.92)';
    ctx.beginPath();
    for (let i = 0; i <= stepsX; i++) {
      const t  = i / stepsX;
      const px = p.x + t * p.w;
      const py = cyBottom - wave(m * PI * t) * ampY;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
