// 全キャラクターの総当たり（AI 同士）：勝率の偏りを測る
const S = await import('/games/butt-sumo/play/sim.js');
const { CHARS } = await import('/games/butt-sumo/play/chars.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const prof = { react: 0.2, aggr: 0.7, aim: 0.15, brace: 0.5, perfect: 0.5, edge: 0.6, tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'] };
const N = 8;
const wins = {}, games = {}, draws = {}, times = [], reasons = { ringout: 0, time: 0 };
for (const c of CHARS) { wins[c.id] = 0; games[c.id] = 0; draws[c.id] = 0; }
let seed = 1;
for (let a = 0; a < CHARS.length; a++) for (let b = 0; b < CHARS.length; b++) {
  if (a === b) continue;
  for (let k = 0; k < N; k++) {
    seed++;
    const s = S.createMatch({ chars: [CHARS[a].id, CHARS[b].id], seed });
    const A = createAI(prof, seed * 2), B = createAI(prof, seed * 2 + 1);
    let guard = 0;
    while (!s.over && guard++ < 3000) S.step(s, A.think(s, 0), B.think(s, 1));
    games[CHARS[a].id]++; games[CHARS[b].id]++;
    if (s.winner === 0) wins[CHARS[a].id]++; else if (s.winner === 1) wins[CHARS[b].id]++; else { draws[CHARS[a].id]++; draws[CHARS[b].id]++; }
    times.push(s.t); reasons[s.reason] = (reasons[s.reason] || 0) + 1;
  }
}
const out = {};
for (const c of CHARS) out[c.id] = { win: Math.round(100 * wins[c.id] / games[c.id]) + '%', draw: draws[c.id] };
times.sort((x, y) => x - y);
return { out, medianTime: times[times.length >> 1].toFixed(1), reasons };
