// main.js

import { ParticleSystem, PLATE_PRESETS } from './chladni.js';
import { Renderer } from './renderer.js';
import { AudioInput, supportsTabAudio } from './audio.js';
import { SampleInstrument, NOTES } from './sampler.js';
import { CanvasRecorder, saveSnapshot } from './recorder.js';

const $ = (id) => document.getElementById(id);

// ---- インスタンス ----
const particles = new ParticleSystem(12000);
const renderer  = new Renderer($('canvas'));
const audio     = new AudioInput();
const instrument = new SampleInstrument();
const recorder  = new CanvasRecorder($('canvas'));

let mode       = 'manual'; // 'manual' | 'mic' | 'tab'
let manualFreq = 440;
let animPaused = false;    // アニメーション一時停止フラグ

// 1フレームあたりの物理ステップ数。大きいほど図形が速く変化・収束する。
const SUBSTEPS = 3;

// ---- HUD ----
const hud = {
  mode: $('hud-mode'),
  freq: $('hud-freq'),
  mn:   $('hud-mn'),
  fps:  $('hud-fps'),
};
const MODE_LABEL = { manual: '手動', mic: 'マイク', tab: 'タブ音声' };

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

// ---- 入力ソース ----
const srcHint     = $('src-hint');
const btnAudioStop = $('btn-audio-stop');

const SRC_HINT = {
  manual: '手動モード：スライダーで振動を操作します。',
  mic:    'マイクで拾った音を反映中。YouTubeをスピーカーで流してもOK。',
  tab:    'タブ音声を反映中。YouTube等のタブを選べばリアルタイムで変化します。',
};

function updateSourceUI(activeMode, hint) {
  document.querySelectorAll('.src-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === activeMode);
  });
  const isLive = activeMode === 'mic' || activeMode === 'tab';
  btnAudioStop.classList.toggle('hidden', !isLive);
  srcHint.textContent = hint ?? SRC_HINT[activeMode];
  hud.mode.textContent = MODE_LABEL[activeMode];
}

async function switchMode(next) {
  try {
    if (next === 'mic') {
      updateSourceUI('mic', 'マイクの許可を求めています…');
      await audio.startMic();
    } else if (next === 'tab') {
      if (!supportsTabAudio()) {
        updateSourceUI('manual', 'このブラウザはタブ音声に未対応です（PC版Chrome/Edge推奨）。');
        return;
      }
      updateSourceUI('tab', '共有ダイアログでタブを選び「タブの音声を共有」にチェックしてください。');
      await audio.startTab();
    } else {
      await audio.stop();
    }
    mode = next;
    updateSourceUI(next);
  } catch (err) {
    console.error(err);
    let msg = 'エラーが発生しました。再試行してください。';
    if (err?.message === 'NO_TAB_AUDIO') msg = '音声トラックが取得できませんでした。「タブの音声を共有」にチェックして再試行してください。';
    else if (err?.name === 'NotAllowedError') msg = '権限が拒否されました。ブラウザの設定でマイクを許可してください。';
    await audio.stop();
    mode = 'manual';
    updateSourceUI('manual', msg);
  }
}

document.querySelectorAll('.src-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// 音声停止ボタン → 手動モードへ
btnAudioStop.addEventListener('click', () => switchMode('manual'));

// タブ音声未対応の場合はボタンを無効化
if (!supportsTabAudio()) {
  $('btn-tab').disabled = true;
  $('btn-tab').title = 'PC版Chrome/Edgeで利用可能';
}

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
  renderer.draw(particles); // 一時停止中でも即反映
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

// 鍵盤生成
// 音を鳴らし、手動モードなら図形へ反映する共通処理
async function triggerNote(note, btnEl) {
  btnEl.classList.add('playing');
  setTimeout(() => btnEl.classList.remove('playing'), 400);

  const freq = await instrument.play(note);

  if (mode === 'manual') {
    const v = Math.round(freq);
    $('freq-range').value = v;
    $('freq-num').value   = v;
    applyFreq(freq);
  }
}

const keysEl = $('keys');
NOTES.forEach((note) => {
  const b = document.createElement('button');
  b.className = 'key-btn';
  b.textContent = note.replace(/\d/, ''); // 'C4' → 'C'
  b.title = note;
  b.addEventListener('click', () => triggerNote(note, b));
  keysEl.appendChild(b);
});

// 左下 音名パッド（高音域）
const PAD_NOTES = ['C6', 'E6', 'G6', 'F5', 'G5', 'A5', 'C4', 'F4', 'C5'];
const padEl = $('note-pad');
PAD_NOTES.forEach((note) => {
  const b = document.createElement('button');
  b.textContent = note;
  b.title = note;
  b.addEventListener('click', () => triggerNote(note, b));
  padEl.appendChild(b);
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
  renderer.draw(particles); // 切り替え直後に即描画
});

// ---- 波形表示トグル ----
const toggleAxes = $('toggle-axes');
function applyAxes(on) {
  renderer.setShowAxes(on);
  // 波形表示中はパッドをガター内側へ寄せて重なりを防ぐ
  padEl.classList.toggle('inset', on);
  // 一時停止中でもすぐ反映されるよう一度描画
  renderer.draw(particles);
}
toggleAxes.addEventListener('change', () => applyAxes(toggleAxes.checked));
applyAxes(toggleAxes.checked);

// ---- メインループ ----
let lastFreqUpdate = 0;
let frames = 0;
let fpsTime = performance.now();
let rafId  = null;

function loop(now) {
  rafId = requestAnimationFrame(loop);

  // 音声モードの周波数検出
  if ((mode === 'mic' || mode === 'tab') && now - lastFreqUpdate > 80) {
    const f = audio.detectPitch();
    if (f) {
      particles.field.setFromFrequency(f);
      hud.freq.textContent = Math.round(f) + ' Hz';
    }
    lastFreqUpdate = now;
  } else if (mode === 'manual') {
    hud.freq.textContent = Math.round(manualFreq) + ' Hz';
  }

  if (!animPaused) {
    // 1フレームに複数回ステップを進めて図形の変化を速くする。
    // 描画は重い（粒子数ぶんの arc）ので 1 回だけにし、物理だけ多重化する。
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
    // iOS Safari の safe-area ずれを考慮して < 10 で判定
    if (window.scrollY < 10) {
      startY    = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });

  // passive: false にして iOS Safari でも preventDefault() を呼べるようにする
  document.addEventListener('touchmove', (e) => {
    if (!isPulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { isPulling = false; reset(); return; }

    // 引き下げ中はページスクロール（バウンス）を止める
    if (e.cancelable) e.preventDefault();

    // 修正: -60px (非表示) → dy=60 で 0px (画面端) → dy=80 で +20px (見える)
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
