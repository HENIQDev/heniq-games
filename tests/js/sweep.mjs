const S = await import('/games/butt-sumo/play/sim.js');
const { CHARS } = await import('/games/butt-sumo/play/chars.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const prof = { react: 0.2, aggr: 0.7, aim: 0.15, brace: 0.5, perfect: 0.5, edge: 0.6, tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'] };
function run(N) {
  const wins = {}, games = {}, times = [];
  for (const c of CHARS) { wins[c.id] = 0; games[c.id] = 0; }
  let seed = 100;
  for (let a = 0; a < CHARS.length; a++) for (let b = 0; b < CHARS.length; b++) {
    if (a === b) continue;
    for (let k = 0; k < N; k++) {
      seed++;
      const s = S.createMatch({ chars: [CHARS[a].id, CHARS[b].id], seed });
      const A = createAI(prof, seed * 2), B = createAI(prof, seed * 2 + 1);
      let g = 0; while (!s.over && g++ < 3000) S.step(s, A.think(s, 0), B.think(s, 1));
      games[CHARS[a].id]++; games[CHARS[b].id]++;
      if (s.winner === 0) wins[CHARS[a].id]++; else if (s.winner === 1) wins[CHARS[b].id]++;
      times.push(s.t);
    }
  }
  times.sort((x, y) => x - y);
  const wr = CHARS.map(c => Math.round(100 * wins[c.id] / games[c.id]));
  return { med: +times[times.length >> 1].toFixed(1), p90: +times[Math.floor(times.length * .9)].toFixed(1), min: Math.min(...wr), max: Math.max(...wr), wr: wr.join(',') };
}
const res = [];
for (const t of [{ kb: 4.4, dmgScale: 0.011, hitDmg: 5, dashRest: 0.9 }, { kb: 4.0, dmgScale: 0.009, hitDmg: 4.5, dashRest: 1.0 }, { kb: 4.6, dmgScale: 0.008, hitDmg: 4, dashRest: 0.9 }]) {
  Object.assign(S.TUNE, t); res.push({ t, ...run(3) });
}
return res;
