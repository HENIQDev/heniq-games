// BUTT SUMO オンライン対戦：Cloudflare Workers + Durable Objects（無料プランの SQLite 版）。
// ・/lobby  … マッチングと戦績・ランキング（Lobby：全体で 1 つ）
// ・/room/<id> … 1 試合（Room：試合ごとに 1 つ。30 Hz で sim.js を実行して勝敗を決める）
// ロジックは core.js（テスト済み）。このファイルは、通信・保存・タイマーだけを担当する薄い部分。
import { LobbyCore, RoomCore, newPlayer } from './core.js';

const HEX = '0123456789abcdef';
function newId(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); let s = ''; for (const b of a) s += HEX[b >> 4] + HEX[b & 15]; return s.slice(0, n); }
function rand() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
const text = (m) => (typeof m === 'string' ? m : JSON.stringify(m));
const DAY = 86400000;

class SqlStore {
  constructor(sql) {
    this.sql = sql;
    sql.exec('CREATE TABLE IF NOT EXISTS players(pid TEXT PRIMARY KEY, nick TEXT, rating INTEGER, w INTEGER, l INTEGER, streak INTEGER, best INTEGER, games INTEGER, updated INTEGER)');
    sql.exec('CREATE INDEX IF NOT EXISTS idx_rank ON players(games, rating)');
    sql.exec('CREATE TABLE IF NOT EXISTS results(id TEXT PRIMARY KEY, at INTEGER)');
    sql.exec('CREATE TABLE IF NOT EXISTS pairs(key TEXT, at INTEGER)');
    const now = Date.now();
    // 保存する情報を最小限にする：一度も試合をしていない端末は 30 日で、結果の記録は 7 日で消す
    sql.exec('DELETE FROM players WHERE games = 0 AND updated < ?', now - 30 * DAY);
    sql.exec('DELETE FROM results WHERE at < ?', now - 7 * DAY);
    sql.exec('DELETE FROM pairs WHERE at < ?', now - DAY);
  }
  get(pid) { const r = this.sql.exec('SELECT * FROM players WHERE pid = ?', pid).toArray()[0]; return r ? { pid: r.pid, nick: r.nick, rating: r.rating, w: r.w, l: r.l, streak: r.streak, best: r.best, games: r.games } : null; }
  put(p) {
    this.sql.exec('INSERT INTO players(pid, nick, rating, w, l, streak, best, games, updated) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(pid) DO UPDATE SET nick=excluded.nick, rating=excluded.rating, w=excluded.w, l=excluded.l, streak=excluded.streak, best=excluded.best, games=excluded.games, updated=excluded.updated',
      p.pid, p.nick, p.rating, p.w, p.l, p.streak, p.best, p.games, Date.now());
  }
  top(n) { return this.sql.exec('SELECT * FROM players WHERE games >= 3 ORDER BY rating DESC, w DESC LIMIT ?', n).toArray(); }
  rankOf(p) { if (p.games < 3) return null; return this.sql.exec('SELECT COUNT(*) + 1 AS r FROM players WHERE games >= 3 AND (rating > ? OR (rating = ? AND w > ?))', p.rating, p.rating, p.w).toArray()[0].r; }
  count() { return this.sql.exec('SELECT COUNT(*) AS c FROM players').toArray()[0].c; }
  hasResult(id) { return this.sql.exec('SELECT 1 FROM results WHERE id = ?', id).toArray().length > 0; }
  addResult(id) { this.sql.exec('INSERT OR IGNORE INTO results(id, at) VALUES(?, ?)', id, Date.now()); }
  recentPair(a, b, now, windowMs) { const key = a < b ? a + b : b + a; return this.sql.exec('SELECT COUNT(*) AS c FROM pairs WHERE key = ? AND at > ?', key, now - windowMs).toArray()[0].c; }
  addPair(a, b, now) { const key = a < b ? a + b : b + a; this.sql.exec('INSERT INTO pairs(key, at) VALUES(?, ?)', key, now); }
}

export class Lobby {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.socks = new Map(); this.timer = null;
    this.core = new LobbyCore({
      store: new SqlStore(ctx.storage.sql), now: () => Date.now(), rand, newId,
      send: (cid, m) => { const s = this.socks.get(cid); if (s) try { s.send(text(m)); } catch (e) { /* 切れた */ } },
      close: (cid) => { const s = this.socks.get(cid); if (s) try { s.close(1000, 'bye'); } catch (e) { /* 既に閉じている */ } this.socks.delete(cid); },
      spawnRoom: (info) => { const stub = env.ROOM.get(env.ROOM.idFromName(info.id)); ctx.waitUntil(stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify(info) })); },
    });
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/_result' && req.method === 'POST') return Response.json(this.core.recordResult(await req.json()));
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const cid = newId(10);
    this.socks.set(cid, server);
    this.core.open(cid);
    server.addEventListener('message', (ev) => { this.core.message(cid, typeof ev.data === 'string' ? ev.data : ''); this.ensureTimer(); });
    const gone = () => { this.core.close(cid); this.socks.delete(cid); };
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
  ensureTimer() {
    if (this.timer || !this.core.queue.length) return;
    this.timer = setInterval(() => { this.core.pump(); if (!this.core.queue.length) { clearInterval(this.timer); this.timer = null; } }, 1000);
  }
}

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env; this.core = null; this.socks = [null, null]; this.timer = null;
    this.ready = new Promise((r) => { this.resolveReady = r; });
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init' && req.method === 'POST') {
      if (this.core) return new Response('ok');
      const info = await req.json();
      const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('main'));
      this.core = new RoomCore({
        id: info.id, players: info.players, seed: info.seed, now: () => Date.now(),
        send: (slot, m) => { const s = this.socks[slot]; if (s) try { s.send(text(m)); } catch (e) { /* 切れた */ } },
        closeSlot: (slot) => { const s = this.socks[slot]; if (s) try { s.close(1000, 'bye'); } catch (e) { /* 既に閉じている */ } },
        onResult: (r) => lobby.fetch('https://lobby/_result', { method: 'POST', body: JSON.stringify(r) }).then((res) => res.json()),
      });
      this.timer = setInterval(() => {
        this.core.tick();
        if (this.core.done) { clearInterval(this.timer); this.timer = null; for (let i = 0; i < 2; i++) this.core.o.closeSlot(i); }
      }, 1000 / 30);
      this.resolveReady();
      return new Response('ok');
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const timeout = new Promise((r) => setTimeout(r, 5000));
    await Promise.race([this.ready, timeout]);
    let slot = -1;
    server.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string' || ev.data.length > 600 || !this.core) return;
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || typeof m.t !== 'string') return;
      if (slot < 0) {
        if (m.t !== 'join' || typeof m.tok !== 'string') return;
        const s = this.core.players.findIndex((p) => p.tok === m.tok);
        if (s < 0) { try { server.send(text({ t: 'error', code: 'bad_token' })); server.close(1008, 'bad token'); } catch (e) { /* 閉じている */ } return; }
        const old = this.socks[s]; if (old && old !== server) try { old.close(1000, 'replaced'); } catch (e) { /* 閉じている */ }
        slot = s; this.socks[s] = server; this.core.attach(s, m.tok);
        return;
      }
      if (m.t === 'in') this.core.input(slot, m);
      else if (m.t === 'ping') server.send(text({ t: 'pong', c: typeof m.c === 'number' ? m.c : 0 }));
    });
    const gone = () => { if (slot >= 0 && this.socks[slot] === server) { this.socks[slot] = null; if (this.core) this.core.detach(slot); } };
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }
}

function originAllowed(origin, env) {
  const list = (env.ALLOWED_ORIGINS || 'https://heniq-games.pages.dev').split(',').map((s) => s.trim());
  return !!origin && list.includes(origin);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok', { headers: { 'cache-control': 'no-store' } });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!originAllowed(req.headers.get('Origin'), env)) return new Response('forbidden', { status: 403 });
    if (url.pathname === '/lobby') return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
    const m = /^\/room\/([0-9a-f]{12})$/.exec(url.pathname);
    if (m) return env.ROOM.get(env.ROOM.idFromName(m[1])).fetch(req);
    return new Response('not found', { status: 404 });
  },
};
