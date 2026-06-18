// main.js
// 全モジュールを束ね、UI操作・描画ループ・音声反映を制御する。

import { ParticleSystem } from './chladni.js';
import { Renderer } from './renderer.js';
import { AudioInput, supportsTabAudio } from './audio.js';
import { SampleInstrument, NOTES, noteToFreq } from './sampler.js';
import { CanvasRecorder, saveSnapshot } from './recorder.js';

const $ = (id) => document.getElementById(id);

// ---- 状態 ----
const particles = new ParticleSystem(12000);
const renderer = new Renderer($('canvas'));
const audio = new AudioInput();
const instrument = new SampleInstrument();
const recorder = new CanvasRecorder($('canvas'));

let mode = 'manual'; // 'manual' | 'mic' | 'tab'
let manualFreq = 440;

// ---- HUD ----
const hud = {
  mode: $('hud-mode'),
  freq: $('hud-freq'),
  mn: $('hud-mn'),
  fps: $('hud-fps'),
};
const MODE_LABEL = { manual: '手動', mic: 'マイク', tab: 'タブ音声' };

// ---- パラメータ反映：周波数 ----
function applyFreq(freq) {
  manualFreq = freq;
  particles.field.setFromFrequency(freq);
}

// スライダー⇄数値入力 を同期する汎用ヘルパ
function linkRangeNumber(rangeId, numId, onChange) {
  const range = $(rangeId);
  const num = $(numId);
  const clamp = (v) => Math.max(+range.min, Math.min(+range.max, v));
  const sync = (v, from) => {
    v = clamp(v);
    if (from !== 'range') range.value = v;
    if (from !== 'num') num.value = v;
    onChange(v);
  };
  range.addEventListener('input', () => sync(+range.value, 'range'));
  num.addEventListener('input', () => {
    if (num.value === '') return;
    sync(+num.value, 'num');
  });
  num.addEventListener('blur', () => sync(+num.value || +range.min, 'num'));
  return sync;
}

linkRangeNumber('freq-range', 'freq-num', (v) => applyFreq(v));
linkRangeNumber('count-range', 'count-num', (v) => particles.setCount(v));
linkRangeNumber('vibr-range', 'vibr-num', (v) => particles.setVibration(v / 100));

// 初期値反映
applyFreq(440);
particles.setVibration(0.45);

// ---- 入力ソース切替 ----
const srcBtns = {
  manual: $('btn-manual'),
  mic: $('btn-mic'),
  tab: $('btn-tab'),
};
const srcHint = $('src-hint');

function setSourceButtons(active) {
  for (const k in srcBtns) srcBtns[k].classList.toggle('active', k === active);
}

async function switchMode(next) {
  try {
    if (next === 'mic') {
      srcHint.textContent = 'マイクの許可を求めています…';
      await audio.startMic();
      srcHint.textContent = 'マイクで拾った音を反映中。YouTubeをスピーカーで流してもOK。';
    } else if (next === 'tab') {
      if (!supportsTabAudio()) {
        srcHint.textContent = 'このブラウザはタブ音声キャプチャに未対応です（PC版Chrome/Edge推奨）。';
        return;
      }
      srcHint.textContent = '共有ダイアログで「タブ」を選び「タブの音声を共有」にチェックしてください。';
      await audio.startTab();
      srcHint.textContent = 'タブ音声を反映中。YouTube等のタブを選べばリアルタイムで図形が変化します。';
    } else {
      await audio.stop();
      srcHint.textContent = '手動モード：スライダー／数値で振動を操作します。';
    }
    mode = next;
    hud.mode.textContent = MODE_LABEL[next];
    setSourceButtons(next);
  } catch (err) {
    console.error(err);
    if (err && err.message === 'NO_TAB_AUDIO') {
      srcHint.textContent = '音声トラックが取得できませんでした。「タブの音声を共有」にチェックを入れて再試行してください。';
    } else if (err && err.name === 'NotAllowedError') {
      srcHint.textContent = '権限が拒否されました。ブラウザの設定で許可してください。';
    } else {
      srcHint.textContent = 'エラー：' + (err && err.message ? err.message : '不明なエラー');
    }
    await audio.stop();
    mode = 'manual';
    hud.mode.textContent = MODE_LABEL.manual;
    setSourceButtons('manual');
  }
}

srcBtns.manual.addEventListener('click', () => switchMode('manual'));
srcBtns.mic.addEventListener('click', () => switchMode('mic'));
srcBtns.tab.addEventListener('click', () => switchMode('tab'));

// タブ音声未対応環境ではボタンを無効化
if (!supportsTabAudio()) {
  srcBtns.tab.disabled = true;
  srcBtns.tab.title = 'この環境では利用できません';
}

// ---- サンプル音源 ----
const instRow = $('inst-row');
instRow.addEventListener('click', async (e) => {
  const btn = e.target.closest('.inst-btn');
  if (!btn) return;
  instRow.querySelectorAll('.inst-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  await instrument.setInstrument(btn.dataset.inst);
});

// 鍵盤生成
const keysEl = $('keys');
NOTES.forEach((note) => {
  const b = document.createElement('button');
  b.textContent = note;
  b.addEventListener('click', async () => {
    const freq = await instrument.play(note);
    // 手動モードのときは鳴らした音を図形へ反映
    if (mode === 'manual') {
      $('freq-range').value = Math.round(freq);
      $('freq-num').value = Math.round(freq);
      applyFreq(freq);
    }
  });
  keysEl.appendChild(b);
});

// ---- 録画 / スナップショット ----
const recBtn = $('btn-record');
const recBadge = $('rec-badge');
recBtn.addEventListener('click', () => {
  if (!CanvasRecorder.isSupported()) {
    alert('このブラウザは録画(MediaRecorder)に未対応です。');
    return;
  }
  if (recorder.recording) {
    recorder.stop();
    recBtn.textContent = '⏺ 録画開始';
    recBtn.classList.remove('active');
    recBadge.classList.add('hidden');
  } else {
    recorder.start(30);
    recBtn.textContent = '⏹ 録画停止 / 保存';
    recBtn.classList.add('active');
    recBadge.classList.remove('hidden');
  }
});

$('btn-snapshot').addEventListener('click', () => saveSnapshot($('canvas')));

// ---- メインループ ----
let lastFreqUpdate = 0;
let frames = 0;
let fpsTime = performance.now();

function loop(now) {
  // 音声入力モードなら周波数を検出して反映（5フレームに1回）
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

  particles.step();
  renderer.draw(particles);

  hud.mn.textContent = `m=${particles.field.m} n=${particles.field.n}`;

  // FPS
  frames++;
  if (now - fpsTime >= 1000) {
    hud.fps.textContent = frames + ' fps';
    frames = 0;
    fpsTime = now;
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
