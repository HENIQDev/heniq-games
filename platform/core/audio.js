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
      const n = def.notes[bgmStep % def.notes.length];
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

  return {
    tone,
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
}
