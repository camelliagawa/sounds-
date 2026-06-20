// renderer.js
// パーティクルを Canvas に描画する。砂粒風の見た目に残像（トレイル）を加える。
// 縦軸・横軸には、図形を生成している定在波（サイン波）を表示する。

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = 0;
    this.showAxes = true; // 縦軸・横軸の波形表示
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const side = Math.max(1, Math.min(rect.width, rect.height));
    this.size = side;
    this.canvas.width = Math.round(side * this.dpr);
    this.canvas.height = Math.round(side * this.dpr);
    // いったん黒で塗る
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 波形表示のオン/オフ。切替時は全面クリアして残像を消す */
  setShowAxes(v) {
    this.showAxes = !!v;
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** パーティクルを描く領域（軸表示時は左・下にガターを空ける） */
  _plotRect() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (!this.showAxes) return { x: 0, y: 0, w: W, h: H, gl: 0, gb: 0 };
    const gl = Math.round(W * 0.13); // 左ガター（縦波用）
    const gb = Math.round(H * 0.13); // 下ガター（横波用）
    return { x: gl, y: 0, w: W - gl, h: H - gb, gl, gb };
  }

  draw(particles) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // 残像：半透明の黒で薄く覆う
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

  /** 縦軸（左）・横軸（下）に定在波の波形を描く */
  _drawAxes(field, p) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const PI = Math.PI;
    // なめらかに補間された実数モードを使う
    const m = field._m;
    const n = field._n;

    // ガターを毎フレーム塗り直して波形をくっきり保つ
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, p.gl, H);             // 左ガター（全高）
    ctx.fillRect(p.gl, p.h, W - p.gl, p.gb); // 下ガター

    // 中心（ゼロ）線：破線で薄く
    ctx.setLineDash([4 * this.dpr, 4 * this.dpr]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    const cxLeft = p.gl * 0.5;       // 左ガターの中心x
    const cyBottom = p.h + p.gb * 0.5; // 下ガターの中心y
    ctx.beginPath();
    ctx.moveTo(cxLeft, 0);   ctx.lineTo(cxLeft, p.h);
    ctx.moveTo(p.gl, cyBottom); ctx.lineTo(W, cyBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // 軸の枠線
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.beginPath();
    ctx.moveTo(p.gl, 0);   ctx.lineTo(p.gl, p.h); // 縦軸
    ctx.moveTo(p.gl, p.h); ctx.lineTo(W, p.h);     // 横軸
    ctx.stroke();

    // --- 縦波（左ガター）：sin(n·π·y) ---
    const ampX = p.gl * 0.36;
    ctx.strokeStyle = 'rgba(52, 211, 165, 0.92)'; // 緑
    ctx.lineWidth = Math.max(1.4, this.dpr * 1.1);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const stepsY = Math.max(96, Math.round(p.h / 2));
    for (let i = 0; i <= stepsY; i++) {
      const t = i / stepsY;
      const py = p.y + t * p.h;
      const v = Math.sin(n * PI * t);
      const px = cxLeft + v * ampX;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // --- 横波（下ガター）：sin(m·π·x) ---
    const ampY = p.gb * 0.36;
    ctx.strokeStyle = 'rgba(235, 238, 250, 0.92)'; // 白
    ctx.beginPath();
    const stepsX = Math.max(96, Math.round(p.w / 2));
    for (let i = 0; i <= stepsX; i++) {
      const t = i / stepsX;
      const px = p.x + t * p.w;
      const v = Math.sin(m * PI * t);
      const py = cyBottom - v * ampY;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
