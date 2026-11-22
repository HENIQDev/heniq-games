// BALL DODGE：飛んでくるボールを避け続ける。スコアは生き延びた時間（ミリ秒）。明るくポップなカジュアルゲーム。
import { startGame } from '../platform/core/runtime.js';
import { createRng } from '../platform/core/rng.js';

const W = 480;
const H = 720;
const PLAYER_R = 11;          // 当たり判定の半径
const DRAW_R = 14;            // 見た目の半径
const PLAYER_SPEED = 360;     // px/秒
const HIT_FORGIVE = 0.8;      // 当たり判定をやや甘くする（理不尽感を減らす）
const NEAR_DIST = 16;         // この距離まで近づいて通過するとニアミス
const MAX_BALLS = 110;
const WAVE_FIRST = 10;        // 最初の波（秒）
const WAVE_EVERY = 12;
const WAVE_WARN = 1.0;        // 波の警告（秒）
const DEATH_ANIM = 0.7;       // やられ演出（秒）
const INK = '#2b2350';
const COLORS = ['#ff4f8b', '#2bb6ff', '#ffc233', '#4cd964'];

const BGM = {
  bpm: 132,
  notes: [523, 0, 659, 0, 784, 0, 659, 0, 587, 0, 698, 0, 880, 0, 698, 0,
          523, 0, 659, 0, 784, 0, 988, 0, 880, 0, 784, 0, 659, 0, 587, 0],
  bass: [262, 262, 294, 330],
};

// ---- 背景（チェック柄）は 1 回だけ描いて使い回す ----
function makeBackground() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff3d6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffe9b8';
  const s = 60;
  for (let y = 0; y < H / s; y++) for (let x = 0; x < W / s; x++) if ((x + y) % 2 === 0) g.fillRect(x * s, y * s, s, s);
  g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(0, 0, W, H);
  return c;
}

function create(env) {
  const { rng, input, audio, reducedMotion } = env;
  const vr = createRng((rng.seed ^ 0x9e3779b9) >>> 0);   // 見た目だけの乱数（ゲームの進行には影響しない）
  const bg = makeBackground();
  const player = { x: W / 2, y: H * 0.72, sx: 1, sy: 1, lookX: 0, lookY: 0 };
  const balls = [];
  const fx = [];        // 紙吹雪などの粒
  const pops = [];      // 文字のポップアップ
  const warns = [];     // 波の警告 { kind, t, side }
  const queue = [];     // 予約された出現 { at, make }
  let t = 0;
  let spawnTimer = 0.4;
  let nextWave = WAVE_FIRST;
  let waveCount = 0;
  let combo = 0;
  let comboTimer = 0;
  let nearCount = 0;
  let shake = 0;
  let dead = false;
  let deathT = 0;
  let milestone = 10;
  let hurt = 0;

  const self = {
    score: 0,
    isOver: false,
    get nearMisses() { return nearCount; },
    get ballList() { return balls; },
    get playerPos() { return player; },
    get time() { return t; },

    update(dt) {
      if (dead) {
        deathT += dt;
        updateFx(dt);
        if (deathT >= DEATH_ANIM) self.isOver = true;
        return;
      }
      t += dt;
      movePlayer(dt);
      scheduleWaves();
      runQueue();
      spawn(dt);
      moveBalls(dt);
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
      if (t >= milestone) {
        audio.tone({ f: 523, dur: 0.1, type: 'square', vol: 0.12 });
        audio.tone({ f: 659, dur: 0.1, type: 'square', vol: 0.12, delay: 0.09 });
        audio.tone({ f: 784, dur: 0.18, type: 'square', vol: 0.12, delay: 0.18 });
        pops.push({ x: W / 2, y: 150, text: milestone + ' 秒！', life: 1.2, color: '#ffc233', size: 40 });
        milestone += 10;
      }
      lookAtNearest();
      updateFx(dt);
      self.score = Math.floor(t * 1000);
    },

    draw(g) {
      g.save();
      if (shake > 0 && !reducedMotion) g.translate(vr.range(-shake, shake), vr.range(-shake, shake));
      g.drawImage(bg, 0, 0);
      drawWarns(g);
      for (const b of balls) drawBall(g, b);
      drawPlayer(g);
      for (const p of fx) {
        g.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
        g.fillStyle = p.color;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      g.globalAlpha = 1;
      for (const p of pops) outlinedText(g, p.text, p.x, p.y, p.size, p.color, Math.min(1, p.life * 2));
      drawHud(g);
      g.restore();
    },
  };

  // ---------------------------------------------------------------- 操作
  function movePlayer(dt) {
    let mx = 0, my = 0;
    if (input.pointer.active) {
      // 指の少し上へ向かう（指で隠れないように）
      const dx = input.pointer.x - player.x, dy = input.pointer.y - 28 - player.y;
      const dist = Math.hypot(dx, dy);
      const step = PLAYER_SPEED * 1.6 * dt;
      if (dist <= step) { mx = dx; my = dy; } else { mx = (dx / dist) * step; my = (dy / dist) * step; }
    } else {
      const a = input.axis();
      mx = a.x * PLAYER_SPEED * dt;
      my = a.y * PLAYER_SPEED * dt;
    }
    player.x = Math.min(W - PLAYER_R, Math.max(PLAYER_R, player.x + mx));
    player.y = Math.min(H - PLAYER_R, Math.max(PLAYER_R, player.y + my));
    // 動きに合わせてぷるぷる（見た目だけ）
    const sp = Math.hypot(mx, my) / dt / PLAYER_SPEED;
    player.sx += ((1 + Math.min(0.18, sp * 0.14)) - player.sx) * 0.3;
    player.sy += ((1 - Math.min(0.14, sp * 0.1)) - player.sy) * 0.3;
  }

  // ---------------------------------------------------------------- 出現
  function spawn(dt) {
    spawnTimer -= dt;
    while (spawnTimer <= 0 && balls.length < MAX_BALLS) {
      spawnTimer += Math.max(0.07, 0.55 - t * 0.011);
      addAimed(rng.int(0, 3), 0);
    }
    if (spawnTimer < 0) spawnTimer = 0;
  }

  function edgePoint(side) {
    if (side === 0) return [rng.range(0, W), -30];
    if (side === 1) return [W + 30, rng.range(0, H)];
    if (side === 2) return [rng.range(0, W), H + 30];
    return [-30, rng.range(0, H)];
  }

  function addAimed(side, jitterScale, speedMul = 1) {
    const [x, y] = edgePoint(side);
    const j = 90 * (1 - jitterScale);
    const ax = player.x + rng.range(-j, j), ay = player.y + rng.range(-j, j);
    const speed = Math.min(150 + t * 4.5, 390) * rng.range(0.8, 1.25) * speedMul;
    const len = Math.hypot(ax - x, ay - y) || 1;
    balls.push(makeBall(x, y, ((ax - x) / len) * speed, ((ay - y) / len) * speed, rng.range(8, 17)));
  }

  function makeBall(x, y, vx, vy, r) {
    return { x, y, vx, vy, r, c: COLORS[rng.int(0, 3)], near: false, spin: rng.range(0, 6.28) };
  }

  // ---------------------------------------------------------------- 波（ウェーブ）
  function scheduleWaves() {
    if (t < nextWave) return;
    nextWave += WAVE_EVERY;
    waveCount += 1;
    const kind = ['ring', 'sweep', 'volley'][rng.int(0, 2)];
    const side = rng.int(0, 3);
    warns.push({ kind, side, t: WAVE_WARN });
    audio.tone({ f: 880, dur: 0.09, type: 'square', vol: 0.14 });
    audio.tone({ f: 660, dur: 0.09, type: 'square', vol: 0.14, delay: 0.14 });
    queue.push({ at: t + WAVE_WARN, run: () => launchWave(kind, side) });
  }

  function runQueue() {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (t >= queue[i].at) { const q = queue[i]; queue.splice(i, 1); q.run(); }
    }
  }

  function launchWave(kind, side) {
    const speedBase = Math.min(150 + t * 3, 260);
    if (kind === 'ring') {
      const n = 14, off = rng.range(0, 6.28), R = 470;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * 6.2832;
        const x = player.x + Math.cos(a) * R, y = player.y + Math.sin(a) * R;
        balls.push(makeBall(x, y, -Math.cos(a) * speedBase * 0.75, -Math.sin(a) * speedBase * 0.75, 13));
      }
    } else if (kind === 'sweep') {
      // すきまが 1 つある壁。すきまは必ず通れる幅（中心の間隔 56・2 つ分を抜く）
      const horizontal = side % 2 === 0;           // 上下から（横一列）／左右から（縦一列）
      const len = horizontal ? W : H;
      const slots = Math.floor(len / 56);
      const gap = rng.int(1, slots - 3);
      for (let i = 0; i < slots; i++) {
        if (i === gap || i === gap + 1) continue;
        const p = 28 + i * 56;
        const sp = speedBase * 0.85;
        if (side === 0) balls.push(makeBall(p, -30, 0, sp, 14));
        else if (side === 2) balls.push(makeBall(p, H + 30, 0, -sp, 14));
        else if (side === 1) balls.push(makeBall(W + 30, p, -sp, 0, 14));
        else balls.push(makeBall(-30, p, sp, 0, 14));
      }
    } else {
      for (let i = 0; i < 8; i++) {
        queue.push({ at: t + i * 0.18, run: () => addAimed(side, 1, 1.2) });
      }
    }
  }

  // ---------------------------------------------------------------- 進行
  function moveBalls(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.spin += dt * 3;
      if (b.x < -90 || b.x > W + 90 || b.y < -90 || b.y > H + 90) { balls.splice(i, 1); continue; }
      const d = Math.hypot(b.x - player.x, b.y - player.y);
      if (d < (b.r + PLAYER_R) * HIT_FORGIVE) { die(); return; }
      if (!b.near && d < b.r + PLAYER_R + NEAR_DIST) {
        b.near = true;
        combo += 1;
        nearCount += 1;
        comboTimer = 2;
        audio.tone({ f: 523 * Math.pow(2, Math.min(combo, 12) / 12), dur: 0.09, type: 'square', vol: 0.12 });
        pops.push({ x: player.x, y: player.y - 30, text: combo > 1 ? 'NEAR! ×' + combo : 'NEAR!', life: 0.8, color: '#ff4f8b', size: 22 });
        if (!reducedMotion) for (let k = 0; k < 4; k++) fx.push(spark(player.x, player.y, '#ffc233'));
      }
    }
  }

  function die() {
    dead = true;
    self.score = Math.floor(t * 1000);
    audio.tone({ f: 440, to: 90, dur: 0.55, type: 'sawtooth', vol: 0.2 });
    audio.tone({ f: 220, to: 60, dur: 0.6, type: 'square', vol: 0.12, delay: 0.05 });
    shake = reducedMotion ? 0 : 9;
    hurt = 1;
    const n = reducedMotion ? 10 : 46;
    for (let k = 0; k < n; k++) fx.push(confetti(player.x, player.y));
  }

  // ---------------------------------------------------------------- 見た目の部品
  function spark(x, y, color) {
    const a = vr.range(0, 6.28), s = vr.range(60, 160);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, size: 5, color, g: 0 };
  }
  function confetti(x, y) {
    const a = vr.range(0, 6.28), s = vr.range(120, 420);
    return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: vr.range(0.6, 1.1), size: vr.range(6, 12), color: COLORS[vr.int(0, 3)], g: 700 };
  }
  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].life -= dt;
      pops[i].y -= 28 * dt;
      if (pops[i].life <= 0) pops.splice(i, 1);
    }
    for (let i = warns.length - 1; i >= 0; i--) {
      warns[i].t -= dt;
      if (warns[i].t <= -0.3) warns.splice(i, 1);
    }
    shake = Math.max(0, shake - dt * 30);
    hurt = Math.max(0, hurt - dt * 2);
  }
  function lookAtNearest() {
    let best = 1e9, bx = 0, by = 0;
    for (const b of balls) {
      const d = Math.hypot(b.x - player.x, b.y - player.y);
      if (d < best) { best = d; bx = b.x - player.x; by = b.y - player.y; }
    }
    const len = Math.hypot(bx, by) || 1;
    player.lookX = bx / len;
    player.lookY = by / len;
  }

  function drawBall(g, b) {
    g.fillStyle = 'rgba(43,35,80,0.15)';
    g.beginPath(); g.ellipse(b.x + 3, b.y + b.r * 0.9, b.r * 0.95, b.r * 0.45, 0, 0, 6.2832); g.fill();
    g.fillStyle = b.c;
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.2832); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.arc(b.x - b.r * 0.35, b.y - b.r * 0.38, b.r * 0.28, 0, 6.2832); g.fill();
  }

  function drawPlayer(g) {
    const sx = dead ? 1 + Math.min(0.5, deathT * 3) : player.sx;
    const sy = dead ? Math.max(0.35, 1 - deathT * 3) : player.sy;
    g.save();
    g.translate(player.x, player.y + (dead ? DRAW_R * (1 - sy) : 0));
    g.scale(sx, sy);
    g.fillStyle = 'rgba(43,35,80,0.15)';
    g.beginPath(); g.ellipse(2, DRAW_R * 0.85, DRAW_R, DRAW_R * 0.4, 0, 0, 6.2832); g.fill();
    g.fillStyle = '#fff';
    g.strokeStyle = INK;
    g.lineWidth = 3.5;
    g.beginPath(); g.arc(0, 0, DRAW_R, 0, 6.2832); g.fill(); g.stroke();
    // 目：近づくボールを追う。ニアミスのコンボ中は目が大きくなる。やられると×
    if (dead) {
      g.lineWidth = 2.5;
      for (const ex of [-5, 5]) {
        g.beginPath(); g.moveTo(ex - 2.5, -4); g.lineTo(ex + 2.5, 1); g.moveTo(ex + 2.5, -4); g.lineTo(ex - 2.5, 1); g.stroke();
      }
    } else {
      const er = combo > 0 ? 4.3 : 3.6;
      for (const ex of [-5, 5]) {
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(ex, -2, er, 0, 6.2832); g.fill(); g.lineWidth = 1.8; g.stroke();
        g.fillStyle = INK;
        g.beginPath(); g.arc(ex + player.lookX * 1.8, -2 + player.lookY * 1.8, 1.8, 0, 6.2832); g.fill();
      }
      g.lineWidth = 2;
      g.beginPath();
      if (combo > 0) g.arc(0, 6, 2.6, 0, 6.2832); else g.arc(0, 5, 3, 0.2, Math.PI - 0.2);
      g.stroke();
    }
    g.restore();
  }

  function drawWarns(g) {
    for (const w of warns) {
      if (w.t < 0) continue;
      const pulse = 0.5 + 0.5 * Math.sin(w.t * 22);
      g.save();
      g.globalAlpha = 0.35 + 0.4 * pulse;
      g.fillStyle = '#ff4f8b';
      if (w.kind === 'ring') {
        g.lineWidth = 10; g.strokeStyle = '#ff4f8b';
        g.strokeRect(5, 5, W - 10, H - 10);
      } else if (w.kind === 'sweep') {
        const bar = 26;
        if (w.side === 0) g.fillRect(0, 0, W, bar);
        else if (w.side === 2) g.fillRect(0, H - bar, W, bar);
        else if (w.side === 1) g.fillRect(W - bar, 0, bar, H);
        else g.fillRect(0, 0, bar, H);
      } else {
        const bar = 90;
        if (w.side === 0) g.fillRect(W / 2 - bar, 0, bar * 2, 16);
        else if (w.side === 2) g.fillRect(W / 2 - bar, H - 16, bar * 2, 16);
        else if (w.side === 1) g.fillRect(W - 16, H / 2 - bar, 16, bar * 2);
        else g.fillRect(0, H / 2 - bar, 16, bar * 2);
      }
      g.restore();
      const label = w.kind === 'ring' ? 'まわりに注意！' : w.kind === 'sweep' ? 'すきまをさがせ！' : 'ねらい撃ち！';
      outlinedText(g, '！ ' + label, W / 2, H / 2 - 40, 30, '#fff', 0.9, '#ff4f8b');
    }
  }

  function drawHud(g) {
    outlinedText(g, (self.score / 1000).toFixed(1) + ' 秒', 16, 16, 34, '#fff', 1, INK, 'left');
    if (combo > 1) outlinedText(g, 'コンボ ×' + combo, W - 16, 64, 22, '#ffc233', 1, INK, 'right');
    outlinedText(g, 'ベスト ' + (env.best ? (env.best / 1000).toFixed(1) : '--'), 16, 60, 16, '#fff', 1, INK, 'left');
    if (hurt > 0) { g.fillStyle = 'rgba(255,79,139,' + hurt * 0.25 + ')'; g.fillRect(0, 0, W, H); }
  }

  function outlinedText(g, text, x, y, size, fill, alpha = 1, stroke = INK, align = 'center') {
    g.save();
    g.globalAlpha = alpha;
    g.font = '800 ' + size + 'px "Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Hiragino Sans",sans-serif';
    g.textAlign = align;
    g.textBaseline = align === 'center' ? 'middle' : 'top';
    g.lineJoin = 'round';
    g.lineWidth = Math.max(4, size / 5);
    g.strokeStyle = stroke;
    g.strokeText(text, x, y);
    g.fillStyle = fill;
    g.fillText(text, x, y);
    g.restore();
  }

  // 開始の音（最初の操作の前は鳴らない）
  audio.tone({ f: 392, dur: 0.08, type: 'square', vol: 0.12 });
  audio.tone({ f: 587, dur: 0.14, type: 'square', vol: 0.12, delay: 0.08 });
  return self;
}

const controller = startGame({
  id: 'ball-dodge',
  title: 'BALL DODGE',
  tagline: '飛んでくるボールを、ひたすら避けろ！',
  controls: ['PC：矢印キー／WASD で移動', 'スマホ：画面をなぞって移動', 'ギリギリで避けるとコンボ！　M：ミュート'],
  width: W,
  height: H,
  scoreOrder: 'high',
  formatScore: (ms) => (ms / 1000).toFixed(2) + ' 秒',
  bgm: BGM,
  theme: {
    page: '#fff3d6',
    font: '"Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Hiragino Sans","Noto Sans JP",sans-serif',
    overlay: 'rgba(255,243,214,0.88)',
    text: '#2b2350',
    muted: '#5a4f8a',
    accent: '#e6256f',
    danger: '#e6256f',
    'btn-border': '3px solid #2b2350',
    'primary-bg': '#e6256f',
    'primary-fg': '#ffffff',
    'primary-hover': '#c91d5e',
    'primary-shadow': '0 5px 0 #2b2350',
    'mute-bg': 'rgba(255,255,255,0.8)',
    'mute-fg': '#2b2350',
  },
  create,
});

// 自動テスト用（?botcheck=1）：ボットでバランスを検査する。通常のプレイでは読み込まれない
if (/[?&](botcheck|shot)=/.test(location.search)) {
  import('./bot.js').then((m) => m.run(controller));
}
