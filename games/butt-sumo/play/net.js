// オンライン対戦のクライアント（WebSocket）。サーバーが勝敗を決めるので、ここは入力を送り、状態を受け取って描くだけ。
import { PROTO } from './proto.js';

export function createNet(opts) {
  // opts: { url, pid, nick, handlers }
  const h = opts.handlers || {};
  let lobby = null, room = null, state = 'offline', roomInfo = null, closed = false, retries = 0, rtt = 0, pingTimer = 0, pingN = 0, pingSent = new Map();
  const emit = (name, ...a) => { try { if (h[name]) h[name](...a); } catch (e) { /* UI 側の例外で通信を止めない */ } };
  const setState = (s) => { if (state !== s) { state = s; emit('state', s); } };
  const jsonOf = (ev) => { try { return JSON.parse(ev.data); } catch (e) { return null; } };

  function startPing() {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      const c = ++pingN; pingSent.set(c, performance.now());
      send(room && room.readyState === 1 ? room : lobby, { t: 'ping', c });
      if (pingSent.size > 10) pingSent.delete(pingSent.keys().next().value);
    }, 4000);
  }
  function send(ws, obj) { if (ws && ws.readyState === 1) try { ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); return true; } catch (e) { return false; } return false; }
  function onPong(m) { const t0 = pingSent.get(m.c); if (t0) { rtt = performance.now() - t0; pingSent.delete(m.c); emit('rtt', rtt); } if (typeof m.online === 'number') emit('online', m.online); }

  const api = {
    get state() { return state; }, get rtt() { return rtt; },
    connect() {
      if (!opts.url) { setState('offline'); emit('error', 'unavailable'); return; }
      closed = false; setState('connecting');
      let ws;
      try { ws = new WebSocket(opts.url.replace(/\/$/, '') + '/lobby'); } catch (e) { setState('offline'); emit('error', 'connect'); return; }
      lobby = ws;
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) { /* ok */ } } }, 8000);
      ws.onopen = () => { opened = true; clearTimeout(timer); send(ws, { t: 'hello', pid: opts.pid, nick: opts.nick(), v: PROTO }); startPing(); };
      ws.onmessage = (ev) => {
        const m = jsonOf(ev); if (!m) return;
        if (m.t === 'welcome') { setState('ready'); emit('welcome', m); }
        else if (m.t === 'queued') { setState('queued'); emit('queued', m); }
        else if (m.t === 'matched') { roomInfo = m; setState('matched'); emit('matched', m); }
        else if (m.t === 'noopp') { setState('ready'); emit('noopp'); }
        else if (m.t === 'canceled') { setState('ready'); }
        else if (m.t === 'ranking') emit('ranking', m);
        else if (m.t === 'pong') onPong(m);
        else if (m.t === 'error') { emit('error', m.code); if (m.code === 'other_tab') closed = true; }
      };
      ws.onclose = () => { clearTimeout(timer); if (lobby === ws) { lobby = null; if (!closed && state !== 'inmatch') { setState('offline'); emit('error', opened ? 'lost' : 'connect'); } } };
      ws.onerror = () => { /* onclose で扱う */ };
    },
    find(char) { send(lobby, { t: 'find', char }); },
    cancel() { send(lobby, { t: 'cancel' }); setState('ready'); },
    rank() { send(lobby, { t: 'rank' }); },
    setNick(n) { send(lobby, { t: 'nick', nick: n }); },
    // 対戦の部屋へ（matched の後）
    joinRoom() {
      if (!roomInfo) return;
      retries = 0;
      const open = () => {
        let ws;
        try { ws = new WebSocket(opts.url.replace(/\/$/, '') + '/room/' + roomInfo.room); } catch (e) { return tryAgain(); }
        room = ws;
        ws.onopen = () => { send(ws, { t: 'join', tok: roomInfo.tok }); retries = 0; };
        ws.onmessage = (ev) => {
          const m = jsonOf(ev); if (!m) return;
          if (m.t === 's') emit('snap', m, performance.now());
          else if (m.t === 'start') { setState('inmatch'); emit('start', m); }
          else if (m.t === 'end') { emit('end', m); closed = true; }
          else if (m.t === 'opp') emit('opp', m);
          else if (m.t === 'pong') onPong(m);
          else if (m.t === 'error') { emit('error', m.code); }
        };
        ws.onclose = () => { if (room === ws) { room = null; if (state === 'inmatch' || state === 'matched') tryAgain(); } };
      };
      const tryAgain = () => {
        if (closed) return;
        if (retries >= 6) { emit('roomLost'); return; }
        retries++; emit('reconnecting', retries);
        setTimeout(open, 1200);
      };
      closed = false;
      open();
    },
    sendInput(mx, my, b) { return send(room, { t: 'in', mx: Math.round(mx * 100) / 100, my: Math.round(my * 100) / 100, b }); },
    debugDropRoom() { if (room) try { room.close(); } catch (e) { /* ok */ } },
    get inRoom() { return !!room && room.readyState === 1; },
    leaveRoom() { closed = true; const r = room; room = null; if (r) try { r.close(); } catch (e) { /* ok */ } roomInfo = null; setState(lobby ? 'ready' : 'offline'); },
    close() { closed = true; clearInterval(pingTimer); for (const w of [lobby, room]) if (w) try { w.close(); } catch (e) { /* ok */ } lobby = room = null; roomInfo = null; setState('offline'); },
  };
  return api;
}
