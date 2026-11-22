// CROWD SPRINT（3D 版）のシミュレーション。ゲームの動きの数値と挙動は 2D 比較版（games/crowd-sprint/play/sim.js）と同一（順位の式だけ、下記のとおり変更）。
// 3D 版での変更（2026-11-22・ユーザーの指示）：①順位を、演出の人数ではなく実際の順位にした（主人公を含めて 800 人。最後尾＝800 位、1 位＝誰にも抜かれていない）②そのために、主人公の枠（最後列の中央）の NPC を置かない（NPC は 799 人）③描画のためにアニメーション用の配列（vz・vb）を公開。
// 移動・接触・転倒・ドラフト・スタミナなどの数値と挙動は変えていない。
// 元の説明：CROWD SPRINT のシミュレーション（描画・音・入力の機器から独立。種と操作だけで同じ結果になる＝決定性）。
// 座標：x は横（メートル。-15〜15）、z は前（スタートラインが 0、ゴールが 100）。
export const GOAL = 100;
export const FIELD_HALF = 15;
export const COLS = 20;
export const ROWS = 40;
export const M = COLS * ROWS;               // 隊列の枠の数（800）。うち 1 枠（最後列の中央）は主人公のもので、NPC は 799 人
export const RUNNERS = COLS * ROWS;         // 出走者の総数（主人公を含む 800 人）。順位は 1〜800 位の実際の順位
const COL_GAP = 1.5;
const ROW_GAP = 0.8;
const GRID = 1.5;                            // 空間ハッシュの 1 マス（m）

// プレイヤーの初期値（調整は playtest／ボットで）
export const P = {
  base: 5.8, dash: 9.2, lat: 4.0, latDash: 3.2, accel: 14,
  drain: 20, regen: 12, regenDelay: 0.5, exhaust: 1.5,
  bumpSlow: 0.18, bumpTime: 0.35, bumpGrace: 0.5, jumpSlow: 0.1, jumpTime: 0.55, jumpCd: 0.4, jumpH: 0.9,
  draftBoost: 0.08, draftRange: 1.8, draftNeed: 0.4, fall: 1.2, staggerDecay: 2.0,
};
export const ST = { RUN: 0, STUMBLE: 1, FALLEN: 2, GETUP: 3, ABSENT: 4 };   // ABSENT：主人公の枠（NPC ではない）

// 順位＝自分より前にいる人数＋1（実際の順位。最後尾は 800 位、1 位は誰にも抜かれていない状態）
export function rankOf(ahead) {
  return Math.max(0, ahead) + 1;
}

const MAX_DOWN = 45;                         // 同時に転んでいる（転びかけ含む）ランナーの上限。大惨事を防ぐ

export function createSim(rng) {
  const x = new Float32Array(M), z = new Float32Array(M), vx = new Float32Array(M), vz = new Float32Array(M);
  const vb = new Float32Array(M), tm = new Float32Array(M), press = new Float32Array(M), prot = new Float32Array(M);
  const wob = new Float32Array(M), side = new Float32Array(M);
  const st = new Uint8Array(M), col = new Uint8Array(M);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      x[i] = (c - (COLS - 1) / 2) * COL_GAP + rng.range(-0.15, 0.15);
      z[i] = -r * ROW_GAP - rng.range(0, 0.2);
      const n = (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;           // -1〜1 のなだらかな偏り
      const frontBias = ((ROWS - 1 - r) / (ROWS - 1)) * 0.25;
      vb[i] = Math.min(6.0, Math.max(4.0, 5.25 + n * 0.55 + frontBias));
      wob[i] = rng.range(0, 6.28);
      side[i] = rng.next() < 0.5 ? -1 : 1;
      col[i] = rng.int(0, 5);
    }
  }
  // 最後列の中央の枠は主人公のもの：NPC は置かない（乱数の消費は変えない）。主人公を含めて、ちょうど 800 人
  const SLOT = (ROWS - 1) * COLS + (COLS >> 1);
  st[SLOT] = ST.ABSENT; x[SLOT] = 0; z[SLOT] = -1e4;
  // 先頭の列の中央 10 人はエリート
  for (let c = 0; c < 10; c++) vb[Math.floor((COLS - 10) / 2) + c] = rng.range(5.9, 6.1);

  const player = {
    x: 0, z: -(ROWS - 1) * ROW_GAP - 2.0, v: 0, stam: 100, stamDelay: 0, exhaust: 0,
    jumpT: 0, jumpCd: 0, bumpT: 0, graceT: 0, fallT: 0, stagger: 0, draftT: 0, draft: false, dashing: false, vx: 0,
  };
  const sim = {
    t: 0, M, runners: RUNNERS, x, z, vx, vz, vb, st, col, tm, player, ahead: M - 1, rank: rankOf(M - 1), minAhead: M - 1, leaderZ: 0,
    finished: false, finishT: 0, finalRank: 0, finishTime: 0, overtakes: 0, bumps: 0, falls: 0, events: [],
    step,
  };

  // 空間ハッシュ（毎ステップ作り直す）
  const NX = Math.ceil((FIELD_HALF * 2 + 2) / GRID);
  const cellOf = new Int32Array(M);
  let cellStart = new Int32Array(1), cellCount = new Int32Array(1), cellItems = new Int32Array(M), NZ = 1, minZ = 0;
  function buildGrid() {
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < M; i++) { if (st[i] === ST.ABSENT) continue; if (z[i] < lo) lo = z[i]; if (z[i] > hi) hi = z[i]; }
    minZ = lo - 1;
    NZ = Math.ceil((hi - minZ + 2) / GRID) + 1;
    if (cellCount.length < NX * NZ) { cellCount = new Int32Array(NX * NZ); cellStart = new Int32Array(NX * NZ + 1); } else cellCount.fill(0);
    for (let i = 0; i < M; i++) {
      if (st[i] === ST.ABSENT) { cellOf[i] = -1; continue; }
      const cx = Math.min(NX - 1, Math.max(0, Math.floor((x[i] + FIELD_HALF + 1) / GRID)));
      const cz = Math.floor((z[i] - minZ) / GRID);
      const k = cz * NX + cx;
      cellOf[i] = k;
      cellCount[k] += 1;
    }
    let s = 0;
    for (let k = 0; k < NX * NZ; k++) { cellStart[k] = s; s += cellCount[k]; }
    cellStart[NX * NZ] = s;
    const fill = new Int32Array(NX * NZ);
    for (let i = 0; i < M; i++) { const k = cellOf[i]; if (k < 0) continue; cellItems[cellStart[k] + fill[k]++] = i; }
  }

  function npcStep(dt) {
    buildGrid();
    let down = 0;
    for (let i = 0; i < M; i++) if (st[i] === ST.FALLEN || st[i] === ST.STUMBLE) down += 1;
    const canFall = down < MAX_DOWN;
    for (let i = 0; i < M; i++) {
      const s = st[i];
      if (s === ST.ABSENT) continue;
      prot[i] = Math.max(0, prot[i] - dt);
      if (s === ST.FALLEN) { tm[i] -= dt; vz[i] = 0; vx[i] = 0; if (tm[i] <= 0) { st[i] = ST.GETUP; tm[i] = 0.5; } continue; }
      if (s === ST.GETUP) { tm[i] -= dt; if (tm[i] <= 0) { st[i] = ST.RUN; prot[i] = 1.5; } z[i] += vb[i] * 0.3 * dt; continue; }
      if (s === ST.STUMBLE) {
        tm[i] -= dt; z[i] += vb[i] * 0.4 * dt;
        if (tm[i] <= 0) { st[i] = ST.FALLEN; tm[i] = 1.6; sim.events.push({ type: 'npcfall', x: x[i], z: z[i] }); }
        continue;
      }
      // 走っている：前の人・転んだ人を見て速度と横の向きを決める
      let want = vb[i];
      let steer = 0;
      const cx = Math.min(NX - 1, Math.max(0, Math.floor((x[i] + FIELD_HALF + 1) / GRID)));
      const cz = Math.floor((z[i] - minZ) / GRID);
      let pr = 0;
      {
        const pdz = z[i] - player.z, pdx = x[i] - player.x;
        if (pdz > -0.2 && pdz < 2.2 && Math.abs(pdx) < 0.95 && player.v > vb[i] + 0.3) steer += (pdx === 0 ? side[i] : (pdx > 0 ? 1 : -1)) * 1.4;
      }
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        if (gz < 0 || gz >= NZ) continue;
        for (let gx = cx - 1; gx <= cx + 1; gx++) {
          if (gx < 0 || gx >= NX) continue;
          const k = gz * NX + gx;
          for (let q = cellStart[k]; q < cellStart[k + 1]; q++) {
            const j = cellItems[q];
            if (j === i) continue;
            const dx = x[j] - x[i], dz = z[j] - z[i];
            const d2 = dx * dx + dz * dz;
            if (d2 > 6.25) continue;
            const fallen = st[j] === ST.FALLEN || st[j] === ST.STUMBLE;
            if (fallen) {
              if (canFall && d2 < 0.4 && st[j] === ST.FALLEN && prot[i] <= 0 && rng.next() < 0.5) { st[i] = ST.STUMBLE; tm[i] = 0.6; prot[i] = 0.5; sim.events.push({ type: 'chain', x: x[i], z: z[i] }); }
              if (dz > 0 && dz < 2.6 && Math.abs(dx) < 1.0) steer += dx > 0 ? -2.2 : 2.2;
              continue;
            }
            if (dz > 0 && dz < 1.5 && Math.abs(dx) < 0.62) {
              want = Math.min(want, vb[j] * 0.97);
              steer += (dx === 0 ? side[i] : (dx > 0 ? -1 : 1)) * 1.3;
            }
            const d = Math.sqrt(d2);
            if (d < 0.6 && d > 1e-4) {
              const ov = 0.6 - d, ux = dx / d, uz = dz / d;
              x[i] -= ux * ov * 0.5; z[i] -= uz * ov * 0.15;
              pr += ov * dt * 14;
            }
          }
        }
      }
      press[i] = Math.max(0, press[i] + pr - dt * 0.8);
      if (canFall && press[i] > 2.2 && prot[i] <= 0) { st[i] = ST.STUMBLE; tm[i] = 0.6; press[i] = 0; sim.events.push({ type: 'crowdfall', x: x[i], z: z[i] }); continue; }
      const target = Math.max(-2.4, Math.min(2.4, steer)) + Math.sin(sim.t * 1.5 + wob[i]) * 0.15;
      vx[i] += (target - vx[i]) * Math.min(1, dt * 6);
      vz[i] += (want - vz[i]) * Math.min(1, dt * 5);
      x[i] = Math.max(-FIELD_HALF + 0.4, Math.min(FIELD_HALF - 0.4, x[i] + vx[i] * dt));
      z[i] += vz[i] * dt;
    }
  }

  function playerStep(dt, inp) {
    const p = player;
    const done = sim.finished;
    p.jumpCd = Math.max(0, p.jumpCd - dt);
    p.bumpT = Math.max(0, p.bumpT - dt);
    p.graceT = Math.max(0, p.graceT - dt);
    p.exhaust = Math.max(0, p.exhaust - dt);
    p.fallT = Math.max(0, p.fallT - dt);
    p.stagger = Math.max(0, p.stagger - dt * P.staggerDecay);
    if (p.jumpT > 0) p.jumpT = Math.max(0, p.jumpT - dt);
    const grounded = p.jumpT <= 0;
    // 操作
    const dashWanted = !!inp.dash && !done;
    p.dashing = dashWanted && p.stam > 0 && p.exhaust <= 0 && p.fallT <= 0;
    if (p.dashing) {
      p.stam = Math.max(0, p.stam - P.drain * dt);
      p.stamDelay = P.regenDelay;
      if (p.stam <= 0) { p.exhaust = P.exhaust; p.dashing = false; sim.events.push({ type: 'exhaust' }); }
    } else {
      p.stamDelay = Math.max(0, p.stamDelay - dt);
      if (p.stamDelay <= 0 && p.exhaust <= 0) p.stam = Math.min(100, p.stam + P.regen * (p.draft ? 1.5 : 1) * dt);
    }
    if (inp.jump && grounded && p.jumpCd <= 0 && p.fallT <= 0 && !done) { p.jumpT = P.jumpTime; p.jumpCd = P.jumpTime + P.jumpCd; sim.events.push({ type: 'jump' }); }
    // 速度
    let target = p.dashing ? P.dash : P.base;
    if (p.bumpT > 0) target *= 1 - P.bumpSlow;
    if (p.jumpT > 0) target *= 1 - P.jumpSlow;
    if (p.exhaust > 0) target *= 0.8;
    if (p.draft) target *= 1 + P.draftBoost;
    if (p.fallT > 0) target = 0;
    if (done) target = 0;
    p.v += Math.max(-P.accel * 1.5 * dt, Math.min(P.accel * dt, target - p.v));
    // 横：ジャンプ中は動かせない。ダッシュ中は遅い
    const axis = (p.jumpT > 0 || p.fallT > 0 || done) ? 0 : Math.max(-1, Math.min(1, inp.axis || 0));
    p.vx = axis * (p.dashing ? P.latDash : P.lat);
    p.x = Math.max(-FIELD_HALF + 0.5, Math.min(FIELD_HALF - 0.5, p.x + p.vx * dt));
    p.z += p.v * dt;
    // 接触
    p.draft = false;
    let draftCandidate = false;
    for (let i = 0; i < M; i++) {
      if (st[i] === ST.ABSENT) continue;
      const dz = z[i] - p.z;
      if (dz > 2.2 || dz < -1.2) continue;
      const dx = x[i] - p.x;
      const d2 = dx * dx + dz * dz;
      if (st[i] === ST.FALLEN) {
        if (d2 < 0.49 && grounded && p.fallT <= 0 && p.graceT <= 0.25) {
          p.fallT = P.fall; p.stagger = 0; sim.falls += 1; sim.events.push({ type: 'trip' });
        }
        continue;
      }
      if (d2 < 0.36 && p.fallT <= 0 && p.graceT <= 0 && st[i] !== ST.GETUP) {
        const d = Math.sqrt(d2) || 0.01;
        p.bumpT = P.bumpTime; p.graceT = P.bumpGrace; p.stagger += 1; sim.bumps += 1;
        p.x -= (dx / d) * 0.25;
        vx[i] += (dx / d) * 2.5;
        press[i] += p.dashing ? 1.3 : 0.5;
        sim.events.push({ type: 'bump', dash: p.dashing });
        if (p.stagger >= 5) { p.fallT = P.fall; p.stagger = 0; sim.falls += 1; sim.events.push({ type: 'fall' }); }
      }
      if (st[i] === ST.RUN && dz > 0.5 && dz < P.draftRange && Math.abs(dx) < 0.5) draftCandidate = true;
    }
    p.draftT = draftCandidate ? p.draftT + dt : 0;
    p.draft = p.draftT >= P.draftNeed;
  }

  function step(dt, inp) {
    sim.t += dt;
    npcStep(dt);
    playerStep(dt, inp || {});
    // 順位
    let a = 0, lead = -1e9;
    const pz = player.z;
    for (let i = 0; i < M; i++) { if (st[i] === ST.ABSENT) continue; if (z[i] > pz) a += 1; if (z[i] > lead) lead = z[i]; }
    if (a < sim.minAhead) {
      sim.events.push({ type: 'overtake', n: sim.minAhead - a, before: rankOf(sim.minAhead), after: rankOf(a) });
      sim.overtakes += sim.minAhead - a;
      sim.minAhead = a;
    }
    sim.ahead = a;
    sim.rank = rankOf(a);
    sim.leaderZ = lead;
    if (!sim.finished && player.z >= GOAL) {
      sim.finished = true;
      sim.finalRank = sim.rank;
      sim.finishTime = sim.t;
      sim.events.push({ type: 'goal', rank: sim.finalRank });
    }
    if (sim.finished) sim.finishT += dt;
  }
  return sim;
}
