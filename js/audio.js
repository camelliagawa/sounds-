// audio.js
// マイク入力・タブ音声キャプチャを Web Audio API で扱い、
// リアルタイムに支配的な周波数（ピッチ）を検出する。

export class AudioInput {
  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.buf = null;       // 時間領域バッファ（自己相関用）
    this.mode = null;      // 'mic' | 'tab' | null
    this.onLevel = null;   // (rms) => void  音量コールバック（任意）
  }

  _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      this.buf = new Float32Array(this.analyser.fftSize);
    }
  }

  async startMic() {
    await this.stop();
    this._ensureCtx();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    this._connect(this.stream);
    this.mode = 'mic';
  }

  /** PC: タブ／画面の音声をキャプチャ（getDisplayMedia） */
  async startTab() {
    await this.stop();
    this._ensureCtx();
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: true, // 多くのブラウザは video:true でないと audio を許可しない
      audio: true,
    });
    const audioTracks = this.stream.getAudioTracks();
    if (audioTracks.length === 0) {
      await this.stop();
      throw new Error('NO_TAB_AUDIO');
    }
    // 映像トラックは不要なので止める（音声だけ使う）
    this.stream.getVideoTracks().forEach((t) => t.stop());
    this._connect(this.stream);
    this.mode = 'tab';
    // ユーザーが共有停止したときの後始末
    audioTracks[0].addEventListener('ended', () => this.stop());
  }

  _connect(stream) {
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
  }

  async stop() {
    if (this.source) {
      try { this.source.disconnect(); } catch {}
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.mode = null;
  }

  /**
   * 現在の支配的周波数(Hz)を返す。検出できなければ null。
   * 自己相関でピッチを推定（FFTピーク法より低音に強い）。
   */
  detectPitch() {
    if (!this.analyser) return null;
    const buf = this.buf;
    this.analyser.getFloatTimeDomainData(buf);

    // RMS（音量）— 静かすぎるときは検出しない
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    if (this.onLevel) this.onLevel(rms);
    if (rms < 0.008) return null;

    // 自己相関
    const SIZE = buf.length;
    let bestOffset = -1;
    let bestCorr = 0;
    let lastCorr = 1;
    let foundGoodCorrelation = false;
    const MIN_OFFSET = 4;   // ~12kHz 上限
    const MAX_OFFSET = 1000; // ~48Hz 下限

    for (let offset = MIN_OFFSET; offset < MAX_OFFSET; offset++) {
      let corr = 0;
      for (let i = 0; i < SIZE - offset; i++) {
        corr += buf[i] * buf[i + offset];
      }
      corr /= SIZE - offset;

      if (corr > 0.9 && corr > lastCorr) {
        foundGoodCorrelation = true;
        if (corr > bestCorr) {
          bestCorr = corr;
          bestOffset = offset;
        }
      } else if (foundGoodCorrelation) {
        break;
      }
      lastCorr = corr;
    }

    if (bestOffset === -1 || bestCorr < 0.01) return null;
    const freq = this.ctx.sampleRate / bestOffset;
    if (freq < 40 || freq > 4000) return null;
    return freq;
  }
}

/** getDisplayMedia（タブ音声）に対応しているか */
export function supportsTabAudio() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}
