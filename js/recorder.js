// recorder.js
// canvas.captureStream() を MediaRecorder で録画し、.webm として保存する。

export class CanvasRecorder {
  constructor(canvas) {
    this.canvas = canvas;
    this.recorder = null;
    this.chunks = [];
    this.recording = false;
  }

  static isSupported() {
    return typeof MediaRecorder !== 'undefined' &&
      !!HTMLCanvasElement.prototype.captureStream;
  }

  start(fps = 30) {
    if (this.recording) return;
    const stream = this.canvas.captureStream(fps);
    // 環境ごとに使える MIME を選ぶ
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => this._save();
    this.recorder.start();
    this.recording = true;
  }

  stop() {
    if (this.recorder && this.recording) {
      this.recorder.stop();
      this.recording = false;
    }
  }

  _save() {
    const blob = new Blob(this.chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `chladni-${ts}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** 現在のキャンバスを PNG 画像として保存 */
export function saveSnapshot(canvas) {
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = canvas.toDataURL('image/png');
  a.download = `chladni-${ts}.png`;
  a.click();
}
