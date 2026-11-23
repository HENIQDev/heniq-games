// BUTT SUMO：起動・画面の遷移・CP 戦・オンライン対戦の流れ。
import { createAudio } from '../platform/core/audio.js';
import { createGfx } from './gl/gfx.js';
import { createSfx } from './sfx.js';
import { createInput } from './input.js';
import { createMatch } from './sim.js';
import { createBattle } from './battle.js';
import { createScreens } from './screens.js';
import { createNet } from './net.js';
import { STAGES, STAGE_COUNT, unlockedChars, UNLOCK_AT, THEMES } from './stages.js';
import { CHAR_BY_ID, CHARS } from './chars.js';
import { setLang, t } from './i18n.js';
import { cleanNick } from './proto.js';
import * as store from './save.js';
import { SERVER } from './config.js';
import { h } from './dom.js';

window.__errs = [];
window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason)));
const q = new URLSearchParams(location.search);
const isLocalHost = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/.test(location.hostname);
const serverUrl = (isLocalHost && q.get('server')) || SERVER;

const app = document.getElementById('app');
const canvas = h('canvas', 'gl');
const uiLayer = h('div', 'layer ui');
const hudLayer = h('div', 'layer hud');
const touchLayer = h('div', 'layer touch');
app.append(canvas, hudLayer, touchLayer, uiLayer);

const save = store.load();
setLang(save.settings.lang);
const audio = createAudio();
audio.setMuted(save.settings.mute || audio.muted);
const sfx = createSfx(audio, () => save.settings);
const input = createInput(app);
const gfx = createGfx(canvas);

const G = {
  save, audio, sfx, input, gfx, net: null,
  onlineAvailable: !!serverUrl, online: { phase: serverUrl ? 'idle' : 'unavailable' },
  screen: '', battle: null, scene: { type: 'demo', view: null }, keyHandlers: [], S: null,
  persist() { store.persist(); },
  resetSave() { store.reset(); G.save = store.load(); Object.assign(save, G.save); },
  nick() { return cleanNick(save.settings.nick || ''); },
};
let time = 0;
const rand = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; };

if (!gfx) {
  uiLayer.append(createScreens(G).nogl());
  throw new Error('WebGL2 unavailable');
}
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showError('描画が中断されました。再読み込みしてください。'); });
function showError(text) { uiLayer.replaceChildren(createScreens(G).error({ text })); }

// ---- 画面の背景（3D） ----
function demoView(a, b) { return createMatch({ chars: [a, b], seed: 1 }); }
G.setPreview = (id) => { gfx.setTheme('sky', 5); G.scene = { type: 'preview', id }; };
G.setStagePreview = (n) => {
  const st = STAGES[n - 1];
  const mine = unlockedChars(save.cleared).includes(save.char) ? save.char : 'ojisan';
  gfx.setTheme(st.theme, 5);
  G.scene = { type: 'demo', view: demoView(mine, st.foe) };
};
function randomDemo(theme) {
  const open = unlockedChars(save.cleared);
  const a = open[rand() % open.length];
  let b = CHARS[rand() % CHARS.length].id;
  if (b === a) b = CHARS[(CHARS.findIndex((c) => c.id === a) + 3) % CHARS.length].id;
  gfx.setTheme(theme || THEMES[rand() % THEMES.length], 5);
  G.scene = { type: 'demo', view: demoView(a, b) };
}
G.keyOnce = (codes, fn) => { G.keyHandlers.push({ codes, fn }); };
window.addEventListener('keydown', (e) => {
  const i = G.keyHandlers.findIndex((k) => k.codes.includes(e.code));
  if (i >= 0 && !G.battle) { const k = G.keyHandlers[i]; G.keyHandlers.length = 0; e.preventDefault(); k.fn(); }
});

// ---- 画面の切り替え ----
const S = createScreens(G);
G.S = S;
G.go = (name, params) => {
  if (G.battle && name !== 'cpResult' && name !== 'unlock' && name !== 'onlineResult' && name !== 'pause') destroyBattle();
  G.keyHandlers.length = 0;
  G.screen = name;
  const el = S[name](params || {});
  uiLayer.replaceChildren(el);
  const first = el.querySelector('button.btn-go, button.big, button.btn');
  if (first && !(first.disabled)) { try { first.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
  if (name === 'title' || name === 'menu' || name === 'how' || name === 'settings' || name === 'ranking' || name === 'online') {
    if (!G.battle) { if (G.scene.type !== 'demo' || name === 'title' || name === 'menu') randomDemo(); }
  }
  if (!G.battle && sfx.currentBgm() !== 'menu') sfx.bgm('menu');
};
function destroyBattle() {
  if (!G.battle) return;
  G.battle.destroy(); G.battle = null; input.setEnabled(false); input.detachTouch();
}
G.cpEnded = (r, st) => cpEnded(r, st);   // 検証用（?debug=1 のテストから呼ぶ）
const wantTouch = () => save.settings.touch === 'on' || (save.settings.touch === 'auto' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window));

// ---- CP 戦 ----
G.startCp = (n, opt = {}) => {
  destroyBattle();
  const st = opt.theme || opt.foe ? { ...STAGES[n - 1], theme: opt.theme || STAGES[n - 1].theme, foe: opt.foe || STAGES[n - 1].foe } : STAGES[n - 1];
  const open = unlockedChars(save.cleared);
  const mine = opt.me || (open.includes(save.char) ? save.char : 'ojisan');
  uiLayer.replaceChildren();
  G.screen = 'battle';
  G.stage = st;
  G.battle = createBattle({ gfx, sfx, input, mode: 'cp', chars: [mine, st.foe], stage: st, seed: rand(), flip: false, hudRoot: hudLayer, auto: opt.auto, passive: opt.passive, onEnd: (r) => cpEnded(r, st) });
  input.setEnabled(true);
  if (wantTouch()) input.attachTouch(touchLayer); else input.detachTouch();
  sfx.bgm(st.boss ? 'boss' : 'battle', 1 + n / 500);
  G.battle.hudPauseButton.onclick = () => pauseBattle();
  G.battleNum = n;
};
function pauseBattle() {
  if (!G.battle || G.screen !== 'battle' || G.battle.paused) return;
  G.battle.setPaused(true);
  G.screen = 'pause';
  uiLayer.replaceChildren(S.pause({ resume: resumeBattle, retry: () => G.startCp(G.battleNum), quit: () => G.go('stages', { stage: G.battleNum }) }));
}
function resumeBattle() {
  if (!G.battle) return;
  G.battle.setPaused(false); G.screen = 'battle'; uiLayer.replaceChildren();
}
input.onPause(() => { if (G.screen === 'battle' && G.battle && G.battle.hudPauseButton.style.display !== 'none') pauseBattle(); else if (G.screen === 'pause') resumeBattle(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.screen === 'battle' && G.battle && G.battle.hudPauseButton.style.display !== 'none') pauseBattle(); });

function cpEnded(r, st) {
  input.setEnabled(false); input.detachTouch(); sfx.stopBgm();
  G.battle.setPaused(true);
  const sv = save;
  let newBest = false, unlockId = null;
  if (r.win) {
    sv.stats.cpWins++; sv.stats.hits += r.stats.hitsDealt;
    if (st.boss) sv.stats.bosses++;
    const prev = sv.best[st.n];
    if (!prev || r.time < prev.t) { sv.best[st.n] = { t: Math.round(r.time * 10) / 10 }; newBest = !!prev; }
    if (st.n > sv.cleared) { sv.cleared = st.n; if (UNLOCK_AT[st.n]) unlockId = UNLOCK_AT[st.n]; }
  } else if (!r.draw) sv.stats.cpLosses++;
  store.persist();
  const showResult = () => { G.screen = 'cpResult'; uiLayer.replaceChildren(S.cpResult({ result: r, stage: st, newBest })); };
  if (unlockId) {
    sfx.unlock();
    G.screen = 'unlock'; gfx.confetti(90);
    G.unlockPreview = unlockId;
    uiLayer.replaceChildren(S.unlock({ id: unlockId, next: () => { G.unlockPreview = null; showResult(); } }));
  } else showResult();
}

// ---- オンライン対戦 ----
function netHandlers() {
  return {
    state() {},
    welcome(m) { G.online = { ...G.online, phase: 'lobby', me: m.me, rank: m.rank, online: m.online }; if (G.pendingFind) { G.pendingFind = false; G.findMatch(); } else if (G.screen === 'online') G.go('online'); if (G.pendingRank) { G.pendingRank = false; G.net.rank(); } if (G.pendingErase) { G.pendingErase = false; G.net.erase(); } },
    queued(m) { G.online = { ...G.online, phase: 'search', online: m.online }; if (G.screen === 'online') G.go('online'); },
    noopp() { G.online = { ...G.online, phase: 'noopp' }; if (G.screen === 'online') G.go('online'); },
    matched(m) {
      G.online = { ...G.online, phase: 'matched', opp: m.opp, myChar: save.char, slot: m.slot };
      sfx.confirm();
      if (G.screen === 'online') G.go('online');
      setTimeout(() => { if (G.online.phase === 'matched' && G.net) G.net.joinRoom(); }, 1600);
    },
    ranking(m) { if (G.rankCb) { const cb = G.rankCb; G.rankCb = null; cb(m); } },
    busy(why) {
      const msg = why === 'daily' ? '本日のオンライン対戦の枠がいっぱいになりました。明日またお試しください（CP ステージは遊べます）。' : 'ただいまオンライン対戦が混み合っています。しばらくしてから、もう一度お試しください。';
      G.online = { ...G.online, phase: 'busy', msg };
      if (G.screen === 'online') G.go('online');
    },
    erased() { store.resetDeviceId(); if (G.eraseCb) { const cb = G.eraseCb; G.eraseCb = null; cb(true); } if (G.net) { G.net.close(); G.net = null; } },
    error(code) {
      if (G.battle && G.battle.status) { if (code === 'bad_token') G.battle.status('接続エラー'); return; }
      const msg = code === 'in_use' ? 'この端末のオンライン対戦は、別のタブで待機中か対戦中です。終わってからお試しください。' : code === 'other_tab' ? '別のタブでオンライン対戦を開いているため、こちらは切断されました。' : code === 'unavailable' ? t('unavailable') : t('onlineOffline');
      G.online = { ...G.online, phase: code === 'unavailable' ? 'unavailable' : 'error', msg };
      if (G.rankCb) { const cb = G.rankCb; G.rankCb = null; cb(null, code === 'unavailable' ? 'unavailable' : 'offline'); return; }
      if (G.screen === 'online') G.go('online');
    },
    start(m) { startOnlineBattle(m); },
    snap(m, at) { if (G.battle && G.battle.onSnap) G.battle.onSnap(m, at); },
    end(m) { if (G.battle && G.battle.onEnd) G.battle.onEnd(m); },
    opp(m) { if (G.battle && G.battle.note) G.battle.note(m.status === 'away' ? t('onlineOppAway') : '相手が戻ってきました', 3000); },
    reconnecting() { if (G.battle) G.battle.status(t('onlineReconnect')); },
    roomLost() { if (G.battle) { G.battle.status(''); G.battle.onEnd({ winner: -2, reason: 'lost', void: true, delta: 0, rating: 0, stats: null }); } },
    rtt(v) { if (G.battle && G.battle.status && G.screen === 'battle') G.battle.status('PING ' + Math.round(v) + 'ms'); },
  };
}
function ensureNet() {
  if (!serverUrl) return false;
  if (!G.net || G.net.state === 'offline') {
    if (G.net) G.net.close();
    G.net = createNet({ url: serverUrl, pid: store.deviceId(), nick: () => G.nick(), handlers: netHandlers() });
    G.net.connect();
  }
  return true;
}
G.enterOnline = (autoFind) => {
  destroyBattle();
  if (!serverUrl) { G.online = { phase: 'unavailable' }; G.go('online'); return; }
  G.online = { phase: 'connecting' };
  if (G.net && G.net.state !== 'offline') { try { G.net.leaveRoom(); } catch (e) { /* ok */ } }
  G.pendingFind = !!autoFind;
  const reuse = G.net && G.net.state === 'ready';
  if (reuse) { G.online = { ...G.online, phase: 'lobby', me: G.online.me }; }
  else ensureNet();
  G.go('online');
  if (reuse && autoFind) G.findMatch();
};
G.findMatch = () => {
  if (!G.net) return;
  const open = unlockedChars(save.cleared);
  if (!open.includes(save.char)) save.char = 'ojisan';
  G.online = { ...G.online, phase: 'search' };
  G.net.find(save.char);
  if (G.screen === 'online') G.go('online');
};
G.cancelFind = () => { if (G.net) G.net.cancel(); G.online = { ...G.online, phase: 'lobby' }; G.go('online'); };
G.leaveOnline = () => { if (G.net) { G.net.close(); G.net = null; } G.online = { phase: serverUrl ? 'idle' : 'unavailable' }; };
G.eraseOnline = (cb) => {
  if (!serverUrl) { cb(false, 'unavailable'); return; }
  G.eraseCb = (ok) => cb(ok);
  G.pendingErase = true;
  const had = G.net && G.net.state === 'ready';
  ensureNet();
  if (had) { G.pendingErase = false; G.net.erase(); }
};
G.loadRanking = (cb) => {
  if (!serverUrl) { cb(null, 'unavailable'); return; }
  G.rankCb = cb;
  const had = G.net && G.net.state === 'ready';
  ensureNet();
  if (had) G.net.rank(); else G.pendingRank = true;
};
function startOnlineBattle(m) {
  if (G.battle && G.screen === 'battle') return;           // 再接続のときの 2 回目の start
  destroyBattle();
  const flip = m.slot === 1;
  const theme = THEMES[m.seed % THEMES.length];
  const stage = { theme, mods: {}, boss: null, buff: {}, profile: null, n: 0 };
  uiLayer.replaceChildren(); G.screen = 'battle';
  G.battle = createBattle({ gfx, sfx, input, mode: 'online', chars: m.chars, stage, seed: m.seed, flip, slot: m.slot, names: m.names, net: G.net, hudRoot: hudLayer, onEnd: (r) => onlineEnded(r, m) });
  input.setEnabled(true);
  if (wantTouch()) input.attachTouch(touchLayer); else input.detachTouch();
  sfx.bgm('battle', 1.04);
}
function onlineEnded(r, start) {
  input.setEnabled(false); input.detachTouch(); sfx.stopBgm();
  G.battle.setPaused(true);
  const msg = r.net || { winner: r.winner, reason: r.reason, void: r.void, delta: 0, rating: 0, stats: null };
  if (G.net) G.net.leaveRoom();
  if (msg.stats) G.online = { ...G.online, me: msg.stats, rank: msg.stats.rank };
  G.screen = 'onlineResult';
  uiLayer.replaceChildren(S.onlineResult({ msg, slot: start.slot }));
}

// ---- ループ ----
let last = performance.now(), fpsAcc = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now; time += dt;
  if (G.battle) { G.battle.update(dt); G.battle.render(dt, time); }
  else {
    const sc = G.scene;
    const lift = G.screen === 'chars' || G.screen === 'stages' ? 1 : 0;      // 縦向きでは、下のパネルに隠れないよう 3D を上へ寄せる
    if (sc.type === 'preview' || G.unlockPreview) gfx.render({ preview: { id: G.unlockPreview || sc.id, yaw: Math.sin(time * 0.7) * 0.9 + 0.4, pose: G.unlockPreview ? 'win' : 'idle', look: 0.2 }, mode: 'menu', dt, time, flip: false, lift: lift });
    else if (sc.view) gfx.render({ view: sc.view, mode: 'menu', dt, time, flip: false, lift: lift });
  }
  gfx.adapt(dt * 1000);
  requestAnimationFrame(frame);
}
function onResize() { gfx.resize(); }
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
onResize();
requestAnimationFrame(frame);

// 初期画面
if (q.get('screen') && S[q.get('screen')] && isLocalHost) G.go(q.get('screen')); else G.go('title');

// 自己テスト（?selftest=1）：共通の検査（tests/test_browser.py）が結果を読む
if (/[?&]selftest=1/.test(location.search)) import('./selftest.js').then((m) => m.runSelfTest({ G, gfx, S, STAGES, CHARS }));

// 検証用（?debug=1）：実際の操作の確認テストが、状態を読むための口
if (/[?&]debug=1/.test(location.search)) window.__bs = { G, gfx, input, S, STAGES, CHAR_BY_ID, unlockedChars, ensureNet, startOnlineBattle };
