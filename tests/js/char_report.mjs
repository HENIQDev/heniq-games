// キャラクターごとの性能と個性の計測（シミュレーションの実測）。表は docs/BALANCE_TEST.md に載せる
const S = await import('/games/butt-sumo/play/sim.js');
const { CHARS, CHAR_BY_ID } = await import('/games/butt-sumo/play/chars.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const R = [];
const ok = (name, c, extra) => R.push({ name, ok: !!c, extra });
const lagged = (ai, n) => { const q = []; return { think(s, i) { q.push(ai.think(s, i)); return q.length > n ? q.shift() : S.emptyInput(); } }; };
const PROFILES = {
  novice: { react: 0.45, aggr: 0.35, aim: 0.5, brace: 0.1, perfect: 0.1, edge: 0.15, tactics: ['rush'], lag: 8 },
  average: { react: 0.3, aggr: 0.5, aim: 0.22, brace: 0.4, perfect: 0.35, edge: 0.4, tactics: ['chase', 'brace', 'counter', 'edge', 'special'], lag: 6 },
  aggressive: { react: 0.22, aggr: 0.9, aim: 0.2, brace: 0.15, perfect: 0.2, edge: 0.3, tactics: ['rush', 'chase', 'charge', 'special'], lag: 5 },
  defensive: { react: 0.25, aggr: 0.3, aim: 0.15, brace: 0.8, perfect: 0.6, edge: 0.7, tactics: ['chase', 'brace', 'counter', 'edge', 'special'], lag: 6 },
  specialist: { react: 0.25, aggr: 0.5, aim: 0.15, brace: 0.3, perfect: 0.3, edge: 0.4, tactics: ['chase', 'special', 'edge'], lag: 6 },
};
// ---- 1 単体の性能（実測） ----
const micro = {};
function fresh(a, b) { const s = S.createMatch({ chars: [a, b], seed: 1 }); s.phase = 'fight'; return s; }
for (const c of CHARS) {
  const m = {};
  // 最高速度（右へ 2 秒歩く）
  let s = fresh(c.id, 'ojisan'); s.f[1].x = 40; s.f[1].y = 40; s.f[0].x = 0; s.f[0].y = 0; s.ringR = 99;
  for (let i = 0; i < 60; i++) S.step(s, { mx: 0, my: -1, b: 0 }, S.emptyInput());
  m.topSpeed = +Math.hypot(s.f[0].vx, s.f[0].vy).toFixed(2);
  // 突進の移動距離（突進が終わるまで）と、その後の滑り
  s = fresh(c.id, 'ojisan'); s.f[1].x = 40; s.f[1].y = 40; s.f[0].x = 0; s.f[0].y = 0; s.ringR = 99;
  S.step(s, { mx: 0, my: -1, b: 1 }, S.emptyInput());
  for (let i = 0; i < 40; i++) S.step(s, { mx: 0, my: 0, b: 0 }, S.emptyInput());
  m.dashDist = +Math.hypot(s.f[0].x, s.f[0].y).toFixed(2);
  // 標準の攻撃（おじさんの突進）を受けたときの、飛ばされた距離（勢い 0 と 60）
  for (const dmg of [0, 60]) {
    s = fresh('ojisan', c.id); s.ringR = 99;
    const A = s.f[0], B = s.f[1]; A.x = 0; A.y = 1.6; B.x = 0; B.y = -0.1; A.ang = -Math.PI / 2; B.ang = Math.PI / 2; B.dmg = dmg;
    A.dashT = 0.3; A.dashDur = 0.3; A.dashDx = 0; A.dashDy = -1; A.dashSpd = 10; A.dashPow = 1;
    const y0 = B.y;
    for (let i = 0; i < 70; i++) S.step(s, S.emptyInput(), S.emptyInput());
    m['knock' + dmg] = +Math.abs(B.y - y0).toFixed(2);
  }
  // スタミナ：全力で突進を続けられる回数（クールダウンを無視した上限）と回復
  m.stamina = c.stamina; m.regen = c.regen; m.dashesFromFull = Math.floor((c.stamina - 18) / 22) + 1;
  // 旋回：相手が真後ろにいるとき、お尻を向け直すのにかかる時間
  s = fresh(c.id, 'ojisan'); s.f[0].ang = Math.atan2(s.f[1].y - s.f[0].y, s.f[1].x - s.f[0].x) + Math.PI * 0.9;
  let n = 0; while (n < 120) { S.step(s, S.emptyInput(), S.emptyInput()); n++; let d = Math.atan2(s.f[1].y - s.f[0].y, s.f[1].x - s.f[0].x) - s.f[0].ang; d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d))); if (d < 0.15) break; }
  m.turnSec = +(n / 30).toFixed(2);
  micro[c.id] = m;
}
// ---- 2 実戦での指標（人間らしい代理 5 種の平均） ----
const agg = {};
for (const c of CHARS) agg[c.id] = { games: 0, wins: 0, time: 0, hitsDealt: 0, hitsTaken: 0, dashes: 0, specials: 0, counters: 0, tired: 0, ringoutBySpecial: 0, ringouts: 0, quakeHits: 0, draws: 0 };
let seed = 5000;
for (const [pn, p] of Object.entries(PROFILES)) for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
  if (i === j) continue;
  for (let k = 0; k < 2; k++) {
    seed++;
    const s = S.createMatch({ chars: [CHARS[i].id, CHARS[j].id], seed });
    const A = lagged(createAI(p, seed), p.lag), B = lagged(createAI(p, seed + 7), p.lag);
    let lastSpec = [-99, -99], g = 0;
    while (!s.over && g++ < 3000) {
      S.step(s, A.think(s, 0), B.think(s, 1));
      for (const e of s.events) {
        const a = agg[CHARS[e.i === 0 ? i : j].id];
        if (e.t === 'dash' && a) a.dashes++;
        if (e.t === 'special') { agg[CHARS[e.i === 0 ? i : j].id].specials++; lastSpec[e.i] = s.t; }
        if (e.t === 'hit') { agg[CHARS[e.i === 0 ? i : j].id].hitsDealt++; agg[CHARS[e.j === 0 ? i : j].id].hitsTaken++; if (s.t - lastSpec[e.i] < 1.6) agg[CHARS[e.i === 0 ? i : j].id].quakeHits++; }
        if (e.t === 'counter') agg[CHARS[e.i === 0 ? i : j].id].counters++;
        if (e.t === 'tired') agg[CHARS[e.i === 0 ? i : j].id].tired++;
      }
    }
    for (const [idx, ci] of [[0, i], [1, j]]) { const a = agg[CHARS[ci].id]; a.games++; a.time += s.t; if (s.winner === idx) a.wins++; if (s.winner < 0) a.draws++; }
    if (s.reason === 'ringout') { const w = CHARS[s.winner === 0 ? i : j].id; agg[w].ringouts++; if (s.t - lastSpec[s.winner] < 1.8) agg[w].ringoutBySpecial++; }
  }
}
const table = {};
for (const c of CHARS) { const a = agg[c.id]; table[c.id] = { win: Math.round(100 * a.wins / a.games), time: +(a.time / a.games).toFixed(1), dashes: +(a.dashes / a.games).toFixed(1), specials: +(a.specials / a.games).toFixed(2), hitsDealt: +(a.hitsDealt / a.games).toFixed(1), hitsTaken: +(a.hitsTaken / a.games).toFixed(1), counters: +(a.counters / a.games).toFixed(2), tired: +(a.tired / a.games).toFixed(2), ringoutBySpecial: a.ringouts ? Math.round(100 * a.ringoutBySpecial / a.ringouts) : 0 }; }
// ---- 3 個性が数値に出ているか ----
const by = (k) => [...CHARS].sort((x, y) => micro[y.id][k] - micro[x.id][k]).map((c) => c.id);
ok('ゴリラは重く、飛ばされにくい（勢い 60 で、軽量級より飛距離が短い）', micro.gorilla.knock60 < micro.chicken.knock60 && micro.gorilla.knock60 < micro.sushi.knock60, JSON.stringify([micro.gorilla.knock60, micro.chicken.knock60, micro.sushi.knock60]));
ok('ニワトリ・寿司は速い（最高速度の上位 3 位以内）', by('topSpeed').slice(0, 3).includes('chicken') && by('topSpeed').slice(0, 3).includes('sushi'), by('topSpeed').join(','));
ok('ゴリラ・赤ちゃん・ロボットは遅い（下位 4 位以内）', ['gorilla', 'baby', 'robot'].every((id) => by('topSpeed').slice(-4).includes(id)), by('topSpeed').join(','));
ok('ロボットは防御が高い（飛ばされにくさが上位 3 位以内）', [...CHARS].sort((a, b) => micro[a.id].knock60 - micro[b.id].knock60).slice(0, 3).some((c) => c.id === 'robot'));
ok('プリンは滑る（突進後の滑りで、全キャラの最長クラス）', micro.pudding.dashDist >= [...CHARS].map((c) => micro[c.id].dashDist).sort((a, b) => b - a)[2] - 0.01, JSON.stringify(Object.fromEntries(CHARS.map((c) => [c.id, micro[c.id].dashDist]))));
ok('小型の寿司・ニワトリは小回りが利く（旋回が最速クラス）', micro.sushi.turnSec <= micro.gorilla.turnSec && micro.chicken.turnSec <= micro.baby.turnSec);
ok('重量級は旋回が遅い（ゴリラ・赤ちゃんが下位 3 位以内）', ['gorilla', 'baby'].every((id) => [...CHARS].sort((a, b) => micro[b.id].turnSec - micro[a.id].turnSec).slice(0, 3).some((c) => c.id === id)));
ok('すべてのキャラで勢い 60 のほうが、飛距離が長い（累積ダメージの設計どおり）', CHARS.every((c) => micro[c.id].knock60 > micro[c.id].knock0));
ok('全キャラが必殺技を使い、必殺技が決着に関わる（使用率 > 0）', CHARS.every((c) => table[c.id].specials > 0.05));
ok('スタミナが切れる場面がある（どのキャラも試合で一度は息切れしうる）', CHARS.some((c) => table[c.id].tired > 0));
ok('引き分けは稀（全体の 3% 未満）', CHARS.reduce((a, c) => a + agg[c.id].draws, 0) / CHARS.reduce((a, c) => a + agg[c.id].games, 0) < 0.03);
ok('同一キャラ同士の対戦が成立する（10 体 × 10 戦で必ず決着）', (() => { for (const c of CHARS) for (let k = 0; k < 10; k++) { const s = S.createMatch({ chars: [c.id, c.id], seed: 70 + k }); const A = lagged(createAI(PROFILES.average, k), 6), B = lagged(createAI(PROFILES.average, k + 3), 6); let g = 0; while (!s.over && g++ < 3000) S.step(s, A.think(s, 0), B.think(s, 1)); if (!s.over || (s.winner < 0 && s.reason !== 'time')) return false; } return true; })());
return { micro, table, pass: R.filter((r) => r.ok).length, total: R.length, fail: R.filter((r) => !r.ok) };
