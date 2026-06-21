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
});

// ---- パラメータ同期 ----
function applyFreq(freq) {
  manualFreq = freq;
  particles.field.setFromFrequency(freq);
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
linkRangeNumber('count-range', 'count-num', (v) => particles.setCount(v));
linkRangeNumber('vibr-range',  'vibr-num',  (v) => particles.setVibration(v / 100));

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
  renderer.draw(particles);
});

// ---- 板スケール（大きさ） ----
const scaleRow = $('scale-row');
scaleRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.inst-btn');
  if (!btn) return;
  scaleRow.querySelectorAll('.inst-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const preset = PLATE_PRESETS[btn.dataset.scale] || PLATE_PRESETS.medium;
  particles.field.setPlateC(preset.C);
  renderer.draw(particles);
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
  renderer.draw(particles);
});

// ---- メインループ ----
let frames = 0;
let fpsTime = performance.now();

function loop(now) {
  requestAnimationFrame(loop);

  hud.freq.textContent = Math.round(manualFreq) + ' Hz';

  if (!animPaused) {
    for (let s = 0; s < SUBSTEPS; s++) particles.step();
    renderer.draw(particles);
  }

  const fld = particles.field;
  hud.mn.textContent = fld.shape === 'circle'
    ? `節直径${fld.m} 節円${fld.n}`
    : `m=${fld.m} n=${fld.n}`;

  frames++;
  if (now - fpsTime >= 1000) {
    hud.fps.textContent = frames + ' fps';
    frames = 0;
    fpsTime = now;
  }
}

requestAnimationFrame(loop);

// ---- Pull to Refresh (モバイル) ----
(function setupPullToRefresh() {
  const THRESHOLD = 80;
  let startY    = 0;
  let isPulling = false;

  const el = document.createElement('div');
  el.id = 'ptr-indicator';
  el.innerHTML = '<span id="ptr-icon">↓</span>';
  document.body.appendChild(el);

  const icon = document.getElementById('ptr-icon');

  function setPos(ty, opacity) {
    el.style.transform = `translateX(-50%) translateY(${ty}px)`;
    el.style.opacity   = String(opacity);
  }

  function reset() {
    setPos(-60, 0);
    el.classList.remove('ready', 'refreshing');
    icon.textContent = '↓';
  }

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY < 10) {
      startY    = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { isPulling = false; reset(); return; }

    if (e.cancelable) e.preventDefault();

    const ty = -60 + Math.min(dy, 80);
    setPos(ty, Math.min(dy / THRESHOLD, 1));

    const ready = dy >= THRESHOLD;
    el.classList.toggle('ready', ready);
    icon.textContent = ready ? '↻' : '↓';
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (!isPulling) return;
    isPulling = false;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy >= THRESHOLD) {
      el.classList.add('refreshing');
      setPos(20, 1);
      setTimeout(() => location.reload(), 400);
    } else {
      reset();
    }
  });

  document.addEventListener('touchcancel', () => {
    isPulling = false;
    reset();
  });
})();
