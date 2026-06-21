// renderer.js

export class Renderer {
  constructor(canvas) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d', { alpha: false });
    this.dpr      = Math.min(window.devicePixelRatio || 1, 2);
    this.size     = 0;
    this.plateShape = 'square'; // 'square' | 'circle'
    this.drawMode   = 'lines'; // 'particles' | 'lines'
    this._nodalImgData = null; // 節線の ImgData キャッシュ
    this._nodalKey     = '';   // キャッシュの有効性確認用キー
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setShape(shape) {
    this.plateShape = shape === 'circle' ? 'circle' : 'square';
    this._nodalImgData = null;
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  setDrawMode(mode) {
    this.drawMode = mode === 'lines' ? 'lines' : 'particles';
    this._nodalImgData = null;
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const side = Math.max(1, Math.min(rect.width, rect.height));
    this.size = side;
    this.canvas.width  = Math.round(side * this.dpr);
    this.canvas.height = Math.round(side * this.dpr);
    this._nodalImgData = null;
    this.ctx.fillStyle = '#06060c';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _plotRect() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    return { x: 0, y: 0, w: W, h: H, gl: 0, gb: 0 };
  }

  draw(particles) {
    if (this.drawMode === 'lines') {
      this._drawNodalLines(particles.field);
      return;
    }

    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const circle = this.plateShape === 'circle';

    ctx.fillStyle = 'rgba(6, 6, 12, 0.22)';
    ctx.fillRect(0, 0, W, H);

    const p = this._plotRect();
    const { x, y, count } = particles;
    const r = Math.max(0.6, this.dpr * 0.7);

    // 円形は盤面（内接円）でクリップして砂を描く
    if (circle) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - this.dpr, 0, Math.PI * 2);
      ctx.clip();
    }

    ctx.fillStyle = 'rgba(235, 238, 250, 0.9)';
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const px = p.x + x[i] * p.w;
      const py = p.y + y[i] * p.h;
      ctx.moveTo(px, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
    ctx.fill();

    if (circle) {
      ctx.restore();
      this._drawPlateRim();
    }
  }

  // ── 節線描画（ImgData キャッシュ方式）────────────────────────────
  // 変位場 z(x,y) ≈ 0 の等値線をピクセル単位で描く。
  // モードが変わらない限りキャッシュを再利用する。
  _drawNodalLines(field) {
    const W = this.canvas.width, H = this.canvas.height;
    const p = this._plotRect();
    const isCircle = field.shape === 'circle';

    const key = `${W}x${H}|${field.shape}|${field._p}|${field._q}|${field._cn}|${field._ck?.toFixed(3)}`;

    if (this._nodalKey !== key || !this._nodalImgData) {
      const imgData = this.ctx.createImageData(W, H);
      const d = imgData.data;

      // 背景色で全面を初期化（#06060c）
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 6; d[i + 1] = 6; d[i + 2] = 12; d[i + 3] = 255;
      }

      // 閾値を最大 |z| の 7% に設定（線の太さを適度に保つ）
      let maxZ = 0;
      const S = 50;
      for (let i = 0; i <= S; i++) {
        for (let j = 0; j <= S; j++) {
          const v = Math.abs(field.value(i / S, j / S));
          if (v > maxZ) maxZ = v;
        }
      }
      const thr = Math.max(0.04, maxZ * 0.07);

      for (let row = 0; row < H; row++) {
        const fy = p.h > 0 ? row / p.h : 0;
        if (fy < 0 || fy > 1) continue;
        for (let col = 0; col < W; col++) {
          const fx = p.w > 0 ? (col - p.x) / p.w : 0;
          if (fx < 0 || fx > 1) continue;
          if (isCircle) {
            const dx = fx - 0.5, dy = fy - 0.5;
            if (dx * dx + dy * dy > 0.25) continue;
          }
          const absZ = Math.abs(field.value(fx, fy));
          if (absZ < thr) {
            const a = 1 - absZ / thr; // 1=節線中心、0=境界
            const idx = (row * W + col) * 4;
            d[idx]     = Math.round(6  + 229 * a);
            d[idx + 1] = Math.round(6  + 232 * a);
            d[idx + 2] = Math.round(12 + 226 * a);
          }
        }
      }

      this._nodalImgData = imgData;
      this._nodalKey = key;
    }

    this.ctx.putImageData(this._nodalImgData, 0, 0);

    if (isCircle) this._drawPlateRim();
  }

  // 円形プレートの縁
  _drawPlateRim() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - this.dpr, 0, Math.PI * 2);
    ctx.stroke();
  }

}
