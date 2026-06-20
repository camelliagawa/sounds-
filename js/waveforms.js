// waveforms.js — 楽器別の倍音スペクトルと波形関数（chladni.js / renderer.js 共有）
//
// パフォーマンス上の注意：
// value(x,y) は粒子数 × フレームレート 回呼ばれるため、
// Math.sin を毎回呼ぶ多倍音合成は重すぎる。
// そこで起動時に LUT（ルックアップテーブル）を生成し、
// O(1) の配列アクセスに落とす。

// 楽器別の倍音相対振幅 [第1倍音（基音）, 第2倍音, ...]
export const HARMONICS = {
  // フルート：基音支配的、倍音は弱い（純音に近い）
  flute:  [1.00, 0.22, 0.10, 0.05, 0.03, 0.02],

  // ピアノ：全倍音（偶数倍音も）を含む豊かなスペクトル
  piano:  [1.00, 0.45, 0.32, 0.40, 0.18, 0.14, 0.10, 0.07, 0.05, 0.03],

  // バイオリン：弓のヘルムホルツ運動≈鋸歯波、胴の共鳴で中域倍音が持ち上がる
  violin: [1.00, 0.55, 0.58, 0.40, 0.33, 0.26, 0.20, 0.15, 0.11, 0.08],

  // チェロ：バイオリンより低音で低次倍音がさらに豊か
  cello:  [1.00, 0.72, 0.55, 0.48, 0.40, 0.32, 0.26, 0.20, 0.15, 0.11, 0.08],
};

const LUT_SIZE  = 4096; // 2の累乗
const TWO_PI    = 2 * Math.PI;
const LUT_SCALE = LUT_SIZE / TWO_PI;

function makeLUT(harmonics) {
  const lut = new Float32Array(LUT_SIZE);
  let peak = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const ph = (i / LUT_SIZE) * TWO_PI;
    let v = 0;
    for (let k = 0; k < harmonics.length; k++) v += harmonics[k] * Math.sin((k + 1) * ph);
    lut[i] = v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  if (peak > 0) for (let i = 0; i < LUT_SIZE; i++) lut[i] /= peak;
  // 位相を [0, 2π) に正規化してテーブル参照
  return (phase) => {
    let p = phase % TWO_PI;
    if (p < 0) p += TWO_PI;
    return lut[p * LUT_SCALE | 0];
  };
}

// 各楽器の LUT 波形関数（起動時に一度だけ生成）
export const WAVE = {
  flute:  makeLUT(HARMONICS.flute),
  piano:  makeLUT(HARMONICS.piano),
  violin: makeLUT(HARMONICS.violin),
  cello:  makeLUT(HARMONICS.cello),
};

// 比較用：純粋なサイン波（基準線として軸に重ねて描く）
export const sinWave = (phase) => Math.sin(phase);
