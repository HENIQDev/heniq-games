// サーバーの 1 ティック（シミュレーション 1 ステップ＋スナップショット作成＋JSON 化）の CPU 時間の目安（この Mac のブラウザ上）
const S = await import('/games/butt-sumo/play/sim.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const prof = { react: 0.2, aggr: 0.7, aim: 0.15, brace: 0.5, perfect: 0.5, edge: 0.6, tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'] };
const t = []; let bytes = 0, n = 0;
for (let m = 0; m < 20; m++) {
  const s = S.createMatch({ chars: ['gorilla', 'sushi'], seed: m });
  const A = createAI(prof, m), B = createAI(prof, m + 50);
  while (!s.over) {
    const a = A.think(s, 0), b = B.think(s, 1);
    const t0 = performance.now();
    S.step(s, a, b);
    const txt = JSON.stringify(Object.assign({ t: 's' }, S.snapshot(s)));
    t.push(performance.now() - t0); bytes += txt.length; n++;
  }
}
t.sort((x, y) => x - y);
return { ticks: n, avgMs: +(t.reduce((a, b) => a + b, 0) / n).toFixed(4), p99Ms: +t[Math.floor(n * 0.99)].toFixed(3), maxMs: +t[n - 1].toFixed(3), avgBytes: Math.round(bytes / n) };
