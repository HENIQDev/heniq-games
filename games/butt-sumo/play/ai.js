// CP（コンピューター）の操作。難易度は能力値の上乗せだけでなく、「行動パターン（tactics）」で変える。
// profile：{ react（判断の間隔・秒）, aggr（攻める頻度 0..1）, aim（狙いのブレ・rad）, brace（突進を見て踏ん張る確率）, perfect（ジャスト踏ん張りの確率）,
//            edge（土俵の端を意識する度合い）, tactics: ['rush','chase','brace','counter','feint','edge','charge','special','kite'] }
import { BTN, DT } from './sim.js';
import { CHAR_BY_ID } from './chars.js';

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createAI(profile, seed) {
  const rand = rng32(seed || 1);
  const has = (t) => profile.tactics.includes(t);
  const ai = {
    profile, clock: 0, nextThink: 0.3, mx: 0, my: 0, braceUntil: 0, chargeUntil: 0, wantDash: 0, wantSpecial: 0, mode: 'approach', modeUntil: 0, orbit: rand() < 0.5 ? 1 : -1,
    think(s, i) {
      const me = s.f[i], op = s.f[1 - i];
      ai.clock += DT;
      const out = { mx: ai.mx, my: ai.my, b: 0 };
      if (s.phase !== 'fight' || me.out) return { mx: 0, my: 0, b: 0 };
      const mc = CHAR_BY_ID[me.id];
      const dx = op.x - me.x, dy = op.y - me.y, d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      const rsum = mc.r * me.big + CHAR_BY_ID[op.id].r * op.big;
      const myEdge = s.ringR - Math.hypot(me.x, me.y);
      const opEdge = s.ringR - Math.hypot(op.x, op.y);
      const opDashing = op.dashT > 0 || op.chargeT > 0.45;
      const opToward = opDashing ? (op.dashT > 0 ? op.dashDx * -nx + op.dashDy * -ny : 0.9) : 0;
      const gap = d - rsum;

      // ---- 即時の反応（毎フレーム） ----
      // 突進を見て踏ん張る（ジャスト踏ん張りのタイミングは、perfect が高いほど正確）
      if (has('brace') && opDashing && opToward > 0.6 && gap < 3.4 && me.dashT <= 0 && ai.clock > ai.braceUntil) {
        if (!ai.reactRoll || ai.reactRoll.until < ai.clock) ai.reactRoll = { until: ai.clock + 0.9, ok: rand() < profile.brace, lead: 0.16 + (1 - profile.perfect) * 0.3 * rand() };
        const speed = Math.max(4, op.dashT > 0 ? op.dashSpd : 8);
        const eta = Math.max(0, gap) / speed;
        if (ai.reactRoll.ok && eta < ai.reactRoll.lead) { ai.braceUntil = ai.clock + 0.55; ai.reactRoll = null; }
      }
      const bracing = ai.clock < ai.braceUntil;
      if (bracing) out.b |= BTN.BRACE;

      // ---- 判断（react 秒ごと） ----
      if (ai.clock >= ai.nextThink) {
        ai.nextThink = ai.clock + profile.react * (0.7 + 0.6 * rand());
        let tx = op.x, ty = op.y; // 目標地点
        let move = 1;
        const dangerEdge = myEdge < 1.1 + 0.8 * profile.edge;
        if (dangerEdge && rand() < 0.4 + profile.edge * 0.6) {
          tx = -me.x * 0.5; ty = -me.y * 0.5; // 端に追い詰められたら、中央へ戻る
        } else if (has('edge')) {
          // 相手の「土俵の内側」に回り込む（そこから突進すると、外へ押し出せる）
          const om = Math.hypot(op.x, op.y);
          const ux = om > 0.3 ? -op.x / om : 0, uy = om > 0.3 ? -op.y / om : 0;
          tx = op.x + ux * (rsum + 0.5); ty = op.y + uy * (rsum + 0.5);
        } else if (has('chase')) {
          tx = op.x; ty = op.y;
        }
        if (has('kite') && gap < 2.6 && me.dashCd <= 0 && rand() < 0.5) {
          tx = me.x - nx * 3; ty = me.y - ny * 3; // ひき逃げ型：距離をとる
        }
        if (has('feint') && gap < 3.4 && gap > 1.4 && rand() < 0.45) { ai.orbit = -ai.orbit; ai.mode = 'orbit'; ai.modeUntil = ai.clock + 0.5 + rand() * 0.5; }
        if (ai.mode === 'orbit' && ai.clock < ai.modeUntil) {
          // 相手の周りを回る（フェイント）
          tx = me.x + -ny * ai.orbit * 3 + nx * 0.4; ty = me.y + nx * ai.orbit * 3 + ny * 0.4;
        } else ai.mode = 'approach';
        if (!has('rush') && !has('chase') && !has('edge') && !has('feint') && !has('kite')) move = 0.6;
        const ex = tx - me.x, ey = ty - me.y, em = Math.hypot(ex, ey);
        const err = (rand() - 0.5) * 2 * profile.aim;
        const c = Math.cos(err), sn = Math.sin(err);
        if (em > 0.15) { ai.mx = ((ex / em) * c - (ey / em) * sn) * move; ai.my = ((ex / em) * sn + (ey / em) * c) * move; } else { ai.mx = 0; ai.my = 0; }
        // 攻撃の判断
        const ready = me.dashCd <= 0 && me.sta >= 24 && me.exhaust <= 0 && me.stunT <= 0 && !bracing;
        const opBraced = op.brace && op.braceT > 0;
        if (ready && gap < 2.9 && gap > 0.1 && !opBraced) {
          const punish = has('counter') && (op.dashCd > 0.15 || op.stunT > 0.1);
          if (punish ? rand() < 0.9 : rand() < profile.aggr) ai.wantDash = 1;
        }
        if (ready && has('charge') && gap < 3.2 && ai.clock > ai.chargeUntil + 1.2 && rand() < 0.3 * profile.aggr && !opDashing) {
          ai.chargeUntil = ai.clock + 0.6 + rand() * 0.5; ai.chargeStart = ai.clock;
        }
        if (me.gau >= 100 && has('special') && !ai.wantSpecial) {
          const k = mc.spec;
          const ok = k === 'tackle' ? gap > 1.5 && gap < 5 : k === 'pull' ? gap > 2.5 : k === 'heavy' ? myEdge < 2 || opDashing : k === 'hop' ? gap < 5.5 : gap < 3.2;
          if (ok && rand() < 0.6) ai.wantSpecial = 1;
        }
      }
      out.mx = ai.mx; out.my = ai.my;
      if (ai.clock < ai.chargeUntil && !bracing) {
        out.b |= BTN.CHARGE;
        out.mx = nx * 0.2; out.my = ny * 0.2;
        if (ai.clock >= ai.chargeUntil - DT * 1.5) ai.chargeUntil = 0; // 離す（強い突進）
      }
      if (bracing) { out.mx *= 0.2; out.my *= 0.2; }
      if (ai.wantDash && !bracing && !(out.b & BTN.CHARGE)) { out.b |= BTN.DASH; ai.wantDash = 0; const e2 = (rand() - 0.5) * 2 * profile.aim * 0.6; out.mx = nx * Math.cos(e2) - ny * Math.sin(e2); out.my = nx * Math.sin(e2) + ny * Math.cos(e2); }
      if (ai.wantSpecial) { out.b |= BTN.SPECIAL; ai.wantSpecial = 0; if (mc.spec === 'tackle') { out.mx = nx; out.my = ny; } }
      return out;
    },
  };
  return ai;
}

