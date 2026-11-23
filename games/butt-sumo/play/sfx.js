// 効果音と BGM（WebAudio で合成。録音・サンプル素材なし）。音量は設定で変えられる。
export function createSfx(audio, settings) {
  const v = () => settings().sfx;
  const T = (o) => audio.tone({ ...o, vol: (o.vol || 0.3) * v() });
  const N = (o) => audio.noise({ ...o, vol: (o.vol || 0.2) * v() });
  const api = {
    click() { T({ f: 760, to: 900, dur: 0.07, type: 'triangle', vol: 0.25 }); },
    confirm() { T({ f: 660, dur: 0.08, type: 'triangle', vol: 0.3 }); T({ f: 990, dur: 0.14, type: 'triangle', vol: 0.3, delay: 0.07 }); },
    back() { T({ f: 520, to: 380, dur: 0.1, type: 'triangle', vol: 0.25 }); },
    count(n) { T({ f: n === 0 ? 880 : 440, dur: n === 0 ? 0.4 : 0.15, type: 'square', vol: 0.18 }); },
    go() { T({ f: 523, dur: 0.5, type: 'square', vol: 0.16 }); T({ f: 784, dur: 0.5, type: 'square', vol: 0.16 }); T({ f: 130, to: 120, dur: 1.0, type: 'sine', vol: 0.35 }); N({ dur: 0.3, f: 3000, vol: 0.12 }); },
    dash(p) { N({ dur: 0.28, f: 700, to: 2600, q: 0.8, vol: 0.2 }); T({ f: 180, to: 320, dur: 0.2, type: 'sawtooth', vol: 0.08 }); },
    charge() { T({ f: 280, to: 900, dur: 0.5, type: 'triangle', vol: 0.12 }); },
    brace() { T({ f: 140, to: 70, dur: 0.14, type: 'square', vol: 0.2 }); N({ dur: 0.08, f: 300, vol: 0.12 }); },
    hit(p = 0.5) {
      N({ dur: 0.16, f: 500 + p * 200, to: 140, q: 0.8, vol: 0.4 });
      T({ f: 330 + p * 60, to: 110, dur: 0.18, type: 'triangle', vol: 0.35 });
      T({ f: 230, to: 80, dur: 0.14, type: 'sawtooth', vol: 0.14, delay: 0.02 });   // ぶりっ
    },
    bump() { N({ dur: 0.08, f: 260, to: 120, vol: 0.2 }); T({ f: 160, to: 100, dur: 0.08, type: 'sine', vol: 0.2 }); },
    counter() { T({ f: 880, dur: 0.12, type: 'triangle', vol: 0.35 }); T({ f: 1320, dur: 0.3, type: 'triangle', vol: 0.3, delay: 0.06 }); N({ dur: 0.2, f: 2400, vol: 0.2 }); },
    special() { [392, 523, 659, 784, 1046].forEach((f, i) => T({ f, dur: 0.14, type: 'square', vol: 0.14, delay: i * 0.05 })); N({ dur: 0.5, f: 400, to: 2800, vol: 0.18 }); },
    ready() { T({ f: 1046, dur: 0.1, type: 'triangle', vol: 0.25 }); T({ f: 1318, dur: 0.18, type: 'triangle', vol: 0.25, delay: 0.08 }); },
    tired() { T({ f: 330, to: 200, dur: 0.3, type: 'triangle', vol: 0.18 }); },
    quake() { N({ dur: 0.6, f: 180, to: 50, q: 0.6, vol: 0.5 }); T({ f: 90, to: 40, dur: 0.5, type: 'sine', vol: 0.5 }); },
    pull() { T({ f: 200, to: 700, dur: 0.25, type: 'sawtooth', vol: 0.12 }); N({ dur: 0.2, f: 900, vol: 0.1 }); },
    out() { T({ f: 1300, to: 180, dur: 0.9, type: 'sine', vol: 0.3 }); N({ dur: 0.4, f: 3000, to: 500, vol: 0.18, delay: 0.1 }); },
    ko() { N({ dur: 0.9, f: 1800, q: 0.4, vol: 0.28 }); T({ f: 392, dur: 0.4, type: 'square', vol: 0.12 }); T({ f: 523, dur: 0.6, type: 'square', vol: 0.12, delay: 0.15 }); },
    win() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => T({ f, dur: 0.2, type: 'triangle', vol: 0.3, delay: i * 0.13 })); },
    lose() { [392, 349, 311, 247].forEach((f, i) => T({ f, dur: 0.3, type: 'triangle', vol: 0.28, delay: i * 0.2 })); },
    unlock() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => T({ f, dur: 0.25, type: 'square', vol: 0.16, delay: i * 0.09 })); },
    shrink() { T({ f: 220, to: 180, dur: 0.6, type: 'sawtooth', vol: 0.15 }); T({ f: 233, to: 190, dur: 0.6, type: 'sawtooth', vol: 0.15 }); },
    event(e) {
      switch (e.t) {
        case 'count': api.count(e.n); break; case 'go': api.go(); break; case 'dash': api.dash(e.p); break; case 'charge': api.charge(); break;
        case 'brace': api.brace(); break; case 'hit': api.hit(e.p); break; case 'counter': api.counter(); break; case 'bump': api.bump(); break;
        case 'special': api.special(); break; case 'ready': if (e.i === 0 || e.mine) api.ready(); break; case 'tired': api.tired(); break; case 'quake': api.quake(); break;
        case 'pull': api.pull(); break; case 'out': api.out(); break; case 'ko': api.ko(); break; case 'shrink': api.shrink(); break;
      }
    },
  };

  // BGM（ステップシーケンサ）
  let timer = 0, step = 0, cur = null;
  const SONGS = {
    menu: { bpm: 112, mel: [523, 0, 659, 0, 784, 659, 0, 523, 587, 0, 698, 0, 880, 698, 0, 587], bass: [131, 0, 131, 0, 175, 0, 175, 0, 147, 0, 147, 0, 196, 0, 196, 0], drum: true },
    battle: { bpm: 138, mel: [392, 392, 0, 523, 0, 587, 523, 0, 392, 0, 466, 0, 587, 523, 466, 0, 349, 349, 0, 466, 0, 523, 466, 0, 392, 0, 311, 0, 349, 392, 0, 0], bass: [98, 0, 98, 98, 0, 98, 117, 0, 87, 0, 87, 87, 0, 87, 104, 0, 98, 0, 98, 98, 0, 98, 117, 0, 87, 0, 87, 87, 0, 117, 131, 0], drum: true },
    boss: { bpm: 152, mel: [330, 0, 330, 392, 0, 440, 0, 392, 330, 0, 330, 392, 0, 494, 0, 440, 349, 0, 349, 440, 0, 523, 0, 440, 330, 0, 294, 0, 330, 0, 392, 0], bass: [82, 82, 0, 82, 98, 0, 98, 0, 87, 87, 0, 87, 104, 0, 104, 0, 82, 82, 0, 82, 98, 0, 98, 0, 87, 0, 73, 0, 82, 0, 98, 0], drum: true },
  };
  api.bgm = (name, mult = 1) => {
    api.stopBgm();
    const s = SONGS[name]; if (!s) return;
    cur = name; step = 0;
    const ms = 60000 / (s.bpm * (mult > 1 ? 1 + (mult - 1) : 1)) / 2;
    timer = setInterval(() => {
      const bv = settings().bgm;
      if (bv <= 0.01) { step++; return; }
      const i = step % s.mel.length;
      const f = s.mel[i] * (mult > 1 ? mult : 1);
      if (f) audio.tone({ f, dur: ms / 1000 * 0.85, type: 'square', vol: 0.06 * bv });
      const b = s.bass[i % s.bass.length];
      if (b) audio.tone({ f: b, dur: ms / 1000 * 1.6, type: 'triangle', vol: 0.16 * bv });
      if (s.drum) {
        const k = step % 8;
        if (k === 0 || k === 4 || (name !== 'menu' && k === 6)) audio.tone({ f: 130, to: 45, dur: 0.12, type: 'sine', vol: 0.28 * bv });
        if (k === 2 || k === 6) audio.noise({ dur: 0.09, f: 1800, q: 0.6, vol: 0.1 * bv });
        if (step % 2 === 1) audio.noise({ dur: 0.03, f: 7000, q: 1, vol: 0.04 * bv, type: 'highpass' });
      }
      step++;
    }, ms);
  };
  api.stopBgm = () => { clearInterval(timer); cur = null; };
  api.currentBgm = () => cur;
  return api;
}
