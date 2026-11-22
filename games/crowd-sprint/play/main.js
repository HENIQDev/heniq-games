// CROWD SPRINT：最後尾から、大行列の 100m 走。スコアは「ゴールしたときの順位」（小さいほど良い）。
// 疑似 3D（Canvas 2D のスプライトを奥行きで拡縮）。シミュレーションは sim.js（決定性）、ここは描画・入力・音。
import { startGame } from '../platform/core/runtime.js';
import { createRng } from '../platform/core/rng.js';
import { createSim, GOAL, FIELD_HALF, M, CROWD_TOTAL, P } from './sim.js';
import { buildAtlas, CELL_W, CELL_H, SHIRTS, POSES } from './sprites.js';

const W = 480;
const H = 720;
const F = 165;            // 焦点距離（px・m 換算）
const CAM_H = 11;         // カメラの高さ（m）
const Y0 = 230;           // 地平線の y
const CAM_BACK = 5.5;     // プレイヤーの後ろ（m）
const SPR_H = 1.9;        // ランナーの高さ（m）
const INK = '#2b2350';
const SKYLINE = (() => {
  const r = createRng(20261122);
  const out = [];
  for (let x = 0; x < W + 40; x += 0) { const w = r.range(18, 44); out.push({ x, w, h: r.range(14, 58), c: ['#b9d3ee', '#a9c7e6', '#c8dcf2'][r.int(0, 2)] }); x += w - 2; }
  return out;
})();
const BTN = { dash: { x: 70, y: 626, r: 50 }, jump: { x: 410, y: 626, r: 50 } };

let atlas = null;

const BGM = {
  bpm: 156,
  notes: [659, 0, 784, 0, 880, 784, 0, 659, 587, 0, 698, 0, 784, 698, 0, 587,
          659, 0, 784, 0, 988, 880, 0, 784, 880, 0, 784, 0, 659, 587, 0, 523],
  bass: [131, 131, 175, 196],
  step(i, audio) {
    const s = i % 8;
    if (s === 0 || s === 3 || s === 4) audio.tone({ f: 150, to: 45, dur: 0.12, type: 'sine', vol: 0.3 });
    if (s % 2 === 1) audio.noise({ dur: 0.04, f: 7000, q: 0.7, vol: 0.05, type: 'highpass' });
    if (s === 2 || s === 6) audio.noise({ dur: 0.09, f: 1800, q: 0.8, vol: 0.08 });
  },
};

function medalOf(rank) {
  if (rank <= 1) return '優勝！ 1 位';
  if (rank <= 10) return 'TOP 10';
  if (rank <= 100) return 'TOP 100';
  if (rank <= 1000) return 'TOP 1,000';
  if (rank <= 10000) return 'TOP 1 万';
  if (rank <= 100000) return 'TOP 10 万';
  if (rank <= 1000000) return 'TOP 100 万';
  return '完走';
}
const digits = (n) => String(n).length;
const fmtRank = (n) => Math.round(n).toLocaleString('ja-JP');

function create(env) {
  const { rng, input, audio, reducedMotion, runCount } = env;
  const vr = createRng((rng.seed ^ 0x51ed270b) >>> 0);        // 見た目だけの乱数（進行には影響しない）
  if (!atlas) atlas = buildAtlas();
  const sim = createSim(rng);
  const p = sim.player;
  const order = new Uint16Array(M);
  for (let i = 0; i < M; i++) order[i] = i;
  const fx = [];
  let cd = runCount > 1 ? 1.5 : 3.2;
  let lastBeep = Math.ceil(cd);
  let camX = 0, camShake = 0, flash = 0;
  let dispRank = sim.rank;
  let lastDigits = digits(sim.rank);
  let dragStart = null;
  let wasDash = false;
  let lastOvertakeSfx = -1, lastNpcSfx = -1;
  let hintT = 7;
  input.setZones([{ name: 'dash', shape: 'circle', ...BTN.dash }, { name: 'jump', shape: 'circle', ...BTN.jump }]);

  const self = {
    isOver: false,
    get score() { return sim.finished ? sim.finalRank : sim.rank; },
    get sim() { return sim; },
    get simTime() { return sim.t; },
    get countdown() { return cd; },
    get resultLines() {
      return [medalOf(sim.finalRank), 'タイム ' + sim.finishTime.toFixed(2) + ' 秒', '追い抜いた人 ' + fmtRank(Math.max(0, CROWD_TOTAL - sim.finalRank)) + ' 人'];
    },

    update(dt) {
      hintT -= dt;
      if (cd > 0) {
        cd -= dt;
        const n = Math.ceil(cd);
        if (n < lastBeep) { lastBeep = n; if (n > 0) audio.tone({ f: 440, dur: 0.12, type: 'square', vol: 0.14 }); }
        if (cd <= 0) audio.tone({ f: 880, dur: 0.3, type: 'square', vol: 0.16 });
        input.clearPressed();
        return;
      }
      sim.step(dt, readInput());
      handleEvents(dt);
      // カメラと表示用の値
      camX += (p.x - camX) * Math.min(1, dt * 6);
      camShake = Math.max(0, camShake - dt * 24);
      flash = Math.max(0, flash - dt * 3);
      const shown = sim.finished ? sim.finalRank : sim.rank;
      const dl = Math.log(dispRank), tl = Math.log(shown);
      dispRank = Math.exp(dl + (tl - dl) * Math.min(1, dt * 9));
      if (Math.abs(Math.log(dispRank / shown)) < 0.002) dispRank = shown;
      const dg = digits(shown);
      if (dg < lastDigits) {
        lastDigits = dg;
        flash = 1;
        audio.tone({ f: 523, dur: 0.08, type: 'square', vol: 0.12 });
        audio.tone({ f: 659, dur: 0.08, type: 'square', vol: 0.12, delay: 0.07 });
        audio.tone({ f: 784, dur: 0.14, type: 'square', vol: 0.12, delay: 0.14 });
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += f.g * dt;
        if (f.life <= 0) fx.splice(i, 1);
      }
      if (p.dashing && !reducedMotion && vr.next() < 0.5) fx.push({ x: W / 2 + vr.range(-14, 14), y: 566, vx: vr.range(-30, 30), vy: vr.range(-40, -10), g: 0, life: 0.35, size: 4, color: '#f3d9a8' });
      if (sim.finished && sim.finishT > 1.6) self.isOver = true;
    },

    draw(g) {
      g.save();
      if (camShake > 0 && !reducedMotion) g.translate(vr.range(-camShake, camShake), vr.range(-camShake, camShake));
      drawWorld(g);
      drawCrowd(g);
      drawHaze(g);
      for (const f of fx) { g.globalAlpha = Math.max(0, Math.min(1, f.life * 3)); g.fillStyle = f.color; g.fillRect(f.x, f.y, f.size, f.size); }
      g.globalAlpha = 1;
      if (p.dashing && !reducedMotion) drawSpeedLines(g);
      g.restore();
      drawHud(g);
    },
  };

  // ---------------------------------------------------------------- 入力
  function readInput() {
    let axis = 0;
    const a = input.axis();
    if (a.x !== 0) axis = a.x;
    if (input.pointer.active) {
      if (dragStart === null) dragStart = input.pointer.x;
      let d = input.pointer.x - dragStart;
      if (Math.abs(d) > 48) { dragStart += d - Math.sign(d) * 48; d = Math.sign(d) * 48; }
      if (a.x === 0) axis = d / 48;
    } else dragStart = null;
    const dash = input.isDown('ShiftLeft') || input.isDown('ShiftRight') || input.zoneDown('dash');
    const jump = input.wasPressed('Space') || input.wasPressed('KeyZ') || input.zonePressed('jump');
    return { axis, dash, jump };
  }

  function near(e) { return Math.abs(e.z - p.z) < 14 && Math.abs(e.x - p.x) < 9; }
  function handleEvents(dt) {
    void dt;
    for (const e of sim.events) {
      if (e.type === 'bump') {
        audio.noise({ dur: 0.12, f: 320, q: 0.8, vol: 0.3 });
        audio.tone({ f: 140, to: 60, dur: 0.14, type: 'sine', vol: 0.25 });
        camShake = e.dash ? 7 : 4;
      } else if (e.type === 'trip' || e.type === 'fall') {
        audio.tone({ f: 520, to: 110, dur: 0.45, type: 'sawtooth', vol: 0.18 });
        audio.noise({ dur: 0.2, f: 500, vol: 0.25 });
        camShake = 9;
        for (let k = 0; k < 14 && !reducedMotion; k++) fx.push({ x: W / 2, y: 540, vx: vr.range(-90, 90), vy: vr.range(-160, -30), g: 420, life: 0.6, size: 5, color: '#ffd43b' });
      } else if (e.type === 'jump') {
        audio.tone({ f: 360, to: 760, dur: 0.16, type: 'square', vol: 0.1 });
      } else if (e.type === 'exhaust') {
        audio.tone({ f: 170, to: 120, dur: 0.35, type: 'sawtooth', vol: 0.14 });
      } else if (e.type === 'overtake') {
        if (sim.t - lastOvertakeSfx > 0.1) {
          lastOvertakeSfx = sim.t;
          audio.tone({ f: 740, dur: 0.05, type: 'triangle', vol: 0.07 });
        }
      } else if (e.type === 'goal') {
        [523, 659, 784, 1047].forEach((f, i) => audio.tone({ f, dur: 0.22, type: 'square', vol: 0.15, delay: i * 0.11 }));
        audio.noise({ dur: 1.4, f: 1800, q: 0.6, vol: 0.12 });
        for (let k = 0; k < (reducedMotion ? 10 : 70); k++) fx.push({ x: vr.range(0, W), y: vr.range(-40, 0), vx: vr.range(-40, 40), vy: vr.range(60, 200), g: 40, life: vr.range(1.2, 2.2), size: vr.range(5, 10), color: SHIRTS[vr.int(0, 5)] });
      } else if ((e.type === 'npcfall' || e.type === 'chain' || e.type === 'crowdfall') && near(e) && sim.t - lastNpcSfx > 0.15) {
        lastNpcSfx = sim.t;
        audio.tone({ f: 330, to: 140, dur: 0.12, type: 'triangle', vol: 0.06 });
      }
    }
    sim.events.length = 0;
    if (p.dashing && !wasDash) audio.noise({ dur: 0.28, f: 700, to: 3200, q: 0.8, vol: 0.12 });
    wasDash = p.dashing;
  }

  // ---------------------------------------------------------------- 描画
  const camZ = () => p.z - CAM_BACK;
  function ground(zz) { return Y0 + (CAM_H * F) / (zz - camZ()); }

  function drawWorld(g) {
    const cz = camZ();
    const sky = g.createLinearGradient(0, 0, 0, Y0);
    sky.addColorStop(0, '#8fd0ff'); sky.addColorStop(1, '#e8f7ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, Y0 + 1);
    // 雲（ゆっくり流れる）と遠くの街並み
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let k = 0; k < 4; k++) {
      const cx = ((k * 150 + sim.t * 6) % (W + 160)) - 80, cy = 60 + (k % 2) * 40 + k * 14;
      g.beginPath(); g.ellipse(cx, cy, 46, 14, 0, 0, 6.2832); g.ellipse(cx + 24, cy - 8, 30, 12, 0, 0, 6.2832); g.fill();
    }
    for (const b of SKYLINE) { g.fillStyle = b.c; g.fillRect(b.x, Y0 - b.h, b.w, b.h + 1); }
    g.fillStyle = '#6fcf6a'; g.fillRect(0, Y0, W, H - Y0);
    const zNear = cz + 1.2, zFar = cz + 90;
    const x0 = (x, zz) => W / 2 + (x - camX) * (F / (zz - cz));
    // 5m ごとの帯（走っている速さが分かる）
    const start = Math.floor(zNear / 5) * 5;
    for (let zz = start; zz < zFar; zz += 5) {
      const a = Math.max(zz, zNear), b = zz + 5;
      const ya = ground(a), yb = ground(b);
      g.fillStyle = (zz / 5) % 2 === 0 ? '#e0894a' : '#d97b3b';
      g.beginPath();
      g.moveTo(x0(-FIELD_HALF, a), ya); g.lineTo(x0(FIELD_HALF, a), ya);
      g.lineTo(x0(FIELD_HALF, b), yb); g.lineTo(x0(-FIELD_HALF, b), yb);
      g.closePath(); g.fill();
    }
    // レーンの線
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    for (let k = -4; k <= 4; k++) {
      const lx = k * (FIELD_HALF / 4);
      g.lineWidth = Math.abs(k) === 4 ? 3 : 1;
      g.beginPath(); g.moveTo(x0(lx, zNear), ground(zNear)); g.lineTo(x0(lx, zFar), ground(zFar)); g.stroke();
    }
    // 柵
    g.fillStyle = '#fff';
    for (let zz = start; zz < zFar; zz += 5) {
      if (zz < zNear) continue;
      const s = F / (zz - cz), y = ground(zz);
      for (const sx of [-FIELD_HALF - 0.4, FIELD_HALF + 0.4]) g.fillRect(x0(sx, zz) - s * 0.08, y - s * 1.0, s * 0.16, s * 1.0);
    }
    // スタートラインとゴール
    band(g, 0, 0.35, '#fff', x0);
    if (GOAL - cz < 95) {
      for (let k = 0; k < 20; k++) {
        const xa = -FIELD_HALF + k * 1.5;
        band(g, GOAL, 1.2, k % 2 === 0 ? '#2b2350' : '#fff', x0, xa, xa + 1.5);
      }
      const s = F / (GOAL - cz);
      if (GOAL - cz > 1.5) {
        const y = ground(GOAL), lx = x0(-FIELD_HALF, GOAL), rx = x0(FIELD_HALF, GOAL);
        g.fillStyle = '#e6256f';
        g.fillRect(lx - s * 0.3, y - s * 6, s * 0.6, s * 6); g.fillRect(rx - s * 0.3, y - s * 6, s * 0.6, s * 6);
        g.fillRect(lx, y - s * 6, rx - lx, s * 1.4);
        if (s > 2.5) text(g, 'GOAL', (lx + rx) / 2, y - s * 5.3, Math.min(60, s * 1.2), '#fff');
      }
    }
  }

  function band(g, z0, len, color, x0, xa = -FIELD_HALF, xb = FIELD_HALF) {
    const cz = camZ();
    const a = Math.max(z0, cz + 1.2), b = z0 + len;
    if (b <= a) return;
    const ya = ground(a), yb = ground(b);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x0(xa, a), ya); g.lineTo(x0(xb, a), ya); g.lineTo(x0(xb, b), yb); g.lineTo(x0(xa, b), yb);
    g.closePath(); g.fill();
  }

  function pose(i) {
    const s = sim.st[i];
    if (s === 2) return POSES.FALLEN;
    if (s === 1) return POSES.STUMBLE;
    return ((sim.t * 9 + i * 0.37) | 0) & 3;
  }

  function drawCrowd(g) {
    const cz = camZ();
    const { z, x, col } = sim;
    // 奥から手前へ。前フレームの順序から挿入ソート（ほぼ整列済みなので速い）
    for (let a = 1; a < M; a++) {
      const v = order[a];
      let b = a - 1;
      while (b >= 0 && z[order[b]] < z[v]) { order[b + 1] = order[b]; b--; }
      order[b + 1] = v;
    }
    let playerDrawn = false;
    for (let k = 0; k < M; k++) {
      const i = order[k];
      if (!playerDrawn && z[i] < p.z) { drawPlayer(g); playerDrawn = true; }
      const dz = z[i] - cz;
      if (dz < 1.3 || dz > 80) continue;
      const s = F / dz;
      const sx = W / 2 + (x[i] - camX) * s;
      if (sx < -30 || sx > W + 30) continue;
      const sy = Y0 + CAM_H * s;
      const h = SPR_H * s;
      if (h < 7) {
        g.fillStyle = SHIRTS[col[i]];
        g.fillRect(sx - h * 0.25, sy - h, Math.max(1.5, h * 0.5), Math.max(2, h));
      } else {
        const dh = h * 1.04, dw = dh * (CELL_W / CELL_H);
        g.drawImage(atlas, pose(i) * CELL_W, col[i] * CELL_H, CELL_W, CELL_H, sx - dw / 2, sy - dh, dw, dh);
        if (sim.st[i] === 0 && sim.vx[i] === 0) void 0;
      }
    }
    if (!playerDrawn) drawPlayer(g);
  }

  function drawPlayer(g) {
    const s = F / CAM_BACK;
    const sx = W / 2 + (p.x - camX) * s;
    const sy = Y0 + CAM_H * s;
    let pz = Math.floor((sim.t * (2 + p.v * 1.6)) | 0) & 3;
    let lift = 0;
    if (p.fallT > 0) pz = POSES.FALLEN;
    else if (p.jumpT > 0) { pz = POSES.JUMP; lift = Math.sin(Math.PI * (1 - p.jumpT / P.jumpTime)) * P.jumpH * s; }
    else if (p.bumpT > 0.3) pz = POSES.STUMBLE;
    const dh = SPR_H * s * 1.04, dw = dh * (CELL_W / CELL_H);
    // 足元の輪
    g.strokeStyle = '#25a8ff'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(sx, sy, s * 0.7 + 3 * Math.sin(sim.t * 8), s * 0.22, 0, 0, 6.2832); g.stroke();
    g.drawImage(atlas, pz * CELL_W, 6 * CELL_H, CELL_W, CELL_H, sx - dw / 2, sy - dh - lift, dw, dh);
    g.fillStyle = '#25a8ff';
    const ay = sy - dh - lift - 14 - 3 * Math.sin(sim.t * 8);
    g.beginPath(); g.moveTo(sx - 8, ay - 10); g.lineTo(sx + 8, ay - 10); g.lineTo(sx, ay); g.closePath(); g.fill();
    if (p.draft) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(sx + k * 14, sy - dh * 0.2); g.lineTo(sx + k * 14, sy + 24 + (k & 1) * 8); g.stroke(); } }
  }

  function drawHaze(g) {
    const h = g.createLinearGradient(0, Y0 - 30, 0, Y0 + 70);
    h.addColorStop(0, 'rgba(232,247,255,0)'); h.addColorStop(0.45, 'rgba(232,247,255,0.75)'); h.addColorStop(1, 'rgba(232,247,255,0)');
    g.fillStyle = h; g.fillRect(0, Y0 - 30, W, 100);
  }

  function drawSpeedLines(g) {
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      const a = vr.range(0, 6.28), r0 = vr.range(210, 260), r1 = r0 + vr.range(60, 130);
      g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * r0 * 1.0, 420 + Math.sin(a) * r0 * 1.2); g.lineTo(W / 2 + Math.cos(a) * r1, 420 + Math.sin(a) * r1 * 1.2); g.stroke();
    }
  }

  function text(g, str, x, y, size, fill, stroke = INK, align = 'center') {
    g.save();
    g.font = '800 ' + size + 'px "Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Hiragino Sans",sans-serif';
    g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(3, size / 5); g.strokeStyle = stroke;
    g.strokeText(str, x, y); g.fillStyle = fill; g.fillText(str, x, y);
    g.restore();
  }

  function bar(g, x, y, w, h, frac, color, back = 'rgba(43,35,80,0.55)') {
    g.fillStyle = back; g.fillRect(x, y, w, h);
    g.fillStyle = color; g.fillRect(x, y, Math.max(0, w * frac), h);
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  }

  function drawHud(g) {
    // 順位（巨大な数字）：数字の幅を測って「位」を右に並べる
    const sc = 1 + 0.25 * flash;
    const numStr = fmtRank(dispRank);
    g.save();
    g.font = '800 58px "Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Hiragino Sans",sans-serif';
    const nw = g.measureText(numStr).width;
    g.font = '800 26px "Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Hiragino Sans",sans-serif';
    const kw = g.measureText('位').width + 6;
    g.translate(W / 2, 52); g.scale(sc, sc);
    const x0 = -(nw + kw) / 2;
    text(g, numStr, x0, 0, 58, flash > 0 ? '#ffd43b' : '#fff', INK, 'left');
    text(g, '位', x0 + nw + 6, 8, 26, '#fff', INK, 'left');
    g.restore();
    text(g, 'RANK', W / 2, 16, 13, '#fff');
    // 進行バー
    const bx = 60, bw = 360, by = 100;
    g.fillStyle = 'rgba(43,35,80,0.55)'; g.fillRect(bx, by, bw, 10);
    const zf = (zz) => bx + Math.max(0, Math.min(1, (zz - (-28)) / (GOAL + 28))) * bw;
    g.fillStyle = '#ff9f1c'; g.beginPath(); g.arc(zf(sim.leaderZ), by + 5, 6, 0, 6.28); g.fill();
    g.fillStyle = '#25a8ff'; g.beginPath(); g.arc(zf(p.z), by + 5, 7, 0, 6.28); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(bx, by, bw, 10);
    text(g, 'GOAL', bx + bw + 2, by - 10, 11, '#fff', INK, 'right');
    text(g, Math.max(0, GOAL - p.z).toFixed(0) + ' m', W / 2, by + 24, 18, '#fff');
    text(g, sim.finished ? sim.finishTime.toFixed(2) : sim.t.toFixed(1), 14, 18, 20, '#fff', INK, 'left');
    // ふらつき
    for (let k = 0; k < 3; k++) { g.fillStyle = p.stagger > k ? '#e6256f' : 'rgba(255,255,255,0.45)'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(22 + k * 20, 46, 7, 0, 6.28); g.fill(); g.stroke(); }
    // スタミナ
    const low = p.exhaust > 0 || p.stam < 20;
    bar(g, 20, H - 22, W - 40, 12, p.stam / 100, p.exhaust > 0 ? '#9a9a9a' : low ? '#ff7a2f' : '#ffd43b');
    text(g, p.exhaust > 0 ? '息切れ！' : p.draft ? 'ドラフト！' : 'STAMINA', 30, H - 36, 12, '#fff', INK, 'left');
    // スマホのボタン／PC の操作ヒント
    if (input.touchSeen) {
      for (const [name, b] of Object.entries(BTN)) {
        const on = input.zoneDown(name);
        g.fillStyle = on ? '#e6256f' : 'rgba(255,255,255,0.78)';
        g.strokeStyle = INK; g.lineWidth = 4;
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.28); g.fill(); g.stroke();
        text(g, name === 'dash' ? 'DASH' : 'JUMP', b.x, b.y, 20, on ? '#fff' : INK, on ? INK : '#fff');
      }
    } else if (hintT > 0) {
      text(g, '← →：移動　Shift：ダッシュ　Space：ジャンプ', W / 2, H - 54, 16, '#fff');
    }
    // カウントダウン
    if (cd > 0) {
      const n = Math.ceil(cd);
      text(g, n > 3 ? '3' : String(n), W / 2, 330, 150, '#ffd43b');
      text(g, '最後尾から、1 位へ！', W / 2, 430, 26, '#fff');
    } else if (sim.t < 0.7) {
      text(g, 'GO!', W / 2, 330, 120, '#4cd964');
    }
    if (sim.finished) text(g, 'GOAL!', W / 2, 300, 100, '#ffd43b');
  }

  return self;
}

const controller = startGame({
  id: 'crowd-sprint',
  title: 'CROWD SPRINT 2D',
  tagline: '【比較用】Canvas 2D の疑似 3D 版',
  overTitle: 'GOAL!',
  controls: ['PC：← → 移動　Shift ダッシュ　Space ジャンプ', 'スマホ：なぞって移動／DASH・JUMP ボタン', '人にぶつかるとよろける。転んだ人は飛び越えよう'],
  width: W,
  height: H,
  scoreOrder: 'low',
  formatScore: (r) => fmtRank(r) + ' 位',
  bgm: BGM,
  theme: {
    page: '#0d1b3a',
    font: '"Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Hiragino Sans","Noto Sans JP",sans-serif',
    overlay: 'rgba(13,27,58,0.82)',
    text: '#ffffff',
    muted: '#b8c7ee',
    accent: '#ffd43b',
    danger: '#ffd43b',
    'btn-border': '3px solid #ffffff',
    'primary-bg': '#ff7a2f',
    'primary-fg': '#ffffff',
    'primary-hover': '#ff9a5a',
    'primary-shadow': '0 5px 0 #8a3a0a',
    'mute-bg': 'rgba(255,255,255,0.85)',
    'mute-fg': '#0d1b3a',
  },
  create,
});

if (/[?&](botcheck|shot|bench|diag)=/.test(location.search)) {
  import('./bot.js').then((m) => m.run(controller));
}
