// 土俵・観客席・背景（テーマごと）の 3D 配置。座標はコードで生成（乱数の種は固定）。
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const PALETTES = {
  park:    { skyTop: '#5fb4ff', skyBot: '#d8f0ff', sun: '#fff3b0', floor: '#7ac95a', side: '#b9854f', clay: '#d8b377', line: '#fff7e0', rope: '#d9b866', aud: ['#ff6b6b', '#ffd93d', '#6bcB77', '#4d96ff', '#ff9ff3'], fog: '#cdeaff', ambS: '#cfe8ff', ambG: '#7ab05a', light: '#fff1d0', fd: 0.012 },
  bath:    { skyTop: '#8ec9e8', skyBot: '#f5fbff', sun: '#ffffff', floor: '#9fd6e6', side: '#7aa7c4', clay: '#e9dcc6', line: '#ffffff', rope: '#cfe3f0', aud: ['#ffffff', '#ffb6c9', '#bfe6ff', '#fff0a8', '#c9f0d0'], fog: '#e8f6ff', ambS: '#e8f6ff', ambG: '#9fc4d6', light: '#ffffff', fd: 0.018 },
  shrine:  { skyTop: '#2a1a4a', skyBot: '#ff9a6a', sun: '#ffd0a0', floor: '#3a2a2a', side: '#8a2f2f', clay: '#cda06a', line: '#fff3d0', rope: '#f2e6c4', aud: ['#d62f2f', '#ffd23a', '#fff3d0', '#2a2a2a', '#ff8a3a'], fog: '#5a2f3a', ambS: '#ffb08a', ambG: '#4a2f3a', light: '#ffc890', fd: 0.02 },
  beach:   { skyTop: '#2f9fff', skyBot: '#bfeaff', sun: '#fff7c0', floor: '#f2dc9a', side: '#c9a45a', clay: '#f0d8a0', line: '#ffffff', rope: '#f4e8c0', aud: ['#ff5e8a', '#2fd0ff', '#ffe14a', '#8aff6a', '#ff9a3a'], fog: '#bfeaff', ambS: '#cfeaff', ambG: '#d9c080', light: '#fff4d0', fd: 0.012 },
  space:   { skyTop: '#05031a', skyBot: '#2a1a6a', sun: '#8a6aff', floor: '#14102e', side: '#3a2f7a', clay: '#4a4a8a', line: '#5fffe0', rope: '#ff5fd8', aud: ['#5fffe0', '#ff5fd8', '#ffe14a', '#8a6aff', '#ffffff'], fog: '#14102e', ambS: '#6a6aff', ambG: '#2a1a5a', light: '#c0c0ff', fd: 0.015, stars: 1 },
  ice:     { skyTop: '#8ad0ff', skyBot: '#f0fbff', sun: '#ffffff', floor: '#cfeeff', side: '#8ac4e8', clay: '#dff4ff', line: '#6ab0e0', rope: '#ffffff', aud: ['#ffffff', '#ff6b8a', '#4d96ff', '#ffd93d', '#9aff9a'], fog: '#e0f6ff', ambS: '#e0f6ff', ambG: '#9ac4e0', light: '#f0f8ff', fd: 0.018 },
  volcano: { skyTop: '#2a0a0a', skyBot: '#ff6a2a', sun: '#ffb050', floor: '#3a1410', side: '#5a2418', clay: '#9a6a4a', line: '#ffe08a', rope: '#ff8a3a', aud: ['#ff4a2a', '#ffb03a', '#3a3a3a', '#ffe14a', '#ff7a5a'], fog: '#4a1a10', ambS: '#ff9a6a', ambG: '#5a1a10', light: '#ffb070', fd: 0.02 },
  neon:    { skyTop: '#0a0a2a', skyBot: '#6a2aaa', sun: '#ff5fd8', floor: '#14142a', side: '#2a2a5a', clay: '#3a3a6a', line: '#5fffe0', rope: '#ff5fd8', aud: ['#ff5fd8', '#5fffe0', '#ffe14a', '#8a6aff', '#ff6a6a'], fog: '#1a1a3a', ambS: '#8a8aff', ambG: '#2a1a4a', light: '#d0d0ff', fd: 0.016 },
  kitchen: { skyTop: '#ffe9c0', skyBot: '#fff7e6', sun: '#fffbe0', floor: '#e8e0d0', side: '#c9a070', clay: '#f0dcb0', line: '#d6402f', rope: '#ffffff', aud: ['#d6402f', '#ffd23a', '#58b84a', '#ffffff', '#ff9a3a'], fog: '#fff0d0', ambS: '#fff3d8', ambG: '#c9b080', light: '#fff0d0', fd: 0.014 },
  sky:     { skyTop: '#6ab0ff', skyBot: '#fff0d0', sun: '#fff7a0', floor: '#f6e9ff', side: '#e8c86a', clay: '#f4e2a8', line: '#ffffff', rope: '#ffd23a', aud: ['#ffffff', '#ffe14a', '#ffb6e8', '#a8e8ff', '#ffd0a0'], fog: '#e6f2ff', ambS: '#ffffff', ambG: '#e8d8a0', light: '#fff6d8', fd: 0.01 },
};

const P = (m, p, sc, c, o = {}) => ({ m, p, sc, c, ...o });

export function buildWorld(theme, R) {
  const pal = PALETTES[theme] || PALETTES.park;
  const rd = rng(theme.split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7));
  const st = [];
  // 土俵の本体（円錐台）と、俵（土俵のふちの縄）
  st.push(P('f', [0, -0.62, 0], [R + 1.6, 1.2, R + 1.6], pal.side, { gloss: 0.1 }));
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    st.push(P('b', [Math.cos(a) * (R + 0.18), 0.05, Math.sin(a) * (R + 0.18)], [0.62, 0.17, 0.2], pal.rope, { rot: [0, -a + Math.PI / 2, 0], gloss: 0.1 }));
  }
  // 床
  st.push(P('y', [0, -1.25, 0], [70, 0.1, 70], pal.floor, { gloss: 0.05 }));
  // 観客席（背面と側面。カメラ側は空ける）
  const aud = [];
  const tiers = 3;
  for (let t = 0; t < tiers; t++) {
    const rad = 12.5 + t * 2.4, h = -0.6 + t * 1.2;
    const segs = 22;
    for (let i = 0; i < segs; i++) {
      const a = -Math.PI * 0.82 + (i / (segs - 1)) * Math.PI * 1.64; // 0 = 奥（−z）。±が横
      const x = Math.sin(a) * rad, z = -Math.cos(a) * rad;
      if (z > 5) continue;
      st.push(P('b', [x, h, z], [2.8, 1.2 + t * 0.3, 2.6], pal.side, { rot: [0, -a, 0], gloss: 0.05 }));
      for (let q = 0; q < 3; q++) {
        const o = (q - 1) * 0.8;
        const ax = x + Math.cos(a) * o, az = z + Math.sin(a) * o;
        const col = pal.aud[Math.floor(rd() * pal.aud.length)];
        aud.push({ p: [ax, h + 0.95 + t * 0.15, az], col, ph: rd() * 6.28 });
        aud.push({ p: [ax + Math.sin(a) * 0.35, h + 1.0 + t * 0.15, az - Math.cos(a) * 0.35 + 0.0], col: pal.aud[Math.floor(rd() * pal.aud.length)], ph: rd() * 6.28 });
      }
    }
  }
  // ちょうちん（光る球）
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI * 0.75 + (i / 7) * Math.PI * 1.5;
    const x = Math.sin(a) * 10.2, z = -Math.cos(a) * 10.2;
    if (z > 4) continue;
    st.push(P('y', [x, 1.3, z], [0.06, 2.6, 0.06], '#444444'));
    st.push(P('s', [x, 2.75, z], [0.42, 0.5, 0.42], i % 2 ? pal.sun : pal.rope, { emis: 0.85 }));
  }
  // テーマごとの背景
  const props = {
    park() {
      for (let i = 0; i < 14; i++) { const a = rd() * Math.PI * 2, r = 24 + rd() * 14; const x = Math.sin(a) * r, z = -Math.abs(Math.cos(a)) * r; st.push(P('y', [x, 1.5, z], [0.4, 3, 0.4], '#8a5a30')); st.push(P('s', [x, 4.2, z], [2.2, 2.2, 2.2], '#4fa84a', { gloss: 0.2 })); }
      for (let i = 0; i < 6; i++) st.push(P('s', [-30 + i * 12, 18 + rd() * 4, -40], [5 + rd() * 3, 1.6, 2.5], '#ffffff', { emis: 0.25 }));
    },
    bath() {
      for (let i = 0; i < 8; i++) st.push(P('b', [-28 + i * 8, 6, -30], [8, 14, 1], i % 2 ? '#8ec9e8' : '#6fb2d8'));
      st.push(P('b', [0, 12, -29], [26, 9, 0.5], '#4fa0d0', { emis: 0.15 })); st.push(P('s', [0, 12, -28.6], [6, 6, 0.3], '#ffffff', { emis: 0.4 }));
    },
    shrine() {
      st.push(P('y', [-8, 5, -28], [0.8, 10, 0.8], '#d62f2f')); st.push(P('y', [8, 5, -28], [0.8, 10, 0.8], '#d62f2f'));
      st.push(P('b', [0, 10, -28], [22, 1.2, 1.2], '#d62f2f')); st.push(P('b', [0, 8.2, -28], [18, 0.8, 0.8], '#2a2a2a'));
      for (let i = 0; i < 10; i++) st.push(P('k', [-30 + rd() * 60, 5, -34 - rd() * 10], [4, 10, 4], '#2a1a3a'));
    },
    beach() {
      st.push(P('y', [0, -1.2, -45], [100, 0.1, 40], '#2f9fff', { emis: 0.1, gloss: 0.9 }));
      for (let i = 0; i < 7; i++) { const x = -24 + i * 8 + rd() * 3, z = -22 - rd() * 6; st.push(P('y', [x, 3, z], [0.3, 6, 0.3], '#8a5a30', { rot: [0, 0, 0.15] })); for (let j = 0; j < 5; j++) st.push(P('s', [x + Math.cos(j) * 1.4, 6.2, z + Math.sin(j) * 1.4], [1.6, 0.18, 0.5], '#2fa84a', { rot: [0, -j, 0.3] })); }
    },
    space() {
      st.push(P('s', [-22, 14, -45], [9, 9, 9], '#8a6aff', { emis: 0.35, gloss: 0.6 })); st.push(P('s', [18, 22, -50], [5, 5, 5], '#ff5fd8', { emis: 0.4 }));
      st.push(P('y', [-22, 14, -45], [14, 0.2, 14], '#d9c0ff', { emis: 0.3 }));
      for (let i = 0; i < 12; i++) st.push(P('s', [-34 + rd() * 68, 4 + rd() * 16, -28 - rd() * 14], [1 + rd() * 2, 1 + rd() * 1.5, 1 + rd() * 2], '#5a4a9a', { gloss: 0.3 }));
    },
    ice() {
      for (let i = 0; i < 16; i++) { const x = -34 + rd() * 68, z = -24 - rd() * 12, h = 4 + rd() * 8; st.push(P('k', [x, h / 2, z], [2.2, h, 2.2], '#bfe8ff', { gloss: 0.9, emis: 0.1 })); }
      for (let i = 0; i < 5; i++) st.push(P('s', [-20 + i * 10, 0.4, -16 - rd() * 4], [2.2, 1.8, 2.2], '#ffffff', { gloss: 0.4 }));
    },
    volcano() {
      st.push(P('k', [0, 11, -46], [34, 22, 34], '#3a2018')); st.push(P('s', [0, 22, -46], [7, 3, 7], '#ff8a2a', { emis: 0.9 }));
      st.push(P('y', [0, -1.22, -20], [90, 0.1, 30], '#ff5a1a', { emis: 0.7 }));
      for (let i = 0; i < 10; i++) st.push(P('s', [-30 + rd() * 60, 1, -22 - rd() * 10], [1.5 + rd(), 1.3, 1.5 + rd()], '#2a1410'));
    },
    neon() {
      for (let i = 0; i < 18; i++) { const x = -42 + i * 5 + rd() * 2, h = 10 + rd() * 26; st.push(P('b', [x, h / 2, -34 - rd() * 8], [3.6, h, 3.6], '#1a1a3a', { gloss: 0.4 })); for (let j = 0; j < 4; j++) st.push(P('b', [x, 2 + rd() * (h - 3), -31.9], [2.8, 0.4, 0.1], pal.aud[Math.floor(rd() * 5)], { emis: 0.9 })); }
      st.push(P('b', [0, 2.5, -23], [30, 0.4, 0.4], '#5fffe0', { emis: 1 }));
    },
    kitchen() {
      for (let i = 0; i < 3; i++) { const x = -22 + i * 22; st.push(P('y', [x, 6, -30], [0.5, 12, 0.5], '#c9c9d0', { gloss: 0.9 })); st.push(P('b', [x, 12.5, -30], [2.2, 2.6, 0.4], '#c9c9d0', { gloss: 0.9 })); }
      for (let i = 0; i < 5; i++) st.push(P('y', [-30 + i * 14, 0.2, -22 - rd() * 4], [3 + rd(), 0.5, 3 + rd()], '#ffffff', { gloss: 0.8 }));
      st.push(P('s', [26, 3, -22], [3, 3, 3], '#d6402f', { gloss: 0.9 })); st.push(P('s', [-26, 2.4, -20], [2.4, 2.4, 2.4], '#ffd23a', { gloss: 0.9 }));
    },
    sky() {
      for (let i = 0; i < 14; i++) st.push(P('s', [-40 + rd() * 80, -4 + rd() * 14, -30 - rd() * 20], [3 + rd() * 4, 1.4 + rd(), 2.5 + rd() * 2], '#ffffff', { emis: 0.35 }));
      for (let i = 0; i < 6; i++) { const a = -Math.PI * 0.7 + (i / 5) * Math.PI * 1.4; st.push(P('y', [Math.sin(a) * 22, 6, -Math.cos(a) * 22 - 4], [0.9, 12, 0.9], '#ffe9a0', { gloss: 0.6 })); }
    },
  };
  (props[theme] || props.park)();
  return { pal, statics: st, aud };
}
