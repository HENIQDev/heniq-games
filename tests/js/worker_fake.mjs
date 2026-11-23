// worker.js（Cloudflare 用）を、偽の Cloudflare 環境（Durable Object・WebSocket・SQLite・alarm）で動かす。
// 本物の Cloudflare ではないが、構文・眠りからの復元・自動 ping・alarm・上限の流れを確かめられる。
const R = [];
const ok = (name, c, extra) => R.push({ name, ok: !!c, extra });
let src = await (await fetch('/server/butt-sumo/worker.js')).text();
src = src.replace("import { DurableObject } from 'cloudflare:workers';", 'const DurableObject = globalThis.__DO;')
  .replace("import { LobbyCore, RoomCore, LIMITS } from './core.js';", "import { LobbyCore, RoomCore, LIMITS } from '" + location.origin + "/server/butt-sumo/core.js';");
globalThis.__DO = class { constructor(ctx, env) { this.ctx = ctx; this.env = env; } };
globalThis.WebSocketRequestResponsePair = class { constructor(a, b) { this.request = a; this.response = b; } };
const sockets = [];
globalThis.WebSocketPair = class { constructor() { const mk = () => { const w = { sent: [], att: null, closed: false, send(m) { this.sent.push(m); }, close() { this.closed = true; }, serializeAttachment(v) { this.att = JSON.parse(JSON.stringify(v)); }, deserializeAttachment() { return this.att; } }; return w; }; this[0] = mk(); this[1] = mk(); sockets.push(this[1]); } };
globalThis.Response = class { constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.webSocket = init.webSocket; this.headers = init.headers; } static json(o) { const r = new globalThis.Response(JSON.stringify(o)); r.json = async () => o; return r; } };
const mod = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
ok('worker.js が構文エラーなく読み込める（Lobby・Room・既定の export）', mod.Lobby && mod.Room && mod.default && typeof mod.default.fetch === 'function');

// 偽の SQLite（このテストに必要な文だけ）
function fakeSql() {
  const players = new Map(), counters = new Map(), rooms = [];
  return { players, exec(q, ...a) {
    const arr = (x) => ({ toArray: () => x });
    if (/^INSERT INTO players/.test(q)) { players.set(a[0], { pid: a[0], nick: a[1], rating: a[2], w: a[3], l: a[4], streak: a[5], best: a[6], games: a[7] }); return arr([]); }
    if (/SELECT \* FROM players WHERE pid/.test(q)) return arr(players.has(a[0]) ? [players.get(a[0])] : []);
    if (/^DELETE FROM players WHERE pid/.test(q)) { players.delete(a[0]); return arr([]); }
    if (/INSERT INTO counters/.test(q)) { counters.set(a[0], (counters.get(a[0]) || 0) + 1); return arr([]); }
    if (/SELECT n FROM counters/.test(q)) return arr(counters.has(a[0]) ? [{ n: counters.get(a[0]) }] : []);
    if (/INSERT OR IGNORE INTO rooms/.test(q)) { rooms.push({ id: a[0], at: a[1] }); return arr([]); }
    if (/COUNT\(\*\) AS c FROM rooms/.test(q)) return arr([{ c: rooms.filter((r) => r.at > a[0]).length }]);
    if (/SELECT COUNT\(\*\) \+ 1 AS r/.test(q)) return arr([{ r: 1 }]);
    if (/SELECT COUNT\(\*\) AS c FROM players/.test(q)) return arr([{ c: players.size }]);
    return arr([]);
  } };
}
function fakeCtx(sql, existing = []) {
  let alarm = null; const accepted = [...existing]; const waits = [];
  return { storage: { sql, getAlarm: async () => alarm, setAlarm: async (t) => { alarm = t; } }, setWebSocketAutoResponse(p) { this.auto = p; }, acceptWebSocket(w) { accepted.push(w); }, getWebSockets: () => accepted, waitUntil: (p) => waits.push(p), accepted, get alarmAt() { return alarm; }, clearAlarm() { alarm = null; }, waits };
}
const sql = fakeSql();
const ctx1 = fakeCtx(sql);
const env = { ROOM: { idFromName: (n) => n, get: (id) => ({ fetch: async (u, init) => { env.inits.push(JSON.parse(init.body)); return new Response('ok'); } }) }, inits: [] };
const lobby = new mod.Lobby(ctx1, env);
ok('ping は自動応答（眠ったまま返す）に登録される', ctx1.auto && ctx1.auto.request === 'ping' && ctx1.auto.response === 'pong');
const pid = (i) => i.toString(16).padStart(32, '0');
const req = (ip) => ({ url: 'https://x/lobby', method: 'GET', headers: { get: (k) => (k === 'Upgrade' ? 'websocket' : k === 'CF-Connecting-IP' ? ip : null) } });
async function connect(ctx, lob, ip, i, nick) {
  const r = await lob.fetch(req(ip));
  const ws = ctx.accepted[ctx.accepted.length - 1];
  await lob.webSocketMessage(ws, JSON.stringify({ t: 'hello', pid: pid(i), nick, v: 1 }));
  return { r, ws };
}
const A = await connect(ctx1, lobby, '1.1.1.1', 1, 'アリス');
ok('接続が Hibernation API で受け入れられる（status 101）', A.r.status === 101 && ctx1.accepted.length === 1);
ok('welcome が返る', JSON.parse(A.ws.sent.at(-1)).t === 'welcome');
await lobby.webSocketMessage(A.ws, JSON.stringify({ t: 'find', char: 'ojisan' }));
ok('待機中は alarm が設定される（待機中だけタイマーが動く）', ctx1.alarmAt !== null && JSON.parse(A.ws.sent.at(-1)).t === 'queued');
ok('待機の状態が接続に保存される', A.ws.att.state === 'queued' && A.ws.att.q.char === 'ojisan');
// ---- 眠る → 起きる：新しいインスタンスを、同じ接続（保存した状態）から作る ----
const ctx2 = fakeCtx(sql, [A.ws]);
const lobby2 = new mod.Lobby(ctx2, env);
ok('起きたとき、待機の状態が復元される', lobby2.core.queue.length === 1 && lobby2.core.conns.size === 1);
const B = await connect(ctx2, lobby2, '2.2.2.2', 2, 'ボブ');
await lobby2.webSocketMessage(B.ws, JSON.stringify({ t: 'find', char: 'gorilla' }));
ok('眠りから起きた後でも、待機していた人と成立する', env.inits.length === 1 && JSON.parse(A.ws.sent.at(-1)).t === 'matched' && JSON.parse(B.ws.sent.at(-1)).t === 'matched');
ok('成立した後は、alarm が止まる（誰も待っていないので何も動かない）', lobby2.core.queue.length === 0 && (ctx2.clearAlarm(), await (async () => { await lobby2.alarm(); return ctx2.alarmAt === null; })()));
// ---- 上限 ----
const ctx3 = fakeCtx(fakeSql());
const lobby3 = new mod.Lobby(ctx3, env);
let rejected = 0;
for (let i = 0; i < 8; i++) { const r = await lobby3.fetch(req('9.9.9.9')); if (r.status === 503) rejected++; }
ok('同じ IP からの接続は 6 本まで（それ以上は 503）', rejected === 2 && ctx3.accepted.length === 6, 'rejected=' + rejected);
ok('IP をそのまま保存していない', ctx3.accepted.every((w) => !JSON.stringify(w.att).includes('9.9.9.9')));
// ---- ルーター ----
const router = mod.default;
const r1 = await router.fetch({ url: 'https://w/lobby', headers: { get: (k) => (k === 'Upgrade' ? 'websocket' : k === 'Origin' ? 'https://evil.example' : null) } }, { ALLOWED_ORIGINS: 'https://heniq-games.pages.dev' });
ok('許可していないオリジンは 403', r1.status === 403);
const r2 = await router.fetch({ url: 'https://w/lobby', headers: { get: (k) => (k === 'Upgrade' ? null : null) } }, {});
ok('WebSocket 以外は 426', r2.status === 426);
return { pass: R.filter((r) => r.ok).length, total: R.length, fail: R.filter((r) => !r.ok) };
