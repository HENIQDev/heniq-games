// BUTT SUMO の対戦シミュレーション（純粋な関数だけ。ブラウザにもサーバーにも依存しない）。
// CP 戦ではブラウザで、オンライン対戦では Cloudflare のサーバーが、この同じ step() を実行して勝敗を決める。
// 固定 30 Hz。入力は { mx, my, b }（スティック −1..1 とボタンのビット）。dash・special は「押した瞬間」のビット。
import { CHAR_BY_ID } from './chars.js';

export const TICK = 30;
export const DT = 1 / TICK;
export const BTN = { DASH: 1, BRACE: 2, CHARGE: 4, SPECIAL: 8 };
export const RING_R = 5.0;
export const TIME_LIMIT = 60;
export const SUDDEN_DEATH_AT = 40;
export const READY_TICKS = 75;
export const KO_TICKS = 48;
const SUBSTEPS = 2;
const PERFECT_BRACE = 0.3;
const MAX_K = 26;
export const TUNE = { kb: 4.0, dmgScale: 0.009, hitDmg: 4.5, dashRest: 1.0, massExp: 0.25, defExp: 0.3, pushExp: 0.6 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;

function rnd(s) {
  s.rs = (s.rs + 0x6d2b79f5) >>> 0;
  let t = s.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeFighter(c, x, y, ang, buff) {
  return {
    id: c.id, x, y, vx: 0, vy: 0, kx: 0, ky: 0, ang, z: 0, vz: 0, out: 0,
    dmg: 0, sta: c.stamina * (buff.stam || 1), sMax: c.stamina * (buff.stam || 1), gau: 0,
    dashT: 0, dashDur: 0, dashDx: 0, dashDy: 0, dashSpd: 0, dashPow: 1, dashHit: 0, dashCd: 0,
    chargeT: 0, brace: 0, braceT: 0, braceCd: 0, stunT: 0,
    specT: 0, specDur: 0, specKind: '', specStage: 0, exhaust: 0, invuln: 0, air: 0, massMul: 1, defMul: 1, spin: 0, slide: 0,
    atk: buff.atk || 1, def: buff.def || 1, spd: buff.spd || 1, big: buff.big || 1, hits: 0, taken: 0, flash: 0, bufDash: 0, bufSpecial: 0,
  };
}

export function createMatch(opts) {
  const mods = Object.assign({ ringR: RING_R, slip: 1, time: TIME_LIMIT }, opts.mods || {});
  const buffs = opts.buffs || [{}, {}];
  const ca = CHAR_BY_ID[opts.chars[0]];
  const cb = CHAR_BY_ID[opts.chars[1]];
  if (!ca || !cb) throw new Error('unknown character');
  return {
    tick: 0, phase: 'ready', phaseT: 0, t: 0, timeLeft: mods.time, ringR: mods.ringR, ringR0: mods.ringR, mods,
    rs: (opts.seed >>> 0) || 1, winner: -1, reason: '', events: [], over: false, shrinking: false,
    f: [makeFighter(ca, 0, 2.5, -Math.PI / 2, buffs[0] || {}), makeFighter(cb, 0, -2.5, Math.PI / 2, buffs[1] || {})],
  };
}

export function emptyInput() { return { mx: 0, my: 0, b: 0 }; }

function normInput(inp) {
  if (!inp) return emptyInput();
  let mx = Number(inp.mx), my = Number(inp.my);
  if (!Number.isFinite(mx)) mx = 0;
  if (!Number.isFinite(my)) my = 0;
  const m = hyp(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  return { mx, my, b: (inp.b | 0) & 15 };
}

const cOf = (f) => CHAR_BY_ID[f.id];
const massOf = (f) => cOf(f).mass * f.massMul * f.big;
const defOf = (f) => cOf(f).defense * f.def * f.defMul;
const radiusOf = (f) => cOf(f).r * f.big;
const push = (s, e) => { s.events.push(e); };

function aimDir(s, i, inp) {
  const f = s.f[i], o = s.f[1 - i];
  if (hyp(inp.mx, inp.my) > 0.3) { const m = hyp(inp.mx, inp.my); return [inp.mx / m, inp.my / m]; }
  const dx = o.x - f.x, dy = o.y - f.y, m = hyp(dx, dy) || 1;
  return [dx / m, dy / m];
}

function launchDash(s, i, pow, dur, speedMul, dir, cost) {
  const f = s.f[i], c = cOf(f);
  f.dashT = dur; f.dashDur = dur; f.dashDx = dir[0]; f.dashDy = dir[1];
  f.dashSpd = c.dashSpeed * speedMul * f.spd; f.dashPow = pow * c.power * f.atk; f.dashHit = 0;
  f.sta = Math.max(0, f.sta - cost);
  f.ang = Math.atan2(dir[1], dir[0]);
  f.brace = 0; f.chargeT = 0;
  push(s, { t: 'dash', i, p: Math.min(1, pow / 2) });
}

export const INPUT_BUFFER = 0.2;                // 突進・必殺は、押してから 0.2 秒以内に使える状態になれば出る（突進中・スタン中・クールダウン中の押し込みを取りこぼさない）
const SPEC_LOCK = { quake: 1, cry: 1, pull: 1, hop: 1 };

function startSpecial(s, i, inp) {
  const f = s.f[i], c = cOf(f);
  let kind = c.spec;
  if (kind === 'chaos') {
    const pool = ['tackle', 'quake', 'spin', 'heavy', 'hop', 'slide', 'pull', 'cry'];
    kind = pool[Math.floor(rnd(s) * pool.length)];
  }
  f.gau = 0; f.specKind = kind; f.specStage = 0; f.brace = 0; f.chargeT = 0;
  const dir = aimDir(s, i, inp);
  const dur = { tackle: 0.6, quake: 0.8, cry: 1.0, heavy: 3.0, spin: 1.5, slide: 1.4, hop: 0.85, pull: 0.6 }[kind];
  f.specDur = dur; f.specT = dur;
  if (kind === 'tackle') launchDash(s, i, 2.3, 0.6, 1.5, dir, 0);
  else if (kind === 'slide') { f.slide = 1; f.kx += dir[0] * 8; f.ky += dir[1] * 8; f.ang = Math.atan2(dir[1], dir[0]); }
  else if (kind === 'spin') f.spin = 1;
  else if (kind === 'hop') { f.air = 1; f.invuln = 0.5; f.vz = 7.5; }
  push(s, { t: 'special', i, kind, x: f.x, y: f.y });
}

function endSpecial(f) {
  f.specT = 0; f.spin = 0; f.slide = 0; f.massMul = 1; f.defMul = 1; f.air = 0; f.specKind = '';
}

function knockOn(s, target, nx, ny, power, bonusDmg, stunT) {
  const m = Math.pow(massOf(target), TUNE.massExp) * Math.pow(defOf(target), TUNE.defExp);
  const k = (power * (1 + target.dmg * TUNE.dmgScale)) / m;
  target.kx += nx * k; target.ky += ny * k;
  target.dmg += bonusDmg / defOf(target);
  if (stunT > 0) target.stunT = Math.max(target.stunT, stunT);
}

function updateSpecial(s, i) {
  const f = s.f[i], o = s.f[1 - i];
  if (f.specT <= 0) return;
  const age = f.specDur - f.specT;
  const kind = f.specKind;
  if (kind === 'heavy') { f.massMul = 2.4; f.defMul = 1.8; }
  else if (kind === 'quake' || kind === 'cry') {
    const trig = kind === 'quake' ? 0.4 : 0.5;
    if (!f.specStage && age >= trig) {
      f.specStage = 1;
      const rng = kind === 'quake' ? 3.7 : 4.8;
      const dx = o.x - f.x, dy = o.y - f.y, d = hyp(dx, dy) || 1;
      push(s, { t: 'quake', x: f.x, y: f.y, r: rng, i });
      if (!o.out && !o.air && d < rng) {
        const half = o.brace ? 0.5 : 1;
        knockOn(s, o, dx / d, dy / d, (kind === 'quake' ? 10.5 : 8) * half * f.atk * (1 - 0.35 * (d / rng)), kind === 'quake' ? 13 : 8, kind === 'cry' ? 1.0 : 0.3);
        f.hits++; o.taken++; f.gau = Math.min(100, f.gau + 8);
      }
    }
  } else if (kind === 'pull') {
    if (!f.specStage && age >= 0.25) {
      f.specStage = 1;
      const dx = f.x - o.x, dy = f.y - o.y, d = hyp(dx, dy) || 1;
      push(s, { t: 'pull', x: f.x, y: f.y, i });
      if (!o.out && !o.air && d < 8.5) { o.kx = (dx / d) * 10.5; o.ky = (dy / d) * 10.5; o.stunT = Math.max(o.stunT, 0.3); o.dmg += 5; f.hits++; }
    }
  } else if (kind === 'hop') {
    if (!f.specStage && age >= 0.42) {
      f.specStage = 1;
      const R = s.ringR - 0.3;
      let tx = -o.x, ty = -o.y;
      let tm = hyp(tx, ty);
      if (tm < 0.4) { tx = f.x - o.x; ty = f.y - o.y; tm = hyp(tx, ty) || 1; }
      const gap = radiusOf(f) + radiusOf(o) + 0.05;
      let nx = o.x + (tx / tm) * gap, ny = o.y + (ty / tm) * gap;
      const nm = hyp(nx, ny);
      if (nm > R) { nx *= R / nm; ny *= R / nm; }
      f.x = nx; f.y = ny; f.kx = 0; f.ky = 0; f.air = 0; f.vz = 0; f.z = 0; f.invuln = 0.25;
      const ox = o.x - f.x, oy = o.y - f.y, om = hyp(ox, oy) || 1;
      let px = o.x, py = o.y; const pm = hyp(px, py);
      let ux = px / (pm || 1), uy = py / (pm || 1);
      if (pm < 0.3) { ux = ox / om; uy = oy / om; }
      push(s, { t: 'quake', x: f.x, y: f.y, r: 2.2, i });
      if (!o.out) { knockOn(s, o, ux, uy, 8.5 * f.atk, 8, 0.35); f.hits++; o.taken++; push(s, { t: 'hit', i, j: 1 - i, x: o.x, y: o.y, p: 0.8, kind: 'butt' }); }
    }
    if (f.specStage === 0) { f.z = Math.max(0, f.z); }
  }
  f.specT -= DT;
  if (f.specT <= 0) endSpecial(f);
}

function stepFighter(s, i, inpRaw) {
  const f = s.f[i], o = s.f[1 - i], c = cOf(f);
  const inp = normInput(inpRaw);
  if (f.out) return;
  f.stunT = Math.max(0, f.stunT - DT); f.dashCd = Math.max(0, f.dashCd - DT); f.braceCd = Math.max(0, f.braceCd - DT);
  f.invuln = Math.max(0, f.invuln - DT); f.exhaust = Math.max(0, f.exhaust - DT); f.flash = Math.max(0, f.flash - DT);
  const fighting = s.phase === 'fight';
  if (fighting) {
    const before = f.gau;
    f.gau = Math.min(100, f.gau + 1.4 * DT);
    if (before < 100 && f.gau >= 100) push(s, { t: 'ready', i });
  }
  updateSpecial(s, i);
  const locked = f.specT > 0 && SPEC_LOCK[f.specKind];
  const canAct = fighting && f.stunT <= 0 && !locked && !f.out;
  const dashing = f.dashT > 0;
  // 先行入力：押した瞬間を少しの間だけ覚えておく
  f.bufDash = Math.max(0, f.bufDash - DT); f.bufSpecial = Math.max(0, f.bufSpecial - DT);
  if (fighting) { if (inp.b & BTN.DASH) f.bufDash = INPUT_BUFFER; if (inp.b & BTN.SPECIAL) f.bufSpecial = INPUT_BUFFER; }

  if (canAct && !dashing) {
    // 踏ん張り
    if ((inp.b & BTN.BRACE) && f.sta > 1 && f.chargeT <= 0 && f.specKind !== 'tackle') {
      if (!f.brace && f.braceCd <= 0) { f.brace = 1; f.braceT = 0; push(s, { t: 'brace', i }); }
      if (f.brace) { f.braceT += DT; f.sta = Math.max(0, f.sta - 14 * DT); }
    } else if (f.brace) { f.brace = 0; f.braceCd = 0.4; }
    // チャージ → 離すと強い突進
    if ((inp.b & BTN.CHARGE) && !f.brace && f.dashCd <= 0 && f.sta >= 12 && f.exhaust <= 0) {
      if (f.chargeT <= 0) push(s, { t: 'charge', i });
      f.chargeT = Math.min(1.1, f.chargeT + DT);
      f.sta = Math.max(0, f.sta - 5 * DT);
    } else if (f.chargeT > 0) {
      if (f.chargeT >= 0.2 && f.sta >= 8 && f.dashCd <= 0) {
        const k = f.chargeT / 1.1;
        launchDash(s, i, 1 + 0.95 * k, 0.24 + 0.2 * k, 1 + 0.35 * k, aimDir(s, i, inp), 20 + 10 * k);
      }
      f.chargeT = 0;
    }
    // 突進
    if (f.bufDash > 0 && f.dashCd <= 0 && f.sta >= 18 && f.exhaust <= 0 && f.chargeT <= 0 && !f.brace) {
      f.bufDash = 0; launchDash(s, i, 1, 0.32, 1, aimDir(s, i, inp), 22);
    } else if (f.bufSpecial > 0 && f.gau >= 100 && f.specT <= 0 && f.chargeT <= 0) {
      f.bufSpecial = 0; startSpecial(s, i, inp);
    }
  } else if (!canAct) {
    f.brace = 0; f.chargeT = 0;
  }
  if (f.sta <= 0 && f.exhaust <= 0 && fighting) { f.exhaust = 1.4; f.brace = 0; f.chargeT = 0; push(s, { t: 'tired', i }); }
  if (!f.brace && f.chargeT <= 0 && fighting) f.sta = Math.min(f.sMax, f.sta + c.regen * DT * (f.exhaust > 0 ? 0.6 : 1));

  // 向き：突進中は進行方向、それ以外は相手にお尻を向ける
  if (f.spin) f.ang += 14 * DT;
  else if (f.slide) f.ang = Math.atan2(f.ky, f.kx);
  else if (f.dashT <= 0 && !f.air) {
    const target = Math.atan2(o.y - f.y, o.x - f.x);
    let d = target - f.ang;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const rate = c.turn * DT * (f.brace ? 0.5 : 1) * (f.chargeT > 0 ? 0.4 : 1);
    f.ang += clamp(d, -rate, rate);
  }

  // 速度
  if (f.dashT > 0) {
    const cur = 0.55 + 0.45 * (f.dashT / f.dashDur);
    f.kx = f.dashDx * f.dashSpd * cur; f.ky = f.dashDy * f.dashSpd * cur;
    f.vx = 0; f.vy = 0;
    f.dashT -= DT;
    if (f.dashT <= 0) { f.dashT = 0; f.dashCd = TUNE.dashRest + (f.dashHit ? 0 : 0.3); f.kx *= 0.4; f.ky *= 0.4; if (f.specKind === 'tackle') { f.specT = 0; f.specKind = ''; } }
  } else {
    let mult = f.brace ? 0.25 : f.chargeT > 0 ? 0.35 : 1;
    if (f.exhaust > 0) mult *= 0.55;
    if (f.specKind === 'heavy') mult *= 0.55;
    if (f.specKind === 'spin') mult *= 1.15;
    if (f.specKind === 'slide') mult *= 1.2;
    if (!canAct || locked) mult = 0;
    const sp = c.speed * f.spd * mult;
    const grip = c.grip * s.mods.slip * (f.slide ? 0.25 : 1) * Math.min(1, 1 / Math.sqrt(f.massMul));
    const a = Math.min(1, grip * DT);
    f.vx += (inp.mx * sp - f.vx) * a;
    f.vy += (inp.my * sp - f.vy) * a;
  }
  // 吹っ飛び速度の減衰（踏ん張り中は強く、滑る床・キャラは弱く）
  const drag = (f.brace ? 7 : 2.6) * c.slip * s.mods.slip * (f.slide ? 0.4 : 1);
  if (f.dashT <= 0) { const k = Math.exp(-drag * DT); f.kx *= k; f.ky *= k; }
  const km = hyp(f.kx, f.ky);
  if (km > MAX_K) { f.kx *= MAX_K / km; f.ky *= MAX_K / km; }
  if (f.air) { f.vz -= 28 * DT; f.z = Math.max(0, f.z + f.vz * DT); if (f.z <= 0 && f.vz < 0) f.vz = 0; }
}

function attackInfo(f, n) {
  // 攻撃中か、お尻の向きと相手の方向が合っているか
  let pow = 0, omni = false, kind = 'butt';
  if (f.dashT > 0) pow = f.dashPow;
  else if (f.spin) { pow = 1.25 * cOf(f).power * f.atk; omni = true; kind = 'spin'; }
  else if (f.slide && hyp(f.kx, f.ky) > 3.5) { pow = 1.75 * cOf(f).power * f.atk; omni = true; kind = 'slide'; }
  if (pow <= 0) return null;
  const align = omni ? 1 : Math.cos(f.ang) * n[0] + Math.sin(f.ang) * n[1];
  if (align < 0.55) return null;
  return { pow: pow * (0.65 + 0.35 * align), kind };
}

function resolveHit(s, ai, bi, n, info) {
  const a = s.f[ai], b = s.f[bi];
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  if (b.brace && b.braceT <= PERFECT_BRACE) {
    // ジャスト踏ん張り：攻撃を弾き返して、相手を転ばせる
    a.kx = -n[0] * Math.min(16, info.pow * 7); a.ky = -n[1] * Math.min(16, info.pow * 7);
    a.stunT = Math.max(a.stunT, 0.75); a.dashT = 0; a.dashCd = 0.6; a.dmg += (info.pow * TUNE.hitDmg) / defOf(a);
    b.gau = Math.min(100, b.gau + 22); b.sta = Math.min(b.sMax, b.sta + 8); b.braceT = 0; b.flash = 0.3;
    a.taken++; b.hits++; a.chargeT = 0;
    push(s, { t: 'counter', i: bi, j: ai, x, y, p: Math.min(1, info.pow / 1.6) });
    return;
  }
  let mulKb = 1, mulDmg = 1, stun = 0.2 + 0.12 * info.pow;
  if (b.brace) { mulKb = 0.38; mulDmg = 0.45; stun = 0; b.sta = Math.max(0, b.sta - 12); }
  if (b.invuln > 0) return;
  const kn = info.pow * TUNE.kb * mulKb;
  knockOn(s, b, n[0], n[1], kn, info.pow * TUNE.hitDmg * mulDmg, stun);
  b.dashT = 0; b.dashCd = Math.max(b.dashCd, 0.5); b.chargeT = 0; b.flash = 0.25;
  if (!b.brace && b.stunT > 0 && b.specKind && SPEC_LOCK[b.specKind]) endSpecial(b);
  a.kx -= n[0] * 1.2; a.ky -= n[1] * 1.2;
  if (a.dashT > 0) { a.dashHit = 1; a.dashT = 0; a.dashCd = TUNE.dashRest; a.kx *= 0.2; a.ky *= 0.2; if (a.specKind === 'tackle') { a.specT = 0; a.specKind = ''; } }
  a.gau = Math.min(100, a.gau + 12 * Math.min(1.5, info.pow)); b.gau = Math.min(100, b.gau + 14);
  a.hits++; b.taken++;
  push(s, { t: 'hit', i: ai, j: bi, x, y, p: Math.min(1, info.pow / 2), kind: b.brace ? 'brace' : info.kind });
}

function collide(s) {
  const a = s.f[0], b = s.f[1];
  if (a.out || b.out || a.air || b.air) return;
  let dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
  const rr = radiusOf(a) + radiusOf(b);
  if (d >= rr) return;
  if (d < 1e-4) { dx = 0; dy = 1; d = 1e-4; }
  const n = [dx / d, dy / d];
  const ma = Math.pow(massOf(a), TUNE.pushExp) * (a.brace ? 3 : 1), mb = Math.pow(massOf(b), TUNE.pushExp) * (b.brace ? 3 : 1);
  const over = rr - d;
  a.x -= n[0] * over * (mb / (ma + mb)); a.y -= n[1] * over * (mb / (ma + mb));
  b.x += n[0] * over * (ma / (ma + mb)); b.y += n[1] * over * (ma / (ma + mb));
  const ia = attackInfo(a, n), ib = attackInfo(b, [-n[0], -n[1]]);
  let hitDone = false;
  if (s.pairCd > 0) { /* 連続ヒット防止 */ } else {
    if (ia) { resolveHit(s, 0, 1, n, ia); hitDone = true; }
    if (ib) { resolveHit(s, 1, 0, [-n[0], -n[1]], ib); hitDone = true; }
    if (hitDone) s.pairCd = 0.35;
  }
  if (!hitDone) {
    const rvx = a.vx + a.kx - (b.vx + b.kx), rvy = a.vy + a.ky - (b.vy + b.ky);
    const vn = rvx * n[0] + rvy * n[1];
    if (vn > 0) {
      const e = ((cOf(a).bounce + cOf(b).bounce) / 2) * 0.8;
      const j = ((1 + e) * vn) / (1 / ma + 1 / mb);
      a.kx -= (n[0] * j) / ma; a.ky -= (n[1] * j) / ma;
      b.kx += (n[0] * j) / mb; b.ky += (n[1] * j) / mb;
      if (vn > 4) push(s, { t: 'bump', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: Math.min(1, vn / 12) });
    }
  }
}

function finish(s, winner, reason) {
  s.winner = winner; s.reason = reason; s.phase = 'ko'; s.phaseT = 0;
  push(s, { t: 'ko', winner, reason });
}

function decideTimeout(s) {
  const a = s.f[0], b = s.f[1];
  if (Math.abs(a.dmg - b.dmg) >= 6) return a.dmg < b.dmg ? 0 : 1;
  const da = hyp(a.x, a.y), db = hyp(b.x, b.y);
  if (Math.abs(da - db) > 0.4) return da < db ? 0 : 1;
  return -1;
}

export function step(s, in0, in1) {
  s.events.length = 0;
  s.tick++;
  if (s.pairCd > 0) s.pairCd = Math.max(0, s.pairCd - DT); else s.pairCd = 0;
  const ins = [in0, in1];
  if (s.phase === 'ready') {
    s.phaseT++;
    const left = READY_TICKS - s.phaseT;
    if (left === 60 || left === 30) push(s, { t: 'count', n: left === 60 ? 2 : 1 });
    if (s.phaseT === 1) push(s, { t: 'count', n: 3 });
    if (s.phaseT >= READY_TICKS) { s.phase = 'fight'; push(s, { t: 'go' }); }
    for (let i = 0; i < 2; i++) stepFighter(s, i, emptyInput());
  } else if (s.phase === 'fight') {
    s.t += DT;
    s.timeLeft = Math.max(0, s.mods.time - s.t);
    if (s.t > SUDDEN_DEATH_AT && !s.shrinking) { s.shrinking = true; push(s, { t: 'shrink' }); }
    if (s.shrinking) s.ringR = s.ringR0 * (1 - 0.4 * clamp((s.t - SUDDEN_DEATH_AT) / (s.mods.time - SUDDEN_DEATH_AT), 0, 1));
    for (let i = 0; i < 2; i++) stepFighter(s, i, ins[i]);
  } else {
    for (let i = 0; i < 2; i++) { const f = s.f[i]; if (!f.out) { f.dashT = 0; f.brace = 0; f.chargeT = 0; f.vx *= 0.9; f.vy *= 0.9; } }
  }
  // 位置の更新と衝突（サブステップ）
  for (let k = 0; k < SUBSTEPS; k++) {
    const h = DT / SUBSTEPS;
    for (const f of s.f) {
      if (f.out) { f.x += f.kx * h; f.y += f.ky * h; continue; }
      f.x += (f.vx + f.kx) * h; f.y += (f.vy + f.ky) * h;
    }
    if (s.phase !== 'over') collide(s);
  }
  // 場外判定と落下
  for (let i = 0; i < 2; i++) {
    const f = s.f[i];
    if (f.out) {
      f.outT = (f.outT || 0) + DT;
      f.vz -= 26 * DT; f.z += f.vz * DT; f.ang += 7 * DT;
      const k = Math.exp(-0.5 * DT); f.kx *= k; f.ky *= k;
      if (f.z < -1.2) { f.z = -1.2; f.vz = 0; f.kx *= 0.8; f.ky *= 0.8; }
      continue;
    }
    if (s.phase === 'fight' && !f.air && hyp(f.x, f.y) > s.ringR + radiusOf(f) * 0.15) {
      f.out = 1; f.vz = 3.5 + hyp(f.kx, f.ky) * 0.12; f.dashT = 0; f.brace = 0; f.chargeT = 0; f.vx = 0; f.vy = 0;
      push(s, { t: 'out', i, x: f.x, y: f.y });
    }
  }
  if (s.phase === 'fight') {
    const o0 = s.f[0].out, o1 = s.f[1].out;
    if (o0 && o1) finish(s, hyp(s.f[0].x, s.f[0].y) < hyp(s.f[1].x, s.f[1].y) ? 0 : 1, 'ringout');
    else if (o0) finish(s, 1, 'ringout');
    else if (o1) finish(s, 0, 'ringout');
    else if (s.timeLeft <= 0) finish(s, decideTimeout(s), 'time');
  } else if (s.phase === 'ko') {
    s.phaseT++;
    if (s.phaseT >= KO_TICKS) { s.phase = 'over'; s.over = true; push(s, { t: 'end', winner: s.winner, reason: s.reason }); }
  }
  return s;
}

const r3 = (v) => Math.round(v * 1000) / 1000;

// ネットワークで送る・描画に使うための、軽い状態
export function snapshot(s) {
  return {
    n: s.tick, ph: s.phase, pt: s.phaseT, tl: r3(s.timeLeft), rr: r3(s.ringR), w: s.winner, why: s.reason, sd: s.shrinking ? 1 : 0,
    f: s.f.map((f) => ({
      x: r3(f.x), y: r3(f.y), kx: r3(f.kx), ky: r3(f.ky), vx: r3(f.vx), vy: r3(f.vy), a: r3(f.ang), z: r3(f.z), dm: r3(f.dmg), sp: Math.round(f.sta), g: Math.round(f.gau),
      dt: r3(f.dashT), ct: r3(f.chargeT), br: f.brace, bt: r3(f.braceT), st: r3(f.stunT), sk: f.specKind, sT: r3(f.specT), o: f.out, ex: f.exhaust > 0 ? 1 : 0, fl: r3(f.flash), ml: f.massMul, sn: f.spin, sl: f.slide, ar: f.air,
    })),
    ev: s.events.slice(),
  };
}

export const FIGHTER_FIELDS = { x: 'x', y: 'y', kx: 'kx', ky: 'ky', vx: 'vx', vy: 'vy', a: 'ang', z: 'z', dm: 'dmg', sp: 'sta', g: 'gau', dt: 'dashT', ct: 'chargeT', br: 'brace', bt: 'braceT', st: 'stunT', sk: 'specKind', sT: 'specT', o: 'out', ex: 'exhaust', fl: 'flash', ml: 'massMul', sn: 'spin', sl: 'slide', ar: 'air' };

// スナップショットを、描画用の状態（createMatch と同じ形）に展開する
export function viewFromSnapshot(snap, chars, base) {
  const v = base || { events: [], f: [{ id: chars[0] }, { id: chars[1] }], mods: {}, ringR0: RING_R };
  v.tick = snap.n; v.phase = snap.ph; v.phaseT = snap.pt; v.timeLeft = snap.tl; v.ringR = snap.rr; v.winner = snap.w; v.reason = snap.why; v.shrinking = !!snap.sd;
  v.over = snap.ph === 'over';
  for (let i = 0; i < 2; i++) {
    const src = snap.f[i], dst = v.f[i];
    dst.id = chars[i];
    for (const k in FIGHTER_FIELDS) dst[FIGHTER_FIELDS[k]] = src[k];
  }
  return v;
}

export function lerpView(a, b, t, out) {
  // a, b：viewFromSnapshot の結果の複製。位置と角度を補間する（オンラインの描画用）
  const o = out || { f: [{}, {}] };
  for (const k of ['tick', 'phase', 'phaseT', 'timeLeft', 'ringR', 'winner', 'reason', 'shrinking', 'over']) o[k] = t < 0.5 ? a[k] : b[k];
  o.ringR = a.ringR + (b.ringR - a.ringR) * t;
  o.events = b.events || [];
  for (let i = 0; i < 2; i++) {
    const p = a.f[i], q = b.f[i], r = o.f[i];
    Object.assign(r, q);
    for (const k of ['x', 'y', 'z', 'dmg', 'sta', 'gau']) r[k] = p[k] + (q[k] - p[k]) * t;
    let d = q.ang - p.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); r.ang = p.ang + d * t;
  }
  return o;
}

export function cloneView(v) {
  return JSON.parse(JSON.stringify({ tick: v.tick, phase: v.phase, phaseT: v.phaseT, timeLeft: v.timeLeft, ringR: v.ringR, winner: v.winner, reason: v.reason, shrinking: v.shrinking, over: v.over, f: v.f, events: [] }));
}

export function winnerLabel(s) { return s.winner === -1 ? 'draw' : s.winner === 0 ? 'p0' : 'p1'; }
