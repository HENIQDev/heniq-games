// 「人間らしい」操作の代理（反応の遅れ・狙いのブレ・攻め方の癖）での、キャラの公平性と CP の難易度の測定。
// 実際の人間ではない。AI 同士の偏り（AI が滑る操作などを使いこなせない）を、複数の癖で見直すための目安。
const S = await import('/games/butt-sumo/play/sim.js');
const { CHARS } = await import('/games/butt-sumo/play/chars.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const { STAGES } = await import('/games/butt-sumo/play/stages.js');
const PROFILES = {
  novice:     { react: 0.45, aggr: 0.35, aim: 0.5, brace: 0.1, perfect: 0.1, edge: 0.15, tactics: ['rush'], lag: 8 },
  average:    { react: 0.3, aggr: 0.5, aim: 0.22, brace: 0.4, perfect: 0.35, edge: 0.4, tactics: ['chase', 'brace', 'counter', 'edge', 'special'], lag: 6 },
  aggressive: { react: 0.22, aggr: 0.9, aim: 0.2, brace: 0.15, perfect: 0.2, edge: 0.3, tactics: ['rush', 'chase', 'charge', 'special'], lag: 5 },
  defensive:  { react: 0.25, aggr: 0.3, aim: 0.15, brace: 0.8, perfect: 0.6, edge: 0.7, tactics: ['chase', 'brace', 'counter', 'edge', 'special'], lag: 6 },
};
// 入力の遅れ（人間の反応時間）：AI の判断を lag ティックだけ遅らせる
function lagged(ai, lag) { const q = []; return { think(s, i) { q.push(ai.think(s, i)); return q.length > lag ? q.shift() : S.emptyInput(); } }; }
const mk = (p, seed) => lagged(createAI(p, seed), p.lag);
function play(a, b, seed, pa, pb, mods, buffs) {
  const s = S.createMatch({ chars: [a, b], seed, mods, buffs });
  const A = mk(pa, seed), B = mk(pb, seed + 7);
  let g = 0; while (!s.over && g++ < 3000) S.step(s, A.think(s, 0), B.think(s, 1));
  return s;
}
const N = 3;
const out = { perProfile: {}, avg: {} };
const total = {}, cnt = {};
for (const c of CHARS) { total[c.id] = 0; cnt[c.id] = 0; }
for (const [name, p] of Object.entries(PROFILES)) {
  const w = {}, g = {};
  for (const c of CHARS) { w[c.id] = 0; g[c.id] = 0; }
  let seed = 10, durs = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    if (i === j) continue;
    for (let k = 0; k < N; k++) {
      const s = play(CHARS[i].id, CHARS[j].id, ++seed, p, p);
      g[CHARS[i].id]++; g[CHARS[j].id]++; durs.push(s.t);
      if (s.winner === 0) w[CHARS[i].id]++; else if (s.winner === 1) w[CHARS[j].id]++;
    }
  }
  durs.sort((x, y) => x - y);
  out.perProfile[name] = { median: +durs[durs.length >> 1].toFixed(1), rates: Object.fromEntries(CHARS.map((c) => [c.id, Math.round(100 * w[c.id] / g[c.id])])) };
  for (const c of CHARS) { total[c.id] += w[c.id] / g[c.id]; cnt[c.id]++; }
}
out.avg = Object.fromEntries(CHARS.map((c) => [c.id, Math.round(100 * total[c.id] / cnt[c.id])]));
// 最も偏った組み合わせ（average の癖・先攻後攻を入れ替えて）
const pair = [];
for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
  let w = 0, n = 0;
  for (let k = 0; k < 6; k++) { const s1 = play(CHARS[i].id, CHARS[j].id, 900 + k, PROFILES.average, PROFILES.average); const s2 = play(CHARS[j].id, CHARS[i].id, 950 + k, PROFILES.average, PROFILES.average); n += 2; if (s1.winner === 0) w++; if (s2.winner === 1) w++; }
  pair.push([CHARS[i].id + ' vs ' + CHARS[j].id, Math.round(100 * w / n)]);
}
pair.sort((x, y) => Math.abs(y[1] - 50) - Math.abs(x[1] - 50));
out.worstPairs = pair.slice(0, 5);
return out;
