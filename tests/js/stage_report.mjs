// 全 100 ステージを、人間らしい代理（反応の遅れつき）で実際に戦って、10 ステージごとの帯で難易度・AI の行動の変化を集計する
const S = await import('/games/butt-sumo/play/sim.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const { STAGES, unlockedChars } = await import('/games/butt-sumo/play/stages.js');
const lagged = (ai, n) => { const q = []; return { think(s, i) { q.push(ai.think(s, i)); return q.length > n ? q.shift() : S.emptyInput(); } }; };
const human = { react: 0.3, aggr: 0.5, aim: 0.22, brace: 0.4, perfect: 0.35, edge: 0.4, tactics: ['chase', 'brace', 'counter', 'edge', 'special'] };
const N = 9;
const per = [];
for (let n = 1; n <= 100; n++) {
  const st = STAGES[n - 1];
  const pool = unlockedChars(n - 1);            // その時点で使えるキャラ（解放の進み具合どおり）
  let wins = 0, time = 0, losses = 0, draws = 0;
  const act = { dash: 0, brace: 0, charge: 0, special: 0, counter: 0, hits: 0 };
  for (let k = 0; k < N; k++) {
    const me = pool[(k + n) % pool.length];
    const seed = n * 977 + k * 31;
    const s = S.createMatch({ chars: [me, st.foe], seed, mods: st.mods, buffs: [{}, st.buff] });
    const P = lagged(createAI(human, seed), 6), E = createAI(st.profile, seed ^ 99);
    let g = 0; while (!s.over && g++ < 3000) { S.step(s, P.think(s, 0), E.think(s, 1)); for (const e of s.events) { if (e.i === 1) { if (e.t === 'dash') act.dash++; if (e.t === 'brace') act.brace++; if (e.t === 'charge') act.charge++; if (e.t === 'special') act.special++; if (e.t === 'counter') act.counter++; if (e.t === 'hit') act.hits++; } } }
    if (s.winner === 0) wins++; else if (s.winner === 1) losses++; else draws++;
    time += s.t;
  }
  per.push({ n, boss: !!st.boss, win: wins / N, loss: losses / N, time: time / N, act: Object.fromEntries(Object.entries(act).map(([k, v]) => [k, v / N])) });
}
const bands = [];
for (let b = 0; b < 10; b++) {
  const rows = per.slice(b * 10, b * 10 + 10), normal = rows.filter((r) => !r.boss), boss = rows.find((r) => r.boss);
  const avg = (xs, f) => xs.reduce((a, r) => a + f(r), 0) / xs.length;
  bands.push({ band: (b * 10 + 1) + '-' + (b * 10 + 10), win: Math.round(100 * avg(normal, (r) => r.win)), loss: Math.round(100 * avg(normal, (r) => r.loss)), time: +avg(rows, (r) => r.time).toFixed(1), bossWin: Math.round(100 * boss.win), boss: boss.n,
    act: Object.fromEntries(['dash', 'brace', 'charge', 'special', 'counter'].map((k) => [k, +avg(rows, (r) => r.act[k]).toFixed(1)])) });
}
const R = [];
const ok = (name, c, extra) => R.push({ name, ok: !!c, extra });
ok('序盤（1〜10）は 80% 以上勝てる', bands[0].win >= 80, JSON.stringify(bands[0]));
ok('終盤（91〜100）は 35% 以下', bands[9].win <= 35);
ok('難易度の壁がない：隣り合う帯で、勝率が 45 ポイント以上は下がらない', bands.every((b, i) => i === 0 || bands[i - 1].win - b.win < 45), bands.map((b) => b.win).join(','));
ok('簡単すぎる区間がない：51〜100 の帯の勝率が 70% を超えない', bands.slice(5).every((b) => b.win <= 70));
ok('最終ボス（100）は、序盤のボス（10）より勝ちにくい', per[99].win <= per[9].win);
ok('ボスは、同じ帯の通常ステージより勝ちにくい傾向（10 帯の過半数）', bands.filter((b) => b.bossWin <= b.win).length >= 6, bands.map((b) => b.bossWin + '/' + b.win).join(' '));
ok('AI の行動が変わる：踏ん張りは序盤にほぼ無く、後半に増える', bands[0].act.brace < 1 && bands[9].act.brace > bands[0].act.brace + 1, bands.map((b) => b.act.brace).join(','));
ok('AI の行動が変わる：必殺技・チャージは序盤に無く、後半に使う', bands[0].act.special + bands[0].act.charge < 1.5 && bands[8].act.special + bands[8].act.charge > bands[0].act.special + bands[0].act.charge + 1.5, bands.map((b) => (b.act.special + b.act.charge).toFixed(1)).join(','));
ok('ボスごとに戦い方（行動の比率）が異なる', new Set([10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => ['dash', 'brace', 'charge', 'special'].map((k) => Math.round(per[n - 1].act[k] * 2)).join(','))).size >= 8);
return { bands, pass: R.filter((r) => r.ok).length, total: R.length, fail: R.filter((r) => !r.ok), bossRows: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => ({ n, win: Math.round(per[n - 1].win * 100), time: +per[n - 1].time.toFixed(1), act: per[n - 1].act })) };
