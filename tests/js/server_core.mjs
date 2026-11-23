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
  ok('ID を知っていても、対戦中の接続は乗っ取れない', sent.a2.at(-1).t === 'error' && sent.a2.at(-1).code === 'in_use' && lobby.conns.has('a'));
  clock += 160000;
  lobby.open('a3'); lobby.message('a3', msg({ t: 'hello', pid: pid(1), nick: 'アリス2', v: 1 }));
  ok('対戦が終わった後は、同じ ID の新しい接続に引き継げる（古い方は切れる）', sent.a.at(-1).t === 'error' && sent.a.at(-1).code === 'other_tab' && sent.a3.at(-1).t === 'welcome');
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
  clock += 1100; lobby.message('a3', msg({ t: 'rank' }));
  ok('ランキング応答', sent.a3.at(-1).t === 'ranking' && sent.a3.at(-1).list.length === 0 && sent.a3.at(-1).me.rank === null);
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
// ---- 眠り（Hibernation）からの復帰：接続と待機の状態が失われない ----
{
  const { lobby, sent, rooms, store } = mkLobby();
  const saved = {};
  lobby.o.save = (cid, d) => { saved[cid] = JSON.parse(JSON.stringify(d)); };
  for (const [c, i] of [['h1', 51], ['h2', 52]]) { lobby.open(c); lobby.message(c, msg({ t: 'hello', pid: pid(i), nick: c, v: 1 })); }
  clock += 2000;
  lobby.message('h1', msg({ t: 'find', char: 'ojisan' }));
  ok('待機中の状態が保存される', saved.h1 && saved.h1.state === 'queued' && saved.h1.q.char === 'ojisan');
  // 眠って、起きた（新しいインスタンスに、保存した状態から復元）
  const sent2 = {}, rooms2 = [];
  const lobby2 = new C.LobbyCore({ store, now, newId, rand: () => 0.3, send: (cid, m) => (sent2[cid] = sent2[cid] || []).push(m), close() {}, spawnRoom: (i) => rooms2.push(i), save() {} });
  for (const cid of Object.keys(saved)) lobby2.restoreConn(cid, saved[cid]);
  ok('復元後も待機列が残る', lobby2.queue.length === 1 && lobby2.conns.size === 2);
  clock += 1000;
  lobby2.message('h2', msg({ t: 'find', char: 'frog' }));
  ok('復元後に、待機中の人と成立する', rooms2.length === 1 && sent2.h1.at(-1).t === 'matched' && sent2.h2.at(-1).t === 'matched');
}
// ---- 無料枠を守る上限 ----
{
  const mk = (limits) => { const o = mkLobby(); o.lobby.limits = { ...o.lobby.limits, ...limits }; return o; };
  let { lobby, sent } = mk({ maxConns: 2 });
  lobby.open('x1'); lobby.open('x2'); const r3 = lobby.open('x3');
  ok('同時接続数の上限を超えたら断る', r3 === false && sent.x3[0].t === 'busy' && sent.x3[0].why === 'conns');
  ({ lobby, sent } = mk({ maxMatchesPerDay: 1 }));
  for (const [c, i] of [['d1', 61], ['d2', 62], ['d3', 63], ['d4', 64]]) { lobby.open(c); lobby.message(c, msg({ t: 'hello', pid: pid(i), nick: c, v: 1 })); }
  clock += 2000; lobby.message('d1', msg({ t: 'find', char: 'ojisan' })); lobby.message('d2', msg({ t: 'find', char: 'ojisan' }));
  clock += 2000; lobby.message('d3', msg({ t: 'find', char: 'ojisan' }));
  ok('1 日の対戦数の上限を超えたら、新しい対戦は始めない（既存の対戦は続く）', sent.d3.at(-1).t === 'busy' && sent.d3.at(-1).why === 'daily' && sent.d1.at(-1).t === 'matched');
  ({ lobby, sent } = mk({ maxActiveMatches: 1 }));
  for (const [c, i] of [['e1', 71], ['e2', 72], ['e3', 73]]) { lobby.open(c); lobby.message(c, msg({ t: 'hello', pid: pid(i), nick: c, v: 1 })); }
  clock += 2000; lobby.message('e1', msg({ t: 'find', char: 'ojisan' })); lobby.message('e2', msg({ t: 'find', char: 'ojisan' }));
  clock += 2000; lobby.message('e3', msg({ t: 'find', char: 'ojisan' }));
  ok('同時進行の対戦数の上限を超えたら断る', sent.e3.at(-1).t === 'busy' && sent.e3.at(-1).why === 'active');
}
// ---- 戦績の削除・書き込みの節約 ----
{
  const { lobby, sent, store } = mkLobby();
  let writes = 0; const put = store.put.bind(store); store.put = (p) => { writes++; put(p); };
  lobby.open('w1'); lobby.message('w1', msg({ t: 'hello', pid: pid(81), nick: 'あ', v: 1 }));
  const w1 = writes;
  lobby.close('w1'); lobby.open('w2'); lobby.message('w2', msg({ t: 'hello', pid: pid(81), nick: 'あ', v: 1 }));
  ok('同じ ID・同じ名前で再接続しても、保存（書き込み）しない', writes === w1 && w1 === 1, 'writes=' + writes);
  // 他人の戦績は消せない：erase は、この接続が hello で示した ID だけが対象（メッセージに pid を入れても無視される）
  lobby.open('w3'); lobby.message('w3', msg({ t: 'hello', pid: pid(82), nick: 'い', v: 1 }));
  lobby.message('w3', msg({ t: 'erase', pid: pid(81) }));
  ok('erase に他人の ID を書いても、自分の戦績だけが対象（他人のは消えない）', sent.w3.at(-1).t === 'erased' && store.get(pid(82)) === null && store.get(pid(81)) !== null);
  lobby.open('w4'); lobby.message('w4', msg({ t: 'erase' }));
  ok('hello の前（ID を示す前）の erase は無視される', !sent.w4 && store.get(pid(81)) !== null);
  lobby.message('w2', msg({ t: 'erase' }));
  ok('自分の戦績をサーバーから削除できる', sent.w2.at(-1).t === 'erased' && store.get(pid(81)) === null);
  // 待機中・対戦中は削除できない（対戦の途中で消されて結果が失われるのを防ぐ）
  lobby.open('w5'); lobby.message('w5', msg({ t: 'hello', pid: pid(83), nick: 'う', v: 1 }));
  clock += 2000; lobby.message('w5', msg({ t: 'find', char: 'ojisan' })); clock += 11000;
  lobby.message('w5', msg({ t: 'erase' }));
  ok('待機中は戦績を削除できない', sent.w5.at(-1).t === 'error' && sent.w5.at(-1).code === 'erase_busy' && store.get(pid(83)) !== null);
  clock += 11000; lobby.message('w3', msg({ t: 'erase' })); const n3 = sent.w3.length; clock += 1000; lobby.message('w3', msg({ t: 'erase' }));
  ok('削除は 10 秒に 1 回まで', sent.w3.length === n3);
}
// ---- 総合：3 人以上の待機・キャンセル・重複防止・切断・連投・偽のメッセージ・時間切れ ----
{
  const { lobby, sent, rooms, store } = mkLobby();
  const ids = [['q1', 101, 1500], ['q2', 102, 1530], ['q3', 103, 1800], ['q4', 104, 1790], ['q5', 105, 1100]];
  for (const [c, i, r] of ids) { lobby.open(c); lobby.message(c, msg({ t: 'hello', pid: pid(i), nick: c, v: 1 })); const pl = store.get(pid(i)); pl.rating = r; store.put(pl); }
  clock += 2000;
  for (const [c] of ids) { lobby.message(c, msg({ t: 'find', char: 'ojisan' })); clock += 900; }
  const pairs = rooms.map((r) => r.players.map((p) => p.nick).sort().join('+')).sort();
  ok('5 人の待機：近いレート同士で 2 組が成立し、残る 1 人は待つ', rooms.length === 2 && pairs.join() === 'q1+q2,q3+q4' && lobby.queue.length === 1 && lobby.queue[0].cid === 'q5', pairs.join());
  // 対戦中に、もう一度 find（重複マッチング）は拒否される
  lobby.message('q1', msg({ t: 'find', char: 'frog' }));
  ok('対戦中の二重マッチングを拒否', sent.q1.at(-1).t === 'error' && sent.q1.at(-1).code === 'in_match' && rooms.length === 2);
  // 結果が出ると、次のマッチングを受け付ける
  lobby.recordResult({ matchId: rooms[0].id, pids: rooms[0].players.map((p) => p.pid), winner: 0, reason: 'ringout', duration: 10 });
  clock += 1000; lobby.message('q1', msg({ t: 'find', char: 'frog' }));
  ok('試合が終わると、次のマッチングに入れる', sent.q1.at(-1).t === 'queued' || sent.q1.at(-1).t === 'matched');
  // キャンセルして、再度入れる
  lobby.message('q5', msg({ t: 'cancel' }));
  ok('キャンセルで待機列から外れる', sent.q5.at(-1).t === 'canceled' && !lobby.queue.some((q) => q.cid === 'q5'));
  clock += 1000; lobby.message('q5', msg({ t: 'find', char: 'sushi' }));
  ok('キャンセルのあとで、もう一度待機できる', lobby.queue.some((q) => q.cid === 'q5') || sent.q5.at(-1).t === 'matched');
}
{
  const { lobby, sent, rooms, store } = mkLobby();
  for (const [c, i] of [['r1', 111], ['r2', 112]]) { lobby.open(c); lobby.message(c, msg({ t: 'hello', pid: pid(i), nick: c, v: 1 })); }
  clock += 2000; lobby.message('r1', msg({ t: 'find', char: 'ojisan' }));
  lobby.close('r1');
  clock += 1000; lobby.message('r2', msg({ t: 'find', char: 'ojisan' }));
  ok('待機中に切断した人とは、組まれない', rooms.length === 0 && lobby.queue.length === 1 && lobby.queue[0].cid === 'r2');
}
{
  const { lobby, sent, store } = mkLobby();
  lobby.open('f1'); lobby.message('f1', msg({ t: 'hello', pid: pid(121), nick: 'f', v: 1 }));
  const n0 = sent.f1.length;
  for (let i = 0; i < 100; i++) lobby.message('f1', msg({ t: 'ping', c: i }));
  ok('連投（1 秒に 100 通）は、1 秒 20 通（hello を含む）までしか処理されない', sent.f1.length - n0 === 19, 'processed=' + (sent.f1.length - n0));
  // 偽のメッセージ：勝敗・レート・戦績をクライアントが決めようとしても、無視される
  clock += 2000;
  const before = JSON.stringify(store.get(pid(121)));
  for (const forged of [{ t: 'result', winner: 0, rating: 9999 }, { t: 'win' }, { t: 'rating', v: 3000 }, { t: 'stats', w: 99 }, { t: 'recordResult', pids: [pid(121), pid(122)], winner: 0 }, { t: 'nick', nick: { a: 1 } }, { t: 'find', char: { x: 1 } }, { t: 'hello', pid: pid(121), nick: 'f', v: 1, rating: 9999, w: 50 }]) { clock += 1000; lobby.message('f1', msg(forged)); }
  const p = store.get(pid(121));
  ok('勝敗・レート・戦績を送りつけても、保存された戦績は変わらない', p.rating === 1500 && p.w === 0 && p.l === 0 && p.games === 0, JSON.stringify(p) + ' vs ' + before);
  lobby.message('f1', 'not json'); lobby.message('f1', 'x'.repeat(5000)); lobby.message('f1', msg({ t: 123 })); lobby.message('f1', msg([1, 2]));
  ok('壊れたメッセージを送られても、サーバーは落ちない', lobby.conns.has('f1'));
}
{
  // 時間切れ（両者が何もしない）：引き分け。レートも勝敗数も動かない。二重に結果を送っても反映は 1 回
  const store = new C.MemoryStore();
  const lobby = new C.LobbyCore({ store, now, newId, rand: () => 0.3, send() {}, close() {}, spawnRoom() {} });
  store.put(C.newPlayer(pid(131), 'A')); store.put(C.newPlayer(pid(132), 'B'));
  const rs = [[], []];
  const room = new C.RoomCore({ id: 'tt', players: [{ pid: pid(131), nick: 'A', char: 'ojisan', rating: 1500, tok: 'a' }, { pid: pid(132), nick: 'B', char: 'ojisan', rating: 1500, tok: 'b' }], seed: 3, now, send: (s, m) => rs[s].push(typeof m === 'string' ? JSON.parse(m) : m), closeSlot() {}, onResult: (r) => lobby.recordResult(r) });
  room.attach(0, 'a'); room.attach(1, 'b');
  let g = 0; while (!room.ended && g++ < 3000) { clock += 33; room.tick(); }
  const e = rs[0].filter((m) => m.t === 'end').at(-1);
  ok('時間切れ（互角）：引き分けで、レートも勝敗数も動かない', room.ended && e.winner === -1 && e.reason === 'time' && e.delta === 0 && store.get(pid(131)).games === 0 && store.get(pid(131)).rating === 1500, JSON.stringify(e));
  room.finish(0, 'ringout', false);
  ok('終了後に、もう一度終わらせても二重に反映されない', store.get(pid(131)).games === 0 && store.get(pid(131)).w === 0);
  // 入力：参加していないスロット・終了後の入力は無視
  const room2 = new C.RoomCore({ id: 'tt2', players: [{ pid: pid(131), nick: 'A', char: 'ojisan', rating: 1500, tok: 'a' }, { pid: pid(132), nick: 'B', char: 'ojisan', rating: 1500, tok: 'b' }], seed: 3, now, send() {}, closeSlot() {}, onResult: () => null });
  room2.input(0, { t: 'in', mx: 1, my: 1, b: 15 });
  ok('部屋に入る前の入力は無視される', room2.edge[0] === 0 && room2.hold[0].mx === 0);
}
return { pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok), total: results.length };
