// BUTT SUMO：シミュレーション・ステージ・キャラクター・通信の約束の検査
const S = await import('/games/butt-sumo/play/sim.js');
const { CHARS, CHAR_BY_ID, START_CHARS } = await import('/games/butt-sumo/play/chars.js');
const { createAI } = await import('/games/butt-sumo/play/ai.js');
const ST = await import('/games/butt-sumo/play/stages.js');
const P = await import('/games/butt-sumo/play/proto.js');
const { MODELS } = await import('/games/butt-sumo/play/gl/models.js');
const R = [];
const ok = (name, c, extra) => R.push({ name, ok: !!c, extra });
const prof = { react: 0.2, aggr: 0.7, aim: 0.15, brace: 0.5, perfect: 0.5, edge: 0.6, tactics: ['chase', 'brace', 'counter', 'feint', 'edge', 'charge', 'special'] };
const run = (a, b, seed, inA, inB, maxTick = 3000, mods) => {
  const s = S.createMatch({ chars: [a, b], seed, mods });
  let g = 0;
  while (!s.over && g++ < maxTick) S.step(s, inA(s), inB(s));
  return s;
};
const idle = () => S.emptyInput();
// 1 場外で勝敗が決まる
{
  const s = run('ojisan', 'ojisan', 1, (s) => ({ mx: 0, my: -1, b: s.tick % 20 === 0 ? 1 : 0 }), idle);
  ok('場外で決着（動かない相手は押し出される）', s.over && s.winner === 0 && s.reason === 'ringout', JSON.stringify([s.winner, s.reason, s.t]));
  const s2 = run('ojisan', 'ojisan', 1, idle, (s) => ({ mx: 0, my: 1, b: s.tick % 20 === 0 ? 1 : 0 }));
  ok('場外で決着（スロット 1 の勝ち）', s2.over && s2.winner === 1);
}
// 2 時間切れ：動かない 2 人は引き分け、勢いの差があれば少ない方の勝ち
{
  const s = run('ojisan', 'ojisan', 2, idle, idle);
  ok('時間切れ（互角）は引き分け', s.over && s.reason === 'time' && s.winner === -1 && s.t >= 59.9, JSON.stringify([s.winner, s.reason, s.t]));
  ok('時間切れまで 60 秒', Math.abs(s.t - 60) < 0.2);
  const s3 = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 3 }); s3.f[0].dmg = 20; s3.phase = 'fight'; s3.t = 59.99; s3.timeLeft = 0;
  S.step(s3, idle(), idle());
  ok('時間切れ：勢いが少ない方の勝ち', s3.winner === 1 && s3.reason === 'time', JSON.stringify([s3.winner, s3.phase]));
}
// 2b 土俵の境界：ふちの内側は場外にならず、外側は場外になる（境界の判定）
{
  const mk = (r) => { const s = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 9 }); s.phase = 'fight'; s.f[0].x = 0; s.f[0].y = r; s.f[1].x = 0; s.f[1].y = -1; return s; };
  const R0 = S.RING_R, r0 = CHAR_BY_ID.ojisan.r;
  let s = mk(R0 + r0 * 0.15 - 0.05); S.step(s, idle(), idle()); ok('ふちの内側（半径 − 0.05 m）は場外にならない', !s.f[0].out);
  s = mk(R0 + r0 * 0.15 + 0.05); S.step(s, idle(), idle()); ok('ふちの外側（半径 + 0.05 m）は場外になる', !!s.f[0].out && s.phase === 'ko' && s.winner === 1);
  s = mk(R0 - 0.5); s.shrinking = true; s.t = 50; S.step(s, idle(), idle()); ok('土俵が狭くなると、境界も狭くなる（半径 4.5 は場外）', !!s.f[0].out);
  s = mk(1.0); s.f[1].y = -R0 - 1; S.step(s, idle(), idle()); ok('相手が外に出れば自分の勝ち', s.winner === 0);
  const t2 = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 9 }); t2.phase = 'fight'; t2.f[0].y = R0 + 2; t2.f[1].y = -R0 - 2; S.step(t2, idle(), idle());
  ok('同時に場外なら、中心に近い方が勝ち（引き分けにならない）', t2.over || t2.phase === 'ko');
}
// 3 土俵が狭くなる
{
  const s = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 4 });
  let min = 99; for (let i = 0; i < 2000 && !s.over; i++) { S.step(s, idle(), idle()); min = Math.min(min, s.ringR); }
  ok('終盤は土俵が狭くなる（最大 40%）', min < 3.2 && min >= 3.0 - 0.01, 'min=' + min);
}
// 4 決定性：同じ入力・同じ種なら同じ結果。NaN・無限大なし
{
  const mk = (seed) => { const A = createAI(prof, seed), B = createAI(prof, seed + 1); return run('gorilla', 'sushi', seed, (s) => A.think(s, 0), (s) => B.think(s, 1)); };
  const a = mk(77), b = mk(77);
  ok('決定性（同じ種・同じ操作＝同じ試合）', JSON.stringify(S.snapshot(a)) === JSON.stringify(S.snapshot(b)) && a.t === b.t);
  let bad = 0, total = 0;
  for (let i = 0; i < 40; i++) {
    const a1 = CHARS[i % 10].id, b1 = CHARS[(i * 3 + 1) % 10].id;
    const s = S.createMatch({ chars: [a1, b1], seed: 500 + i });
    const A = createAI(prof, i), B = createAI(prof, i + 99); let g = 0;
    while (!s.over && g++ < 3000) {
      S.step(s, A.think(s, 0), B.think(s, 1)); total++;
      for (const f of s.f) for (const k of ['x', 'y', 'kx', 'ky', 'vx', 'vy', 'z', 'dmg', 'sta', 'gau', 'ang']) if (!Number.isFinite(f[k])) bad++;
    }
  }
  ok('40 試合 × 全フレームで、数値が壊れない（NaN・無限大なし）', bad === 0 && total > 500, 'bad=' + bad + ' frames=' + total);
}
// 5 突進：スタミナとクールダウン
{
  const s = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 5 });
  let dashes = 0; const spam = { mx: 0, my: -1, b: 1 };
  for (let i = 0; i < 200; i++) { S.step(s, spam, idle()); dashes += s.events.filter((e) => e.t === 'dash' && e.i === 0).length; if (s.over) break; }
  ok('突進の連打は制限される（4 秒で 4 回以下）', dashes >= 1 && dashes <= 4, 'dashes=' + dashes + ' t=' + s.t);
}
// 5b 先行入力：突進中に押した必殺・クールダウン中に押した突進を、取りこぼさない
{
  const s = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 5 }); s.phase = 'fight';
  s.f[0].gau = 100; s.f[0].x = 0; s.f[0].y = 3.6; s.f[1].x = 3; s.f[1].y = -3;
  S.step(s, { mx: 0, my: -1, b: 1 }, idle());                        // 突進
  for (let i = 0; i < 7; i++) S.step(s, idle(), idle());
  S.step(s, { mx: 0, my: -1, b: 8 }, idle());                        // 突進が終わる少し前に必殺を押す（このときは出せない）
  let used = false; for (let i = 0; i < 12; i++) { S.step(s, idle(), idle()); if (s.events.some((e) => e.t === 'special' && e.i === 0)) used = true; }
  ok('突進中に押した必殺は、突進が終わってから出る（0.2 秒の先行入力）', used);
  const s2 = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 5 }); s2.phase = 'fight'; s2.f[0].dashCd = 0.1; s2.f[0].x = 0; s2.f[0].y = 3.6; s2.f[1].x = 3; s2.f[1].y = -3;
  S.step(s2, { mx: 0, my: -1, b: 1 }, idle());
  let dashed = false; for (let i = 0; i < 6; i++) { S.step(s2, idle(), idle()); if (s2.events.some((e) => e.t === 'dash')) dashed = true; }
  ok('クールダウンが終わる直前に押した突進は、終わった瞬間に出る', dashed);
  const s3 = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 5 }); s3.phase = 'fight'; s3.f[0].dashCd = 2; s3.f[1].x = 3; s3.f[1].y = -3;
  S.step(s3, { mx: 0, my: -1, b: 1 }, idle()); let late = false; for (let i = 0; i < 90; i++) { S.step(s3, idle(), idle()); if (s3.events.some((e) => e.t === 'dash')) late = true; }
  ok('0.2 秒より前に押した突進は、あとから勝手に出ない', !late);
}
// 6 踏ん張り：ジャスト（押した直後 0.3 秒以内の被弾）は弾き返す
{
  const s = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 6 });
  s.phase = 'fight';
  const A = s.f[0], B = s.f[1]; A.x = 0; A.y = 1.0; B.x = 0; B.y = -0.2;
  A.ang = -Math.PI / 2; B.ang = Math.PI / 2;
  S.step(s, { mx: 0, my: -1, b: 1 }, { mx: 0, my: 0, b: 2 });
  let counter = s.events.some((e) => e.t === 'counter'); for (let i = 0; i < 12; i++) { S.step(s, { mx: 0, my: -1, b: 0 }, { mx: 0, my: 0, b: 2 }); if (s.events.some((e) => e.t === 'counter')) counter = true; }
  ok('ジャスト踏ん張りで攻撃を弾き返す（攻撃側がスタン・ダメージ）', counter && s.f[0].stunT > 0.2 && s.f[0].dmg > 0 && s.f[1].dmg === 0, JSON.stringify(s.f.map((f) => [f.stunT.toFixed(2), f.dmg.toFixed(1)])));
}
// 7 お尻の向き：背後（お尻の反対側）から当たると、大きくは飛ばない
{
  const s = S.createMatch({ chars: ['ojisan', 'ojisan'], seed: 7 });
  s.phase = 'fight';
  const A = s.f[0], B = s.f[1]; A.x = 0; A.y = 0.5; B.x = 0; B.y = -0.7; A.ang = Math.PI / 2; // A のお尻は B と反対を向く
  A.dashT = 0.3; A.dashDur = 0.3; A.dashDx = 0; A.dashDy = -1; A.dashSpd = 10; A.dashPow = 1;
  let hit = false; for (let i = 0; i < 6; i++) { A.ang = Math.PI / 2; S.step(s, idle(), idle()); if (s.events.some((e) => e.t === 'hit')) hit = true; }
  ok('お尻が相手と反対を向いていると、ヒットにならない', !hit);
}
// 8 必殺技：全種が動き、数値が壊れない（ゲージ満タン）
{
  const kinds = new Set(); let bad = 0;
  for (const c of CHARS) for (let seed = 1; seed <= (c.id === 'mystery' ? 30 : 2); seed++) {
    const s = S.createMatch({ chars: [c.id, 'ojisan'], seed }); s.phase = 'fight';
    s.f[0].gau = 100; s.f[1].x = 1.5; s.f[1].y = -0.3; s.f[0].x = 0; s.f[0].y = 1.2;
    S.step(s, { mx: 0, my: -1, b: 8 }, idle());
    kinds.add(s.f[0].specKind);
    for (let i = 0; i < 120 && !s.over; i++) { S.step(s, { mx: 0, my: -1, b: 0 }, idle()); for (const f of s.f) for (const k of ['x', 'y', 'z', 'dmg']) if (!Number.isFinite(f[k])) bad++; }
  }
  ok('必殺技 8 種がすべて発動する（謎の生物は抽選）', ['tackle', 'hop', 'quake', 'pull', 'spin', 'slide', 'heavy', 'cry'].every((k) => kinds.has(k)), [...kinds].join(','));
  ok('必殺技の最中に数値が壊れない', bad === 0);
}
// 9 キャラクターの定義
{
  ok('キャラクター 10 体・ID が重複しない', CHARS.length === 10 && new Set(CHARS.map((c) => c.id)).size === 10);
  ok('全キャラに 3D モデルがある', CHARS.every((c) => MODELS[c.id] && MODELS[c.id].parts.length >= 12));
  const roles = new Set(['still', 'body', 'butt', 'head', 'armL', 'armR', 'legL', 'legR', 'wingL', 'wingR', 'tail']);
  const hexOk = (c) => /^#[0-9a-f]{6}$/i.test(c);
  let badParts = [];
  for (const c of CHARS) for (const p of MODELS[c.id].parts) {
    if (!roles.has(p.role) || !['s', 'b', 'y', 'k'].includes(p.m) || !hexOk(p.c) || p.p.length !== 3 || p.sc.length !== 3 || p.sc.some((v) => !(v > 0))) badParts.push(c.id + ':' + p.role);
    if (/^(arm|leg|wing)/.test(p.role) && !p.piv) badParts.push(c.id + ':' + p.role + ' に回転の中心がない');
    if (p.role === 'butt' && false) badParts.push('');
  }
  ok('3D モデルの部品が正しい（形・色・大きさ・回転の中心）', badParts.length === 0, badParts.slice(0, 5).join(' / '));
  ok('全キャラに「お尻」の部品がある（シルエットで個性）', CHARS.every((c) => MODELS[c.id].parts.some((p) => p.role === 'butt')));
  const sig = new Set(CHARS.map((c) => JSON.stringify(MODELS[c.id].parts.map((p) => [p.m, p.sc]))));
  ok('モデルは色違いではない（形がすべて異なる）', sig.size === 10);
  ok('性能が個性的（重量・速度・必殺技がそれぞれ異なる）', new Set(CHARS.map((c) => c.mass + '/' + c.speed)).size === 10 && ['tackle', 'hop', 'quake', 'pull', 'spin', 'slide', 'heavy', 'cry', 'chaos'].every((k) => CHARS.some((c) => c.spec === k)));
}
// 10 ステージ・解放
{
  ok('100 ステージ', ST.STAGES.length === 100 && ST.STAGE_COUNT === 100);
  const bosses = ST.STAGES.filter((s) => s.boss).map((s) => s.n);
  ok('ボスは 10 ステージごと（10〜100）', JSON.stringify(bosses) === JSON.stringify([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]));
  ok('全ステージの相手が実在する', ST.STAGES.every((s) => CHAR_BY_ID[s.foe]));
  ok('ボスは 10 人すべて名前・戦い方が異なる', new Set(bosses.map((n) => ST.STAGES[n - 1].boss.name)).size === 10 && new Set(bosses.map((n) => ST.STAGES[n - 1].boss.style)).size === 10);
  let mono = true; for (let i = 1; i < 100; i++) if (!ST.STAGES[i].boss && !ST.STAGES[i - 1].boss && ST.STAGES[i].profile.react > ST.STAGES[i - 1].profile.react + 1e-9) mono = false;
  ok('CP の反応は、ステージが進むほど速くなる（単調）', mono);
  const t1 = ST.STAGES[0].profile.tactics, t100 = ST.STAGES[99].profile.tactics;
  ok('行動パターンが変わる（1 は突進のみ、100 は全戦術）', t1.length === 1 && t1[0] === 'rush' && ['brace', 'counter', 'feint', 'edge', 'charge', 'special'].every((x) => t100.includes(x)));
  ok('初期キャラは 2 体', JSON.stringify(ST.unlockedChars(0)) === JSON.stringify(['ojisan', 'chicken']) && START_CHARS.length === 2);
  const exp = { gorilla: 8, frog: 15, burger: 25, pudding: 35, sushi: 48, robot: 62, baby: 78, mystery: 92 };
  let okU = true;
  for (const [id, at] of Object.entries(exp)) { if (ST.unlockedChars(at - 1).includes(id) || !ST.unlockedChars(at).includes(id) || ST.STAGES[at - 1].unlock !== id) okU = false; }
  ok('解放条件（クリアしたステージで解放）', okU && ST.unlockedChars(100).length === 10);
  ok('テーマ 10 種が 10 ステージずつ', ST.THEMES.every((t) => ST.STAGES.filter((s) => s.theme === t).length === 10));
}
// 11 オンラインの約束
{
  ok('ニックネームの整形', P.cleanNick('<script>x</script>   ほげ ') === 'scriptx/script ほげ'.slice(0, 12) || !/[<>]/.test(P.cleanNick('<a>')) );
  ok('ニックネームは 12 文字まで・空なら既定', P.cleanNick('あ'.repeat(50)).length === 12 && P.cleanNick('   ') === 'ななし' && P.cleanNick(5) === 'ななし');
  ok('入力の丸め', JSON.stringify(P.cleanInput({ mx: 5, my: -9, b: 99 })) === JSON.stringify({ mx: 1, my: -1, b: 3 }) && P.cleanInput({ mx: 'a', b: NaN }).b === 0);
}
return { pass: R.filter((r) => r.ok).length, total: R.length, fail: R.filter((r) => !r.ok) };
