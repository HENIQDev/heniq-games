// 開発・テスト用ホスト：ブラウザの 1 タブで、worker.js と同じ役割（ロビーと部屋）を動かす。
// 通信は tools/dev_hub.py の中継を通る。ロジックは core.js（本番と同じコード）。
import { LobbyCore, RoomCore, MemoryStore } from './core.js';

export function startDevHost(hubUrl, opts = {}) {
  const ws = new WebSocket(hubUrl.replace(/\/$/, '') + '/__server');
  const conns = new Map();   // hub の接続 ID → { kind: 'lobby'|'room', room?, slot }
  const rooms = new Map();
  const send = (c, m) => { if (ws.readyState === 1) ws.send(JSON.stringify({ k: 'send', c, d: typeof m === 'string' ? m : JSON.stringify(m) })); };
  const closeConn = (c) => { if (ws.readyState === 1) ws.send(JSON.stringify({ k: 'close', c })); };
  const hex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, n); };
  const store = opts.store || new MemoryStore();
  const lobby = new LobbyCore({
    store, now: () => Date.now(), rand: () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }, newId: hex,
    send, close: closeConn,
    spawnRoom: (info) => {
      const room = new RoomCore({ id: info.id, players: info.players, seed: info.seed, now: () => Date.now(), send: (slot, m) => { const c = room.cids && room.cids[slot]; if (c) send(c, m); }, closeSlot: (slot) => { const c = room.cids && room.cids[slot]; if (c) closeConn(c); }, onResult: (r) => lobby.recordResult(r) });
      room.cids = [null, null];
      rooms.set(info.id, room);
      room.timer = setInterval(() => { room.tick(); if (room.done) { clearInterval(room.timer); for (let i = 0; i < 2; i++) if (room.cids[i]) closeConn(room.cids[i]); rooms.delete(info.id); } }, 1000 / 30);
    },
  });
  const pumpTimer = setInterval(() => lobby.pump(), 1000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.k === 'open') {
      if (m.path === '/lobby') { conns.set(m.c, { kind: 'lobby' }); lobby.open(m.c); }
      else { const r = /^\/room\/([0-9a-f]{12})$/.exec(m.path); if (r) conns.set(m.c, { kind: 'room', id: r[1], slot: -1 }); else closeConn(m.c); }
    } else if (m.k === 'msg') {
      const c = conns.get(m.c); if (!c) return;
      if (c.kind === 'lobby') lobby.message(m.c, m.d);
      else {
        const room = rooms.get(c.id); if (!room) return;
        let j; try { j = JSON.parse(m.d); } catch (e) { return; }
        if (!j || typeof j.t !== 'string') return;
        if (c.slot < 0) {
          if (j.t !== 'join') return;
          const s = room.players.findIndex((p) => p.tok === j.tok);
          if (s < 0) { send(m.c, { t: 'error', code: 'bad_token' }); closeConn(m.c); return; }
          if (room.cids[s] && room.cids[s] !== m.c) closeConn(room.cids[s]);
          c.slot = s; room.cids[s] = m.c; room.attach(s, j.tok);
        } else if (j.t === 'in') room.input(c.slot, j);
        else if (j.t === 'ping') send(m.c, { t: 'pong', c: j.c });
      }
    } else if (m.k === 'close') {
      const c = conns.get(m.c); conns.delete(m.c); if (!c) return;
      if (c.kind === 'lobby') lobby.close(m.c);
      else { const room = rooms.get(c.id); if (room && c.slot >= 0 && room.cids[c.slot] === m.c) { room.cids[c.slot] = null; room.detach(c.slot); } }
    }
  };
  return { ws, lobby, rooms, store, stop() { clearInterval(pumpTimer); ws.close(); } };
}
