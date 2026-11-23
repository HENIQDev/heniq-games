// サーバーのコア（部屋・マッチング・レート）を、偽の通信で検査する
const C = await import('/server/butt-sumo/core.js');
const P = await import('/games/butt-sumo/play/proto.js');
const results = [];
const ok = (name, cond, extra) => results.push({ name, ok: !!cond, extra });
let clock = 1000000;
const now = () => clock;
let idn = 0;
const newId = (n) => (++idn).toString(16).padStart(n, '0');
const pid = (i) => i.toString(16).padStart(32, '0');
function mkLobby() {
  const sent = {}, closed = [], rooms = [], store = new C.MemoryStore();
  const lobby = new C.LobbyCore({ store, now, newId, rand: () => 0.3, send: (cid, m) => (sent[cid] = sent[cid] || []).push(m), close: (cid) => closed.push(cid), spawnRoom: (info) => rooms.push(info) });
  return { lobby, sent, closed, rooms, store };
}
const msg = (o) => JSON.stringify(o);
{
  const { lobby, sent, rooms, store } = mkLobby();
  lobby.open('a'); lobby.open('b'); lobby.open('c');
  lobby.message('a', msg({ t: 'find', char: 'ojisan' }));
  ok('hello 前の find は無視', !sent.a);
  lobby.message('a', msg({ t: 'hello', pid: pid(1), nick: 'アリス', v: 1 }));
  lobby.message('b', msg({ t: 'hello', pid: pid(2), nick: '<b>ボブ</b>', v: 1 }));
  ok('welcome', sent.a[0].t === 'welcome' && sent.a[0].me.rating === 1500);
  ok('ニックネームの記号を除去', !/[<>]/.test(sent.b[0].me.nick), sent.b[0].me.nick);
  lobby.message('c', msg({ t: 'hello', pid: 'bad', v: 1 })); ok('不正な pid は拒否', sent.c[0].t === 'error');
  lobby.message('a', msg({ t: 'find', char: 'nonexistent' })); ok('不正なキャラは拒否', sent.a[1].t === 'error');
  clock += 2000;
  lobby.message('a', msg({ t: 'find', char: 'ojisan' }));
  ok('queued', sent.a[2].t === 'queued' && rooms.length === 0);
  lobby.message('b', msg({ t: 'find', char: 'gorilla' }));
  ok('2 人で成立', rooms.length === 1 && sent.a.at(-1).t === 'matched' && sent.b.at(-1).t === 'matched');
  const ma = sent.a.at(-1), mb = sent.b.at(-1);
  ok('部屋・トークン・相手情報', ma.room === mb.room && ma.tok !== mb.tok && ma.opp.nick !== undefined && !('pid' in ma.opp) && ma.slot !== mb.slot);
  // 同一 pid は対戦できない
  lobby.open('a2'); lobby.message('a2', msg({ t: 'hello', pid: pid(1), nick: 'アリス2', v: 1 }));
  ok('同じ pid の 2 つ目の接続が、古い方を切る', sent.a.at(-1).t === 'error' && sent.a.at(-1).code === 'other_tab');
  // ---- 部屋 ----
  const info = rooms[0];
  const rsent = [[], []];
  const room = new C.RoomCore({ id: info.id, players: info.players, seed: info.seed, now, send: (s, m) => rsent[s].push(typeof m === 'string' ? JSON.parse(m) : m), closeSlot() {}, onResult: (r) => lobby.recordResult(r) });
  ok('誤ったトークンは拒否', room.attach(0, 'wrong') === false);
  ok('正しいトークンで参加', room.attach(0, info.players[0].tok) && room.attach(1, info.players[1].tok));
  // 試合を最後まで：スロット 0 が前進し突進、スロット 1 は何もしない
  let guard = 0;
  while (!room.ended && guard++ < 3000) {
    clock += 33;
    room.input(0, { t: 'in', mx: 0, my: -1, b: guard % 25 === 0 ? 1 : 0 });
    room.tick();
  }
  ok('試合が終わる', room.ended, room.status);
  const end0 = rsent[0].filter((m) => m.t === 'end').at(-1), end1 = rsent[1].filter((m) => m.t === 'end').at(-1);
  ok('終了メッセージ（両者）', end0 && end1 && end0.winner === end1.winner);
  ok('レートが動く（勝者＋・敗者−）', end0.winner >= 0 ? (end0.winner === 0 ? end0.delta > 0 && end1.delta < 0 : end1.delta > 0 && end0.delta < 0) : true, JSON.stringify([end0.delta, end1.delta]));
  const pa = store.get(pid(1)), pb = store.get(pid(2));
  ok('戦績が保存される', pa.games === 1 && pb.games === 1 && pa.w + pb.w === 1, JSON.stringify([pa, pb]));
  ok('スナップショットが届く', rsent[0].filter((m) => m.t === 's').length > 50 && rsent[1].filter((m) => m.t === 's').length > 50);
  // 結果の二重報告は無効
  const again = lobby.recordResult({ matchId: info.id, pids: [pid(1), pid(2)], winner: 0, reason: 'x', duration: 1 });
  ok('同じ試合の結果は二重に反映されない', again.deltas[0] === 0 && store.get(pid(1)).games === 1);
  // ランキング（3 試合未満は載らない）
  clock += 1100; lobby.message('a2', msg({ t: 'rank' }));
  ok('ランキング応答', sent.a2.at(-1).t === 'ranking' && sent.a2.at(-1).list.length === 0 && sent.a2.at(-1).me.rank === null);
}
// ---- 切断と復帰、放棄 ----
{
  const { lobby, rooms, store } = mkLobby();
  const sentR = [[], []];
  const mk = () => {
    const info = { id: 'r1', seed: 5, players: [{ pid: pid(11), nick: 'A', char: 'ojisan', rating: 1500, tok: 't0' }, { pid: pid(12), nick: 'B', char: 'frog', rating: 1500, tok: 't1' }] };
    for (const p of info.players) store.put(C.newPlayer(p.pid, p.nick));
    return new C.RoomCore({ id: 'r1', players: info.players, seed: 5, now, send: (s, m) => sentR[s].push(typeof m === 'string' ? JSON.parse(m) : m), closeSlot() {}, onResult: (r) => lobby.recordResult(r) });
  };
  let room = mk();
  room.attach(0, 't0'); room.attach(1, 't1');
  for (let i = 0; i < 100; i++) { clock += 33; room.tick(); }
  room.detach(1);
  ok('相手に切断が伝わる', sentR[0].some((m) => m.t === 'opp' && m.status === 'away'));
  for (let i = 0; i < 90; i++) { clock += 33; room.tick(); }
  ok('猶予内は試合が続く', !room.ended);
  room.attach(1, 't1');
  ok('復帰できる（再接続）', sentR[0].some((m) => m.t === 'opp' && m.status === 'back') && room.present[1]);
  room.detach(1);
  clock += 11000; room.tick();
  ok('猶予を過ぎると、切断した側が負け', room.ended && room.endMsg[0].winner === 0 && room.endMsg[0].reason === 'forfeit');
  ok('放棄でもレートに反映', store.get(pid(12)).l === 1 && store.get(pid(11)).w === 1);
  // 片方が来なかった → 無効試合（レートは動かない）
  room = mk();
  room.attach(0, 't0');
  clock += 16000; room.tick();
  ok('相手が来ないと無効（レート変化なし）', room.ended && room.endMsg[0].void && store.get(pid(11)).games === 0 && store.get(pid(11)).rating === 1500);
}
// ---- 不正な入力 ----
{
  const store = new C.MemoryStore();
  const info = { id: 'x', seed: 9, players: [{ pid: pid(21), nick: 'A', char: 'ojisan', rating: 1500, tok: 'a' }, { pid: pid(22), nick: 'B', char: 'ojisan', rating: 1500, tok: 'b' }] };
  const rs = [[], []];
  const room = new C.RoomCore({ id: 'x', players: info.players, seed: 9, now, send: (s, m) => rs[s].push(typeof m === 'string' ? JSON.parse(m) : m), closeSlot() {}, onResult: () => null });
  room.attach(0, 'a'); room.attach(1, 'b');
  for (let i = 0; i < 80; i++) { clock += 33; room.tick(); }
  const f0 = { ...room.sim.f[0] };
  room.input(0, { t: 'in', mx: 9999, my: NaN, b: 0xffff });
  ok('入力は丸められる', Math.abs(room.hold[0].mx) <= 1 && room.hold[0].my === 0 && room.hold[0].b <= 6 && room.edge[0] <= 9);
  for (let i = 0; i < 200; i++) room.input(0, { t: 'in', mx: 1, my: 0, b: 1 });
  ok('入力の連投は制限される', room.msgCount[0] > 100);
  // 突進を連打しても、スタミナとクールダウンで制限される
  let dashes = 0;
  for (let i = 0; i < 60; i++) { clock += 33; room.msgCount = [0, 0]; room.input(0, { t: 'in', mx: 0, my: -1, b: 1 }); room.tick(); const last = rs[0].at(-1); if (last && last.ev) dashes += last.ev.filter((e) => e.t === 'dash' && e.i === 0).length; }
  ok('突進の連打は、スタミナとクールダウンで制限（2 秒で最大 3 回）', dashes <= 3, 'dashes=' + dashes);
  ok('不正なメッセージは捨てる', P.parseMsg('x'.repeat(1000)) === null && P.parseMsg('{"a":1}') === null && P.parseMsg('not json') === null);
}
// ---- レートの計算 ----
{
  ok('Elo：同格の勝ちは +20（新人 K=40）', C.eloDelta(1500, 1500, 1, 0) === 20);
  ok('Elo：格上に勝つと大きい', C.eloDelta(1400, 1700, 1, 20) > 15);
  ok('Elo：格下に負けると大きく下がる', C.eloDelta(1700, 1400, 0, 20) < -15);
  // 同じ 2 人の連戦はレートが動かない（5 戦目から）
  const { lobby, store } = mkLobby();
  store.put(C.newPlayer(pid(31), 'A')); store.put(C.newPlayer(pid(32), 'B'));
  const d = [];
  for (let i = 0; i < 6; i++) d.push(lobby.recordResult({ matchId: 'm' + i, pids: [pid(31), pid(32)], winner: 0, reason: 'ringout', duration: 10 }).deltas[0]);
  ok('同じ組み合わせの連戦は、5 戦目からレートが動かない', d.slice(0, 4).every((x) => x > 0) && d[4] === 0 && d[5] === 0, JSON.stringify(d));
}
// ---- マッチングの待ち時間 ----
{
  const { lobby, sent, rooms, store } = mkLobby();
  for (const [c, i, r] of [['p', 41, 1500], ['q', 42, 2100]]) { lobby.open(c); lobby.message(c, msg({ t: 'hello', pid: pid(i), nick: c, v: 1 })); const pl = store.get(pid(i)); pl.rating = r; store.put(pl); }
  clock += 2000; lobby.message('p', msg({ t: 'find', char: 'ojisan' })); lobby.message('q', msg({ t: 'find', char: 'frog' }));
  ok('レート差が大きいと、すぐには組まない', rooms.length === 0);
  clock += 36000; lobby.pump();
  ok('待つと、差が大きくても組まれる', rooms.length === 1);
  lobby.open('z'); lobby.message('z', msg({ t: 'hello', pid: pid(43), nick: 'z', v: 1 })); clock += 2000; lobby.message('z', msg({ t: 'find', char: 'sushi' }));
  clock += 50000; lobby.pump();
  ok('相手が見つからなければ noopp', sent.z.at(-1).t === 'noopp');
}
return { pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok), total: results.length };
