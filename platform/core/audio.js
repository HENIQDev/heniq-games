// 効果音と BGM を WebAudio で合成する（素材ファイルなし）。ブラウザの制限により、最初の操作の後に鳴り始める。
// ミュートの状態だけを端末に保存する（表示用の設定。秘密の値ではない）。
import { loadNumber, saveNumber } from './storage.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = loadNumber('mute', 0) === 1;
  let bgmTimer = 0;
  let bgmStep = 0;
  let bgmOn = false;
  let bgm = null;
  const listeners = new Set();

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  // 最初のユーザー操作で音を使える状態にする
  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });

  // 1 つの音：周波数の変化・長さ・波形・音量の包絡
  function tone({ f = 440, to = null, dur = 0.12, type = 'sine', vol = 0.3, delay = 0, attack = 0.005 }) {
    if (muted || !ensure() || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // ノイズ（風・衝突・足音など）：帯域フィルタをかけて短く鳴らす
  let noiseBuf = null;
  function noise({ dur = 0.15, vol = 0.2, f = 1200, to = null, q = 1, delay = 0, type = 'bandpass' }) {
    if (muted || !ensure() || ctx.state !== 'running') return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let a = 12345;
      for (let i = 0; i < d.length; i++) { a = (a * 1664525 + 1013904223) >>> 0; d[i] = (a / 4294967296) * 2 - 1; }
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t0);
    if (to) flt.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function setMuted(v) {
    muted = !!v;
    saveNumber('mute', muted ? 1 : 0);
    if (master) master.gain.value = muted ? 0 : 0.5;
    for (const fn of listeners) fn(muted);
  }

  // BGM：ゲームが渡した { bpm, notes, bass } を一定の間隔で鳴らす（0 は休符）
  function startBgm(def) {
    stopBgm();
    bgm = def;
    bgmOn = true;
    bgmStep = 0;
    const stepMs = 60000 / def.bpm / 2;
    bgmTimer = setInterval(() => {
      if (!bgmOn) return;
      if (def.step) def.step(bgmStep, api);
      const n = def.notes ? def.notes[bgmStep % def.notes.length] : 0;
      if (n) tone({ f: n, dur: stepMs / 1000 * 0.9, type: 'triangle', vol: 0.09 });
      if (def.bass && bgmStep % 4 === 0) {
        const b = def.bass[(bgmStep / 4) % def.bass.length | 0];
        if (b) tone({ f: b, dur: stepMs / 1000 * 3.2, type: 'sine', vol: 0.12 });
      }
      bgmStep += 1;
    }, stepMs);
  }
  function stopBgm() {
    bgmOn = false;
    clearInterval(bgmTimer);
  }

  const api = {
    tone,
    noise,
    unlock,
    startBgm,
    stopBgm,
    get muted() { return muted; },
    setMuted,
    toggleMute() { setMuted(!muted); },
    onMute(fn) { listeners.add(fn); },
    // 音が鳴る状態か（自動テスト用）
    get running() { return !!ctx && ctx.state === 'running'; },
  };
  return api;
}
