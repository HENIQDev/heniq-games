// CROWD SPRINT（3D 版）：最後尾から、800 人が走る 3D の大行列を駆け抜ける 100m 走。スコアは「ゴールしたときの順位」（小さいほど良い）。
// ルールと順位の計算は sim.js（2D 比較版と同一）。ここは 3D の描画（gl/renderer.js）・カメラ・入力・音・HUD。
import { startGame } from '../platform/core/runtime.js';
import { createRng } from '../platform/core/rng.js';
import { createSim, GOAL, FIELD_HALF, M, RUNNERS, P, ST } from './sim.js';
import { createRenderer } from './gl/renderer.js';

const W = 480;
const H = 720;
const INK = '#2b2350';
const SHIRT_HEX = ['#ff6b6b', '#4dabf7', '#ffd43b', '#51cf66', '#cc5de8', '#ff922b'];
const BTN = { dash: { x: 70, y: 626, r: 50 }, jump: { x: 410, y: 626, r: 50 } };
const QUERY = new URLSearchParams(location.search);
const SHOW_PERF = QUERY.has('perf') || QUERY.has('bench');
const FIXED_SCALE = QUERY.get('scale') ? Math.min(1, Math.max(0.3, Number(QUERY.get('scale')))) : null;

// ページに 1 つのレンダラーと、動的な解像度（リトライしても引き継ぐ）
let renderer = null;
const res = { scale: FIXED_SCALE || 1, slow: 0, fast: 0, cssW: 0, cssH: 0, dpr: 1 };

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
  if (rank <= 3) return '表彰台！ TOP 3';
  if (rank <= 10) return 'TOP 10';
  if (rank <= 50) return 'TOP 50';
  if (rank <= 100) return 'TOP 100';
  if (rank <= 200) return 'TOP 200';
  if (rank <= 400) return '上位半分';
  return '完走';
}
const digits = (n) => String(n).length;
const fmtRank = (n) => Math.round(n).toLocaleString('ja-JP');
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function create(env) {
  const { rng, input, audio, reducedMotion, runCount, gl, glCanvas, stats } = env;
  const vr = createRng((rng.seed ^ 0x51ed270b) >>> 0);        // 見た目だけの乱数（進行には影響しない）
  if (gl && !renderer) renderer = createRenderer(gl);
  const sim = createSim(rng);
  const p = sim.player;
  const fx = [];
  // アニメーション用の状態（描画のためだけ。ルールには影響しない）
  const phase = new Float32Array(M);
  for (let i = 0; i < M; i++) phase[i] = vr.range(0, 6.28);
  let pPhase = 0;
  let cd = runCount > 1 ? 1.5 : 3.2;
  const cd0 = cd;
  let lastBeep = Math.ceil(cd);
  let camX = 0, camBack = 7.5, camFov = 62, camShake = 0, flash = 0, finishCam = 0, fallCam = 0;
  let dispRank = sim.rank;
  let lastDigits = digits(sim.rank);
  let dragStart = null;
  let wasDash = false;
  let lastOvertakeSfx = -1, lastNpcSfx = -1;
  let hintT = 7;
  let simTime = 0;
  input.setZones([{ name: 'dash', shape: 'circle', ...BTN.dash }, { name: 'jump', shape: 'circle', ...BTN.jump }]);

  const self = {
    isOver: false,
    get score() { return sim.finished ? sim.finalRank : sim.rank; },
    get sim() { return sim; },
    get simTime() { return sim.t; },
    get countdown() { return cd; },
    get renderer() { return renderer; },
    poseOf(i) { return { ...poseOf(i) }; },       // 検証用：アニメーションの姿勢（前傾・振り・腕上げ）
    playerPose() { return { ...playerPose() }; },
    get resultLines() {
      return [medalOf(sim.finalRank), 'タイム ' + sim.finishTime.toFixed(2) + ' 秒', '追い抜いた人 ' + (RUNNERS - sim.finalRank) + ' 人（全 ' + RUNNERS + ' 人中）'];
    },

    update(dt) {
      simTime += dt;
      hintT -= dt;
      if (cd > 0) {
        cd -= dt;
        const n = Math.ceil(cd);
        if (n < lastBeep) { lastBeep = n; if (n > 0) audio.tone({ f: 440, dur: 0.12, type: 'square', vol: 0.14 }); }
        if (cd <= 0) audio.tone({ f: 880, dur: 0.3, type: 'square', vol: 0.16 });
        input.clearPressed();
        animate(dt);
        return;
      }
      sim.step(dt, readInput());
      handleEvents();
      animate(dt);
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
      if (sim.finished && sim.finishT > 1.8) self.isOver = true;
    },

    // ---- 3D：カメラとランナーを renderer へ渡して描く ----
    onResize(cssW, cssH, dpr) { res.cssW = cssW; res.cssH = cssH; res.dpr = Math.min(dpr, 2); applyScale(); },
    restoreGL(newGl) { renderer = createRenderer(newGl); },
    drawGL() {
      if (!renderer) return;
      const aspect = (glCanvas.width || 1) / (glCanvas.height || 1);
      // カメラ：後ろ上から追いかける。ダッシュで視野が広がり、転ぶと引き、ゴール後は回り込む
      const speedK = Math.min(1, p.v / 9.2);
      const tCd = cd > 0 ? smooth(1 - cd / cd0) : 1;
      let eyeX = camX, eyeY = 4.9 + 0.5 * fallCam, eyeZ = p.z - camBack;
      let tx = camX * 0.92, ty = 0.9, tz = p.z + 7;
      if (cd > 0) {                                  // 開始前：群衆を見渡す（上から後ろへ）
        eyeY += (1 - tCd) * 5; eyeZ -= (1 - tCd) * 9; tz = p.z + 9 + (1 - tCd) * 8;
      }
      if (sim.finished && finishCam > 0) {           // ゴール後：主人公の前へ回り込む
        const a = smooth(finishCam / 1.6) * 2.6;
        eyeX = p.x + Math.sin(a) * 7; eyeZ = p.z - Math.cos(a) * 7; eyeY = 2.6 + a * 0.4; tx = p.x; ty = 1.3; tz = p.z;
      }
      if (camShake > 0 && !reducedMotion) { eyeX += vr.range(-camShake, camShake) * 0.05; eyeY += vr.range(-camShake, camShake) * 0.05; }
      renderer.setCamera(eyeX, eyeY, eyeZ, tx, ty, tz, camFov, aspect);
      renderer.begin();
      for (let i = 0; i < M; i++) {
        if (sim.st[i] === ST.ABSENT) continue;                 // 主人公の枠（NPC ではない）
        const a = poseOf(i);
        renderer.runner(sim.x[i], 0, sim.z[i], a.yaw, phase[i], a.pitch, a.amp, a.up, 0, sim.col[i], 1 + (i % 7) * 0.012 - 0.04, 0, a.roll);
        if (sim.st[i] === ST.FALLEN) renderer.ring(sim.x[i], sim.z[i], 0.95, 2);       // 転んだ人の危険ゾーン
      }
      const pa = playerPose();
      renderer.runner(p.x, pa.lift, p.z, pa.yaw, pPhase, pa.pitch, pa.amp, pa.up, pa.tuck, 6, 1.04, 1, pa.roll);
      renderer.ring(p.x, p.z, 1.0 + 0.06 * Math.sin(simTime * 8));
      renderer.draw();
    },

    // ---- HUD（3D の上に重ねる 2D）----
    draw(g) {
      g.clearRect(0, 0, W, H);
      if (runCount === 0 || QUERY.has('nohud')) return;   // タイトル画面の背景：3D の景色だけ（HUD やカウントダウンは出さない）。?nohud は計測用
      g.save();
      if (p.dashing && !reducedMotion) drawSpeedLines(g);
      for (const f of fx) { g.globalAlpha = Math.max(0, Math.min(1, f.life * 3)); g.fillStyle = f.color; g.fillRect(f.x, f.y, f.size, f.size); }
      g.globalAlpha = 1;
      g.restore();
      if (renderer && cd <= 0 && !sim.finished) {                  // 主人公の頭の上の目印（人混みで見失わないように）
        const pt = renderer.project(p.x, 2.35 + p.jumpT * 0, p.z, W, H);
        if (pt) {
          const by = pt[1] - 6 - 3 * Math.sin(simTime * 8);
          g.fillStyle = '#25a8ff'; g.strokeStyle = INK; g.lineWidth = 3;
          g.beginPath(); g.moveTo(pt[0] - 10, by - 14); g.lineTo(pt[0] + 10, by - 14); g.lineTo(pt[0], by); g.closePath(); g.fill(); g.stroke();
        }
      }
      drawHud(g);
      if (SHOW_PERF) drawPerf(g);
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
  function handleEvents() {
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
        if (sim.t - lastOvertakeSfx > 0.1) { lastOvertakeSfx = sim.t; audio.tone({ f: 740, dur: 0.05, type: 'triangle', vol: 0.07 }); }
      } else if (e.type === 'goal') {
        [523, 659, 784, 1047].forEach((f, i) => audio.tone({ f, dur: 0.22, type: 'square', vol: 0.15, delay: i * 0.11 }));
        audio.noise({ dur: 1.4, f: 1800, q: 0.6, vol: 0.12 });
        for (let k = 0; k < (reducedMotion ? 10 : 70); k++) fx.push({ x: vr.range(0, W), y: vr.range(-40, 0), vx: vr.range(-40, 40), vy: vr.range(60, 200), g: 40, life: vr.range(1.2, 2.2), size: vr.range(5, 10), color: SHIRT_HEX[vr.int(0, 5)] });
      } else if ((e.type === 'npcfall' || e.type === 'chain' || e.type === 'crowdfall') && near(e) && sim.t - lastNpcSfx > 0.15) {
        lastNpcSfx = sim.t;
        audio.tone({ f: 330, to: 140, dur: 0.12, type: 'triangle', vol: 0.06 });
      }
    }
    sim.events.length = 0;
    if (p.dashing && !wasDash) audio.noise({ dur: 0.28, f: 700, to: 3200, q: 0.8, vol: 0.12 });
    wasDash = p.dashing;
  }

  // ---------------------------------------------------------------- アニメーションの状態（見た目だけ）
  const poseTmp = { yaw: 0, pitch: 0, amp: 0, up: 0, roll: 0 };
  function animate(dt) {
    for (let i = 0; i < M; i++) {
      const s = sim.st[i];
      const v = s === ST.RUN ? Math.max(0, sim.vz[i]) : 0;
      phase[i] += dt * 6.2832 * (1.7 + 0.22 * v);
    }
    pPhase += dt * 6.2832 * (1.7 + 0.22 * Math.max(0, p.v));
    camX += (p.x - camX) * Math.min(1, dt * 6);
    const dashK = p.dashing ? 1 : 0;
    camFov += ((62 + 9 * dashK + 3 * Math.min(1, p.v / 9.2)) - camFov) * Math.min(1, dt * 4);
    camBack += ((7.4 + 0.12 * p.v + 1.4 * dashK) - camBack) * Math.min(1, dt * 3);
    fallCam += ((p.fallT > 0 ? 1 : 0) - fallCam) * Math.min(1, dt * 4);
    if (sim.finished) finishCam += dt; else finishCam = 0;
  }
  function poseOf(i) {
    const o = poseTmp;
    const s = sim.st[i];
    o.yaw = Math.max(-0.35, Math.min(0.35, sim.vx[i] * 0.14));
    o.roll = 0;
    const side = (i & 1) ? 1 : -1;                                   // 倒れる向き（人によって左右が違う）
    if (s === ST.RUN) {
      const v = Math.max(0, sim.vz[i]);
      o.pitch = 0.1 + 0.03 * v; o.amp = Math.min(1, 0.25 + 0.14 * v); o.up = 0;
    } else if (s === ST.STUMBLE) {
      const t = smooth(1 - sim.tm[i] / 0.6);
      o.pitch = 0.12 + 0.35 * t; o.amp = 0.5; o.up = t; o.roll = side * 0.35 * t;
    } else if (s === ST.FALLEN) {
      const t = 1 - sim.tm[i] / 1.6;
      const k = smooth(t / 0.14);
      o.pitch = lerp(0.47, 0.25, k); o.roll = side * lerp(0.35, 1.5, k); o.amp = 0.1; o.up = lerp(1, 0.6, k);
    } else {
      const t = smooth(1 - sim.tm[i] / 0.5);
      o.pitch = 0.25 * (1 - t); o.roll = side * 1.5 * (1 - t); o.amp = 0.3 * t; o.up = 0.4 * (1 - t);
    }
    return o;
  }
  const pTmp = { yaw: 0, pitch: 0, amp: 0, up: 0, tuck: 0, lift: 0, roll: 0 };
  function playerPose() {
    const o = pTmp;
    o.yaw = Math.max(-0.35, Math.min(0.35, p.vx * 0.1)); o.tuck = 0; o.lift = 0; o.up = 0; o.roll = 0;
    o.amp = Math.min(1.15, 0.25 + 0.14 * Math.max(0, p.v));
    o.pitch = 0.1 + 0.03 * p.v + (p.dashing ? 0.22 : 0);
    if (p.fallT > 0) {
      const t = 1 - p.fallT / 1.2;
      const k = p.fallT < 0.3 ? smooth(p.fallT / 0.3) : smooth(t / 0.15);
      o.pitch = 0.25 * k + 0.2 * (1 - k); o.roll = 1.5 * k; o.amp = 0.1; o.up = 0.5;
    } else if (p.jumpT > 0) {
      const prog = 1 - p.jumpT / P.jumpTime;
      o.lift = Math.sin(Math.PI * prog) * P.jumpH; o.tuck = Math.sin(Math.PI * prog); o.up = 0.35 * o.tuck;
    } else if (p.bumpT > 0.15) {
      o.pitch += 0.28 * (p.bumpT / 0.35); o.up = 0.4;
    }
    if (sim.finished) { o.amp *= Math.max(0.2, 1 - sim.finishT * 0.5); o.up = 0.9 * smooth(sim.finishT * 2); o.pitch = 0.05; }
    return o;
  }

  // ---------------------------------------------------------------- HUD
  function drawSpeedLines(g) {
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      const a = vr.range(0, 6.28), r0 = vr.range(210, 260), r1 = r0 + vr.range(60, 130);
      g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * r0, 420 + Math.sin(a) * r0 * 1.2); g.lineTo(W / 2 + Math.cos(a) * r1, 420 + Math.sin(a) * r1 * 1.2); g.stroke();
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
    text(g, '/ ' + RUNNERS + ' 人', W / 2 + 150, 28, 14, '#fff', INK, 'center');
    text(g, 'RANK', W / 2, 16, 13, '#fff');
    const bx = 60, bw = 360, by = 100;
    g.fillStyle = 'rgba(43,35,80,0.55)'; g.fillRect(bx, by, bw, 10);
    const zf = (zz) => bx + Math.max(0, Math.min(1, (zz - (-34)) / (GOAL + 34))) * bw;
    g.fillStyle = '#ff9f1c'; g.beginPath(); g.arc(zf(sim.leaderZ), by + 5, 6, 0, 6.28); g.fill();
    g.fillStyle = '#25a8ff'; g.beginPath(); g.arc(zf(p.z), by + 5, 7, 0, 6.28); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(bx, by, bw, 10);
    text(g, 'GOAL', bx + bw + 2, by - 10, 11, '#fff', INK, 'right');
    text(g, Math.max(0, GOAL - p.z).toFixed(0) + ' m', W / 2, by + 24, 18, '#fff');
    text(g, sim.finished ? sim.finishTime.toFixed(2) : sim.t.toFixed(1), 14, 18, 20, '#fff', INK, 'left');
    for (let k = 0; k < 3; k++) { g.fillStyle = p.stagger > k * (5 / 3) ? '#e6256f' : 'rgba(255,255,255,0.45)'; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(22 + k * 20, 46, 7, 0, 6.28); g.fill(); g.stroke(); }
    const low = p.exhaust > 0 || p.stam < 20;
    bar(g, 20, H - 22, W - 40, 12, p.stam / 100, p.exhaust > 0 ? '#9a9a9a' : low ? '#ff7a2f' : '#ffd43b');
    text(g, p.exhaust > 0 ? '息切れ！' : p.draft ? 'ドラフト！' : 'STAMINA', 30, H - 36, 12, '#fff', INK, 'left');
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
    if (cd > 0) {
      const n = Math.ceil(cd);
      text(g, n > 3 ? '3' : String(n), W / 2, 330, 150, '#ffd43b');
      text(g, '最後尾から、1 位へ！', W / 2, 430, 26, '#fff');
    } else if (sim.t < 0.7) {
      text(g, 'GO!', W / 2, 330, 120, '#4cd964');
    }
    if (sim.finished) text(g, 'GOAL!', W / 2, 300, 100, '#ffd43b');
  }
  function drawPerf(g) {
    const s = stats.get(), r = renderer ? renderer.stats : null;
    const lines = [
      'FPS ' + s.fps.toFixed(1) + '  dt ' + s.dtAvg.toFixed(1) + '/' + s.dtP95.toFixed(1) + ' ms (avg/p95)',
      'CPU ' + s.cpuAvg.toFixed(2) + ' ms  GPU ' + (r && r.gpuMs != null ? r.gpuMs.toFixed(2) + ' ms' : 'n/a'),
      'scale ' + res.scale.toFixed(2) + '  dpr ' + res.dpr + '  px ' + (glCanvas ? glCanvas.width + 'x' + glCanvas.height : '-'),
      r ? 'draw ' + r.drawCalls + '  tri ' + Math.round(r.triangles / 1000) + 'k  LOD ' + r.instances.join('/') + '  cull ' + r.culled : '',
      'input→frame ' + s.latAvg.toFixed(1) + ' ms',
    ];
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(4, 128, 250, lines.length * 15 + 8);
    g.fillStyle = '#9fffb0'; g.font = '11px ui-monospace, Menlo, monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
    lines.forEach((t, k) => g.fillText(t, 8, 132 + k * 15));
    g.restore();
  }

  // 動的な解像度：遅いときは下げ、余裕があれば戻す（?scale=0.75 で固定できる）
  function adaptScale() {
    if (FIXED_SCALE || cd > 0) return;
    const s = stats.get();
    if (s.frames < 30) return;
    if (s.dtAvg > 19 && !(s.dtAvg > 30 && s.dtAvg < 37)) { res.slow += 1; res.fast = 0; } else if (s.dtAvg < 13.5) { res.fast += 1; res.slow = 0; } else { res.slow = 0; res.fast = 0; }
    if (res.slow >= 20) { res.scale = Math.max(0.5, res.scale * 0.88); res.slow = 0; stats.reset(); applyScale(); }
    else if (res.fast >= 240 && res.scale < 1) { res.scale = Math.min(1, res.scale * 1.08); res.fast = 0; stats.reset(); applyScale(); }
  }
  const baseUpdate = self.update;
  self.update = (dt) => { baseUpdate(dt); adaptScale(); };

  return self;
}

function applyScale() {
  const c = document.querySelector('.hg-gl');
  if (!c || !res.cssW) return;
  const w = Math.max(2, Math.round(res.cssW * res.dpr * res.scale)), h = Math.max(2, Math.round(res.cssH * res.dpr * res.scale));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; if (renderer) renderer.resize(w, h); }
}

const controller = startGame({
  id: 'crowd-sprint-3d',
  title: 'CROWD SPRINT',
  tagline: '最後尾から、1 位へ。800 人が走る 3D の大行列。',
  overTitle: 'GOAL!',
  controls: ['PC：← → 移動　Shift ダッシュ　Space ジャンプ', 'スマホ：なぞって移動／DASH・JUMP ボタン', '人にぶつかるとよろける。転んだ人は飛び越えよう'],
  width: W,
  height: H,
  scoreOrder: 'low',
  formatScore: (r) => fmtRank(r) + ' 位',
  bgm: BGM,
  gl: { preserve: QUERY.has('shot') || QUERY.has('gltest') },
  theme: {
    page: '#0d1b3a',
    font: '"Hiragino Maru Gothic ProN","Arial Rounded MT Bold","Hiragino Sans","Noto Sans JP",sans-serif',
    overlay: 'rgba(13,27,58,0.72)',
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

if (/[?&](botcheck|shot|bench|gltest|cpubench|scenario|soak)=/.test(location.search)) {
  import('./bot.js').then((m) => m.run(controller));
}
