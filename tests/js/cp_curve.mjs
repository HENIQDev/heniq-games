// CP の難易度曲線：「ふつうの腕前のプレイヤー」を模した AI で、各ステージを繰り返し戦って勝率を測る
const S = await import('/games/butt-sumo/play/sim.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const { STAGES } = await import('/games/butt-sumo/play/stages.js');
const human = { react: 0.3, aggr: 0.5, aim: 0.22, brace: 0.4, perfect: 0.35, edge: 0.4, tactics: ['chase', 'brace', 'counter', 'edge', 'special'] };
const lagged = (ai, n) => { const q = []; return { think(s, i) { q.push(ai.think(s, i)); return q.length > n ? q.shift() : S.emptyInput(); } }; };      // 人間の反応の遅れ（約 0.2 秒）
const chars = ['ojisan', 'chicken', 'burger'];
const N = 10;
const out = {};
for (const n of [1, 5, 9, 12, 18, 22, 28, 35, 42, 48, 55, 62, 68, 75, 85, 95, 99, 10, 30, 50, 70, 100]) {
  const st = STAGES[n - 1];
  let wins = 0, tsum = 0, count = 0;
  for (const c of chars) for (let k = 0; k < N; k++) {
    const seed = n * 1000 + k * 7 + (c === 'ojisan' ? 1 : 2);
    const s = S.createMatch({ chars: [c, st.foe], seed, mods: st.mods, buffs: [{}, st.buff] });
    const P = lagged(createAI(human, seed), 6), E = createAI(st.profile, seed ^ 99);
    let g = 0; while (!s.over && g++ < 3000) S.step(s, P.think(s, 0), E.think(s, 1));
    if (s.winner === 0) wins++; tsum += s.t; count++;
  }
  out[n + (st.boss ? 'B' : '')] = Math.round(100 * wins / count) + '% ' + (tsum / count).toFixed(0) + 's';
}
return out;
