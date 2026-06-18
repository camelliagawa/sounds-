// renderer.js
// パーティクルを Canvas に描画する。砂粒風の見た目に残像（トレイル）を加える。

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = 0;
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

  draw(particles) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // 残像：半透明の黒で薄く覆う
    ctx.fillStyle = 'rgba(6, 6, 12, 0.22)';
    ctx.fillRect(0, 0, W, H);

    const { x, y, count } = particles;
    const r = Math.max(0.6, this.dpr * 0.7);

    ctx.fillStyle = 'rgba(235, 238, 250, 0.9)';
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const px = x[i] * W;
      const py = y[i] * H;
      ctx.moveTo(px, py);
      ctx.arc(px, py, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
