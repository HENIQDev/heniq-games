// BUTT SUMO オンライン対戦のサーバー側ロジック（通信の方法に依存しない）。
// Cloudflare Workers（worker.js）でも、開発用のブラウザ上のホスト（devhost.js）でも、この同じコードが動く。
// ・勝敗は、サーバーが sim.js の step() を実行して決める（クライアントの報告は使わない）。
// ・レートと戦績は、サーバーだけが更新する。
import { createMatch, step, snapshot, emptyInput, TICK } from '../../games/butt-sumo/play/sim.js';
import { PROTO, cleanNick, validPid, validChar, parseMsg, cleanInput, MATCH_JOIN_TIMEOUT, RECONNECT_GRACE, QUEUE_TIMEOUT } from '../../games/butt-sumo/play/proto.js';

export const START_RATING = 1500;
export const MIN_RATING = 100;
const MAX_TICKS = TICK * (60 + 12) + TICK * 12;     // 異常に長引く試合の打ち切り

export function eloDelta(ra, rb, score, games) {
  const exp = 1 / (1 + Math.pow(10, (rb - ra) / 400));
  const k = games < 10 ? 40 : 24;
  return Math.round(k * (score - exp));
}

// ---- 戦績の保存（メモリ版。Cloudflare 版は worker.js が SQLite で同じ形を実装する） ----
export class MemoryStore {
  constructor() { this.players = new Map(); this.results = new Set(); this.pairs = []; }
  get(pid) { return this.players.get(pid) || null; }
  put(p) { this.players.set(p.pid, p); }
  top(n) {
    return [...this.players.values()].filter((p) => p.games >= 3).sort((a, b) => b.rating - a.rating || b.w - a.w).slice(0, n);
  }
  rankOf(p) {
    if (p.games < 3) return null;
    return 1 + [...this.players.values()].filter((q) => q.games >= 3 && (q.rating > p.rating || (q.rating === p.rating && q.w > p.w))).length;
  }
  count() { return this.players.size; }
  hasResult(id) { return this.results.has(id); }
  addResult(id) { this.results.add(id); if (this.results.size > 5000) this.results.delete(this.results.values().next().value); }
  recentPair(a, b, now, windowMs) { const key = a < b ? a + b : b + a; return this.pairs.filter((x) => x.key === key && now - x.at < windowMs).length; }
  addPair(a, b, now) { const key = a < b ? a + b : b + a; this.pairs.push({ key, at: now }); if (this.pairs.length > 2000) this.pairs.shift(); }
}

export function newPlayer(pid, nick) {
  return { pid, nick, rating: START_RATING, w: 0, l: 0, streak: 0, best: 0, games: 0 };
}
export const publicStats = (p) => ({ nick: p.nick, rating: p.rating, w: p.w, l: p.l, streak: p.streak, best: p.best, games: p.games });

// ---- 部屋（1 試合） ----
export class RoomCore {
  // opts: { id, players: [{ pid, nick, char, rating, tok }], seed, send(slot, obj), closeSlot(slot), now(), onResult(res) -> deltas }
  constructor(o) {
    this.o = o; this.id = o.id; this.players = o.players;
    this.sim = createMatch({ chars: [o.players[0].char, o.players[1].char], seed: o.seed });
    this.present = [false, false]; this.awayAt = [0, 0]; this.joined = [false, false];
    this.hold = [emptyInput(), emptyInput()]; this.edge = [0, 0]; this.msgCount = [0, 0]; this.msgSec = 0;
    this.status = 'waiting'; this.createdAt = o.now(); this.ticks = 0; this.ended = false; this.endMsg = null;
  }
  attach(slot, tok) {
    const p = this.players[slot];
    if (!p || tok !== p.tok) return false;
    this.present[slot] = true; this.joined[slot] = true; this.awayAt[slot] = 0;
    this.o.send(slot, { t: 'start', proto: PROTO, slot, chars: [this.players[0].char, this.players[1].char], names: [this.players[0].nick, this.players[1].nick], ratings: [this.players[0].rating, this.players[1].rating], seed: this.o.seed, tick: TICK, status: this.status });
    if (this.ended && this.endMsg) this.o.send(slot, this.endMsg[slot]);
    if (this.status === 'waiting' && this.present[0] && this.present[1]) this.status = 'running';
    else if (this.status === 'running') this.o.send(1 - slot, { t: 'opp', status: 'back' });
    return true;
  }
  detach(slot) {
    if (!this.present[slot]) return;
    this.present[slot] = false; this.awayAt[slot] = this.o.now();
    if (this.status === 'running') this.o.send(1 - slot, { t: 'opp', status: 'away', grace: RECONNECT_GRACE });
  }
  input(slot, m) {
    if (this.status !== 'running' || !this.present[slot]) return;
    this.msgCount[slot]++;
    if (this.msgCount[slot] > 100) return;       // 1 秒に 100 通を超える入力は捨てる
    const c = cleanInput(m);
    this.hold[slot] = { mx: c.mx, my: c.my, b: c.b & 6 };            // 踏ん張り・チャージは「押している間」
    this.edge[slot] |= c.b & 9;                                      // 突進・必殺は「押した瞬間」（次の 1 ステップで使う）
  }
  tick() {
    const now = this.o.now();
    if (this.ended) return;
    if (this.status === 'waiting') {
      if (now - this.createdAt > MATCH_JOIN_TIMEOUT * 1000) this.finish(-1, 'void', true);
      return;
    }
    if (this.msgSec !== Math.floor(now / 1000)) { this.msgSec = Math.floor(now / 1000); this.msgCount = [0, 0]; }
    // 切断の処理（猶予のあと、負けにする）
    for (let i = 0; i < 2; i++) {
      if (!this.present[i] && this.awayAt[i] && now - this.awayAt[i] > RECONNECT_GRACE * 1000 && !this.sim.over) {
        const other = 1 - i;
        if (this.present[other] || this.awayAt[other] === 0) return this.finish(other, 'forfeit', false);
        if (!this.present[other] && now - this.awayAt[other] > RECONNECT_GRACE * 1000) return this.finish(-1, 'void', true);
      }
    }
    const ins = [0, 1].map((i) => {
      const h = this.present[i] ? this.hold[i] : emptyInput();
      const r = { mx: h.mx, my: h.my, b: h.b | this.edge[i] };
      this.edge[i] = 0;
      return r;
    });
    step(this.sim, ins[0], ins[1]);
    this.ticks++;
    const snap = snapshot(this.sim);
    const text = JSON.stringify(Object.assign({ t: 's' }, snap));
    for (let i = 0; i < 2; i++) if (this.present[i]) this.o.send(i, text);
    if (this.sim.over) this.finish(this.sim.winner, this.sim.reason, false);
    else if (this.ticks > MAX_TICKS) this.finish(-1, 'draw', false);
  }
  finish(winner, reason, isVoid) {
    if (this.ended) return;
    this.ended = true; this.status = 'ended';
    const duration = this.sim.t;
    const fallback = { deltas: [0, 0], ratings: [this.players[0].rating, this.players[1].rating], stats: [null, null] };
    const done = (res) => {
      res = res || fallback;
      this.endMsg = [0, 1].map((i) => ({ t: 'end', winner, reason, void: !!isVoid, you: i, delta: res.deltas[i], rating: res.ratings[i], stats: res.stats[i] }));
      for (let i = 0; i < 2; i++) if (this.present[i]) this.o.send(i, this.endMsg[i]);
      this.closeAt = this.o.now() + 4000;
    };
    this.closeAt = this.o.now() + 8000;
    if (isVoid) return done(null);
    try {
      const r = this.o.onResult({ matchId: this.id, pids: [this.players[0].pid, this.players[1].pid], winner, reason, duration });
      if (r && typeof r.then === 'function') r.then(done, () => done(null)); else done(r);   // 結果の保存に失敗しても、試合の終了は伝える
    } catch (e) { done(null); }
  }
  get done() { return this.ended && this.o.now() > this.closeAt; }
}

// ---- ロビー（マッチングと戦績） ----
export class LobbyCore {
  // opts: { store, send(cid, obj), close(cid), now(), rand() -> 0..1, newId(n) -> hex, spawnRoom(info) }
  constructor(o) { this.o = o; this.store = o.store; this.conns = new Map(); this.queue = []; this.byPid = new Map(); this.lastFind = new Map(); }
  open(cid) { this.conns.set(cid, { cid, pid: null, nick: null, state: 'new', msgs: 0, sec: 0 }); }
  close(cid) {
    const c = this.conns.get(cid);
    if (!c) return;
    this.queue = this.queue.filter((q) => q.cid !== cid);
    if (c.pid && this.byPid.get(c.pid) === cid) this.byPid.delete(c.pid);
    this.conns.delete(cid);
  }
  online() { return this.conns.size; }
  message(cid, raw) {
    const c = this.conns.get(cid);
    if (!c) return;
    const now = this.o.now();
    if (c.sec !== Math.floor(now / 1000)) { c.sec = Math.floor(now / 1000); c.msgs = 0; }
    if (++c.msgs > 20) return;                              // 1 秒に 20 通まで
    const m = parseMsg(raw);
    if (!m) return;
    if (m.t === 'ping') return this.o.send(cid, { t: 'pong', c: typeof m.c === 'number' ? m.c : 0, online: this.online() });
    if (m.t === 'hello') return this.hello(c, m);
    if (c.state === 'new') return;                          // hello の前は何も受け付けない
    if (m.t === 'find') return this.find(c, m);
    if (m.t === 'cancel') { this.queue = this.queue.filter((q) => q.cid !== cid); return this.o.send(cid, { t: 'canceled' }); }
    if (m.t === 'rank') return this.rank(c);
    if (m.t === 'nick') { c.nick = cleanNick(m.nick); const p = this.store.get(c.pid); if (p) { p.nick = c.nick; this.store.put(p); } }
  }
  hello(c, m) {
    if (!validPid(m.pid) || m.v !== PROTO) { this.o.send(c.cid, { t: 'error', code: 'bad_hello' }); return this.o.close(c.cid); }
    const old = this.byPid.get(m.pid);
    if (old && old !== c.cid) { this.o.send(old, { t: 'error', code: 'other_tab' }); this.o.close(old); this.queue = this.queue.filter((q) => q.cid !== old); this.conns.delete(old); }
    c.pid = m.pid; c.nick = cleanNick(m.nick); c.state = 'ready';
    this.byPid.set(c.pid, c.cid);
    let p = this.store.get(c.pid);
    if (!p) p = newPlayer(c.pid, c.nick); else p.nick = c.nick;
    this.store.put(p);
    this.o.send(c.cid, { t: 'welcome', me: publicStats(p), rank: this.store.rankOf(p), online: this.online(), proto: PROTO });
  }
  find(c, m) {
    if (!validChar(m.char)) return this.o.send(c.cid, { t: 'error', code: 'bad_char' });
    const now = this.o.now();
    if (this.queue.some((q) => q.cid === c.cid)) return;
    if (now - (this.lastFind.get(c.pid) || 0) < 800) return;
    this.lastFind.set(c.pid, now);
    if (this.lastFind.size > 5000) this.lastFind.delete(this.lastFind.keys().next().value);
    const p = this.store.get(c.pid);
    this.queue.push({ cid: c.cid, pid: c.pid, nick: c.nick, char: m.char, rating: p.rating, since: now });
    this.o.send(c.cid, { t: 'queued', online: this.online() });
    this.pump();
  }
  // 待ち時間が長いほど、レートの差が大きい相手とも組む
  pump() {
    const now = this.o.now();
    // 待ち切れた人
    for (const q of [...this.queue]) {
      if (now - q.since > QUEUE_TIMEOUT * 1000) { this.queue = this.queue.filter((x) => x !== q); this.o.send(q.cid, { t: 'noopp' }); }
    }
    let progress = true;
    while (progress) {
      progress = false;
      const sorted = [...this.queue].sort((a, b) => a.since - b.since);
      for (const a of sorted) {
        const win = 150 + 60 * Math.floor((now - a.since) / 4000);
        const cand = this.queue.filter((b) => b !== a && b.pid !== a.pid && Math.abs(b.rating - a.rating) <= win).sort((x, y) => Math.abs(x.rating - a.rating) - Math.abs(y.rating - a.rating))[0];
        if (cand) { this.makeMatch(a, cand); progress = true; break; }
      }
    }
  }
  makeMatch(a, b) {
    this.queue = this.queue.filter((q) => q !== a && q !== b);
    const flip = this.o.rand() < 0.5;
    const [p0, p1] = flip ? [b, a] : [a, b];
    const id = this.o.newId(12);
    const info = {
      id, seed: Math.floor(this.o.rand() * 4294967295) >>> 0,
      players: [p0, p1].map((q) => ({ pid: q.pid, nick: q.nick, char: q.char, rating: q.rating, tok: this.o.newId(16) })),
    };
    this.o.spawnRoom(info);
    [p0, p1].forEach((q, slot) => {
      const opp = [p0, p1][1 - slot];
      this.o.send(q.cid, { t: 'matched', room: id, tok: info.players[slot].tok, slot, opp: { nick: opp.nick, rating: opp.rating, char: opp.char }, chars: [p0.char, p1.char] });
    });
  }
  rank(c) {
    const list = this.store.top(50).map((p) => ({ n: p.nick, r: p.rating, w: p.w, l: p.l, s: p.best }));
    const me = this.store.get(c.pid);
    this.o.send(c.cid, { t: 'ranking', list, me: me ? { ...publicStats(me), rank: this.store.rankOf(me) } : null, total: this.store.count() });
  }
  // 試合の結果：サーバーの部屋だけが呼べる（クライアントからは届かない）
  recordResult(r) {
    const empty = { deltas: [0, 0], ratings: [0, 0], stats: [null, null] };
    if (this.store.hasResult(r.matchId)) return empty;
    this.store.addResult(r.matchId);
    const [pa, pb] = r.pids.map((pid) => this.store.get(pid));
    if (!pa || !pb) return empty;
    const now = this.o.now();
    const repeats = this.store.recentPair(pa.pid, pb.pid, now, 30 * 60 * 1000);
    this.store.addPair(pa.pid, pb.pid, now);
    const decided = r.winner === 0 || r.winner === 1;
    const capped = repeats >= 4;                                   // 同じ 2 人の連戦（勝ち星の譲り合い対策）はレートを動かさない
    const out = { deltas: [0, 0], ratings: [pa.rating, pb.rating], stats: [null, null] };
    const ps = [pa, pb];
    if (decided && !capped) {
      const d0 = eloDelta(pa.rating, pb.rating, r.winner === 0 ? 1 : 0, pa.games);
      const d1 = eloDelta(pb.rating, pa.rating, r.winner === 1 ? 1 : 0, pb.games);
      out.deltas = [d0, d1];
    }
    ps.forEach((p, i) => {
      if (decided) {
        p.games++;
        if (r.winner === i) { p.w++; p.streak++; p.best = Math.max(p.best, p.streak); } else { p.l++; p.streak = 0; }
      }
      p.rating = Math.max(MIN_RATING, p.rating + out.deltas[i]);
      this.store.put(p);
      out.ratings[i] = p.rating; out.stats[i] = { ...publicStats(p), rank: this.store.rankOf(p) };
    });
    return out;
  }
}
