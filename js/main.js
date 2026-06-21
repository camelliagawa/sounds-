// main.js

import { ParticleSystem, PLATE_PRESETS } from './chladni.js';
import { Renderer } from './renderer.js';
import { CanvasRecorder, saveSnapshot } from './recorder.js';

const $ = (id) => document.getElementById(id);

// ---- インスタンス ----
const particles = new ParticleSystem(12000);
const renderer  = new Renderer($('canvas'));
const recorder  = new CanvasRecorder($('canvas'));

let manualFreq = 440;
let animPaused = false;

// 1フレームあたりの物理ステップ数。大きいほど図形が速く変化・収束する。
const SUBSTEPS = 3;

// ---- 省電力・発熱対策 ----
// 30fps 上限。砂の表現にはこれで十分で、計算・描画量を半減できる。
const FRAME_MS = 1000 / 30;
// 収束判定：平均|z|の高速EMAと低速EMAがこの差以内で一定フレーム続いたら静止とみなす。
const SETTLE_EPS    = 0.0025;
const SETTLE_FRAMES = 60;

let frozen      = false; // クラドニ図形が収束し、ステップ・描画を止めている状態
let settleCount = 0;
let emaFast     = -1;
let emaSlow     = -1;

// パラメータ変更時にシミュレーションを再開させる。
function wake() {
  frozen = false;
  settleCount = 0;
  emaFast = emaSlow = -1;
}

// ---- HUD ----
const hud = {
  freq: $('hud-freq'),
  mn:   $('hud-mn'),
  fps:  $('hud-fps'),
};

// ---- アニメーション 再生/停止 ----
const btnAnim   = $('btn-anim');
const iconPause = $('icon-pause');
const iconPlay  = $('icon-play');

btnAnim.addEventListener('click', () => {
  animPaused = !animPaused;
  btnAnim.classList.toggle('paused', animPaused);
  iconPause.classList.toggle('hidden', animPaused);
  iconPlay.classList.toggle('hidden', !animPaused);
  if (!animPaused) wake(); // 再生で再開
});

// ---- パラメータ同期 ----
function applyFreq(freq) {
  manualFreq = freq;
  particles.field.setFromFrequency(freq);
  wake();
  // 節線モードはアニメーションしないため、周波数変化を即時描画
  if (renderer.drawMode === 'lines') renderer.draw(particles);
}

function linkRangeNumber(rangeId, numId, onChange) {
  const range = $(rangeId);
  const num   = $(numId);
  const clamp = (v) => Math.max(+range.min, Math.min(+range.max, v));
  const sync  = (v, from) => {
    v = clamp(v);
    if (from !== 'range') range.value = v;
    if (from !== 'num')   num.value   = v;
    onChange(v);
  };
  range.addEventListener('input', () => sync(+range.value, 'range'));
  num.addEventListener('input',   () => { if (num.value !== '') sync(+num.value, 'num'); });
  num.addEventListener('blur',    () => sync(+num.value || +range.min, 'num'));
  return sync;
}

linkRangeNumber('freq-range',  'freq-num',  (v) => applyFreq(v));
linkRangeNumber('count-range', 'count-num', (v) => { particles.setCount(v); wake(); });
linkRangeNumber('vibr-range',  'vibr-num',  (v) => { particles.setVibration(v / 100); wake(); });

applyFreq(440);
particles.setVibration(0.45);

// ---- 板の形状 ----
const shapeRow = $('shape-row');
shapeRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.inst-btn');
  if (!btn) return;
  shapeRow.querySelectorAll('.inst-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const shape = btn.dataset.shape;
  particles.field.setShape(shape);
  renderer.setShape(shape);
  wake();
  renderer.draw(particles);
});

// ---- 板スケール（大きさ）----
// プリセットボタンとスライダーを双方向同期する。
const scaleRow    = $('scale-row');
const plateCRange = $('plate-c-range');

function applyPlateC(C, activeKey) {
  particles.field.setPlateC(C);
  plateCRange.value = C;
  scaleRow.querySelectorAll('.inst-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.scale === activeKey);
  });
  wake();
  renderer.draw(particles);
}

scaleRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.inst-btn');
  if (!btn) return;
  const key    = btn.dataset.scale;
  const preset = PLATE_PRESETS[key] || PLATE_PRESETS.medium;
  applyPlateC(preset.C, key);
});

plateCRange.addEventListener('input', () => {
  const C = +plateCRange.value;
  // スライダーがプリセット値にぴったり一致したときだけ選択表示する。
  const match = Object.entries(PLATE_PRESETS).find(([, p]) => Math.abs(p.C - C) < 0.01);
  applyPlateC(C, match ? match[0] : null);
});

// ---- 録画 / スナップショット ----
const recBtn   = $('btn-record');
const recBadge = $('rec-badge');

recBtn.addEventListener('click', () => {
  if (!CanvasRecorder.isSupported()) {
    alert('このブラウザは録画に未対応です。');
    return;
  }
  if (recorder.recording) {
    recorder.stop();
    recBtn.textContent = '⏺ 録画開始';
    recBtn.classList.remove('recording');
    recBadge.classList.add('hidden');
  } else {
    recorder.start(30);
    recBtn.textContent = '⏹ 停止・保存';
    recBtn.classList.add('recording');
    recBadge.classList.remove('hidden');
  }
});

$('btn-snapshot').addEventListener('click', () => saveSnapshot($('canvas')));

// ---- 描画モード ----
const drawmodeRow = $('drawmode-row');
drawmodeRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.inst-btn');
  if (!btn) return;
  drawmodeRow.querySelectorAll('.inst-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  renderer.setDrawMode(btn.dataset.drawmode);
  wake();
  renderer.draw(particles);
});

// ---- メインループ ----
let frames    = 0;
let fpsTime   = performance.now();
let lastFrame = 0;

function loop(now) {
  requestAnimationFrame(loop);

  // 30fps 上限。間引いたフレームは即座に戻る（負荷・発熱を抑える）。
  if (now - lastFrame < FRAME_MS) return;
  lastFrame = now;

  hud.freq.textContent = Math.round(manualFreq) + ' Hz';

  // 節線モードは静止画（変更時のみ描画）なので、ループでは何もしない。
  // 粒子モードは収束（frozen）するまでステップ＆描画する。
  const linesMode = renderer.drawMode === 'lines';
  let working = false;
  if (!animPaused && !linesMode && !frozen) {
    working = true;
    for (let s = 0; s < SUBSTEPS; s++) particles.step();
    renderer.draw(particles);

    // 収束検出：平均|z|の高速/低速EMAが十分近づいたら静止とみなして停止。
    const e = particles.energy;
    if (emaFast < 0) {
      emaFast = emaSlow = e;
    } else {
      emaFast = emaFast * 0.80 + e * 0.20;
      emaSlow = emaSlow * 0.97 + e * 0.03;
    }
    if (Math.abs(emaFast - emaSlow) < SETTLE_EPS) {
      if (++settleCount >= SETTLE_FRAMES) frozen = true;
    } else {
      settleCount = 0;
    }
  }

  const fld = particles.field;
  hud.mn.textContent = fld.shape === 'circle'
    ? `節直径${fld.m} 節円${fld.n}`
    : `m=${fld.m} n=${fld.n}`;

  frames++;
  if (now - fpsTime >= 1000) {
    // 動作中は実fps、静止中は省電力中であることを示す。
    hud.fps.textContent = working ? frames + ' fps' : '静止';
    frames  = 0;
    fpsTime = now;
  }
}

requestAnimationFrame(loop);

// リサイズ時はキャンバスがクリアされるため、再描画のため再開させる。
window.addEventListener('resize', wake);
