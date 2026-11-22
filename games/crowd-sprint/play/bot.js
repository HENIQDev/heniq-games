// 自動検査用のボット（?botcheck=1・?bench=1・?shot=…）。通常のプレイでは読み込まれない。
// idle：何もしない／smart：人を避けて、ダッシュとジャンプを使い分ける（最上級に近い人間の代わり）。
import { ST, P } from './sim.js';

function decide(game, state) {
  const sim = game.sim, p = sim.player, x = sim.x, z = sim.z;
  // 横：前方の人から遠い向きを選ぶ
  let best = 0, bestCost = 1e9;
  for (const a of [-1, -0.5, 0, 0.5, 1]) {
    const px = Math.max(-14.5, Math.min(14.5, p.x + a * P.lat * 0.5));
    let cost = Math.abs(a) * 0.15 + (Math.abs(px) > 13.5 ? 3 : 0);
    for (let i = 0; i < sim.M; i++) {
      const dz = z[i] - p.z;
      if (dz < -0.3 || dz > 4.5) continue;
      const dx = Math.abs(x[i] - px);
      if (dx < 1.0) cost += (1.0 - dx) * (sim.st[i] === ST.FALLEN ? 1.2 : 2.5) / Math.max(0.4, dz + 0.5);
    }
    if (cost < bestCost) { bestCost = cost; best = a; }
  }
  // ダッシュ：スタミナの使い分け（0 まで使い切ると息切れで損をする）
  if (p.stam < 8) state.dash = false;
  else if (p.stam > 45) state.dash = true;
  // ジャンプ：進路上に転んだ人がいるとき
  let jump = false;
  if (p.jumpCd <= 0 && p.jumpT <= 0 && p.fallT <= 0) {
    for (let i = 0; i < sim.M; i++) {
      if (sim.st[i] !== ST.FALLEN) continue;
      const dz = z[i] - p.z;
      if (dz > 0.5 && dz < 2.4 && Math.abs(x[i] - p.x) < 0.8) { jump = true; break; }
    }
  }
  return { axis: best, dash: state.dash && p.exhaust <= 0, jump };
}

function drive(c, cmd) {
  const inj = c.input.inject;
  inj.up('ArrowLeft'); inj.up('ArrowRight');
  if (cmd.axis > 0.3) inj.down('ArrowRight');
  else if (cmd.axis < -0.3) inj.down('ArrowLeft');
  inj.zone('dash', cmd.dash);
  if (cmd.jump) inj.zone('jump', true); else inj.zone('jump', false);
}

export function play(c, mode, seed, maxSec) {
  c.start(seed);
  c.hold(true);
  const state = { dash: true };
  let frames = 0;
  while (c.state === 'playing' && frames < maxSec * 60) {
    drive(c, mode === 'smart' ? decide(c.game, state) : { axis: 0, dash: false, jump: false });
    c.step(1 / 60);
    frames += 1;
  }
  const s = c.game.sim;
  drive(c, { axis: 0, dash: false, jump: false });
  c.hold(false);
  return { rank: s.finished ? s.finalRank : s.rank, finished: s.finished, time: s.finishTime, bumps: s.bumps, falls: s.falls, overtakes: s.overtakes };
}

function out(obj) {
  const pre = document.createElement('pre');
  pre.id = 'bot-result';
  pre.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj);
  document.body.append(pre);
}

export function run(c) {
  const q = new URLSearchParams(location.search);
  if (q.get('diag')) {
    c.start(Number(q.get('seed') || 3)); c.hold(true);
    const state = { dash: true };
    const rows = [];
    for (let f = 0; f < 60 * 60 && c.state === 'playing'; f++) {
      drive(c, decide(c.game, state)); c.step(1 / 60);
      const sm = c.game.sim;
      if (f % (q.get('every') ? Number(q.get('every')) : 60) === (q.get('every') ? Number(q.get('every')) : 60) - 1) {
        let fallen = 0, stumble = 0;
        for (let i = 0; i < sm.M; i++) { if (sm.st[i] === 2) fallen++; if (sm.st[i] === 1) stumble++; }
        let sumV = 0, n = 0; for (let i = 0; i < sm.M; i++) { if (sm.st[i] === 0) { sumV += sm.z[i]; n++; } }
        rows.push({ dsh: sm.player.dashing ? 1 : 0, bT: +sm.player.bumpT.toFixed(2), jT: +sm.player.jumpT.toFixed(2), dr: sm.player.draft ? 1 : 0, npcMeanZ: +(sumV / Math.max(1, n)).toFixed(1), t: +sm.t.toFixed(1), z: +sm.player.z.toFixed(1), v: +sm.player.v.toFixed(2), stam: Math.round(sm.player.stam), ahead: sm.ahead, fallenNpc: fallen, stumbleNpc: stumble, fallT: +sm.player.fallT.toFixed(1), ex: +sm.player.exhaust.toFixed(1) });
      }
    }
    out(rows);
    return;
  }
  if (q.get('bench')) {
    // 性能の目安（ヘッドレス Chrome・ソフトウェア描画。実機より遅い）：更新 1 回と描画 1 回の平均ミリ秒
    c.start(5); c.hold(true);
    const state = { dash: true };
    let tu = 0, td = 0, n = 0;
    for (let f = 0; f < 700 && c.state === 'playing'; f++) {
      drive(c, decide(c.game, state));
      let t0 = performance.now(); c.step(1 / 60); tu += performance.now() - t0;
      t0 = performance.now(); c.render(); td += performance.now() - t0;
      n += 1;
    }
    out({ frames: n, update_ms: tu / n, draw_ms: td / n, npc: c.game.sim.M });
    return;
  }
  if (q.get('shot')) {
    const kind = q.get('shot'), seed = Number(q.get('seed') || 5), until = Number(q.get('t') || 10);
    if (kind === 'title') { out('ok'); return; }
    c.start(seed); c.hold(true);
    const state = { dash: true };
    let f = 0;
    if (kind === 'over') {
      while (c.state === 'playing' && f < 60 * 120) { drive(c, decide(c.game, state)); c.step(1 / 60); f += 1; }
      c.hold(false);
    } else {
      while (c.state === 'playing' && c.game.sim.t < until && f < 60 * 120) { drive(c, decide(c.game, state)); c.step(1 / 60); f += 1; }
      drive(c, { axis: 0, dash: false, jump: false });
      c.render();
    }
    out('ok');
    return;
  }
  const res = { idle: [], smart: [] };
  for (const s of [1, 2, 3]) res.idle.push(play(c, 'idle', s, 120));
  for (const s of [1, 2, 3, 4, 5]) res.smart.push(play(c, 'smart', s, 120));
  out(res);
}
